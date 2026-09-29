// balance.ts — the single file a tuner touches.
//
// Every gameplay number, pacing threshold, and economy formula lives here.
// Simulation code reads these helpers; it does not hardcode numbers.
//
// Economy shape (drops-primary): gear stats are EXPONENTIAL in item level
// (`floor(factor * gearGrowth^(itemLevel - 1))`), so frequent gear drops are the
// primary driver of power growth and track the exponential enemy-HP curve.
// Gold-funded upgrades are a minor smoothing lever: a small multiplicative bump
// (`upgradeStatMultiplier`, ~1% per level) on a FLAT-ish cost curve
// (`upgradeCostBase` 3, `upgradeCostGrowth` 1.25), so a run affords a steady
// stream of levels — enough for the every-3-levels milestones to fire — while
// the total power they add stays small next to the drop stream (which replaces
// the weapon long before an upgrade stack can rival a single extra item level).

import type { GearDefinition, GearSlot, ShinyKind } from './types';

/** Save schema version understood by this engine build. */
export const CURRENT_SAVE_VERSION = 4;

/**
 * Every gear slot, in one canonical order. This is the single ordered list the
 * engine aggregates over (gear stats, milestones, save parsing), so adding a
 * slot is one entry here rather than several independent arrays.
 */
export const GEAR_SLOTS: readonly GearSlot[] = ['weapon', 'ring1', 'ring2', 'necklace'];

/**
 * Hard ceiling on total critical chance from all slots. Critical strikes are
 * modelled as an EXPECTED-DPS multiplier (not a per-hit roll) so the engine
 * stays deterministic and `getProjectedKillMs` stays exact; without a cap the
 * exponential ring scaling could drive expected DPS to infinity.
 */
export const CRIT_CHANCE_CAP = 0.75;

/**
 * Hard ceilings on the TOTAL multiplicative bonuses from rings and the necklace.
 *
 * Ring/necklace contributions scale by `gearGrowth^(itemLevel - 1)` exactly like
 * the weapon's raw stats, but they are *multiplicative* on top of those stats.
 * An exponential lever compounded multiplicatively explodes (a single item-level
 * 50 ring contributes ~20000 to the crit multiplier), which would let a real
 * player trivialise the enemy-HP curve and would make the pacing proof
 * meaningless. The weapon stays the single unbounded exponential power lever;
 * these caps bound the secondary slots so their effect is real but finite.
 *
 * Crit is an expected-DPS multiplier, so the total crit multiplier is clamped
 * (not just the chance). All three are applied in the `getCritStats` /
 * `getGlobalBonuses` getters, never to the raw per-item content values.
 */
export const CRIT_MULTIPLIER_CAP = 1.18;
export const POWER_MULTIPLIER_CAP = 0.02;
/**
 * The gold cap is looser than the power/crit caps on purpose: kill gold is a
 * flat base (goldGrowth 1.0), so a bonus below ~20% is erased by the integer
 * floor in `getGoldReward` and the necklace's gold lever would be invisible.
 * 25% moves the readout while gold stays the deliberately minor lever.
 */
export const GOLD_MULTIPLIER_CAP = 0.25;

// ---------------------------------------------------------------------------
// Upgrade milestones — the visible "spike" between walls.
//
// Gold-funded upgrades are deliberately tiny (`upgradeStatMultiplier` = 1.01)
// on a flat cost curve, so a run buys a steady stream of levels; every
// `UPGRADE_MILESTONE_INTERVAL` levels in a single equipped item, that slot
// instead takes a VISIBLE step: a small extra boost to the capped secondary
// stats (crit chance / crit damage / gold / power).
//
// DERIVED, NEVER PERSISTED: the bonus is a pure function of an item's
// `upgradeLevel`, computed on read in the state getters. There is no new save
// field and no schema bump (stays v4) — a milestone cannot drift from the level
// that earned it, and it is regained automatically if a save is reloaded.
//
// CAPPED BY CONSTRUCTION: milestones feed the SAME clamped aggregations as
// ordinary gear (`getCritStats` / `getGlobalBonuses`), so they can never exceed
// CRIT_CHANCE_CAP / CRIT_MULTIPLIER_CAP / POWER_MULTIPLIER_CAP /
// GOLD_MULTIPLIER_CAP. Gold stays the minor lever: a single milestone is ~0.5–1%
// of a capped stat, and the whole milestone channel is bounded by those caps.
//
// SLOT → STAT: each slot boosts the stat it already owns — rings boost crit,
// the necklace boosts gold/power, and the weapon (which has no secondary stat of
// its own) boosts overall power. A slot that would grant nothing (e.g. the
// necklace's power already saturating `POWER_MULTIPLIER_CAP`) simply contributes
// nothing to the clamped total, which is the intended ceiling.
//
// INTERVAL: 3, not the sketched 5. The flat Option A cost curve (base 3, growth
// 1.25) now affords ~8–11 upgrade levels on a long-lived item, so 3 fires
// repeatedly (~2–3 milestones per weapon life) instead of being unreachable
// content; 5 would still leave most items with only one step. Measured after the
// retune: 14–25 milestone events per run across the five sim seeds, per-slot
// peak level 8–9.
//
// DETERMINISM: no RNG, no clock. `upgradeMilestoneCount` is a pure floor.
// ---------------------------------------------------------------------------

