# Tasks

## 1. Scaffold the Expo workspace

- [x] 1.1 Create `mobile/` with an Expo SDK 57 app (`package.json` name `@auto-auto-clicker/mobile`, `app.json`/`app.config`, `tsconfig.json` extending `tsconfig.base.json`, `babel.config.js`, `index.ts` entry, `App.tsx`) and verify `npm install` succeeds from the repo root
- [x] 1.2 Add `mobile` to the root `package.json` `workspaces` array plus root scripts (e.g. `mobile:start`, `mobile:test`, `mobile:typecheck`) and verify `npm run typecheck -w mobile` runs (allow the empty app to typecheck)
- [x] 1.3 Add `@auto-auto-clicker/engine-core: "*"`, `expo`, `react`, `react-native`, `@react-native-async-storage/async-storage`, and dev deps `jest-expo`, `@testing-library/react-native`, `typescript`, and verify a smoke import of `advance`/`createGame` from `@auto-auto-clicker/engine-core` resolves through Metro/TypeScript

## 2. AsyncStorage SaveRepository adapter

- [x] 2.1 Implement `mobile/src/saveRepository.ts` exporting `AsyncStorageSaveRepository implements SaveRepository` using `DEFAULT_SAVE_KEY`, resolving `null` on missing/corrupt data, and verify a unit test round-trips save/load against the official AsyncStorage mock
- [x] 2.2 Verify `AsyncStorageSaveRepository` satisfies the engine's `SaveRepository` type (`load`/`save` Promise signatures) with no edit to `engine-core/save/`
- [x] 2.3 Implement `mobile/src/storage.ts` with `loadSave`, `persistState` (via `saveGame`), `hydrate` (via `loadGame`), and `offlineElapsedMs` capped at 8 h, and verify unit tests cover the null, valid, and capped cases

## 3. Host clock, loop, and offline replay

- [x] 3.1 Implement `mobile/src/offline.ts` as a pure `replayOffline(state, elapsedMs)` using 1000 ms steps, stopping at a pending choice, breaking on an unchanged state, discarding events, and returning `{ state, simulatedMs, goldEarned }`; verify unit tests assert events are discarded and replay stops at a pending choice
- [x] 3.2 Implement `useGameHost` in `mobile/src/useGameHost.ts` booting with `prepareGame`-equivalent logic (hydrate + offline replay + fresh-game fallback) and verify a test boots from a fake seeded repository and from `null`
- [x] 3.3 Implement the live loop (fixed 100 ms `advance` steps, `MAX_CATCHUP_STEPS` bound, backlog drop, freeze while a choice is pending) using an interval ticker with `Date.now()` deltas, and verify tests with fake timers advance only whole steps and freeze on a pending choice
- [x] 3.4 Implement autosave (5 s cadence, no overlapping saves, immediate save of a fresh game) and `AppState`-driven flush/resume, and verify tests assert a save fires on cadence and on leaving the active state

## 4. RN renderer and handler wiring

- [x] 4.1 Implement the RN component surface (`View`/`Text`/`Pressable`/`Image`/`ScrollView`/`Modal`): HUD, tappable enemy + HP bar, equipped and bag panels, four per-slot upgrade controls, and verify the components render the current `GameState` with no local gameplay state
- [x] 4.2 Wire the handler surface (`onClick`/`onUpgrade`/`onEquip`/`onChoice`/`onClaim`) to `useGameHost`'s dispatch so every handler applies its engine `Action` via `applyAction` and a returned same-state result skips re-render; verify tests assert one tap is exactly one `applyAction` call
- [x] 4.3 Implement the pending-choice overlay, the offline summary, and the achievements shelf (copy from `ACTIVE_THEME`) and verify overlay visibility and summary text tests pass
- [x] 4.4 Implement the in-memory `stageBeganAtMs` anchor (recorded when `combat.stage` changes, passed to the stall advisory, never persisted) and verify a test asserts it is not included in the persisted save

## 5. Theme mapping and asset resolution

- [x] 5.1 Implement `mobile/src/theme.ts` mapping the active theme's 19 palette tokens to RN style objects and resolving asset slots from `theme.name` + `theme.assets`, with no hard-coded colours or file names; verify a test asserts a token change alters the produced style
- [x] 5.2 Verify every user-facing string in the RN components is read from `ACTIVE_THEME` (no hard-coded copy) and that swapping `ACTIVE_THEME` requires no component edit

## 6. RN tests

- [x] 6.1 Configure `jest-expo` + `@testing-library/react-native` in `mobile/` and verify `npm run test -w mobile` runs the suite
- [x] 6.2 Add host tests covering boot hydration (valid/null/corrupt), offline replay (cap, pending-choice stop, events discarded, no clicks), action dispatch (each action type, no-op skip), and autosave/AppState flush; verify all pass
- [x] 6.3 Add component tests verifying handler wiring and theme-driven rendering; verify all pass

## 7. Docs

- [x] 7.1 Add a "Second host: Expo / React Native" section to `README.md` describing the workspace, how to run it, and the two-things-plus-a-clock contract it proves; verify the documented commands match `mobile/package.json` scripts

## 8. Verification

- [x] 8.1 Prove `engine-core` is untouched by running `git diff --stat engine-core` and confirming it reports no changes, and confirm the save schema remains v4 via the existing engine save tests
- [x] 8.2 Confirm the existing gates still pass on the unchanged workspaces: `npm run typecheck`, `npm run test`, `npm run sim` (must print `PACING OK`), `npm run smoke`, and `npm run build`
- [x] 8.3 Run `npm run test -w mobile && npm run typecheck -w mobile` and confirm both are clean
- [x] 8.4 Run `openspec validate expo-transition` and confirm it reports no issues
