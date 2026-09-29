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
npm run theme:check  # validate the active theme against the theme contract
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
- **`npm run theme:check`** validates the active theme against the theme contract **and its
  art on disk** (see [Theming](#theming)), printing a readable report — the limits table
  with the observed maximum per group, plus `N/N files present at the exact size`. It exits
  non-zero with an actionable list if a theme is missing a slot, has an over-long string,
  template return value, or colour, references an unknown achievement id, tries to rename
  an identity key, has an enemy-roster gap (missing/extra enemy id, or fewer than four non-empty
  phrases for a taunt kind), has a malformed asset section, or points at a missing or mis-sized PNG
  (e.g. `player-idle.png is 48x48, expected 64x64`). It runs in CI too, via the engine unit
  suite.

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
bonus is *derived* from the upgrade level (nothing new is saved). Progress unlocks 30 snarky
**achievements** (persisted by id), each
with a brief over-the-top **splash** (non-blocking — it never pauses the simulation; tap to
dismiss early) and an **achievements shelf** that shows only your **unlocked** entries by default
(the count reads `N of TOTAL unlocked`), with a **Show hidden N / Hide hidden** toggle to peek at
the locked `???` entries. Your **bag lists items strongest-first**, ranked by the same engine power
metric the advisory and the sim use, so the best drop is always at the top. If you leave a strictly better item for a
slot sitting in your bag, the game **tells you** — a quiet `↑ Better … in your bag` badge on the
equipped card (plus a `↑ Better` tag on the item itself) appears whenever one exists, and if you make
**no stage progress for a while** it escalates to a prominent **Bag check** callout that states the
facts (the stage, how long you've been stuck, the item's level, and roughly how much stronger it is).
It **never equips anything for you**: you tap the callout's **Equip** button — or tap the flagged row itself — to decide (only strictly-better rows are row-tappable; the `equip-btn` stays the keyboard control and one tap is exactly one dispatch). Occasionally a
**Stray Goblin** (a "Golden Event") wanders across the arena carrying something shiny — tap it
within its short window for one of **three** bonus rewards: a short/rare **FRENZY** damage
multiplier (a visibly faster burst), a guaranteed **ring drop** at your current stage into your
weaker ring slot, or a lump of **gold**. Missing it costs *nothing* — it simply leaves with a
snarky toast. Stages cycle through a **roster of 12 enemies** (grunt, goblin, wolf, bat, slime,
bandit, spider, wraith, ogre, harpy, golem, dragonling, repeating), each with its own HP/gold curve,
and enemies throw out a **theme catchphrase** (a taunt) at spawn, a normal death, a boss death, a
wall, a Shiny, or on a long idle stretch. Every 10th stage
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
│   │   ├── balance.ts           # shared gameplay numbers + economy formulas (per-enemy HP/gold curves live in content.ts)
│   │   ├── content.ts           # gear + 12-enemy roster catalog; per-enemy HP/gold curves (never persisted)
│   │   ├── achievements.ts      # static achievement catalog + pure evaluator (ids/predicates; copy from theme)
│   │   ├── theme/                # ALL user-facing TEXT + COLOURS (display) — see Theming
│   │   │   ├── types.ts          # `Theme` contract incl. `palette` (leaf: imports nothing)
│   │   │   ├── fantasy.ts        # "Standard Fantasy RPG" theme (wording + dark ember palette)
│   │   │   ├── lucky.ts          # Lucky the dog — the COMMITTED DEFAULT (light sunlit palette, dog copy)
│   │   │   ├── contract.ts       # limits/slots + `validateTheme` + pure `validateAssetMeasurements`
│   │   │   └── index.ts          # `ACTIVE_THEME` + `THEMES` — the ONE-LINE theme switch
│   │   ├── gear-stats.ts        # leaf: derived gear reads + the shared powerScore metric
│   │   ├── advisory.ts         # leaf: upgrade/stall guidance (surfaces facts; never equips)
│   │   ├── state.ts             # createGame / cloneGameState / derived reads / saveGame / loadGame
│   │   ├── advance.ts           # advance(state, deltaMs) — time-based simulation
│   │   ├── actions.ts           # applyAction(state, action) — explicit player commands
│   │   ├── combat.ts            # damage, kills, stage entry, boss/wall pacing checks
│   │   ├── loot.ts              # frequent gear drops; item level tracks the killed stage
│   │   ├── taunts.ts            # deterministic enemy catchphrases on a SEPARATE RNG channel
│   │   └── rng.ts               # seeded mulberry32 (state lives in GameState.meta.rngState)
│   ├── scripts/
│   │   ├── check-theme.ts        # `npm run theme:check` — validate the active theme + its on-disk art
│   │   ├── make-placeholder-assets.ts # `npm run theme:assets -- <name>` — regenerate the 32 placeholders
│   │   └── png.ts                # dependency-free PNG dimension reader (signature + IHDR)
│   ├── save/
│   │   ├── index.ts             # ./save subpath export
│   │   ├── repository.ts        # async SaveRepository interface
│   │   └── localStorage.ts      # LocalStorageSaveRepository (structural globalThis read)
│   └── tests/                   # Vitest: rules + purity + boundary + save round-trip
│
├── web/                         # ▶ DISPOSABLE browser host (Vite + vanilla DOM, no framework)
│   ├── index.html
│   ├── public/
│   │   ├── style.css            # layout + `:root` colour fallback (overridden by the theme at boot)
│   │   └── themes/{fantasy,lucky}/ # 32 placeholder PNGs each + README (swap for real art)
│   ├── src/
│   │   ├── main.ts              # owns the clock, fixed 100 ms loop, autosave, action dispatch
│   │   ├── renderer.ts          # pure state → DOM projection; theme sprites + event-driven animation; GameEvent[] seam
│   │   ├── palette.ts           # applies `theme.palette` as CSS custom properties
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
- **No filesystem in `src/`.** The theme's on-disk asset check is split: `scripts/` reads
  the PNG bytes with `node:fs`, and `src/theme/contract.ts` only *compares* measured facts
  (`validateAssetMeasurements`, pure). The boundary scan sees `src/` and `save/` only.
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

### Theming

All **user-facing text** is owned by one theme object in `engine-core/src/theme/`; neither
the renderer nor the achievement catalog holds display copy any more. Swapping themes is a
**one-line change**:

```ts
// engine-core/src/theme/index.ts
export const ACTIVE_THEME: Theme = lucky;
```

- **Identity stays in code; display moves to the theme.** Achievement `id`s, gear
  `definitionId`s, `GearSlot` values, enemy ids, `ShinyKind` values, and the save-schema
  version are *identity* — they are persisted in saves and asserted by the sim, so they are
  never sourced from a theme and a theme can never change them. Every human-readable string
  — HUD labels, slot/card labels, buttons, toasts, empty states, section headers, advisory
  and offline copy, the Shiny's name, enemy display names, and each achievement's
  `title`/`description` — is a theme slot (grouped `ui`, `slots`, `enemy`, `shiny`,
  `advisory`, `achievements`).
- **Interpolated copy stays a function.** Templates such as `Stage ${stage} — …`, the
  advisory sentences, and achievement descriptions that embed a balance number remain
  functions taking the same parameters, so a swapped theme cannot change the rendered bytes.
- **The theme is a leaf.** `theme/types.ts` imports nothing; `fantasy.ts` imports only the
  contract; `index.ts` selects the active theme. `engine-core/src` stays acyclic.
- **A theme must match a declared contract, and the contract is enforced.**
  `engine-core/src/theme/contract.ts` is the *template* every theme must satisfy. It
  declares per-group character limits (label 48, chrome 120, achievement-title 64,
  achievement-description 200, prose 240, color 64, and **catchphrase 140**), the required
  achievement catalog id set, the required **enemy roster** id set, the
  forbidden identity keys, and the required asset slots — and `validateTheme(theme)`
  re-checks all of it **at runtime**, reporting *every* problem at once (each with a
  path, a kind — `missing` / `wrong-type` / `too-long` / `bad-key` / `identity-key` /
  `missing-achievement` / `extra-achievement` / `bad-filename` — and a message that
  names the actual value and the allowance). Run it any time while authoring:
  `npm run theme:check` validates the active theme and exits non-zero on any problem.
  The engine unit suite also validates the active theme on every run, so a theme edit
  is self-checking in CI. Limits are **measured, not invented**: they sit comfortably
  above the current theme's longest rendered strings (see each group's `rationale`), so
  text stays generous while genuinely broken copy ("someone pasted a paragraph", or a
  template whose returned value exploded) fails loudly.
- **Colours are theme tokens that reach CSS.** The theme's `palette` (19 semantic tokens —
  `bg`, `panel`, `text`, `textMuted`, `accent`, `dangerMuted`, `hpHi`, …) is applied by
  `web/src/palette.ts` as the stylesheet's CSS custom properties at boot, so a swapped
  theme retints the whole UI without touching `style.css`. Values are validated as CSS
  colours (`#rgb`/`#rrggbb`/`#rrggbbaa`/`rgb()`/`rgba()`/`hsl()`/`hsla()`). The `:root`
  block in `style.css` is kept only as a **documented fallback** (identical to `fantasy`)
  for before-boot / no-JS; the injected theme rule is written as a `<style>` element so
  the `prefers-contrast: more` override (`:root:root`) still wins for high-contrast users.
  The `fantasy` theme's palette values are the original colour values (T4 proved the
  application byte-identically); T5 then moved a few previously hard-coded surfaces onto
  tokens so a *light* palette also works — see the surface-coverage note below.
