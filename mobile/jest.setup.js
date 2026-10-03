// jest.setup.js — per-suite setup for the RN host tests.
//
// Replaces the native AsyncStorage module with the library's official in-memory
// mock so the persistence adapter can be exercised without a native runtime.
// Tests that want an isolated store can still inject `createAsyncStorage(...)`.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest').default,
);
