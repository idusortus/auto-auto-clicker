// OfflineOverlay.tsx — the "welcome back" summary modal.
//
// Shown once on boot when offline replay advanced the state by at least one
// step. The text is assembled from the summary the host computed and the active
// theme's duration / earned copy; nothing is hard-coded.

import { Modal, Pressable, Text, View } from 'react-native';

import { ACTIVE_THEME } from '@auto-auto-clicker/engine-core';

import { styles } from '../theme';
import type { OfflineViewProps } from './types';
import { formatDuration, formatInt } from './format';
import { layout } from './layout';

export function OfflineOverlay({
  summary,
  onDismiss,
}: OfflineViewProps): React.JSX.Element {
  const theme = ACTIVE_THEME;
  const duration = formatDuration(summary.simulatedMs);
  const earned = formatInt(summary.goldEarned);
  const capped = summary.capped ? theme.ui.offline.capped : '';
  const text = theme.ui.offline.earned(earned, duration) + capped;

  return (
    <Modal testID="offline-overlay" visible transparent animationType="fade">
      <View style={[layout.overlayBackdrop, styles.overlayBackdrop]}>
        <View
          testID="offline-card"
          style={[layout.overlayCard, styles.panel, styles.accentEdge]}
          accessibilityViewIsModal
        >
          <Text style={[layout.overlayTitle, styles.text]}>{theme.ui.offline.title}</Text>
          <Text testID="offline-text" style={[layout.overlayBody, styles.textDim]}>
            {text}
          </Text>
          <Pressable
            testID="offline-dismiss"
            accessibilityRole="button"
            onPress={onDismiss}
            style={[layout.button, styles.accent]}
          >
            <Text style={[layout.buttonLabel, styles.accentInk]}>
              {theme.ui.offline.dismiss}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
