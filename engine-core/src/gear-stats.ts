// gear-stats.ts — derived gear reads: per-instance stats and the capped
// ring/necklace aggregations computed from a GameState.
//
// This is a LEAF module: it imports only balance.ts, content.ts, and types.ts.
// Nothing here may import state.ts or achievements.ts. Keeping these reads in a
// leaf lets both state.ts (wrapping them into effective DPS/projected kills) and
// achievements.ts (reading only `critChance`) depend on them without creating an
// import cycle between state and achievements.
//
// GameState persists SOURCE fields only, so every value here is recomputed on
// read — a balance/formula change cannot drift a persisted copy.

import {
  ACTIVE_CLICKS_PER_SECOND,
  BALANCE,
  computeGearStats,
  CRIT_CHANCE_CAP,
  CRIT_MULTIPLIER_CAP,
  GOLD_MULTIPLIER_CAP,
  POWER_MULTIPLIER_CAP,
} from './balance';
import { gearDefinitionFor, WEAPON_DEFINITION } from './content';
import type { GearStats } from './balance';
import type { GameState, GearInstance } from './types';

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

/**
 * Total critical chance and critical multiplier from both rings. `critChance` is
 * capped at `CRIT_CHANCE_CAP`; `critMultiplier` is the full multiplier
 * (`1 + sum of ring contributions`) clamped at `CRIT_MULTIPLIER_CAP`, so a
 * neutral state returns `{0, 1}` and the expected-DPS formula collapses to 1.
 * The clamp is what keeps the exponential ring contribution finite.
 */
export function getCritStats(state: GameState): { critChance: number; critMultiplier: number } {
  const rings = [state.gear.equipped.ring1, state.gear.equipped.ring2];
  let critChance = 0;
  let critMultiplierBonus = 0;
  for (const ring of rings) {
    if (!ring) continue;
    const stats = getGearStats(ring);
    critChance += stats.critChance;
    critMultiplierBonus += stats.critMultiplier;
  }
  return {
    critChance: Math.min(CRIT_CHANCE_CAP, critChance),
    critMultiplier: Math.min(CRIT_MULTIPLIER_CAP, 1 + critMultiplierBonus),
  };
}

/**
 * Necklace bonuses: `goldMultiplier` (additive bonus to gold gain) and
 * `powerMultiplier` (additive bonus to overall effective DPS). Both are 0 with
 * no necklace equipped and both are clamped at their caps so the exponential
 * necklace contribution cannot explode late.
 */
export function getGlobalBonuses(state: GameState): {
  goldMultiplier: number;
  powerMultiplier: number;
} {
  const necklace = state.gear.equipped.necklace;
  if (!necklace) return { goldMultiplier: 0, powerMultiplier: 0 };
  const stats = getGearStats(necklace);
  return {
    goldMultiplier: Math.min(GOLD_MULTIPLIER_CAP, stats.goldMultiplier),
    powerMultiplier: Math.min(POWER_MULTIPLIER_CAP, stats.powerMultiplier),
  };
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