/** Upgrade levels in one item per milestone step. */
export const UPGRADE_MILESTONE_INTERVAL = 3;

/** The four capped secondary stats a milestone can boost. */
export interface MilestoneBonus {
  critChance: number;
  critMultiplier: number;
  goldMultiplier: number;
  powerMultiplier: number;
}

/** Per-milestone bonus, by slot. All values feed the existing capped stats. */
export const UPGRADE_MILESTONE_BONUS: Record<GearSlot, MilestoneBonus> = {
  weapon: { critChance: 0, critMultiplier: 0, goldMultiplier: 0, powerMultiplier: 0.01 },
  ring1: { critChance: 0.015, critMultiplier: 0.015, goldMultiplier: 0, powerMultiplier: 0 },
  ring2: { critChance: 0.015, critMultiplier: 0.015, goldMultiplier: 0, powerMultiplier: 0 },
  // Gold only: a necklace's power base (0.05) already exceeds
  // POWER_MULTIPLIER_CAP (0.02), so a power milestone there would be dead on
  // arrival (see the necklace note on BALANCE below).
  necklace: { critChance: 0, critMultiplier: 0, goldMultiplier: 0.01, powerMultiplier: 0 },
};

/**
 * Milestones achieved at `upgradeLevel` (whole steps only). Floors, so 0–2
 * levels is always 0 at interval 3. Non-finite/negative input is 0.
 */
export function upgradeMilestoneCount(upgradeLevel: number): number {
  if (!Number.isFinite(upgradeLevel) || upgradeLevel <= 0) return 0;
  return Math.floor(upgradeLevel / UPGRADE_MILESTONE_INTERVAL);
}

/**
 * Per-slot drop sampling weights. `rollGearDrop` first rolls the global
 * `gear.dropChance` for "does anything drop", then picks a slot in proportion
 * to these weights.
 *
 * The weapon weight must dominate: the weapon is the only unbounded
 * exponential power lever, so a thinned weapon stream means the equipped weapon
 * lags the stage by ~2 item levels, clears slow down, and the soft boss check
 * lands late. When rings were weighted 0.25 apiece the weapon weight was 1.0 of
 * a 1.52 total, so only ~66% of drops were weapons and the soft check drifted to
 * ~7.2–7.6 min (out of the ±20% window). At 0.04 apiece the weapon share is
 * ~91%, the weapon tracks the stage again, and the pacing proof lands inside its
 * window. Rings/necklaces are secondary, bounded levers (see the caps above);
 * necklaces stay deliberately rarer at 0.02.
 */
export const SLOT_DROP_WEIGHTS: Record<GearSlot, number> = {
  weapon: 1.0,
  ring1: 0.04,
  ring2: 0.04,
  necklace: 0.02,
};

/** Boss stages must fall within this projected kill time or a choice is offered. */
export const BOSS_TIMER_MS = 60_000;

/** Entering any stage slower than this projected kill time raises a progression wall. */
export const HARD_WALL_PROJECTED_KILL_MS = 600_000;

/** Assumed human click rate used for projected-kill math. */
export const ACTIVE_CLICKS_PER_SECOND = 2;

/** Maximum number of unequipped gear instances kept in the bag. */
export const BAG_CAP = 24;

