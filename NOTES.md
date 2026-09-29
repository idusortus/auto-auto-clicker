# NOTES.md — parking lot

> Out-of-scope ideas and open questions. Nothing here is built unless it is
> explicitly pulled into a phase. The project rules forbid inventing mechanics
> beyond the core loop, so ideas land here instead of in code.

## Build / phase notes

- **Offline progress is auto-DPS only.** On boot the web host replays real
  elapsed time through the same `advance(state, 1000)` the live loop uses, in
  bounded 1000 ms steps, capped at 8 h (`OFFLINE_CAP_MS`). No clicks are
  replayed, so a returning player earns strictly less than they would have by
  tapping. If a choice is pending in the save, replay stops immediately (the
  engine freezes the world) and the choice is shown on boot. This is a host
  policy choice, not an engine rule.
- **`watchAd` / `iap` are placeholders.** The engine already supports the
  `resolveChoice('watchAd' | 'iap')` actions, but this build ships no ad SDK and
  no payment code. The renderer shows them as disabled "coming soon" buttons so
  the free `wait` path is always the working one; a future phase hooks a real
  monetisation adapter in behind `RendererHandlers.onChoice`. The
  `engine-core` actions are intentionally left untouched.
- **No balance numbers in `/web`.** All loop timing (100 ms step, 10-step
  catch-up cap, 5 s autosave, 1000 ms offline step, 8 h cap) and all formatting
  constants (percent, minutes/hour) are host/presentation values, not gameplay
  tuning. Every gameplay value displayed comes from engine-core state or its
  exported getters.
- **README is intentionally not updated this phase.** The phase brief scopes
  Phase 4 to `web/*` + `NOTES.md` and reserves the README rewrite for Phase 6,
  so the README's "later phases" wording is left for that phase.
- **Runtime verification without a browser:** Phase 5 owns the Playwright smoke
  test. During Phase 4 the renderer + boot path were exercised headlessly with a
  throwaway DOM shim (selectors validated against the generated skeleton, all
  render branches driven); the shim was deleted afterwards.
- **Playwright mobile smoke test (Phase 5).** `web/tests/smoke.spec.ts` +
  `web/playwright.config.ts`; run `npm run smoke` from the repo root. The config
  starts the real Vite dev server on a strict port 5173 and drives it at
  390×844 / touch / DPR 3 (mobile Chromium emulation). `beforeEach` clears
  `localStorage` so every test boots a fresh game instead of a stale autosave.
  Chromium v1243 was already in `~/.cache/ms-playwright`, so no browser download
  was needed. Dependency: `@playwright/test` (see `decisions.md`).
- **Upgrades barely move the HUD DPS readout — drops do.** With the guaranteed
  item-level-1 starter weapon and a ×1.01 upgrade multiplier, `autoDps = base(2) +
  floor(2 * 1.01^u) = 4` for `u = 0..40` (integer flooring); the readout only rises
  once a **newer drop** is equipped (e.g. item level 3 →
  `floor(2 * 1.2832^2) = 3`). This is intended: the economy is drops-primary, so the
  power jump should come from gear. The smoke test asserts the upgrade **counter**
  increments and gold is spent on the first tap, then taps until a higher-level drop
  is in the bag, equips it, and asserts the DPS readout strictly increases
  (`web/tests/smoke.spec.ts`). No engine change — flooring is intended.

- **Phase 6 documentation pass.** `README.md` was rewritten for a new contributor:
  architecture and the one-way dependency direction (`web → engine-core`,
  `sim → engine-core`, never reverse), the engine-core purity contract, the pure
  `advance`/`applyAction` simulation contract (hosts own the clock and drive fixed 100 ms
  steps; offline replay goes through the same `advance` in bounded steps, auto-DPS only),
  the versioned `SaveGame` + async `SaveRepository` model, the pacing proof with the
  then-current numbers (Phase-3b: soft 5.92 min @ stage 30, hard 52.23 min @ stage 60,
  5-seed hard assertion — superseded by the 2026-09-26 drops-primary reversal below), the
  honest trade-offs, a dependency-justification table, and a concrete "Porting to Expo"
  section. The stale "svelte and supabase" stack text in `PROJECT.md` and `AGENTS.md` was
  corrected to TypeScript + Vite + vanilla DOM + pure engine, local-only. The earlier note
  "README is intentionally not updated this phase" is now superseded. No code, balance,
  save schema, or tests were touched.
