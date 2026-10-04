// cues.ts — the PURE event → animation-cue mapping, ported from `/web`.
//
// This module is the semantic half of `/web`'s `handleEvents`: it turns one
// frame's ordered `GameEvent[]` into at most one winning cue per ACTOR TARGET.
// It holds NO renderer, NO timers, NO React, and NO `react-native` import, so it
// is unit-testable on its own. Durations and asset slots live in the theme, not
// here: this file maps event FAMILIES to cue KEYS only.
//
// Semantics match `web/src/renderer.ts` exactly:
//  - the batch is scanned LEFT-TO-RIGHT;
//  - `stageEntered` updates the RUNNING stage, so later events in the same batch
//    (a tick can clear several enemies) use the new boss/normal frame;
//  - a `damageDealt` from a `click` ALSO animates the player;
//  - ties for one target go to the LAST occurrence (`>=`), so a late `enemyKilled`
//    beats an earlier hit.

import { isBoss } from '@auto-auto-clicker/engine-core';
import type { AnimationCueKey, GameEvent } from '@auto-auto-clicker/engine-core';

/** The actor a transient frame belongs to. At most one frame per target is live. */
export type AnimationTarget = 'player' | 'enemy' | 'shiny' | 'global';

/**
 * Per-target cue priority. When ONE batch contains several cues for the same
 * actor, only the highest-priority cue is kept (ties: the LAST occurrence).
 * Death outranks `stageEntered` on purpose: a kill batch is normally
 * `enemyKilled` immediately followed by `stageEntered`, and the death frame must
 * not be lost behind the (longer) spawn popup. The two live on different actor
 * targets, so the popup is additive, never a replacement.
 */
export const CUE_PRIORITY: Record<AnimationCueKey, number> = {
  enemyDeath: 6,
  bossDeath: 6,
  stageEntered: 5,
  playerAttack: 4,
  enemyHit: 3,
  bossHit: 3,
  shinySpawn: 2,
  shinyClaim: 1,
};

/** Stable order for draining the per-batch winner map (no key iteration logic). */
export const ANIMATION_TARGETS: readonly AnimationTarget[] = ['player', 'enemy', 'shiny', 'global'];

/**
 * Map one frame's ordered events to the winning cue for each actor target.
 *
 * `initialStage` is the freshly-rendered stage (the caller reads it from the
 * current `GameState`); `stageEntered` events advance it mid-batch. Returns a
 * partial map — targets with no cue in the batch are absent, and the caller
 * shows their idle frame.
 */
export function collectCueWinners(
  events: readonly GameEvent[],
  initialStage: number,
): Partial<Record<AnimationTarget, AnimationCueKey>> {
  const cues: Array<{ target: AnimationTarget; cue: AnimationCueKey }> = [];
  let currentStage = initialStage;
  for (const event of events) {
    switch (event.type) {
      case 'damageDealt':
        // A click also animates the player; every damage source animates the
        // enemy it landed on (boss frame on a boss stage).
        if (event.source === 'click') cues.push({ target: 'player', cue: 'playerAttack' });
        cues.push({ target: 'enemy', cue: isBoss(currentStage) ? 'bossHit' : 'enemyHit' });
        break;
      case 'enemyKilled':
        cues.push({ target: 'enemy', cue: isBoss(event.stage) ? 'bossDeath' : 'enemyDeath' });
        break;
      case 'stageEntered':
        currentStage = event.stage;
        cues.push({ target: 'global', cue: 'stageEntered' });
        break;
      case 'eventSpawned':
        cues.push({ target: 'shiny', cue: 'shinySpawn' });
        break;
      case 'eventClaimed':
        cues.push({ target: 'shiny', cue: 'shinyClaim' });
        break;
      case 'enemyTaunt':
        // Handled by the host as toast TEXT; it drives NO sprite frame (the enemy
        // keeps its existing idle/hit/death frames — no new art exists).
        break;
      default:
        // Every other event type drives NO sprite cue in this phase.
        break;
    }
  }

  // Per-actor winner: highest priority of the batch; ties go to the LAST
  // occurrence (`>=`), so a late `enemyKilled` beats an earlier hit.
  const winners: Partial<Record<AnimationTarget, AnimationCueKey>> = {};
  for (const { target, cue } of cues) {
    const current = winners[target];
    if (current === undefined || CUE_PRIORITY[cue] >= CUE_PRIORITY[current]) {
      winners[target] = cue;
    }
  }
  return winners;
}
