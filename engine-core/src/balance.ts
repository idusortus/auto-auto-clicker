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

import type { GearDefinition } from './types';

/** Save schema version understood by this engine build. */
export const CURRENT_SAVE_VERSION = 1;

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
} as const;

/** Boss stages occur every `bossStageInterval` stages (stage 1 is not a boss). */
export function isBoss(stage: number): boolean {
  return stage % BALANCE.bossStageInterval === 0;
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

/** Recompute an instance's battle stats from its definition, item level, and upgrade level. */
export function computeGearStats(
  definition: GearDefinition,
  itemLevel: number,
  upgradeLevel: number,
): { dps: number; clickDamage: number } {
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
  };
}

/** Projected time to kill the current enemy using auto DPS plus assumed active clicks. */
export function projectedKillMs(enemyHp: number, totalActiveDps: number): number {
  if (totalActiveDps <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil((enemyHp / totalActiveDps) * 1000);
}
