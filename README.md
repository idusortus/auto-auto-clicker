# auto-auto-clicker

> An idle clicker with all simulation/economy logic isolated in a platform-agnostic, headlessly testable engine.

## Quickstart

```bash
npm install
npm run dev        # start the web app (Vite)
npm run typecheck  # typecheck engine-core + web
npm run test       # run engine-core unit tests (vitest)
npm run sim        # run the headless pacing simulation
npm run smoke      # Playwright mobile-viewport smoke test
```

## Architecture

npm-workspaces monorepo with three packages:

- `engine-core` — pure TypeScript, zero DOM/RN/network imports. Exports a pure
  tick-based simulation (`state in → state + events out`) plus the save
  repository abstraction at `engine-core/save`.
- `web` — disposable Vite + TypeScript + vanilla-DOM renderer. Imports
  `engine-core`; holds no rules, no balance numbers, no state mutation.
- `sim` — headless script that runs the tick loop and asserts the pacing targets.

_Details filled in during later phases._

## engine-core API

The engine is pure and deterministic: functions never mutate their input, and
there are no clocks, `Math.random`, or I/O inside the simulation. Same inputs
always produce the same outputs.

```ts
import {
  createGame, advance, applyAction,
  getEffectiveStats, getProjectedKillMs, getUpgradeCost,
  saveGame, loadGame,
  LocalStorageSaveRepository,
} from '@auto-auto-clicker/engine-core';

// 1. Create a game (seed + createdAt default to 12345 / 0 for determinism).
let state = createGame();

// 2. Drive time. `advance` returns a NEW state plus emitted events.
const tick = advance(state, 1000);          // 1000 ms of auto damage
state = tick.state;

// 3. Handle player input. Also returns { state, events }.
state = applyAction(state, { type: 'click' }).state;

// 4. Derived reads.
getEffectiveStats(state);      // { autoDps, clickDamage }
getProjectedKillMs(state);     // ms to kill the live enemy, or null
getUpgradeCost(state, 'weapon');

// 5. Persist. The repository is async so a remote adapter can drop in later.
const repo = new LocalStorageSaveRepository();
await repo.save(saveGame(state));
const restored = loadGame((await repo.load())!);
```

When `state.choices.pending` is set, the world is frozen: `advance` is a no-op
until the host resolves the choice with
`applyAction(state, { type: 'resolveChoice', choice: 'wait' | 'watchAd' | 'iap' })`.

All balance numbers and pacing thresholds live in
`engine-core/src/balance.ts` — the only file to touch when tuning.

## Tech Stack

- TypeScript (strict, `noUncheckedIndexedAccess`, ES2022)
- npm workspaces (`engine-core`, `web`, `sim`)
- Vitest for engine-core unit tests
- Vite + vanilla DOM for the web renderer (later phases)
- No runtime dependencies in `engine-core`; local persistence via an async
  `SaveRepository`, structured for an eventual Supabase adapter.

## Porting to Expo

_Placeholder — this section will describe what `engine-core` assumes about its
host (nothing) and what a React Native layer must supply (a renderer and a
`SaveRepository` implementation)._
