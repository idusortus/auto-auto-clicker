# Proposal

## Why

The `mobile/` Expo workspace can run on a device only from a developer checkout, so there is
no way to hand a tester an installable build. The user needs to sideload the game on their own
phone (and share it) without a Play Store listing, a dev machine, or an Expo account. Today
there is **no** Android identity in `app.json`, **no** build script, **no** release automation,
and **no** documented way to stand the toolchain up. This change adds a repeatable local APK
build and a tag-driven GitHub Release path, on the stable Expo SDK 57 line.

## What Changes

- **Align `mobile/` to the stable SDK 57 recommended versions.** The workspace currently pins
  `react-native 0.87.1`, which is off the SDK-57 bundled set (`expo@57.0.26` bundles
  **`react-native 0.86.3`**). Align via `npx expo install --fix` so `react-native` resolves to
  the SDK-57 pair (`0.86.3`), keeping `react 19.2.3`, `expo ~57.0.26`, and `jest-expo ~57.0.5`.
  The existing `jest.config.js` RN-0.87 shim and the `decisions.md` "pin RN 0.87.1" note must be
  revisited as part of this realignment. Do **not** move to SDK 58 (preview-only).
- **Add the Android app identity** to `mobile/app.json`: `android.package`, plus a minimal
  `icon`, `splash`, and `android.adaptiveIcon` so `expo prebuild` yields a valid Android build.
  `expo.version` is populated from the pushed tag by the release workflow; `android.versionCode`
  is a separate **monotonically increasing integer** (committed and bumped by a maintainer, or derived
  from commit count) — it cannot come from the semver tag.
- **Ignore generated native projects**: `mobile/android/`, `mobile/ios/`, `*.keystore`, and `.expo/`
  are added to `.gitignore` because `expo prebuild` regenerates them (Expo CNG) and they must not be
  committed.
- **Add a local Android build path**: an `expo prebuild` + Gradle `assembleRelease` script under
  `mobile/` (no Expo account required) and a thin root wrapper, producing a release APK.
- **Add tag-triggered GitHub Actions** that builds the APK and attaches it to a GitHub Release
  (`push: tags: v*` → build → `softprops/action-gh-release`), with pre-release detection for
  `preview`/`dev`/`alpha`/`beta`.
- **Produce an Android environment setup to-do markdown** the user can follow to build the
  password-gated system toolchain themselves (JDK 17 + Android cmdline-tools/SDK + env vars +
  keystore), and document the build → release process in `README.md`.
- **Document `eas.json` `preview` (APK) profile as an optional alternative** for the EAS path,
  which requires an Expo account **and** a `projectId` (a token alone is not enough).

**BREAKING / point of no return:** changing `react-native 0.87.1 → 0.86.3` can fail the existing
`mobile` jest suite (the shim at `mobile/jest.config.js` exists for RN 0.87) and changes the app
runtime dependency. **Adding `android.package` is a permanent, unchangeable Android identity** —
once installs exist, changing it means testers must uninstall first. **Installing a release APK
signed with a different keystore cannot overwrite an existing install** (a new keystore is a
one-way door for that install).

## Capabilities

### New Capabilities

- `android-apk-distribution`: Builds an installable Android APK from the `mobile/` Expo
  workspace on the stable SDK 57 line, and publishes it as a GitHub Release asset from a version
  tag — including the documented build-environment and sideload process.

### Modified Capabilities

<!-- None. The RN/app-code behavior of the Expo host is governed by the existing `expo-host`
     spec, which this change references but does not modify. -->

## Impact

- **Repo:** `mobile/package.json`, `mobile/app.json`, new `mobile/` icon/splash assets, new
  build script(s) (`mobile/package.json` scripts + root `package.json` wrapper), new
  `.github/workflows/*.yml` (with an explicit, secret-free Android SDK setup step), new `eas.json`
  (optional profile), new docs (`docs/android-setup-todo.md`, `README.md`), `mobile/.gitignore`
  (or root `.gitignore`) for the generated `android/`/`ios/`/keystores, and possibly
  `mobile/jest.config.js` / `mobile/tests/stubs/*` if the RN realignment invalidates the RN-0.87 shim.
- **Dependencies:** `react-native 0.87.1 → 0.86.3` (SDK-57 pair). No new npm deps for the primary
  local path; `eas-cli` only if the optional EAS path is used.
- **Systems:** GitHub Actions + GitHub Releases (new). No backend, no Play Store, no EAS account
  required for the primary path.
- **Untouched:** `engine-core` (must stay byte-identical), `web`, `sim`, save schema (v4),
  `openspec/specs/expo-host/`.
