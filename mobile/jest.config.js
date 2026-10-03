// jest.config.js — React Native test setup for the Expo host.
//
// Uses the `jest-expo` preset (which wires React Native, Expo, and Babel) plus
// the official AsyncStorage mock via `jest.setup.js`, and `@testing-library/
// react-native` for rendering hooks/components.

module.exports = {
  preset: 'jest-expo',
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.test.tsx',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // `react-native` 0.87 dropped `@react-native/assets-registry` (replaced by
  // `@react-native/asset-utils`), but the `jest-expo@57` preset still resolves
  // the old path during setup. Map it to a shim so the preset can install its
  // mock. The preset's own mappings are repeated here because config
  // moduleNameMapper entries are merged key-by-key and ours must not shadow them.
  moduleNameMapper: {
    // `mobile` pins react@19.2.3 but npm hoists react@19.3.0 to the root for the
    // rest of the tree (react-native, jest-expo, @testing-library). Force a
    // single React so hooks and the test renderer share one instance.
    '^react$': '<rootDir>/node_modules/react',
    '^react/jsx-runtime$': '<rootDir>/node_modules/react/jsx-runtime',
    '^react/jsx-dev-runtime$': '<rootDir>/node_modules/react/jsx-dev-runtime',
    '^@react-native/assets-registry/registry$':
      '<rootDir>/tests/stubs/assets-registry-registry.js',
    '^react-native($|/.*)$': '<rootDir>/../node_modules/react-native/$1',
    '^react-native-vector-icons$': '@expo/vector-icons',
    '^react-native-vector-icons/(.*)$': '@expo/vector-icons/$1',
  },
  // The preset already transforms react-native/@react-native/expo. Add the
  // AsyncStorage package so its ESM jest mock is transpiled too, and keep the
  // preset's other ignores intact.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@react-native-async-storage))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
