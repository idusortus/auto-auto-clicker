// surfaces.ts — the RN port of `/web`'s presentation-only surfaces that are NOT
// driven by the sprite-cue model: the queued achievement splash, the milestone
// step-change flourish, and the enemy taunt toast.
//
// All three are DIFFS across renders (not event streams), seeded on the first
// render so a save restored mid-progress — including achievements and milestones
// unlocked during offline replay — does not replay a flourish at boot. The
// milestone counts and unlocked-id set are the same ones `/web` diffs.
//
// The hooks own only PRESENTATION state: a queue, a cursor, and a timer seam.
// They never mutate engine state and never read gameplay numbers beyond the
// engine getters (`getSlotMilestones`) and the supplied `state`.

import { useEffect, useRef, useState } from 'react';

import {
  ACHIEVEMENTS,
  ACTIVE_THEME,
  getActiveBoost,
  getActiveEvent,
  getSlotMilestones,
} from '@auto-auto-clicker/engine-core';
import type {
  AchievementDefinition,
  EnemyTauntEvent,
  GameEvent,
  GameState,
  GearSlot,
  MilestoneInfo,
  ShinyKind,
} from '@auto-auto-clicker/engine-core';

import { formatMultiplier } from './format';
import { EQUIP_SLOTS } from './types';

/** Presentation-only timings, display-only (never read by the engine). */
export const SPLASH_DURATION_MS = 2600;
export const ENEMY_TAUNT_MESSAGE_MS = 2600;
export const MILESTONE_MESSAGE_MS = 2400;
export const SHINY_MESSAGE_MS = 2200;

