// state.ts — state construction, cloning, derived reads, and save serialization.
//
// Everything here is pure: functions either build a new GameState or read one.
// cloneGameState is the single deep-copy used before any mutation so that
// advance/applyAction never touch their input.

import {
  ACTIVE_CLICKS_PER_SECOND,
  BALANCE,
  CURRENT_SAVE_VERSION,
  enemyMaxHp,
  upgradeCost,
} from './balance';
import type { GameState, GearInstance, GearSlot, SaveGame } from './types';

/** Build a fresh game at stage 1. `now` defaults to 0 for deterministic tests. */
export function createGame(seed = 12345, now = 0): GameState {
  const stage = 1;
  const maxHp = enemyMaxHp(stage);
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
      baseAutoDps: BALANCE.baseAutoDps,
      baseClickDamage: BALANCE.baseClickDamage,
    },
    combat: {
      stage,
      enemyHp: maxHp,
      enemyMaxHp: maxHp,
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

/** Effective auto DPS and click damage including the equipped weapon. */
export function getEffectiveStats(state: GameState): { autoDps: number; clickDamage: number } {
  const weapon = state.gear.equipped.weapon;
  return {
    autoDps: state.player.baseAutoDps + (weapon ? weapon.dps : 0),
    clickDamage: state.player.baseClickDamage + (weapon ? weapon.clickDamage : 0),
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

/** Validate and hydrate a save blob. Throws on unsupported/malformed versions. */
export function loadGame(save: SaveGame): GameState {
  if (!save || typeof save.version !== 'number') {
    throw new Error('Invalid save: missing version');
  }
  if (save.version !== CURRENT_SAVE_VERSION) {
    throw new Error(`Unsupported save version ${save.version}; expected ${CURRENT_SAVE_VERSION}`);
  }
  if (save.state === null || typeof save.state !== 'object' || Array.isArray(save.state)) {
    throw new Error(`Invalid save: version ${save.version} has a missing or invalid state`);
  }
  return cloneGameState(save.state);
}
