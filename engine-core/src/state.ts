// state.ts — state construction, cloning, derived reads, and save serialization.
//
// Everything here is pure: functions either build a new GameState or read one.
// cloneGameState is the single deep-copy used before any mutation so that
// advance/applyAction never touch their input.
//
// GameState persists SOURCE fields only. Every derived value is computed on
// read:
//   - gear battle stats  -> getGearStats(instance)            (computeGearStats)
//   - base auto/click    -> getEffectiveStats(state)          (BALANCE)
//   - enemy max HP       -> getEnemyMaxHp(state)              (enemyMaxHp(stage))
// A balance/formula change therefore cannot drift a persisted copy: there is
// no copy to drift.

import {
  ACTIVE_CLICKS_PER_SECOND,
  BALANCE,
  choiceGoldGrant,
  CURRENT_SAVE_VERSION,
  enemyMaxHp,
  goldReward,
  upgradeCost,
} from './balance';
import { gearDefinitionFor } from './content';
import { ACHIEVEMENTS } from './achievements';
import { getCritStats, getGearStats, getGlobalBonuses } from './gear-stats';
import type { GameState, GearInstance, GearSlot, PendingChoice, SaveGame } from './types';

// The derived gear reads live in the leaf module `gear-stats.ts` so that
// `achievements.ts` can read `getCritStats` without importing this module. They
// are re-exported here to keep the public surface of `state.ts` unchanged.
export { getCritStats, getGearStats, getGlobalBonuses } from './gear-stats';

/** Build a fresh game at stage 1. `now` defaults to 0 for deterministic tests. */
export function createGame(seed = 12345, now = 0): GameState {
  const stage = 1;
  return {
    meta: {
      saveVersion: CURRENT_SAVE_VERSION,
      seed,
      rngState: seed >>> 0,
      createdAt: now,
      totalPlayedMs: 0,
      achievements: [],
    },
    player: {
      gold: 0,
    },
    combat: {
      stage,
      enemyHp: enemyMaxHp(stage),
      damageCarry: 0,
    },
    gear: {
      equipped: { weapon: null, ring1: null, ring2: null, necklace: null },
      bag: [],
      nextInstanceId: 1,
    },
    choices: {
      pending: null,
    },
  };
}

/** Deep-copy a state so the caller can mutate the copy freely. */
export function cloneGameState(state: GameState): GameState {
  const equipped = {} as Record<GearSlot, GearInstance | null>;
  for (const slot of Object.keys(state.gear.equipped) as GearSlot[]) {
    const item = state.gear.equipped[slot];
    equipped[slot] = item ? { ...item } : null;
  }

  return {
    meta: { ...state.meta, achievements: [...state.meta.achievements] },
    player: { ...state.player },
    combat: { ...state.combat },
    gear: {
      equipped,
      bag: state.gear.bag.map((item) => ({ ...item })),
      nextInstanceId: state.gear.nextInstanceId,
    },
    choices: {
      pending: state.choices.pending
        ? { ...state.choices.pending, options: [...state.choices.pending.options] }
        : null,
    },
  };
}

/**
 * Max HP of the enemy at the state's current stage. The live enemy spawns at
 * full HP, so this is also the current enemy's starting HP.
 */
export function getEnemyMaxHp(state: GameState): number {
  return enemyMaxHp(state.combat.stage);
}

/**
 * Effective auto DPS and click damage including the equipped weapon and the
 * derived ring/necklace multipliers. Crit is an EXPECTED-DPS multiplier
 * (`1 + critChance * (critMultiplier - 1)`) and the necklace power bonus is
 * applied on top, so every consumer (sim, web, projection) sees the final
 * numbers automatically. The return SHAPE stays `{ autoDps, clickDamage }`;
 * the values may be fractional, and damage application floors them.
 */
export function getEffectiveStats(state: GameState): { autoDps: number; clickDamage: number } {
  const weapon = state.gear.equipped.weapon;
  const gear = weapon ? getGearStats(weapon) : null;
  const baseAutoDps = BALANCE.baseAutoDps + (gear ? gear.dps : 0);
  const baseClickDamage = BALANCE.baseClickDamage + (gear ? gear.clickDamage : 0);

  const { critChance, critMultiplier } = getCritStats(state);
  const { powerMultiplier } = getGlobalBonuses(state);
  const factor = (1 + critChance * (critMultiplier - 1)) * (1 + powerMultiplier);

  return {
    autoDps: baseAutoDps * factor,
    clickDamage: baseClickDamage * factor,
  };
}

/**
 * Gold awarded for killing `stage`, including the necklace gold bonus. This is
 * the single place gold-from-kills is computed, so the bonus cannot be applied
 * twice or forgotten.
 */
export function getGoldReward(state: GameState, stage: number): number {
  const { goldMultiplier } = getGlobalBonuses(state);
  return Math.floor(goldReward(stage) * (1 + goldMultiplier));
}

