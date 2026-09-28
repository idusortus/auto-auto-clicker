// main.ts — browser host: clock, fixed-step loop, autosave, action dispatch.
//
// This file owns everything the engine deliberately refuses: the wall clock,
// requestAnimationFrame, DOM events, and persistence timing. It contains no
// gameplay rules and no balance numbers, and it never mutates engine state
// directly — state only ever changes as the return value of advance() or
// applyAction().

import {
  advance,
  applyAction,
  createGame,
} from '@auto-auto-clicker/engine-core';
import type { Action, GameState } from '@auto-auto-clicker/engine-core';

import { mountRenderer } from './renderer';
import type { OfflineSummary } from './renderer';
import {
  OFFLINE_STEP_MS,
  hydrate,
  loadSave,
  offlineElapsedMs,
  persistState,
} from './storage';

/** Simulation step. Mirrors the engine/sim step so pacing stays identical. */
const STEP_MS = 100;

/** Host safety cap: never run more than this many steps in a single frame. */
const MAX_CATCHUP_STEPS = 10;

/** Host autosave cadence. */
const AUTOSAVE_INTERVAL_MS = 5000;

interface PreparedGame {
  state: GameState;
  offline: OfflineSummary | null;
}

async function prepareGame(): Promise<PreparedGame> {
  const now = Date.now();
  const save = await loadSave();

  if (save === null) {
    return { state: createGame(freshSeed(), now), offline: null };
  }

  let restored: GameState;
  try {
    restored = hydrate(save);
  } catch (error) {
    console.error('[aac] save rejected; starting a fresh game', error);
    return { state: createGame(freshSeed(), now), offline: null };
  }

  const rawElapsed = Number.isFinite(save.savedAt) ? Math.max(0, now - save.savedAt) : 0;
  const elapsed = offlineElapsedMs(save.savedAt, now);
  const replayed = replayOffline(restored, elapsed);

  const offline: OfflineSummary | null =
    replayed.simulatedMs > 0
      ? {
          elapsedMs: rawElapsed,
          simulatedMs: replayed.simulatedMs,
          goldEarned: replayed.goldEarned,
          capped: rawElapsed > elapsed,
        }
      : null;

  return { state: replayed.state, offline };
}

/**
 * Replay offline time through the SAME advance() the live loop uses, in bounded
 * fixed steps, instead of granting any special reward.
 *
 * Offline progress is auto-DPS only: no clicks are replayed, so a player earns
 * less while away than they would have by tapping. Replay stops early when a
 * choice is pending, because the engine freezes the world until the player
 * resolves it; the pending choice is then shown on boot.
 */
function replayOffline(
  state: GameState,
  elapsedMs: number,
): { state: GameState; goldEarned: number; simulatedMs: number } {
  const goldBefore = state.player.gold;
  let next = state;
  let remaining = elapsedMs;
  let simulatedMs = 0;

  while (remaining > 0 && next.choices.pending === null) {
    const delta = Math.min(OFFLINE_STEP_MS, remaining);
    const tick = advance(next, delta);
    if (tick.state === next) break;
    next = tick.state;
    remaining -= delta;
    simulatedMs += delta;
  }

  return { state: next, goldEarned: next.player.gold - goldBefore, simulatedMs };
}

function startHost(root: HTMLElement, prepared: PreparedGame): void {
  let state = prepared.state;
  let lastFrameAt: number | null = null;
  let accumulator = 0;
  let lastSaveAt = 0;
  let saveInFlight = false;

  function dispatch(action: Action): void {
    const result = applyAction(state, action);
    // Invalid or unaffordable actions return the same state object; skip the
    // render because nothing changed.
    if (result.state === state) return;
    state = result.state;
    renderer.render(state);
  }

  const renderer = mountRenderer(root, {
    onClick: () => dispatch({ type: 'click' }),
    onUpgrade: (slot) => dispatch({ type: 'upgradeEquipped', slot }),
    onEquip: (instanceId) => dispatch({ type: 'equip', instanceId }),
    onChoice: (choice) => dispatch({ type: 'resolveChoice', choice }),
    onClaim: () => dispatch({ type: 'claimEvent' }),
  });

  renderer.render(state);
  if (prepared.offline !== null) renderer.showOfflineSummary(prepared.offline);

  function frame(timestamp: number): void {
    if (lastFrameAt === null) lastFrameAt = timestamp;
    let delta = timestamp - lastFrameAt;
    lastFrameAt = timestamp;
    if (delta < 0) delta = 0;
    accumulator += delta;

    if (state.choices.pending === null) {
      let steps = 0;
      while (accumulator >= STEP_MS && steps < MAX_CATCHUP_STEPS) {
        state = advance(state, STEP_MS).state;
        accumulator -= STEP_MS;
        steps += 1;
      }
      // Drop any backlog beyond the catch-up cap so a backgrounded tab cannot
      // spiral through thousands of steps on resume.
      if (steps >= MAX_CATCHUP_STEPS) accumulator = 0;
      if (steps > 0) renderer.render(state);
    } else {
      // The engine freezes the world while a choice is pending.
      accumulator = 0;
    }

    requestAnimationFrame(frame);
  }

  function flushSave(): void {
    const now = Date.now();
    lastSaveAt = now;
    saveInFlight = true;
    // The localStorage adapter writes synchronously inside this async method, so
    // firing it from pagehide persists before the page is torn down.
    persistState(state, now)
      .catch((error: unknown) => console.error('[aac] save failed', error))
      .finally(() => {
        saveInFlight = false;
      });
  }

  function autosave(): void {
    if (saveInFlight) return;
    if (Date.now() - lastSaveAt < AUTOSAVE_INTERVAL_MS) return;
    flushSave();
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      flushSave();
      return;
    }
    // Resume cleanly: don't count hidden time as a giant catch-up delta.
    lastFrameAt = null;
    accumulator = 0;
  }

  window.setInterval(autosave, AUTOSAVE_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', flushSave);

  // Persist immediately so a brand-new game has a save from the first moment.
  flushSave();
  requestAnimationFrame(frame);
}

function freshSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

async function boot(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (root === null) {
    console.error('[aac] #app root not found; renderer not mounted');
    return;
  }
  const prepared = await prepareGame();
  startHost(root, prepared);
}

void boot();
