import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GameScreen } from './src/components/GameScreen';

/**
 * Composition root for the Expo / React Native host.
 *
 * The app is a single screen: `GameScreen` owns the `useGameHost` container and
 * projects the engine state through the theme-driven components. There is no
 * navigation library (see the change's design) — a later change adds one only if
 * multiple screens appear.
 *
 * `SafeAreaProvider` measures the device's safe-area insets once at the root so
 * `GameScreen` can keep the HUD clear of the status bar / cutout (Android
 * edge-to-edge is enabled in app.json) and the bottom content clear of the
 * gesture area. This provider itself renders no decoration.
 */
export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <GameScreen />
    </SafeAreaProvider>
  );
}