/**
 * Gold granted by a free-path choice, including the necklace gold bonus. Paired
 * with `getGoldReward` so every gold award routes through the same multiplier.
 */
export function getChoiceGoldGrant(
  state: GameState,
  currentUpgradeLevel: number,
  levels: number,
): number {
  const { goldMultiplier } = getGlobalBonuses(state);
  return Math.floor(choiceGoldGrant(currentUpgradeLevel, levels) * (1 + goldMultiplier));
}

/**
 * Projected time to kill the live enemy using auto DPS plus assumed active
 * clicks. Returns null when there is no live enemy.
 */
export function getProjectedKillMs(state: GameState): number | null {
  if (state.combat.enemyHp <= 0) return null;
  const stats = getEffectiveStats(state);
  const totalActiveDps = stats.autoDps + ACTIVE_CLICKS_PER_SECOND * stats.clickDamage;
  if (totalActiveDps <= 0) return null;
  return Math.ceil((state.combat.enemyHp / totalActiveDps) * 1000);
}

/** Cost to upgrade the equipped item in `slot`, or null when nothing is equipped. */
export function getUpgradeCost(state: GameState, slot: GearSlot): number | null {
  const item = state.gear.equipped[slot];
  if (!item) return null;
  return upgradeCost(item.upgradeLevel);
}

