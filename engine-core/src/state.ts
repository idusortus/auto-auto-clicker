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
  BALANCE,
  choiceGoldGrant,
  CURRENT_SAVE_VERSION,
  enemyMaxHp,
  GEAR_SLOTS,
  goldReward,
  projectedKillMs,
  SHINY_CACHE_GOLD_MULTIPLE,
  shinySpawnDelayMs,
  UPGRADE_MILESTONE_BONUS,
  UPGRADE_MILESTONE_INTERVAL,
  upgradeCost,
  upgradeMilestoneCount,
} from './balance';
import { gearDefinitionFor } from './content';
import { ACHIEVEMENTS } from './achievements';
import { getCritStats, getGearStats, getGlobalBonuses, sustainedActiveDps } from './gear-stats';
import { ACTIVE_THEME } from './theme';
import type {
  ActiveBoost,
  ActiveShiny,
  GameState,
  GearInstance,
  GearSlot,
  PendingChoice,
  SaveGame,
  ShinyKind,
} from './types';

// The derived gear reads live in the leaf module `gear-stats.ts` so that
// `achievements.ts` can read `getCritStats` without importing this module. They
// are re-exported here to keep the public surface of `state.ts` unchanged.
export {
  getCritStats,
  getGearStats,
  getGlobalBonuses,
  isUnarmed,
  powerScore,
  scoreWithEquip,
  sustainedActiveDps,
} from './gear-stats';

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
    event: {
      active: null,
      spawned: 0,
      // The first Shiny arrives on the tutorial cadence, so a new player meets
      // the mechanic early instead of waiting a full base cadence.
      nextSpawnAtMs: shinySpawnDelayMs(0),
    },
    boost: null,
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
    event: {
      active: state.event.active ? { ...state.event.active } : null,
      spawned: state.event.spawned,
      nextSpawnAtMs: state.event.nextSpawnAtMs,
    },
    boost: state.boost ? { ...state.boost } : null,
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
 * Effective auto DPS and click damage including the equipped weapon, the
 * derived ring/necklace multipliers, and any active Golden-Event frenzy boost.
 * Crit is an EXPECTED-DPS multiplier (`1 + critChance * (critMultiplier - 1)`)
 * and the necklace power bonus is applied on top, so every consumer (sim, web,
 * projection) sees the final numbers automatically. The return SHAPE stays
 * `{ autoDps, clickDamage }`; the values may be fractional, and damage
 * application floors them.
 */
export function getEffectiveStats(state: GameState): { autoDps: number; clickDamage: number } {
  const weapon = state.gear.equipped.weapon;
  const gear = weapon ? getGearStats(weapon) : null;
  const baseAutoDps = BALANCE.baseAutoDps + (gear ? gear.dps : 0);
  const baseClickDamage = BALANCE.baseClickDamage + (gear ? gear.clickDamage : 0);

  const { critChance, critMultiplier } = getCritStats(state);
  const { powerMultiplier } = getGlobalBonuses(state);
  const factor =
    (1 + critChance * (critMultiplier - 1)) * (1 + powerMultiplier) * getBoostMultiplier(state);

  return {
    autoDps: baseAutoDps * factor,
    clickDamage: baseClickDamage * factor,
  };
}

/**
 * The currently-active Shiny, or null. A Shiny whose window has elapsed is
 * treated as absent even before `advance` clears it, so the tap target
 * disappears the moment it can no longer be claimed.
 */
export function getActiveEvent(state: GameState): ActiveShiny | null {
  const active = state.event.active;
  if (!active) return null;
  if (active.expiresAtMs <= state.meta.totalPlayedMs) return null;
  return active;
}

/**
 * The currently-active frenzy boost, or null. While a choice is pending the
 * world is frozen (`meta.totalPlayedMs` does not advance), so a running boost
 * pauses with it and resumes on the same clock.
 */
export function getActiveBoost(state: GameState): ActiveBoost | null {
  const boost = state.boost;
  if (!boost) return null;
  if (boost.expiresAtMs <= state.meta.totalPlayedMs) return null;
  return boost;
}

/** Active frenzy damage multiplier (1 when no boost is running). */
export function getBoostMultiplier(state: GameState): number {
  const boost = getActiveBoost(state);
  return boost ? boost.dpsMultiplier : 1;
}

/**
 * Gold granted by a `cache` Shiny at `stage`: a fixed multiple of the stage's
 * (necklace-adjusted) kill reward, so it scales with the same economy as kills
 * and routes the necklace gold bonus through the one existing multiplier.
 */
