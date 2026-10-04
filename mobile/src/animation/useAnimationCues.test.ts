// useAnimationCues.test.ts — task 3.3.
//
// Drives cue expiries deterministically through an injected timer seam, and
// covers the reduced-motion and duration-0 off switches.

import { act, renderHook } from '@testing-library/react-native';

import { ACTIVE_THEME } from '@auto-auto-clicker/engine-core';
import type { GameEvent } from '@auto-auto-clicker/engine-core';

import { useAnimationCues } from './useAnimationCues';
import type { CueScheduler } from './useAnimationCues';
import type { ReducedMotionSource } from './useReducedMotion';

/** A timer seam whose single scheduled handler is fired manually. */
class ManualCueScheduler implements CueScheduler {
  private handler: (() => void) | null = null;
  private lastDelay: number | null = null;

  setTimeout(handler: () => void, delayMs: number): unknown {
    this.handler = handler;
    this.lastDelay = delayMs;
    return Symbol('timeout');
  }

  clearTimeout(): void {
    this.handler = null;
  }

  fire(): void {
    const handler = this.handler;
    this.handler = null;
    handler?.();
  }

  get scheduled(): boolean {
    return this.handler !== null;
  }

  get delay(): number | null {
    return this.lastDelay;
  }
}

/** A reduced-motion double fixed at one value. */
function motionSource(initial: boolean): {
  source: ReducedMotionSource;
  emit(enabled: boolean): void;
} {
  let handler: ((enabled: boolean) => void) | null = null;
  return {
    source: {
      isReduceMotionEnabled: () => Promise.resolve(initial),
      addEventListener: (_event, next) => {
        handler = next;
        return { remove: () => (handler = null) };
      },
    },
    emit: (enabled) => handler?.(enabled),
  };
}

const clickEvent: GameEvent = { type: 'damageDealt', amount: 5, source: 'click' };

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useAnimationCues (3.3)', () => {
  it('shows the cue frame then returns to idle on deterministic expiry', async () => {
    const scheduler = new ManualCueScheduler();
    const motion = motionSource(false);
    let nowMs = 1000;

    const { result, rerender } = await renderHook(
      ({ events }: { events: readonly GameEvent[] }) =>
        useAnimationCues(events, 1, {
          scheduler,
          reducedMotionSource: motion.source,
          now: () => nowMs,
        }),
      { initialProps: { events: [] as readonly GameEvent[] } },
    );
    await settle();

    await rerender({ events: [clickEvent] });

    // The player cue (playerAttack, 180 ms) is live; the enemy cue too.
    expect(result.current.slotFor('player', 'player-idle')).toBe(
      ACTIVE_THEME.animation.cues.playerAttack.slot,
    );
    expect(scheduler.scheduled).toBe(true);
    // ONE drain wakes at the EARLIEST deadline across all live frames.
    expect(scheduler.delay).toBe(
      Math.min(
        ACTIVE_THEME.animation.cues.playerAttack.durationMs,
        ACTIVE_THEME.animation.cues.enemyHit.durationMs,
      ),
    );

    // Advance past BOTH cue durations and fire the drain.
    nowMs += Math.max(
      ACTIVE_THEME.animation.cues.playerAttack.durationMs,
      ACTIVE_THEME.animation.cues.enemyHit.durationMs,
    );
    await act(async () => {
      scheduler.fire();
    });

    expect(result.current.slotFor('player', 'player-idle')).toBe('player-idle');
    expect(result.current.slotFor('enemy', 'enemy-grunt-idle')).toBe('enemy-grunt-idle');
  });

  it('enqueues no frame under reduced motion', async () => {
    const scheduler = new ManualCueScheduler();
    const motion = motionSource(true);

    const { result, rerender } = await renderHook(
      ({ events }: { events: readonly GameEvent[] }) =>
        useAnimationCues(events, 1, { scheduler, reducedMotionSource: motion.source }),
      { initialProps: { events: [] as readonly GameEvent[] } },
    );
    await settle();

    await rerender({ events: [clickEvent] });

    expect(result.current.reducedMotion).toBe(true);
    expect(result.current.slotFor('player', 'player-idle')).toBe('player-idle');
    expect(scheduler.scheduled).toBe(false);
  });

  it('clears live frames when reduced motion flips on mid-session', async () => {
    const scheduler = new ManualCueScheduler();
    const motion = motionSource(false);

    const { result, rerender } = await renderHook(
      ({ events }: { events: readonly GameEvent[] }) =>
        useAnimationCues(events, 1, { scheduler, reducedMotionSource: motion.source }),
      { initialProps: { events: [] as readonly GameEvent[] } },
    );
    await settle();

    await rerender({ events: [clickEvent] });
    expect(result.current.slotFor('player', 'player-idle')).not.toBe('player-idle');

    await act(async () => {
      motion.emit(true);
    });
    expect(result.current.slotFor('player', 'player-idle')).toBe('player-idle');
  });

  it('re-arms the drain after an early wake, so a surviving frame still expires', async () => {
    const scheduler = new ManualCueScheduler();
    const motion = motionSource(false);
    let nowMs = 1000;

    const { result, rerender } = await renderHook(
      ({ events }: { events: readonly GameEvent[] }) =>
        useAnimationCues(events, 1, {
          scheduler,
          reducedMotionSource: motion.source,
          now: () => nowMs,
        }),
      { initialProps: { events: [] as readonly GameEvent[] } },
    );
    await settle();

    // A single click yields two frames with different durations; the drain arms
    // at the EARLIEST deadline.
    await rerender({ events: [clickEvent] });
    expect(scheduler.scheduled).toBe(true);

    // Fire EARLY (before any frame has expired): nothing is removed, but the
    // drain must re-arm rather than strand the frames.
    await act(async () => {
      scheduler.fire();
    });
    expect(scheduler.scheduled).toBe(true);
    expect(result.current.slotFor('player', 'player-idle')).not.toBe('player-idle');

    // Advance past the longest duration and fire again; the frame returns to idle.
    nowMs += Math.max(
      ACTIVE_THEME.animation.cues.playerAttack.durationMs,
      ACTIVE_THEME.animation.cues.enemyHit.durationMs,
    );
    await act(async () => {
      scheduler.fire();
    });
    expect(result.current.slotFor('player', 'player-idle')).toBe('player-idle');
  });

  it('duration 0 disables a cue', async () => {
    const scheduler = new ManualCueScheduler();
    const motion = motionSource(false);
    const cues = ACTIVE_THEME.animation.cues;

    // Temporarily zero the playerAttack cue for this case.
    const original = cues.playerAttack.durationMs;
    cues.playerAttack.durationMs = 0;
    try {
      const { result, rerender } = await renderHook(
        ({ events }: { events: readonly GameEvent[] }) =>
          useAnimationCues(events, 1, { scheduler, reducedMotionSource: motion.source }),
        { initialProps: { events: [] as readonly GameEvent[] } },
      );
      await settle();

      await rerender({ events: [{ type: 'damageDealt', amount: 5, source: 'click' }] });
      expect(result.current.slotFor('player', 'player-idle')).toBe('player-idle');
    } finally {
      cues.playerAttack.durationMs = original;
    }
  });
});
