# Design

## Context

See `proposal.md` — Why. Constraints that shape the approach:

- **Target host:** Ubuntu 26.04 x86_64, Node v24.18.1, npm 12, ~349 GB free. **No** Java/JDK,
  **no** Android SDK, **no** Gradle, **no** EAS CLI. `sudo` exists but requires an **interactive
  password**, so no non-interactive `apt` installs are possible on this host.
- **Repo shape:** npm workspaces monorepo (`engine-core`, `web`, `sim`, `mobile`); the Expo app
  lives at `mobile/` (`@auto-auto-clicker/mobile`), not `apps/mobile`. No `eas.json`, no
  `android/`, no `.github/workflows`, no keystore, no release process exist today.
- **Observed version truth (verified in this checkout, not assumed):** `mobile/` pins
  `expo ~57.0.26`, `react 19.2.3`, `react-native 0.87.1`. The installed
  `expo@57.0.26`'s `bundledNativeModules.json` declares **`react-native: 0.86.3`** and
  `react: 19.2.3`. So `expo install --fix` would move RN **0.87.1 → 0.86.3**.
- **Existing deliberate pin:** `decisions.md` (2026-10-02) and `histories/coder.md` record that
  RN 0.87.1 was chosen on purpose, and `mobile/jest.config.js` + `mobile/tests/stubs/` contain a
  shim written specifically because **RN 0.87** dropped `@react-native/assets-registry`. The
  realignment therefore has known test-fallout, not zero risk.
- **Upstream facts (observed during research):** Expo **SDK 57 is stable** (released
  2026-06-30, brings RN 0.86 to Expo); SDK **58 is preview** (`58.0.0-preview.0` → RN 0.88 RC).
  `npx expo run:android` / Gradle build an APK with **no Expo account**; `eas build` (local or
  cloud) **requires** Expo auth (`EXPO_TOKEN`).
- **Reference repo observations** (`/home/sam/dev/you-do`, already cloned — observed in that repo):
  a tag-triggered workflow using Java 17 Temurin + `eas build --local` + `softprops/action-gh-release`;
  a `jq` step syncing `package.json` `version` from the pushed tag (`GITHUB_REF_NAME#v`); `eas build
  --local` **does not read EAS dashboard env vars**; preview APKs are debug-key signed; only **tag
  pushes** trigger the workflow. Their environment baseline (`README.md` "Linux CLI Install",
  `docs/setup.md`) is a **sudo/apt** install (`sudo apt-get install -y ... openjdk-17-jdk
  android-sdk-platform-tools` + Android `cmdline-tools`); ours cannot use sudo, so we attempt a
  user-space toolchain. Their repo layout is pnpm + `apps/mobile`; ours is npm workspaces +
  `mobile/`, so paths and package manager commands must be adapted.
- **General Expo/Gradle behavior (not specific to the reference repo):** `expo prebuild` generates
  `android/app/debug.keystore` at `~/.android/debug.keystore` when absent, and `--clean` regenerates it
  with a **new SHA-1**. The reference's own build runs through `eas build --local`, so that keystore
  claim is general Expo/Gradle behavior (and applies equally to our primary `expo prebuild` + Gradle
  path), not something we observed being exercised in the reference repo.

## Goals / Non-Goals

**Goals:**

- A repeatable local APK build that needs no Expo account, plus a tag-driven GitHub Release.
- Align `mobile/` to the stable SDK-57 dependency set and give the app a valid Android identity.
- A first-class setup to-do markdown for the password-gated path this host cannot execute.
- Keep `engine-core`, `web`, `sim`, the save schema, and `expo-host` untouched.

**Non-Goals:**

- Play Store submission, `.aab` production builds, OTA updates, code signing for distribution,
  CI beyond the tag-triggered APK workflow, and any engine/gameplay change.
- Reproducing the reference repo's Supabase/Firebase/Sentry plumbing (this repo has none).

## Decisions

### D1. Local Gradle (`expo prebuild` + `gradlew assembleRelease`) as the primary build path

**Choice:** Primary path is fully local and account-free: `npx expo prebuild --platform android`
then Gradle `assembleRelease` (wrapped in a `mobile/` script + thin root wrapper).

**Why:** It is the only path that satisfies the goal (a local server build) with **no Expo
account**, and this host has no EAS CLI. It degrades well: the same Gradle step runs in GitHub
Actions with only Node + Java 17 + Android SDK, with **no secret**.

**Alternatives:**
- **`eas build --local`** — same local machine, but still **requires `EXPO_TOKEN`** and EAS CLI, and
  the `eas.json` `preview` path additionally requires an **Expo account and a `projectId`**
  (`extra.eas.projectId`) — a token alone is insufficient; `eas build --local` fails without a
  `projectId`. Kept as an optional documented alternative (`eas.json` `preview` profile,
  `buildType: apk`).
- **EAS cloud** — burns EAS credits/queue, needs an account and network service; contradicts the
  "local server build" goal.
- **Expo Go / QR only** — not an installable APK; cannot be attached to a Release.

### D2. Pin Expo **SDK 57** (stable), not SDK 58 (preview)

