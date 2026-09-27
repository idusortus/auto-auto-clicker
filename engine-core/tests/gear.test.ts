import { describe, expect, it } from 'vitest';
import {
  applyAction,
  getCritStats,
  getEffectiveStats,
  getGearStats,
  getGlobalBonuses,
  getGoldReward,
  getUpgradeCost,
} from '../src/index';
import {
  BALANCE,
  computeGearStats,
  CRIT_CHANCE_CAP,
  CRIT_MULTIPLIER_CAP,
  gearBaseDps,
  GOLD_MULTIPLIER_CAP,
  goldReward,
  POWER_MULTIPLIER_CAP,
  upgradeCost,
} from '../src/balance';
import { NECKLACE_DEFINITION, RING_DEFINITION, WEAPON_DEFINITION } from '../src/content';
import { makeGear, makeNecklace, makeRing, makeState } from './helpers';

describe('gear — equip', () => {
  it('equipping a higher itemLevel weapon raises effective stats', () => {
    const weapon = makeGear(5);
    const start = makeState({ bag: [weapon] });
    expect(getEffectiveStats(start)).toEqual({
      autoDps: BALANCE.baseAutoDps,
      clickDamage: BALANCE.baseClickDamage,
    });

    const { state, events } = applyAction(start, { type: 'equip', instanceId: weapon.id });

    expect(events).toContainEqual({ type: 'gearEquipped', instanceId: weapon.id });
    expect(state.gear.equipped.weapon?.id).toBe(weapon.id);
    expect(state.gear.bag).toHaveLength(0);

    const stats = getEffectiveStats(state);
    expect(stats.autoDps).toBe(BALANCE.baseAutoDps + getGearStats(weapon).dps);
    expect(stats.clickDamage).toBe(BALANCE.baseClickDamage + getGearStats(weapon).clickDamage);
    expect(stats.autoDps).toBeGreaterThan(BALANCE.baseAutoDps);
    expect(stats.clickDamage).toBeGreaterThan(BALANCE.baseClickDamage);
  });

  it('returns the previously equipped weapon to the bag', () => {
    const oldWeapon = makeGear(2);
    const newWeapon = makeGear(5);
    const start = makeState({ equippedWeapon: oldWeapon, bag: [newWeapon] });

    const { state } = applyAction(start, { type: 'equip', instanceId: newWeapon.id });

    expect(state.gear.equipped.weapon?.id).toBe(newWeapon.id);
    expect(state.gear.bag.map((item) => item.id)).toEqual([oldWeapon.id]);
  });

  it('ignores an unknown instance id', () => {
    const start = makeState({ bag: [makeGear(3)] });
    const result = applyAction(start, { type: 'equip', instanceId: 'missing' });
    expect(result.state).toBe(start);
    expect(result.events).toEqual([]);
  });
});

describe('gear — upgrade', () => {
  it('deducts gold and raises stats', () => {
    // Large item level so the small (×1.05) upgrade multiplier is not masked by
    // integer flooring of the base stat.
    const weapon = makeGear(20);
    const start = makeState({ gold: 1000, equippedWeapon: weapon });
    const cost = getUpgradeCost(start, 'weapon');
    expect(cost).toBe(upgradeCost(0));

    const { state, events } = applyAction(start, { type: 'upgradeEquipped', slot: 'weapon' });

    expect(state.player.gold).toBe(1000 - (cost ?? 0));
    expect(state.gear.equipped.weapon?.upgradeLevel).toBe(1);
    expect(events).toContainEqual({
      type: 'gearUpgraded',
      instanceId: weapon.id,
      upgradeLevel: 1,
      goldCost: cost,
    });
    expect(events).toContainEqual({
      type: 'goldChanged',
      amount: -(cost ?? 0),
      total: 1000 - (cost ?? 0),
      reason: 'upgradeEquipped',
    });

    const stats = getEffectiveStats(state);
    const expected = computeGearStats(WEAPON_DEFINITION, 20, 1);
    expect(stats.autoDps).toBe(BALANCE.baseAutoDps + expected.dps);
    expect(stats.clickDamage).toBe(BALANCE.baseClickDamage + expected.clickDamage);
    expect(stats.autoDps).toBeGreaterThan(getEffectiveStats(start).autoDps);
    expect(stats.clickDamage).toBeGreaterThan(getEffectiveStats(start).clickDamage);
  });

  it('is a no-op when unaffordable', () => {
    const start = makeState({ gold: 0, equippedWeapon: makeGear(5) });
    const result = applyAction(start, { type: 'upgradeEquipped', slot: 'weapon' });
    expect(result.state).toBe(start);
    expect(result.events).toEqual([]);
  });

  it('is a no-op when nothing is equipped', () => {
    const start = makeState({ gold: 1000 });
    expect(getUpgradeCost(start, 'weapon')).toBeNull();
    const result = applyAction(start, { type: 'upgradeEquipped', slot: 'weapon' });
    expect(result.state).toBe(start);
    expect(result.events).toEqual([]);
  });
});

