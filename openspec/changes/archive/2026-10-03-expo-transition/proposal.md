# Proposal

## Why

`engine-core` was designed so its host is replaceable, but that claim has only ever been
tested by the browser host in `/web`. The project's central promise — "lift the engine into a
React Native / Expo app by supplying a renderer, a `SaveRepository`, and a clock, and change
nothing else" — is currently prose in `README.md`, not a demonstrated fact. A second,
genuinely different host that drives the same engine proves the seam is real before more
host-specific behavior accumulates in `/web`.

## What Changes

- Add a new npm workspace `mobile/` (`@auto-auto-clicker/mobile`) — an Expo / React Native app
  that consumes `engine-core` **unchanged** and proves the host contract. Target platforms are
  **iOS and Android** via Expo; acceptance in this change is the host-contract proof (RN tests
  plus typecheck against the engine), and both platforms are expected to build although
  per-platform device builds are not part of the automated gate.
- Implement `AsyncStorageSaveRepository`, an `AsyncStorage`-backed `SaveRepository` adapter that
  replaces `LocalStorageSaveRepository` without any engine edit.
- Implement an RN host clock and loop with the same fixed 100 ms `advance` step, bounded
  catch-up, and `AppState`-driven flush/resume behavior as `web/src/main.ts`.
- Implement boot-time offline replay by passing elapsed wall-clock time through the same
  `advance()` in bounded steps, capped and stopped at a pending choice — parity with the web
  host's `replayOffline()`.
- Port the core RN renderer: HUD, tappable enemy, HP bar, equipped/bag panels, four per-slot
  upgrade controls, the pending-choice overlay, the stall-advisory callout, the Golden-Event /
  Stray claim control, the offline summary, and the achievements shelf — wired to the same
  handler surface (`onClick` / `onUpgrade` / `onEquip` / `onChoice` / `onClaim`).
- Map the active theme's 19 palette tokens to React Native styles and resolve theme asset slots
  by name, so a one-line theme swap still rescans the app.
- Add RN tests (Jest + React Native Testing Library) covering save hydration, offline replay,
  action dispatch, and theme-driven rendering.
- Update `README.md` to document the second host and how to run it.

Explicitly **not** in scope: full feature/animation parity with `/web`, a navigation library,
remote persistence or auth, and any change to `engine-core` (save schema stays **v4**).

## Capabilities

### New Capabilities
- `expo-host`: the behavioral contract of a React Native / Expo host that hydrates a save,
  replays offline time, runs a fixed-step simulation loop, dispatches player actions, autosaves,
  renders through the active theme, and consumes `engine-core` unchanged.

### Modified Capabilities
<!-- None: no existing capability's requirements change. The web/sim/engine specs (if any) are untouched. -->

## Impact

- **New code:** `mobile/` workspace (app entry, RN renderer components, `AsyncStorageSaveRepository`,
  host loop/clock, theme→RN style mapping, Jest tests, Expo config).
- **Root config:** `package.json` workspaces list and scripts gain `mobile` entries; `README.md`
  gains a "Second host: Expo / React Native" section.
- **Dependencies:** Expo SDK, React Native, React, `@react-native-async-storage/async-storage`,
  `jest-expo`, and `@testing-library/react-native` are added to the `mobile` workspace only.
- **engine-core:** read-only consumer. No source file, type, balance value, theme token, or save
  version changes; the save schema stays **v4**.
- **Existing hosts:** `/web` and `/sim` are untouched, and their gates (`test`, `sim`, `smoke`,
  `build`, `typecheck`) must keep passing.
