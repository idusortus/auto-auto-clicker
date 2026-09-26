import { describe, expect, it } from 'vitest';
import { applyAction, getEffectiveStats, getUpgradeCost } from '../src/index';
import { BALANCE, computeGearStats, upgradeCost } from '../src/balance';
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
    expect(stats.autoDps).toBe(BALANCE.baseAutoDps + weapon.dps);
    expect(stats.clickDamage).toBe(BALANCE.baseClickDamage + weapon.clickDamage);
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
    const weapon = makeGear(5);
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
    const expected = computeGearStats(WEAPON_DEFINITION, 5, 1);
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
