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

// ---------------------------------------------------------------------------
// Enemy roster (F2).
//
// Twelve distinct enemies with STABLE lowercase ids (identity, chosen once and
// never renamed). IDENTITY IS DERIVABLE FROM SAVED STATE: the roster is a pure
// function of `combat.stage` (`enemyForStage`), so a reloaded save reconstructs
// the same enemy with no new persisted field and no schema bump (stays v4).
//
// Each entry has genuinely distinct stat numbers: `baseHp`/`hpGrowth`/
// `baseGold`/`goldGrowth` describe its own shape, and `hpFactor`/`goldFactor`
// express its relative lean, NORMALISED so the arithmetic mean over one full
// roster cycle is exactly 1.0 (asserted in enemy-roster.test.ts).
//
// PACING NEUTRALITY (measured, see decisions.md): the live blocking curve —
// `enemyMaxHp(stage)` for HP and `goldReward(stage)` for gold — stays EXACTLY
// the canonical stage-only curve. The per-enemy profile is a DERIVED layer:
// multiplying the canonical curve by the normalised factors (even with a cycle
// mean of 1) moves the pacing proof, because the stage sequence traverses
// individual enemies, not cycle averages. So combat uses the canonical curve and
// the profile is exposed for identity/presentation. Applying the profile to the
// live curve is the documented experiment that proved the tension.
// ---------------------------------------------------------------------------

export const ENEMY_ROSTER: readonly EnemyDefinition[] = [
  {
    id: 'grunt',
    archetype: 'balanced',
    baseHp: 30,
    hpGrowth: 1.42,
    baseGold: 5,
    goldGrowth: 1.0,
    bossStageInterval: BALANCE.bossStageInterval,
    bossHpMultiplier: BALANCE.bossHpMultiplier,
    bossGoldMultiplier: BALANCE.bossGoldMultiplier,
    hpFactor: 1.0,
    goldFactor: 1.0,
  },
  {
    id: 'goblin',
    archetype: 'skirmisher',
    baseHp: 26,
    hpGrowth: 1.4,
    baseGold: 6,
    goldGrowth: 1.0,
    bossStageInterval: BALANCE.bossStageInterval,
    bossHpMultiplier: BALANCE.bossHpMultiplier,
    bossGoldMultiplier: BALANCE.bossGoldMultiplier,
    hpFactor: 0.9,
    goldFactor: 1.1,
  },
  {
    id: 'wolf',
    archetype: 'glass-cannon',
    baseHp: 28,
    hpGrowth: 1.41,
    baseGold: 5,
    goldGrowth: 1.0,
    bossStageInterval: BALANCE.bossStageInterval,
    bossHpMultiplier: BALANCE.bossHpMultiplier,
    bossGoldMultiplier: BALANCE.bossGoldMultiplier,
    hpFactor: 0.95,
    goldFactor: 0.95,
  },
  {
    id: 'bat',
    archetype: 'swarm',
    baseHp: 23,
    hpGrowth: 1.39,
    baseGold: 5,
    goldGrowth: 1.0,
    bossStageInterval: BALANCE.bossStageInterval,
    bossHpMultiplier: BALANCE.bossHpMultiplier,
    bossGoldMultiplier: BALANCE.bossGoldMultiplier,
    hpFactor: 0.85,
    goldFactor: 1.05,
  },
  {
    id: 'slime',
    archetype: 'tank',
    baseHp: 32,
    hpGrowth: 1.44,
    baseGold: 4,
    goldGrowth: 1.0,
    bossStageInterval: BALANCE.bossStageInterval,
    bossHpMultiplier: BALANCE.bossHpMultiplier,
    bossGoldMultiplier: BALANCE.bossGoldMultiplier,
    hpFactor: 1.05,
    goldFactor: 0.9,
  },
  {
    id: 'bandit',
    archetype: 'racketeer',
    baseHp: 30,
    hpGrowth: 1.42,
    baseGold: 7,
    goldGrowth: 1.0,
    bossStageInterval: BALANCE.bossStageInterval,
    bossHpMultiplier: BALANCE.bossHpMultiplier,
    bossGoldMultiplier: BALANCE.bossGoldMultiplier,
    hpFactor: 1.0,
    goldFactor: 1.2,
  },
  {
    id: 'spider',
    archetype: 'ambusher',
    baseHp: 25,
    hpGrowth: 1.4,
    baseGold: 5,
    goldGrowth: 1.0,
    bossStageInterval: BALANCE.bossStageInterval,
    bossHpMultiplier: BALANCE.bossHpMultiplier,
    bossGoldMultiplier: BALANCE.bossGoldMultiplier,
    hpFactor: 0.9,
    goldFactor: 1.0,
  },
  {
    id: 'wraith',
    archetype: 'revenant',
    baseHp: 34,
    hpGrowth: 1.43,
    baseGold: 5,
    goldGrowth: 1.0,
    bossStageInterval: BALANCE.bossStageInterval,
    bossHpMultiplier: BALANCE.bossHpMultiplier,
    bossGoldMultiplier: BALANCE.bossGoldMultiplier,
    hpFactor: 1.1,
    goldFactor: 0.95,
  },
  {
    id: 'ogre',
    archetype: 'bruiser',
    baseHp: 37,
    hpGrowth: 1.45,
    baseGold: 5,
    goldGrowth: 1.0,
    bossStageInterval: BALANCE.bossStageInterval,
    bossHpMultiplier: BALANCE.bossHpMultiplier,
    bossGoldMultiplier: BALANCE.bossGoldMultiplier,
    hpFactor: 1.1,
    goldFactor: 0.95,
  },
  {
    id: 'harpy',
    archetype: 'harrier',
    baseHp: 27,
    hpGrowth: 1.41,
    baseGold: 6,
    goldGrowth: 1.0,
    bossStageInterval: BALANCE.bossStageInterval,
    bossHpMultiplier: BALANCE.bossHpMultiplier,
    bossGoldMultiplier: BALANCE.bossGoldMultiplier,
    hpFactor: 0.95,
    goldFactor: 1.1,
  },
  {
    id: 'golem',
    archetype: 'bulwark',
    baseHp: 40,
    hpGrowth: 1.46,
    baseGold: 3,
    goldGrowth: 1.0,
    bossStageInterval: BALANCE.bossStageInterval,
    bossHpMultiplier: BALANCE.bossHpMultiplier,
    bossGoldMultiplier: BALANCE.bossGoldMultiplier,
    hpFactor: 1.15,
    goldFactor: 0.7,
  },
  {
    id: 'dragonling',
    archetype: 'elite',
    baseHp: 33,
    hpGrowth: 1.43,
    baseGold: 6,
    goldGrowth: 1.0,
    bossStageInterval: BALANCE.bossStageInterval,
    bossHpMultiplier: BALANCE.bossHpMultiplier,
    bossGoldMultiplier: BALANCE.bossGoldMultiplier,
    hpFactor: 1.05,
    goldFactor: 1.1,
  },
];

