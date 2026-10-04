# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The single source of truth for the version is `mobile/package.json` `version`.
Derived files (`mobile/app.json` `expo.version`, root `package.json` `version`)
are kept in sync with `npm run version:sync` and verified by
`npm run version:check`.

## [Unreleased]

## [0.4.0-preview] - 2026-10-04

### Added

- **Real pixel-art sprites.** `npm run pixel:art`
  (`engine-core/scripts/make-pixel-art.ts`) generates the `fantasy` theme's sprites — a hero, a
  grunt, a horned boss, a small imp (four Shiny variants), and the spawn popup — as dark-outlined
  16-bit-era pixel art at the exact contract sizes, replacing the generated placeholder blobs.
- **Frame-sequence animation.** The theme display contract now expresses an ordered frame
  sequence per asset slot (`AssetSlotSpec.frames`, `Theme.assets` as a frame list); idle sprites
  loop their idle frames and each animation cue plays its sequence once across the cue duration,
  on both the web and Expo hosts. Reduced motion holds a single rest frame.
- **Frame-aware validation.** `npm run theme:check` verifies every declared frame exists at its
  exact pixel size for the active theme; the engine theme tests assert both themes declare the
  same frame set.

### Changed

- The placeholder generator emits per-frame files so `lucky` (which keeps placeholder art) stays
  contract-identical to `fantasy`.

## [0.3.0] - 2026-10-04

### Added

- **Theme art on the Expo host.** The RN arena now renders the active theme's
  declared pixel art instead of placeholder boxes: `npm run mobile:assets` copies
  each theme's declared PNGs into `mobile/assets/themes/<name>/` and emits a
  committed literal-require registry (`src/themeAssets.gen.ts`) that measures each
  PNG's IHDR dimensions, and `ThemeImage` draws a slot at its declared size.
  `resolveAsset` fails loudly on a slot the theme declares but the registry lacks.
- **Event-driven animation on the Expo host.** A port of the web host's
  `GameEvent[]`→cue framework: a pure `animation/cues.ts` (per-actor priority,
  ties-to-last, `stageEntered` advances the running stage), `useAnimationCues`
  (one live frame per actor, a single drain timer, duration-0 disables a cue, a
  bounded queue), and `useReducedMotion`. Reanimated flourishes: HP-bar tween,
  boost-pill pulse, Shiny drift plus escape/claim messages, spawn popup, queued
  achievement splash, milestone flourish, enemy-taunt toast, and overlay entrance
  animations.
- **Safe-area insets on the Expo host.** The app is wrapped in `SafeAreaProvider`
  and the screen composes `useSafeAreaInsets()` into its frame and the bottom
  toast stack, so the HUD clears the Android status bar / cutout (edge-to-edge is
  enabled) and the iOS notch, and bottom content clears the gesture area.

### Changed

- Mobile dependency set gains SDK-57-pinned `react-native-safe-area-context`,
  `react-native-reanimated`, and `react-native-worklets`. Add mobile deps with
  `npm install <pkg>@<ver> --workspace mobile --legacy-peer-deps` — `npx expo
  install` re-hoists `react-native` and breaks the workspace-local RN nesting
  that `mobile/jest.config.js` requires.

## [0.2.0] - 2026-10-03

### Added

- **Version tracking** — `mobile/package.json` `version` as the single source of
  truth, with `npm run version:sync` / `version:bump` / `version:check`
  (`scripts/version.mjs`, dependency-free). The check fails on derived-file drift
  and on a tag/version mismatch, and fails closed in CI when no `v*` tag resolves.
- The release workflow now validates the pushed tag against the declared version
  **before** building, so a mismatched tag cannot publish a release.
- `CHANGELOG.md` (Keep a Changelog).

### Changed

- App version declared once and derived into `mobile/app.json` `expo.version` and
  the root `package.json` `version`.

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

[Unreleased]: https://github.com/idusortus/auto-auto-clicker/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/idusortus/auto-auto-clicker/compare/v0.1.2-preview...v0.2.0
[0.1.2-preview]: https://github.com/idusortus/auto-auto-clicker/releases/tag/v0.1.2-preview
