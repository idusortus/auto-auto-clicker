import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/index';
import { BALANCE, BAG_CAP, DROP_LEVEL_OFFSET } from '../src/balance';
import { nextRng } from '../src/rng';
import { makeGear, makeState } from './helpers';
import type { GameState } from '../src/types';

/** Kill one stage from a state, optionally starting with a weapon equipped. */
function killStage(seed: number, stage = 1, armed = false): GameState {
  const setup = makeState({
    seed,
    stage,
    enemyHp: 1,
    enemyMaxHp: 1,
    ...(armed ? { equippedWeapon: makeGear(1, 0) } : {}),
  });
  return applyAction(setup, { type: 'click' }).state;
}

/** Find a seed whose first loot roll (with a weapon already owned) succeeds. */
function droppingSeed(stage: number): number {
  let seed = 1;
  while (nextRng(seed >>> 0).value >= BALANCE.gear.dropChance) seed += 1;
  return seed;
}

describe('loot', () => {
  it('guarantees the first weapon drop and is deterministic', () => {
    const first = killStage(12345, 1, false);
    const second = killStage(12345, 1, false);

    expect(first.gear.equipped.weapon).toBeNull();
    expect(first.gear.bag).toHaveLength(1);
    expect(first.gear.bag[0]?.definitionId).toBe('weapon');
    expect(first.gear.bag[0]?.itemLevel).toBe(1);
    expect(first.gear.bag[0]?.upgradeLevel).toBe(0);

    expect(second.gear.bag).toEqual(first.gear.bag);
    expect(second.meta.rngState).toBe(first.meta.rngState);
  });

  it('rolls drops at roughly the configured dropChance once a weapon is owned', () => {
    const trials = 2000;
    let drops = 0;
    for (let seed = 1; seed <= trials; seed += 1) {
      if (killStage(seed, 5, true).gear.bag.length > 0) drops += 1;
    }
    const ratio = drops / trials;
    // Observed frequency tracks the configured chance, so the sampled drop
    // stream is the primary power source rather than a rare bonus.
    expect(ratio).toBeGreaterThan(BALANCE.gear.dropChance - 0.03);
    expect(ratio).toBeLessThan(BALANCE.gear.dropChance + 0.03);
  });

  it('tracks the killed stage in the dropped instance itemLevel', () => {
    const stage = DROP_LEVEL_OFFSET + 10;
    const after = killStage(1, stage, false);

    expect(after.gear.bag).toHaveLength(1);
    // The drop's item level follows the killed stage (offset is small/zero), so
    // the drop stream — not the gold curve — supplies stage-proportional power.
    expect(after.gear.bag[0]?.itemLevel).toBe(Math.max(1, stage - DROP_LEVEL_OFFSET));
    expect(DROP_LEVEL_OFFSET).toBeLessThanOrEqual(1);
    expect(after.gear.bag[0]?.definitionId).toBe('weapon');
    expect(after.gear.bag[0]?.upgradeLevel).toBe(0);
  });

  it('evicts the lowest-itemLevel entry when the bag is full', () => {
    const seed = droppingSeed(5);
    const bag = Array.from({ length: BAG_CAP }, (_, i) => makeGear(i + 1, 0, `existing-${i + 1}`));
    const setup = makeState({
      seed,
      stage: 5,
      enemyHp: 1,
      enemyMaxHp: 1,
      equippedWeapon: makeGear(1, 0),
      bag,
    });
    const after = applyAction(setup, { type: 'click' }).state;

    expect(after.gear.bag).toHaveLength(BAG_CAP);
    expect(after.gear.bag.some((item) => item.id === 'existing-1')).toBe(false);
    expect(after.gear.bag.some((item) => item.id === 'existing-24')).toBe(true);
    expect(after.gear.bag.some((item) => item.id.startsWith('gear-'))).toBe(true);
  });
});

describe('createGame', () => {
  it('starts unarmed, at stage 1, with base stats', () => {
    const state = createGame(1, 0);
    expect(state.gear.equipped.weapon).toBeNull();
    expect(state.gear.bag).toEqual([]);
    expect(state.player.baseAutoDps).toBe(BALANCE.baseAutoDps);
    expect(state.player.baseClickDamage).toBe(BALANCE.baseClickDamage);
  });
});
