// Hud.tsx — the top stat strip: gold, stage, DPS.
//
// Pure projection of `GameState` + engine getters. All labels come from the
// active theme; no value is hard-coded here.

import { Text, View } from 'react-native';

import { ACTIVE_THEME, getEffectiveStats } from '@auto-auto-clicker/engine-core';
import type { GameState } from '@auto-auto-clicker/engine-core';

import { styles } from '../theme';
import { formatInt } from './format';
import { layout } from './layout';

export interface HudProps {
  state: GameState;
}

export function Hud({ state }: HudProps): React.JSX.Element {
  const theme = ACTIVE_THEME;
  const stats = getEffectiveStats(state);

  return (
    <View style={[layout.hud, styles.surface, styles.hairline]}>
      <Stat label={theme.ui.hud.gold} testID="gold" value={formatInt(state.player.gold)} />
      <Stat label={theme.ui.hud.stage} testID="stage" value={formatInt(state.combat.stage)} />
      <Stat label={theme.ui.hud.dps} testID="dps" value={formatInt(stats.autoDps)} />
    </View>
  );
}

function Stat({
  label,
  testID,
  value,
}: {
  label: string;
  testID: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={layout.hudStat}>
      <Text style={[layout.hudLabel, styles.textMuted]}>{label}</Text>
      <Text testID={testID} style={[layout.hudValue, styles.text]}>
        {value}
      </Text>
    </View>
  );
}
