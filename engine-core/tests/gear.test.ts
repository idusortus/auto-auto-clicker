import { describe, expect, it } from 'vitest';
import { applyAction, getEffectiveStats, getGearStats, getUpgradeCost } from '../src/index';
import { BALANCE, computeGearStats, gearBaseDps, upgradeCost } from '../src/balance';
import { WEAPON_DEFINITION } from '../src/content';
import { makeGear, makeState } from './helpers';

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
