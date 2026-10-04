// ChoiceOverlay.tsx — the pending-choice modal.
//
// Shown only while `state.choices.pending` is non-null. Title and body come from
// the active theme and engine getters; the free "wait" option is always enabled
// and the ad / purchase placeholders stay disabled, mirroring the web renderer.

import { Modal, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ACTIVE_THEME, getProjectedKillMs } from '@auto-auto-clicker/engine-core';
import type { GameState } from '@auto-auto-clicker/engine-core';

import { useEntrance } from '../animation/motion';
import { useReducedMotion } from '../animation/useReducedMotion';
import { styles } from '../theme';
import type { GameHandlers } from './types';
import { formatInt } from './format';
import { layout } from './layout';

export interface ChoiceOverlayProps {
  state: GameState;
  handlers: GameHandlers;
}

export function ChoiceOverlay({ state, handlers }: ChoiceOverlayProps): React.JSX.Element {
  const theme = ACTIVE_THEME;
  const reducedMotion = useReducedMotion();
  const entrance = useEntrance(reducedMotion);
  const pending = state.choices.pending;
  const visible = pending !== null;

  const title =
    pending === null
      ? ''
      : pending.kind === 'boss-check'
        ? theme.enemy.bossCheck
        : theme.enemy.progressionWall;
  const projected = getProjectedKillMs(state);
  const projectedText =
    pending === null || projected === null
      ? ''
      : theme.enemy.projectedKill(formatInt(projected));
  const body =
    pending === null
      ? ''
      : pending.kind === 'boss-check'
        ? theme.enemy.bossCheckBody(formatInt(pending.stage), projectedText)
        : theme.enemy.progressionWallBody(formatInt(pending.stage), projectedText);

  return (
    <Modal testID="choice-overlay" visible={visible} transparent animationType="fade">
      <View style={[layout.overlayBackdrop, styles.overlayBackdrop]}>
        <Animated.View
          testID="choice-card"
          style={[layout.overlayCard, styles.panel, styles.accentEdge, entrance]}
          accessibilityViewIsModal
        >
          <Text testID="choice-title" style={[layout.overlayTitle, styles.text]}>
            {title}
          </Text>
          <Text testID="choice-body" style={[layout.overlayBody, styles.textDim]}>
            {body}
          </Text>
          <View style={layout.overlayActions}>
            <Pressable
              testID="choice-wait"
              accessibilityRole="button"
              onPress={() => handlers.onChoice('wait')}
              style={[layout.button, styles.accent]}
            >
              <Text style={[layout.buttonLabel, styles.accentInk]}>{theme.ui.choice.wait}</Text>
            </Pressable>
            <Pressable
              testID="choice-watchAd"
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              disabled
              style={[layout.button, styles.control, layout.buttonDisabled]}
            >
              <Text style={[layout.buttonLabel, styles.textDisabled]}>
                {theme.ui.choice.watchAd}
              </Text>
            </Pressable>
            <Pressable
              testID="choice-iap"
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              disabled
              style={[layout.button, styles.control, layout.buttonDisabled]}
            >
              <Text style={[layout.buttonLabel, styles.textDisabled]}>{theme.ui.choice.iap}</Text>
            </Pressable>
          </View>
          <Text style={[layout.overlayNote, styles.textMuted]}>{theme.ui.choice.note}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}
