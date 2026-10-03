// offline.ts — pure boot-time offline replay.
//
// Replays away time through the SAME advance() the live loop uses, in bounded
// fixed steps, instead of granting any special reward. This module is pure: it
// reads no clock and holds no gameplay rules or balance numbers beyond the host
// loop parameters it is given.
//
// Offline progress is auto-DPS only: no clicks are replayed, so a player earns
// less while away than they would have by tapping. Replay stops early when a
// choice is pending, because the engine freezes the world until the player
// resolves it; the pending choice is then shown on boot.
//
// The events `advance` emits during the replay are DELIBERATELY DISCARDED. A
// multi-hour replay can produce thousands of events, and an animation storm for
// history the player never watched would be wrong; only the resulting state is
// delivered. The same applies to the boot-time render.

import { advance } from '@auto-auto-clicker/engine-core';
import type { GameState } from '@auto-auto-clicker/engine-core';

import { OFFLINE_STEP_MS } from './storage';

/**
 * The boot-time summary the host shows only when time was actually simulated.
 * Mirrors `web/src/renderer.ts`'s `OfflineSummary` shape exactly.
 */
export interface OfflineSummary {
  /** Wall-clock time since the save was written (uncapped). */
  elapsedMs: number;
  /** Time actually replayed through `advance` (<= elapsedMs). */
  simulatedMs: number;
  /** Gold gained during the replay. */
  goldEarned: number;
  /** Whether elapsedMs was longer than the offline cap. */
  capped: boolean;
}

/** The outcome of replaying away time. */
export interface OfflineReplayResult {
  /** State after replaying the elapsed time. */
  state: GameState;
  /** Time actually replayed through `advance` (<= elapsedMs). */
  simulatedMs: number;
  /** Gold gained during the replay. */
  goldEarned: number;
}

/**
 * Advance `state` by `elapsedMs` of wall-clock time in `OFFLINE_STEP_MS` steps,
 * stopping at a pending choice and breaking if `advance` returns the same state.
 * Events are intentionally not collected.
 */
export function replayOffline(state: GameState, elapsedMs: number): OfflineReplayResult {
  const goldBefore = state.player.gold;
  let next = state;
  let remaining = elapsedMs;
  let simulatedMs = 0;

  while (remaining > 0 && next.choices.pending === null) {
    const delta = Math.min(OFFLINE_STEP_MS, remaining);
    // `.events` is intentionally not collected here — see the docblock above.
    const tick = advance(next, delta);
    if (tick.state === next) break;
    next = tick.state;
    remaining -= delta;
    simulatedMs += delta;
  }

  return { state: next, goldEarned: next.player.gold - goldBefore, simulatedMs };
}
