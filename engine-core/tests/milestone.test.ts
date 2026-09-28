import { describe, expect, it } from 'vitest';
import {
  applyAction,
  getCritStats,
  getEffectiveStats,
  getGearStats,
  getGlobalBonuses,
  getMilestoneInfo,
  getSlotMilestones,
  loadGame,
  saveGame,
  UPGRADE_MILESTONE_BONUS,
  UPGRADE_MILESTONE_INTERVAL,
  upgradeMilestoneCount,
} from '../src/index';
import {
  BALANCE,
  CRIT_CHANCE_CAP,
  CRIT_MULTIPLIER_CAP,
  POWER_MULTIPLIER_CAP,
} from '../src/balance';
import { makeGear, makeNecklace, makeRing, makeState } from './helpers';
import type { GameEvent } from '../src/types';

const AT_MILESTONE = UPGRADE_MILESTONE_INTERVAL;

function milestoneEvents(events: readonly GameEvent[]): GameEvent[] {
  return events.filter((event) => event.type === 'milestoneReached');
}

describe('upgrade milestones — derivation', () => {
  it('counts whole milestones at the interval and floors', () => {
    expect(UPGRADE_MILESTONE_INTERVAL).toBeGreaterThan(1);
    expect(upgradeMilestoneCount(-1)).toBe(0);
    expect(upgradeMilestoneCount(0)).toBe(0);
    expect(upgradeMilestoneCount(Number.NaN)).toBe(0);
    for (let level = 0; level < UPGRADE_MILESTONE_INTERVAL; level += 1) {
      expect(upgradeMilestoneCount(level)).toBe(0);
    }
    expect(upgradeMilestoneCount(AT_MILESTONE)).toBe(1);
    expect(upgradeMilestoneCount(AT_MILESTONE * 2 + 1)).toBe(2);
  });

  it('reports interval, achieved count, next level, and engine-worded bonus', () => {
    const info = getMilestoneInfo('ring1', AT_MILESTONE * 2);
    expect(info.slot).toBe('ring1');
    expect(info.interval).toBe(UPGRADE_MILESTONE_INTERVAL);
    expect(info.achievedCount).toBe(2);
    expect(info.nextAtLevel).toBe(UPGRADE_MILESTONE_INTERVAL * 3);

    // The wording is rendered from the balance bonus, so /web holds no number.
    const bonus = UPGRADE_MILESTONE_BONUS.ring1;
    expect(info.bonusDescription).toContain('crit');
    expect(info.bonusDescription).toContain(`${(bonus.critChance * 100).toFixed(1)}%`);

    const weapon = getMilestoneInfo('weapon', 0);
    expect(weapon.achievedCount).toBe(0);
    expect(weapon.nextAtLevel).toBe(UPGRADE_MILESTONE_INTERVAL);
    expect(weapon.bonusDescription).toContain('power');
  });

  it('reports per-slot milestone info for equipped gear and null for empty slots', () => {
    const state = makeState({
      equippedWeapon: makeGear(10, AT_MILESTONE),
      equippedRing1: makeRing(10, 'ring1', 1),
    });
    const milestones = getSlotMilestones(state);

    expect(milestones.weapon?.achievedCount).toBe(1);
    expect(milestones.ring1?.achievedCount).toBe(0);
    expect(milestones.ring1?.nextAtLevel).toBe(UPGRADE_MILESTONE_INTERVAL);
    expect(milestones.ring2).toBeNull();
    expect(milestones.necklace).toBeNull();
  });
});

describe('upgrade milestones — the crossing event', () => {
  it('emits milestoneReached exactly on the crossing upgrade', () => {
    const start = makeState({
      gold: 100_000,
      equippedWeapon: makeGear(20, AT_MILESTONE - 1),
    });
    const crossed = applyAction(start, { type: 'upgradeEquipped', slot: 'weapon' });

    const events = milestoneEvents(crossed.events);
    expect(events).toHaveLength(1);
    const event = events[0];
    if (event?.type !== 'milestoneReached') throw new Error('expected a milestoneReached event');
    expect(event.slot).toBe('weapon');
    expect(event.upgradeLevel).toBe(AT_MILESTONE);
    expect(event.description).toContain('%');
  });

  it('does not emit milestoneReached for a non-crossing upgrade', () => {
    const start = makeState({ gold: 100_000, equippedWeapon: makeGear(20, AT_MILESTONE) });
    const normal = applyAction(start, { type: 'upgradeEquipped', slot: 'weapon' });
    expect(normal.state.gear.equipped.weapon?.upgradeLevel).toBe(AT_MILESTONE + 1);
    expect(milestoneEvents(normal.events)).toHaveLength(0);
  });

  it('is deterministic: a crossing never perturbs the RNG stream', () => {
    const start = makeState({ gold: 100_000, equippedWeapon: makeGear(20, AT_MILESTONE - 1) });
    const first = applyAction(start, { type: 'upgradeEquipped', slot: 'weapon' });
    const second = applyAction(start, { type: 'upgradeEquipped', slot: 'weapon' });
    expect(first.state).toEqual(second.state);
    expect(first.state.meta.rngState).toBe(start.meta.rngState);
  });
});

