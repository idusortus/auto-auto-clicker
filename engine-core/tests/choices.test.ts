import { describe, expect, it } from 'vitest';
import { advance, applyAction } from '../src/index';
import {
  ACTIVE_CLICKS_PER_SECOND,
  BOSS_TIMER_MS,
  HARD_WALL_PROJECTED_KILL_MS,
  enemyMaxHp,
  goldReward,
  isBoss,
  upgradeCost,
  WAIT_UPGRADE_GRANT_LEVELS,
  WATCH_AD_UPGRADE_GRANT_LEVELS,
} from '../src/balance';
import { makeGear, makeState } from './helpers';
import type { GameEvent, GameState } from '../src/types';

const SYNTH_CLICK_DAMAGE = 1;

/**
 * Enter `stage` by killing the previous enemy with a synthesized DPS chosen so
 * the live projection equals `projectedMs`. This exercises the stage-entry
 * threshold rules without pinning any live balance value.
 */
function enterStage(stage: number, projectedMs: number): { state: GameState; events: GameEvent[] } {
  const enemyHp = enemyMaxHp(stage);
  const totalActiveDps = enemyHp / (projectedMs / 1000);
  const baseAutoDps = Math.max(0, totalActiveDps - ACTIVE_CLICKS_PER_SECOND * SYNTH_CLICK_DAMAGE);
  const start = makeState({
    stage: stage - 1,
    enemyHp: 1,
    enemyMaxHp: 1,
    baseAutoDps,
    baseClickDamage: SYNTH_CLICK_DAMAGE,
  });
  return applyAction(start, { type: 'click' });
}

/** A state with a live pending choice and a weapon at a known upgrade level. */
function pendingWithUpgrade(
  upgradeLevel: number,
  stage = 10,
  kind: 'boss-check' | 'progression-wall' = 'boss-check',
): GameState {
  return makeState({
    stage,
    enemyHp: enemyMaxHp(stage),
    enemyMaxHp: enemyMaxHp(stage),
    equippedWeapon: makeGear(1, upgradeLevel),
    pending: { kind, stage, options: ['wait', 'watchAd', 'iap'] },
  });
}

/** Gold for exactly `levels` upgrades starting at `currentUpgradeLevel`. */
function grantFor(currentUpgradeLevel: number, levels: number): number {
  let total = 0;
  for (let i = 0; i < levels; i += 1) total += upgradeCost(currentUpgradeLevel + i);
  return total;
}

describe('stage-entry pacing checks', () => {
  it('entering a boss stage over the boss timer emits bossCheckFailed and sets pending', () => {
    const { state, events } = enterStage(10, 300_000); // 5 min: over timer, under wall

    expect(isBoss(10)).toBe(true);
    expect(state.combat.stage).toBe(10);

    const bossEvent = events.find((event) => event.type === 'bossCheckFailed');
    expect(bossEvent).toBeDefined();
    if (bossEvent?.type === 'bossCheckFailed') {
      expect(bossEvent.stage).toBe(10);
      expect(bossEvent.projectedKillMs).toBeGreaterThan(BOSS_TIMER_MS);
      expect(bossEvent.projectedKillMs).toBeLessThanOrEqual(HARD_WALL_PROJECTED_KILL_MS);
    }
    expect(state.choices.pending?.kind).toBe('boss-check');
    expect(state.choices.pending?.stage).toBe(10);
    expect(events.some((event) => event.type === 'progressionWall')).toBe(false);
  });

  it('emits progressionWall when the projected kill exceeds the hard wall, taking precedence', () => {
    const { state, events } = enterStage(10, 1_200_000); // 20 min: over the wall

    expect(state.combat.stage).toBe(10);
    expect(state.choices.pending?.kind).toBe('progression-wall');

    const wall = events.find((event) => event.type === 'progressionWall');
    expect(wall).toBeDefined();
    if (wall?.type === 'progressionWall') {
      expect(wall.projectedKillMs).toBeGreaterThan(HARD_WALL_PROJECTED_KILL_MS);
    }
    expect(events.some((event) => event.type === 'bossCheckFailed')).toBe(false);
  });

  it('raises a progression wall on a non-boss stage too', () => {
    const { state } = enterStage(19, 1_200_000);

    expect(isBoss(19)).toBe(false);
    expect(state.combat.stage).toBe(19);
    expect(state.choices.pending?.kind).toBe('progression-wall');
  });
});

