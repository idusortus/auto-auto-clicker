// useReducedMotion.ts — live OS "reduce motion" preference for the RN host.
//
// Reads `AccessibilityInfo.isReduceMotionEnabled()` once on mount and keeps the
// value current through the `reduceMotionChanged` listener, so the preference is
// applied live without a restart (the spec's "Preference changes take effect
// immediately"). RN reports the preference inconsistently across
// platforms/emulators, so an unavailable API, a rejected promise, or a missing
// listener API is treated as MOTION-ALLOWED (the safe default: no reduced-motion
// suppression when we cannot tell). The listener is removed on unmount.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** The change event name RN emits when the OS preference flips. */
const REDUCE_MOTION_CHANGED = 'reduceMotionChanged';

/** The subset of `AccessibilityInfo` this hook needs, so tests can mock it. */
export interface ReducedMotionSource {
  isReduceMotionEnabled(): Promise<boolean>;
  addEventListener(
    event: typeof REDUCE_MOTION_CHANGED,
    handler: (enabled: boolean) => void,
  ): { remove(): void };
}

/**
 * Whether the OS reduced-motion preference is currently enabled.
 *
 * Starts at `false` (motion allowed) and updates after the initial async read
 * and on every change. Any read/registration failure leaves the preference at
 * its last known value rather than throwing into a render.
 */
export function useReducedMotion(source: ReducedMotionSource = AccessibilityInfo): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let subscription: { remove(): void } | null = null;

    function apply(enabled: boolean): void {
      if (!cancelled) setReduced(enabled);
    }

    try {
      void source.isReduceMotionEnabled().then(apply, () => {
        // Unavailable/rejected: keep motion allowed.
      });
      subscription = source.addEventListener(REDUCE_MOTION_CHANGED, apply);
    } catch {
      // Listener API unavailable: fall back to motion-allowed.
    }

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [source]);

  return reduced;
}
