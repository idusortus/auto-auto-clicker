# Spec Delta

## Purpose

Lets anyone turn the `mobile/` Expo workspace into an installable Android APK on the stable Expo
SDK 57 line and publish it as a GitHub Release asset, so the game can be sideloaded for testing
without a Play Store listing, an Expo account, or a developer machine.

## ADDED Requirements

### Requirement: Local APK build from a clean checkout

The project SHALL provide a documented, repeatable local build path that produces an installable
Android APK from a clean checkout of the `mobile/` Expo workspace, using only the pinned repo
dependencies plus a local JDK and Android SDK — no Expo account, no network build service, and no
pre-existing `android/` directory.

#### Scenario: Build produces an APK

- **WHEN** a developer runs the documented local build command on a host with the Android
  toolchain available
- **THEN** the build regenerates the native Android project from `app.json` and emits a release
  APK file on disk

#### Scenario: Shell script is the single entry point

- **WHEN** a developer invokes the build through the documented script
- **THEN** the script performs the prebuild and the Gradle release build without requiring any
  manual Gradle invocation

#### Scenario: No Expo account is required

- **WHEN** the local build runs on a machine where no EAS login or `EXPO_TOKEN` exists
- **THEN** the build still completes and produces an APK

#### Scenario: Generated native project is not committed

- **WHEN** `expo prebuild` generates the native Android project
- **THEN** the generated `mobile/android/` (and `mobile/ios/`, keystores, `.expo/`) are gitignored and
  do not appear as tracked or untracked changes, since they are regenerated from `app.json`

### Requirement: Installable and versioned APK artifact

The produced APK SHALL be a valid Android package archive that is installable by sideloading,
and SHALL carry the application version derived from the `mobile/` workspace version.

#### Scenario: Artifact is a valid APK

- **WHEN** the built artifact is inspected as a ZIP archive
- **THEN** it contains an `AndroidManifest.xml` and the expected APK structure

#### Scenario: Version is traceable

- **WHEN** an APK is built for a release
- **THEN** the application version it reports matches the version recorded for that release, and its
  Android `versionCode` is a non-empty, monotonically increasing integer independent of the semver tag

#### Scenario: Sideload installation is documented

- **WHEN** a tester receives the APK
- **THEN** the documentation explains enabling "install unknown apps" and installing over a prior
  install (including the different-keystore uninstall requirement)

### Requirement: Stable Expo SDK 57 app identity

The `mobile/` app SHALL identify as a stable Expo SDK 57 application whose React Native and React
dependencies match the SDK-57 recommended set, and SHALL declare the Android application
identity and required display assets so `expo prebuild` yields a valid Android project.

#### Scenario: Dependencies match the SDK 57 set

- **WHEN** the `mobile/` dependency versions are compared against the SDK-57 bundled versions
- **THEN** `react-native` matches the SDK-57 paired version and `expo`/`react` remain on the
  SDK-57 line, with no dependency on the SDK 58 preview line

#### Scenario: Android identity is declared

- **WHEN** `expo prebuild` runs
- **THEN** `app.json` supplies the Android package identifier and the minimal icon / splash /
  adaptive-icon assets, and the generated Android project builds

#### Scenario: SDK 58 preview is not used

- **WHEN** the mobile dependency set is inspected
- **THEN** no dependency resolves to the Expo SDK 58 preview line

### Requirement: Tag-triggered GitHub Release with APK asset

The project SHALL provide a GitHub Actions workflow that, on a push of a version tag matching
`v*`, builds the Android APK and attaches it as an asset on a GitHub Release for that tag.

#### Scenario: Version tag produces a release

- **WHEN** a `v*` tag is pushed
- **THEN** the workflow builds the APK and publishes a GitHub Release whose assets include the
  APK for that tag

#### Scenario: Pre-release tags are marked pre-release

- **WHEN** the pushed tag contains `preview`, `dev`, `alpha`, or `beta`
- **THEN** the created Release is marked as a pre-release

#### Scenario: Non-tag pushes do not publish

- **WHEN** a commit is pushed to a branch without a new `v*` tag
- **THEN** no release APK is built or published

#### Scenario: Required CI secrets are named

- **WHEN** a reader inspects the workflow documentation
- **THEN** the documentation states which secrets each build path requires (and that the local
  Gradle path requires none, its Android SDK being provisioned by the workflow itself)

#### Scenario: CI provisions its own Android SDK with no secret

- **WHEN** the release workflow runs on a GitHub-hosted runner
- **THEN** it installs the pinned Android SDK platform and build-tools and exports
  `ANDROID_HOME`/`ANDROID_SDK_ROOT` using no secret, so the Gradle build runs account-free

### Requirement: Documented build environment setup

The project SHALL ship a markdown document that lets a user stand up the Android build
environment themselves, and SHALL document the build → release process, because the target host
cannot run password-gated system installs.

#### Scenario: Setup to-do document exists

- **WHEN** a user needs to prepare an Android build host
- **THEN** a markdown to-do document lists the required packages (including the 32-bit libraries
  `aapt2`/`adb` need on a system install), JDK, Android SDK components, environment variables, and the
  debug-keystore step

#### Scenario: Optional EAS path states its prerequisites

- **WHEN** a reader considers the optional `eas.json` path
- **THEN** the documentation states it requires an Expo account and a `projectId` (not merely a token),
  and that the primary local Gradle path requires no Expo account

#### Scenario: Setup commands match a proven baseline

- **WHEN** the documented setup commands are reviewed
- **THEN** they are cross-checked against the reference implementation that has successfully
  built APKs, with any divergence called out

#### Scenario: Process documented in the project README

- **WHEN** a developer opens the project README
- **THEN** it describes how to build an APK and how a tag produces a GitHub Release