- **Documented-but-intentional gaps** (carried into the README trade-offs): `iap` advances
  one stage; `watchAd`/`iap` are disabled placeholders with no SDK; the HUD prints full
  integers (late-game auto-DPS ~2.4e5, no compact notation). These are scoped limitations
  for this brief, not bugs.
- **2026-09-26 economy reversal (drops-primary).** The user reversed the Phase 3b
  determinism-first design: gear stats are now exponential in item level
  (`gearGrowth = 1.283`), `dropChance = 0.95`, `DROP_LEVEL_OFFSET = 0`, and gold upgrades
  are a minor lever (`upgradeStatMultiplier = 1.05`, `upgradeCostGrowth = 6`,
  `goldGrowth = 1.0`). The sim now carries a log-power attribution ledger and a hard
  per-seed `drops-primary` gate (>50% of positive *net* log growth; the reset loss is charged
  to gold, never subtracted from drops) plus a drop-stream sanity guard (equips must keep pace
  with stages cleared). Observed: soft 6.39–6.52 min, hard 50.78–51.38 min, drops ≈100% net /
  87.6% gross (`goldGross = resetLoss = 1.659`, so `goldNet = 0`). Pacing is no longer
  deterministic across seeds — drop RNG now matters (see `decisions.md`).
- **Save schema v2: derived values are not persisted.** `GameState` now keeps source fields
  only — `player.gold`, `combat.{stage,enemyHp,damageCarry}`, gear instances as
  `{id,definitionId,itemLevel,upgradeLevel}`, and meta/choices. Gear stats, base auto/click
  stats, and enemy max HP are computed on read via `getGearStats`/`getEffectiveStats`/
  `getEnemyMaxHp`. `loadGame` migrates version-1 saves (dropping the old `baseAutoDps`/
  `baseClickDamage`/`enemyMaxHp`/per-instance `dps`/`clickDamage` copies) instead of
  recomputing a cache; the localStorage key is unchanged (`auto-auto-clicker.save.v1`) so old
  saves are still found and migrated. See `state.ts` `migrateV1ToV2` and the `save.test.ts`
  migration case.
- **2026-09-27 Phase 1: rings, necklaces, achievements, save v3 (engine-core only).**
  `GearSlot` now has four slots (`weapon`/`ring1`/`ring2`/`necklace`). Rings add critical
  chance/multiplier; the necklace adds a gold bonus and an overall-DPS bonus. Crit is an
  *expected-DPS* multiplier (never a per-hit RNG roll) so `getProjectedKillMs` stays exact;
  total crit chance is capped at `CRIT_CHANCE_CAP = 0.75`. `getEffectiveStats` still returns
  `{autoDps, clickDamage}` but may now be fractional. 12 achievements initially lived in
  `achievements.ts` (ids persisted in `meta.achievements`) and are evaluated at the
  `advance`/`applyAction` entry points — the catalog has since grown to **30**. Save schema is
  **v3**: `loadGame` accepts 1/2/3 and a
  single parser defaults `ring1`/`ring2`/`necklace` to `null` and `achievements` to `[]`.
  At the time the pacing sim missed its ±20% windows (soft 7.22–7.56 min, hard 47–57 min)
  because non-weapon drops thinned the weapon stream and the new factors were placeholders
  (those factors have since been **deleted** — see the per-enemy-curves note below);
  Phase 2 owned the retune and Phase 3 owned the `/web` splash.
  **Superseded by the Phase 3 note below** — the catalog is now 30 entries, the sim passes
  every seed, the ring/necklace totals are capped, and the splash has shipped.
