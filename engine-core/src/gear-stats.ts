// gear-stats.ts — derived gear reads: per-instance stats and the capped
// slot aggregations computed from a GameState.
//
// This is a LEAF module: it imports only balance.ts, content.ts, and types.ts.
// Nothing here may import state.ts or achievements.ts. Keeping these reads in a
// leaf lets both state.ts (wrapping them into effective DPS/projected kills) and
// achievements.ts (reading only `critChance`) depend on them without creating an
// import cycle between state and achievements.
//
// GameState persists SOURCE fields only, so every value here is recomputed on
// read — a balance/formula change cannot drift a persisted copy. Upgrade
// milestones are likewise derived from each item's `upgradeLevel` (see
// balance.ts) and folded into these same clamped aggregations.

import {
  ACTIVE_CLICKS_PER_SECOND,
  BALANCE,
  computeGearStats,
  CRIT_CHANCE_CAP,
  CRIT_MULTIPLIER_CAP,
  GEAR_SLOTS,
  GOLD_MULTIPLIER_CAP,
  POWER_MULTIPLIER_CAP,
  UPGRADE_MILESTONE_BONUS,
  upgradeMilestoneCount,
} from './balance';
import { gearDefinitionFor, WEAPON_DEFINITION } from './content';
import type { GearStats, MilestoneBonus } from './balance';
import type { GameState, GearInstance, GearSlot } from './types';

/**
 * Derived battle stats of a gear instance, resolved from its content
 * definition. Persisted `definitionId`s are guaranteed to resolve because
 * `parseGearInstance` rejects any id with no definition on load; the fallback
 * below only covers in-memory/internal callers (matching `actions.ts`).
 */
export function getGearStats(instance: GearInstance): GearStats {
  const definition = gearDefinitionFor(instance.definitionId) ?? WEAPON_DEFINITION;
  return computeGearStats(definition, instance.itemLevel, instance.upgradeLevel);
}

const NO_MILESTONE_BONUS: MilestoneBonus = {
  critChance: 0,
  critMultiplier: 0,
  goldMultiplier: 0,
  powerMultiplier: 0,
};

/**
 * Milestone contribution of the item equipped in `slot`: the per-slot bonus
 * times the number of whole `UPGRADE_MILESTONE_INTERVAL` steps reached. Zero
 * when nothing is equipped or no milestone has been reached. Derived from the
 * item's `upgradeLevel` on every read — never persisted (see balance.ts).
 */
function milestoneBonus(state: GameState, slot: GearSlot): MilestoneBonus {
  const item = state.gear.equipped[slot];
  if (!item) return NO_MILESTONE_BONUS;
  const count = upgradeMilestoneCount(item.upgradeLevel);
  if (count <= 0) return NO_MILESTONE_BONUS;
  const per = UPGRADE_MILESTONE_BONUS[slot];
  return {
    critChance: per.critChance * count,
    critMultiplier: per.critMultiplier * count,
    goldMultiplier: per.goldMultiplier * count,
    powerMultiplier: per.powerMultiplier * count,
  };
}

/**
 * Total critical chance and critical multiplier from all equipped gear. Every
 * slot is summed (only rings carry a raw crit contribution today, so a
 * non-ring's raw term is 0), plus each slot's derived milestone bonus. Both
 * totals are clamped at `CRIT_CHANCE_CAP` / `CRIT_MULTIPLIER_CAP`, which is what
 * bounds the exponential ring contribution AND the milestone channel: a
 * milestone can never push crit past the cap. A neutral state returns `{0, 1}`.
 */
export function getCritStats(state: GameState): { critChance: number; critMultiplier: number } {
  let critChance = 0;
  let critMultiplierBonus = 0;
  for (const slot of GEAR_SLOTS) {
    const item = state.gear.equipped[slot];
    if (item) {
      const stats = getGearStats(item);
      critChance += stats.critChance;
      critMultiplierBonus += stats.critMultiplier;
    }
    const milestone = milestoneBonus(state, slot);
    critChance += milestone.critChance;
    critMultiplierBonus += milestone.critMultiplier;
  }
  return {
    critChance: Math.min(CRIT_CHANCE_CAP, critChance),
    critMultiplier: Math.min(CRIT_MULTIPLIER_CAP, 1 + critMultiplierBonus),
  };
}

/**
 * Gold and power bonuses from all equipped gear: each slot's raw contribution
 * (only the necklace carries these today) plus its derived milestone bonus.
 * Both totals are clamped at `GOLD_MULTIPLIER_CAP` / `POWER_MULTIPLIER_CAP`, so
 * milestones inherit the same ceiling as ordinary gear. A neutral state returns
 * `{0, 0}`.
 */
export function getGlobalBonuses(state: GameState): {
  goldMultiplier: number;
  powerMultiplier: number;
} {
  let goldMultiplier = 0;
  let powerMultiplier = 0;
  for (const slot of GEAR_SLOTS) {
    const item = state.gear.equipped[slot];
    if (item) {
      const stats = getGearStats(item);
      goldMultiplier += stats.goldMultiplier;
      powerMultiplier += stats.powerMultiplier;
    }
    const milestone = milestoneBonus(state, slot);
    goldMultiplier += milestone.goldMultiplier;
    powerMultiplier += milestone.powerMultiplier;
  }
  return {
    goldMultiplier: Math.min(GOLD_MULTIPLIER_CAP, goldMultiplier),
    powerMultiplier: Math.min(POWER_MULTIPLIER_CAP, powerMultiplier),
  };
}

/**
 * True when no weapon is equipped. The weapon is the only item-level power
 * lever, so with none equipped the player's sustained DPS cannot grow with
 * progress; a gear-less player therefore has the constant base active DPS and
 * `getProjectedKillMs` collapses to a pure function of the enemy curve — the
 * wall becomes independent of gold, achievements, or non-weapon inventory.
 * Exposed so the pacing sim can surface that degenerate, policy-dependent case.
 */
export function isUnarmed(state: GameState): boolean {
  return state.gear.equipped.weapon === null;
}

/**
 * The player's SUSTAINED active DPS: auto DPS plus assumed clicks at the
 * critical/power-adjusted effective stats, EXCLUDING any temporary Golden-Event
 * frenzy multiplier. The stage-entry projection must measure sustained power so
 * a transient buff cannot decide whether a wall is raised.
 *
 * `getEffectiveStats` multiplies by the active boost; this recomputes the same
 * battle stats from the equipped weapon and the capped crit/power bonuses, which
 * by construction never include the boost. Keeping it in this leaf module is
 * required: the crit/power reads live here, and reading the boost directly from
 * `state.boost` (rather than importing `getBoostMultiplier`) keeps this module
 * from importing `state.ts`.
 */
export function sustainedActiveDps(state: GameState): number {
  const weapon = state.gear.equipped.weapon;
  const gear = weapon ? getGearStats(weapon) : null;
  const baseAutoDps = BALANCE.baseAutoDps + (gear ? gear.dps : 0);
  const baseClickDamage = BALANCE.baseClickDamage + (gear ? gear.clickDamage : 0);

  const { critChance, critMultiplier } = getCritStats(state);
  const { powerMultiplier } = getGlobalBonuses(state);
  const factor = (1 + critChance * (critMultiplier - 1)) * (1 + powerMultiplier);

  return (baseAutoDps + ACTIVE_CLICKS_PER_SECOND * baseClickDamage) * factor;
}
