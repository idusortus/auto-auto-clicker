# auto-auto-clicker

> A browser-playable idle clicker — defeat enemies → collect gear drops → upgrade your
> weapon → pass periodic boss checks, with no real-time-skill combat — where **all
> simulation and economy logic lives in a standalone, platform-agnostic TypeScript
> engine** (`engine-core`) that has no idea it is running in a browser.

The engine is the permanent artifact. The web UI is disposable. The project's whole
point is the seam between them: `engine-core` is pure, headlessly testable, and ready to
be lifted into a React Native / Expo app later by supplying a new renderer and a new
`SaveRepository` — nothing else.

---

## Quickstart

```bash
npm install          # npm workspaces install (developed on Node 24; Chromium already cached — see below)
npm run dev          # play at http://localhost:5173  (Vite dev server)
npm run test         # engine-core unit tests (Vitest)
npm run sim          # headless pacing proof; fails loudly if pacing drifts
npm run smoke        # Playwright mobile-viewport smoke test (390x844, touch)
npm run build        # engine-core typecheck + production web bundle
npm run typecheck    # typecheck all three workspaces (engine-core + web + sim)
```

- **Dev URL:** <http://localhost:5173> (Vite's default port; the smoke test pins it with
  `--strictPort`). The page is `web/index.html` → `web/src/main.ts`.
- **`npm run test`** runs the engine unit suite only. It is intentionally headless — no
  DOM, no browser.
- **`npm run sim`** is the pacing *proof*, not a demo: it exits non-zero if the pacing
  target is not met. See [Pacing proof](#pacing-proof).
- **`npm run smoke`** launches real mobile-emulated Chromium against the real Vite dev
  server. Playwright's Chromium build (**v1243**) is already present in
  `~/.cache/ms-playwright`, so no browser download is needed on this machine. On a fresh
  machine, run `npx playwright install chromium` once.
- **`npm run build`** runs `engine-core`'s `tsc --noEmit` (typecheck-only — the engine is
  shipped as TypeScript *source* through workspace resolution) followed by `vite build`
  for `/web` (output in `web/dist/`).

### How to play

