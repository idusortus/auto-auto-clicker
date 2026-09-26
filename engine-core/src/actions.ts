// actions.ts — explicit player commands.
//
// applyAction is total: invalid or unaffordable actions return the SAME state
// object with an empty event list. Valid actions clone, mutate the clone, and
// return it. Input state is never mutated.

import { computeGearStats, goldReward, upgradeCost } from './balance';
import { gearDefinitionFor, WEAPON_DEFINITION } from './content';
import { applyDamageToEnemy, killCurrentEnemy } from './combat';
import { cloneGameState, getEffectiveStats } from './state';
import type { Action, GameEvent, GearSlot, GameState } from './types';

export function applyAction(
  state: GameState,
  action: Action,
): { state: GameState; events: GameEvent[] } {
  switch (action.type) {
    case 'click':
      return applyClick(state);
    case 'equip':
      return applyEquip(state, action.instanceId);
    case 'upgradeEquipped':
      return applyUpgrade(state, action.slot);
    case 'resolveChoice':
      return applyResolveChoice(state, action.choice);
  }
}

function applyClick(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.choices.pending) return { state, events: [] };

  const { clickDamage } = getEffectiveStats(state);
  const draft = cloneGameState(state);
  const events = applyDamageToEnemy(draft, clickDamage, 'click');
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

  const definition = gearDefinitionFor(item.definitionId) ?? WEAPON_DEFINITION;
  draft.player.gold -= cost;
  item.upgradeLevel += 1;
  const stats = computeGearStats(definition, item.itemLevel, item.upgradeLevel);
  item.dps = stats.dps;
  item.clickDamage = stats.clickDamage;

  return {
    state: draft,
    events: [
      { type: 'gearUpgraded', instanceId: item.id, upgradeLevel: item.upgradeLevel, goldCost: cost },
      { type: 'goldChanged', amount: -cost, total: draft.player.gold, reason: 'upgradeEquipped' },
    ],
  };
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
    const seconds = choice === 'wait' ? 60 : 300;
    const gold = Math.floor((goldReward(pending.stage) * seconds) / 8);
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