/** Wrap a state in the versioned save blob. `savedAt` defaults to 0 for determinism. */
export function saveGame(state: GameState, savedAt = 0): SaveGame {
  return {
    version: CURRENT_SAVE_VERSION,
    savedAt,
    state: cloneGameState(state),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid save: ${what} must be an object`);
  return value;
}

function requireFiniteNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid save: ${what} must be a finite number`);
  }
  return value;
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid save: ${what} must be a string`);
  return value;
}

/** Read a gear instance from a persisted blob, keeping only its source fields. */
function parseGearInstance(raw: unknown, what: string): GearInstance {
  const record = requireRecord(raw, what);
  const definitionId = requireString(record.definitionId, `${what}.definitionId`);
  if (!gearDefinitionFor(definitionId)) {
    throw new Error(
      `Invalid save: ${what}.definitionId "${definitionId}" does not match a known gear definition`,
    );
  }
  return {
    id: requireString(record.id, `${what}.id`),
    definitionId,
    itemLevel: requireFiniteNumber(record.itemLevel, `${what}.itemLevel`),
    upgradeLevel: requireFiniteNumber(record.upgradeLevel, `${what}.upgradeLevel`),
  };
}

/** Every gear slot the save schema understands. Unknown keys are rejected. */
const GEAR_SLOTS: readonly GearSlot[] = ['weapon', 'ring1', 'ring2', 'necklace'];

function parseEquipped(raw: unknown, context: string): Record<GearSlot, GearInstance | null> {
  const record = requireRecord(raw, `${context}.gear.equipped`);
  for (const key of Object.keys(record)) {
    if (!GEAR_SLOTS.includes(key as GearSlot)) {
      throw new Error(
        `Invalid save: ${context}.gear.equipped.${key} is not a known gear slot (expected ${GEAR_SLOTS.join(', ')})`,
      );
    }
  }
  const equipped: Record<GearSlot, GearInstance | null> = {
    weapon: null,
    ring1: null,
    ring2: null,
    necklace: null,
  };
  for (const slot of GEAR_SLOTS) {
    if (!(slot in record)) continue;
    const value = record[slot];
    equipped[slot] =
      value === null ? null : parseGearInstance(value, `${context}.gear.equipped.${slot}`);
  }
  return equipped;
}

/** Every catalog id, so a persisted id that no longer exists can be dropped. */
const KNOWN_ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(
  ACHIEVEMENTS.map((achievement) => achievement.id),
);

/**
 * Read the persisted unlocked-achievement ids. Missing (every pre-v3 blob) is
 * the empty list; present must be an array of strings. A non-string element is
 * still a hard error (the blob is corrupt), but ids absent from the current
 * catalog are dropped and duplicates are collapsed: the catalog is static
 * content that may change between builds, so an unknown/duplicate id recovers
 * by ignoring it instead of failing the whole save.
 */
function parseAchievements(raw: unknown, what: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error(`Invalid save: ${what} must be an array of strings`);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < raw.length; index += 1) {
    const id = requireString(raw[index], `${what}[${index}]`);
    if (!KNOWN_ACHIEVEMENT_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function parsePendingChoice(raw: unknown, what: string): PendingChoice | null {
  if (raw === null || raw === undefined) return null;
  const record = requireRecord(raw, what);
  const kind = record.kind;
  if (kind !== 'boss-check' && kind !== 'progression-wall') {
    throw new Error(`Invalid save: ${what}.kind must be 'boss-check' or 'progression-wall'`);
  }
  if (!Array.isArray(record.options)) {
    throw new Error(`Invalid save: ${what}.options must be an array`);
  }
  const options = record.options.map((option, index) => {
    if (option !== 'wait' && option !== 'watchAd' && option !== 'iap') {
      throw new Error(`Invalid save: ${what}.options[${index}] is not a valid choice option`);
    }
    return option;
  });
  return { kind, stage: requireFiniteNumber(record.stage, `${what}.stage`), options };
}

/**
 * Build a version-3 GameState from a persisted state object, reading ONLY the
 * source fields — everything derived is recomputed on read. Version 3 defaults
 * `gear.equipped` to the full four-slot map (`ring1`/`ring2`/`necklace` null
 * when absent) and `meta.achievements` to `[]`, so the same parser hydrates
 * hydration and every migration; v1/v2 blobs' extra or missing fields are
 * handled by defaulting rather than by bespoke per-version code.
 */
function parseState(raw: unknown, context: string): GameState {
  const record = requireRecord(raw, `${context} state`);

  const metaRaw = requireRecord(record.meta, `${context}.meta`);
  const meta: GameState['meta'] = {
    saveVersion: CURRENT_SAVE_VERSION,
    seed: requireFiniteNumber(metaRaw.seed, `${context}.meta.seed`),
    rngState: requireFiniteNumber(metaRaw.rngState, `${context}.meta.rngState`),
    createdAt: requireFiniteNumber(metaRaw.createdAt, `${context}.meta.createdAt`),
    totalPlayedMs: requireFiniteNumber(metaRaw.totalPlayedMs, `${context}.meta.totalPlayedMs`),
    achievements: parseAchievements(metaRaw.achievements, `${context}.meta.achievements`),
  };

  const playerRaw = requireRecord(record.player, `${context}.player`);
  const player: GameState['player'] = {
    gold: requireFiniteNumber(playerRaw.gold, `${context}.player.gold`),
  };

  const combatRaw = requireRecord(record.combat, `${context}.combat`);
  const combat: GameState['combat'] = {
    stage: requireFiniteNumber(combatRaw.stage, `${context}.combat.stage`),
    enemyHp: requireFiniteNumber(combatRaw.enemyHp, `${context}.combat.enemyHp`),
    damageCarry: requireFiniteNumber(combatRaw.damageCarry, `${context}.combat.damageCarry`),
  };

  const gearRaw = requireRecord(record.gear, `${context}.gear`);
  if (!Array.isArray(gearRaw.bag)) {
    throw new Error(`Invalid save: ${context}.gear.bag must be an array`);
  }
  const gear: GameState['gear'] = {
    equipped: parseEquipped(gearRaw.equipped, context),
    bag: gearRaw.bag.map((item, index) => parseGearInstance(item, `${context}.gear.bag[${index}]`)),
    nextInstanceId: requireFiniteNumber(gearRaw.nextInstanceId, `${context}.gear.nextInstanceId`),
  };

  const choicesRaw = requireRecord(record.choices, `${context}.choices`);
  const choices: GameState['choices'] = {
    pending: parsePendingChoice(choicesRaw.pending, `${context}.choices.pending`),
  };

  return { meta, player, combat, gear, choices };
}

/**
 * Migrate a version-1 state object forward. Version 1 persisted derived copies
 * (`player.baseAutoDps`/`baseClickDamage`, `combat.enemyMaxHp`, and each
 * instance's `dps`/`clickDamage`); this reads only the source fields and drops
 * those copies, which are recomputed on read. The parser also applies every
 * later default (four-slot `equipped`, `meta.achievements`), so v1 lands at v3
 * in one pass.
 */
export function migrateV1ToV2(raw: unknown): GameState {
  return parseState(raw, 'version 1');
}

/**
 * Migrate a version-2 state object to version 3. Version 2 predates ring and
 * necklace slots and achievements; the shared parser defaults
 * `equipped.ring1`/`ring2`/`necklace` to null and `meta.achievements` to `[]`
 * while preserving every version-2 source field.
 */
export function migrateV2ToV3(raw: unknown): GameState {
  return parseState(raw, 'version 2');
}

/**
 * Validate and hydrate a save blob.
 *
 * Accepts versions 1, 2, and 3; any other version throws. Version 1 and 2 blobs
 * are migrated forward through the same source-field parser. The returned state
 * persists source fields only.
 */
export function loadGame(save: SaveGame): GameState {
  if (!save || typeof save.version !== 'number') {
    throw new Error('Invalid save: missing version');
  }
  if (save.version !== 1 && save.version !== 2 && save.version !== CURRENT_SAVE_VERSION) {
    throw new Error(
      `Unsupported save version ${save.version}; expected 1, 2, or ${CURRENT_SAVE_VERSION}`,
    );
  }
  if (save.state === null || typeof save.state !== 'object' || Array.isArray(save.state)) {
    throw new Error(`Invalid save: version ${save.version} has a missing or invalid state`);
  }
  if (save.version === 1) return migrateV1ToV2(save.state);
  if (save.version === 2) return migrateV2ToV3(save.state);
  return parseState(save.state, 'version 3');
}
