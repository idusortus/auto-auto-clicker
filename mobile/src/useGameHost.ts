// useGameHost.ts — the React Native host hook: boot, clock, fixed-step loop,
// action dispatch, autosave, and AppState-driven flush/resume.
//
// This hook owns everything the engine deliberately refuses: the wall clock, a
// timer, and persistence timing. It holds NO gameplay rules and no balance
// numbers — state only ever changes as the return value of advance() or
// applyAction(). It mirrors the browser host in `web/src/main.ts`, with
// `AppState` replacing `visibilitychange`/`pagehide`.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { advance, applyAction, createGame } from '@auto-auto-clicker/engine-core';
import type {
  Action,
  GameEvent,
  GameState,
  GearSlot,
  SaveRepository,
} from '@auto-auto-clicker/engine-core';

import { replayOffline } from './offline';
import type { OfflineSummary } from './offline';
import { hydrate, loadSave, offlineElapsedMs, persistState, saveRepository } from './storage';

/** Simulation step. Mirrors the engine/sim step so pacing stays identical. */
export const STEP_MS = 100;

/** Host safety cap: never run more than this many steps in a single tick. */
export const MAX_CATCHUP_STEPS = 10;

/** Host autosave cadence. */
export const AUTOSAVE_INTERVAL_MS = 5000;

/** Timer cadence. One ticker tick is one simulation step of wall-clock time. */
const TICK_INTERVAL_MS = STEP_MS;

/** A pending-choice resolution option. Kept local so the hook owns no engine types beyond Action. */
export type ChoiceOption = 'wait' | 'watchAd' | 'iap';

/** The stage anchor and event batch for the most recent render. */
export interface HostFrame {
  events: readonly GameEvent[];
  /** Sim-time at which the current stage began; host-owned and never persisted. */
  stageBeganAtMs: number | null;
}

export interface UseGameHostOptions {
  /** Persistence backend; defaults to the AsyncStorage repository. */
  repository?: SaveRepository;
  /** Wall clock; injectable so tests can control time. */
  now?: () => number;
  /** Seed factory for a fresh game; injectable for determinism. */
  seed?: () => number;
  /** Timer seam; injectable so tests can drive the ticker deterministically. */
  scheduler?: HostScheduler;
}

