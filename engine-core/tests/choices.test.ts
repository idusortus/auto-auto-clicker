import { describe, expect, it } from 'vitest';
import { advance, applyAction } from '../src/index';
import { goldReward } from '../src/balance';
import { makeGear, makeState } from './helpers';
import type { GameState } from '../src/types';

/** Kill stage 9 to enter the stage-10 boss and raise a choice. */
function enterStageTen(equippedWeapon?: ReturnType<typeof makeGear>): GameState {
  const start = makeState({
    stage: 9,
    enemyHp: 1,
    enemyMaxHp: 1,
    ...(equippedWeapon ? { equippedWeapon } : {}),
  });
  return applyAction(start, { type: 'click' }).state;
}

describe('stage-entry pacing checks', () => {
  it('entering a boss stage over the boss timer emits bossCheckFailed and sets pending', () => {
    const state = enterStageTen(makeGear(5));

    expect(state.combat.stage).toBe(10);
    const bossEvent = state.choices.pending;
    expect(bossEvent?.kind).toBe('boss-check');
    expect(bossEvent?.stage).toBe(10);
  });

  it('projects a stage-10 boss kill between the boss timer and the hard wall when geared', () => {
    const start = makeState({
      stage: 9,
      enemyHp: 1,
      enemyMaxHp: 1,
      equippedWeapon: makeGear(5),
    });
    const { events } = applyAction(start, { type: 'click' });
    const bossEvent = events.find((event) => event.type === 'bossCheckFailed');

    expect(bossEvent).toBeDefined();
    if (bossEvent?.type === 'bossCheckFailed') {
      expect(bossEvent.stage).toBe(10);
      expect(bossEvent.projectedKillMs).toBeGreaterThan(60_000);
      expect(bossEvent.projectedKillMs).toBeLessThanOrEqual(600_000);
    }
    expect(events.some((event) => event.type === 'progressionWall')).toBe(false);
  });

  it('emits progressionWall when the projected kill exceeds the hard wall, taking precedence', () => {
    const start = makeState({ stage: 9, enemyHp: 1, enemyMaxHp: 1 });
    const { state, events } = applyAction(start, { type: 'click' });

    expect(state.combat.stage).toBe(10);
    expect(state.choices.pending?.kind).toBe('progression-wall');

    const wall = events.find((event) => event.type === 'progressionWall');
    expect(wall).toBeDefined();
    if (wall?.type === 'progressionWall') {
      expect(wall.projectedKillMs).toBeGreaterThan(600_000);
    }
    expect(events.some((event) => event.type === 'bossCheckFailed')).toBe(false);
  });

  it('raises a progression wall on a non-boss stage too', () => {
    // Stage 19 is not a boss, but the unarmed projection is far past the wall.
    const start = makeState({ stage: 18, enemyHp: 1, enemyMaxHp: 1 });
    const { state } = applyAction(start, { type: 'click' });
    expect(state.combat.stage).toBe(19);
    expect(state.choices.pending?.kind).toBe('progression-wall');
  });
});

describe('pending choice freezes the world', () => {
  it('advance does not change enemyHp or totalPlayedMs while pending', () => {
    const entered = enterStageTen();
    expect(entered.choices.pending).not.toBeNull();

    const { state, events } = advance(entered, 5000);
    expect(state).toBe(entered);
    expect(state.combat.enemyHp).toBe(entered.combat.enemyHp);
    expect(state.meta.totalPlayedMs).toBe(entered.meta.totalPlayedMs);
    expect(events).toEqual([]);
  });

  it('click is a no-op while pending', () => {
    const entered = enterStageTen();
    const result = applyAction(entered, { type: 'click' });
    expect(result.state).toBe(entered);
    expect(result.events).toEqual([]);
  });
});

describe('resolveChoice', () => {
  it("'wait' clears pending, grants 60s of gold, and emits choiceResolved", () => {
    const entered = enterStageTen();
    const pending = entered.choices.pending;
    expect(pending?.kind).toBe('progression-wall');
    const stage = pending?.stage ?? 0;
    const expectedGold = Math.floor((goldReward(stage) * 60) / 8);

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

  it("'watchAd' grants the larger ad reward", () => {
    const entered = enterStageTen();
    const stage = entered.choices.pending?.stage ?? 0;
    const expectedGold = Math.floor((goldReward(stage) * 300) / 8);

    const { state, events } = applyAction(entered, { type: 'resolveChoice', choice: 'watchAd' });

    expect(state.choices.pending).toBeNull();
    expect(state.player.gold).toBe(entered.player.gold + expectedGold);
    expect(events).toContainEqual({ type: 'choiceResolved', choice: 'watchAd' });
  });

  it("'iap' defeats the current enemy and advances the stage", () => {
    const entered = enterStageTen();
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
