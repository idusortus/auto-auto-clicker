# Tasks

## 1. Version source + sync command

- [x] 1.1 Add a dependency-free `node` script (e.g. `scripts/version.mjs`) with `sync`/`bump`/`check` modes; verify `node scripts/version.mjs check` runs and exits without requiring any new dependency (no change to any `package.json` `dependencies`)
- [x] 1.2 Implement `sync` to read `mobile/package.json` `version` and write it into `mobile/app.json` `expo.version` and root `package.json` `version`, leaving `expo.android.versionCode` untouched; verify by deliberately setting a stale value in `mobile/app.json` and confirming `node scripts/version.mjs sync` rewrites it and preserves `versionCode`
- [x] 1.3 Implement `bump <x.y.z>` to set `mobile/package.json` `version` to the argument and then propagate; verify `node scripts/version.mjs bump 9.9.9` shows the three files changing and `versionCode` unchanged, then revert the three files (`git checkout -- mobile/package.json mobile/app.json package.json`)
- [x] 1.4 Wire `version:sync` and `version:bump` scripts into root `package.json`; verify `npm run version:sync` completes with exit 0

## 2. Check command + CI wiring

- [x] 2.1 Implement `check`: exit non-zero when `mobile/app.json` `expo.version` or root `package.json` `version` differs from `mobile/package.json` `version`, naming the offending file in the error; verify by temporarily stale-ing each file and confirming non-zero exit and the correct file name in output
- [x] 2.2 Implement the tag check: when HEAD carries a `v*` tag (via `git describe --exact-match --tags --match 'v*'` or `GITHUB_REF_NAME` in CI), fail when the tag version (minus leading `v`) differs from `mobile/package.json` `version`; skip the tag check ONLY when running locally with no tag; in CI (i.e. `CI` and/or `GITHUB_REF_NAME` set) a non-resolvable `v*` tag is a failure, not a skip. Verify all three branches:
  - `CI=1 GITHUB_REF_NAME=not-a-version node scripts/version.mjs check` exits **non-zero** (CI with a non-`v*` ref fails closed);
  - `CI=1 GITHUB_REF_NAME=<matching vX.Y.Z> node scripts/version.mjs check` exits **zero** (matching tag in CI passes);
  - `env -u CI -u GITHUB_REF_NAME node scripts/version.mjs check` on an untagged local HEAD exits **zero** (local no-tag skip stays green). Note: `git describe --exact-match` exits 128 on an untagged HEAD, so the implementation must distinguish "no tag locally" from "CI with no tag" — a bare `if ($? -ne 0) skip` is incorrect.
- [x] 2.3 Wire `version:check` into root `package.json`; verify `npm run version:check` exits 0 on a consistent tree and non-zero after deliberately drifting a derived file
- [x] 2.4 Add a version-validation step to `.github/workflows/build-apk.yml` immediately after checkout and before `npm ci`/SDK/build, passing the tag via `GITHUB_REF_NAME`. Verify **executably** (no dry reasoning) by running the step's exact command in a shell with the env it would see: `CI=1 GITHUB_REF_NAME=v9.9.9 <step command>` MUST exit non-zero (mismatched tag fails before the build step), and `CI=1 GITHUB_REF_NAME=<declared version with v prefix> <step command>` MUST exit zero (matching tag passes)

## 3. Seed version + CHANGELOG

- [x] 3.1 Reconcile `mobile/package.json` `version` to `0.1.2-preview` and run `version:sync` so `mobile/app.json` `expo.version` and root `package.json` `version` match; verify `npm run version:check` exits 0 and `git tag` shows the value equals the `v0.1.2-preview` tag minus `v`
- [x] 3.2 Verify `expo.android.versionCode` in `mobile/app.json` is unchanged from its pre-change value (still the value it had; the seed and sync do not alter it)
- [x] 3.3 Add `CHANGELOG.md` (Keep a Changelog) with `## [Unreleased]` and a dated `## [0.1.2-preview] - <YYYY-MM-DD>` section recording the Expo-to-`mobile/` port and APK distribution; verify the date matches the existing release date and categories are Added/Changed/Fixed

## 4. Document the release process

- [x] 4.1 Update `README.md` release/versioning section to document the authoring side: update `CHANGELOG.md`, bump via `npm run version:bump -- <x.y.z>`, commit, create the `v*` tag, push, and note the workflow verifies the tag against the declared version; verify the new steps reference the existing Tag strategy and do not contradict it

## 5. Verification

- [x] 5.1 Run `npm run typecheck` and `npm run test` and confirm both pass
- [x] 5.2 Run `npm run test -w mobile` and confirm it passes
- [x] 5.3 Run `npm run sim` and confirm it prints `PACING OK`
- [x] 5.4 Run `npm run smoke` and `npm run build` and confirm both succeed
- [x] 5.5 Run `git diff --stat engine-core` and confirm it is empty (no engine changes)
- [x] 5.6 Run `npm run version:check` and confirm exit 0 on the consistent tree; then deliberately set `mobile/app.json` `expo.version` to a wrong value and confirm non-zero exit; restore and re-confirm exit 0
- [x] 5.7 Simulate a mismatched tag (e.g. `GITHUB_REF_NAME=v0.0.1` against the declared version) and confirm `version:check` fails; confirm the matching tag passes
- [x] 5.8 Run `openspec validate version-tracking --strict` and confirm it is clean
