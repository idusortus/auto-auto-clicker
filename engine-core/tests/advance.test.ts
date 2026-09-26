import { describe, expect, it } from 'vitest';
import { advance, applyAction, createGame, getEffectiveStats } from '../src/index';
import { enemyMaxHp, goldReward, isBoss } from '../src/balance';
import { makeState } from './helpers';

describe('advance — auto damage', () => {
  it('applies integer auto-damage proportional to deltaMs', () => {
    const start = createGame(1, 0);
    expect(start.combat.enemyHp).toBe(25);

    const oneSecond = advance(start, 1000);
    expect(oneSecond.state.combat.enemyHp).toBe(24);
    expect(oneSecond.events).toContainEqual({ type: 'damageDealt', amount: 1, source: 'auto' });

    const twoSeconds = advance(start, 2000);
    expect(twoSeconds.state.combat.enemyHp).toBe(23);
    expect(twoSeconds.events).toContainEqual({ type: 'damageDealt', amount: 2, source: 'auto' });

    const halfSecond = advance(start, 500);
    expect(halfSecond.state.combat.enemyHp).toBe(25);
    expect(halfSecond.state.combat.damageCarry).toBeCloseTo(0.5, 10);
  });

  it('carries fractional damage so long-run DPS is exact', () => {
    const baseline = createGame(2, 0).combat.enemyHp;

    let whole = createGame(2, 0);
    for (let i = 0; i < 10; i += 1) whole = advance(whole, 1000).state;
    expect(whole.combat.enemyHp).toBe(baseline - 10);
    expect(whole.combat.damageCarry).toBe(0);

    let fractional = createGame(3, 0);
    for (let i = 0; i < 10; i += 1) fractional = advance(fractional, 500).state;
    expect(fractional.combat.enemyHp).toBe(baseline - 5);
    expect(fractional.combat.damageCarry).toBe(0);
  });

  it('a single large deltaMs clears multiple enemies and accrues gold/stage', () => {
    const start = createGame(11, 0);
    const { state, events } = advance(start, 200_000);

    expect(state.combat.stage).toBe(4);
    expect(state.combat.enemyHp).toBe(enemyMaxHp(4) - 82);
    expect(state.player.gold).toBe(goldReward(1) + goldReward(2) + goldReward(3));
    expect(events.filter((event) => event.type === 'enemyKilled')).toHaveLength(3);
    expect(events.filter((event) => event.type === 'stageEntered')).toHaveLength(3);
  });

  it('is a no-op for non-positive deltaMs', () => {
    const start = createGame(12, 0);
    const result = advance(start, 0);
    expect(result.state).toBe(start);
    expect(result.events).toEqual([]);
  });
});

describe('actions — click', () => {
  it('deals exactly clickDamage', () => {
    const start = createGame(4, 0);
    expect(getEffectiveStats(start).clickDamage).toBe(2);

    const { state, events } = applyAction(start, { type: 'click' });
    expect(state.combat.enemyHp).toBe(23);
    expect(events).toContainEqual({ type: 'damageDealt', amount: 2, source: 'click' });
  });

  it('a kill awards gold and increments the stage', () => {
    const start = makeState({ enemyHp: 2, enemyMaxHp: 2 });
    const { state, events } = applyAction(start, { type: 'click' });

    expect(state.combat.stage).toBe(2);
    expect(state.player.gold).toBe(goldReward(1));
    expect(state.combat.enemyMaxHp).toBe(enemyMaxHp(2));
    expect(state.combat.enemyHp).toBe(enemyMaxHp(2));
    expect(events).toContainEqual({
      type: 'enemyKilled',
      stage: 1,
      gold: goldReward(1),
      drops: expect.any(Array),
    });
    expect(events).toContainEqual({ type: 'stageEntered', stage: 2, isBoss: false, maxHp: enemyMaxHp(2) });
  });
});

describe('boss stages', () => {
  it('applies the boss HP and gold multipliers', () => {
    expect(isBoss(1)).toBe(false);
    expect(isBoss(10)).toBe(true);

    const bossHp = enemyMaxHp(10);
    expect(bossHp).toBe(Math.floor(25 * Math.pow(1.5, 9) * 8));
    expect(bossHp).toBeGreaterThan(enemyMaxHp(9) * 2);

    const bossGold = goldReward(10);
    expect(bossGold).toBe(Math.floor(8 * Math.pow(1.45, 9) * 4));
    expect(bossGold).toBeGreaterThan(goldReward(9) * 2);
  });

  it('spawns a boss with boss HP when entering stage 10', () => {
    const start = makeState({ stage: 9, enemyHp: 1, enemyMaxHp: 1 });
    const { state } = applyAction(start, { type: 'click' });

    expect(state.combat.stage).toBe(10);
    expect(state.combat.enemyMaxHp).toBe(enemyMaxHp(10));
    expect(state.combat.enemyHp).toBe(enemyMaxHp(10));
    expect(state.player.gold).toBe(goldReward(9));
  });
});
