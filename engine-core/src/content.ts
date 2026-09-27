// content.ts — static game catalog.
//
// Definitions describe what gear and enemies exist; they are never persisted.
// BALANCE supplies the numbers so tuning stays in one place.

import { BALANCE } from './balance';
import type { EnemyDefinition, GearDefinition } from './types';

export const WEAPON_DEFINITION: GearDefinition = {
  id: 'weapon',
  slot: 'weapon',
  dpsFactor: BALANCE.gear.dpsFactor,
  clickFactor: BALANCE.gear.clickFactor,
  gearGrowth: BALANCE.gear.gearGrowth,
  upgradeCostBase: BALANCE.gear.upgradeCostBase,
  upgradeCostGrowth: BALANCE.gear.upgradeCostGrowth,
  upgradeStatMultiplier: BALANCE.gear.upgradeStatMultiplier,
  dropChance: BALANCE.gear.dropChance,
  critChance: 0,
  critMultiplier: 0,
  goldMultiplier: 0,
  powerMultiplier: 0,
};

/**
 * Shared shape for the two ring slots. They are functionally identical; they
 * exist as two slot-bound definitions so `definitionId` -> slot routing stays
 * a pure lookup and a player can wear two rings at once. Copying the base into
 * both definitions (rather than resolving a slot at drop time) keeps the save
 * parser strict and `actions.equip` a one-liner.
 */
const RING_BASE = {
  dpsFactor: 0,
  clickFactor: 0,
  gearGrowth: BALANCE.gear.gearGrowth,
  upgradeCostBase: BALANCE.gear.upgradeCostBase,
  upgradeCostGrowth: BALANCE.gear.upgradeCostGrowth,
  upgradeStatMultiplier: BALANCE.gear.upgradeStatMultiplier,
  dropChance: BALANCE.gear.dropChance,
  critChance: BALANCE.ring.critChance,
  critMultiplier: BALANCE.ring.critMultiplier,
  goldMultiplier: 0,
  powerMultiplier: 0,
} as const;

export const RING_DEFINITION: GearDefinition = {
  id: 'ring1',
  slot: 'ring1',
  ...RING_BASE,
};

export const RING_DEFINITION_2: GearDefinition = {
  id: 'ring2',
  slot: 'ring2',
  ...RING_BASE,
};

export const NECKLACE_DEFINITION: GearDefinition = {
  id: 'necklace',
  slot: 'necklace',
  dpsFactor: 0,
  clickFactor: 0,
  gearGrowth: BALANCE.gear.gearGrowth,
  upgradeCostBase: BALANCE.gear.upgradeCostBase,
  upgradeCostGrowth: BALANCE.gear.upgradeCostGrowth,
  upgradeStatMultiplier: BALANCE.gear.upgradeStatMultiplier,
  dropChance: BALANCE.gear.dropChance,
  critChance: 0,
  critMultiplier: 0,
  goldMultiplier: BALANCE.necklace.goldMultiplier,
  powerMultiplier: BALANCE.necklace.powerMultiplier,
};

export const GRUNT_DEFINITION: EnemyDefinition = {
  id: 'grunt',
  baseHp: BALANCE.baseHp,
  hpGrowth: BALANCE.hpGrowth,
  baseGold: BALANCE.baseGold,
  goldGrowth: BALANCE.goldGrowth,
  bossStageInterval: BALANCE.bossStageInterval,
  bossHpMultiplier: BALANCE.bossHpMultiplier,
  bossGoldMultiplier: BALANCE.bossGoldMultiplier,
};

export const CONTENT: {
  gear: {
    weapon: GearDefinition;
    ring1: GearDefinition;
    ring2: GearDefinition;
    necklace: GearDefinition;
  };
  enemies: { grunt: EnemyDefinition };
} = {
  gear: {
    weapon: WEAPON_DEFINITION,
    ring1: RING_DEFINITION,
    ring2: RING_DEFINITION_2,
    necklace: NECKLACE_DEFINITION,
  },
  enemies: { grunt: GRUNT_DEFINITION },
};

/** Every gear definition keyed by `definitionId`. */
const GEAR_DEFINITIONS: Record<string, GearDefinition> = {
  [WEAPON_DEFINITION.id]: WEAPON_DEFINITION,
  [RING_DEFINITION.id]: RING_DEFINITION,
  [RING_DEFINITION_2.id]: RING_DEFINITION_2,
  [NECKLACE_DEFINITION.id]: NECKLACE_DEFINITION,
};

/**
 * Resolve a definition id to its gear definition, or null when unknown. All
 * definitions resolve through one map so adding content is a single entry.
 */
export function gearDefinitionFor(definitionId: string): GearDefinition | null {
  return GEAR_DEFINITIONS[definitionId] ?? null;
}
