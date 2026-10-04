// useAnimationCues.ts — the STATEFUL half of the cue model (the RN port of
// `/web`'s `enqueueEffect` / `scheduleDrain` / `currentEffectSlot`).
//
// It consumes one frame's ordered `GameEvent[]`, translates it to per-actor cue
// winners with the pure `collectCueWinners`, and keeps at most ONE live frame
// per target with a display-only expiry (`Date.now() + cue.durationMs`). A
// single drain timer re-renders when the earliest frame expires, returning its
// actor to idle. It mirrors `/web` exactly: a non-positive duration disables a
// cue, a newer cue replaces the same target's older frame, and the queue is
// capped so presentation memory stays O(1).
//
// It mutates NO engine state and retains NO event history: each batch is used
// once and discarded, so memory is bounded by the live frames regardless of how
// long the session runs. The drain's own re-render carries no events, so it
// cannot recurse.
//
// `/web` measures expiry with the monotonic `performance.now()`; that clock is
// not available portably in RN, so this uses the wall clock — a display-only
// duration, so a clock jump can at worst end a frame early.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ACTIVE_THEME } from '@auto-auto-clicker/engine-core';
import type { AnimationCueKey, GameEvent } from '@auto-auto-clicker/engine-core';

import { ANIMATION_TARGETS, collectCueWinners } from './cues';
import type { AnimationTarget } from './cues';
import { useReducedMotion } from './useReducedMotion';
import type { ReducedMotionSource } from './useReducedMotion';

/** Queue cap: presentation memory stays O(1) no matter how cues are driven. */
export const MAX_ACTIVE_EFFECTS = 8;

/** The timer seam the cue drain is scheduled through (mirrors `HostScheduler`). */
export interface CueScheduler {
  setTimeout(handler: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultScheduler: CueScheduler = {
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** One live transient frame for an actor target. */
interface ActiveEffect {
  target: AnimationTarget;
  slot: string;
  /** Wall-clock deadline (`Date.now()`-based); a display-only duration. */
  expiresAtMs: number;
}

export interface UseAnimationCuesOptions {
  /** Timer seam; injectable so tests drive expiries deterministically. */
  scheduler?: CueScheduler;
  /** Reduced-motion source; defaults to the live OS preference. */
  reducedMotionSource?: ReducedMotionSource;
  /** Wall clock; injectable so tests control expiry timing. */
  now?: () => number;
}

export interface AnimationCues {
  /** Whether the OS reduced-motion preference is currently on. */
  reducedMotion: boolean;
  /**
   * The slot an actor's sprite should show: its live cue frame when one exists,
   * otherwise `idleSlot`. Under reduced motion this always returns `idleSlot`.
   */
  slotFor(target: AnimationTarget, idleSlot: string): string;
}

/**
 * Bind the current frame's events to the active theme's animation cues.
 *
 * `events` is the batch for the CURRENT render (as `host.frame.events`); the
 * hook reacts to it and holds only the resulting frames. Under reduced motion it
 * enqueues nothing and clears any live frames, so the effect takes hold the
 * moment the preference flips mid-session.
 */
export function useAnimationCues(
  events: readonly GameEvent[],
  initialStage: number,
  options: UseAnimationCuesOptions = {},
): AnimationCues {
  const reducedMotion = useReducedMotion(options.reducedMotionSource);
  const scheduler = options.scheduler ?? defaultScheduler;
  const now = options.now ?? Date.now;

  // Live frames in a ref: they are presentation data read during render, and
  // mutating them must not risk the drain callback reading a stale value.
  const effectsRef = useRef<ActiveEffect[]>([]);
  const drainRef = useRef<unknown>(null);
  // A token bumped whenever the frame set changes, so the drain effect re-arms.
  const [version, setVersion] = useState(0);

  const cues = ACTIVE_THEME.animation.cues;

  /** Cancel any pending drain. */
  const clearDrain = useCallback((): void => {
    if (drainRef.current !== null) {
      scheduler.clearTimeout(drainRef.current);
      drainRef.current = null;
    }
  }, [scheduler]);

  /** Drop every live frame and stop the drain (no state change here). */
  const clearEffects = useCallback((): void => {
    clearDrain();
    effectsRef.current = [];
  }, [clearDrain]);

  // React to the current batch. Dependency on `events`: the host produces a NEW
  // array per rendered frame, so this runs once per frame (and the drain's own
  // re-render passes the SAME array reference, so it does not re-run).
  useEffect(() => {
    if (reducedMotion) {
      clearEffects();
      setVersion((v) => v + 1);
      return;
    }
    if (events.length === 0) return;

    const winners = collectCueWinners(events, initialStage);
    let enqueued = false;
    for (const target of ANIMATION_TARGETS) {
      const cueKey = winners[target];
      if (cueKey === undefined) continue;
      const cue = cues[cueKey];
      if (cue.durationMs <= 0) continue;
      const existing = effectsRef.current.findIndex((effect) => effect.target === target);
      if (existing !== -1) effectsRef.current.splice(existing, 1);
      effectsRef.current.push({
        target,
        slot: cue.slot,
        expiresAtMs: now() + cue.durationMs,
      });
      enqueued = true;
    }
    if (effectsRef.current.length > MAX_ACTIVE_EFFECTS) {
      effectsRef.current.splice(0, effectsRef.current.length - MAX_ACTIVE_EFFECTS);
    }
    if (enqueued) setVersion((v) => v + 1);
    // `cues` is the active theme's static map; `initialStage`/`now` are stable
    // enough for a display-only batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, reducedMotion, clearEffects]);

  // Clear immediately when the preference flips ON mid-session, even with no new
  // events arriving.
  useEffect(() => {
    if (reducedMotion) {
      clearEffects();
      setVersion((v) => v + 1);
    }
  }, [reducedMotion, clearEffects]);

  // ONE drain for the whole queue: wake at the EARLIEST deadline, remove what
  // expired, re-render (sprites return to idle), then re-arm for the earliest
  // survivor. Any pending timer is cleared first, so at most one ever exists.
  // The drain ALWAYS bumps `version` after firing (even when nothing expired), so
  // an early wake / wall-clock jump re-arms instead of stranding a live frame —
  // mirroring `/web`'s unconditional `scheduleDrain()` after every fire.
  useEffect(() => {
    clearDrain();
    if (reducedMotion || effectsRef.current.length === 0) return;

    const deadline = Math.min(...effectsRef.current.map((effect) => effect.expiresAtMs));
    drainRef.current = scheduler.setTimeout(() => {
      drainRef.current = null;
      const currentNow = now();
      const survivors = effectsRef.current.filter((effect) => effect.expiresAtMs > currentNow);
      effectsRef.current = survivors;
      setVersion((v) => v + 1);
    }, Math.max(0, deadline - now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, reducedMotion, clearDrain, scheduler]);

  // Tear down the drain on unmount.
  useEffect(() => clearDrain, [clearDrain]);

  const slotFor = useCallback(
    (target: AnimationTarget, idleSlot: string): string => {
      if (reducedMotion) return idleSlot;
      const effect = effectsRef.current.find((candidate) => candidate.target === target);
      return effect === undefined ? idleSlot : effect.slot;
    },
    [reducedMotion],
  );

  return useMemo(() => ({ reducedMotion, slotFor }), [reducedMotion, slotFor]);
}
