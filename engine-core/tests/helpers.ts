// Shared test helpers. Not a *.test.ts file, so vitest does not collect it.

import { computeGearStats } from '../src/balance';
import { WEAPON_DEFINITION } from '../src/content';
import { createGame } from '../src/state';
import type { GearInstance, GameState, PendingChoice } from '../src/types';

export interface StateOverrides {
  seed?: number;
  rngState?: number;
  totalPlayedMs?: number;
  gold?: number;
  baseAutoDps?: number;
  baseClickDamage?: number;
  stage?: number;
  enemyHp?: number;
  enemyMaxHp?: number;
  damageCarry?: number;
  equippedWeapon?: GearInstance | null;
  bag?: GearInstance[];
  nextInstanceId?: number;
  pending?: PendingChoice | null;
}

/** Build a deterministic state from createGame plus explicit overrides. */
export function makeState(overrides: StateOverrides = {}): GameState {
  const base = createGame(overrides.seed ?? 12345, 0);
  return {
    meta: {
      ...base.meta,
      rngState: overrides.rngState ?? base.meta.rngState,
      totalPlayedMs: overrides.totalPlayedMs ?? base.meta.totalPlayedMs,
    },
    player: {
      gold: overrides.gold ?? base.player.gold,
      baseAutoDps: overrides.baseAutoDps ?? base.player.baseAutoDps,
      baseClickDamage: overrides.baseClickDamage ?? base.player.baseClickDamage,
    },
    combat: {
      stage: overrides.stage ?? base.combat.stage,
      enemyHp: overrides.enemyHp ?? base.combat.enemyHp,
      enemyMaxHp: overrides.enemyMaxHp ?? base.combat.enemyMaxHp,
      damageCarry: overrides.damageCarry ?? base.combat.damageCarry,
    },
    gear: {
      equipped: { weapon: overrides.equippedWeapon ?? null },
      bag: overrides.bag ?? [],
      nextInstanceId: overrides.nextInstanceId ?? 1,
    },
    choices: {
      pending: overrides.pending ?? null,
    },
  };
}

/** Build a weapon instance with stats derived from the real balance formulas. */
export function makeGear(itemLevel: number, upgradeLevel = 0, id = `test-gear-${itemLevel}`): GearInstance {
  const stats = computeGearStats(WEAPON_DEFINITION, itemLevel, upgradeLevel);
  return {
    id,
    definitionId: WEAPON_DEFINITION.id,
    itemLevel,
    upgradeLevel,
    dps: stats.dps,
    clickDamage: stats.clickDamage,
  };
}

/** Recursively freeze a value so any mutation attempt throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