Tap the enemy to deal click damage (the weapon's `clickDamage`); auto-DPS ticks in the
background. Kills grant gold and can drop a weapon into the bag — **equip** it, then
spend gold to **upgrade** it. Every 10th stage is a boss; if the projected time-to-kill
is too slow, or if a stage becomes a progression wall, a choice appears. The free
`wait` path always works (it grants gold equal to a fixed number of upgrade levels);
the "watch ad" and "buy" options are visible but disabled placeholders in this build.

---

## Repo layout

```
auto-auto-clicker/
├── package.json                 # npm workspaces + root scripts (dev/test/sim/smoke/build/typecheck)
├── tsconfig.base.json           # shared strict TS config (strict, noUncheckedIndexedAccess, ES2022)
├── PROJECT.md                   # long-form vision
├── STATE.md                     # current status / blockers / next
├── decisions.md                 # locked architectural decisions (reverse chronological)
├── NOTES.md                     # parking lot: out-of-scope ideas, honest build notes
├── histories/                   # per-agent accumulated memory
│
├── engine-core/                 # ▶ PERMANENT ARTIFACT — pure simulation, zero runtime deps
│   ├── src/
│   │   ├── index.ts             # public API surface (the only entry hosts should import)
│   │   ├── types.ts             # GameState, Action, GameEvent, SaveGame, content definitions
│   │   ├── balance.ts           # every gameplay number + economy formula (the one tuner file)
│   │   ├── content.ts           # GearDefinition / EnemyDefinition catalog (never persisted)
│   │   ├── state.ts             # createGame / cloneGameState / derived reads / saveGame / loadGame
│   │   ├── advance.ts           # advance(state, deltaMs) — time-based simulation
│   │   ├── actions.ts           # applyAction(state, action) — explicit player commands
│   │   ├── combat.ts            # damage, kills, stage entry, boss/wall pacing checks
│   │   ├── loot.ts              # deterministic, bounded gear drops
│   │   └── rng.ts               # seeded mulberry32 (state lives in GameState.meta.rngState)
│   ├── save/
│   │   ├── index.ts             # ./save subpath export
│   │   ├── repository.ts        # async SaveRepository interface
│   │   └── localStorage.ts      # LocalStorageSaveRepository (structural globalThis read)
│   └── tests/                   # Vitest: rules + purity + boundary + save round-trip
│
├── web/                         # ▶ DISPOSABLE browser host (Vite + vanilla DOM, no framework)
│   ├── index.html
│   ├── public/style.css
│   ├── src/
│   │   ├── main.ts              # owns the clock, fixed 100 ms loop, autosave, action dispatch
│   │   ├── renderer.ts          # pure projection of GameState → DOM; forwards input, never dispatches
│   │   └── storage.ts           # the only module touching SaveRepository / the save clock
│   ├── tests/smoke.spec.ts      # Playwright mobile smoke test
│   ├── playwright.config.ts     # 390x844 / touch / DPR 3, boots the real dev server on 5173
│   └── vite.config.ts
│
└── sim/                         # ▶ headless pacing harness (no rendering, no UI)
    └── src/sim.ts               # `npm run sim` — deterministic fixed-step sweep + hard assertions
```

---

## Architecture

Three npm workspaces with a strict one-way dependency direction:

```
        sim ─────────┐
                     ▼
        web ───► engine-core
                     │
        (never the reverse: engine-core imports nothing from sim or web)
```

- **`engine-core`** — pure TypeScript. Its public entry is `engine-core/src/index.ts`
  (plus the `engine-core/save` subpath). It exports a tick-based simulation (`state in →
  state + events out`), derived getters, and the persistence abstraction.
- **`web`** — a thin Vite + TypeScript + vanilla-DOM host. It imports `engine-core` and
  contains **no rules, no balance numbers, no drop tables, and no direct state
  mutation**. It only calls `advance` / `applyAction` and renders the returned state and
  events. Every displayed value comes from engine-core state or an exported getter.
- **`sim`** — a headless script that drives the same pure engine and asserts the pacing
  targets. No DOM, no rendering.

### engine-core purity contract

`engine-core` holds itself to a rule that is enforced by its test suite
(`engine-core/tests/boundary.test.ts` scans the source with `node:fs`):

- **No DOM, React, React Native, or network imports.** No `document`, `window`, `fetch`,
  `WebSocket`, etc.
- **No clock and no RNG reads inside `advance` / `applyAction`.** There is no `Date.now()`
  and no `Math.random()` anywhere in the engine. Randomness is a seeded mulberry32 whose
  state travels inside `GameState.meta.rngState`, so the same input always produces the
  same output.
- **No mutation of inputs.** `advance(state, …)` and `applyAction(state, …)` clone before
  mutating and return a new state; invalid or unaffordable actions return the *same*
  object with an empty event list (which is also the host's render-skip guard).
- **No persistence.** The engine knows only the `SaveRepository` interface. The concrete
  adapter (`LocalStorageSaveRepository`) lives in `engine-core/save`, reads storage
  *structurally* through `globalThis`, and does not pull the DOM lib into the engine's
  config.

---

## The simulation contract

The engine exposes exactly two pure entry points:

```ts
advance(state: GameState, deltaMs: number): { state: GameState; events: GameEvent[] }
applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] }
```

- **`advance` owns time-based simulation.** It applies auto-DPS for `deltaMs`, carries
  fractional damage, resolves kills, spawns enemies, and runs stage-entry pacing checks.
  It has no notion of a "tick size" itself.
- **`applyAction` owns explicit player commands** (`click`, `equip`,
  `upgradeEquipped`, `resolveChoice`).
- **No timers live inside `engine-core`.** The engine never schedules anything; it is a
  pure function of state.
- **Hosts own the clock and drive fixed 100 ms steps.** `web/src/main.ts` accumulates
  `requestAnimationFrame` deltas and calls `advance(state, 100)` while a whole step is
  available (with a 10-step catch-up clamp so a backgrounded tab cannot spiral). The sim
  harness drives the identical 100 ms step so its pacing matches live play.
- **Offline progress is credited by replaying elapsed milliseconds through the *same*
  `advance()`**, in bounded fixed steps, rather than granting a special reward. The web
  host replays in 1000 ms steps (`OFFLINE_STEP_MS`) capped at 8 h (`OFFLINE_CAP_MS`),
  stopping immediately if a choice is pending (the engine freezes the world until the
  player resolves it).
- **The offline assumption is auto-DPS only — no simulated clicks.** A returning player
  therefore earns strictly less than they would have by actively tapping. That is a
  deliberate host policy, not an engine rule.
- **When a choice is pending, `advance` is a no-op** (`{ state, events: [] }` — no time
  passes, no damage is dealt) until the host resolves it with
  `applyAction(state, { type: 'resolveChoice', choice: 'wait' | 'watchAd' | 'iap' })`.

---

## Save model

Persistence is one versioned, serializable blob written through an async interface:

```ts
interface SaveGame {
  version: number;   // CURRENT_SAVE_VERSION = 1
  savedAt: number;   // host wall-clock ms when written (used for offline replay)
  state: GameState;  // the entire per-player state
}

interface SaveRepository {
  load(): Promise<SaveGame | null>;
  save(save: SaveGame): Promise<void>;
}
```

- **Content definitions (`GearDefinition`, `EnemyDefinition`) are kept separate from
  per-player save state.** They describe the game catalog and are never persisted — only
  `GameState` is saved. (`GameState.meta.seed` and `meta.rngState` are persisted so a
  reload continues the exact deterministic stream.)
- **The blob is one serializable object.** Today it is written to `localStorage` under
  `auto-auto-clicker.save.v1` by `LocalStorageSaveRepository`; `JSON.parse` failures and
  unsupported versions fall back to a fresh game rather than crashing the boot.
- **The `SaveRepository` interface is deliberately `Promise`-based** so a future
  `SupabaseSaveRepository` (a `jsonb` row per player) drops into the host **without
  touching `engine-core`**. The engine only ever depends on the interface, never on
  storage, network, or auth. There is intentionally no backend, auth, or network code in
  this build.

---

## Pacing proof

The pacing target is proven automatically, never by manual playtesting. The design
targets are:

| Milestone | Meaning | Target |
| --- | --- | --- |
| **Soft boss check** | first boss whose projected time-to-kill exceeds the boss timer | ≈ **6 min** of active play (±20%) |
| **Hard progression wall** | first stage whose projected time-to-kill exceeds the wall threshold | ≈ **54 min** of active play (±20%) |

`npm run sim` asserts this. It drives the engine with:

- a **fixed 100 ms step** (the same step the web host uses);
- a **greedy, deterministic active-play policy**: upgrade the equipped weapon while
  affordable, then equip a bag weapon only when it *strictly raises total active DPS*;
- **2 clicks/second** (`ACTIVE_CLICKS_PER_SECOND`);
- resolution of every pending choice on the **free `wait` path**;
- a **5-seed hard assertion** — `SWEEP_SEEDS = [12345, 1, 999, 424242, 20250925]`. Every
  seed must pass every target; the process exits `1` and prints the deltas if any seed
  misses. This is a **determinism/regression guard**, not a robustness probe: the power
  core is deterministic, so all seeds produce identical times. Loot does not influence
  pacing, so the sweep is **not** a loot-robustness check.

Current observed result (all five seeds identical):

```
soft 6.00 min target ±20% → actual 5.92 min (delta -1.3%)  [PASS]   stage 30
hard 54.00 min target ±20% → actual 52.23 min (delta -3.3%)  [PASS]  stage 60
PACING OK
```

The engine also emits the raw milestone snapshot:

```
soft check   t=5.92min  stage=30  autoDps=4032        clickDamage=16125
hard wall    t=52.23min stage=60  autoDps=30162075    clickDamage=120648295
```

The reason the result is stable across seeds is structural, not luck: player power is
dominated by the **deterministic gold-funded upgrade curve** (≈1.29×/stage) while enemy
HP grows faster (1.45×/stage), so the fall-behind is designed in. After the guaranteed
starter weapon, gear drops **do not contribute to player power**: dropped item level
trails the killed stage by 6 (`dropChance` 0.08, `DROP_LEVEL_OFFSET` 6, first weapon
guaranteed), so an informed player never equips a later drop over the upgraded starter.
Free-path choices grant a fixed number of upgrade levels rather than stage-scaled gold.
See `engine-core/src/balance.ts`.

---

## Known trade-offs / limitations

This is a prototype, and the honest edges matter:

- **Pacing is currently identical across all seeds, and gear drops do not drive it.**
  Because the power core is deterministic and drops are bounded, a lucky or unlucky drop
  cannot change the soft/hard timing. Gear drops are therefore **flavour / low-impact**
  right now, not a pacing lever. If you want drops to matter, redesign them **together**
  with the economy in **`engine-core/src/balance.ts`** and **`engine-core/src/loot.ts`**,
  then re-run `npm run sim` (expect all five seeds to move together).
- **`resolveChoice('iap')` advances one stage in the current engine semantics.** It
  sets the current enemy's HP to 0 and runs normal kill resolution, which awards gold,
  rolls a drop, and spawns the next stage (whose stage-entry checks may raise a fresh
  choice). `watchAd` and `iap` are **UI placeholders with no ad or payment SDK** — they
  render disabled ("coming soon") so the free `wait` path is always the working one. The
  engine actions exist; only the host integration is missing.
- **Late-game numerals are large and not abbreviated.** At the hard wall auto-DPS is
  ≈**3e7** (and click damage ≈1.2e8). The HUD prints full integers, so the readout wraps
  at the widest end of the game. Compact notation (1.2K / 3.4M) is not implemented.
- **Offline progress is capped and auto-DPS only.** The web host replays at most 8 h of
  away time in 1000 ms steps with no clicks, and backgrounded-tab time beyond the host's
  10-step catch-up clamp is dropped until the next boot. Both are deliberate host
  policies chosen to avoid catch-up spirals and offline windfalls.
- **One save schema version, with no migration path.** `loadGame` rejects any version
  other than `CURRENT_SAVE_VERSION` (1); there is no `clear()` on `SaveRepository` yet.
  Version 2 will need an explicit migration.
- **A single gear slot and a single enemy definition.** The seams for more exist
  (`GearSlot`, `CONTENT`, `gearDefinitionFor`), but this build ships one weapon type and
  one "grunt" enemy.

---

## Dependency justification

Every dependency, and why it earns its place:

| Dependency | Scope | Justification |
| --- | --- | --- |
| `typescript` | repo root + `web` (dev) | The language/compiler for the whole monorepo; typechecks all three workspaces with `strict` + `noUncheckedIndexedAccess`. |
| `vite` | `web` (dev) | Dev server + production bundler for the disposable browser host; serves the app on port 5173. |
| `vitest` | `engine-core` (dev) | Fast headless unit runner for the pure engine's rules, purity, and boundary tests. |
| `tsx` | `sim` (dev) | Runs the TypeScript pacing harness directly with no build step; transpile-only (it does not typecheck). |
| `@playwright/test` | `web` (dev) | The only dependency that provides real mobile-viewport + touch emulation for the smoke test. |
| `@types/node` | `engine-core` (dev) | Types for `node:fs`, used solely by the boundary test that scans engine-core's source for forbidden imports. |

**`engine-core` has zero runtime dependencies.** The only runtime `dependencies` entry
anywhere is `web`/`sim` depending on the local `@auto-auto-clicker/engine-core`
workspace itself. `@types/node` is a devDependency used by a test, never imported by the
engine's runtime code.

---

## Porting to Expo (React Native)

`engine-core` assumes **nothing** about its host: no DOM, no clock, no storage, no
networking, no rendering. It is pure `(state, action/deltaMs) → (state, events)`. That is
the entire reason it exists as a separate workspace.

Lifting it into React Native requires supplying exactly **two** things plus a clock:

1. **A renderer.** Replace the DOM nodes in `web/src/renderer.ts` with React Native
   components. The **event and state shapes do not change** — you still call
   `advance` / `applyAction` and render the returned `GameState` and `GameEvent[]`. Only
   the primitives differ (`<View>`/`<Pressable>`/`<Text>` instead of
   `document.createElement`). No engine code changes.
2. **A `SaveRepository` implementation.** Write an `AsyncStorageSaveRepository` (or a
   `SupabaseSaveRepository` hitting your backend) that implements the same two async
   methods:

   ```ts
   interface SaveRepository {
     load(): Promise<SaveGame | null>;
     save(save: SaveGame): Promise<void>;
   }
   ```

   Swap it in for `LocalStorageSaveRepository` in the host. Because the interface is
   `Promise`-based from day one, `engine-core` is untouched.

3. **A host clock driving `advance()`.** RN has no `requestAnimationFrame` loop with the
   same ergonomics; use an interval/`requestAnimationFrame` polyfill/animation frame
   callback and drive the same fixed 100 ms `advance(state, 100)` steps. The offline
   calculation then becomes trivial: **on load, pass the elapsed milliseconds to
   `advance()`** in bounded steps (exactly what `web/src/main.ts` already does) — there is
   nothing platform-specific about it.

The browser renderer in `/web` is **disposable**. Treat it as a reference implementation
of the host contract, not as reusable UI: delete it and write RN components against the
same engine API. The engine, its types, its balance file, and its tests all carry over
unchanged.

---

## Tech stack

- **TypeScript** (strict, `noUncheckedIndexedAccess`, ES2022, `moduleResolution: Bundler`)
- **npm workspaces** — `engine-core`, `web`, `sim`
- **Vite + vanilla DOM** for the browser host (no UI framework)
- **Vitest** for engine unit tests · **tsx** for the headless sim · **Playwright** for the
  mobile smoke test
- **Local-only persistence** behind an async `SaveRepository`, shaped for a future
  Supabase adapter. No backend, no auth, no network calls in this phase.

All balance numbers and pacing thresholds live in `engine-core/src/balance.ts` — the
single file to touch when tuning.
