// taunts.ts — deterministic enemy catchphrases on a SEPARATE RNG channel.
//
// Pure: no DOM, no clock, no timers, no Math.random, no fs. Every function reads
// a `GameState` and returns an event (or a derived value); nothing here mutates
// `meta.rngState` or any other state. That isolation is the whole point: the
// loot stream (`nextRng` threaded through `meta.rngState`) must be untouched, or
// taunts would shift every pacing number. See `taunts.test.ts` for the proof.

import {
  TAUNT_AMBIENT_CHANCE,
  TAUNT_AMBIENT_INTERVAL_MS,
  TAUNT_NOMINAL_PHRASES,
} from './balance';
import { nextRng } from './rng';
import type { EnemyTauntEvent, GameState, TauntKind } from './types';

/** Stable nonzero code per kind, so two kinds in one tick never share a roll. */
const KIND_CODES: Record<TauntKind, number> = {
  spawn: 1,
  defeat: 2,
  bossDefeat: 3,
  wall: 4,
  shiny: 5,
  ambient: 6,
};

/** Mix `(kind, stage, salt)` into a stable 32-bit discriminator. */
function tauntDiscriminator(kind: TauntKind, stage: number, salt: number): number {
  let hash =
    Math.imul(KIND_CODES[kind], 0x9e3779b1) ^ Math.imul(Math.trunc(stage) | 0, 0x85ebca6b);
  hash = (hash ^ Math.imul(Math.trunc(salt) | 0, 0xc2b2ae35)) >>> 0;
  return hash >>> 0;
}

/**
 * A derived `[0, 1)` roll that depends only on `(seed, totalPlayedMs,
 * discriminator)`. It does NOT read or write `meta.rngState`, so taunts cannot
 * shift the loot stream. Same state + same discriminator => same value.
 */
export function tauntRoll(state: GameState, discriminator: number): number {
  const played = Math.floor(state.meta.totalPlayedMs) >>> 0;
  const combined = (state.meta.seed ^ played ^ Math.imul(discriminator | 0, 0x9e3779b1)) >>> 0;
  return nextRng(combined).value;
}

/** Bounded phrase index in `[0, TAUNT_NOMINAL_PHRASES)` from a derived roll. */
function phraseIndexFor(state: GameState, discriminator: number): number {
  const count = Math.floor(TAUNT_NOMINAL_PHRASES);
  if (!(count > 0)) return 0;
  // A SECOND derived roll (distinct discriminator) so a low gate chance does
  // not bias the phrase towards the head of the table.
  const roll = tauntRoll(state, (discriminator ^ 0x5bd1e995) | 0);
  const index = Math.min(count - 1, Math.floor(roll * count));
  return index < 0 ? 0 : index;
}

/**
 * Emit a taunt of `kind` with probability `chance`, else null. `enemyId` and
 * `stage` are supplied by the caller (both engine-owned identity); `salt`
 * decorrelates multiple emissions that share a kind and stage.
 */
export function makeTaunt(
  state: GameState,
  kind: TauntKind,
  enemyId: string,
  stage: number,
  chance: number,
  salt = 0,
): EnemyTauntEvent | null {
  if (!(chance > 0)) return null;
  const discriminator = tauntDiscriminator(kind, stage, salt);
  const gate = tauntRoll(state, discriminator);
  if (!(gate < chance)) return null;
  return {
    type: 'enemyTaunt',
    enemyId,
    kind,
    phraseIndex: phraseIndexFor(state, discriminator),
  };
}

/**
 * Ambient taunt: emitted at most once per crossing of
 * `TAUNT_AMBIENT_INTERVAL_MS`, using the crossed boundary as the discriminator
 * salt. `prevTotalMs` is the play clock before this tick; the roll uses the
 * state's current value. No persisted field is needed.
 */
export function ambientTaunt(
  state: GameState,
  prevTotalMs: number,
  enemyId: string,
): EnemyTauntEvent | null {
  const interval = TAUNT_AMBIENT_INTERVAL_MS;
  if (!(interval > 0)) return null;
  const previousBoundary = Math.floor(prevTotalMs / interval);
  const currentBoundary = Math.floor(state.meta.totalPlayedMs / interval);
  if (!Number.isFinite(currentBoundary) || currentBoundary <= previousBoundary) return null;
  return makeTaunt(
    state,
    'ambient',
    enemyId,
    state.combat.stage,
    TAUNT_AMBIENT_CHANCE,
    currentBoundary,
  );
}
