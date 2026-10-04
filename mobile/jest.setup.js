// jest.setup.js — per-suite setup for the RN host tests.
//
// Replaces the native AsyncStorage module with the library's official in-memory
// mock so the persistence adapter can be exercised without a native runtime.
// Tests that want an isolated store can still inject `createAsyncStorage(...)`.
//
// The SDK-57 pinned version of the library is 2.2.0, whose official mock lives
// at `jest/async-storage-mock.js` and exports the mock object directly (no
// `.default`). (The older 3.x line exposed `jest/index.js` via an `.default`.)

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Reanimated 4 sits on `react-native-worklets`, whose real entry point installs
// a NATIVE module proxy at import time. Reanimated's own official mock still
// `require()`s the real Reanimated index transitively (via `./src/mock`), which
// pulls that proxy in and throws under Jest (no native runtime). A hand-written
// mock of the small surface the host uses is therefore both simpler and more
// robust than iterating on the official mock's deep import side effects.
//
// The mocked hooks return real values synchronously, so a component test renders
// the FINAL animated style: `withTiming`/`withRepeat`/`withSpring` return their
// target value, `useSharedValue` is a mutable box, and `useAnimatedStyle` invokes
// its updater once. `withRepeat`/`Easing` are present so the modules that call
// them at import time do not crash.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, Image, ScrollView, FlatList } = require('react-native');

  const noop = () => {};
  const identityEasing = (t) => t;
  identityEasing.in = identityEasing;
  identityEasing.out = identityEasing;
  identityEasing.inOut = identityEasing;

  return {
    __esModule: true,
    default: {
      View,
      Text,
      Image,
      ScrollView,
      FlatList,
      createAnimatedComponent: (component) => component,
    },
    View,
    Text,
    Image,
    ScrollView,
    FlatList,
    useSharedValue: (initial) => {
      const box = { value: initial };
      box.get = () => box.value;
      box.set = (next) => {
        box.value = typeof next === 'function' ? next(box.value) : next;
      };
      return box;
    },
    useAnimatedStyle: (updater) => updater(),
    useDerivedValue: (updater) => ({ value: updater(), get: updater }),
    useAnimatedRef: () => ({ current: null }),
    useAnimatedReaction: noop,
    useAnimatedProps: (updater) => updater(),
    withTiming: (toValue) => toValue,
    withSpring: (toValue) => toValue,
    withRepeat: (animation) => animation,
    withSequence: (...animations) => animations[animations.length - 1],
    withDelay: (_delay, animation) => animation,
    cancelAnimation: noop,
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    Easing: {
      linear: identityEasing,
      ease: identityEasing,
      quad: identityEasing,
      cubic: identityEasing,
      poly: identityEasing,
      sin: identityEasing,
      circle: identityEasing,
      exp: identityEasing,
      elastic: identityEasing,
      back: identityEasing,
      bounce: identityEasing,
      bezier: () => identityEasing,
      bezierFn: identityEasing,
      steps: identityEasing,
      in: identityEasing,
      out: identityEasing,
      inOut: identityEasing,
    },
    interpolate: noop,
    interpolateColor: noop,
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    ReduceMotion: { System: 0, Always: 1, Never: 2 },
  };
});

// Worklets is only imported by the real Reanimated entry (which the mock above
// prevents from loading); stub it too so any incidental transitive import is a
// harmless no-op rather than the native proxy.
jest.mock('react-native-worklets', () => ({}));
