# Architectural Decisions

> One entry per locked-in choice. Reverse chronological. Concise — not an ADR template.

## Format

    ## YYYY-MM-DD — <decision title>
    **Context:** Why we needed to decide.
    **Choice:** What we chose.
    **Trade-offs:** What we gave up.
    **Revisit:** Trigger that would re-open this decision (or "never").

---

## 2026-09-25 — engine-core is consumed as TypeScript source via `exports`
**Context:** Phase 1 needs the three workspaces to install and typecheck, and web/sim must import `engine-core` without a build step. A source-consumed workspace package still has to resolve under `moduleResolution: Bundler`.
**Choice:** `engine-core/package.json` maps `"exports"` to `./src/index.ts` (root) and `./save/index.ts` (subpath), each with a `"types"` condition first, plus matching `"main"`/`"types"` fields. The `build` script is `tsc --noEmit` (typecheck-only; no emitted JS for this prototype). `web/src/main.ts` carries a side-effect `import "@auto-auto-clicker/engine-core"` in Phase 1 so `npm run typecheck` actually exercises cross-workspace resolution instead of trivially passing.
**Trade-offs:** Consumers must be bundler/transpiler-based (Vite, tsx) since `node` cannot execute the `.ts` entry directly. Acceptable: both hosts are bundlers and the build step is intentionally absent for the prototype.
**Revisit:** If engine-core needs to be published or consumed by plain Node, add a real emit build and point `exports` at `dist/`.

## 2026-09-25 — Monorepo layout and workspaces
**Context:** Greenfield project with three distinct deliverables (pure engine, web renderer, headless sim).  
**Choice:** Use npm workspaces with packages `engine-core`, `web`, and `sim`. Shared TypeScript base config at repo root; each workspace owns its `package.json` and entry points.  
**Trade-offs:** Adds a small root scaffolding step, but keeps the engine package independently publishable/testable and avoids relative-path import hacks.  
**Revisit:** If the project grows a backend or a fourth host (Expo), re-evaluate whether pnpm/turborepo is justified.

## 2026-09-25 — engine-core pure tick API
**Context:** The engine must be platform-agnostic, testable headlessly, and driveable by any host (web, RN, sim).  
**Choice:** Export pure functions `advance(state, deltaMs)` and `applyAction(state, action)`. `advance` owns time-based simulation only; `applyAction` owns explicit player commands. Content/balance catalog lives inside `engine-core` as module-level constants, not inside save state. Hosts drive `advance` and split offline time into bounded fixed-size steps themselves.  
**Trade-offs:** Hosts must implement the loop and offline chunking; renderer cannot directly mutate state.  
**Revisit:** Never for this project; changing this would break the platform-agnostic goal.

## 2026-09-25 — Save-state shape and repository abstraction
**Context:** Saves start local (localStorage) but must migrate to Supabase jsonb later without engine changes.  
**Choice:** Save is a versioned `SaveGame` blob: `{ version, savedAt, state }`. Content definitions (`GearDefinition`, `EnemyDefinition`) are kept separate from per-player `GameState`. `engine-core/save` exports a `SaveRepository` interface plus a `LocalStorageSaveRepository` implementation that reads `globalThis.localStorage`. A future `SupabaseSaveRepository` will implement the same interface in the host layer.  
**Trade-offs:** Engine gains a browser-global dependency in one adapter file, but no DOM/React imports and no network code. Save blob must be migrated on version changes.  
**Revisit:** Only when changing the save schema version.

## 2026-09-25 — Determinism and numeric precision
**Context:** Headless sim must be reproducible and offline progress must not drift.  
**Choice:** All combat/economy numbers are integers. Auto-damage is calculated as `floor((dps * deltaMs + carry) / 1000)` with a per-state damage carry (0–999). RNG is a seeded mulberry32 whose state is stored in `GameState.meta.rngState`.  
**Trade-offs:** Formulas use `Math.pow` then `Math.floor`; results could differ by 1 across JS engines near integer boundaries, mitigated by floor and conservative tolerances.  
**Revisit:** If porting to a host with a very different JS engine (e.g., old Hermes), re-test integer boundaries.

