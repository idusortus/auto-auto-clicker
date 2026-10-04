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
  // The generated theme-asset registry (`src/themeAssets.gen.ts`) `require()`s the
  // bundled theme PNGs. jest-expo's preset ships the asset transformer but does
  // not list image extensions, so Jest cannot resolve those `require()`s without
  // `png` here (Metro resolves them at bundle time; Jest needs the explicit entry).
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'node', 'png'],
  moduleNameMapper: {
    // `mobile` pins react@19.2.3 but npm hoists react@19.3.0 to the root for the
    // rest of the tree (react-native, jest-expo, @testing-library). Force a
    // single React so hooks and the test renderer share one instance.
    // (No `@react-native/assets-registry` shim is needed on the SDK-57 paired
    // `react-native` 0.86.3: that package exists again, so `jest-expo`'s preset
    // resolves the real path.)
    '^react$': '<rootDir>/node_modules/react',
    '^react/jsx-runtime$': '<rootDir>/node_modules/react/jsx-runtime',
    '^react/jsx-dev-runtime$': '<rootDir>/node_modules/react/jsx-dev-runtime',
    // MUST target the WORKSPACE-LOCAL copy (`mobile/node_modules/react-native`,
    // npm-installed as the SDK-57 paired react-native@0.86.3), NOT the hoisted
    // root copy (`../node_modules/react-native` = 0.87.1). Jest must validate the
    // SAME RN minor that `expo prebuild`/Gradle ship in the APK; resolving the
    // root hoist would silently test a different RN and mask SDK-57 fallout.
    '^react-native($|/.*)$': '<rootDir>/node_modules/react-native/$1',
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
