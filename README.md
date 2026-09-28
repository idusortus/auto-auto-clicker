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

Tap the enemy to deal click damage (the weapon's click damage, derived from its item level); auto-DPS ticks in the
background. Kills grant gold and almost always **drop gear whose item level tracks the
killed stage** — equip it: drops are the primary source of power. Gear stats grow
exponentially with item level, so a newer drop is the power jump. Besides the **weapon**
(DPS/click), gear now includes two **ring** slots (critical chance/multiplier) and a rare
**necklace** (gold gain + overall DPS bonus); critical strikes are modelled as an
*expected-DPS* multiplier, so the pacing projection stays exact, and the ring/necklace
totals are **clamped** so those secondary slots cannot out-scale the weapon. Gold is spent as an
**allocation choice**: the Equipped panel offers **one upgrade control per slot** (weapon, both
rings, necklace), each showing its own cost and independently disabled when empty or unaffordable.
An upgrade is still only a small multiplicative smoothing bonus — but every **3rd** upgrade level
in one item crosses a **milestone**, a visible step that grants a small extra boost to that slot's
capped stat (crit for rings, gold for the necklace, overall power for the weapon). A milestone also
announces itself with a brief, non-blocking **flourish** and a `★ ×N` badge on the item's card; the
bonus is *derived* from the upgrade level (nothing new is saved). Progress unlocks ~2 dozen snarky
**achievements** (persisted by id), each
with a brief over-the-top **splash** (non-blocking — it never pauses the simulation; tap to
dismiss early) and an **achievements shelf** showing unlocked vs `???` entries. Occasionally a
**Stray Goblin** (a "Golden Event") wanders across the arena carrying something shiny — tap it
within its short window for one of **three** bonus rewards: a short/rare **FRENZY** damage
multiplier (a visibly faster burst), a guaranteed **ring drop** at your current stage into your
weaker ring slot, or a lump of **gold**. Missing it costs *nothing* — it simply leaves with a
snarky toast. Every 10th stage
is a boss; if the projected time-to-kill is too slow, or if a stage becomes a progression wall, a
choice appears. The free `wait` path always works (it grants gold equal to a fixed number of
upgrade levels); the "watch ad" and "buy" options are visible but disabled placeholders in
this build.

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
│   │   ├── achievements.ts      # static achievement catalog + pure evaluator (never persisted)
│   │   ├── gear-stats.ts        # leaf: getGearStats / getCritStats / getGlobalBonuses (derived gear reads)
│   │   ├── state.ts             # createGame / cloneGameState / derived reads / saveGame / loadGame
│   │   ├── advance.ts           # advance(state, deltaMs) — time-based simulation
│   │   ├── actions.ts           # applyAction(state, action) — explicit player commands
│   │   ├── combat.ts            # damage, kills, stage entry, boss/wall pacing checks
│   │   ├── loot.ts              # frequent gear drops; item level tracks the killed stage
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
    └── src/sim.ts               # `npm run sim` — fixed-step sweep, hard assertions, power attribution
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
  version: number;   // CURRENT_SAVE_VERSION = 4
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
- **Version 4 persists source fields only; every derived value is computed on read.**
  `GameState` stores `player.gold`, `combat.{stage,enemyHp,damageCarry}`, each gear instance as
  `{id, definitionId, itemLevel, upgradeLevel}` under a four-slot `equipped` map
  (`weapon`/`ring1`/`ring2`/`necklace`), the meta (including unlocked achievement **ids**),
  choice bookkeeping, and the Golden-Event block (`event: { active, spawned, nextSpawnAtMs }`
  and a nullable `boost: { dpsMultiplier, expiresAtMs }`). Gear battle stats and effect
  contributions (`getGearStats` — DPS, click damage, crit chance/multiplier, gold/power
  bonuses), the final auto/click stats (`getEffectiveStats` — includes the expected-crit,
  necklace-power, and active frenzy multipliers), the enemy's max HP (`getEnemyMaxHp`), and the
  cache-gold reward (`getShinyCacheGold`) are all derived from those sources plus
  `BALANCE`/`computeGearStats` at read time — they are never persisted. A Shiny `drop` reward adds
  **no** new field: the granted ring is a normal `GearInstance` in `gear.bag`, and the reward kind
  is the existing nullable `ActiveShiny.kind` (now `'frenzy' | 'cache' | 'drop'`, a same-shape
  value the parser validates and unknown kinds still rejected). A balance or
  stat-formula change therefore cannot drift a stale copy on an existing save. The achievement
  catalog itself is static content (`achievements.ts`), not save state.
- **Versions 1–3 are migrated on load.** Version 1 persisted derived copies
  (`player.baseAutoDps`/`baseClickDamage`, `combat.enemyMaxHp`, per-instance
  `dps`/`clickDamage`); version 2 dropped those but predates rings, necklaces, and
  achievements; version 3 predates Golden Events. A single source-field parser behind
  `migrateV1ToV2`/`migrateV2ToV3`/`migrateV3ToV4` drops any derived copies and defaults the new
  fields (`equipped.ring1`/`ring2`/`necklace` to `null`, `meta.achievements` to `[]`, `event` to
  a fresh schedule, `boost` to `null`), so an older blob hydrates as a version-4 state. A
  version-4 blob round-trips as-is. Any other version throws a descriptive error.
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
- a **greedy, deterministic active-play policy**: for **every occupiable slot** (weapon,
  ring1, ring2, necklace) equip the bag item that most raises the player's *total effective
  power*, where the score is built from engine getters only (the shared
  `getEffectiveStats` auto-DPS/click folded with the necklace gold bonus via
  `getGlobalBonuses`) — so rings/necklaces are judged by their real crit/power effect and
  the sim duplicates no balance formula; then spend remaining gold on the affordable **upgrade
  across all four slots** with the largest real power gain (a slot whose upgrade adds nothing —
  e.g. a ring already at the crit cap — scores zero and is skipped, so gold is never dumped into a
  dead lever);
- **2 clicks/second** (`ACTIVE_CLICKS_PER_SECOND`);
- resolution of every pending choice on the **free `wait` path**;
- a **5-seed hard assertion** — `SWEEP_SEEDS = [12345, 1, 999, 424242, 20250925]`. Every
  seed must pass every target; the process exits `1` and prints the deltas if any seed
  misses. Because drops now drive power, this **is a real robustness probe**: drop RNG moves
  the timings, and a high `dropChance` keeps the spread small.
- a **drops-primary gate** (also hard, per seed): the run's power is decomposed exactly in
  log space and the **drop-attributed share of positive *net* log-power growth must exceed
  50%**. The reset loss from each equip is charged to the *gold-funded upgrade power it
  destroys*, not to drops, so the gate cannot be passed by reset accounting.
- a **drop-stream sanity guard** (also hard, per seed): `equips` must keep pace with progress
  (≥ 1 equip per 5 stages cleared), so a run whose attributed drops never actually happened
  cannot pass even if arithmetic alone would clear the share gate.

Current observed result (5 sweep seeds, `npm run sim` → exit 0). Every seed is inside its ±20%
window and the canonical seed is inside its stricter comfortable range:

```
seed     12345: soft 6.18 min st30  hard 49.54 min st50  dNet 98.8%  dGross 87.4%  [DROPS-PRIMARY]
seed         1: soft 6.14 min st30  hard 43.90 min st50  dNet 98.8%  dGross 84.7%  [DROPS-PRIMARY]
seed       999: soft 6.10 min st30  hard 45.88 min st50  dNet 99.6%  dGross 86.2%  [DROPS-PRIMARY]
seed    424242: soft 5.97 min st30  hard 45.45 min st50  dNet 99.6%  dGross 87.4%  [DROPS-PRIMARY]
seed  20250925: soft 5.72 min st30  hard 45.46 min st50  dNet 98.3%  dGross 86.7%  [DROPS-PRIMARY]
soft 6.00 min target ±20% → actual 6.18 min (delta +2.9%)  [PASS]
hard 54.00 min target ±20% → actual 49.54 min (delta -8.3%)  [PASS]
PACING OK
```

Raw milestone snapshot (canonical seed):

```
soft check   t=6.18min  stage=30  autoDps=1701    clickDamage=6801
hard wall    t=49.54min stage=50  autoDps=290984  clickDamage=1163933
```

**Drops are the primary power lever.** Gear stats are **exponential in item level**
(`floor(factor * gearGrowth^(itemLevel - 1))`, `gearGrowth = 1.283`), and `dropChance` is
0.95 with `DROP_LEVEL_OFFSET = 0`, so a killed stage reliably yields a piece of gear whose
item level tracks that stage (`itemLevel = max(1, stage)`). The slot is then drawn from
`SLOT_DROP_WEIGHTS` (weapon 1.0, each ring 0.04, necklace 0.02), and a **weapon is guaranteed
first**: until the player owns one, the slot roll is forced to `weapon`. The weapon weight must
dominate: the weapon is the only *unbounded* exponential power lever, so a heavy ring weight
thins the weapon stream (the equipped weapon lags the stage and the soft check drifts late).
Rings/necklaces are **bounded** secondary levers: their crit/power totals are clamped
(`CRIT_CHANCE_CAP`, `CRIT_MULTIPLIER_CAP`, `POWER_MULTIPLIER_CAP`, `GOLD_MULTIPLIER_CAP`) in the
state getters, so an exponential item remains an exponential *item* without letting the
multiplicative bonus explode. Equipping each new drop is the power jump. Enemy HP grows faster
(`hpGrowth = 1.42` vs player power ≈1.28×/stage)
before the bounded crit/necklace multipliers, so the fall-behind — and therefore the walls — is
designed in. Gold is a **minor smoothing lever**: `upgradeStatMultiplier = 1.05` with steep costs
(`upgradeCostGrowth = 6`) and flat gold (`goldGrowth = 1.0`) means only ≈0.7 upgrade levels are
affordable per equip, and equipping a new drop resets `upgradeLevel` to 0 (cheap next to the
≈28% item-level jump). Free-path choices grant a fixed number of upgrade levels rather than
stage-scaled gold. **Upgrade milestones** add a visible step every `UPGRADE_MILESTONE_INTERVAL`
(**3**) levels in one item: a small boost to that slot's *capped* stat (weapon → power,
rings → crit, necklace → gold). They are **derived from `upgradeLevel` on read** — no new save
field, so the schema stays at version 4 — and they feed the *same* clamped aggregations as ordinary
gear, so they can never exceed a cap. The interval is 3 rather than 5 because costs grow ×6 against
flat gold: measured per-run peaks of an item's `upgradeLevel` are 2–7 across the sweep seeds, so an
interval of 5 would be unreachable content. See `engine-core/src/balance.ts`.

