// actions.ts — explicit player commands.
//
// applyAction is total: invalid or unaffordable actions return the SAME state
// object with an empty event list. Valid actions clone, mutate the clone, and
// return it. Input state is never mutated.
//
// Achievement evaluation is applied once at this entry point (and once in
// `advance`) after any successful change, so every state transition — click,
// equip, upgrade, choice — is observed with a real before/after pair. Doing it
// here (rather than inside `killCurrentEnemy`) also covers equip, which no kill
// ever sees.

import {
  SHINY_FRENZY_DURATION_MS,
  SHINY_FRENZY_MULTIPLIER,
  upgradeCost,
  WAIT_UPGRADE_GRANT_LEVELS,
  WATCH_AD_UPGRADE_GRANT_LEVELS,
} from './balance';
import { gearDefinitionFor } from './content';
import { grantAchievements } from './achievements';
import { applyDamageToEnemy, killCurrentEnemy } from './combat';
import { grantGearDrop } from './loot';
import { cloneGameState, getActiveEvent, getChoiceGoldGrant, getEffectiveStats, getShinyCacheGold } from './state';
import type { Action, GameEvent, GearSlot, GameState } from './types';

export function applyAction(
  state: GameState,
  action: Action,
): { state: GameState; events: GameEvent[] } {
  let result: { state: GameState; events: GameEvent[] } = { state, events: [] };
  switch (action.type) {
    case 'click':
      result = applyClick(state);
      break;
    case 'equip':
      result = applyEquip(state, action.instanceId);
      break;
    case 'upgradeEquipped':
      result = applyUpgrade(state, action.slot);
      break;
    case 'resolveChoice':
      result = applyResolveChoice(state, action.choice);
      break;
    case 'claimEvent':
      result = applyClaimEvent(state);
      break;
  }

  // A same-reference result means the action was a no-op; nothing to evaluate.
  if (result.state !== state) grantAchievements(state, result.state, result.events);
  return result;
}

function applyClick(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.choices.pending) return { state, events: [] };

  const { clickDamage } = getEffectiveStats(state);
  const draft = cloneGameState(state);
  // Damage application is integer-based; crit/power multipliers can make the
  // effective click damage fractional, so floor it here.
  const events = applyDamageToEnemy(draft, Math.floor(clickDamage), 'click');
  return { state: draft, events };
}

function applyEquip(
  state: GameState,
  instanceId: string,
): { state: GameState; events: GameEvent[] } {
  const index = state.gear.bag.findIndex((item) => item.id === instanceId);
  if (index < 0) return { state, events: [] };

  const draft = cloneGameState(state);
  const [equipped] = draft.gear.bag.splice(index, 1);
  if (!equipped) return { state, events: [] };

  const slot = slotForDefinition(equipped.definitionId);
  const previous = draft.gear.equipped[slot];
  if (previous) draft.gear.bag.push(previous);
  draft.gear.equipped[slot] = equipped;

  return { state: draft, events: [{ type: 'gearEquipped', instanceId: equipped.id }] };
}

function applyUpgrade(
  state: GameState,
  slot: GearSlot,
): { state: GameState; events: GameEvent[] } {
  const equipped = state.gear.equipped[slot];
  if (!equipped) return { state, events: [] };

  const cost = upgradeCost(equipped.upgradeLevel);
  if (state.player.gold < cost) return { state, events: [] };

  const draft = cloneGameState(state);
  const item = draft.gear.equipped[slot];
  if (!item) return { state, events: [] };

  draft.player.gold -= cost;
  item.upgradeLevel += 1;

  return {
    state: draft,
    events: [
      { type: 'gearUpgraded', instanceId: item.id, upgradeLevel: item.upgradeLevel, goldCost: cost },
      { type: 'goldChanged', amount: -cost, total: draft.player.gold, reason: 'upgradeEquipped' },
    ],
  };
}

/**
 * Claim the active Golden Event. A no-op (same state reference, no events) when
 * nothing is active or the window has already elapsed — missing a Shiny costs
 * nothing. While a choice is pending the world is frozen, so a Shiny mid-window
 * is not claimable until the choice is resolved (its clock resumes with
 * `meta.totalPlayedMs`).
 *
 * A `cache` grants gold and leaves any running boost alone. A `drop` grants a
 * guaranteed gear drop at the current stage through the normal loot pipeline
 * (bag cap and first-weapon rules included). A `frenzy` sets the boost
 * multiplier (it REPLACES, never multiplies, the current multiplier) and
 * extends the window: `expiresAtMs = max(existing, now + duration)`, so a claim
 * can never shorten a boost already running.
 */
function applyClaimEvent(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.choices.pending) return { state, events: [] };

  const active = getActiveEvent(state);
  if (!active) return { state, events: [] };

  const draft = cloneGameState(state);
  draft.event.active = null;
  const events: GameEvent[] = [];

  if (active.kind === 'cache') {
    const gold = getShinyCacheGold(draft, draft.combat.stage);
    draft.player.gold += gold;
    events.push({ type: 'goldChanged', amount: gold, total: draft.player.gold, reason: 'event:cache' });
  } else if (active.kind === 'drop') {
    grantGearDrop(draft, draft.combat.stage);
  } else {
    const expiresAtMs = Math.max(
      draft.boost?.expiresAtMs ?? 0,
      draft.meta.totalPlayedMs + SHINY_FRENZY_DURATION_MS,
    );
    draft.boost = { dpsMultiplier: SHINY_FRENZY_MULTIPLIER, expiresAtMs };
    events.push({
      type: 'boostActivated',
      dpsMultiplier: SHINY_FRENZY_MULTIPLIER,
      expiresAtMs,
    });
  }

  events.push({ type: 'eventClaimed', kind: active.kind });
  return { state: draft, events };
}

function applyResolveChoice(
  state: GameState,
  choice: 'wait' | 'watchAd' | 'iap',
): { state: GameState; events: GameEvent[] } {
  const pending = state.choices.pending;
  if (!pending) return { state, events: [] };

  const draft = cloneGameState(state);
  draft.choices.pending = null;
  const events: GameEvent[] = [];

  if (choice === 'wait' || choice === 'watchAd') {
    // Bounded grant: a fixed number of upgrades from the player's current
    // upgrade level. `watchAd` grants strictly more levels than `wait`. The
    // necklace gold bonus is folded in by `getChoiceGoldGrant`.
    const currentUpgradeLevel = state.gear.equipped.weapon?.upgradeLevel ?? 0;
    const levels =
      choice === 'wait' ? WAIT_UPGRADE_GRANT_LEVELS : WATCH_AD_UPGRADE_GRANT_LEVELS;
    const gold = getChoiceGoldGrant(draft, currentUpgradeLevel, levels);
    draft.player.gold += gold;
    events.push({
      type: 'goldChanged',
      amount: gold,
      total: draft.player.gold,
      reason: `choice:${choice}`,
    });
  } else {
    // iap: defeat the current enemy outright. Kill resolution runs its own
    // stage-entry checks, which may raise a fresh choice for the next stage.
    draft.combat.enemyHp = 0;
    events.push(...killCurrentEnemy(draft));
  }

  events.push({ type: 'choiceResolved', choice });
  return { state: draft, events };
}

function slotForDefinition(definitionId: string): GearSlot {
  const definition = gearDefinitionFor(definitionId);
  return definition ? definition.slot : 'weapon';
}
