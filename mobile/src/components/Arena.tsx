// Arena.tsx — the tappable enemy, its HP bar, the boost pill, the stall-advisory
// callout, and the Golden-Event / Stray claim control.
//
// Pure projection of `GameState` + engine getters. All copy comes from the
// active theme. The only action the advisory ever offers is the EXISTING
// `equip` dispatch — nothing is applied automatically.

import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

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
  GameEvent,
  GameState,
  GearSlot,
  ShinyKind,
  StallAdvisory,
} from '@auto-auto-clicker/engine-core';

import { useAnimationCues } from '../animation/useAnimationCues';
import type { AnimationCues } from '../animation/useAnimationCues';
import { useDrift, useEntrance, useHpFillWidth, usePulse } from '../animation/motion';
import { styles } from '../theme';
import { ThemeImage } from './ThemeImage';
import { Toast } from './Toast';
import { formatInt, formatMultiplier, formatStallDuration } from './format';
import { layout } from './layout';
import { useShinyMessage } from './surfaces';
import type { GameHandlers } from './types';

const FULL_PERCENT = 100;
const MS_PER_SECOND = 1000;

/**
 * Stable empty batch for the `events` default. A fresh `[]` literal would change
 * identity every render, and under reduced motion the cue hook would then clear +
 * re-render on each pass (a render loop).
 */
const NO_EVENTS: readonly GameEvent[] = [];

export interface ArenaProps {
  state: GameState;
  handlers: GameHandlers;
  /** Sim-time at which the current stage began, or null when unknown. */
  stageBeganAtMs: number | null;
  /** The host's event batch for the current frame; drives transient sprite cues. */
  events?: readonly GameEvent[];
}

export function Arena({
  state,
  handlers,
  stageBeganAtMs,
  events = NO_EVENTS,
}: ArenaProps): React.JSX.Element {
  const theme = ACTIVE_THEME;
  const boss = isBoss(state.combat.stage);
  const enemy = enemyForStage(state.combat.stage);
  const display = theme.enemy.roster[enemy.id];
  if (display === undefined) {
    throw new Error(`[aac] theme "${theme.name}" has no enemy roster entry for id "${enemy.id}"`);
  }

  // Transient sprite frames are theme-declared cues keyed off the frame's events.
  // At most one frame per actor is live; when none is, the idle slot shows. There
  // is NO player sprite site in this layout, so only the enemy and Shiny targets
  // are projected here.
  const cues = useAnimationCues(events, state.combat.stage);

  // A claim is the only way the player dismisses a Shiny, so the wrapper marks
  // it as ours BEFORE dispatching; the message diff reads the flag on the render
  // where the Shiny actually disappears and can then tell a grab from an escape.
  const pendingClaimRef = useRef(false);
  const shinyMessage = useShinyMessage(state, () => {
    const wasClaim = pendingClaimRef.current;
    pendingClaimRef.current = false;
    return wasClaim;
  });
  const claimShiny = (): void => {
    pendingClaimRef.current = true;
    handlers.onClaim();
  };

  const maxHp = getEnemyMaxHp(state);
  const hp = Math.min(state.combat.enemyHp, maxHp);
  const hpPercent = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const enemyIdleSlot = boss ? 'boss-grunt-idle' : 'enemy-grunt-idle';
  const enemySlot = cues.slotFor('enemy', enemyIdleSlot);

  return (
    <View style={layout.stage}>
      <BoostPill state={state} reducedMotion={cues.reducedMotion} />
      <SpawnPopup cues={cues} />
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
        <ThemeImage slot={enemySlot} />
        <Text testID="enemy-name" style={[layout.enemyName, styles.text]}>
          {display.name}
        </Text>
        <HpBar percent={hpPercent} reducedMotion={cues.reducedMotion} />
        <Text testID="enemy-hp" style={[layout.enemyHpText, styles.textDim]}>
          {theme.enemy.hp(formatInt(hp), formatInt(maxHp))}
        </Text>
      </Pressable>

      <ShinyClaim state={state} onClaim={claimShiny} cues={cues} />

      {shinyMessage.text !== null ? (
        <Toast
          testID="shiny-message"
          text={shinyMessage.text}
          tone={shinyMessage.claimed ? styles.accent : styles.panel}
          textStyle={shinyMessage.claimed ? styles.accentInk : styles.textDim}
          reducedMotion={cues.reducedMotion}
          emphasis={shinyMessage.claimed}
        />
      ) : null}

      <Text style={[layout.hint, styles.textDim]}>{theme.ui.tapHint}</Text>
    </View>
  );
}