The **power-attribution ledger** in `sim/src/sim.ts` proves the split exactly. The equipped
stat's log is `ln(factor) + (itemLevel − 1)·ln(gearGrowth) + upgradeLevel·ln(upgradeStatMultiplier)`,
so the run decomposes into per-equip `Δ(itemLevel − 1)·ln(gearGrowth)` plus per-upgrade
`+ln(upgradeStatMultiplier)` — computed only from exported engine values. A milestone crossing adds
its (small) log delta to the bounded factor and is charged to **gold**, the lever that bought the
upgrades that earned it. Ring/necklace equips are
**also drops**, so the log delta of the bounded crit/power factor they contribute (`bonus-gross`)
is counted with the weapon's drop gain; only gold-funded upgrade power counts as gold. Each
equip resets the gold-funded `upgradeLevel` to 0, so the upgrade power bought with gold is
destroyed by the swap. Charging that reset loss to the lever it came from
(`goldNet = goldGross − resetLoss`) keeps gold's **net** contribution near zero while drops carry
**≈98–100% of net log-power growth**. The ledger reports both conventions unambiguously: **drops
98.3–99.6% of NET** log-power growth and **≈84.7–87.4% of GROSS** (drops against raw gold purchased).
On the sweep seeds `goldNet` is a small positive `+0.049…+0.202` (a couple of milestones and a few
ring upgrades are not wiped by an equip), and the free `wait` grant is ≈4.5–13.5% — a transient
smoothing contribution, not a net power source.

