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
