# Design

## Context

See `proposal.md` for motivation. The target is a React Native / Expo host that boots the
unchanged `engine-core` simulation, persists it locally, replays offline time through the same
`advance()` contract, and renders the core loop and overlays through the active theme. Target
platforms are **iOS and Android** via Expo; the automated proof is the host contract (RN tests
plus typecheck), with platform builds expected but not part of the gate. What matters for the
approach:

- The engine's host contract is already demonstrated by `web/src/main.ts`: fixed 100 ms
  `advance` steps, `MAX_CATCHUP_STEPS = 10`, `AUTOSAVE_INTERVAL_MS = 5000`, bounded
  `replayOffline()` at `OFFLINE_STEP_MS = 1000` capped at 8 h that stops at a pending choice
  and discards events, and an in-memory `stageBeganAtMs` stall anchor passed via
  `render(state, { stageBeganAtMs }, events)`.
- The persistence seam is `engine-core/save/repository.ts` (`load(): Promise<SaveGame|null>`,
  `save(save): Promise<void>`), already `Promise`-based, with `DEFAULT_SAVE_KEY` and
  `LocalStorageSaveRepository` as the browser adapter.
- The theme is `ACTIVE_THEME`, a 19-token `palette` of CSS colour strings plus 32 asset slots
  under `/themes/<theme.name>/<assets[slot]>`; all copy is theme-owned.
- The engine is pure: no DOM, no timers, no clock, no `Math.random`, save schema v4. The engine
  boundary test scans its source for forbidden imports.
- The repo is an npm-workspaces monorepo (`engine-core`, `web`, `sim`) with strict TypeScript
  (`tsconfig.base.json`). The engine ships as TypeScript source through workspace resolution.

## Goals / Non-Goals

**Goals:**

- A second host that boots and runs the real game loop in React Native, proving the
  renderer + repository + clock contract is sufficient.
- Offline replay and autosave behavior that matches `web/src/main.ts` closely enough that the
  same engine semantics hold on both hosts.
- A durable `AsyncStorageSaveRepository` that drops into any RN host.
- RN tests that run headlessly in CI (Playwright cannot).

**Non-Goals:**

- Reproducing every `/web` overlay and animation cue, exact visual parity, or pixel art fidelity.
- Navigation between multiple screens, remote persistence, auth, or network calls.
- Any engine change, new engine field, or save-schema bump.

## Decisions

### New workspace: `mobile/` as `@auto-auto-clicker/mobile`

Add `mobile/` to the root `workspaces` array and depend on `@auto-auto-clicker/engine-core: "*"`,
mirroring how `web/` and `sim/` consume it. Flat layout, no new domain nesting. **Alternative:**
put RN code inside `web/` — rejected, because `/web` is deliberately a disposable DOM host and
mixing a second, framework-based host muddies the "one host, one directory" layout the repo
already uses.

### Expo (managed workflow) + React Native + TypeScript

Use the Expo managed workflow (New Architecture default) so the proof runs on a current SDK. The
engine ships as TypeScript source through workspace resolution exactly as it does for `/web`, so
Metro resolves `@auto-auto-clicker/engine-core` to `engine-core/src/index.ts` with no build step.
TypeScript config extends `tsconfig.base.json` for consistent `strict` + `noUncheckedIndexedAccess`.

### Component surface: core loop + key overlays, not full parity

Render with framework primitives only: `View`, `Text`, `Pressable`, `Image`, `ScrollView`,
`Modal`, `SafeAreaView`, `StyleSheet`. A single screen (`App.tsx`) plus component files for HUD,
arena, equipped/bag panels, upgrade controls, the choice overlay, the stall advisory, the
Golden-Event / Stray claim control, the offline summary, and the achievements shelf. The handler
surface is identical to the renderer's:
`onClick` / `onUpgrade` / `onEquip` / `onChoice` / `onClaim`. **Alternative:** React Native
Reanimated / gesture libraries — rejected as unnecessary for a proof and as new dependencies.

### No navigation library

**Assumption:** the proof is a single-screen app; expo-router / React Navigation are not needed.
A navigation dependency would be added only if a later change introduces multiple screens.

### `AsyncStorageSaveRepository`

Implement the engine's `SaveRepository` against `@react-native-async-storage/async-storage`.
`load()` reads `DEFAULT_SAVE_KEY`, `JSON.parse`s, and resolves `null` on missing/corrupt data
(mirroring `LocalStorageSaveRepository`); `save()` writes `JSON.stringify(save)` under the same
key. The engine interface is `Promise`-based, so no engine edit is required. **Alternative:**
write a new RN-only repository with a different shape — rejected; it would not prove the seam.

### Host clock: interval-driven fixed steps, not `requestAnimationFrame`

Drive the loop from a `setInterval` ticker and measure wall-clock deltas with `Date.now()`. RN
does provide `requestAnimationFrame`, but it is coupled to the render/animation pipeline and is
throttled in ways this host does not need; an interval is deterministic, easy to fake in tests,
and lets the host cap catch-up identically to `/web`. Differences from `/web`: `AppState`
replaces `visibilitychange`/`pagehide` — on a transition away from `active` the host flushes the
save and resets its accumulator/anchor; on return it restarts from a fresh `lastTickAt` so hidden
time is not treated as a giant catch-up. Cold-boot offline replay is the only path that credits
away time, matching the web host.