SDK 57 is the current stable line; SDK 58 is preview (`58.0.0-preview.0`). Deploying testers on
a preview SDK is not "stable, simplified deployment". Stay on 57. **Alternative considered:** SDK
58 preview — rejected: preview line, RN 0.88 RC, not stable.

### D3. Realign React Native to the SDK-57 paired version (`0.87.1 → 0.86.3`)

**Choice:** Align `mobile/` with `npx expo install --fix`, which resolves `react-native` to the
SDK-57 bundled `0.86.3`, keeping `react 19.2.3`, `expo ~57.0.26`, `jest-expo ~57.0.5`.

**Why:** An SDK-57 app should run the SDK-57 pinned RN so native modules, prebuild templates, and
Gradle config are a matched set; `expo doctor`/`expo install --check` treat 0.87.1 as off-version.

**Alternatives / trade-off (must be recorded):**
- **Keep 0.87.1** — it peer-satisfies `react ^19.2.3` and currently passes the mobile tests with a
  custom jest shim. But it is off the SDK-57 set, so prebuild/Gradle templates may not match and
  `expo doctor` warns. **Chosen against**, because the change's premise is a *stable, matched* SDK
  57 line.
- **Consequence:** downgrading may invalidate the RN-0.87-specific shim
  (`mobile/jest.config.js`, `mobile/tests/stubs/assets-registry-registry.js`) since
  `@react-native/assets-registry` exists again on 0.86. The tasks include re-running the mobile
  suite and adjusting/removing the shim if needed. If `expo install --fix` in practice cannot
  produce a green suite, the fallback is to **report the measured failure** rather than silently
  keep an off-version pin — the plan must not claim a green suite it did not observe.

### D4. Workflow trigger: tag push; secrets minimal

**Choice:** GitHub Actions on `push: tags: v*`, building with the local Gradle path, then
`softprops/action-gh-release` with `generate_release_notes: true` and `prerelease` when the tag
contains `preview`/`dev`/`alpha`/`beta`.

**Android SDK in CI (concrete):** The Gradle path needs an Android SDK on the runner. The reference
repo does **not** demonstrate a Gradle CI build: it runs `eas build --local`, which provisions its own
SDK and consumes `EXPO_TOKEN`, so it is not evidence our account-free Gradle path "just works" in CI.
Our workflow MUST provision the SDK explicitly and exactly, either via the maintained
`android-actions/setup-android@v3` action or a `cmdline-tools` step that runs
`sdkmanager --install "platforms;android-36" "build-tools;36.0.0" "platform-tools"`, accepts licenses
non-interactively (`yes | sdkmanager --licenses`), and exports `ANDROID_HOME` and `ANDROID_SDK_ROOT`.
This makes the workflow **self-contained with no secret** (task 4.1).

**Secrets:** The **primary Gradle path requires no secret** (or at most an Android SDK path).
`EXPO_TOKEN` is needed **only if** the optional EAS path is chosen. Documentation must state this
per path — the reference repo's `EXPO_TOKEN`/Firebase/Sentry secrets do **not** apply here.

**Version traceability:** The workflow syncs the pushed tag into the app version at build time
(`VERSION=${GITHUB_REF_NAME#v}` → `mobile/app.json`/`app.config.*` `expo.version`), mirroring the
reference's `jq` step. **`android.versionCode` is separate and cannot be derived from the semver tag** —
Android requires a monotonically increasing integer; it comes from a committed integer a maintainer
bumps or a monotonic source such as commit count (task 4.5) — so the `Version is traceable` scenario
holds.

**Alternative:** `workflow_dispatch` manual trigger — deferred; tags give immutable, reproducible
releases and match the proven pattern. Note the reference lesson: only tag pushes trigger, tags
are immutable, bump don't force-push.

### D5. Keystore strategy: debug key for testing (recommended), dedicated release key later

**Choice:** For testing distribution, use the **auto-generated debug keystore**
(`android/app/debug.keystore`, created by `expo prebuild` — general Expo/Gradle behavior, not a
reference-repo-only effect; the reference builds via `eas build --local` and debug-key signs its
preview APKs). Document the consequence and how to adopt a dedicated release keystore later.

**Consequence / point of no return:** A release APK signed with a **different keystore cannot
overwrite an existing install** — testers must uninstall first. Also `expo prebuild --clean`
regenerates the debug keystore with a **new SHA-1**, which breaks anything keyed to it. For a
stable signing identity across releases, a committed/persisted release keystore (with its
passwords as CI secrets) is the follow-up. **Alternative:** generate and commit a dedicated
release keystore now — rejected for scope: it adds secret management, and testing builds do not
need a stable signer.

### D6. Toolchain installation: user-space first, password-gated to-do as the fallback

**Choice:** Attempt a **user-space, no-sudo** toolchain first (JDK 17 from a user-space source +
Android `cmdline-tools` unzipped into `$HOME`, `JAVA_HOME`/`ANDROID_HOME`/`PATH` exported), and
**write the setup to-do markdown** for the `apt`/system path the host cannot execute.

