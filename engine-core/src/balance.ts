// balance.ts — the single file a tuner touches.
//
// Every gameplay number, pacing threshold, and economy formula lives here.
// Simulation code reads these helpers; it does not hardcode numbers.
//
// Economy shape (drops-primary): gear stats are EXPONENTIAL in item level
// (`floor(factor * gearGrowth^(itemLevel - 1))`), so frequent gear drops are the
// primary driver of power growth and track the exponential enemy-HP curve.
// Gold-funded upgrades are a minor smoothing lever: a small multiplicative bump
// (`upgradeStatMultiplier`) with steep cost growth, whose few affordable levels
// are reset when a stronger drop is equipped.

import type { GearDefinition, GearSlot } from './types';

/** Save schema version understood by this engine build. */
export const CURRENT_SAVE_VERSION = 3;

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

// Drops-primary tuning: enemy HP grows 1.42×/stage while the equipped weapon's
// stat grows ≈gearGrowth (1.283×) per item level. Because drops track the stage
// and almost every kill drops, player power grows ≈1.28×/stage and the
// designed fall-behind ratio (≈1.11) makes the stage-30 boss the soft check and
// the stage-50 boss the hard wall. Gold upgrades add a small multiplicative
// smoothing on top (1.05× per level, steep costs) and are reset by each equip.
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
    upgradeCostBase: 10,
    upgradeCostGrowth: 6,
    upgradeStatMultiplier: 1.05,
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

/** Projected time to kill the current enemy using auto DPS plus assumed active clicks. */
export function projectedKillMs(enemyHp: number, totalActiveDps: number): number {
  if (totalActiveDps <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil((enemyHp / totalActiveDps) * 1000);
}
