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
  computeGearStats,
  CURRENT_SAVE_VERSION,
  enemyMaxHp,
  upgradeCost,
} from './balance';
import { gearDefinitionFor, WEAPON_DEFINITION } from './content';
import type { GameState, GearInstance, GearSlot, PendingChoice, SaveGame } from './types';

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
      equipped: { weapon: null },
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
    meta: { ...state.meta },
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
 * Derived battle stats of a gear instance, resolved from its content
 * definition. Persisted `definitionId`s are guaranteed to resolve because
 * `parseGearInstance` rejects any id with no definition on load; the fallback
 * below only covers in-memory/internal callers (matching `actions.ts`).
 */
export function getGearStats(instance: GearInstance): { dps: number; clickDamage: number } {
  const definition = gearDefinitionFor(instance.definitionId) ?? WEAPON_DEFINITION;
  return computeGearStats(definition, instance.itemLevel, instance.upgradeLevel);
}

/**
 * Max HP of the enemy at the state's current stage. The live enemy spawns at
 * full HP, so this is also the current enemy's starting HP.
 */
export function getEnemyMaxHp(state: GameState): number {
  return enemyMaxHp(state.combat.stage);
}

/** Effective auto DPS and click damage including the equipped weapon. */
export function getEffectiveStats(state: GameState): { autoDps: number; clickDamage: number } {
  const weapon = state.gear.equipped.weapon;
  const gear = weapon ? getGearStats(weapon) : null;
  return {
    autoDps: BALANCE.baseAutoDps + (gear ? gear.dps : 0),
    clickDamage: BALANCE.baseClickDamage + (gear ? gear.clickDamage : 0),
  };
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
const GEAR_SLOTS: readonly GearSlot[] = ['weapon'];

function parseEquipped(raw: unknown, context: string): Record<GearSlot, GearInstance | null> {
  const record = requireRecord(raw, `${context}.gear.equipped`);
  for (const key of Object.keys(record)) {
    if (!GEAR_SLOTS.includes(key as GearSlot)) {
      throw new Error(
        `Invalid save: ${context}.gear.equipped.${key} is not a known gear slot (expected ${GEAR_SLOTS.join(', ')})`,
      );
    }
  }
  const equipped: Record<GearSlot, GearInstance | null> = { weapon: null };
  for (const slot of GEAR_SLOTS) {
    if (!(slot in record)) continue;
    const value = record[slot];
    equipped[slot] =
      value === null ? null : parseGearInstance(value, `${context}.gear.equipped.${slot}`);
  }
  return equipped;
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
 * Build a version-2 GameState from a persisted state object, reading ONLY the
 * source fields — everything derived is recomputed on read. This works for both
 * a version-1 blob (whose extra derived fields are ignored) and a version-2 blob,
 * so it is the single parser behind hydration and migration.
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
 * Migrate a version-1 state object to version 2. Version 1 persisted derived
 * copies (`player.baseAutoDps`/`baseClickDamage`, `combat.enemyMaxHp`, and each
 * instance's `dps`/`clickDamage`); this reads only the source fields and drops
 * those copies, which are recomputed on read.
 */
export function migrateV1ToV2(raw: unknown): GameState {
  return parseState(raw, 'version 1');
}

/**
 * Validate and hydrate a save blob.
 *
 * Accepts version 1 (migrated to version 2) and version 2; any other version
 * throws. The returned state persists source fields only.
 */
export function loadGame(save: SaveGame): GameState {
  if (!save || typeof save.version !== 'number') {
    throw new Error('Invalid save: missing version');
  }
  if (save.version !== 1 && save.version !== CURRENT_SAVE_VERSION) {
    throw new Error(
      `Unsupported save version ${save.version}; expected 1 or ${CURRENT_SAVE_VERSION}`,
    );
  }
  if (save.state === null || typeof save.state !== 'object' || Array.isArray(save.state)) {
    throw new Error(`Invalid save: version ${save.version} has a missing or invalid state`);
  }
  return parseState(save.state, `version ${save.version}`);
}
