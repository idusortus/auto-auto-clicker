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
  levelExponent: BALANCE.gear.levelExponent,
  upgradeCostBase: BALANCE.gear.upgradeCostBase,
  upgradeCostGrowth: BALANCE.gear.upgradeCostGrowth,
  upgradeStatMultiplier: BALANCE.gear.upgradeStatMultiplier,
  dropChance: BALANCE.gear.dropChance,
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
  gear: { weapon: GearDefinition };
  enemies: { grunt: EnemyDefinition };
} = {
  gear: { weapon: WEAPON_DEFINITION },
  enemies: { grunt: GRUNT_DEFINITION },
};

/**
 * Resolve a definition id to its gear definition.
 * Only one gear definition exists for now; this is the seam for adding more.
 */
export function gearDefinitionFor(definitionId: string): GearDefinition | null {
  if (definitionId === WEAPON_DEFINITION.id) return WEAPON_DEFINITION;
  return null;
}