// ---------------------------------------------------------------------------
// Upgrade/stall advisory windows (guidance only — no pacing effect).
//
// A player who equipped a weak item while a strictly better one sits in the bag
// can stall indefinitely (the projection stays finite-but-slow, so no wall
// fires). The engine SURFACES the facts and lets the PLAYER decide; it never
// auto-equips. These two windows drive how loudly the facts are stated:
//   - STALL_HINT_MS: after this much time with NO stage progress (measured from
//     the host-supplied stage anchor) the advisory escalates to `hint`.
//   - STALL_NAG_MS:  after this much time the advisory escalates to `nag`, which
//     the renderer turns into a prominent callout the player can act on.
// Both conditions (stalled AND a better item available) are always required, so
// a legitimately-walled player is never nagged. These are presentation
// thresholds, not economy numbers, and they never enter the pacing sim.
// ---------------------------------------------------------------------------

/** No stage progress for this long + a better item available → `hint`. */
export const STALL_HINT_MS = 15_000;

/** No stage progress for this long + a better item available → `nag`. */
export const STALL_NAG_MS = 45_000;


/**
 * Dropped gear spawns at `max(1, stage - DROP_LEVEL_OFFSET)`.
 *
 * The offset is zero: a killed stage reliably yields a weapon whose item level
 * tracks that stage, so the drop stream (not the gold curve) supplies the
 * exponential power term. `dropChance` supplies the sampling; the item level
 * itself is a modest integer in lockstep with the stage.
 */
export const DROP_LEVEL_OFFSET = 0;

/**
 * Free-path choice grants are denominated in *upgrade levels* of the player's
 * current weapon, not in stage-scaled gold. They are therefore bounded and
 * translate directly into a predictable (small) power bump for either path.
 */
export const WAIT_UPGRADE_GRANT_LEVELS = 2;
export const WATCH_AD_UPGRADE_GRANT_LEVELS = 4;

// ---------------------------------------------------------------------------
// Golden Events ("Shinies") — bonus-only wandering Stray Goblin.
//
// A Shiny spawns on a schedule, wanders for a short window, and is claimed by a
// tap. Missing it costs NOTHING (it just leaves). A claim rolls one of THREE
// reward kinds (`shinySpawnRoll`):
//   - `frenzy` a short, dramatic TEMPO burst (temporary damage multiplier);
//   - `drop`   a GUARANTEED drop at the current stage into the player's weaker
//              ring slot (a drop, on the DESIGNED bounded-lever curve);
//   - `cache`  a lump of gold (the deliberately minor lever).
//
// Every number below is a pacing knob:
//   - SHINY_BASE_CADENCE_MS    steady-state gap between spawns (idle play).
//   - SHINY_TUTORIAL_DELAYS_MS the first N spawn delays, so a new player meets
//                              the mechanic early and then it settles to base.
//   - SHINY_MIN_GAP_MS         floor on any single gap, so events never clump.
//   - SHINY_WINDOW_MS          how long the tap target stays claimable.
//   - SHINY_SPAWN_CHANCE       probability an eligible roll spawns.
//   - SHINY_FRENZY_SHARE       share of spawns that are `frenzy`.
//   - SHINY_DROP_SHARE         share of spawns that are `drop` (the rest cache).
//   - SHINY_FRENZY_MULTIPLIER  temporary damage multiplier while active.
//   - SHINY_FRENZY_DURATION_MS how long that multiplier lasts.
//   - SHINY_CACHE_GOLD_MULTIPLE lump of gold = this multiple × the stage's
//                              (necklace-adjusted) `goldReward`.
//
// WHY THIS IS WALL-INERT (the invariant the previous round established, kept):
//   A stage-entry projection in `getProjectedKillMs` measures the stage's MAX HP
//   against SUSTAINED power (`sustainedActiveDps`), which EXCLUDES the temporary
//   boost. A frenzy can therefore only make a stage CLEAR FASTER; it can never
//   decide WHETHER a boss check / progression wall is raised.
//
// WHAT A FELT FRENZY *CAN* STILL DO — and its hard bound:
//   Speeding up clears shortens the WALL-CLOCK time at which the wall fires. That
//   effect is bounded by construction. A boost that runs for D ms at multiplier M
//   delivers exactly D·(M−1) ms of extra time-equivalent damage, INDEPENDENT of
//   stage and DPS: the extra damage is (M−1)·dps·D, and it is divided by the same
//   dps the stage is already measured against. So over a run the frenzy can save
//   at most
//       (frenzy claims) × D × (M−1)                          [the wall budget]
//   and `shiny.test.ts` pins the per-claim budget `D × (M−1)` to a small fixed
//   ceiling. With a modest `frenzy` share the run-wide saving stays inside the
//   slack the canonical hard window leaves above the no-Shiny baseline; the sim
//   prints the measured per-seed effect (spawns/claims/mix/uptime).
//
// WHY THE `drop` KIND LANDS IN A RING SLOT (measured, see decisions.md):
//   A guaranteed DROP is on the designed curve only while it cannot leapfrog the
//   equipped WEAPON. A same-stage weapon drop gives the player the item the NEXT
//   kill would produce, so the current stage's loot fights the current stage; it
//   compounds and moved the hard wall from stage 50 to stage 59 (canonical run
//   ~100 min) with an untouched window. Rings/necklaces are the designed BOUNDED
//   secondary levers (clamped by CRIT_CHANCE_CAP / CRIT_MULTIPLIER_CAP /
//   POWER_MULTIPLIER_CAP), so a guaranteed same-stage ring is a real, felt
//   upgrade that cannot outgrow the enemy-HP curve. `grantGearDrop` therefore
//   fills the weaker ring slot and draws NO RNG, so it cannot even shift the loot
//   stream.
//
// TUNING (2026-09-27, Option 3 — felt but wall-neutral): the frenzy is a ~6 s
// ×3 tempo burst at a ~30% share; `drop` and `cache` are the common, immediately
// rewarding kinds (30% / 40%). The cadence was lengthened to 151 s, which lifts
// the canonical hard baseline to ~51.9 min (comfortable floor 48) and so leaves
// the slack the bounded rewards consume. Measured final values: canonical hard
// 49.55 min, all seeds 43.90–45.90 min, boost uptime 0.9–2.2% per seed.
// ---------------------------------------------------------------------------

