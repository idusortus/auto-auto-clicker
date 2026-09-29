// content.ts — static game catalog.
//
// Definitions describe what gear and enemies exist; they are never persisted.
// Gear numbers come from BALANCE so gear tuning stays in one place.
//
// ENEMY HP/GOLD IS SINGLE-SOURCE-OF-TRUTH: each `EnemyDefinition` carries its own
// LIVE curve (`baseHp`/`hpGrowth`/`baseGold`/`goldGrowth`) and its own LIVE boss
// multipliers. `enemyMaxHpFor`/`goldRewardFor` below apply them directly; there is
// no global/canonical curve and no `hpFactor`/`goldFactor` scaling it. Boss
// CADENCE stays global (`isBoss(stage)` from balance.ts).
//
// `balance.ts` must NOT import this file (that would be an import cycle): the
// only dependency is this -> balance.

import { BALANCE, isBoss } from './balance';
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
// Enemy roster (F2 / M3a).
//
// Twelve distinct enemies with STABLE lowercase ids (identity, chosen once and
// never renamed). IDENTITY IS DERIVABLE FROM SAVED STATE: the roster is a pure
// function of `combat.stage` (`enemyForStage`), so a reloaded save reconstructs
// the same enemy with no new persisted field and no schema bump (stays v4).
//
// SINGLE SOURCE OF TRUTH: each enemy owns its REAL HP/gold curve
// (`baseHp`/`hpGrowth`/`baseGold`/`goldGrowth`) and its REAL boss multipliers
// (`bossHpMultiplier`/`bossGoldMultiplier`). These are LOAD-BEARING, not
// descriptive: `enemyMaxHp(stage)` / `goldReward(stage)` compute directly from
// them. There are no global factors and no canonical stage-only curve. Every one
// of the 12 `hpGrowth` values was measured INDIVIDUALLY by the search — nothing
// is derived from `archetype` at runtime.
//
// WHY THE GROWTH BAND IS TIGHT (the key design constraint, measured): with
// per-enemy curves the aggregate stage curve is the round-robin product of the
// roster's `hpGrowth` values, so WIDER divergence makes the stage sequence
// zig-zag and the pacing proof drift outside its window. The band is therefore
// deliberately narrow — 1.4273..1.4336 (span 0.0063, a stage-50 divergence of
// just 1.24x) — and that tightness is what keeps the proof valid. This set came
// from a ~4,415-candidate search that landed canonical soft ~6.22 min and hard
// ~55.52 min with all five seeds inside tolerance ("PACING OK").
//
// `archetype` IS INERT: a descriptive label chosen for flavour only. No live path
// reads it — no formula, no selection, no persistence. The measured curve numbers
// above are the truth; the label merely names that enemy's curve lean.
//
// BOSS CADENCE IS GLOBAL: `isBoss(stage)` (balance.ts, every 10th stage) decides
// WHEN a boss appears; each enemy's own `bossHpMultiplier`/`bossGoldMultiplier`
// decides HOW big that boss is. The multipliers are applied exactly once inside
// `enemyMaxHpFor`/`goldRewardFor`.
// ---------------------------------------------------------------------------

