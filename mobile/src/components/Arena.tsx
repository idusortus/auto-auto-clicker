// Arena.tsx — the tappable enemy, its HP bar, the boost pill, the stall-advisory
// callout, and the Golden-Event / Stray claim control.
//
// Pure projection of `GameState` + engine getters. All copy comes from the
// active theme. The only action the advisory ever offers is the EXISTING
// `equip` dispatch — nothing is applied automatically.

import { Pressable, Text, View } from 'react-native';

import {
  ACTIVE_THEME,
  enemyForStage,
  getActiveBoost,
  getActiveEvent,
  getEnemyMaxHp,
  getStallAdvisory,
  isBoss,
} from '@auto-auto-clicker/engine-core';
import type {
  GameState,
  GearSlot,
  ShinyKind,
  StallAdvisory,
} from '@auto-auto-clicker/engine-core';

import { styles } from '../theme';
import { AssetPlaceholder } from './AssetPlaceholder';
import { formatInt, formatMultiplier, formatStallDuration } from './format';
import { layout } from './layout';
import type { GameHandlers } from './types';

const FULL_PERCENT = 100;
const MS_PER_SECOND = 1000;

export interface ArenaProps {
  state: GameState;
  handlers: GameHandlers;
  /** Sim-time at which the current stage began, or null when unknown. */
  stageBeganAtMs: number | null;
}

export function Arena({ state, handlers, stageBeganAtMs }: ArenaProps): React.JSX.Element {
  const theme = ACTIVE_THEME;
  const boss = isBoss(state.combat.stage);
  const enemy = enemyForStage(state.combat.stage);
  const display = theme.enemy.roster[enemy.id];
  if (display === undefined) {
    throw new Error(`[aac] theme "${theme.name}" has no enemy roster entry for id "${enemy.id}"`);
  }

  const maxHp = getEnemyMaxHp(state);
  const hp = Math.min(state.combat.enemyHp, maxHp);
  const hpPercent = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const playerSlot = boss ? 'boss-grunt-idle' : 'enemy-grunt-idle';

  return (
    <View style={layout.stage}>
      <BoostPill state={state} />
      <StallCallout state={state} handlers={handlers} stageBeganAtMs={stageBeganAtMs} />

      <Pressable
        testID="enemy"
        accessibilityRole="button"
        accessibilityLabel={theme.enemy.attackAria}
        onPress={handlers.onClick}
        style={[layout.enemyButton, styles.raised]}
      >
        {boss ? (
          <Text testID="boss-badge" style={[layout.bossBadge, styles.accent, styles.accentInk]}>
            {theme.enemy.boss}
          </Text>
        ) : null}
        <AssetPlaceholder slot={playerSlot} size={64} />
        <Text testID="enemy-name" style={[layout.enemyName, styles.text]}>
          {display.name}
        </Text>
        <View style={[layout.hpBar, styles.hpTrack, styles.edge]}>
          <View
            testID="hp-fill"
            style={[
              layout.hpFill,
              hpPercent >= 0.5 ? styles.hpHi : styles.hpLo,
              { width: `${hpPercent * FULL_PERCENT}%` },
            ]}
          />
        </View>
        <Text testID="enemy-hp" style={[layout.enemyHpText, styles.textDim]}>
          {theme.enemy.hp(formatInt(hp), formatInt(maxHp))}
        </Text>
      </Pressable>

      <ShinyClaim state={state} handlers={handlers} />

      <Text style={[layout.hint, styles.textDim]}>{theme.ui.tapHint}</Text>
    </View>
  );
}

/** The active frenzy pill: label and countdown both from engine values. */
function BoostPill({
  state,
}: {
  state: GameState;
}): React.JSX.Element | null {
  const theme = ACTIVE_THEME;
  const boost = getActiveBoost(state);
  if (boost === null) return null;
  const remainingMs = Math.max(0, boost.expiresAtMs - state.meta.totalPlayedMs);
  return (
    <View testID="boost-pill" style={[layout.boostPill, styles.accent, styles.accentEdge]}>
      <Text style={[layout.boostLabel, styles.accentInk]}>
        {theme.ui.boost.pill(formatMultiplier(boost.dpsMultiplier))}
      </Text>
      <Text style={[layout.boostTimer, styles.accentInk]}>
        {theme.ui.boost.timer(String(Math.ceil(remainingMs / MS_PER_SECOND)))}
      </Text>
    </View>
  );
}

