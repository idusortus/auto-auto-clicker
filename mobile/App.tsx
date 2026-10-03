import { GameScreen } from './src/components/GameScreen';

/**
 * Composition root for the Expo / React Native host.
 *
 * The app is a single screen: `GameScreen` owns the `useGameHost` container and
 * projects the engine state through the theme-driven components. There is no
 * navigation library (see the change's design) — a later change adds one only if
 * multiple screens appear.
 */
export default function App(): React.JSX.Element {
  return <GameScreen />;
}
