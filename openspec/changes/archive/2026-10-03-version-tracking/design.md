# Design

## Context

See `proposal.md` - Why. Current state that shapes the approach:

- Three files independently carry a version and all read `0.0.0`/`1`: root
  `package.json` `version`, `mobile/package.json` `version`, and
  `mobile/app.json` `expo.version` (`expo.android.versionCode` = `1`). No
  `VERSION` file and no `CHANGELOG.md` exist.
- One tag exists, `v0.1.2-preview`, with a GitHub pre-release carrying the APK.
  HEAD is `v0.1.2-preview-2-gd8b0b15` (two commits past the tag); current
  `git rev-list --count HEAD` is 31.
- `.github/workflows/build-apk.yml` triggers on `push: tags: v*`, checks out with
  `fetch-depth: 0`, and its "Sync app version with tag" step already sets
  `expo.version` from `GITHUB_REF_NAME#v` and `android.versionCode` from
  `git rev-list --count HEAD`. `README.md` already documents this scheme and the
  Tag strategy.
- The release workflow/APK capability is owned by `android-apk-distribution`
  (existing spec). This change must not rewrite that capability's requirements.

## Goals / Non-Goals

**Goals:**

- One declared version in `mobile/package.json`; derived files that provably match.
- A dependency-free check that fails on drift and on a tag/version mismatch,
  placed in CI before the build.
- Preserve the existing `versionCode` lineage (commit count) unchanged.
- A Keep a Changelog history seeded with the current release, plus documented
  release steps.

**Non-Goals:**

- Conventional-commit parsing or automatic changelog generation.
- Changing the `versionCode` scheme or renumbering past releases.
- Changing save-schema, runtime, or engine behavior.
- Re-specifying the release workflow owned by `android-apk-distribution`.

## Decisions

### D1: Source of truth is `mobile/package.json` `version`

`mobile/` is the shipped artifact; its package version is the natural app version,
it already exists under npm workspaces, and tooling (`npm version`, `npm pkg get`)
reads it without a custom parser. Derived files remain `mobile/app.json`
`expo.version` and root `package.json` `version` (root kept in sync for repo
tidiness only).

*Alternatives:* a dedicated `VERSION` file (new format-free source, but adds a
file type and a parser and duplicates what a package manifest already expresses);
root `package.json` as source (the root is a workspace umbrella that never ships,
so its version is less meaningful). Rejected both in favor of the mobile
manifest.

### D2: Keep `android.versionCode` as commit count, independent of semver

Android requires a strictly increasing integer; a semver string cannot supply it
and the semver string's numeric parts do not map cleanly to the Android rules
(e.g. pre-release suffixes, and equal `major.minor.patch` across editions). The
existing scheme `git rev-list --count HEAD` already produced `versionCode=29` on
the one real release and guarantees a strictly greater value on any later tag.
The version tooling MUST NOT derive the integer from the version string and MUST
NOT rewrite `expo.android.versionCode`, so the `v0.1.2-preview` lineage is not
regressed.

*Alternative:* derive an integer from semver (breaks pre-release tags and the
existing lineage). Rejected.

### D3: Guard reads the tag when HEAD is tagged; fails closed in CI when none is resolvable

`npm run version:check` computes the candidate tag via `git describe --exact-match
--tags --match 'v*'` (or `GITHUB_REF_NAME` when set in CI). If a tag is present,
its version (tag minus a leading `v`) must equal `mobile/package.json` `version`;
otherwise it fails. If no tag is present, the tag check is skipped and only the
derived-file sync check runs.

**The skip is permitted ONLY when running locally with no tag. In CI, absence of a
resolvable `v*` tag is a failure.** This is required because `git describe
--exact-match` returns **exit 128 (fatal), not a clean "no tag"**, on an untagged
HEAD; a naive "non-zero ⇒ skip" implementation would therefore *skip instead of
failing* in any CI run where `GITHUB_REF_NAME` is empty or non-`v*` (e.g. a future
`workflow_dispatch`, a re-run, or a manual `gh workflow run`). The check MUST treat
"CI is set but no `v*` tag resolves" as an error, not a skip. Concretely: the
skip branch is entered only when there is no CI environment (`CI` and
`GITHUB_REF_NAME` both unset).

Interaction with the existing `v0.1.2-preview`: because the working HEAD is not
the tagged commit, a **local** run tolerates it; when the seed version is reconciled
to match `v0.1.2-preview` (D4), checking out that tag also passes. This is what
makes the guard safe to run locally during development and mandatory (fail-closed)
in CI on tag push.

*Alternative:* always require a tag (breaks local/dev runs). Rejected. *Alternative:*
treat any `git describe` non-zero as "no tag" (would skip in CI and defeat the
guard). Rejected.

