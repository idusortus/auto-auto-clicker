// GameScreen.tsx — the container that binds the host to the presentational
// components.
//
// It reads `useGameHost` once and passes the current `GameState` plus the host's
// handler surface down as props. Its only local state is PRESENTATION state (the
// dismissed offline summary); it holds no gameplay state, rules, or balance
// numbers. Handlers are forwarded verbatim, so every tap reaches `applyAction`
// exactly once.

import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useGameHost } from '../useGameHost';
import type { UseGameHostOptions } from '../useGameHost';
import { styles } from '../theme';
import { AchievementsShelf } from './AchievementsShelf';
import { Arena } from './Arena';
import { BagPanel } from './BagPanel';
import { ChoiceOverlay } from './ChoiceOverlay';
import { EquippedPanel } from './EquippedPanel';
import { Hud } from './Hud';
import { OfflineOverlay } from './OfflineOverlay';
import { layout } from './layout';

export interface GameScreenProps {
  /** Optional host overrides (repository / clock / seed / scheduler) for tests. */
  hostOptions?: UseGameHostOptions;
}

export function GameScreen({ hostOptions }: GameScreenProps): React.JSX.Element {
  const host = useGameHost(hostOptions ?? {});
  const [offlineDismissed, setOfflineDismissed] = useState(false);

  if (!host.ready || host.state === null) {
    return <View testID="booting" style={[styles.screen, layout.screen]} />;
  }

  const handlers = {
    onClick: host.onClick,
    onUpgrade: host.onUpgrade,
    onEquip: host.onEquip,
    onChoice: host.onChoice,
    onClaim: host.onClaim,
  };

  return (
    <View testID="game-screen" style={[styles.screen, layout.screen]}>
      <ScrollView contentContainerStyle={layout.scroll}>
        <Hud state={host.state} />
        <Arena
          state={host.state}
          handlers={handlers}
          stageBeganAtMs={host.frame.stageBeganAtMs}
        />
        <EquippedPanel state={host.state} handlers={handlers} />
        <BagPanel state={host.state} handlers={handlers} />
        <AchievementsShelf state={host.state} />
      </ScrollView>
      <ChoiceOverlay state={host.state} handlers={handlers} />
      {host.offline !== null && !offlineDismissed ? (
        <OfflineOverlay summary={host.offline} onDismiss={() => setOfflineDismissed(true)} />
      ) : null}
    </View>
  );
}
