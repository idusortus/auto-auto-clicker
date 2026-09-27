// advance.ts — time-based simulation.
//
// Pure and deterministic: same (state, deltaMs) always yields the same
// (state, events). No clocks or randomness beyond GameState.meta.rngState.

import { grantAchievements } from './achievements';
import { applyDamageToEnemy } from './combat';
import { cloneGameState, getEffectiveStats } from './state';
import type { GameEvent, GameState } from './types';

/**
 * Advance the simulation by `deltaMs` milliseconds.
 *
 * When a choice is pending the world is frozen: the same state is returned with
 * no events and totalPlayedMs does not move.
 */
export function advance(state: GameState, deltaMs: number): { state: GameState; events: GameEvent[] } {
  if (state.choices.pending) return { state, events: [] };
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return { state, events: [] };

  const stats = getEffectiveStats(state);
  const draft = cloneGameState(state);
  draft.meta.totalPlayedMs += deltaMs;

  const accumulated = state.combat.damageCarry + (deltaMs / 1000) * stats.autoDps;
  const integerDamage = Math.floor(accumulated);
  draft.combat.damageCarry = Math.floor((accumulated - integerDamage) * 1000) / 1000;

  const events = applyDamageToEnemy(draft, integerDamage, 'auto');
  grantAchievements(state, draft, events);
  return { state: draft, events };
}