describe('upgrade milestones — capped stats', () => {
  it('folds a weapon milestone into power without bypassing POWER_MULTIPLIER_CAP', () => {
    const neutral = makeState({ equippedWeapon: makeGear(20, 0) });
    expect(getGlobalBonuses(neutral).powerMultiplier).toBe(0);

    const crossed = makeState({ equippedWeapon: makeGear(20, AT_MILESTONE) });
    const bonus = getGlobalBonuses(crossed).powerMultiplier;
    expect(bonus).toBeGreaterThan(0);
    expect(bonus).toBeLessThanOrEqual(POWER_MULTIPLIER_CAP);

    // The bonus reaches effective stats through the same factor as gear.
    const gear = getGearStats(crossed.gear.equipped.weapon ?? makeGear(20, AT_MILESTONE));
    const expected = (BALANCE.baseAutoDps + gear.dps) * (1 + bonus);
    expect(getEffectiveStats(crossed).autoDps).toBeCloseTo(expected, 10);

    // A gigantic milestone count saturates at the cap rather than exceeding it.
    const huge = makeState({ equippedWeapon: makeGear(20, AT_MILESTONE * 1000) });
    expect(getGlobalBonuses(huge).powerMultiplier).toBe(POWER_MULTIPLIER_CAP);
  });

  it('folds ring milestones into the capped crit aggregation', () => {
    const neutral = makeState({ equippedRing1: makeRing(1, 'ring1', 0) });
    const crossed = makeState({ equippedRing1: makeRing(1, 'ring1', AT_MILESTONE) });
    expect(getCritStats(crossed).critChance).toBeGreaterThan(getCritStats(neutral).critChance);

    const huge = makeState({
      equippedRing1: makeRing(500, 'ring1', AT_MILESTONE * 1000),
      equippedRing2: makeRing(500, 'ring2', AT_MILESTONE * 1000),
    });
    expect(getCritStats(huge).critChance).toBe(CRIT_CHANCE_CAP);
    expect(getCritStats(huge).critMultiplier).toBe(CRIT_MULTIPLIER_CAP);
  });

  it('folds necklace milestones into the capped gold aggregation', () => {
    const neutral = makeState({ equippedNecklace: makeNecklace(1, 0) });
    const crossed = makeState({ equippedNecklace: makeNecklace(1, AT_MILESTONE) });
    expect(getGlobalBonuses(crossed).goldMultiplier).toBeGreaterThan(
      getGlobalBonuses(neutral).goldMultiplier,
    );
    // The necklace's POWER bonus is already at its cap from the raw item alone,
    // so a necklace milestone deliberately grants gold only (no dead power term).
    expect(getGlobalBonuses(crossed).powerMultiplier).toBe(POWER_MULTIPLIER_CAP);
  });
});

describe('upgrade milestones — no persisted state (schema v4)', () => {
  it('writes no milestone field and recomputes the bonus on load', () => {
    const state = makeState({ equippedWeapon: makeGear(20, AT_MILESTONE) });
    const save = saveGame(state);

    expect(save.version).toBe(4);
    const weapon = save.state.gear.equipped.weapon;
    expect(weapon).not.toBeNull();
    expect(weapon !== null && 'milestone' in weapon).toBe(false);
    expect(weapon !== null && 'milestones' in weapon).toBe(false);

    const loaded = loadGame(save);
    expect(getGlobalBonuses(loaded).powerMultiplier).toBe(
      getGlobalBonuses(state).powerMultiplier,
    );
    expect(getSlotMilestones(loaded).weapon?.achievedCount).toBe(1);
  });
});