describe('gear — stat rule (drops-primary)', () => {
  it('base stats grow EXPONENTIALLY in item level, not polynomially', () => {
    // A constant ratio across the range is the signature of an exponential; a
    // power law with exponent > 1 would have a rising ratio.
    const r20 = gearBaseDps(20) / gearBaseDps(19);
    const r21 = gearBaseDps(21) / gearBaseDps(20);
    const r22 = gearBaseDps(22) / gearBaseDps(21);
    expect(r20).toBeCloseTo(BALANCE.gear.gearGrowth, 2);
    expect(r21).toBeCloseTo(BALANCE.gear.gearGrowth, 2);
    expect(r22).toBeCloseTo(BALANCE.gear.gearGrowth, 2);
  });

  it('a single item-level step outweighs any single upgrade step', () => {
    // Drops must dominate gold upgrades: one extra item level multiplies the
    // stat by more than one upgrade level does.
    expect(BALANCE.gear.gearGrowth).toBeGreaterThan(BALANCE.gear.upgradeStatMultiplier);
    expect(BALANCE.gear.gearGrowth).toBeGreaterThan(1.2);
    expect(BALANCE.gear.upgradeStatMultiplier).toBeLessThan(1.15);
  });

  it('applies the upgrade multiplier multiplicatively on top of the item base', () => {
    const base = computeGearStats(WEAPON_DEFINITION, 20, 0);
    const upgraded = computeGearStats(WEAPON_DEFINITION, 20, 2);
    const expected = Math.floor(
      gearBaseDps(20) * Math.pow(BALANCE.gear.upgradeStatMultiplier, 2),
    );
    expect(upgraded.dps).toBe(expected);
    expect(upgraded.dps).toBeGreaterThan(base.dps);
    expect(upgraded.clickDamage).toBeGreaterThan(base.clickDamage);
  });
});

describe('gear — rings (crit)', () => {
  it('aggregates crit chance and multiplier from both rings', () => {
    const r1 = makeRing(1, 'ring1');
    const r2 = makeRing(1, 'ring2');
    const ringStats = computeGearStats(RING_DEFINITION, 1, 0);
    expect(ringStats.critChance).toBeGreaterThan(0);
    expect(ringStats.critMultiplier).toBeGreaterThan(0);

    const one = makeState({ equippedRing1: r1 });
    expect(getCritStats(one)).toEqual({
      critChance: ringStats.critChance,
      critMultiplier: 1 + ringStats.critMultiplier,
    });

    const two = makeState({ equippedRing1: r1, equippedRing2: r2 });
    const both = getCritStats(two);
    expect(both.critChance).toBeCloseTo(2 * ringStats.critChance, 10);
    expect(both.critMultiplier).toBeCloseTo(1 + 2 * ringStats.critMultiplier, 10);
  });

  it('caps total crit chance at CRIT_CHANCE_CAP', () => {
    const huge = makeState({
      equippedRing1: makeRing(200, 'ring1'),
      equippedRing2: makeRing(200, 'ring2'),
    });
    expect(getCritStats(huge).critChance).toBe(CRIT_CHANCE_CAP);
    // The cap is a real ceiling, below what the raw sum would reach.
    const rawSum =
      computeGearStats(RING_DEFINITION, 200, 0).critChance +
      computeGearStats(RING_DEFINITION, 200, 0).critChance;
    expect(rawSum).toBeGreaterThan(CRIT_CHANCE_CAP);
  });

  it('caps total crit multiplier at CRIT_MULTIPLIER_CAP', () => {
    const huge = makeState({
      equippedRing1: makeRing(200, 'ring1'),
      equippedRing2: makeRing(200, 'ring2'),
    });
    expect(getCritStats(huge).critMultiplier).toBe(CRIT_MULTIPLIER_CAP);
    // The raw exponential contribution is far above the clamp.
    const rawMultiplier =
      1 +
      computeGearStats(RING_DEFINITION, 200, 0).critMultiplier +
      computeGearStats(RING_DEFINITION, 200, 0).critMultiplier;
    expect(rawMultiplier).toBeGreaterThan(CRIT_MULTIPLIER_CAP);
  });

  it('folds crit into effective stats as an expected-DPS multiplier', () => {
    const ring = makeRing(1, 'ring1');
    const withRing = makeState({ equippedRing1: ring });
    const bare = makeState({});

    const crit = getCritStats(withRing);
    const expectedFactor = 1 + crit.critChance * (crit.critMultiplier - 1);
    expect(expectedFactor).toBeGreaterThan(1);

    const bareStats = getEffectiveStats(bare);
    const ringedStats = getEffectiveStats(withRing);
    expect(ringedStats.autoDps).toBeCloseTo(bareStats.autoDps * expectedFactor, 10);
    expect(ringedStats.clickDamage).toBeCloseTo(bareStats.clickDamage * expectedFactor, 10);
  });
});

