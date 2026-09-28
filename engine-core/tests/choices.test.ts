import { describe, expect, it } from 'vitest';
import { advance, applyAction, getEffectiveStats, getProjectedKillMs } from '../src/index';
import {
  ACTIVE_CLICKS_PER_SECOND,
  BOSS_TIMER_MS,
  enemyMaxHp,
  goldReward,
  HARD_WALL_PROJECTED_KILL_MS,
  isBoss,
  SHINY_FRENZY_MULTIPLIER,
  upgradeCost,
  WAIT_UPGRADE_GRANT_LEVELS,
  WATCH_AD_UPGRADE_GRANT_LEVELS,
} from '../src/balance';
import { makeGear, makeState } from './helpers';
import type { GameEvent, GameState } from '../src/types';

/**
 * Enter `stage` by killing the previous enemy with a click. Base auto/click
 * stats are now BALANCE constants, so the projected kill time on entry is fixed
 * by the stage's enemy HP; the thresholds are exercised by choosing stages on
 * either side of them (the unarmed active DPS of 6 makes stage 10 a boss check,
 * and stages 19/20 hard walls).
 */
function enterStage(stage: number): { state: GameState; events: GameEvent[] } {
  const start = makeState({ stage: stage - 1, enemyHp: 1 });
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
    const { state, events } = enterStage(10); // unarmed stage-10 boss: ~264 s, over timer, under wall

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
    const { state, events } = enterStage(20); // unarmed stage-20 boss: over the wall

    expect(state.combat.stage).toBe(20);
    expect(isBoss(20)).toBe(true);
    expect(state.choices.pending?.kind).toBe('progression-wall');

    const wall = events.find((event) => event.type === 'progressionWall');
    expect(wall).toBeDefined();
    if (wall?.type === 'progressionWall') {
      expect(wall.projectedKillMs).toBeGreaterThan(HARD_WALL_PROJECTED_KILL_MS);
    }
    expect(events.some((event) => event.type === 'bossCheckFailed')).toBe(false);
  });

  it('raises a progression wall on a non-boss stage too', () => {
    const { state } = enterStage(19);

    expect(isBoss(19)).toBe(false);
    expect(state.combat.stage).toBe(19);
    expect(state.choices.pending?.kind).toBe('progression-wall');
  });
});

describe('projected kill time measures full HP and sustained power', () => {
  // Unarmed base stats: autoDps 2, clickDamage 2, ACTIVE_CLICKS_PER_SECOND 2.
  const SUSTAINED_DPS = 2 + ACTIVE_CLICKS_PER_SECOND * 2;

  it('projects against the stage MAX HP, not the live (partially-damaged) HP', () => {
    const stage = 5;
    const full = makeState({ stage, enemyHp: enemyMaxHp(stage) });
    const damaged = makeState({ stage, enemyHp: 1 });

    const expected = Math.ceil((enemyMaxHp(stage) / SUSTAINED_DPS) * 1000);
    expect(getProjectedKillMs(full)).toBe(expected);
    // A mid-fight read must not under-report: the live HP is nearly dead, but
    // the projection still measures the enemy's full toughness.
    expect(getProjectedKillMs(damaged)).toBe(expected);
  });

  it('is invariant under a temporary frenzy boost (boost never changes the wall)', () => {
    const stage = 19; // non-boss; unarmed projection is far over the hard wall
    const plain = makeState({ stage, enemyHp: enemyMaxHp(stage) });
    const boosted = makeState({
      stage,
      enemyHp: enemyMaxHp(stage),
      boost: { dpsMultiplier: SHINY_FRENZY_MULTIPLIER, expiresAtMs: 100_000 },
    });

    const projected = getProjectedKillMs(plain);
    expect(projected).toBe(Math.ceil((enemyMaxHp(stage) / SUSTAINED_DPS) * 1000));
    expect(projected).toBeGreaterThan(HARD_WALL_PROJECTED_KILL_MS);
    // The boost inflates effective DPS (×5), but the projection measures
    // SUSTAINED power, so it is byte-identical with and without the boost.
    expect(getProjectedKillMs(boosted)).toBe(projected);
    expect(getEffectiveStats(boosted).autoDps).toBeCloseTo(2 * SHINY_FRENZY_MULTIPLIER, 6);
  });

  it('still raises the wall when a frenzy is active at stage entry', () => {
    // Enter stage 19 (a wall for the unarmed player) with a frenzy already
    // running. Pre-fix this skipped the check because the boosted DPS shrank the
    // projected time below the threshold.
    const boosted = makeState({
      stage: 18,
      enemyHp: 1,
      boost: { dpsMultiplier: SHINY_FRENZY_MULTIPLIER, expiresAtMs: 200_000 },
    });

    const { state, events } = applyAction(boosted, { type: 'click' });

    expect(state.combat.stage).toBe(19);
    expect(state.choices.pending?.kind).toBe('progression-wall');
    expect(events.some((event) => event.type === 'progressionWall')).toBe(true);
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