---

## Known trade-offs / limitations

This is a prototype, and the honest edges matter:

- **Drops-primary means drop RNG affects pacing.** Because gear drops (not a deterministic
  gold curve) carry the power, a lucky or unlucky drop stream moves the soft/hard timings.
  `dropChance = 0.95` keeps the 5-seed spread tight (soft 5.7–6.2 min, hard 43.9–49.5
  min), but sampling variance is real: lowering `dropChance` toward 0.8 blows the soft range
  out (observed 2.33–8.75 min). To reduce variance, raise `dropChance` toward 1.0 — never
  widen the ±20% tolerance or re-neuter drops.
- **Gold is deliberately a small lever.** `goldGrowth = 1.0` makes late-game gold rewards
  flat, and steep upgrade costs mean only a few upgrade levels are ever affordable. Upgrades
  smooth rough edges; they are not a second power curve.
- **Gold is now an *allocation* decision, not a single button.** The Equipped panel renders one
  upgrade control per slot (`upgrade-btn` for the weapon — kept for the smoke test — plus
  `upgrade-btn-ring1`/`ring2`/`necklace`) with a per-slot `upgrade-cost`/`upgrade-level` readout
  and an independent disabled state. Every `UPGRADE_MILESTONE_INTERVAL` = **3** levels in one item
  crosses a **milestone**: the engine emits `{ type: 'milestoneReached', slot, upgradeLevel,
  description }`, and `/web` shows a brief, non-blocking flourish plus a `★ ×N — …` badge on the
  card (the milestone counts are diffed across renders like the achievement shelf, so the renderer
  still receives no event list). The bonus is **derived from `upgradeLevel` on read** — no persisted
  field, schema stays **v4** — and feeds the same clamped aggregations, so it can never bypass
  `CRIT_CHANCE_CAP`/`CRIT_MULTIPLIER_CAP`/`POWER_MULTIPLIER_CAP`/`GOLD_MULTIPLIER_CAP`. Because the
  necklace's power base already saturates `POWER_MULTIPLIER_CAP`, the necklace milestone grants
  **gold only** (no dead power term). A non-weapon upgrade that cannot raise power (e.g. a ring at
  the crit cap) still costs gold — the UI lets the player make that mistake; the sim's policy does
  not (it scores every slot by its real power gain and skips zero-gain upgrades).
  **Gates: `typecheck` 0, `test` 126/126, `sim` PACING OK (exit 0), `build` 0, `smoke` 13/13.**
