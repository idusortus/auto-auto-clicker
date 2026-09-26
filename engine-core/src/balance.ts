// balance.ts — the single file a tuner touches.
//
// Every gameplay number, pacing threshold, and economy formula lives here.
// Simulation code reads these helpers; it does not hardcode numbers.

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
 * Bounding the item level keeps a lucky drop a modest, small multiple of the
 * deterministic gold-funded upgrade curve instead of a stage-proportional
 * multiplier that swamps it.
 */
export const DROP_LEVEL_OFFSET = 6;

/**
 * Free-path choice grants are denominated in *upgrade levels* of the player's
 * current weapon, not in stage-scaled gold. They are therefore bounded and
 * translate directly into a predictable power bump for either path.
 */
export const WAIT_UPGRADE_GRANT_LEVELS = 2;
export const WATCH_AD_UPGRADE_GRANT_LEVELS = 4;

export const BALANCE = {
  baseHp: 25,
  hpGrowth: 1.5,
  baseGold: 8,
  goldGrowth: 1.45,
  bossStageInterval: 10,
  bossHpMultiplier: 100,
  bossGoldMultiplier: 4,
  baseAutoDps: 1,
  baseClickDamage: 2,
  gear: {
    slot: 'weapon' as const,
    dpsFactor: 2,
    clickFactor: 4,
    levelExponent: 1.4,
    upgradeCostBase: 10,
    upgradeCostGrowth: 1.35,
    upgradeStatMultiplier: 1.18,
    dropChance: 0.08,
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

export function gearBaseDps(itemLevel: number): number {
  return Math.floor(BALANCE.gear.dpsFactor * Math.pow(itemLevel, BALANCE.gear.levelExponent));
}

export function gearBaseClickDamage(itemLevel: number): number {
  return Math.floor(BALANCE.gear.clickFactor * Math.pow(itemLevel, BALANCE.gear.levelExponent));
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
  levelExponent: number,
  itemLevel: number,
  upgradeStatMultiplier: number,
  upgradeLevel: number,
): number {
  const base = Math.floor(factor * Math.pow(itemLevel, levelExponent));
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
      definition.levelExponent,
      itemLevel,
      definition.upgradeStatMultiplier,
      upgradeLevel,
    ),
    clickDamage: scaledGearStat(
      definition.clickFactor,
      definition.levelExponent,
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