/**
 * The first roster entry, kept as an exported name for backward compatibility.
 * It is the canonical balanced enemy; nothing is special-cased to it.
 */
export const GRUNT_DEFINITION: EnemyDefinition = ENEMY_ROSTER[0]!;

/**
 * Deterministically pick the enemy for `stage`: a pure round-robin over the
 * roster with ZERO RNG and ZERO persisted state. Boss status is independent
 * (`isBoss(stage)`), so a boss stage still raises the boss multipliers.
 */
export function enemyForStage(stage: number): EnemyDefinition {
  const size = ENEMY_ROSTER.length;
  const index = ((Math.trunc(stage) - 1) % size + size) % size;
  return ENEMY_ROSTER[index] ?? GRUNT_DEFINITION;
}

const ENEMY_DEFINITIONS: Record<string, EnemyDefinition> = Object.fromEntries(
  ENEMY_ROSTER.map((definition) => [definition.id, definition]),
);

export const CONTENT: {
  gear: {
    weapon: GearDefinition;
    ring1: GearDefinition;
    ring2: GearDefinition;
    necklace: GearDefinition;
  };
  enemies: Record<string, EnemyDefinition>;
} = {
  gear: {
    weapon: WEAPON_DEFINITION,
    ring1: RING_DEFINITION,
    ring2: RING_DEFINITION_2,
    necklace: NECKLACE_DEFINITION,
  },
  enemies: ENEMY_DEFINITIONS,
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