export function getShinyCacheGold(state: GameState, stage: number): number {
  return Math.floor(getGoldReward(state, stage) * SHINY_CACHE_GOLD_MULTIPLE);
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
 * Projected time to kill the CURRENT enemy from FULL health, measured against
 * the stage's MAX HP and the player's SUSTAINED active power (auto DPS plus
 * assumed clicks). Returns null when there is no live enemy (`enemyHp <= 0`)
 * and when nothing deals damage (`sustainedActiveDps(state) <= 0`).
 *
 * Two properties matter here, both required for the stage-entry wall check:
 *
 *  1. MAX HP, not the live `enemyHp`. The projection measures the enemy's total
 *     toughness, so it is independent of how much damage has already landed and
 *     of exactly when the check runs. A mid-fight or re-entrant call cannot
 *     under-report the projection and miss a wall.
 *
 *  2. SUSTAINED power, not temporarily-boosted power. `getEffectiveStats` folds
 *     in the active Golden-Event frenzy multiplier; the projection uses the
 *     sustained active DPS from `gear-stats.ts`, which excludes that temporary
 *     boost. A transient buff can therefore only make a stage *clear faster* —
 *     it can never decide *whether* a boss check / progression wall is raised.
 *     Without this, a boost active at stage entry would launder a permanent
 *     wall-pass (observed: an unarmed player's stage-19 wall was skipped while a
 *     ×5 frenzy ran).
 *
 *  3. The player's CURRENT sustained power, which makes the projection a function
 *     of BOTH the enemy curve and the gear the player actually holds.
 *     `sustainedActiveDps` derives from the equipped weapon plus the capped
 *     crit/power bonuses, so equipping or upgrading changes it. With NO weapon
 *     equipped the player has no item-level power lever, so sustained DPS cannot
 *     grow with progress; for a GEAR-LESS player it is exactly the constant base
 *     active DPS, and `getProjectedKillMs` degenerates to a PURE FUNCTION OF
 *     `combat.stage`: the wall is then unavoidable and identical regardless of
 *     gold, achievements, or non-weapon inventory. That is why wall timing is
 *     POLICY-dependent — the canonical sim policy and an unarmed/passive
 *     playstyle reach the walls at different stages and times.
 *     `isUnarmed(state)` reports the no-weapon case.
 */
export function getProjectedKillMs(state: GameState): number | null {
  if (state.combat.enemyHp <= 0) return null;
  const dps = sustainedActiveDps(state);
  const projected = projectedKillMs(enemyMaxHp(state.combat.stage), dps);
  return Number.isFinite(projected) ? projected : null;
}

/** Cost to upgrade the equipped item in `slot`, or null when nothing is equipped. */
export function getUpgradeCost(state: GameState, slot: GearSlot): number | null {
  const item = state.gear.equipped[slot];
  if (!item) return null;
  return upgradeCost(item.upgradeLevel);
}

/**
 * Milestone status of one slot at a given upgrade level. Derived purely from
 * `upgradeLevel` and the balance knobs — nothing here is persisted (see the
 * milestone block in balance.ts), so no save-schema change is needed.
 */
export interface MilestoneInfo {
  slot: GearSlot;
  /** Upgrade levels per milestone step. */
  interval: number;
  /** Whole milestones reached at this level. */
  achievedCount: number;
  /** Upgrade level that reaches the next milestone. */
  nextAtLevel: number;
  /** Human-readable per-milestone bonus, worded from the balance numbers. */
  bonusDescription: string;
}

/** Format a fractional bonus as a percentage (e.g. 0.015 -> "1.5%"). */
function formatBonusPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Wording for one milestone's bonus, built from `UPGRADE_MILESTONE_BONUS` so a
 * renderer never holds a balance number. Only the non-zero parts are listed.
 */
function describeMilestoneBonus(slot: GearSlot): string {
  const bonus = UPGRADE_MILESTONE_BONUS[slot];
  const copy = ACTIVE_THEME.slots.milestone.bonus;
  const parts: string[] = [];
  if (bonus.critChance > 0) parts.push(copy.crit(formatBonusPercent(bonus.critChance)));
  if (bonus.critMultiplier > 0) {
    parts.push(copy.critDamage(formatBonusPercent(bonus.critMultiplier)));
  }
  if (bonus.goldMultiplier > 0) parts.push(copy.gold(formatBonusPercent(bonus.goldMultiplier)));
  if (bonus.powerMultiplier > 0) {
    parts.push(copy.power(formatBonusPercent(bonus.powerMultiplier)));
  }
  return parts.join(copy.separator);
}

/**
 * Milestone info for `slot` at `upgradeLevel`. Pure: a function of the level and
 * the balance knobs only, so a host can query a hypothetical level.
 */
export function getMilestoneInfo(slot: GearSlot, upgradeLevel: number): MilestoneInfo {
  const achievedCount = upgradeMilestoneCount(upgradeLevel);
  return {
    slot,
    interval: UPGRADE_MILESTONE_INTERVAL,
    achievedCount,
    nextAtLevel: (achievedCount + 1) * UPGRADE_MILESTONE_INTERVAL,
    bonusDescription: describeMilestoneBonus(slot),
  };
}

/**
 * Milestone info for every equipped slot, keyed by slot; empty slots are null.
 * Derived on read, so a reloaded save reconstructs its badges automatically.
 */
export function getSlotMilestones(state: GameState): Record<GearSlot, MilestoneInfo | null> {
  const milestones = {} as Record<GearSlot, MilestoneInfo | null>;
  for (const slot of GEAR_SLOTS) {
    const item = state.gear.equipped[slot];
    milestones[slot] = item ? getMilestoneInfo(slot, item.upgradeLevel) : null;
  }
  return milestones;
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

/** Gear slots are the canonical `GEAR_SLOTS` order; unknown keys are rejected. */
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

function requireNonNegativeInteger(value: unknown, what: string): number {
  const number = requireFiniteNumber(value, what);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`Invalid save: ${what} must be a non-negative integer`);
  }
  return number;
}

