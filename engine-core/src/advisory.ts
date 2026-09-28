// advisory.ts — player-facing upgrade/stall guidance. Pure reads, no state
// mutation, no persistence.
//
// WHY THIS EXISTS: a player can equip a weak item while a strictly better one
// sits in the bag and then stall forever — the stage projection stays
// finite-but-slow, so neither the boss check nor the progression wall ever
// fires. This module SURFACES the facts (there is a better item for this slot;
// you have made no stage progress for this long) so the PLAYER can act. It
// NEVER equips anything, never forces a rescue, and never changes state: the
// only way the equipped item changes is the player dispatching the existing
// `{ type: 'equip', instanceId }` action.
//
// It ranks candidates with the SAME engine metric the sim's greedy economy
// policy uses (`powerScore` / `scoreWithEquip` in gear-stats.ts), so the
// advisory can never recommend a downgrade relative to the policy's own
// ranking. Because that metric drives all four slots, non-weapon upgrades
// (rings improve crit, the necklace improves gold/power) are handled correctly
// rather than through a DPS-only comparison.

import { GEAR_SLOTS, STALL_HINT_MS, STALL_NAG_MS } from './balance';
import { gearDefinitionFor } from './content';
import { powerScore, scoreWithEquip } from './gear-stats';
import type { GameState, GearSlot } from './types';

/** How loudly the facts are stated. `none` → `hint` → `nag`. */
export type AdvisorySeverity = 'none' | 'hint' | 'nag';

/** For one equipped slot: is there a strictly better bag item for that slot? */
export interface SlotUpgradeAdvisory {
  slot: GearSlot;
  /** True when a bag item for `slot` scores strictly higher than the state now. */
  hasUpgrade: boolean;
  /** Power score of the state as-is (the currently equipped item, if any). */
  currentPower: number;
  /** Best power score available from a bag item in `slot` (current score if none). */
  bestPower: number;
  /** `bestPower / currentPower`, or 0 when `currentPower` is not positive. */
  ratio: number;
  /** Id of the best bag item for `slot`, or null when there is none. */
  bestInstanceId: string | null;
}

/** The soft-lock picture: how long stalled, and the best available upgrade(s). */
export interface StallAdvisory {
  severity: AdvisorySeverity;
  /** True when the stall window (at least `STALL_HINT_MS`) has elapsed. */
  stalled: boolean;
  /** Milliseconds since the current stage began (0 when no anchor is known). */
  stalledMs: number;
  stage: number;
  /** The single best available upgrade (highest ratio), or null. */
  best: SlotUpgradeAdvisory | null;
  /** Every slot with an upgrade available, in `GEAR_SLOTS` order. */
  upgrades: SlotUpgradeAdvisory[];
}

/** `definitionId` -> slot, so a bag item is routed without balance math. */
function slotForDefinition(definitionId: string): GearSlot {
  return gearDefinitionFor(definitionId)?.slot ?? 'weapon';
}

/**
 * Compare the state against the best BAG item for `slot`, ranked by the shared
 * `powerScore` metric. `hasUpgrade` is strictly `bestPower > currentPower`, so
 * an item that is equal or worse is never flagged (never a downgrade). An empty
 * slot with a usable bag item IS an upgrade (the special case of a bare slot),
 * because the same comparison simply has no equipped item on the left.
 */
export function getSlotUpgradeAdvisory(state: GameState, slot: GearSlot): SlotUpgradeAdvisory {
  const currentPower = powerScore(state);
  let bestPower = currentPower;
  let bestInstanceId: string | null = null;

  for (const item of state.gear.bag) {
    if (slotForDefinition(item.definitionId) !== slot) continue;
    const score = scoreWithEquip(state, slot, item);
    if (score > bestPower) {
      bestPower = score;
      bestInstanceId = item.id;
    }
  }

  const hasUpgrade = bestInstanceId !== null && bestPower > currentPower;
  const ratio =
    Number.isFinite(currentPower) && currentPower > 0 && Number.isFinite(bestPower)
      ? bestPower / currentPower
      : 0;

  return { slot, hasUpgrade, currentPower, bestPower, ratio, bestInstanceId };
}

/**
 * The stall advisory. BOTH conditions are required for a non-`none` severity:
 *
 *  1. NO stage progress for a meaningful window, and
 *  2. a strictly better item is available for some slot.
 *
 * so a legitimately-walled player (already wearing their best gear) is never
 * nagged. `stageBeganAtMs` is the SIM-TIME (`meta.totalPlayedMs`) at which the
 * current stage began. It MUST be supplied by the host, which watches
 * `combat.stage` across renders and records the anchor in memory — the engine
 * deliberately persists NO new field (the save schema stays v4) and cannot
 * reconstruct the anchor from state alone. When no finite anchor is supplied the
 * elapsed stall is 0 and the severity is `none` (the honest "unknown" answer).
 *
 * LIMITATION: the window measures time spent on the CURRENT stage, not "slow
 * but non-zero" progress within it. A player who is genuinely inching forward on
 * one stage past the window while also holding a better bag item will still be
 * prompted — by design, because that is exactly the soft-lock shape (finite but
 * unusably slow), and the prompt only ever SUGGESTS.
 */
export function getStallAdvisory(state: GameState, stageBeganAtMs?: number): StallAdvisory {
  const stage = state.combat.stage;

  const upgrades: SlotUpgradeAdvisory[] = [];
  for (const slot of GEAR_SLOTS) {
    const advisory = getSlotUpgradeAdvisory(state, slot);
    if (advisory.hasUpgrade) upgrades.push(advisory);
  }

  let best: SlotUpgradeAdvisory | null = null;
  for (const advisory of upgrades) {
    if (best === null || advisory.ratio > best.ratio) best = advisory;
  }

  const hasAnchor = typeof stageBeganAtMs === 'number' && Number.isFinite(stageBeganAtMs);
  const stalledMs = hasAnchor
    ? Math.max(0, state.meta.totalPlayedMs - (stageBeganAtMs as number))
    : 0;
  const stalled = stalledMs >= STALL_HINT_MS;

  let severity: AdvisorySeverity = 'none';
  if (best !== null) {
    if (stalledMs >= STALL_NAG_MS) severity = 'nag';
    else if (stalledMs >= STALL_HINT_MS) severity = 'hint';
  }

  return { severity, stalled, stalledMs, stage, best, upgrades };
}
