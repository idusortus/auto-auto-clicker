// Shared test helpers. Not a *.test.ts file, so vitest does not collect it.

import { NECKLACE_DEFINITION, RING_DEFINITION, RING_DEFINITION_2, WEAPON_DEFINITION } from '../src/content';
import { createGame } from '../src/state';
import type { GearInstance, GameState, PendingChoice } from '../src/types';

export interface StateOverrides {
  seed?: number;
  rngState?: number;
  totalPlayedMs?: number;
  achievements?: string[];
  gold?: number;
  stage?: number;
  enemyHp?: number;
  damageCarry?: number;
  equippedWeapon?: GearInstance | null;
  equippedRing1?: GearInstance | null;
  equippedRing2?: GearInstance | null;
  equippedNecklace?: GearInstance | null;
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
      achievements: overrides.achievements ?? base.meta.achievements,
    },
    player: {
      gold: overrides.gold ?? base.player.gold,
    },
    combat: {
      stage: overrides.stage ?? base.combat.stage,
      enemyHp: overrides.enemyHp ?? base.combat.enemyHp,
      damageCarry: overrides.damageCarry ?? base.combat.damageCarry,
    },
    gear: {
      equipped: {
        weapon: overrides.equippedWeapon ?? null,
        ring1: overrides.equippedRing1 ?? null,
        ring2: overrides.equippedRing2 ?? null,
        necklace: overrides.equippedNecklace ?? null,
      },
      bag: overrides.bag ?? [],
      nextInstanceId: overrides.nextInstanceId ?? 1,
    },
    choices: {
      pending: overrides.pending ?? null,
    },
  };
}

/**
 * Build a weapon instance. Instances carry SOURCE fields only; battle stats are
 * derived on read via `getGearStats` / `getEffectiveStats`.
 */
export function makeGear(itemLevel: number, upgradeLevel = 0, id = `test-gear-${itemLevel}`): GearInstance {
  return {
    id,
    definitionId: WEAPON_DEFINITION.id,
    itemLevel,
    upgradeLevel,
  };
}

/** Build a ring instance bound to `ring1` or `ring2`. */
export function makeRing(
  itemLevel: number,
  slot: 'ring1' | 'ring2' = 'ring1',
  upgradeLevel = 0,
  id = `test-${slot}-${itemLevel}`,
): GearInstance {
  const definition = slot === 'ring1' ? RING_DEFINITION : RING_DEFINITION_2;
  return { id, definitionId: definition.id, itemLevel, upgradeLevel };
}

/** Build a necklace instance. */
export function makeNecklace(
  itemLevel: number,
  upgradeLevel = 0,
  id = `test-necklace-${itemLevel}`,
): GearInstance {
  return { id, definitionId: NECKLACE_DEFINITION.id, itemLevel, upgradeLevel };
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