/** The HP track with a fill that tweens toward the target percentage. */
function HpBar({
  percent,
  reducedMotion,
}: {
  percent: number;
  reducedMotion: boolean;
}): React.JSX.Element {
  const fillWidth = useHpFillWidth(percent * FULL_PERCENT, reducedMotion);
  return (
    <View style={[layout.hpBar, styles.hpTrack, styles.edge]}>
      <Animated.View
        testID="hp-fill"
        style={[layout.hpFill, percent >= 0.5 ? styles.hpHi : styles.hpLo, fillWidth]}
      />
    </View>
  );
}

/** The active frenzy pill: label and countdown both from engine values. */
function BoostPill({
  state,
  reducedMotion,
}: {
  state: GameState;
  reducedMotion: boolean;
}): React.JSX.Element | null {
  const theme = ACTIVE_THEME;
  const pulse = usePulse(reducedMotion);
  const boost = getActiveBoost(state);
  if (boost === null) return null;
  const remainingMs = Math.max(0, boost.expiresAtMs - state.meta.totalPlayedMs);
  return (
    <Animated.View
      testID="boost-pill"
      style={[layout.boostPill, styles.accent, styles.accentEdge, pulse]}
    >
      <Text style={[layout.boostLabel, styles.accentInk]}>
        {theme.ui.boost.pill(formatMultiplier(boost.dpsMultiplier))}
      </Text>
      <Text style={[layout.boostTimer, styles.accentInk]}>
        {theme.ui.boost.timer(String(Math.ceil(remainingMs / MS_PER_SECOND)))}
      </Text>
    </Animated.View>
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
  onClaim,
  cues,
}: {
  state: GameState;
  onClaim: () => void;
  cues: AnimationCues;
}): React.JSX.Element | null {
  const theme = ACTIVE_THEME;
  const drift = useDrift(cues.reducedMotion);
  const pulse = usePulse(cues.reducedMotion);
  if (state.choices.pending !== null) return null;
  const active = getActiveEvent(state);
  if (active === null) return null;
  const shinySlot = cues.slotFor('shiny', shinySpriteSlot(active.kind));
  return (
    <Animated.View style={[drift, pulse]}>
      <Pressable
        testID="shiny"
        accessibilityRole="button"
        accessibilityLabel={theme.shiny.catchAria}
        onPress={onClaim}
        style={[layout.shiny, styles.raised, styles.accentEdge]}
      >
        <ThemeImage slot={shinySlot} />
        <Text style={[layout.shinyName, styles.text]}>{shinyName(active.kind)}</Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The GLOBAL transient popup (the `stageEntered` cue: a new enemy spawned).
 * Shown while a `global` cue frame is live and hidden on expiry. It is a pure
 * announcement — non-interactive — positioned in the stage's top corner so it
 * never covers the enemy button or the Shiny.
 */
function SpawnPopup({ cues }: { cues: AnimationCues }): React.JSX.Element | null {
  const entrance = useEntrance(cues.reducedMotion);
  const slot = cues.slotFor('global', '');
  if (slot === '') return null;
  return (
    <Animated.View testID="spawn-popup" style={[layout.spawnPopup, entrance]}>
      <ThemeImage slot={slot} />
    </Animated.View>
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