- **A single low-item-level weapon upgrade may not move the HUD DPS readout.** Integer
  flooring plus a ×1.05 upgrade means a level-1 weapon's first several upgrades leave
  `autoDps` unchanged; the observable power jump now comes from equipping a newer drop.
  No engine change — flooring is intended.
- **`resolveChoice('iap')` advances one stage in the current engine semantics.** It
  sets the current enemy's HP to 0 and runs normal kill resolution, which awards gold,
  rolls a drop, and spawns the next stage (whose stage-entry checks may raise a fresh
  choice). `watchAd` and `iap` are **UI placeholders with no ad or payment SDK** — they
  render disabled ("coming soon") so the free `wait` path is always the working one. The
  engine actions exist; only the host integration is missing.
- **Late-game numerals are large and not abbreviated.** At the hard wall auto-DPS is
  ≈**3.1e5** (and click damage ≈1.2e6). The HUD prints full integers, so the readout wraps
  at the widest end of the game. Compact notation (1.2K / 3.4M) is not implemented.
- **Offline progress is capped and auto-DPS only.** The web host replays at most 8 h of
  away time in 1000 ms steps with no clicks, and backgrounded-tab time beyond the host's
  10-step catch-up clamp is dropped until the next boot. Both are deliberate host
  policies chosen to avoid catch-up spirals and offline windfalls.
- **Three save schema versions, one migration path.** `loadGame` accepts versions 1, 2, 3, and 4
  (all older ones migrated to version 4 through the same source-field parser). Older saves
  gain a four-slot `equipped` map with `ring1`/`ring2`/`necklace` set to `null`,
  `meta.achievements` set to `[]`, and a fresh `event`/`boost` block. There is still no
  `clear()` on `SaveRepository`.
- **Golden Events (Shinies) are felt AND wall-neutral (Option 3 rework).** The player taps a
  wandering Stray Goblin within a short window for one of three rewards; missing it costs nothing.
  `getProjectedKillMs` measures the stage's **MAX HP** against the player's **sustained** power
  (excluding the temporary boost), so a frenzy can only make a stage *clear faster* — it can never
  decide *whether* a boss check / progression wall is raised. That leaves one residual effect: the
  wall-clock time to reach the wall. It is bounded by construction — a burst that runs for `D` ms
  at multiplier `M` saves exactly `D × (M − 1)` ms, independent of stage and DPS — so the final
  knobs pin the per-claim wall budget at **6 s × 3 → 12 s** (`shiny.test.ts` asserts the ceiling).
  The three rewards: a rare **FRENZY** (×3 for 6 s, ~30 % of spawns, measured uptime **0.9–2.2 %**
  per run — a real, visible burst, not the old 0.1 % blip); a guaranteed **ring drop** at the
  current stage into the weaker ring slot (`drop`, ~30 %), which is a drop on the *designed bounded*
  secondary lever and draws no RNG; and a **gold cache** (~40 %). A same-stage **weapon** drop was
  measured to leapfrog the equipped weapon and push the wall from stage 50 to 59, so the drop kind
  is ring-only on purpose. Cadence is **151 s** (which lifts the canonical hard baseline to
  ~51.9 min, leaving the ~2.4–3.9 min of slack the feature consumes). Final sim: **PACING OK** —
  canonical soft **6.18** / hard **49.54** min (both inside the comfortable ranges), all-seed hard
  **43.90–45.90**, uptime 0.9–2.2 %, drops-primary net **98.3–99.6 %**, eq/stage 0.82–0.96. No
  threshold, tolerance, canonical range, or assertion was changed or weakened.
  **Gates: `typecheck` 0, `test` 126/126, `sim` PACING OK (exit 0), `build` 0, `smoke` 13/13.**
- **Rings/necklaces are real but bounded, secondary levers.** The sim now equips them (its
  policy ranks every slot by the engine's own effective stats / global bonuses), the pacing
  proof exercises them, and their crit/power totals are clamped so the multiplicative bonus
  cannot explode late. In the UI a per-item value is labelled **(raw)** — the item's own
  contribution before the engine clamps the aggregate — and an equipped card also shows the
  current **capped** totals (`getCritStats`/`getGlobalBonuses`), so a mid-game ring no longer
  reads as an impossible `crit 211%`. There is still a single enemy definition and no player
  HP / armor / dodge.

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
