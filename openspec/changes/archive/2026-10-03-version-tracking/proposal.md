# Proposal

## Why

The repository has no version source of truth. Every version-bearing file — root
`package.json`, `mobile/package.json`, and `mobile/app.json`
(`expo.version` + `expo.android.versionCode`) — independently declares `0.0.0` /
`1`, while a single real tag `v0.1.2-preview` and its GitHub pre-release already
exist. Nothing checks that a pushed tag agrees with what the app declares, and
there is no `CHANGELOG.md`, so a release can silently ship a version that
disagrees with its tag. This change makes the version declared once and verified
everywhere before a release is built.

## What Changes

- Declare **`mobile/package.json` `version` as the single source of truth**; all
  other version fields derive from it.
- Add a dependency-free **sync/bump command** (`npm run version:sync`,
  `npm run version:bump -- <x.y.z>`) that propagates the source version into
  `mobile/app.json` `expo.version` and root `package.json` `version`.
- Add a dependency-free **check command** (`npm run version:check`) that fails
  non-zero when a tagged HEAD disagrees with `mobile/package.json`, or when
  either derived file has drifted. It tolerates an untagged (development) HEAD.
- Add a **fail-fast workflow validation step** so the release workflow rejects a
  pushed tag that disagrees with the declared version before building.
- Add **`CHANGELOG.md`** in Keep a Changelog format, seeded with the current
  release, and document the release process (changelog → bump → tag → push).
- Keep **`android.versionCode` a monotonic integer independent of semver**,
  derived by the existing `git rev-list --count HEAD` scheme.

## Capabilities

### New Capabilities

- `version-tracking`: Owns the declared version source of truth, the derived
  file consistency guard, the Keep a Changelog history, and the documented
  release process. It does not own the release workflow itself.

### Modified Capabilities

None. The release workflow is owned by the existing `android-apk-distribution`
capability; this change adds a verification *requirement that the workflow
consult the version source* without rewriting that capability's requirements
here (see Impact).

## Impact

- **New files:** `CHANGELOG.md`, a dependency-free version script (e.g.
  `scripts/version.mjs`), and the spec/design/tasks under this change.
- **Modified files:** root `package.json` (add `version:check`/`version:sync`/
  `version:bump` scripts, reconcile `version`), `mobile/package.json`
  (reconcile `version`), `mobile/app.json` (reconcile `expo.version`),
  `.github/workflows/build-apk.yml` (add a fail-fast tag/version check before
  the build), and `README.md` (document the release process as the authoring
  side of the existing Tag strategy section).
- **Dependencies:** none added; scripts are plain `node`.
- **Existing capability referenced, not duplicated:** `android-apk-distribution`
  owns the tag-triggered GitHub Release workflow, APK build, and
  `android.versionCode` scheme. `version-tracking` owns the version source,
  consistency guard, and changelog; it depends on `android-apk-distribution`'s
  workflow as the enforcement point, and its spec delta only adds a check the
  workflow performs rather than modifying that capability's requirements.
- **No engine, save-schema, or runtime behavior changes.**