function parseActiveShiny(raw: unknown, what: string): ActiveShiny {
  const record = requireRecord(raw, what);
  const kind = record.kind;
  if (kind !== 'frenzy' && kind !== 'cache' && kind !== 'drop') {
    throw new Error(`Invalid save: ${what}.kind must be 'frenzy', 'cache', or 'drop'`);
  }
  return {
    kind: kind as ShinyKind,
    spawnedAtMs: requireFiniteNumber(record.spawnedAtMs, `${what}.spawnedAtMs`),
    expiresAtMs: requireFiniteNumber(record.expiresAtMs, `${what}.expiresAtMs`),
  };
}

/**
 * Read the Golden-Event block. Missing (every pre-v4 blob) defaults to "no
 * active Shiny, none spawned yet, first spawn on the tutorial cadence".
 */
function parseEvent(raw: unknown, what: string): GameState['event'] {
  if (raw === null || raw === undefined) {
    return { active: null, spawned: 0, nextSpawnAtMs: shinySpawnDelayMs(0) };
  }
  const record = requireRecord(raw, what);
  const activeRaw = record.active;
  return {
    active:
      activeRaw === null || activeRaw === undefined ? null : parseActiveShiny(activeRaw, `${what}.active`),
    spawned: requireNonNegativeInteger(record.spawned, `${what}.spawned`),
    nextSpawnAtMs: requireFiniteNumber(record.nextSpawnAtMs, `${what}.nextSpawnAtMs`),
  };
}

/** Read the frenzy boost. Missing/null (every pre-v4 blob) means no boost. */
function parseBoost(raw: unknown, what: string): ActiveBoost | null {
  if (raw === null || raw === undefined) return null;
  const record = requireRecord(raw, what);
  return {
    dpsMultiplier: requireFiniteNumber(record.dpsMultiplier, `${what}.dpsMultiplier`),
    expiresAtMs: requireFiniteNumber(record.expiresAtMs, `${what}.expiresAtMs`),
  };
}

/**
 * Build a current-version GameState from a persisted state object, reading ONLY
 * the source fields — everything derived is recomputed on read. The parser
 * defaults every field introduced after an older version, so it hydrates a
 * current save and migrates v1/v2/v3 blobs in the same pass: `gear.equipped`
 * gets the full four-slot map, `meta.achievements` defaults to `[]`, and
 * `event`/`boost` default to "a fresh Golden-Event schedule / no boost".
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

  const event = parseEvent(record.event, `${context}.event`);
  const boost = parseBoost(record.boost, `${context}.boost`);

  return { meta, player, combat, gear, choices, event, boost };
}

/**
 * Migrate a version-1 state object forward. Version 1 persisted derived copies
 * (`player.baseAutoDps`/`baseClickDamage`, `combat.enemyMaxHp`, and each
 * instance's `dps`/`clickDamage`); this reads only the source fields and drops
 * those copies, which are recomputed on read. The parser applies every later
 * default (four-slot `equipped`, `meta.achievements`, `event`/`boost`), so v1
 * lands at the current version in one pass.
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
 * Migrate a version-3 state object to version 4. Version 3 predates Golden
 * Events; the shared parser defaults `event` to "no active Shiny, none spawned,
 * first spawn on the tutorial cadence" and `boost` to null while preserving
 * every version-3 source field.
 */
export function migrateV3ToV4(raw: unknown): GameState {
  return parseState(raw, 'version 3');
}

/**
 * Validate and hydrate a save blob.
 *
 * Accepts versions 1, 2, 3, and 4; any other version throws. Older blobs are
 * migrated forward through the same source-field parser. The returned state
 * persists source fields only.
 */
export function loadGame(save: SaveGame): GameState {
  if (!save || typeof save.version !== 'number') {
    throw new Error('Invalid save: missing version');
  }
  if (
    save.version !== 1 &&
    save.version !== 2 &&
    save.version !== 3 &&
    save.version !== CURRENT_SAVE_VERSION
  ) {
    throw new Error(
      `Unsupported save version ${save.version}; expected 1, 2, 3, or ${CURRENT_SAVE_VERSION}`,
    );
  }
  if (save.state === null || typeof save.state !== 'object' || Array.isArray(save.state)) {
    throw new Error(`Invalid save: version ${save.version} has a missing or invalid state`);
  }
  if (save.version === 1) return migrateV1ToV2(save.state);
  if (save.version === 2) return migrateV2ToV3(save.state);
  if (save.version === 3) return migrateV3ToV4(save.state);
  return parseState(save.state, 'version 4');
}