export const ENEMY_ROSTER: readonly EnemyDefinition[] = [
  { id: 'grunt',      archetype: 'balanced',     baseHp: 27, hpGrowth: 1.4284, baseGold: 5, goldGrowth: 1.0, bossHpMultiplier: 2.514, bossGoldMultiplier: 4.36 },
  { id: 'goblin',     archetype: 'skirmisher',   baseHp: 24, hpGrowth: 1.4280, baseGold: 5, goldGrowth: 1.0, bossHpMultiplier: 2.286, bossGoldMultiplier: 3.95 },
  { id: 'wolf',       archetype: 'harrier',      baseHp: 28, hpGrowth: 1.4283, baseGold: 4, goldGrowth: 1.0, bossHpMultiplier: 2.482, bossGoldMultiplier: 3.79 },
  { id: 'bat',        archetype: 'ambusher',     baseHp: 26, hpGrowth: 1.4273, baseGold: 5, goldGrowth: 1.0, bossHpMultiplier: 2.314, bossGoldMultiplier: 4.36 },
  { id: 'slime',      archetype: 'tank',         baseHp: 28, hpGrowth: 1.4329, baseGold: 5, goldGrowth: 1.0, bossHpMultiplier: 2.212, bossGoldMultiplier: 3.62 },
  { id: 'bandit',     archetype: 'racketeer',    baseHp: 28, hpGrowth: 1.4317, baseGold: 6, goldGrowth: 1.0, bossHpMultiplier: 2.072, bossGoldMultiplier: 4.05 },
  { id: 'spider',     archetype: 'swarm',        baseHp: 25, hpGrowth: 1.4288, baseGold: 5, goldGrowth: 1.0, bossHpMultiplier: 2.319, bossGoldMultiplier: 3.64 },
  { id: 'wraith',     archetype: 'revenant',     baseHp: 25, hpGrowth: 1.4311, baseGold: 7, goldGrowth: 1.0, bossHpMultiplier: 2.033, bossGoldMultiplier: 4.38 },
  { id: 'ogre',       archetype: 'bruiser',      baseHp: 27, hpGrowth: 1.4327, baseGold: 5, goldGrowth: 1.0, bossHpMultiplier: 2.171, bossGoldMultiplier: 3.69 },
  { id: 'harpy',      archetype: 'glass-cannon', baseHp: 24, hpGrowth: 1.4278, baseGold: 5, goldGrowth: 1.0, bossHpMultiplier: 2.476, bossGoldMultiplier: 3.68 },
  { id: 'golem',      archetype: 'bulwark',      baseHp: 29, hpGrowth: 1.4336, baseGold: 6, goldGrowth: 1.0, bossHpMultiplier: 2.235, bossGoldMultiplier: 3.84 },
  { id: 'dragonling', archetype: 'elite',        baseHp: 26, hpGrowth: 1.4281, baseGold: 5, goldGrowth: 1.0, bossHpMultiplier: 2.471, bossGoldMultiplier: 4.36 },
];

/**
 * The first roster entry, kept as an exported name for backward compatibility.
 * It is the roster's balanced first enemy; nothing is special-cased to it.
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

/**
 * Live max HP at `stage`: the standing enemy's own curve at that stage. Identity
 * and stats are both pure functions of `stage`, so this reconstructs from a save
 * with no persisted field.
 */
export function enemyMaxHp(stage: number): number {
  return enemyMaxHpFor(enemyForStage(stage), stage);
}

/**
 * Live kill gold at `stage`: the standing enemy's own curve at that stage.
 */
export function goldReward(stage: number): number {
  return goldRewardFor(enemyForStage(stage), stage);
}

/**
 * Live max HP for an EXPLICIT `enemy` at `stage`. The boss term is the enemy's
 * own `bossHpMultiplier`, applied only when `isBoss(stage)` (global cadence).
 */
export function enemyMaxHpFor(enemy: EnemyDefinition, stage: number): number {
  const s = Math.trunc(stage);
  if (!Number.isFinite(s) || s <= 0) return 0;
  const boss = isBoss(s) ? enemy.bossHpMultiplier : 1;
  return Math.floor(enemy.baseHp * Math.pow(enemy.hpGrowth, s - 1) * boss);
}

/**
 * Live kill gold for an EXPLICIT `enemy` at `stage`. Mirrors `enemyMaxHpFor`
 * with the enemy's own gold curve and `bossGoldMultiplier`.
 */
export function goldRewardFor(enemy: EnemyDefinition, stage: number): number {
  const s = Math.trunc(stage);
  if (!Number.isFinite(s) || s <= 0) return 0;
  const boss = isBoss(s) ? enemy.bossGoldMultiplier : 1;
  return Math.floor(enemy.baseGold * Math.pow(enemy.goldGrowth, s - 1) * boss);
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