describe('pending choice freezes the world', () => {
  it('advance does not change enemyHp or totalPlayedMs while pending', () => {
    const entered = pendingWithUpgrade(0);
    expect(entered.choices.pending).not.toBeNull();

    const { state, events } = advance(entered, 5000);
    expect(state).toBe(entered);
    expect(state.combat.enemyHp).toBe(entered.combat.enemyHp);
    expect(state.meta.totalPlayedMs).toBe(entered.meta.totalPlayedMs);
    expect(events).toEqual([]);
  });

  it('click is a no-op while pending', () => {
    const entered = pendingWithUpgrade(0);
    const result = applyAction(entered, { type: 'click' });
    expect(result.state).toBe(entered);
    expect(result.events).toEqual([]);
  });
});

describe('resolveChoice', () => {
  it("'wait' clears pending and grants exactly the bounded wait levels", () => {
    const entered = pendingWithUpgrade(3);
    const expectedGold = grantFor(3, WAIT_UPGRADE_GRANT_LEVELS);
    expect(expectedGold).toBeGreaterThan(0);

    const { state, events } = applyAction(entered, { type: 'resolveChoice', choice: 'wait' });

    expect(state.choices.pending).toBeNull();
    expect(state.player.gold).toBe(entered.player.gold + expectedGold);
    expect(events).toContainEqual({ type: 'choiceResolved', choice: 'wait' });
    expect(events).toContainEqual({
      type: 'goldChanged',
      amount: expectedGold,
      total: state.player.gold,
      reason: 'choice:wait',
    });
  });

  it("'watchAd' grants strictly more than 'wait'", () => {
    const entered = pendingWithUpgrade(3);
    const waitGold = grantFor(3, WAIT_UPGRADE_GRANT_LEVELS);
    const adGold = grantFor(3, WATCH_AD_UPGRADE_GRANT_LEVELS);
    expect(adGold).toBeGreaterThan(waitGold);

    const { state, events } = applyAction(entered, { type: 'resolveChoice', choice: 'watchAd' });

    expect(state.choices.pending).toBeNull();
    expect(state.player.gold).toBe(entered.player.gold + adGold);
    expect(events).toContainEqual({ type: 'choiceResolved', choice: 'watchAd' });
  });

  it('bounds the free grant by upgrade level, not by stage', () => {
    const low = pendingWithUpgrade(3, 10);
    const high = pendingWithUpgrade(3, 200);

    const lowResolved = applyAction(low, { type: 'resolveChoice', choice: 'wait' }).state;
    const highResolved = applyAction(high, { type: 'resolveChoice', choice: 'wait' }).state;

    expect(lowResolved.player.gold - low.player.gold).toBe(grantFor(3, WAIT_UPGRADE_GRANT_LEVELS));
    expect(highResolved.player.gold - high.player.gold).toBe(lowResolved.player.gold - low.player.gold);
  });

  it("'iap' defeats the current enemy and advances the stage", () => {
    const entered = pendingWithUpgrade(0, 10);
    expect(entered.combat.stage).toBe(10);
    expect(entered.choices.pending?.stage).toBe(10);

    const { state, events } = applyAction(entered, { type: 'resolveChoice', choice: 'iap' });

    expect(state.combat.stage).toBe(11);
    expect(state.player.gold).toBe(entered.player.gold + goldReward(10));
    expect(events.some((event) => event.type === 'enemyKilled')).toBe(true);
    expect(events).toContainEqual({ type: 'choiceResolved', choice: 'iap' });
    expect(state.choices.pending).toBeNull();
  });

  it('is a no-op when nothing is pending', () => {
    const start = makeState({});
    const result = applyAction(start, { type: 'resolveChoice', choice: 'wait' });
    expect(result.state).toBe(start);
    expect(result.events).toEqual([]);
  });
});