- **Assets are a declared contract, loaded and checked.** The theme's `assets` section maps
  each required asset slot to a file name; the canonical slot names, expected pixel
  dimensions, and file-name convention live in `contract.ts` `ASSET_SLOTS` (4 gear slots ×
  4 tiers + 16 character/spawn slots = 32). `validateTheme` checks the section is
  well-formed; the **filesystem** check is split for purity — the CLI reads each PNG's
  signature + IHDR dimensions (`scripts/png.ts`) and the *pure* `validateAssetMeasurements`
  compares them to `ASSET_SLOTS`, so `engine-core/src` stays free of `fs`. `npm run
  theme:check` reports every missing/mis-sized file at once. The renderer loads the art as
  `/themes/<theme-name>/<file>` (path derived from the theme, never hard-coded), drawn with
  `image-rendering: pixelated`; the committed art for each theme is **placeholder** blocks
  to be replaced (see `web/public/themes/<theme>/README.md`).
- **The palette covers the whole surface, not just the panels.** A second, *light* palette
  exposed a handful of stylesheet colours that had been hard-coded rather than derived from
  a token (the arena vignette, the boss arena tint, the escape-toast plate, the frenzy pill,
  and the small accent badges). Those now derive from the theme tokens (`color-mix` for the
  alpha tints), so a light theme renders legibly and `fantasy` keeps its own values.
  Residual limitation (see `decisions.md`): `color-scheme` is still a fixed `dark` in the
  stylesheet, so a light theme leaves the UA scrollbar/form chrome dark.
