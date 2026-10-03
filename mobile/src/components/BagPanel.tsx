// BagPanel.tsx — the bag shelf with an explicit Equip control per row.
//
// Pure projection of `GameState` + engine getters. Items are ordered by the
// engine's shared power metric and a "better" tag is shown for items the engine
// already flagged as a strict upgrade. One tap dispatches exactly one equip.

import { Pressable, Text, View } from 'react-native';

import { ACTIVE_THEME, getGearStats } from '@auto-auto-clicker/engine-core';
import type { GameState, GearInstance, GearSlot } from '@auto-auto-clicker/engine-core';

import { styles } from '../theme';
import type { GameHandlers } from './types';
import { bestBagIds, bagItemSlot, sortedBag } from './gear';
import { formatInt, formatPercent } from './format';
import { layout } from './layout';

export interface BagPanelProps {
  state: GameState;
  handlers: GameHandlers;
}

export function BagPanel({ state, handlers }: BagPanelProps): React.JSX.Element {
  const theme = ACTIVE_THEME;
  const bag = sortedBag(state);
  const better = bestBagIds(state);

  return (
    <View testID="bag-panel" style={[layout.panel, styles.panel]}>
      <View style={layout.panelHeader}>
        <Text style={[layout.panelTitle, styles.text]}>{theme.ui.bag.title}</Text>
        <Text style={[layout.panelMeta, styles.textMuted]}>
          {formatInt(state.gear.bag.length)}
          {theme.ui.bag.countSuffix}
        </Text>
      </View>
      {bag.length === 0 ? (
        <Text testID="bag-empty" style={[layout.hint, styles.textDim]}>
          {theme.ui.bag.empty}
        </Text>
      ) : (
        bag.map((item) => (
          <BagRow
            key={item.id}
            item={item}
            isUpgrade={better.has(item.id)}
            handlers={handlers}
          />
        ))
      )}
    </View>
  );
}

function BagRow({
  item,
  isUpgrade,
  handlers,
}: {
  item: GearInstance;
  isUpgrade: boolean;
  handlers: GameHandlers;
}): React.JSX.Element {
  const theme = ACTIVE_THEME;
  const slot = bagItemSlot(item);
  return (
    <View
      testID={`bag-item-${item.id}`}
      style={[layout.bagRow, isUpgrade ? styles.raised : styles.surface]}
    >
      <Text style={[layout.bagInfo, styles.text]}>{bagItemSummary(slot, item)}</Text>
      {isUpgrade ? (
        <Text testID="bag-upgrade-tag" style={[layout.bagTag, styles.accent]}>
          {theme.ui.bag.betterTag}
        </Text>
      ) : null}
      <Pressable
        testID={`equip-btn-${item.id}`}
        accessibilityRole="button"
        onPress={() => handlers.onEquip(item.id)}
        style={[layout.button, styles.control]}
      >
        <Text style={[layout.buttonLabel, styles.text]}>{theme.ui.bag.equip}</Text>
      </Pressable>
    </View>
  );
}

/** Slot-aware one-line summary of a bag item (no balance numbers hard-coded). */
function bagItemSummary(slot: GearSlot, item: GearInstance): string {
  const theme = ACTIVE_THEME;
  const gear = getGearStats(item);
  const level = theme.ui.bag.level(formatInt(item.itemLevel));
  if (slot === 'necklace') {
    return theme.ui.bag.necklaceSummary(
      level,
      formatPercent(gear.goldMultiplier),
      formatPercent(gear.powerMultiplier),
    );
  }
  if (slot === 'ring1' || slot === 'ring2') {
    return theme.ui.bag.ringSummary(
      level,
      formatPercent(gear.critChance),
      formatPercent(gear.critMultiplier),
    );
  }
  return theme.ui.bag.weaponSummary(level, formatInt(gear.dps), formatInt(gear.clickDamage));
}