describe('gear — necklace (gold/power)', () => {
  it('exposes the CAPPED necklace bonuses and folds the capped power into stats', () => {
    const necklace = makeNecklace(20);
    const state = makeState({ equippedNecklace: necklace });
    const neckStats = computeGearStats(NECKLACE_DEFINITION, 20, 0);

    // The exponential raw contribution is far above the cap; the getter clamps.
    expect(neckStats.powerMultiplier).toBeGreaterThan(POWER_MULTIPLIER_CAP);
    expect(neckStats.goldMultiplier).toBeGreaterThan(GOLD_MULTIPLIER_CAP);
    expect(getGlobalBonuses(state)).toEqual({
      goldMultiplier: GOLD_MULTIPLIER_CAP,
      powerMultiplier: POWER_MULTIPLIER_CAP,
    });
    // No necklace => neutral bonuses.
    expect(getGlobalBonuses(makeState({}))).toEqual({ goldMultiplier: 0, powerMultiplier: 0 });

    const powerFactor = 1 + POWER_MULTIPLIER_CAP;
    const bareStats = getEffectiveStats(makeState({}));
    expect(getEffectiveStats(state).autoDps).toBeCloseTo(bareStats.autoDps * powerFactor, 10);
    expect(getEffectiveStats(state).clickDamage).toBeCloseTo(
      bareStats.clickDamage * powerFactor,
      10,
    );
  });

  it('applies the capped gold multiplier wherever gold is awarded', () => {
    const necklace = makeNecklace(20);
    const state = makeState({ equippedNecklace: necklace });
    const { goldMultiplier } = getGlobalBonuses(state);
    expect(goldMultiplier).toBe(GOLD_MULTIPLIER_CAP);

    expect(getGoldReward(state, 5)).toBe(Math.floor(goldReward(5) * (1 + goldMultiplier)));
    expect(getGoldReward(state, 5)).toBeGreaterThan(goldReward(5));

    // A kill routes through the same getter, so the bonus lands in gold.
    const kill = makeState({ stage: 1, enemyHp: 1, equippedNecklace: necklace });
    const { state: after } = applyAction(kill, { type: 'click' });
    expect(after.player.gold).toBe(getGoldReward(kill, 1));
  });
});

describe('gear — slot routing', () => {
  it('routes dropped rings to their matching ring slot on equip', () => {
    const ring1 = makeRing(3, 'ring1');
    const ring2 = makeRing(4, 'ring2');
    const start = makeState({ bag: [ring1, ring2] });

    const first = applyAction(start, { type: 'equip', instanceId: ring1.id }).state;
    expect(first.gear.equipped.ring1?.id).toBe(ring1.id);
    expect(first.gear.equipped.ring2).toBeNull();

    const second = applyAction(first, { type: 'equip', instanceId: ring2.id }).state;
    expect(second.gear.equipped.ring1?.id).toBe(ring1.id);
    expect(second.gear.equipped.ring2?.id).toBe(ring2.id);
  });

  it('upgrades a ring in place without disturbing the weapon', () => {
    const weapon = makeGear(5, 0, 'w');
    const ring = makeRing(5, 'ring1');
    const start = makeState({ gold: 1000, equippedWeapon: weapon, equippedRing1: ring });

    const { state } = applyAction(start, { type: 'upgradeEquipped', slot: 'ring1' });
    expect(state.gear.equipped.ring1?.upgradeLevel).toBe(1);
    expect(state.gear.equipped.weapon?.upgradeLevel).toBe(0);
  });
});