### D4: Seed version recommendation — `0.1.2-preview`

Reconcile `mobile/package.json` (then derive the others) to **`0.1.2-preview`**.

- Coherent with the one existing tag and its GitHub pre-release: the declared
  version equals the shipped/pre-release version, so checking out `v0.1.2-preview`
  passes the guard and the changelog section can be dated under `0.1.2-preview`.
- No fabricated history: choosing `0.1.0` would assert a plain release that was
  never tagged and would leave the one real artifact unexplained.

**Consequence for the next tag:** the next release must be strictly newer than
`0.1.2-preview` (e.g. `v0.1.3-preview` or `v0.2.0`), because the guard requires
the tag to equal the declared version at tagging time and tags are immutable.
This is an accepted, explicit cost; it keeps the single real release truthful.

### D5: Dependency-free `node` scripts

Scripts are plain `node` ESM (e.g. `scripts/version.mjs`) with no new
dependencies, matching project constraints. One script exposes `sync`, `bump`, and
`check` modes; root `package.json` wires `version:sync`, `version:bump`, and
`version:check`. `JSON.parse`/`stringify` with 2-space indent preserves existing
`package.json`/`app.json` formatting.

*Alternative:* add `semver`/`changelog` tooling. Rejected: violates "no new
dependencies without justification" for behavior that is simple string equality
plus JSON rewrites.

### D6: CI fail-fast placement is the first step after checkout

Add a version-validation step immediately after checkout (and before
`npm ci`/SDK/build), invoking the same check (`GITHUB_REF_NAME` supplies the tag,
so no `git describe` ambiguity). Because the release workflow triggers on
`push: tags: v*`, `GITHUB_REF_NAME` is always a `v*` tag here; if it were
nevertheless empty/non-`v*` in a future trigger, the check fails closed per D3
rather than skipping. Failing here avoids spending build minutes and, more
importantly, prevents publishing a release whose version disagrees with its tag.
The existing "Sync app version with tag" step stays as the write of the derived
`expo.version`/`versionCode`; after this change, its input equals the declared
version by construction.

**Enforcement surface (no PR-time gate).** The guard runs in exactly two places:
(1) locally, via the check command a developer runs; and (2) in the release
workflow on tag push. There is **no branch/pull-request CI workflow** —
`.github/workflows/` contains only `build-apk.yml`, which triggers on tag push.
Branch pushes and PRs are therefore **not** gated by this check; a version drift
introduced on a branch is caught only when a `v*` tag is pushed (or when someone
runs `npm run version:check` locally). This is a documented limitation, not an
oversight: adding a PR workflow is out of scope for this change.

*Alternative:* validate after the build. Rejected: wastes CI and risks the release
step running. *Alternative:* add a PR-triggered workflow. Out of scope (see
Non-Goals); documented as a limitation here.

## Risks / Trade-offs

- **`fetch-depth: 0` is required for a stable commit count and for
  `git describe`.** → The workflow already checks out with `fetch-depth: 0`; the
  check runs locally without a tag and tolerates a shallow/no-tag clone.
- **A version-bump commit changes the commit count, so the released
  `versionCode` reflects the tagged commit, not the pre-bump count.** → Accepted;
  it is still strictly monotonic across tags, which is the only Android
  requirement. Documented so the value is not mistaken for a semver mapping.
- **Pre-release versions in `mobile/package.json` are valid npm versions?**
  `0.1.2-preview` is a valid semver pre-release identifier; `npm ci`/workspaces
  do not require the mobile package to be publishable (`"private": true`). →
  Low risk; if npm tooling ever objects, fall back to `0.1.2-preview.0` (assumption
  noted; not verified against `npm version` here).
- **Hand-editing a derived file after a bump re-introduces drift.** → The check
  command catches it, and it is the CI gate at tag time.
- **`git describe --exact-match` behavior when multiple tags point at HEAD.** →
  The project currently has one tag and a documented immutable-tag strategy;
  the check compares against whichever exact tag matches `v*` (assumption: one
  tag per release, per Tag strategy).

## Migration Plan

1. Add `scripts/version.mjs` (sync/bump/check) and root scripts.
2. Reconcile `mobile/package.json` to `0.1.2-preview`; run `version:sync` to write
   `mobile/app.json` `expo.version` and root `package.json` `version` (leave
   `android.versionCode` untouched).
3. Add `CHANGELOG.md` seeded with the current release.
4. Add the CI validation step; document the release process in `README.md`.
5. Rollback: revert the commit. No runtime/save/engine state is affected, so
   rollback is a plain git revert.
