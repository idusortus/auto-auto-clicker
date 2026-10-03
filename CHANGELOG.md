# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The single source of truth for the version is `mobile/package.json` `version`.
Derived files (`mobile/app.json` `expo.version`, root `package.json` `version`)
are kept in sync with `npm run version:sync` and verified by
`npm run version:check`.

## [Unreleased]

## [0.1.2-preview] - 2026-10-03

### Added

- **Expo / React Native host** (`mobile/`) that consumes `engine-core` unchanged —
  an `AsyncStorage` `SaveRepository`, a fixed-step host clock with bounded offline
  replay, `AppState` flush/resume, theme→RN style mapping, and the core game loop
  with key overlays (HUD, arena, gear, choices, achievements, offline summary).
- **Android APK distribution** — a local, account-free Gradle build
  (`npm run mobile:apk` → `mobile/dist/auto-auto-clicker.apk`) and a tag-triggered
  GitHub Actions workflow that builds the APK and publishes it to a GitHub Release
  (pre-release for `preview`/`dev`/`alpha`/`beta` tags).
- Android app identity (`com.autoautoclicker.app`) with generated icon / splash /
  adaptive-icon assets.
- `docs/android-setup-todo.md` — reproduce the user-space JDK 17 + Android SDK
  toolchain (no `sudo`) and the per-path secrets.
- **Version tracking** — `mobile/package.json` as the single version source, with
  `npm run version:sync` / `version:bump` / `version:check` and a CI fail-fast
  validation that a release tag matches the declared version.

### Changed

- `mobile/` realigned to the stable **Expo SDK 57** dependency set
  (`react-native` 0.87.1 → 0.86.3, `@react-native-async-storage/async-storage`
  3.1.1 → 2.2.0, `typescript` ^5 → ~6.0.3).
- Jest resolves the workspace-local `react-native` so tests run the same version
  the APK ships.

[Unreleased]: https://github.com/idusortus/auto-auto-clicker/compare/v0.1.2-preview...HEAD
[0.1.2-preview]: https://github.com/idusortus/auto-auto-clicker/releases/tag/v0.1.2-preview