**Why the to-do doc is first-class:** this host has **no sudo password**, so the system path
cannot be performed here; the user performs it. The document must be exact (packages, JDK+SDK,
env vars, keystore step) and cross-checked against the reference repo's proven commands.

**Ubuntu 26.04 risk:** 26.04 may not package `openjdk-17-jdk` (newer Ubuntu releases sometimes
ship only later JDKs, e.g. 21, or move to `default-jdk`). The reference baseline uses
`openjdk-17-jdk`, but that was on an older Ubuntu. Mitigation: the to-do doc must prefer a
**user-space JDK 17 from Adoptium/Temurin** (source archive) or fall back to a JDK the distro
does ship, and Gradle can be pointed at it via `org.gradle.java.home`. **Mark this as an
assumption to verify at execution time**, not a settled fact.

**Bare-Ubuntu native packages:** On a bare Ubuntu host the Android SDK's native tools (`aapt2`,
`adb`) need 32-bit runtime libraries, so the `apt`/system path must also install
`lib32z1 lib32stdc++6 libc6:i386` (or the modern equivalents, e.g. `libc6-i386`). The no-sudo
user-space path avoids these. The to-do doc must name them for the system path (tasks 2.1/2.2).

### D7. Generated native projects are gitignored (Expo CNG), not committed

**Choice:** Add `mobile/android/`, `mobile/ios/`, `*.keystore`, and `.expo/` to a `mobile/.gitignore`
(or the root `.gitignore`). The native projects produced by `expo prebuild` are **generated**, not
tracked.

**Why:** Expo uses **continuous native generation (CNG)**: `app.json` is the single source of truth
and `android/`/`ios/` are regenerated on each build. Committing them creates drift from `app.json`
and would re-introduce the debug keystore into history. Keeping them ignored keeps the repo clean and
makes the build reproducible from a clean checkout.

**Consequence:** Task 5.10's "intended changes" explicitly **excludes** `mobile/android/` — after a
prebuild, `git status --short` must not show it as untracked.

## Risks / Trade-offs

- **[This host has no sudo]** → Primary path is user-space toolchain; system path ships as the
  to-do markdown. If even user-space JDK install fails, the deliverable is still the to-do doc.
- **[No JDK/Android SDK/Gradle present]** → Build cannot be verified on this host without first
  installing the toolchain; the build script's verification may be blocked. Mitigation: the tasks
  explicitly require attempting user-space install; if blocked, **report the blocker**, and the
  workflow still builds in CI, which provisions Java 17 via `actions/setup-java` and the Android SDK
  via an explicit `android-actions/setup-android` / `sdkmanager` step (task 4.1) — `setup-java` alone
  does **not** provide an Android SDK.
- **[RN 0.87.1 → 0.86.3 breaks the mobile jest shim]** → Re-run `npm run test -w mobile`; adjust
  or remove the RN-0.87 shim; if not green, report measured failure rather than hide it.
- **[Changing `android.package` later is one-way]** → Choose the package id once, deliberately,
  and document it as permanent; changing it forces testers to uninstall.
- **[Different keystore can't overwrite an install]** → Document the uninstall-first step for
  testers and for any future release-key adoption.
- **[64-bit-only / toolchain mismatch on Ubuntu 26.04]** (e.g. missing `lib32` or 17 JDK) →
  Mitigation: prefer Temurin 17 archive; the system/`apt` path additionally needs
  `lib32z1 lib32stdc++6 libc6:i386` (or modern equivalents) for `aapt2`/`adb`; the user-space path
  avoids them. Record the actual JDK used in the to-do doc.
- **[CI Android SDK claim]** → The reference repo builds via `eas build --local` (self-provisioning
  SDK + `EXPO_TOKEN`), so it does **not** prove a Gradle CI build; our workflow must install the SDK
  explicitly (task 4.1) and remains **unverified until the first real tag push** (task 4.2).
- **[Secrets confusion from the reference repo]** → Docs state per path: Gradle needs none;
  EAS needs `EXPO_TOKEN`.
- **[APK size / install warnings]** → Expected (debug-key signed, "unknown developer"); document
  for testers.
- **[`expo prebuild --clean` invalidates the debug SHA-1]** → Avoid `--clean` unless a native
  config change requires it; regenerate knowingly.

## Migration Plan

1. Realign versions (`npx expo install --fix`) and re-green the `mobile` suite.
2. Add `android.package` + icon/splash/adaptive-icon and prebuild a valid Android project.
3. Add the build script(s); attempt the user-space toolchain and build a first APK.
4. Author the setup to-do markdown and cross-check it against the reference repo.
5. Add the tag-triggered workflow and document the release process.
6. Verify all existing gates, then validate the change.

**Rollback:** The change is additive except the version realignment; reverting is `git revert` of
the affected `mobile/` files (restoring RN 0.87.1). No data migration; save schema stays v4.

## Open Questions

- Exact `android.package` id (e.g. `com.autoautoclicker.app`) — can be chosen during
  implementation; **must be decided before any APK is distributed** because it is permanent.
- Whether Ubuntu 26.04 ships a JDK 17 package, or the to-do doc must prescribe Temurin — deferred
  to execution-time verification; the doc covers both.
