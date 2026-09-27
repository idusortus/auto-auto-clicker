// loot.ts — deterministic gear drops.
//
// Rolls consume RNG state from the passed draft and thread the new state back
// into draft.meta.rngState. Callers operate on a freshly cloned draft, never on
// the caller's input state.
//
// Every kill consumes EXACTLY two RNG draws, in a fixed order:
//   1. the global drop-chance roll (`BALANCE.gear.dropChance`);
//   2. the slot roll, mapped through `pickWeightedSlot` / `SLOT_DROP_WEIGHTS`.
// Consuming a fixed two draws per kill keeps the sampled stream reproducible
// regardless of which branch is taken, so the sim stays deterministic. Slot
// weighting lives in balance.ts alongside the drop chance.

import { BAG_CAP, BALANCE, DROP_LEVEL_OFFSET, pickWeightedSlot } from './balance';
import { CONTENT, gearDefinitionFor } from './content';
import { nextRng } from './rng';
import type { GearDefinition, GearInstance, GameState, GearSlot } from './types';

/** A slot's canonical definition. One definition per slot keeps routing a lookup. */
function definitionForSlot(slot: GearSlot): GearDefinition {
  const definition = CONTENT.gear[slot];
  return definition;
}

/** True when the player already has a weapon equipped or in the bag. */
function ownsWeapon(draft: GameState): boolean {
  if (draft.gear.equipped.weapon) return true;
  return draft.gear.bag.some((item) => gearDefinitionFor(item.definitionId)?.slot === 'weapon');
}

/**
 * Roll a drop for killing `stage`. On success the instance is added to the bag
 * and returned; the RNG is always advanced exactly twice per kill.
 *
 * The dropped item level tracks the killed stage (`DROP_LEVEL_OFFSET` is 0), so
 * the drop stream supplies the exponential power term that matches the enemy-HP
 * curve. `dropChance` is high: frequent sampling keeps the expected power on a
 * designed curve while drops remain the actual source of that power.
 *
 * The FIRST weapon is guaranteed: without one the player is unarmed forever
 * (no upgrades possible, base DPS fixed), which turns early luck into a hard
 * wall. Until a weapon is owned the slot roll is overridden to `'weapon'`.
 */
export function rollGearDrop(draft: GameState, stage: number): GearInstance | null {
  const dropRoll = nextRng(draft.meta.rngState);
  draft.meta.rngState = dropRoll.state;
  const slotRoll = nextRng(draft.meta.rngState);
  draft.meta.rngState = slotRoll.state;

  const hasWeapon = ownsWeapon(draft);
  if (dropRoll.value >= BALANCE.gear.dropChance && hasWeapon) return null;

  const slot: GearSlot = hasWeapon ? pickWeightedSlot(slotRoll.value) : 'weapon';
  const definition = definitionForSlot(slot);

  const itemLevel = Math.max(1, stage - DROP_LEVEL_OFFSET);
  const instance: GearInstance = {
    id: `gear-${draft.gear.nextInstanceId}`,
    definitionId: definition.id,
    itemLevel,
    upgradeLevel: 0,
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
