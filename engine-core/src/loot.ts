// loot.ts — deterministic gear drops.
//
// Rolls consume RNG state from the passed draft and thread the new state back
// into draft.meta.rngState. Callers operate on a freshly cloned draft, never on
// the caller's input state.

import { BAG_CAP, computeGearStats, DROP_LEVEL_OFFSET } from './balance';
import { WEAPON_DEFINITION } from './content';
import { nextRng } from './rng';
import type { GearInstance, GameState } from './types';

/**
 * Roll a drop for killing `stage`. On success the instance is added to the bag
 * and returned; the RNG is always advanced exactly once per kill.
 *
 * The dropped item level trails the killed stage by DROP_LEVEL_OFFSET so gear
 * stays a bounded bonus relative to the deterministic upgrade curve.
 *
 * The FIRST weapon is guaranteed: without one the player is unarmed forever
 * (no upgrades possible, base DPS fixed), which turns early luck into a hard
 * wall. Guaranteeing it makes the power core deterministic; later drops remain
 * ordinary bounded-roll bonuses.
 */
export function rollGearDrop(draft: GameState, stage: number): GearInstance | null {
  const roll = nextRng(draft.meta.rngState);
  draft.meta.rngState = roll.state;
  const ownsWeapon = draft.gear.equipped.weapon !== null || draft.gear.bag.length > 0;
  if (roll.value >= WEAPON_DEFINITION.dropChance && ownsWeapon) return null;

  const itemLevel = Math.max(1, stage - DROP_LEVEL_OFFSET);
  const stats = computeGearStats(WEAPON_DEFINITION, itemLevel, 0);
  const instance: GearInstance = {
    id: `gear-${draft.gear.nextInstanceId}`,
    definitionId: WEAPON_DEFINITION.id,
    itemLevel,
    upgradeLevel: 0,
    dps: stats.dps,
    clickDamage: stats.clickDamage,
  };
  draft.gear.nextInstanceId += 1;
  addToBag(draft, instance);
  return instance;
}

/** Add an instance to the bag, evicting the lowest-itemLevel entry when full. */
export function addToBag(draft: GameState, instance: GearInstance): void {
  if (draft.gear.bag.length >= BAG_CAP) {
    let lowestIndex = 0;
    let lowestLevel = draft.gear.bag[0]?.itemLevel ?? Number.POSITIVE_INFINITY;
    for (let i = 1; i < draft.gear.bag.length; i += 1) {
      const item = draft.gear.bag[i];
      if (item && item.itemLevel < lowestLevel) {
        lowestLevel = item.itemLevel;
        lowestIndex = i;
      }
    }
    draft.gear.bag.splice(lowestIndex, 1);
  }
  draft.gear.bag.push(instance);
}
