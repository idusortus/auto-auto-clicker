// motion.ts — shared Reanimated entrance/loop primitives for the RN flourishes.
//
// Every primitive here takes the current reduced-motion preference explicitly, so
// the caller owns ONE live preference read and there is no second subscription to
// the OS setting. The contract throughout: motion is suppressed, information is
// not. A suppressed primitive returns a STILL (final-state) animated style rather
// than nothing, so a card or message is fully visible without any movement.
//
// The jest mock wires `withTiming` / `withRepeat` / `useAnimatedStyle` as
// immediate passthroughs, so these primitives render their target value under
// tests with no native animation runtime.

import { useEffect } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Entrance "pop" duration and drift/pulse loop timings (display-only). */
const ENTRANCE_MS = 220;
const PULSE_MS = 900;
const DRIFT_MS = 3000;

/** The still scale most loops share at rest and under reduced motion. */
const REST_SCALE = 1;

/**
 * A one-shot entrance: while motion is allowed the element slides up + scales in
 * from a slightly smaller, lower start; under reduced motion it renders at its
 * final position and scale with no movement.
 */
export function useEntrance(reducedMotion: boolean): ReturnType<typeof useAnimatedStyle> {
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    progress.value = reducedMotion ? 1 : withTiming(1, { duration: ENTRANCE_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);
  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 8 }, { scale: 0.9 + progress.value * 0.1 }],
  }));
}

/**
 * A two-way scale loop (the boost pill / Shiny pulse). Under reduced motion the
 * element is static at scale 1.
 */
export function usePulse(reducedMotion: boolean): ReturnType<typeof useAnimatedStyle> {
  const scale = useSharedValue(REST_SCALE);
  useEffect(() => {
    scale.value = reducedMotion
      ? REST_SCALE
      : withRepeat(
          withTiming(1.06, { duration: PULSE_MS, easing: Easing.inOut(Easing.ease) }),
          -1,
          true,
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

/**
 * A horizontal drift loop (the wandering Shiny). Under reduced motion the element
 * sits at its base position — visible and tappable, but still.
 */
export function useDrift(reducedMotion: boolean): ReturnType<typeof useAnimatedStyle> {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = reducedMotion
      ? 0
      : withRepeat(
          withTiming(1, { duration: DRIFT_MS, easing: Easing.inOut(Easing.ease) }),
          -1,
          true,
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * 60 }] }));
}

/** The idle target width for the HP fill, as a Reanimated shared value. */
export function useHpFillWidth(
  targetPercent: number,
  reducedMotion: boolean,
): ReturnType<typeof useAnimatedStyle> {
  const width = useSharedValue(targetPercent);
  useEffect(() => {
    width.value = reducedMotion
      ? targetPercent
      : withTiming(targetPercent, { duration: ENTRANCE_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPercent, reducedMotion]);
  return useAnimatedStyle(() => ({ width: `${width.value}%` }));
}
