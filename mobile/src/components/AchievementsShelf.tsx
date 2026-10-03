// AchievementsShelf.tsx — the achievements shelf.
//
// Unlocked entries show their theme-resolved title + description (the engine's
// `ACHIEVEMENTS` catalog is resolved against ACTIVE_THEME at module load); locked
// entries tease with the theme's `???` / `Locked` copy and are revealed with the
// shelf toggle. The toggle is PRESENTATION state only — it never dispatches an
// engine action and is never persisted, exactly like the web renderer's shelf.

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ACHIEVEMENTS, ACTIVE_THEME } from '@auto-auto-clicker/engine-core';
import type { AchievementDefinition, GameState } from '@auto-auto-clicker/engine-core';

import { styles } from '../theme';
import { formatInt } from './format';
import { layout } from './layout';

export interface AchievementsShelfProps {
  state: GameState;
}

export function AchievementsShelf({ state }: AchievementsShelfProps): React.JSX.Element {
  const theme = ACTIVE_THEME;
  const unlocked = new Set(state.meta.achievements);
  const [revealLocked, setRevealLocked] = useState(false);
  const lockedCount = ACHIEVEMENTS.length - unlocked.size;
  const showEmpty = unlocked.size === 0 && !revealLocked;

  return (
    <View testID="achievements-panel" style={[layout.panel, styles.panel]}>
      <View style={layout.panelHeader}>
        <Text style={[layout.panelTitle, styles.text]}>{theme.achievements.title}</Text>
        <Text testID="achievements-count" style={[layout.panelMeta, styles.textMuted]}>
          {formatInt(unlocked.size)}
          {theme.achievements.shelf.count(formatInt(ACHIEVEMENTS.length))}
        </Text>
        {lockedCount > 0 ? (
          <Pressable
            testID="achievements-toggle"
            accessibilityRole="button"
            onPress={() => setRevealLocked((current) => !current)}
            style={[layout.button, styles.control]}
          >
            <Text style={[layout.buttonLabel, styles.text]}>
              {revealLocked
                ? theme.achievements.shelf.hide
                : theme.achievements.shelf.show(formatInt(lockedCount))}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {showEmpty ? (
        <Text testID="achievements-empty" style={[layout.hint, styles.textDim]}>
          {theme.achievements.shelf.empty}
        </Text>
      ) : null}
      {ACHIEVEMENTS.map((definition) => (
        <AchievementRow
          key={definition.id}
          definition={definition}
          isUnlocked={unlocked.has(definition.id)}
          revealLocked={revealLocked}
        />
      ))}
    </View>
  );
}

function AchievementRow({
  definition,
  isUnlocked,
  revealLocked,
}: {
  definition: AchievementDefinition;
  isUnlocked: boolean;
  revealLocked: boolean;
}): React.JSX.Element | null {
  const theme = ACTIVE_THEME;
  if (!isUnlocked && !revealLocked) return null;
  return (
    <View testID={`achievement-${definition.id}`} style={[layout.achRow, styles.raised]}>
      <Text style={[layout.achTitle, isUnlocked ? styles.text : styles.textMuted]}>
        {isUnlocked ? definition.title : theme.achievements.shelf.teaser}
      </Text>
      <Text style={[layout.achDesc, styles.textDim]}>
        {isUnlocked ? definition.description : theme.achievements.shelf.locked}
      </Text>
    </View>
  );
}
