import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/index';
import { BALANCE, BAG_CAP } from '../src/balance';
import { nextRng } from '../src/rng';
import { makeGear, makeState } from './helpers';

function killStageOne(seed: number) {
  const setup = makeState({ seed, enemyHp: 1, enemyMaxHp: 1 });
  return applyAction(setup, { type: 'click' }).state;
}

describe('loot', () => {
  it('drops deterministically for a fixed seed and honors dropChance', () => {
    const seed = 12345;
    const base = createGame(seed, 0);
    const firstRoll = nextRng(base.meta.rngState);
    expect(firstRoll.value).toBeGreaterThanOrEqual(0);
    expect(firstRoll.value).toBeLessThan(1);
    const shouldDrop = firstRoll.value < BALANCE.gear.dropChance;

    const first = killStageOne(seed);
    const second = killStageOne(seed);

    expect(first.gear.bag).toEqual(second.gear.bag);
    expect(first.meta.rngState).toBe(second.meta.rngState);
    expect(first.gear.bag).toHaveLength(shouldDrop ? 1 : 0);
  });

  it('rolls drops at roughly the configured dropChance across seeds', () => {
    const trials = 2000;
    let drops = 0;
    for (let seed = 1; seed <= trials; seed += 1) {
      if (killStageOne(seed).gear.bag.length > 0) drops += 1;
    }
    const ratio = drops / trials;
    expect(ratio).toBeGreaterThan(0.18);
    expect(ratio).toBeLessThan(0.32);
  });

  it('sets a dropped instance itemLevel to the killed stage', () => {
    let seed = 1;
    while (nextRng(seed >>> 0).value >= BALANCE.gear.dropChance) seed += 1;

    const setup = makeState({ seed, stage: 5, enemyHp: 1, enemyMaxHp: 1 });
    const after = applyAction(setup, { type: 'click' }).state;

    expect(after.gear.bag).toHaveLength(1);
    expect(after.gear.bag[0]?.itemLevel).toBe(5);
    expect(after.gear.bag[0]?.definitionId).toBe('weapon');
    expect(after.gear.bag[0]?.upgradeLevel).toBe(0);
  });

  it('evicts the lowest-itemLevel entry when the bag is full', () => {
    let seed = 1;
    while (nextRng(seed >>> 0).value >= BALANCE.gear.dropChance) seed += 1;

    const bag = Array.from({ length: BAG_CAP }, (_, i) => makeGear(i + 1, 0, `existing-${i + 1}`));
    const setup = makeState({ seed, stage: 5, enemyHp: 1, enemyMaxHp: 1, bag });
    const after = applyAction(setup, { type: 'click' }).state;

    expect(after.gear.bag).toHaveLength(BAG_CAP);
    expect(after.gear.bag.some((item) => item.id === 'existing-1')).toBe(false);
    expect(after.gear.bag.some((item) => item.itemLevel === 5 && item.id.startsWith('gear-'))).toBe(true);
  });
});
