import { describe, expect, it } from 'vitest';
import { advance, applyAction, getEffectiveStats, getEnemyMaxHp } from '../src/index';
import { BALANCE, enemyMaxHp, goldReward, isBoss } from '../src/balance';
import { makeState } from './helpers';

// Base auto/click stats are now BALANCE constants (source fields removed from
// GameState). Behaviour is still exercised with controlled numbers by driving
// the real `advance`/`applyAction` paths and expressing expectations through
// `BALANCE` / `enemyMaxHp`, never hard-coded balance values.

describe('advance — auto damage', () => {
  it('applies integer auto-damage proportional to deltaMs', () => {
    const start = makeState({ stage: 1, enemyHp: 25 });
    expect(start.combat.enemyHp).toBe(25);

    const oneSecond = advance(start, 1000);
    expect(oneSecond.state.combat.enemyHp).toBe(25 - BALANCE.baseAutoDps);
    expect(oneSecond.events).toContainEqual({
      type: 'damageDealt',
      amount: BALANCE.baseAutoDps,
      source: 'auto',
    });

    const twoSeconds = advance(start, 2000);
    expect(twoSeconds.state.combat.enemyHp).toBe(25 - 2 * BALANCE.baseAutoDps);
    expect(twoSeconds.events).toContainEqual({
      type: 'damageDealt',
      amount: 2 * BALANCE.baseAutoDps,
      source: 'auto',
    });

    // A 100 ms tick accumulates a fraction of the base DPS (< 1 for the shipped
    // balance), so no damage lands yet and the remainder is carried.
    const tenthSecond = advance(start, 100);
    expect(tenthSecond.state.combat.enemyHp).toBe(25);
    expect(tenthSecond.state.combat.damageCarry).toBeCloseTo((BALANCE.baseAutoDps * 100) / 1000, 10);
  });

  it('carries fractional damage so long-run DPS is exact', () => {
    const baseline = 1000;
    const setup = () => makeState({ stage: 1, enemyHp: baseline });

    let whole = setup();
    for (let i = 0; i < 10; i += 1) whole = advance(whole, 1000).state;
    expect(whole.combat.enemyHp).toBe(baseline - 10 * BALANCE.baseAutoDps);
    expect(whole.combat.damageCarry).toBe(0);

    // 100 ms steps each land a sub-integer amount, forcing the carry to hold the
    // remainder; after ten steps the total is still exact with no drift.
    let fractional = setup();
    for (let i = 0; i < 10; i += 1) fractional = advance(fractional, 100).state;
    expect(fractional.combat.enemyHp).toBe(baseline - BALANCE.baseAutoDps);
    expect(fractional.combat.damageCarry).toBe(0);
  });

  it('a single large deltaMs clears multiple enemies and accrues gold/stage', () => {
    // Synthesize the budget from the enemy HP curve: exactly enough to kill
    // stages 1-3 and leave 1 HP on stage 4, independent of live balance. The
    // delta that delivers `budget` integer damage is `budget / baseAutoDps`.
    const budget = enemyMaxHp(1) + enemyMaxHp(2) + enemyMaxHp(3) + (enemyMaxHp(4) - 1);
    const start = makeState({ stage: 1, enemyHp: enemyMaxHp(1) });
    const { state, events } = advance(start, Math.ceil((budget * 1000) / BALANCE.baseAutoDps));

    expect(state.combat.stage).toBe(4);
    expect(state.combat.enemyHp).toBe(1);
    expect(state.player.gold).toBe(goldReward(1) + goldReward(2) + goldReward(3));
    expect(events.filter((event) => event.type === 'enemyKilled')).toHaveLength(3);
    expect(events.filter((event) => event.type === 'stageEntered')).toHaveLength(3);
  });

  it('is a no-op for non-positive or non-finite deltaMs', () => {
    // Play a little so the carry is non-trivial, then prove malformed deltas
    // cannot poison totalPlayedMs / damageCarry / the eventual save JSON.
    const start = advance(makeState({ stage: 1, enemyHp: 100 }), 250).state;
    expect(start.combat.damageCarry).toBeCloseTo((BALANCE.baseAutoDps * 250) / 1000, 10);

    for (const deltaMs of [0, -1, NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = advance(start, deltaMs);
      expect(result.state).toBe(start);
      expect(result.events).toEqual([]);
      expect(result.state).toEqual(start);
    }

    expect(allNumbersFinite(start)).toBe(true);
  });
});

/** No field in the state tree may be a non-finite number after an advance. */
function allNumbersFinite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allNumbersFinite);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).every(allNumbersFinite);
  }
  return true;
}

describe('actions — click', () => {
  it('deals exactly clickDamage', () => {
    const start = makeState({ stage: 1, enemyHp: 10 });
    expect(getEffectiveStats(start).clickDamage).toBe(BALANCE.baseClickDamage);

    const { state, events } = applyAction(start, { type: 'click' });
    expect(state.combat.enemyHp).toBe(10 - BALANCE.baseClickDamage);
    expect(events).toContainEqual({ type: 'damageDealt', amount: BALANCE.baseClickDamage, source: 'click' });
  });

  it('a kill awards gold and increments the stage', () => {
    // Sized to the live click damage so the kill is hit regardless of tuning.
    const start = makeState({ enemyHp: BALANCE.baseClickDamage });
    const { state, events } = applyAction(start, { type: 'click' });

    expect(state.combat.stage).toBe(2);
    expect(state.player.gold).toBe(goldReward(1));
    expect(getEnemyMaxHp(state)).toBe(enemyMaxHp(2));
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
    expect(bossHp).toBe(Math.floor(BALANCE.baseHp * Math.pow(BALANCE.hpGrowth, 9) * BALANCE.bossHpMultiplier));
    expect(bossHp).toBeGreaterThan(enemyMaxHp(9) * 2);

    const bossGold = goldReward(10);
    expect(bossGold).toBe(
      Math.floor(BALANCE.baseGold * Math.pow(BALANCE.goldGrowth, 9) * BALANCE.bossGoldMultiplier),
    );
    expect(bossGold).toBeGreaterThan(goldReward(9) * 2);
  });

  it('spawns a boss with boss HP when entering stage 10', () => {
    const start = makeState({ stage: 9, enemyHp: 1 });
    const { state } = applyAction(start, { type: 'click' });

    expect(state.combat.stage).toBe(10);
    expect(getEnemyMaxHp(state)).toBe(enemyMaxHp(10));
    expect(state.combat.enemyHp).toBe(enemyMaxHp(10));
    expect(state.player.gold).toBe(goldReward(9));
  });
});