/** The timer seam the host schedules its ticker through. */
export interface HostScheduler {
  setInterval(handler: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}

const defaultScheduler: HostScheduler = {
  setInterval: (handler, intervalMs) => setInterval(handler, intervalMs),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/** The host surface a renderer wires its handlers to. */
export interface GameHost {
  /** True once boot (hydrate + offline replay) has completed. */
  ready: boolean;
  /** The current simulation state, or null until boot completes. */
  state: GameState | null;
  /** Offline summary to show once on boot, or null when no time was simulated. */
  offline: OfflineSummary | null;
  /** Latest events (and stage anchor) for animation; refreshed per render. */
  frame: HostFrame;
  /** Apply an engine Action; a same-state result is a no-op and does not re-render. */
  dispatch(action: Action): void;
  onClick(): void;
  onUpgrade(slot: GearSlot): void;
  onEquip(instanceId: string): void;
  onChoice(choice: ChoiceOption): void;
  onClaim(): void;
}

/** Mutable loop state, held in a ref so timer/AppState callbacks never go stale. */
interface HostRuntime {
  state: GameState | null;
  accumulator: number;
  lastTickAt: number | null;
  lastSaveAt: number;
  saveInFlight: boolean;
  stageBeganAtMs: number | null;
  renderedStage: number | null;
}

interface PreparedGame {
  state: GameState;
  offline: OfflineSummary | null;
}

/**
 * Boot sequence: load the save, hydrate it, replay offline time, and fall back
 * to a fresh game when no save exists or the stored blob is rejected.
 */
async function prepareGame(
  repository: SaveRepository,
  now: () => number,
  seed: () => number,
): Promise<PreparedGame> {
  const nowMs = now();
  const save = await loadSave(repository);

  if (save === null) {
    return { state: createGame(seed(), nowMs), offline: null };
  }

  let restored: GameState;
  try {
    restored = hydrate(save);
  } catch (error) {
    console.error('[aac] save rejected; starting a fresh game', error);
    return { state: createGame(seed(), nowMs), offline: null };
  }

  const rawElapsed = Number.isFinite(save.savedAt) ? Math.max(0, nowMs - save.savedAt) : 0;
  const elapsed = offlineElapsedMs(save.savedAt, nowMs);
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

/** Record the stage anchor when the stage changes, mirroring web's anchoredRender. */
function anchorFor(runtime: HostRuntime, state: GameState): number | null {
  if (runtime.renderedStage !== state.combat.stage) {
    runtime.renderedStage = state.combat.stage;
    runtime.stageBeganAtMs = state.meta.totalPlayedMs;
  }
  return runtime.stageBeganAtMs;
}

export function useGameHost(options: UseGameHostOptions = {}): GameHost {
  const runtimeRef = useRef<HostRuntime>({
    state: null,
    accumulator: 0,
    lastTickAt: null,
    lastSaveAt: 0,
    saveInFlight: false,
    stageBeganAtMs: null,
    renderedStage: null,
  });

  // Options may be recreated by the caller on every render (e.g. an inline
  // `now`/`seed`). Capture them in a ref and boot exactly once, so the host is
  // not restarted on unrelated re-renders.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [offline, setOffline] = useState<OfflineSummary | null>(null);
  const [frame, setFrame] = useState<HostFrame>({ events: [], stageBeganAtMs: null });

  const dispatch = useCallback(
    (action: Action): void => {
      const runtime = runtimeRef.current;
      const current = runtime.state;
      if (current === null) return;

      const result = applyAction(current, action);
      // Invalid or unaffordable actions return the same state object with an
      // empty event list; skip the render because nothing changed.
      if (result.state === current) return;

      runtime.state = result.state;
      const stageBeganAtMs = anchorFor(runtime, result.state);
      setState(result.state);
      setFrame({ events: result.events, stageBeganAtMs });
    },
    [],
  );

  // Boot once; start the ticker, autosave, and AppState subscription once the
  // async hydrate/replay completes. Everything is torn down on unmount.
  useEffect(() => {
    const { repository = saveRepository, now = Date.now, seed, scheduler = defaultScheduler } =
      optionsRef.current;
    const newSeed = seed ?? (() => (Math.random() * 0xffffffff) >>> 0);
    let cancelled = false;
    let timer: unknown = null;
    let subscription: { remove(): void } | null = null;

    function flushSave(): void {
      const runtime = runtimeRef.current;
      const current = runtime.state;
      if (current === null) return;

      const nowMs = now();
      runtime.lastSaveAt = nowMs;
      runtime.saveInFlight = true;
      persistState(current, nowMs, repository)
        .catch((error: unknown) => console.error('[aac] save failed', error))
        .finally(() => {
          runtimeRef.current.saveInFlight = false;
        });
    }

    function tick(): void {
      const runtime = runtimeRef.current;
      const nowMs = now();

      if (runtime.lastTickAt === null) {
        // First tick after boot / resume only anchors the clock.
        runtime.lastTickAt = nowMs;
        return;
      }

      let delta = nowMs - runtime.lastTickAt;
      runtime.lastTickAt = nowMs;
      if (delta < 0) delta = 0;
      runtime.accumulator += delta;

      const current = runtime.state;
      if (current === null) return;

      if (current.choices.pending !== null) {
        // The engine freezes the world while a choice is pending.
        runtime.accumulator = 0;
        return;
      }

      let next = current;
      let steps = 0;
      // Coalesce every step's events of THIS tick into one ordered batch, so the
      // renderer delivers them once each, in order, per tick.
      const frameEvents: GameEvent[] = [];
      while (runtime.accumulator >= STEP_MS && steps < MAX_CATCHUP_STEPS) {
        const tickResult = advance(next, STEP_MS);
        next = tickResult.state;
        if (tickResult.events.length > 0) frameEvents.push(...tickResult.events);
        runtime.accumulator -= STEP_MS;
        steps += 1;
      }
      // Drop any backlog beyond the catch-up cap so a backgrounded app cannot
      // spiral through thousands of steps on resume.
      if (steps >= MAX_CATCHUP_STEPS) runtime.accumulator = 0;

      if (steps > 0) {
        runtime.state = next;
        const stageBeganAtMs = anchorFor(runtime, next);
        setState(next);
        setFrame({ events: frameEvents, stageBeganAtMs });
      }
    }

    function autosave(): void {
      const runtime = runtimeRef.current;
      if (runtime.saveInFlight) return;
      if (now() - runtime.lastSaveAt < AUTOSAVE_INTERVAL_MS) return;
      flushSave();
    }

    function onAppStateChange(next: AppStateStatus): void {
      const runtime = runtimeRef.current;
      if (next !== 'active') {
        // Flush before the app may be suspended, then reset the accumulator so
        // hidden time is not treated as a giant catch-up delta.
        flushSave();
      }
      runtime.accumulator = 0;
      runtime.lastTickAt = null;
    }

    void prepareGame(repository, now, newSeed).then((prepared) => {
      if (cancelled) return;

      const runtime = runtimeRef.current;
      runtime.state = prepared.state;
      runtime.lastTickAt = null;
      runtime.accumulator = 0;

      setState(prepared.state);
      setOffline(prepared.offline);
      setReady(true);

      // Boot render carries NO events: any boot-time offline replay's events
      // were intentionally dropped, and a fresh game has none.
      const stageBeganAtMs = anchorFor(runtime, prepared.state);
      setFrame({ events: [], stageBeganAtMs });

      // Persist immediately so a brand-new game has a save from the first moment.
      flushSave();

      if (cancelled) return;

      timer = scheduler.setInterval(() => {
        tick();
        autosave();
      }, TICK_INTERVAL_MS);
      subscription = AppState.addEventListener('change', onAppStateChange);
    });

    return () => {
      cancelled = true;
      if (timer !== null) scheduler.clearInterval(timer);
      if (subscription !== null) subscription.remove();
    };
  }, []);

  const onClick = useCallback(() => dispatch({ type: 'click' }), [dispatch]);
  const onUpgrade = useCallback(
    (slot: GearSlot) => dispatch({ type: 'upgradeEquipped', slot }),
    [dispatch],
  );
  const onEquip = useCallback(
    (instanceId: string) => dispatch({ type: 'equip', instanceId }),
    [dispatch],
  );
  const onChoice = useCallback(
    (choice: ChoiceOption) => dispatch({ type: 'resolveChoice', choice }),
    [dispatch],
  );
  const onClaim = useCallback(() => dispatch({ type: 'claimEvent' }), [dispatch]);

  return {
    ready,
    state,
    offline,
    frame,
    dispatch,
    onClick,
    onUpgrade,
    onEquip,
    onChoice,
    onClaim,
  };
}