## 2026-09-25 — Pacing thresholds and economy baseline
**Context:** Pacing must be provable by headless sim, not manual play.  
**Choice:** Soft boss check = first `BossCheckFailed` event (projected boss kill > 60 s). Hard progression wall = first `ProgressionWall` event (projected kill > 600 s). Baseline balance constants are defined in `/engine-core/src/balance.ts` (e.g., `hpGrowth = 1.5`, `weaponLevelExp = 1.4`, `upgradeStatMultiplier = 1.18`).  
**Trade-offs:** Targets are sensitive to these constants; sim will validate and expose tuning knobs.  
**Revisit:** After sim results; only constants change, not the schema or API.

## 2026-09-25 — Web renderer stack
**Context:** Renderer is disposable; the permanent artifact is engine-core.  
**Choice:** Web uses Vite + TypeScript + vanilla DOM. It holds zero balance numbers, drop tables, or state mutation; it only calls `engine-core` functions and renders returned state/events.  
**Trade-offs:** No component framework means slightly more manual DOM, but zero framework dependency and a thin boundary.  
**Revisit:** If the Expo port wants to reuse web code, migrate to a framework; not needed now.

## 2026-09-25 — All tuning constants live in `balance.ts`, re-exported by `index.ts`
**Context:** The public constants (`BOSS_TIMER_MS`, `HARD_WALL_PROJECTED_KILL_MS`, `ACTIVE_CLICKS_PER_SECOND`, `CURRENT_SAVE_VERSION`, `BAG_CAP`) are read by sim code that also imports the economy formulas. Defining them in `index.ts` would create import cycles (`advance` → `index` → `advance`).
**Choice:** Define every constant and formula in `src/balance.ts`, then re-export the constants from `src/index.ts`. Consumers see the exact same names and values; there is still exactly one file to tune.
**Trade-offs:** `index.ts` contains re-exports rather than literal `const` declarations, so a reader must follow the re-export to find a value.
**Revisit:** Never; adding a second tuner file would defeat the single-knob design.

## 2026-09-25 — Tick/choice edge semantics for `advance` and `resolveChoice`
**Context:** The brief specifies multi-enemy ticks and three choice outcomes but leaves ordering ambiguous.
**Choice:** In one tick, integer auto-damage is consumed sequentially across enemies (kill, spawn next, continue with the remainder); leftover damage is discarded when a pending choice blocks progression. `resolveChoice('iap')` clears the original pending choice, then performs a real kill whose own stage-entry checks may raise a fresh pending choice for the next stage; `'wait'`/`'watchAd'` only grant gold and never re-run stage-entry checks in the same call.
**Trade-offs:** A single enormous `deltaMs` can traverse many stages and emit many events; overkill past the final kill in a tick is lost rather than banked.
**Revisit:** Only if the sim shows banking overkill is needed for pacing accuracy.

## 2026-09-25 — Async `SaveRepository` + structural localStorage adapter
**Context:** Saves start local but must later move to Supabase; engine-core's tsconfig has no DOM lib.
**Choice:** `SaveRepository` is `Promise`-based (`load(): Promise<SaveGame | null>`, `save(): Promise<void>`). `LocalStorageSaveRepository` declares a minimal structural `StorageLike` interface and reads `(globalThis as { localStorage?: StorageLike }).localStorage`; when absent, `load()` resolves null and `save()` rejects with a clear error. `saveGame`/`loadGame` (with version check) live in `src/state.ts`. `@types/node` is an engine-core devDependency, used only by the fs-based boundary test.
**Trade-offs:** No `clear()` method yet (not required this phase); the async surface costs an `await` even for localStorage.
**Revisit:** When the Supabase adapter lands, revisit whether `clear()` and conflict/version metadata belong on the interface.