/** A timer seam, so tests can drive dismissals deterministically. */
export interface SurfaceScheduler {
  setTimeout(handler: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultScheduler: SurfaceScheduler = {
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** The achievement splash surface: the current definition plus its queue length. */
export interface AchievementSplash {
  /** The definition currently on screen, or null when nothing is showing. */
  definition: AchievementDefinition | null;
  /** Dismiss the current splash early (advances the queue). */
  dismiss(): void;
}

/**
 * Diff UNLOCKED achievement ids across renders and queue a splash for each new
 * one. The first render only seeds the seen set (restored unlocks do not replay).
 * A burst queues every definition and shows them one at a time; each auto-dismisses
 * after `SPLASH_DURATION_MS`, and a manual dismiss advances immediately.
 */
export function useAchievementSplash(
  state: GameState | null,
  scheduler: SurfaceScheduler = defaultScheduler,
): AchievementSplash {
  const byId = useRef(new Map(ACHIEVEMENTS.map((definition) => [definition.id, definition])));
  const seenRef = useRef<Set<string> | null>(null);
  const queueRef = useRef<AchievementDefinition[]>([]);
  const timerRef = useRef<unknown>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (state === null) return;
    const seen = seenRef.current;
    if (seen === null) {
      // Seed only: restored / offline-replayed unlocks never splash at boot.
      seenRef.current = new Set(state.meta.achievements);
      return;
    }
    let queued = false;
    for (const id of state.meta.achievements) {
      if (seen.has(id)) continue;
      seen.add(id);
      const definition = byId.current.get(id);
      if (definition !== undefined) {
        queueRef.current.push(definition);
        queued = true;
      }
    }
    if (queued) setVersion((v) => v + 1);
  }, [state]);

  // ONE auto-dismiss for the current splash; re-arms whenever the shown one
  // changes (including on a manual dismiss, which advances the queue).
  const shown = queueRef.current[0] ?? null;
  useEffect(() => {
    if (shown === null) return;
    if (timerRef.current !== null) scheduler.clearTimeout(timerRef.current);
    timerRef.current = scheduler.setTimeout(() => {
      timerRef.current = null;
      queueRef.current.shift();
      setVersion((v) => v + 1);
    }, SPLASH_DURATION_MS);
    return () => {
      if (timerRef.current !== null) {
        scheduler.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, version, scheduler]);

  const dismiss = (): void => {
    if (queueRef.current.length === 0) return;
    if (timerRef.current !== null) {
      scheduler.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    queueRef.current.shift();
    setVersion((v) => v + 1);
  };

  return { definition: shown, dismiss };
}

/** The milestone flourish surface: the latest crossed milestone's copy. */
export interface MilestoneFlourish {
  /** The flourish message to show, or null. */
  text: string | null;
}

/**
 * Diff each equipped slot's achieved-milestone count across renders. The first
 * render only seeds the counts; a later increase shows the theme's flourish copy
 * for the highest crossed slot. Auto-dismisses after `MILESTONE_MESSAGE_MS`.
 */
export function useMilestoneFlourish(
  state: GameState | null,
  scheduler: SurfaceScheduler = defaultScheduler,
): MilestoneFlourish {
  const seenRef = useRef<Record<GearSlot, number> | null>(null);
  const [text, setText] = useState<string | null>(null);
  const timerRef = useRef<unknown>(null);

  useEffect(() => {
    if (state === null) return;
    const milestones = getSlotMilestones(state);
    const counts = {} as Record<GearSlot, number>;
    for (const slot of EQUIP_SLOTS) counts[slot] = milestones[slot]?.achievedCount ?? 0;

    const previous = seenRef.current;
    seenRef.current = counts;
    if (previous === null) return;

    let reached: { slot: GearSlot; info: MilestoneInfo } | null = null;
    for (const slot of EQUIP_SLOTS) {
      if (counts[slot] <= previous[slot]) continue;
      const info = milestones[slot];
      if (info !== null) reached = { slot, info };
    }
    if (reached === null) return;

    setText(
      ACTIVE_THEME.slots.milestone.flourish(
        upgradeSlotLabel(reached.slot),
        String(reached.info.achievedCount),
        reached.info.bonusDescription,
      ),
    );
    if (timerRef.current !== null) scheduler.clearTimeout(timerRef.current);
    timerRef.current = scheduler.setTimeout(() => {
      timerRef.current = null;
      setText(null);
    }, MILESTONE_MESSAGE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, scheduler]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) scheduler.clearTimeout(timerRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { text };
}

/** The enemy taunt toast surface: the latest taunt's theme-resolved wording. */
export interface EnemyTaunt {
  /** The catchphrase to show, or null. */
  text: string | null;
}

/**
 * Track the latest `enemyTaunt` event in a frame's batch and resolve its wording
 * from the theme's roster entry (the engine emits only id/kind/phraseIndex).
 * Auto-dismisses after `ENEMY_TAUNT_MESSAGE_MS`. `phraseIndex` is reduced modulo
 * the entry's array length. Shows regardless of reduced motion — it is text.
 */
export function useEnemyTaunt(
  events: readonly GameEvent[],
  scheduler: SurfaceScheduler = defaultScheduler,
): EnemyTaunt {
  const [toast, setToast] = useState<{ text: string; seq: number } | null>(null);
  const timerRef = useRef<unknown>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    let latest: EnemyTauntEvent | null = null;
    for (const event of events) {
      if (event.type === 'enemyTaunt') latest = event;
    }
    if (latest === null) return;

    const phrases = ACTIVE_THEME.enemy.roster[latest.enemyId]?.catchphrases[latest.kind] ?? [];
    if (phrases.length === 0) return;
    const phrase = phrases[latest.phraseIndex % phrases.length] ?? '';
    seqRef.current += 1;
    setToast({ text: phrase, seq: seqRef.current });

    if (timerRef.current !== null) scheduler.clearTimeout(timerRef.current);
    timerRef.current = scheduler.setTimeout(() => {
      timerRef.current = null;
      setToast(null);
    }, ENEMY_TAUNT_MESSAGE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, scheduler]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) scheduler.clearTimeout(timerRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { text: toast?.text ?? null };
}

/** The Shiny escape/claim message surface. */
export interface ShinyMessage {
  /** The message text, or null. */
  text: string | null;
  /** Whether the message reports a claim (flourish) rather than an escape. */
  claimed: boolean;
}

/**
 * Diff the active Shiny across renders: when one disappears, a pending claim is a
 * grab (flourish, with the kind-specific reward wording) and anything else is an
 * escape (toast). The message auto-dismisses. Text only — it renders under
 * reduced motion; the caller owns the pop.
 */
export function useShinyMessage(
  state: GameState | null,
  consumeClaim: () => boolean,
  scheduler: SurfaceScheduler = defaultScheduler,
): ShinyMessage {
  const lastRef = useRef<{ id: string; kind: ShinyKind } | null>(null);
  const [message, setMessage] = useState<ShinyMessage | null>(null);
  const timerRef = useRef<unknown>(null);

  useEffect(() => {
    if (state === null) return;
    const active = getActiveEvent(state);

    if (active !== null) {
      lastRef.current = { id: `${active.kind}:${active.spawnedAtMs}`, kind: active.kind };
      return;
    }
    const last = lastRef.current;
    if (last === null) return;
    lastRef.current = null;

    let text: string;
    let claimed: boolean;
    if (consumeClaim()) {
      const boost = getActiveBoost(state);
      if (last.kind === 'frenzy' && boost !== null) {
        text = ACTIVE_THEME.shiny.frenzyClaim(formatMultiplier(boost.dpsMultiplier));
      } else if (last.kind === 'drop') {
        text = ACTIVE_THEME.shiny.dropClaim;
      } else {
        text = ACTIVE_THEME.shiny.claimed;
      }
      claimed = true;
    } else {
      text = ACTIVE_THEME.shiny.escape;
      claimed = false;
    }
    setMessage({ text, claimed });
    if (timerRef.current !== null) scheduler.clearTimeout(timerRef.current);
    timerRef.current = scheduler.setTimeout(() => {
      timerRef.current = null;
      setMessage(null);
    }, SHINY_MESSAGE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, scheduler]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) scheduler.clearTimeout(timerRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return message ?? { text: null, claimed: false };
}

/** Short slot name used in milestone copy (from the active theme). */
function upgradeSlotLabel(slot: GearSlot): string {
  return ACTIVE_THEME.slots.display[slot];
}