### Offline replay parity with `web/src/main.ts`

Reuse the same algorithm: `OFFLINE_STEP_MS = 1000`, `OFFLINE_CAP_MS = 8 h`, loop
`advance(next, min(OFFLINE_STEP_MS, remaining))` while `remaining > 0` and no choice is pending,
break if `advance` returns the same state, accumulate `simulatedMs` and `goldEarned`, and
discard `events` entirely. The offline summary shape is the same (`elapsedMs`, `simulatedMs`,
`goldEarned`, `capped`).

### Palette → RN mapping

A pure `paletteToStyles(theme)` module maps the theme's 19 semantic tokens to a plain style
object (background, text, borders, accent, HP bar colours). The palette values are CSS colour
strings, which RN accepts (`#rgb`/`#rrggbb`/`#rrggbbaa`/`rgb()`/`rgba()`/`hsl()`/`hsla()`), so no
parsing or colour library is needed. The mapping is the RN analogue of `web/src/palette.ts`, and
like it contains no colour values. **Assumption:** `color-mix()`-style derived surfaces used by
the stylesheet are replaced with flat token colours (plus RN opacity where needed); this is a
visual simplification, not a behavior change.

### RN test approach: Jest + React Native Testing Library

Use the `jest-expo` preset with `@testing-library/react-native`, because Playwright cannot drive
a native RN runtime. Tests target observable host behavior with fakes:
`AsyncStorageSaveRepository` against the official AsyncStorage mock; boot hydration with a fake
in-memory `SaveRepository` (valid save, `null`, corrupt blob); offline replay (events discarded,
stops at a pending choice, cap applied); action dispatch (a tap results in `applyAction`, and a
no-op result does not re-render); and theme rendering (copy read from `ACTIVE_THEME`). The pure
offline/loop helpers are extracted into plain modules so they can be unit-tested without a
renderer.

### Keep host policy in small, explicit modules

Following the project's flat, explicit style, separate: `saveRepository.ts` (AsyncStorage
adapter), `storage.ts` (load/hydrate/persist/offline helpers), `offline.ts` (pure replay), and
`useGameHost.ts` (React hook owning state, clock, dispatch, autosave). The hook holds no rules
or balance numbers, matching `/web`'s main.ts.

## Assumptions

- Single-screen proof: no navigation library, no multi-screen router.
- No new engine exports are needed; the existing public API (`engine-core/src/index.ts` plus the
  `./save` subpath) is sufficient.
- **To be confirmed at implementation:** the assumed target versions are Expo SDK 57, React
  Native 0.86, and React 19.2.3. These cannot be verified from this repository, so they are
  pinned/confirmed via `npx expo install --fix` at implementation time.
- The 32 placeholder PNGs under `/web/public/themes/<name>/` are not copied into `mobile/`;
  the RN host renders the declared asset slots with a clear placeholder strategy (see Risks)
  rather than claiming art parity.
- RN tests are the CI gate for this host; there is no mobile equivalent of the Playwright smoke
  suite in this change.

## Risks / Trade-offs

- **[Metro cannot resolve the engine's source-only workspace export]** → Confirm the workspace
  symlink resolves `engine-core/src/index.ts`; if Metro's resolver needs help, add a bare
  `metro.config.js` watchFolders entry rather than changing the engine.
- **[RN has no `/themes/<name>/` static route]** → Resolve asset slots through a small
  theme-asset module that maps slot names to bundled images (or placeholder `View`s); do not
  hard-code file names outside the theme's `assets` map.
- **[Interval drift / backgrounded timers]** → Cap catch-up per tick and flush on `AppState`
  change; cold-boot offline replay uses `savedAt`, so drift is bounded.
- **[`color-mix()` surfaces have no RN equivalent]** → Substitute flat palette tokens; visual
  only, and `fantasy` (dark) remains legible.
- **[AsyncStorage mock gaps in Jest]** → Use the library's official mock and the `jest-expo`
  preset; keep storage behind the `SaveRepository` interface so tests can inject fakes.
- **[Scope creep toward full parity]** → Non-Goals bound this change; RN tests assert the host
  contract, not every `/web` overlay.

## Migration Plan

1. Scaffold the `mobile/` workspace and add it to root `workspaces`/scripts; install deps and
   confirm it typechecks.
2. Add `AsyncStorageSaveRepository` and storage/offline helpers with unit tests.
3. Add the `useGameHost` loop (fixed steps, bounded catch-up, autosave, `AppState`).
4. Port the RN components and wire the handler surface.
5. Add theme→RN style mapping and asset resolution.
6. Add RN component tests; update `README.md`.

Rollback: the change is additive. Removing `mobile/` from `workspaces` and deleting the directory
reverts the repo with no impact on `engine-core`, `/web`, or `/sim`.

## Open Questions

- Whether a future change should copy the 32 placeholder PNGs into `mobile/assets` (or bundle
  real art) for visual parity — deferrable; this change resolves slots through the theme without
  claiming art parity.