/** Steady-state gap between Shiny spawns during idle play. */
export const SHINY_BASE_CADENCE_MS = 151_000;

/**
 * Spawn delay (ms) for the first spawns, indexed by the number of Shinies that
 * have ALREADY spawned. After the table is exhausted the base cadence applies.
 */
export const SHINY_TUTORIAL_DELAYS_MS: readonly number[] = [25_000, 70_000];

/** Hard floor on any gap, so two events can never clump. */
export const SHINY_MIN_GAP_MS = 20_000;

/** How long a spawned Shiny stays claimable. */
export const SHINY_WINDOW_MS = 10_000;

/** Probability that an eligible RNG roll spawns a Shiny (1 = always). */
export const SHINY_SPAWN_CHANCE = 1;

/** Share of spawned Shinies that are `frenzy` (the rare, flashy reward). */
export const SHINY_FRENZY_SHARE = 0.3;

/** Share of spawned Shinies that are `drop` (the rest are `cache`). */
export const SHINY_DROP_SHARE = 0.3;

/** Temporary damage multiplier granted by a `frenzy` Shiny. */
export const SHINY_FRENZY_MULTIPLIER = 3;

/** How long a `frenzy` multiplier lasts. Short on purpose: the per-claim wall
 * budget is `duration × (multiplier − 1)` and the test pins it to a ceiling. */
export const SHINY_FRENZY_DURATION_MS = 6_000;

/** A `cache` Shiny grants this multiple of the stage's `goldReward`. */
export const SHINY_CACHE_GOLD_MULTIPLE = 2;

/**
 * Delay before the spawn after `spawned` prior spawns. Uses the tutorial table
 * while it lasts, then the base cadence, and never less than the minimum gap.
 * Non-integer/negative input falls through to the base cadence.
 */
export function shinySpawnDelayMs(spawned: number): number {
  const tutorial =
    Number.isInteger(spawned) && spawned >= 0 ? SHINY_TUTORIAL_DELAYS_MS[spawned] : undefined;
  const base = tutorial === undefined ? SHINY_BASE_CADENCE_MS : tutorial;
  return Math.max(SHINY_MIN_GAP_MS, base);
}

/**
 * Resolve one uniform `[0, 1)` roll into "does it spawn" and "which kind". The
 * kind roll is normalised by the spawn chance so the reward mix is independent
 * of `SHINY_SPAWN_CHANCE`. The first `SHINY_FRENZY_SHARE` of the range is
 * `frenzy`, the next `SHINY_DROP_SHARE` is `drop`, and the remainder is `cache`.
 */
