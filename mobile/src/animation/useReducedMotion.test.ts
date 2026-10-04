// useReducedMotion.test.ts — task 3.2.
//
// Mocks a `ReducedMotionSource` to cover the initial-on, initial-off, and live
// flip cases, and asserts the change listener is removed on unmount.

import { act, renderHook } from '@testing-library/react-native';

import { useReducedMotion } from './useReducedMotion';
import type { ReducedMotionSource } from './useReducedMotion';

/** A source double whose initial read and change listener tests control. */
function source(initial: boolean | Promise<boolean>): {
  source: ReducedMotionSource;
  emit(enabled: boolean): void;
  removed(): boolean;
  isEnabled(): Promise<boolean>;
} {
  let handler: ((enabled: boolean) => void) | null = null;
  let removeCount = 0;
  const promise = initial instanceof Promise ? initial : Promise.resolve(initial);
  return {
    source: {
      isReduceMotionEnabled: () => promise,
      addEventListener: (_event, next) => {
        handler = next;
        return {
          remove: () => {
            removeCount += 1;
            handler = null;
          },
        };
      },
    },
    emit: (enabled) => handler?.(enabled),
    removed: () => removeCount > 0,
    isEnabled: () => promise,
  };
}

describe('useReducedMotion (3.2)', () => {
  it('reports enabled when the initial read is true', async () => {
    const double = source(true);
    const { result } = await renderHook(() => useReducedMotion(double.source));
    await act(async () => {
      await double.isEnabled();
    });
    expect(result.current).toBe(true);
  });

  it('reports disabled when the initial read is false', async () => {
    const double = source(false);
    const { result } = await renderHook(() => useReducedMotion(double.source));
    await act(async () => {
      await double.isEnabled();
    });
    expect(result.current).toBe(false);
  });

  it('flips live when the preference changes mid-session', async () => {
    const double = source(false);
    const { result } = await renderHook(() => useReducedMotion(double.source));
    await act(async () => {
      await double.isEnabled();
    });
    expect(result.current).toBe(false);

    await act(async () => {
      double.emit(true);
    });
    expect(result.current).toBe(true);

    await act(async () => {
      double.emit(false);
    });
    expect(result.current).toBe(false);
  });

  it('removes the change listener on unmount', async () => {
    const double = source(false);
    const { unmount } = await renderHook(() => useReducedMotion(double.source));
    await act(async () => {
      await double.isEnabled();
    });
    await unmount();
    expect(double.removed()).toBe(true);
  });

  it('treats an unavailable read as motion-allowed', async () => {
    const double = source(Promise.reject(new Error('unavailable')));
    const { result } = await renderHook(() => useReducedMotion(double.source));
    await act(async () => {
      // Absorb the rejection the hook intentionally swallows.
      await double.isEnabled().catch(() => undefined);
    });
    expect(result.current).toBe(false);
  });
});
