// Splash.tsx — a centered, non-blocking announcement (the queued achievement
// splash).
//
// The RN analogue of `/web`'s `.splash`. It is INFORMATION, so it renders the
// kicker/title/description under reduced motion too — without the pop entrance.
//
// It holds no queue of its own: the caller owns which definition is current and
// how long it stays.

import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ACTIVE_THEME } from '@auto-auto-clicker/engine-core';
import type { AchievementDefinition } from '@auto-auto-clicker/engine-core';

import { useEntrance } from '../animation/motion';
import { styles } from '../theme';
import { layout } from './layout';

export interface SplashProps {
  /** The achievement definition to announce (title/description from the theme). */
  definition: AchievementDefinition;
  /** Whether reduced motion is currently on (suppresses the pop only). */
  reducedMotion: boolean;
}

export function Splash({ definition, reducedMotion }: SplashProps): React.JSX.Element {
  const theme = ACTIVE_THEME;
  const entrance = useEntrance(reducedMotion);
  return (
    <Animated.View testID="achievement-splash" style={[layout.splash, entrance]}>
      <View style={[layout.panel, styles.panel]}>
        <Text style={[layout.splashKicker, styles.accent]}>{theme.ui.splashKicker}</Text>
        <Text testID="splash-title" style={[layout.splashTitle, styles.text]}>
          {definition.title}
        </Text>
        <Text testID="splash-desc" style={[layout.splashDesc, styles.textDim]}>
          {definition.description}
        </Text>
      </View>
    </Animated.View>
  );
}
