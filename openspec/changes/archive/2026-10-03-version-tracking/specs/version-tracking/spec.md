# Spec Delta

## Purpose

Keeps a single declared version for the app and its release history coherent: one
source of truth, derived files that stay in sync, a guard that fails on drift or
a tag/version mismatch, and a Keep a Changelog release record.

## ADDED Requirements

### Requirement: Single source of truth for the app version

The app version SHALL be declared in exactly one place, `mobile/package.json`
under the `version` field, and every other version-bearing file SHALL be derived
from it rather than independently authored.

#### Scenario: Version is declared once

- **WHEN** a maintainer needs to change the app version
- **THEN** they change `mobile/package.json` `version` and derive the remaining
  files from it, without hand-editing any other version field first

#### Scenario: Derived version fields exist

- **WHEN** the repository is inspected for version-bearing fields
- **THEN** `mobile/app.json` `expo.version` and root `package.json` `version`
  both carry a value equal to `mobile/package.json` `version`

### Requirement: Derived version files stay in sync

The project SHALL provide a dependency-free command that propagates the source
version from `mobile/package.json` into `mobile/app.json` `expo.version` and root
`package.json` `version`, and that accepts an optional new version argument to
bump the source before propagating.

#### Scenario: Sync propagates the current version

- **WHEN** the sync command is run with no version argument while
  `mobile/app.json` or the root `package.json` disagrees with
  `mobile/package.json`
- **THEN** both derived files are rewritten to match `mobile/package.json`
  `version`

#### Scenario: Bump sets a new version and propagates it

- **WHEN** the bump command is run with a new valid version string
- **THEN** `mobile/package.json` `version` is set to that string and the derived
  files are updated to the same value

#### Scenario: Sync does not touch the Android version code

- **WHEN** the sync or bump command runs
- **THEN** `mobile/app.json` `expo.android.versionCode` is left unchanged, since
  it is not derivable from a semver string

### Requirement: Consistency check fails on drift

The project SHALL provide a dependency-free check command that exits non-zero
when the version state is inconsistent and exits zero when it is consistent. It
SHALL treat an untagged HEAD (ordinary development) as consistent as long as the
derived files agree with the source.

#### Scenario: Check passes when consistent

- **WHEN** the check command runs on a HEAD where `mobile/app.json`
  `expo.version` and root `package.json` `version` equal
  `mobile/package.json` `version`
- **THEN** the command exits zero

#### Scenario: Check fails when a derived file drifts

- **WHEN** either `mobile/app.json` `expo.version` or root `package.json`
  `version` differs from `mobile/package.json` `version`
- **THEN** the command exits non-zero and reports which file is out of sync

#### Scenario: Check fails on a tag/version mismatch

- **WHEN** the command runs on a HEAD that carries a `v*` tag whose version does
  not equal `mobile/package.json` `version`
- **THEN** the command exits non-zero and reports the tag and the declared version

#### Scenario: Check tolerates an untagged HEAD locally

- **WHEN** the command runs locally (no CI environment) on a HEAD with no `v*`
  tag and the derived files agree with the source
- **THEN** the command exits zero

#### Scenario: Check fails closed in CI when no tag is resolvable

- **WHEN** the command runs in CI (`GITHUB_REF_NAME` and/or `CI` is set) but no
  `v*` tag is resolvable from the pushed ref/HEAD
- **THEN** the command exits non-zero rather than skipping the tag check, so a
  misconfigured or tag-less CI run cannot silently pass as if it were a local
  development run

### Requirement: Release workflow rejects a tag that disagrees with the declared version

The release workflow SHALL verify, before building the APK, that the pushed `v*`
tag's version equals the declared `mobile/package.json` version, and SHALL fail
fast when they disagree so a release cannot ship a version that conflicts with
its tag. The build's derived app version SHALL therefore equal both the tag and
the declared version.

#### Scenario: Matching tag proceeds to build

- **WHEN** a `v*` tag is pushed whose version equals `mobile/package.json`
  `version`
- **THEN** the workflow passes its version validation and continues to build the
  APK

#### Scenario: Mismatched tag fails before building

- **WHEN** a `v*` tag is pushed whose version differs from `mobile/package.json`
  `version`
- **THEN** the workflow fails its version validation before the APK build runs
  and no release is published

### Requirement: Android version code stays a monotonic integer independent of semver

The Android `versionCode` SHALL remain a strictly increasing integer that is not
derived from the semver string, preserving the existing commit-count lineage so
that a new tag's `versionCode` is strictly greater than the previously released
one.

#### Scenario: Version code is an integer

- **WHEN** the Android app config is inspected
- **THEN** `expo.android.versionCode` is a positive integer, never a semver value

#### Scenario: New release increases the version code

- **WHEN** a new `v*` tag is released after an earlier release
- **THEN** its `versionCode` is strictly greater than the earlier release's
  `versionCode`

#### Scenario: Renaming tooling does not reinterpret the version code

- **WHEN** the sync, bump, or check commands run
- **THEN** none of them derive `versionCode` from the version string

### Requirement: Changelog records releases in Keep a Changelog format

The project SHALL keep a `CHANGELOG.md` at the repository root that follows the
Keep a Changelog format, including an `## [Unreleased]` section and a dated
section per released version with change categories.

#### Scenario: Changelog exists and is structured

- **WHEN** `CHANGELOG.md` is opened
- **THEN** it contains an `## [Unreleased]` section and at least one dated
  `## [<version>] - <YYYY-MM-DD>` section using Added/Changed/Fixed categories

#### Scenario: Changelog is seeded with the current release

- **WHEN** the changelog is reviewed for the current release
- **THEN** it records the existing release (the Expo-to-`mobile/` port and APK
  distribution) under a dated section matching the reconciled current version

### Requirement: Release process is documented

The repository SHALL document the release process — update the changelog, bump
the version, tag, and push — so a maintainer can cut a release and have the tag,
declared version, and changelog stay consistent.

#### Scenario: Release steps are documented

- **WHEN** a reader looks for how to cut a release
- **THEN** the documentation lists updating the changelog, bumping the version,
  creating the tag, and pushing it, and states that the release workflow verifies
  the tag against the declared version