- **2026-09-27 Phase 3: per-slot sim policy, bounded caps, achievements + /web splash.**
  The sim's economy now equips, for EVERY occupiable slot (weapon/ring1/ring2/necklace), the
  bag item that most raises engine-derived effective power, so rings/necklaces are actually
  exercised by the pacing proof. Their multiplicative crit/power totals are clamped in the
  state getters (`CRIT_CHANCE_CAP = 0.75`, `CRIT_MULTIPLIER_CAP = 1.18`,
  `POWER_MULTIPLIER_CAP = 0.02`, `GOLD_MULTIPLIER_CAP = 0.25`), so the realized bounded lever
  saturates at ≈**+16% DPS** (≈10% pacing effect) instead of exploding. `npm run sim` passes
  all 5 seeds (soft 5.91–6.42 min, hard 45.10–49.07 min, all DROPS-PRIMARY). The achievements
  catalog was **24** at this phase (now **30**), and `/web` adds a brief non-blocking unlock splash
  (`achievement-splash` / `achievement-splash-title`, `pointer-events: none`, ~2.6 s,
  reduced-motion safe) alongside the shelf.
- **Armor and dodge are explicitly deferred.** Phase 1 was scoped to rings (crit) and
  necklaces (gold/power) only. There is still **no player HP, no incoming damage, no armor
  mitigation, and no dodge** in `engine-core`; do not add mechanics that imply them (or
  achievements that fake a death). Any future defensive layer needs its own design pass.
- **"Luck beats a boss" is explicitly deferred.** Letting a lucky crit actually beat a boss
  the projection says is out of reach **requires changing the wall from a projection check to
  an actual-fight check**, which trades away pacing determinism: the whole proof rests on
  `getProjectedKillMs` being exact and RNG-free against `BOSS_TIMER_MS` /
  `HARD_WALL_PROJECTED_KILL_MS`. Out of scope until a design preserves the deterministic
  pacing proof.

## Ideas (not built)

- Floating damage / gold popups and a tap ripple — purely cosmetic; a candidate
  for the Phase 4b visual pass.
- Offline summary could show a per-stage "furthest stage reached" line.
- Bulk sell — would need a new engine action first; out of scope. (Bag *ordering* already ships:
  the bag lists items strongest-first by the engine power metric.)
- Number abbreviation (1.2K / 3.4M) for very large gold values — the renderer
  currently prints full integers so tests stay exact.
- **2026-09-27 Option A gold retune (drops stay primary; milestones now fire).** Supersedes the
  economy numbers in the entry above: `upgradeCostBase` 10→**3**, `upgradeCostGrowth` 6→**1.25**,
  `upgradeStatMultiplier` 1.05→**1.01** (`goldGrowth` stays 1.0). Flat income and the every-kill
  weapon replacement (`gearGrowth 1.2832` >> the per-level step) still bound gold, but item
  `upgradeLevel` peaks at 8–10 per item, so the every-3-levels milestone fires **21–27 times/run**
  (was 0–2). Current `npm run sim` is PACING OK: canonical soft 6.22 / hard 55.52; all-seed hard
  50.60–55.52; drops-primary net 97.3–98.6 % (down from 98.3–99.6 %, still the large majority). The
  weapon still absorbs most upgrades because it is the only unbounded lever; rings/necklaces saturate
  their caps early (crit mult by item level ~4), so gold there is frequently zero-gain. Sim now prints
  per-slot milestone counts and peak levels. Schema stays v4. See `decisions.md` (2026-09-27 Option A
  entry).
- **Per-enemy HP/gold curves are now the source of truth (supersedes the factor approach).** The 12
  enemies in `engine-core/src/content.ts` `ENEMY_ROSTER` each carry their OWN live
  `baseHp`/`hpGrowth`/`baseGold`/`goldGrowth` and `bossHpMultiplier`/`bossGoldMultiplier`;
  `enemyMaxHp(stage)`/`goldReward(stage)` compute directly from them (the enemy is a pure
  round-robin of `stage`, `enemyForStage`). The old `hpFactor`/`goldFactor` scheme and any global
  canonical curve are **gone** — the earlier "the new factors were placeholders" wording in the
  Phase-1 note above is historical. `BALANCE.baseHp`/`hpGrowth`/`baseGold`/`goldGrowth` survive only
  as documentation anchors the live curve does not read; `BALANCE.bossHpMultiplier`/
  `bossGoldMultiplier` were deleted. Every roster `hpGrowth` sits in a deliberately tight
  1.4273–1.4336 band so the round-robin stage curve keeps the pacing proof inside its window (the set
  came from a ~4,415-candidate measured search). Boss cadence is still global (`isBoss`, every 10th
  stage); boss size is per-enemy.
