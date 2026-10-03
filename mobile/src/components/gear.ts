// gear.ts — shared, pure gear projections used by more than one component.
//
// Every function here is a pure read of an engine getter or a state field: no
// balance number is computed or hard-coded in this file. The bag ordering uses
// the engine's own `scoreWithEquip` metric, so the shelf agrees with the upgrade
// advisory and the sim by construction.

import {
  gearDefinitionFor,
  getSlotUpgradeAdvisory,
  scoreWithEquip,
} from '@auto-auto-clicker/engine-core';
import type { GameState, GearInstance, GearSlot, SlotUpgradeAdvisory } from '@auto-auto-clicker/engine-core';

/** The slot a bag item occupies, resolved from its content definition. */
export function bagItemSlot(item: GearInstance): GearSlot {
  return gearDefinitionFor(item.definitionId)?.slot ?? 'weapon';
}

/** One advisory per equipment slot (the "better item in your bag" facts). */
export function upgradeAdvisories(state: GameState): Record<GearSlot, SlotUpgradeAdvisory> {
  const advisories = {} as Record<GearSlot, SlotUpgradeAdvisory>;
  for (const slot of ['weapon', 'ring1', 'ring2', 'necklace'] as const) {
    advisories[slot] = getSlotUpgradeAdvisory(state, slot);
  }
  return advisories;
}

/** The ids of bag items flagged as strictly better for their slot. */
export function bestBagIds(state: GameState): Set<string> {
  const advisories = upgradeAdvisories(state);
  const ids = new Set<string>();
  for (const slot of ['weapon', 'ring1', 'ring2', 'necklace'] as const) {
    const advisory = advisories[slot];
    if (advisory.hasUpgrade && advisory.bestInstanceId !== null) {
      ids.add(advisory.bestInstanceId);
    }
  }
  return ids;
}

/**
 * Bag items ordered strongest-first by the engine's shared power metric, with a
 * deterministic tie-break on item level then instance id.
 */
export function sortedBag(state: GameState): GearInstance[] {
  return state.gear.bag
    .map((item) => ({ item, score: scoreWithEquip(state, bagItemSlot(item), item) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.item.itemLevel !== a.item.itemLevel) return b.item.itemLevel - a.item.itemLevel;
      return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
    })
    .map((entry) => entry.item);
}
