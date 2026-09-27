import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getEffectiveStats } from '../src/index';
import {
  BALANCE,
  BAG_CAP,
  DROP_LEVEL_OFFSET,
  pickWeightedSlot,
  SLOT_DROP_WEIGHTS,
} from '../src/balance';
import { gearDefinitionFor } from '../src/content';
import { nextRng } from '../src/rng';
import { makeGear, makeRing, makeState } from './helpers';
import type { GameState, GearSlot } from '../src/types';

/** Kill one stage from a state, optionally starting with a weapon equipped. */
function killStage(seed: number, stage = 1, armed = false): GameState {
  const setup = makeState({
    seed,
    stage,
    enemyHp: 1,
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
    // Base stats are derived from BALANCE, not persisted on the state.
    expect(getEffectiveStats(state)).toEqual({
      autoDps: BALANCE.baseAutoDps,
      clickDamage: BALANCE.baseClickDamage,
    });
  });
});

describe('loot — slot weighting', () => {
  it('maps rolls to slots in proportion to SLOT_DROP_WEIGHTS', () => {
    const total = Object.values(SLOT_DROP_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(pickWeightedSlot(0)).toBe('weapon');
    expect(pickWeightedSlot(SLOT_DROP_WEIGHTS.weapon / total + 1e-9)).toBe('ring1');
    expect(
      pickWeightedSlot((SLOT_DROP_WEIGHTS.weapon + SLOT_DROP_WEIGHTS.ring1) / total + 1e-9),
    ).toBe('ring2');
    expect(pickWeightedSlot(1 - 1e-9)).toBe('necklace');
    // Non-finite rolls fall back to the weapon rather than producing NaN.
    expect(pickWeightedSlot(Number.NaN)).toBe('weapon');
  });

  it('samples slots by weight and makes necklaces rare', () => {
    const trials = 6000;
    const counts: Record<GearSlot, number> = { weapon: 0, ring1: 0, ring2: 0, necklace: 0 };
    let drops = 0;
    for (let seed = 1; seed <= trials; seed += 1) {
      const after = killStage(seed, 5, true);
      const drop = after.gear.bag[0];
      if (!drop) continue;
      drops += 1;
      const definition = gearDefinitionFor(drop.definitionId);
      expect(definition).not.toBeNull();
      if (!definition) continue;
      counts[definition.slot] = (counts[definition.slot] ?? 0) + 1;
    }

    expect(drops).toBeGreaterThan(trials * 0.9);
    const weaponShare = counts.weapon / drops;
    const necklaceShare = counts.necklace / drops;
    // Weapon is the dominant stream; the necklace is rare.
    expect(weaponShare).toBeGreaterThan(counts.ring1 / drops);
    expect(counts.weapon).toBeGreaterThan(counts.ring1);
    expect(counts.necklace).toBeGreaterThan(0);
    expect(necklaceShare).toBeLessThan(0.03);
    // Both ring slots appear, roughly equally.
    expect(counts.ring1).toBeGreaterThan(0);
    expect(counts.ring2).toBeGreaterThan(0);
    expect(Math.abs(counts.ring1 - counts.ring2) / drops).toBeLessThan(0.05);
  });

  it('is deterministic for a fixed seed', () => {
    const first = killStage(777, 5, true);
    const second = killStage(777, 5, true);
    expect(first.gear.bag).toEqual(second.gear.bag);
    expect(first.meta.rngState).toBe(second.meta.rngState);
  });

  it('guarantees a weapon before any other slot can drop', () => {
    // Bag holds a ring but no weapon: ownsWeapon is false, so every drop is
    // forced to the weapon slot regardless of the slot roll.
    for (let seed = 1; seed <= 200; seed += 1) {
      const setup = makeState({ seed, stage: 5, enemyHp: 1, bag: [makeRing(3)] });
      const after = applyAction(setup, { type: 'click' }).state;
      const drop = after.gear.bag.find((item) => item.id.startsWith('gear-'));
      expect(drop?.definitionId).toBe('weapon');
    }
  });

  it('allows non-weapon slots once a weapon is owned', () => {
    let sawRing = false;
    let sawNecklace = false;
    for (let seed = 1; seed <= 6000 && !(sawRing && sawNecklace); seed += 1) {
      const drop = killStage(seed, 5, true).gear.bag[0];
      if (!drop) continue;
      const slot = gearDefinitionFor(drop.definitionId)?.slot;
      if (slot === 'ring1' || slot === 'ring2') sawRing = true;
      if (slot === 'necklace') sawNecklace = true;
    }
    expect(sawRing).toBe(true);
    expect(sawNecklace).toBe(true);
  });
});