export function shinySpawnRoll(roll: number): { spawns: boolean; kind: ShinyKind } {
  const spawns = Number.isFinite(roll) && roll < SHINY_SPAWN_CHANCE;
  const kindRoll = SHINY_SPAWN_CHANCE > 0 ? roll / SHINY_SPAWN_CHANCE : 0;
  const dropThreshold = SHINY_FRENZY_SHARE + SHINY_DROP_SHARE;
  const kind: ShinyKind =
    kindRoll < SHINY_FRENZY_SHARE ? 'frenzy' : kindRoll < dropThreshold ? 'drop' : 'cache';
  return { spawns, kind };
}

// Drops-primary tuning: enemy HP grows 1.42×/stage while the equipped weapon's
// stat grows ≈gearGrowth (1.283×) per item level. Because drops track the stage
// and almost every kill drops, player power grows ≈1.28×/stage and the
// designed fall-behind ratio (≈1.11) makes the stage-30 boss the soft check and
// the stage-50 boss the hard wall. Gold upgrades add a small multiplicative
// smoothing on top (1.01× per level, flat-ish costs) and are reset by each equip;
// because `gearGrowth` (1.283) still dwarfs `upgradeStatMultiplier` (1.01), a
// newer drop beats any affordable upgrade stack, so the weapon keeps tracking
// the stage and gold stays a minor (non-compounding) lever.
export const BALANCE = {
  baseHp: 30,
  hpGrowth: 1.42,
  baseGold: 5,
  // Flat gold: upgrades are a minor lever, not a competing exponential, so gold
  // income must not outpace the (level-indexed) upgrade costs.
  goldGrowth: 1.0,
  bossStageInterval: 10,
  bossHpMultiplier: 2.25,
  bossGoldMultiplier: 4,
  baseAutoDps: 2,
  baseClickDamage: 2,
  gear: {
    slot: 'weapon' as const,
    dpsFactor: 2,
    clickFactor: 8,
    gearGrowth: 1.283,
    // OPTION A RETUNE (2026-09-27): a LEGIBLE, flat-ish curve.
    //
    // Before: base 10 / growth 6 / stat 1.05. A whole 50-stage run earns ~305
    // kill gold + a little choice gold, so the cumulative cost (10, 70, 430 …)
    // bought ~2 levels per run and item `upgradeLevel` peaked at 2–7 — the
    // every-3-levels milestone channel was effectively dead content (0–2
    // milestone events per run, measured).
    //
    // After: base 3 / growth 1.25 / stat 1.01. Against the same flat income this
    // affords ~8–11 levels on an item that lives long enough, so milestones at
    // 3 / 6 / 9 genuinely fire and repeat (measured ~14–25 milestone events per
    // run across the five sim seeds; per-item peak 8–9).
    //
    // WHY THE STAT MULTIPLIER DROPPED TOO (1.05 → 1.01): gold must stay a MINOR
    // lever, not a second exponential. A cheap curve alone lets a weapon reach
    // `gearGrowth > upgradeStatMultiplier^L` (L ≈ 6 at 1.05), so the equipped
    // weapon stops being replaced by the next drop and gold power compounds —
    // pushing the hard wall below its floor. Keeping each level a ~1% nudge
    // means a +1 item-level drop (×1.283) still beats ANY affordable upgrade
    // stack (it takes ~25 levels at 1.01 to match one item level), so the
    // weapon keeps tracking the stage and gold stays the smoothing lever. The
    // per-level effect is deliberately small; the VISIBLE step is the milestone.
    upgradeCostBase: 3,
    upgradeCostGrowth: 1.25,
    upgradeStatMultiplier: 1.01,
    dropChance: 0.95,
  },
  // Non-weapon gear contributions (content, never persisted). Base values are
  // at item level 1 and scale by `gearGrowth^(itemLevel - 1)` exactly like the
  // weapon stats, but unlike the weapon they are CLAMPED by CRIT_MULTIPLIER_CAP
  // / CRIT_CHANCE_CAP / POWER_MULTIPLIER_CAP / GOLD_MULTIPLIER_CAP in the state
  // getters, so the weapon remains the single exponential power lever. Note the
  // necklace power base (0.05) already exceeds POWER_MULTIPLIER_CAP (0.02), so
  // ANY necklace saturates the power bonus immediately by design; only the ring
  // crit bonuses and the necklace gold bonus grow before hitting their caps.
  ring: {
    critChance: 0.02,
    critMultiplier: 0.05,
  },
  necklace: {
    goldMultiplier: 0.05,
    powerMultiplier: 0.05,
  },
} as const;