- **Animation is themeable and shipped (T6).** `Theme.animation` declares **8 semantic cue keys**
  (`playerAttack`, `enemyHit`, `enemyDeath`, `bossHit`, `bossDeath`, `stageEntered`, `shinySpawn`,
  `shinyClaim`), each mapping to one declared asset slot plus a **display-only** duration (0 disables
  the cue). The renderer's `handleEvents` turns one frame's ordered `GameEvent[]` into bounded
  transient sprite frames: at most one frame per actor target (same-target cues replace each other),
  a `MAX_ACTIVE_EFFECTS = 8` cap, per-actor **cue priority** (deaths outrank a spawn popup), and one
  re-armed drain timer. Durations never reach the engine or the sim. Under `prefers-reduced-motion` a
  sprite's `src` never changes to an animation frame — but enemy **taunt text** still shows, because a
  line of text is information, not motion. Honest caveat: the cue keys are *registered* in
  `theme/contract.ts` but only a four-line allow-list registration exists, so `npm run theme:check`
  does **not** validate animation cues — the unit suite does. (`theme:check` *does* validate the enemy
  roster's **shape** — every id present, ≥4 non-empty phrases per taunt kind — via `validateTheme`.)
- **Two themes ship, and the second one proves the seam.** `lucky` (the committed default — a
  golden retriever × husky: `Lucky` is the player, gear slots become the Jaw / two dog
  tags / a bandana, the enemy is the mail carrier, and the Golden Event is a squirrel) and
  `fantasy` (the "Standard Fantasy RPG" original). The
  test suite validates **every** entry in `THEMES` (not just the active one), asserts both
  themes carry the **same** achievement-id and asset-slot sets, and asserts they genuinely
  differ — so a newly added theme is self-checking in CI and the second theme can never
  silently rot into a copy of the first. The browser smoke suite is **theme-agnostic**: it
  derives every expected display string and sprite URL from the active theme, so a theme
  swap needs no test edit.
- **Enemy identity is content; enemy display copy is the theme's.** `ENEMY_ROSTER` ships **12
  enemies** with stable ids (`grunt, goblin, wolf, bat, slime, bandit, spider, wraith, ogre, harpy,
  golem, dragonling`); `enemyForStage(stage) = roster[(stage − 1) % 12]` is a pure round-robin with
  **zero RNG and zero persisted state**, so the save schema stays **v4**. Each enemy owns its **own
  live HP/gold curve** (`baseHp`/`hpGrowth`/`baseGold`/`goldGrowth`) and its own boss multipliers;
  `enemyMaxHp(stage)`/`goldReward(stage)` compute directly from them — there are no
  `hpFactor`/`goldFactor` factors and no global canonical curve. Boss **cadence** stays global
  (`isBoss`, every 10th stage); boss **size** is per-enemy. `archetype` is an inert descriptive
  label (no live path reads it). The theme supplies each enemy's arena **name** and **catchphrases**
  keyed by the six taunt kinds (`spawn`, `defeat`, `bossDefeat`, `wall`, `shiny`, `ambient`):
  12 enemies × 6 kinds × 4 phrases = **288 lines per theme**. The engine emits only
  `{type:'enemyTaunt', enemyId, kind, phraseIndex}`; the renderer resolves the wording (reducing the
  bounded index modulo the theme's array length).
- **Taunts cannot perturb the loot stream.** They ride a **separate derived RNG channel**
  (`seed ^ totalPlayedMs ^ discriminator`, see `engine-core/src/taunts.ts`) that never reads or writes
  `meta.rngState`, so adding or tuning them cannot move the pacing proof. A taunt does **not** fire
  for a boot/offline kill — offline events are deliberately dropped.

### Adding a theme

A theme is one `Theme` object plus one folder of art. The whole recipe:

1. **Write the theme file.** Copy `engine-core/src/theme/fantasy.ts` (or the second
   reference implementer, `engine-core/src/theme/lucky.ts`) to
   `engine-core/src/theme/<name>.ts`, then rewrite every display string and the 19-token
   `palette`. Keep **identity out of it**: the same achievement ids, gear
   `definitionId`s / `GearSlot` values, enemy ids, `ShinyKind` values, asset slot names, and
   file names. Achievement copy is keyed by the fixed ids — rewrite the **wording** only;
   the id and the trigger the predicate implements (`engine-core/src/achievements.ts`) never
   move, or the joke becomes a lie.
2. **Register it.** In `engine-core/src/theme/index.ts`, import it and add it to the
   `THEMES` array. The unit suite then validates it automatically.
3. **Add its art folder.** The directory name MUST equal `theme.name`
   (`web/public/themes/<name>/`). Generate the 32 contract-sized placeholders in one command
   (dependency-free `node:zlib` encoder, per-theme hue so themes look different):
   ```sh
   npm run theme:assets -- <name>
   ```
   Replace them with real RGBA PNGs at the exact declared dimensions when you have them
   (the folder `README.md` says how).
4. **Flip the one line** in `engine-core/src/theme/index.ts`:
   ```ts
   export const ACTIVE_THEME: Theme = <name>;   // currently: lucky
   ```
5. **Validate it** from the repo root:
   ```sh
   npm run theme:check   # text limits + id set + colour shapes + 32 files at exact size
   npm run test          # validates ALL of THEMES, not just the active theme
   npm run typecheck && npm run build
   npm run smoke         # theme-agnostic: drives whichever theme is ACTIVE_THEME
   ```
   `theme:check` is the checklist: it reports **every** problem at once (an over-long
   string, a renamed identity key, a bad colour, a missing or mis-sized PNG) with the exact
   path and actual-vs-allowed value.

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
- **Events are plumbed to the renderer as one ordered batch per frame.** `web/src/main.ts`
  coalesces every fixed step of a frame into a single `GameEvent[]` and passes it to
  `renderer.render(state, context?, events?)`; the renderer's private `handleEvents(events)` consumes
  the batch into transient, theme-declared animation frames (see [Theming](#theming)) and **discards
  it after the call**, so no history accumulates and memory stays bounded by one frame.
  Offline replay and the boot render deliberately drop their events — a multi-hour replay must not
  fire a storm of animations for history the player never watched — so only the resulting state is
  delivered and the existing state-diff cues still cover those cases.
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
  reload continues the exact deterministic stream.) The standing enemy is a **pure function of
  `combat.stage`** (`enemyForStage`, a 12-enemy round-robin), so a save reconstructs it with no new
  field — the schema stays v4.
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
seed     12345: soft 6.22 min st30  hard 55.52 min st50  dNet 97.3%  dGross 90.4%  [DROPS-PRIMARY]
seed         1: soft 6.22 min st30  hard 51.97 min st50  dNet 98.6%  dGross 90.5%  [DROPS-PRIMARY]
seed       999: soft 5.79 min st30  hard 50.60 min st50  dNet 97.7%  dGross 90.5%  [DROPS-PRIMARY]
seed    424242: soft 6.05 min st30  hard 51.17 min st50  dNet 97.9%  dGross 90.4%  [DROPS-PRIMARY]
seed  20250925: soft 5.63 min st30  hard 53.76 min st50  dNet 97.7%  dGross 90.9%  [DROPS-PRIMARY]
soft 6.00 min target ±20% → actual 6.22 min (delta +3.8%)  [PASS]
hard 54.00 min target ±20% → actual 55.52 min (delta +2.8%)  [PASS]
PACING OK
```

Raw milestone snapshot (canonical seed):

```
soft check   t=6.22min  stage=30  autoDps=1716.62   clickDamage=6862.40
hard wall    t=55.52min stage=50  autoDps=233225.61 clickDamage=932896.66
```

Upgrade milestones now genuinely fire (5 sweep seeds, after the Option A retune):

```
seed     12345: upgrades 105 (w96/r9/n0)   milestones 22 (w19/r3/n0)   max item level (w9/r9/n0)
seed         1: upgrades 125 (w112/r6/n7)  milestones 27 (w23/r2/n2)   max item level (w9/r6/n7)
seed       999: upgrades 106 (w97/r9/n0)   milestones 21 (w18/r3/n0)   max item level (w8/r9/n0)
seed    424242: upgrades 106 (w106/r0/n0)  milestones 23 (w23/r0/n0)   max item level (w10/r0/n0)
seed  20250925: upgrades 100 (w91/r9/n0)   milestones 21 (w18/r3/n0)   max item level (w8/r9/n0)
```

**Drops are the primary power lever.** Gear stats are **exponential in item level**
(`floor(factor * gearGrowth^(itemLevel - 1))`, `gearGrowth = 1.2832`), and `dropChance` is
0.95 with `DROP_LEVEL_OFFSET = 0`, so a killed stage reliably yields a piece of gear whose
item level tracks that stage (`itemLevel = max(1, stage)`). The slot is then drawn from
`SLOT_DROP_WEIGHTS` (weapon 1.0, each ring 0.04, necklace 0.02), and a **weapon is guaranteed
first**: until the player owns one, the slot roll is forced to `weapon`. The weapon weight must
dominate: the weapon is the only *unbounded* exponential power lever, so a heavy ring weight
thins the weapon stream (the equipped weapon lags the stage and the soft check drifts late).
Rings/necklaces are **bounded** secondary levers: their crit/power totals are clamped
(`CRIT_CHANCE_CAP`, `CRIT_MULTIPLIER_CAP`, `POWER_MULTIPLIER_CAP`, `GOLD_MULTIPLIER_CAP`) in the
state getters, so an exponential item remains an exponential *item* without letting the
multiplicative bonus explode. Equipping each new drop is the power jump. Each enemy's own HP curve grows faster
than player power (the roster's `hpGrowth` values sit in a deliberately tight **1.4273–1.4336**
band, vs player power ≈1.28×/stage)
before the bounded crit/necklace multipliers, so the fall-behind — and therefore the walls — is
designed in. The band is narrow on purpose: with per-enemy curves the aggregate stage curve is the
round-robin product of the 12 enemies' growth rates, so wider divergence makes the stage sequence
zig-zag and drifts the pacing proof outside its window. These 12 curves came from a
~4,415-candidate measured search. Gold is a **minor smoothing lever** on a **flat, legible curve**:
`upgradeCostBase = 3`, `upgradeCostGrowth = 1.25` (so a run affords a steady stream of levels instead
of two unaffordable ones), and `upgradeStatMultiplier = 1.01` — a ~1% nudge per level that stays far
below the ×1.2832 item-level drop, so a newer drop still beats any affordable upgrade stack and the
weapon keeps tracking the stage. `goldGrowth = 1.0` stays flat; equipping a new drop resets
`upgradeLevel` to 0. Free-path choices grant a fixed number of upgrade levels rather than
stage-scaled gold. **Upgrade milestones** add a visible step every `UPGRADE_MILESTONE_INTERVAL`
(**3**) levels in one item: a small boost to that slot's *capped* stat (weapon → power,
rings → crit, necklace → gold). They are **derived from `upgradeLevel` on read** — no new save
field, so the schema stays at version 4 — and they feed the *same* clamped aggregations as ordinary
gear, so they can never exceed a cap. The flat curve is what makes the every-3-levels step
reachable: measured per-item peaks are now **8–10** levels (was 2–7), so **21–27** milestone events
fire per run across the sweep seeds. See `engine-core/src/balance.ts`.

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
(`goldNet = goldGross − resetLoss`) keeps gold's **net** contribution small while drops carry
**≈97–99% of net log-power growth**. The ledger reports both conventions unambiguously: **drops
97.3–98.6% of NET** log-power growth and **≈90.4–90.9% of GROSS** (drops against raw gold purchased).
On the sweep seeds `goldNet` is a small positive `+0.163…+0.328` (a steady stream of cheap,
mostly-reset upgrades plus a few persistent ring/necklace levels), and the free `wait` grant is
≈0.3–0.5% — a transient smoothing contribution, not a net power source (the grant is denominated in
upgrade *levels*, so a flatter curve makes the same two free levels worth less gold, not less power).

### Policy sensitivity (diagnostic)

The pacing targets above are proven for the **canonical greedy policy** — that is the
asserted run, and it is the only run that gates the exit code. Wall timing is nevertheless
**policy-dependent**: the same five seeds re-run under alternative playstyles land the walls
at different stages and times, so `npm run sim` prints an explicitly **informational**
`policy sensitivity` section (it never sets the exit code). Measured across the sweep seeds:

| policy | soft (stage) | hard (stage) |
| --- | --- | --- |
| greedy (canonical) | 5.63–6.22 min (30) | 50.60–55.52 min (50) |
| equip-only (equips, never upgrades) | 5.66–6.28 min (30) | 40.05–56.54 min (47–50) |
| upgrade-lazy (equips first, upgrades last) | 5.53–6.13 min (30) | 50.48–55.53 min (50) |
| passive (click only, never equips/upgrades) | 3.73–4.11 min (10) | 26.07–26.83 min (15) |

The passive row is the **degenerate** case: with no weapon equipped (the only item-level power
lever) sustained DPS never grows, so `getProjectedKillMs` collapses to a **pure function of the
stage** — the wall is unavoidable and identical regardless of gold, achievements, or non-weapon
inventory. The engine getter `isUnarmed(state)` reports that no-weapon state and the sim flags it
(`unarmed@end=yes`); `engine-core/tests/projection.test.ts` pins both halves of the documented
behaviour (gear-less projection is a pure function of stage and exactly
`enemyMaxHp(stage) / sustainedActiveDps`; equipping a weapon changes it). The alternative policies
are bounded by the existing `MAX_SIM_MS` / `MAX_SIM_STAGE` / `MAX_ECONOMY_PASSES` caps plus a
per-policy economy-pass cap and a main-loop step cap, so a divergent playstyle terminates and
reports "not reached" rather than hanging.

---

## Known trade-offs / limitations

This is a prototype, and the honest edges matter:

- **The bag lists strongest-first; the achievements shelf hides locked entries by default.**
  Both are pure presentation and hold no balance numbers. Bag ordering ranks each item by
  `scoreWithEquip(state, slot, item)` (the same engine power metric the advisory and the sim use),
  with a deterministic tie-break of item level then instance id; the render-diff signature is taken
  from the *sorted* order so a re-sort always forces a re-render. The achievements shelf renders
  every catalog entry but marks locked ones `hidden` until the player presses the **Show hidden N**
  toggle (`achievements-toggle`, `aria-expanded`, `aria-controls`), which flips renderer-local
  presentation state only — never an engine action, never persisted. The count keeps its
  `achievements-count` number and adds `N of TOTAL unlocked`; an empty shelf shows an empty-state
  hint, and the toggle meets the ≥44px touch target. Additionally, a **flagged** (strictly-better)
  bag row is itself a tap target: tapping it dispatches the existing `equip` action, while the
  `equip-btn` stays the keyboard control. One tap is exactly one dispatch — the button branch in the
  delegated click handler returns before the row branch, so a button tap can never also equip via
  the row.
  **Gates: `typecheck` 0, `test` 236/236, `sim` PACING OK (exit 0), `build` 0, `smoke` 28/28.**

- **Drops-primary means drop RNG affects pacing.** Because gear drops (not a deterministic
  gold curve) carry the power, a lucky or unlucky drop stream moves the soft/hard timings.
  `dropChance = 0.95` keeps the 5-seed spread tight (soft 5.63–6.22 min, hard 50.60–55.52
  min), but sampling variance is real: lowering `dropChance` toward 0.8 blows the soft range
  out (observed 2.33–8.75 min). To reduce variance, raise `dropChance` toward 1.0 — never
  widen the ±20% tolerance or re-neuter drops.
- **Gold is deliberately a small lever.** `goldGrowth = 1.0` makes late-game gold rewards
  flat, and each level is only a ~1% nudge; a run buys a steady stream of them (100–125 levels per
  sweep run), but every equip resets the level, so churned gold power never compounds into a second
  curve.
- **Gold is now an *allocation* decision, not a single button.** The Equipped panel renders one
  upgrade control per slot (`upgrade-btn` for the weapon — kept for the smoke test — plus
  `upgrade-btn-ring1`/`ring2`/`necklace`) with a per-slot `upgrade-cost`/`upgrade-level` readout
  and an independent disabled state. Every `UPGRADE_MILESTONE_INTERVAL` = **3** levels in one item
  crosses a **milestone**: the engine emits `{ type: 'milestoneReached', slot, upgradeLevel,
  description }`, and `/web` shows a brief, non-blocking flourish plus a `★ ×N — …` badge on the
  card (the milestone counts are still diffed across renders like the achievement shelf, even though
  the renderer now also receives the ordered `GameEvent[]` batch — see the event seam below). The
  bonus is **derived from `upgradeLevel` on read** — no persisted
  field, schema stays **v4** — and feeds the same clamped aggregations, so it can never bypass
  `CRIT_CHANCE_CAP`/`CRIT_MULTIPLIER_CAP`/`POWER_MULTIPLIER_CAP`/`GOLD_MULTIPLIER_CAP`. Because the
  necklace's power base already saturates `POWER_MULTIPLIER_CAP`, the necklace milestone grants
  **gold only** (no dead power term). A non-weapon upgrade that cannot raise power (e.g. a ring at
  the crit cap) still costs gold — the UI lets the player make that mistake; the sim's policy does
  not (it scores every slot by its real power gain and skips zero-gain upgrades).
  **Gates: `typecheck` 0, `test` 236/236, `sim` PACING OK (exit 0), `build` 0, `smoke` 28/28.**
- **A soft-lock is surfaced, never auto-fixed.** If you equip a weak item while a strictly better one
  sits in your bag, the projection can stay finite-but-slow and no wall fires — so the engine reports
  the opportunity instead of acting on it. `getSlotUpgradeAdvisory(state, slot)` compares a slot
  against its best bag item with the SAME `powerScore` metric the sim's economy policy uses (so it can
  never recommend a downgrade), and `getStallAdvisory(state, stageBeganAtMs)` escalates `none → hint →
  nag` only when BOTH a stall window has elapsed AND a better item exists. `/web` turns that into a
  modest badge and, at `nag`, a prominent **Bag check** callout whose one button dispatches the
  existing `equip` action — **the player is the only one who ever equips.** The stall anchor is
  host-owned and in-memory (`main.ts` records `meta.totalPlayedMs` when `combat.stage` changes and
  passes it via `render(state, { stageBeganAtMs })`), so **no field is persisted and the save schema
  stays v4**; with no anchor the severity is `none`, and the window measures time on the *current*
  stage (a player inching forward on one stage while holding a better bag item is still prompted —
  by design, and only ever suggested).
- **A single low-item-level weapon upgrade may not move the HUD DPS readout.** Integer
  flooring plus a ×1.01 upgrade means a level-1 weapon's first several upgrades leave
  `autoDps` unchanged; the observable power jump now comes from equipping a newer drop
  (and the every-3-levels milestone). No engine change — flooring is intended.
- **`resolveChoice('iap')` advances one stage in the current engine semantics.** It
  sets the current enemy's HP to 0 and runs normal kill resolution, which awards gold,
  rolls a drop, and spawns the next stage (whose stage-entry checks may raise a fresh
  choice). `watchAd` and `iap` are **UI placeholders with no ad or payment SDK** — they
  render disabled ("coming soon") so the free `wait` path is always the working one. The
  engine actions exist; only the host integration is missing.
- **Late-game numerals are large and not abbreviated.** At the hard wall auto-DPS is
  ≈**2.3e5** (and click damage ≈**9.3e5**). The HUD prints full integers, so the readout wraps
  at the widest end of the game. Compact notation (1.2K / 3.4M) is not implemented.
- **Offline progress is capped and auto-DPS only.** The web host replays at most 8 h of
  away time in 1000 ms steps with no clicks, and backgrounded-tab time beyond the host's
  10-step catch-up clamp is dropped until the next boot. Both are deliberate host
  policies chosen to avoid catch-up spirals and offline windfalls.
- **Four save schema versions, one migration path.** `loadGame` accepts versions 1, 2, 3, and 4
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
  The three rewards: a rare **FRENZY** (×3 for 6 s, ~30 % of spawns, measured uptime **1.4–1.9 %**
  per run — a real, visible burst, not the old 0.1 % blip); a guaranteed **ring drop** at the
  current stage into the weaker ring slot (`drop`, ~30 %), which is a drop on the *designed bounded*
  secondary lever and draws no RNG; and a **gold cache** (~40 %). A same-stage **weapon** drop was
  measured to leapfrog the equipped weapon and push the wall from stage 50 to 59, so the drop kind
  is ring-only on purpose. Cadence is **151 s** (lengthened so the bounded rewards stay inside the
  canonical hard window's slack rather than eating into it). Final sim: **PACING OK** —
  canonical soft **6.22** / hard **55.52** min (both inside the comfortable ranges), all-seed hard
  **50.60–55.52**, uptime 1.4–1.9 %, drops-primary net **97.3–98.6 %**, eq/stage 0.88–0.98. No
  threshold, tolerance, canonical range, or assertion was changed or weakened. (The 2026-09-27
  Option A gold retune later shifted the economy slightly; the Shiny knobs themselves are
  unchanged.)
  **Gates: `typecheck` 0, `test` 236/236, `sim` PACING OK (exit 0), `build` 0, `smoke` 28/28.**
- **Rings/necklaces are real but bounded, secondary levers.** The sim now equips them (its
  policy ranks every slot by the engine's own effective stats / global bonuses), the pacing
  proof exercises them, and their crit/power totals are clamped so the multiplicative bonus
  cannot explode late. In the UI a per-item value is labelled **(raw)** — the item's own
  contribution before the engine clamps the aggregate — and an equipped card also shows the
  current **capped** totals (`getCritStats`/`getGlobalBonuses`), so a mid-game ring no longer
  reads as an impossible `crit 211%`. There are now **12 enemies** (a pure stage-driven round-robin,
  each with its own live HP/gold curve and boss multipliers — see [Theming](#theming)) and still no
  player HP / armor / dodge.
- **Enemy identity is stage-derived; enemy copy is theme-owned; taunts are off the loot RNG.** The
  standing enemy is `enemyForStage(combat.stage)`, a pure 12-enemy round-robin with **zero RNG and
  zero persisted state** (schema stays **v4**), so a reload reconstructs exactly the same enemy. Each
  enemy's `baseHp`/`hpGrowth`/`baseGold`/`goldGrowth` and `bossHpMultiplier`/`bossGoldMultiplier` are
  the **live** values; `BALANCE.baseHp`/`hpGrowth`/`baseGold`/`goldGrowth` are documentation anchors
  the live curve does **not** read (and `BALANCE.bossHpMultiplier`/`bossGoldMultiplier` no longer
  exist). `archetype` is inert. Enemy **names** and **catchphrases** come from the theme's
  `enemy.roster` (288 lines per theme); the engine emits only the semantic taunt cue. Taunts ride a
  separate derived RNG channel and never touch `meta.rngState`, so they cannot move the pacing proof;
  a boot/offline kill emits no taunt (offline events are dropped).

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

All shared balance numbers and pacing thresholds live in `engine-core/src/balance.ts`. The
live per-enemy HP/gold curves are the exception — they live with the roster in
`engine-core/src/content.ts` (`ENEMY_ROSTER`), since each enemy owns its own curve.
