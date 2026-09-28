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

/**
 * A slot's canonical definition. One definition per slot keeps routing a lookup.
 * Also the Shiny `drop` reward's target slot (`grantGearDrop`): the WEAPON slot
 * is for the stage-starved drop stream, the RING slot for the guaranteed ring.
 */
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
  return makeDrop(draft, slot, stage);
}

/**
 * Grant the Shiny `drop` reward: a GUARANTEED ring at the CURRENT stage, placed
 * in whichever ring slot is currently weaker (an empty slot counts as weakest),
 * so the drop is a real, felt upgrade to the player's crit levers rather than a
 * downgrade the greedy equip policy would ignore.
 *
 * The slot is RING-ONLY on purpose, and NO RNG draw is consumed:
 *   - Rings are the DESIGNED bounded secondary lever: their contribution is
 *     clamped by `CRIT_CHANCE_CAP` / `CRIT_MULTIPLIER_CAP`, so a ring can never
 *     outgrow the enemy-HP curve. Measured: a guaranteed same-stage *weapon*
 *     leapfrogs the equipped weapon (it lets the current stage's loot fight the
 *     current stage) and pushed the hard wall from stage 50 to **59** with an
 *     ~100 min canonical run; a same-stage ring does not move the wall stage.
 *   - Consuming no draw means granting it cannot shift the loot stream at all,
 *     so its only effect on pacing is the item itself.
 *   - It reuses the same `makeDrop` / `addToBag` pipeline every kill uses, so
 *     the item level tracks the stage and the bag-cap / first-weapon rules apply.
 */
export function grantGearDrop(draft: GameState, stage: number): GearInstance {
  return makeDrop(draft, weakerRingSlot(draft), stage);
}

/** The ring slot holding the lower item level; an empty slot (level 0) loses. */
function weakerRingSlot(draft: GameState): GearSlot {
  const ring1 = draft.gear.equipped.ring1;
  const ring2 = draft.gear.equipped.ring2;
  const level1 = ring1 ? ring1.itemLevel : 0;
  const level2 = ring2 ? ring2.itemLevel : 0;
  return level1 <= level2 ? 'ring1' : 'ring2';
}

/** Build a stage-tracking instance for `slot`, add it to the bag, return it. */
function makeDrop(draft: GameState, slot: GearSlot, stage: number): GearInstance {
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