/** Boss stages occur every `bossStageInterval` stages (stage 1 is not a boss). */
export function isBoss(stage: number): boolean {
  return stage % BALANCE.bossStageInterval === 0;
}

/**
 * Deterministically map a uniform `[0, 1)` roll to a gear slot in proportion to
 * `SLOT_DROP_WEIGHTS`. Kept here with the weights so tuning a single table
 * changes the drop distribution. Falls back to `'weapon'` for a non-finite roll
 * or a degenerate (all-zero) table.
 */
export function pickWeightedSlot(roll: number): GearSlot {
  const slots = Object.keys(SLOT_DROP_WEIGHTS) as GearSlot[];
  let total = 0;
  for (const slot of slots) total += SLOT_DROP_WEIGHTS[slot];
  if (!Number.isFinite(roll) || total <= 0) return 'weapon';

  let threshold = roll * total;
  for (const slot of slots) {
    threshold -= SLOT_DROP_WEIGHTS[slot];
    if (threshold < 0) return slot;
  }
  return slots[slots.length - 1] ?? 'weapon';
}

export function enemyMaxHp(stage: number): number {
  const bossMultiplier = isBoss(stage) ? BALANCE.bossHpMultiplier : 1;
  return Math.floor(BALANCE.baseHp * Math.pow(BALANCE.hpGrowth, stage - 1) * bossMultiplier);
}

export function goldReward(stage: number): number {
  const bossMultiplier = isBoss(stage) ? BALANCE.bossGoldMultiplier : 1;
  return Math.floor(BALANCE.baseGold * Math.pow(BALANCE.goldGrowth, stage - 1) * bossMultiplier);
}

/** Base weapon DPS at `itemLevel`, before any upgrade levels (exponential). */
export function gearBaseDps(itemLevel: number): number {
  return Math.floor(BALANCE.gear.dpsFactor * Math.pow(BALANCE.gear.gearGrowth, itemLevel - 1));
}

/** Base weapon click damage at `itemLevel`, before any upgrade levels (exponential). */
export function gearBaseClickDamage(itemLevel: number): number {
  return Math.floor(BALANCE.gear.clickFactor * Math.pow(BALANCE.gear.gearGrowth, itemLevel - 1));
}

export function applyUpgradeMultiplier(base: number, upgradeLevel: number): number {
  return Math.floor(base * Math.pow(BALANCE.gear.upgradeStatMultiplier, upgradeLevel));
}

export function upgradeCost(upgradeLevel: number): number {
  return Math.floor(BALANCE.gear.upgradeCostBase * Math.pow(BALANCE.gear.upgradeCostGrowth, upgradeLevel));
}

/**
 * Gold granted by a free-path choice: exactly `levels` upgrades worth, starting
 * from the equipped weapon's current upgrade level. Bounded and independent of
 * the pending stage, so it cannot inject a stage-scaled windfall.
 */
export function choiceGoldGrant(currentUpgradeLevel: number, levels: number): number {
  let total = 0;
  for (let i = 0; i < levels; i += 1) total += upgradeCost(currentUpgradeLevel + i);
  return total;
}

function scaledGearStat(
  factor: number,
  gearGrowth: number,
  itemLevel: number,
  upgradeStatMultiplier: number,
  upgradeLevel: number,
): number {
  const base = Math.floor(factor * Math.pow(gearGrowth, itemLevel - 1));
  return Math.floor(base * Math.pow(upgradeStatMultiplier, upgradeLevel));
}

/**
 * Scale a fractional effect contribution (crit/gold/power) by item level and
 * upgrade level. Unlike `scaledGearStat` there is NO floor: these are fractions
 * (chance/multiplier bonuses), flooring would erase them.
 */
function scaledGearBonus(
  base: number,
  gearGrowth: number,
  itemLevel: number,
  upgradeStatMultiplier: number,
  upgradeLevel: number,
): number {
  return base * Math.pow(gearGrowth, itemLevel - 1) * Math.pow(upgradeStatMultiplier, upgradeLevel);
}

/**
 * Derived battle stats and effect contributions of one gear instance. `dps` and
 * `clickDamage` are integers; the four effect fields are fractions.
 */
