// GameScreen.tsx — the container that binds the host to the presentational
// components.
//
// It reads `useGameHost` once and passes the current `GameState` plus the host's
// handler surface down as props. It also mounts the presentation-only surfaces
// (achievement splash, milestone flourish, enemy taunt toast) that diff state or
// scan the host's event batch. Its only local state is PRESENTATION state (the
// dismissed offline summary); it holds no gameplay state, rules, or balance
// numbers. Handlers are forwarded verbatim, so every tap reaches `applyAction`
// exactly once.

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGameHost } from '../useGameHost';
import type { UseGameHostOptions } from '../useGameHost';
import { useReducedMotion } from '../animation/useReducedMotion';
import { styles } from '../theme';
import { AchievementsShelf } from './AchievementsShelf';
import { Arena } from './Arena';
import { BagPanel } from './BagPanel';
import { ChoiceOverlay } from './ChoiceOverlay';
import { EquippedPanel } from './EquippedPanel';
import { Hud } from './Hud';
import { OfflineOverlay } from './OfflineOverlay';
import { Splash } from './Splash';
import { Toast } from './Toast';
import { bottomInsetPadding, layout, screenFramePadding } from './layout';
import { useAchievementSplash, useEnemyTaunt, useMilestoneFlourish } from './surfaces';

export interface GameScreenProps {
  /** Optional host overrides (repository / clock / seed / scheduler) for tests. */
  hostOptions?: UseGameHostOptions;
}

export function GameScreen({ hostOptions }: GameScreenProps): React.JSX.Element {
  const host = useGameHost(hostOptions ?? {});
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const reducedMotion = useReducedMotion();
  const splash = useAchievementSplash(host.state);
  const milestone = useMilestoneFlourish(host.state);
  const taunt = useEnemyTaunt(host.frame.events);
  // The device safe-area insets. The top inset keeps the HUD below the Android
  // status bar / cutout; the bottom inset keeps the scroll tail and the
  // bottom-anchored toast stack above the home indicator / gesture area. With
  // zero insets this composes to exactly the base design padding (no extra).
  const insets = useSafeAreaInsets();

  if (!host.ready || host.state === null) {
    return (
      <View testID="booting" style={[styles.screen, layout.screen, screenFramePadding(insets)]} />
    );
  }

  const handlers = {
    onClick: host.onClick,
    onUpgrade: host.onUpgrade,
    onEquip: host.onEquip,
    onChoice: host.onChoice,
    onClaim: host.onClaim,
  };

  return (
    <View testID="game-screen" style={[styles.screen, layout.screen, screenFramePadding(insets)]}>
      <ScrollView contentContainerStyle={layout.scroll}>
        <Hud state={host.state} />
        <Arena
          state={host.state}
          handlers={handlers}
          stageBeganAtMs={host.frame.stageBeganAtMs}
          events={host.frame.events}
        />
        <EquippedPanel state={host.state} handlers={handlers} />
        <BagPanel state={host.state} handlers={handlers} />
        <AchievementsShelf state={host.state} />
      </ScrollView>
      {splash.definition !== null ? (
        <Splash definition={splash.definition} reducedMotion={reducedMotion} />
      ) : null}
      {taunt.text !== null || milestone.text !== null ? (
        <View
          testID="toast-stack"
          style={[layout.toastStack, { paddingBottom: bottomInsetPadding(insets) }]}
          pointerEvents="none"
        >
          {taunt.text !== null ? (
            <Toast
              testID="enemy-taunt"
              text={taunt.text}
              tone={styles.panel}
              textStyle={styles.textDim}
              reducedMotion={reducedMotion}
            />
          ) : null}
          {milestone.text !== null ? (
            <Toast
              testID="milestone-flourish"
              text={milestone.text}
              tone={styles.accent}
              textStyle={styles.accentInk}
              reducedMotion={reducedMotion}
              emphasis
            />
          ) : null}
        </View>
      ) : null}
      <ChoiceOverlay state={host.state} handlers={handlers} />
      {host.offline !== null && !offlineDismissed ? (
        <OfflineOverlay summary={host.offline} onDismiss={() => setOfflineDismissed(true)} />
      ) : null}
    </View>
  );
}
