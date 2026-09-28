// advance.ts — time-based simulation.
//
// Pure and deterministic: same (state, deltaMs) always yields the same
// (state, events). No clocks or randomness beyond GameState.meta.rngState.

import { SHINY_MIN_GAP_MS, SHINY_WINDOW_MS, shinySpawnDelayMs, shinySpawnRoll } from './balance';
import { grantAchievements } from './achievements';
import { applyDamageToEnemy } from './combat';
import { nextRng } from './rng';
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
  resolveGoldenEvents(draft, events);
  grantAchievements(state, draft, events);
  return { state: draft, events };
}

/**
 * Resolve Golden Events for one tick: expire a finished Shiny and any finished
 * boost, then (if the world is not frozen and none is active) roll once to spawn
 * the next. Expiry carries NO penalty — the Shiny simply leaves.
 *
 * Spawn consumes exactly one RNG draw from `meta.rngState`, so the Shiny
 * sequence is as deterministic as the loot stream. The draw decides both whether
 * the scheduled event appears and which kind it is (see `shinySpawnRoll`).
 * A scheduled roll that does not spawn pushes the next check out by the minimum
 * gap, so lowering the spawn chance spaces attempts instead of re-rolling every
 * tick.
 */
function resolveGoldenEvents(draft: GameState, events: GameEvent[]): void {
  const active = draft.event.active;
  if (active && draft.meta.totalPlayedMs >= active.expiresAtMs) {
    draft.event.active = null;
    events.push({ type: 'eventExpired', kind: active.kind });
  }

  const boost = draft.boost;
  if (boost && draft.meta.totalPlayedMs >= boost.expiresAtMs) {
    draft.boost = null;
    events.push({ type: 'boostExpired' });
  }

  if (draft.choices.pending !== null) return;
  if (draft.event.active !== null) return;
  if (draft.meta.totalPlayedMs < draft.event.nextSpawnAtMs) return;

  const draw = nextRng(draft.meta.rngState);
  draft.meta.rngState = draw.state;
  const { spawns, kind } = shinySpawnRoll(draw.value);

  if (!spawns) {
    draft.event.nextSpawnAtMs = draft.meta.totalPlayedMs + SHINY_MIN_GAP_MS;
    return;
  }

  const spawnedBefore = draft.event.spawned;
  const spawnedAtMs = draft.meta.totalPlayedMs;
  draft.event.active = {
    kind,
    spawnedAtMs,
    expiresAtMs: spawnedAtMs + SHINY_WINDOW_MS,
  };
  draft.event.spawned = spawnedBefore + 1;
  // The delay table is indexed by the number of spawns that have now happened,
  // so the first spawn uses `delay(0)` (set at createGame) and the spawn after
  // it schedules `delay(1)`, and so on.
  draft.event.nextSpawnAtMs = spawnedAtMs + shinySpawnDelayMs(spawnedBefore + 1);
  events.push({ type: 'eventSpawned', kind });
}