export interface GearStats {
  dps: number;
  clickDamage: number;
  critChance: number;
  critMultiplier: number;
  goldMultiplier: number;
  powerMultiplier: number;
}

/** Recompute an instance's battle stats from its definition, item level, and upgrade level. */
export function computeGearStats(
  definition: GearDefinition,
  itemLevel: number,
  upgradeLevel: number,
): GearStats {
  return {
    dps: scaledGearStat(
      definition.dpsFactor,
      definition.gearGrowth,
      itemLevel,
      definition.upgradeStatMultiplier,
      upgradeLevel,
    ),
    clickDamage: scaledGearStat(
      definition.clickFactor,
      definition.gearGrowth,
      itemLevel,
      definition.upgradeStatMultiplier,
      upgradeLevel,
    ),
    critChance: scaledGearBonus(
      definition.critChance,
      definition.gearGrowth,
      itemLevel,
      definition.upgradeStatMultiplier,
      upgradeLevel,
    ),
    critMultiplier: scaledGearBonus(
      definition.critMultiplier,
      definition.gearGrowth,
      itemLevel,
      definition.upgradeStatMultiplier,
      upgradeLevel,
    ),
    goldMultiplier: scaledGearBonus(
      definition.goldMultiplier,
      definition.gearGrowth,
      itemLevel,
      definition.upgradeStatMultiplier,
      upgradeLevel,
    ),
    powerMultiplier: scaledGearBonus(
      definition.powerMultiplier,
      definition.gearGrowth,
      itemLevel,
      definition.upgradeStatMultiplier,
      upgradeLevel,
    ),
  };
}

/**
 * Projected time to kill the current enemy using auto DPS plus assumed active
 * clicks. The result depends on the CALLER'S CURRENT `totalActiveDps`, so the
 * same stage projects differently as the player's gear changes. For an unarmed
 * player that DPS is a constant (no item-level power lever), so the projection
 * collapses to a pure function of `enemyHp`/the enemy curve; once a weapon is
 * equipped the projection tracks the weapon's item level. This is what makes the
 * derived wall timing policy-dependent rather than a fixed property of the game.
 */
export function projectedKillMs(enemyHp: number, totalActiveDps: number): number {
  if (totalActiveDps <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil((enemyHp / totalActiveDps) * 1000);
}

// ---------------------------------------------------------------------------
// Enemy taunts (F3) — deterministic catchphrase cadence.
//
// These knobs are PRESENTATION-ADJACENT (they decide how often the engine
// emits an `enemyTaunt` cue) but live here with every other tunable. They are
// deliberately NOT pacing knobs: taunts are emitted on a SEPARATE derived RNG
// channel (see taunts.ts), never through `meta.rngState`, so changing any of
// these cannot move the pacing proof. The sim ignores `enemyTaunt` events
// entirely; the empty `npm run sim` diff is the check.
//
// `phraseIndex` is emitted as a BOUNDED integer in `[0, TAUNT_NOMINAL_PHRASES)`;
// a renderer resolves the wording and MUST reduce out-of-range indices with
// modulo (a theme may ship fewer phrases than the nominal count). Bounding keeps
// the event shape stable and testable; the theme still owns the text.
// ---------------------------------------------------------------------------

/** Nominal number of phrases per taunt kind the bounded `phraseIndex` addresses. */
export const TAUNT_NOMINAL_PHRASES = 6;

/** Chance a normal enemy kill emits a `defeat` taunt. */
export const TAUNT_DEFEAT_CHANCE = 0.25;

/** Chance a boss kill emits a `bossDefeat` taunt. */
export const TAUNT_BOSS_DEFEAT_CHANCE = 0.8;

/** Chance entering a stage emits a `spawn` taunt. */
export const TAUNT_SPAWN_CHANCE = 0.3;

/** Chance a progression wall / boss-check failure emits a `wall` taunt. */
export const TAUNT_WALL_CHANCE = 1;

/** Chance a Shiny spawn (or claim) emits a `shiny` taunt. */
export const TAUNT_SHINY_CHANCE = 0.5;

/** Long ambient cadence: at most one `ambient` taunt per crossing of this gap. */
export const TAUNT_AMBIENT_INTERVAL_MS = 45_000;

/** Chance an ambient interval crossing emits an `ambient` taunt. */
export const TAUNT_AMBIENT_CHANCE = 0.4;