/**
 * The escalating stall callout. It states the facts plainly and offers ONE
 * action: tap to equip the item the engine flagged. It never equips anything
 * itself.
 */
function StallCallout({
  state,
  handlers,
  stageBeganAtMs,
}: {
  state: GameState;
  handlers: GameHandlers;
  stageBeganAtMs: number | null;
}): React.JSX.Element | null {
  const theme = ACTIVE_THEME;
  const stall: StallAdvisory =
    state.choices.pending !== null
      ? getStallAdvisory(state)
      : getStallAdvisory(state, stageBeganAtMs ?? undefined);

  const best = stall.best;
  const instanceId = best?.bestInstanceId ?? null;
  if (stall.severity !== 'nag' || best === null || instanceId === null) return null;
  const item = state.gear.bag.find((candidate) => candidate.id === instanceId) ?? null;
  if (item === null) return null;

  const current = state.gear.equipped[best.slot];
  const bestLevel = formatInt(item.itemLevel);
  const currentLevel = current ? formatInt(current.itemLevel) : null;
  const ratio =
    Number.isFinite(best.ratio) && best.ratio >= 1.05 ? `~${best.ratio.toFixed(1)}× ` : '';
  const stage = formatInt(stall.stage);
  const duration = formatStallDuration(stall.stalledMs);
  const noun = slotNoun(best.slot);
  const body =
    currentLevel === null
      ? theme.advisory.emptySlot(stage, duration, noun, bestLevel)
      : theme.advisory.betterSlot(stage, duration, noun, bestLevel, ratio, currentLevel);

  return (
    <View testID="upgrade-advisory" style={[layout.advisory, styles.raised, styles.accentEdge]}>
      <Text style={[layout.advisoryKicker, styles.accent]}>{theme.advisory.kicker}</Text>
      <Text testID="upgrade-advisory-body" style={[layout.advisoryBody, styles.text]}>
        {body}
      </Text>
      <Pressable
        testID="upgrade-advisory-equip"
        accessibilityRole="button"
        onPress={() => handlers.onEquip(instanceId)}
        style={[layout.button, styles.accent]}
      >
        <Text style={[layout.buttonLabel, styles.accentInk]}>
          {theme.advisory.equipCallout(bestLevel, noun)}
        </Text>
      </Pressable>
    </View>
  );
}

/** The wandering Stray Goblin. Hidden while a choice freezes the world. */
function ShinyClaim({
  state,
  handlers,
}: {
  state: GameState;
  handlers: GameHandlers;
}): React.JSX.Element | null {
  const theme = ACTIVE_THEME;
  if (state.choices.pending !== null) return null;
  const active = getActiveEvent(state);
  if (active === null) return null;
  return (
    <Pressable
      testID="shiny"
      accessibilityRole="button"
      accessibilityLabel={theme.shiny.catchAria}
      onPress={handlers.onClaim}
      style={[layout.shiny, styles.raised, styles.accentEdge]}
    >
      <AssetPlaceholder slot={shinySpriteSlot(active.kind)} size={48} />
      <Text style={[layout.shinyName, styles.text]}>{shinyName(active.kind)}</Text>
    </Pressable>
  );
}

/** The Stray Goblin's label for the reward it carries (engine-owned kind). */
function shinyName(kind: ShinyKind): string {
  const theme = ACTIVE_THEME;
  if (kind === 'frenzy') return theme.shiny.kind.frenzy;
  if (kind === 'drop') return theme.shiny.kind.drop;
  return theme.shiny.kind.cache;
}

/** The theme asset slot for a Shiny kind (each kind has its own sprite). */
function shinySpriteSlot(kind: ShinyKind): string {
  if (kind === 'frenzy') return 'shiny-frenzy';
  if (kind === 'drop') return 'shiny-drop';
  return 'shiny-cache';
}

/** Lower-case slot noun used mid-sentence in advisory copy. */
function slotNoun(slot: GearSlot): string {
  const theme = ACTIVE_THEME;
  if (slot === 'weapon') return theme.slots.noun.weapon;
  if (slot === 'necklace') return theme.slots.noun.necklace;
  return theme.slots.noun.ring;
}
