// EquippedPanel.tsx — the equipped cards and the four per-slot upgrade controls.
//
// Pure projection of `GameState` + engine getters: each control's level and cost
// come from `getUpgradeCost` / `getMilestoneInfo`, and its disabled state is the
// honest "cannot afford / nothing equipped" answer. Gold is an allocation choice
// across four slots, so each slot owns its own control.

import { Pressable, Text, View } from 'react-native';

import {
  ACTIVE_THEME,
  getCritStats,
  getGearStats,
  getGlobalBonuses,
  getMilestoneInfo,
  getUpgradeCost,
} from '@auto-auto-clicker/engine-core';
import type { GameState, GearInstance, GearSlot } from '@auto-auto-clicker/engine-core';

import { styles } from '../theme';
import { EQUIP_SLOTS } from './types';
import type { GameHandlers } from './types';
import { formatInt, formatPercent } from './format';
import { layout } from './layout';

export interface EquippedPanelProps {
  state: GameState;
  handlers: GameHandlers;
}

export function EquippedPanel({ state, handlers }: EquippedPanelProps): React.JSX.Element {
  const theme = ACTIVE_THEME;
  return (
    <View testID="equipped-panel" style={[layout.panel, styles.panel]}>
      <View style={layout.panelHeader}>
        <Text style={[layout.panelTitle, styles.text]}>{theme.ui.equippedTitle}</Text>
      </View>
      <View style={layout.cardRow}>
        <GearCard state={state} slot="weapon" item={state.gear.equipped.weapon} />
        {EQUIP_SLOTS.filter((slot) => slot !== 'weapon').map((slot) => {
          const item = state.gear.equipped[slot];
          return item ? <GearCard key={slot} state={state} slot={slot} item={item} /> : null;
        })}
      </View>
      <View style={layout.cardRow}>
        {EQUIP_SLOTS.map((slot) => (
          <UpgradeControl key={slot} state={state} slot={slot} handlers={handlers} />
        ))}
      </View>
      {state.gear.equipped.weapon === null ? (
        <Text style={[layout.hint, styles.textDim]}>{theme.ui.upgradeHint}</Text>
      ) : null}
    </View>
  );
}

function GearCard({
  state,
  slot,
  item,
}: {
  state: GameState;
  slot: GearSlot;
  item: GearInstance | null;
}): React.JSX.Element {
  const theme = ACTIVE_THEME;
  const info = getMilestoneInfo(slot, item ? item.upgradeLevel : 0);
  return (
    <View testID={`equipped-${slot}`} style={[layout.card, styles.raised]}>
      <Text style={[layout.cardTitle, styles.text]}>{slotLabel(slot, item)}</Text>
      <Text style={[layout.cardStats, styles.textDim]}>
        {item ? gearStatLine(state, slot, item) : theme.slots.stats.empty}
      </Text>
      {item && info.achievedCount > 0 ? (
        <Text testID={`milestone-badge-${slot}`} style={[layout.cardMilestone, styles.accent]}>
          {theme.slots.milestone.badge(formatInt(info.achievedCount), info.bonusDescription)}
        </Text>
      ) : null}
    </View>
  );
}

function UpgradeControl({
  state,
  slot,
  handlers,
}: {
  state: GameState;
  slot: GearSlot;
  handlers: GameHandlers;
}): React.JSX.Element {
  const theme = ACTIVE_THEME;
  const item = state.gear.equipped[slot];
  const cost = getUpgradeCost(state, slot);
  const disabled = cost === null || state.player.gold < cost;
  return (
    <View style={[layout.upgradeRow, styles.surface]}>
      <Text style={[layout.upgradeName, styles.text]}>{theme.slots.display[slot]}</Text>
      <Text testID={`upgrade-level-${slot}`} style={[layout.upgradeMeta, styles.textMuted]}>
        {item ? theme.ui.upgradeRow.level(formatInt(item.upgradeLevel)) : theme.ui.placeholder}
      </Text>
      <Text testID={`upgrade-cost-${slot}`} style={[layout.upgradeMeta, styles.textMuted]}>
        {cost === null ? theme.ui.placeholder : theme.ui.upgradeRow.cost(formatInt(cost))}
      </Text>
      <Pressable
        testID={`upgrade-btn-${slot}`}
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => handlers.onUpgrade(slot)}
        style={[layout.button, styles.accent, disabled ? layout.buttonDisabled : null]}
      >
        <Text style={[layout.buttonLabel, styles.accentInk]}>{theme.ui.upgradeButton}</Text>
      </Pressable>
    </View>
  );
}

/** The equipped-card label: a filled card, or the theme's empty-slot copy. */
function slotLabel(slot: GearSlot, item: GearInstance | null): string {
  const theme = ACTIVE_THEME;
  if (item === null) return theme.slots.empty[slot];
  const level = formatInt(item.itemLevel);
  return theme.slots.card[slot](level);
}

/**
 * Equipped-card stat line. Per-item crit/gold/power values are the item's own
 * RAW contribution; the card also shows the current CAPPED totals, so it stays
 * honest without hard-coding any balance number.
 */
function gearStatLine(state: GameState, slot: GearSlot, item: GearInstance): string {
  const theme = ACTIVE_THEME;
  const gear = getGearStats(item);
  if (slot === 'weapon') {
    return theme.slots.stats.weapon(
      formatInt(gear.dps),
      formatInt(gear.clickDamage),
      formatInt(item.upgradeLevel),
    );
  }
  if (slot === 'necklace') {
    const { goldMultiplier, powerMultiplier } = getGlobalBonuses(state);
    return theme.slots.stats.necklace(
      formatPercent(gear.goldMultiplier),
      formatPercent(gear.powerMultiplier),
      formatPercent(goldMultiplier),
      formatPercent(powerMultiplier),
    );
  }
  const { critChance, critMultiplier } = getCritStats(state);
  return theme.slots.stats.ring(
    formatPercent(gear.critChance),
    formatPercent(gear.critMultiplier),
    formatPercent(critChance),
    formatPercent(critMultiplier - 1),
  );
}
