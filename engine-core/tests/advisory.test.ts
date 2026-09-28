// Advisory tests: the upgrade advisory and the stall advisory.
//
// Pins the contract the soft-lock fix relies on:
//   - an upgrade is reported when a STRICTLY better bag item exists for a slot,
//     for any slot (weapon, ring, necklace), ranked by the SAME engine metric
//     the sim's economy policy uses;
//   - a downgrade (or an equal item) is never reported;
//   - the stall advisory requires BOTH a stalled window AND an available
//     upgrade, and is `none` otherwise;
//   - nothing new is persisted: the save schema stays v4 and the advisory is
//     recomputed on load.

import { describe, expect, it } from 'vitest';
import {
  getSlotUpgradeAdvisory,
  getStallAdvisory,
  loadGame,
  powerScore,
  saveGame,
  scoreWithEquip,
  STALL_HINT_MS,
  STALL_NAG_MS,
} from '../src/index';
import { makeGear, makeNecklace, makeRing, makeState } from './helpers';
import type { GameState, GearInstance } from '../src/types';

describe('getSlotUpgradeAdvisory — strictly better bag item', () => {
  it('reports an upgrade for a weapon with a strictly better bag item', () => {
    const state = makeState({
      equippedWeapon: makeGear(5, 0, 'equipped'),
      bag: [makeGear(20, 0, 'better')],
    });
    const advisory = getSlotUpgradeAdvisory(state, 'weapon');

    expect(advisory.slot).toBe('weapon');
    expect(advisory.hasUpgrade).toBe(true);
    expect(advisory.bestInstanceId).toBe('better');
    expect(advisory.bestPower).toBeGreaterThan(advisory.currentPower);
    expect(advisory.ratio).toBeGreaterThan(1);
  });

  it('reports NO upgrade when the bag weapon is weaker or equal', () => {
    const weaker = makeState({
      equippedWeapon: makeGear(20, 0, 'equipped'),
      bag: [makeGear(5, 0, 'weak'), makeGear(20, 0, 'equal')],
    });
    const noWeaker = getSlotUpgradeAdvisory(weaker, 'weapon');
    expect(noWeaker.hasUpgrade).toBe(false);
    expect(noWeaker.bestInstanceId).toBeNull();
    // Nothing beat the state, so the "best" score is the current score.
    expect(noWeaker.bestPower).toBe(noWeaker.currentPower);
    expect(noWeaker.ratio).toBe(1);
  });

  it('NEVER recommends a downgrade — once the best bag item is equipped, the advisory clears', () => {
    const before = makeState({
      equippedWeapon: makeGear(5, 0, 'equipped'),
      bag: [makeGear(20, 0, 'better'), makeGear(3, 0, 'junk')],
    });
    expect(getSlotUpgradeAdvisory(before, 'weapon').hasUpgrade).toBe(true);

    // Move the best bag item into the slot; the same slot must now be clean,
    // even though weaker items remain in the bag.
    const after: GameState = {
      ...before,
      gear: {
        ...before.gear,
        equipped: { ...before.gear.equipped, weapon: before.gear.bag[0] as GearInstance },
        bag: [before.gear.bag[1] as GearInstance],
      },
    };
    const advisory = getSlotUpgradeAdvisory(after, 'weapon');
    expect(advisory.hasUpgrade).toBe(false);
    expect(advisory.ratio).toBe(1);
  });

  it('works for rings and the necklace (not only the weapon)', () => {
    const state = makeState({
      equippedWeapon: makeGear(10, 0, 'w'),
      equippedRing1: makeRing(1, 'ring1', 0, 'ring-equipped'),
      equippedNecklace: makeNecklace(1, 0, 'neck-equipped'),
      bag: [makeRing(5, 'ring1', 0, 'ring-better'), makeNecklace(5, 0, 'neck-better')],
    });

    const ring = getSlotUpgradeAdvisory(state, 'ring1');
    expect(ring.hasUpgrade).toBe(true);
    expect(ring.bestInstanceId).toBe('ring-better');

    const necklace = getSlotUpgradeAdvisory(state, 'necklace');
    expect(necklace.hasUpgrade).toBe(true);
    expect(necklace.bestInstanceId).toBe('neck-better');

    // A better WEAPON never flags a ring slot (comparisons are same-slot only).
    const onlyWeaponInBag = makeState({
      equippedRing1: makeRing(1, 'ring1', 0, 'ring-equipped'),
      bag: [makeGear(50, 0, 'big-weapon')],
    });
    expect(getSlotUpgradeAdvisory(onlyWeaponInBag, 'ring1').hasUpgrade).toBe(false);
    expect(getSlotUpgradeAdvisory(onlyWeaponInBag, 'ring2').hasUpgrade).toBe(false);
  });

  it('treats a usable bag item in an EMPTY slot as an upgrade', () => {
    const unarmed = makeState({ bag: [makeGear(5, 0, 'starter')] });
    const advisory = getSlotUpgradeAdvisory(unarmed, 'weapon');
    expect(advisory.hasUpgrade).toBe(true);
    expect(advisory.bestInstanceId).toBe('starter');
    expect(advisory.currentPower).toBeGreaterThan(0);
  });

  it('ranks with the shared engine metric: scoreWithEquip matches the equipped-state score', () => {
    const base = makeState({ equippedWeapon: makeGear(5, 0, 'equipped') });
    const item = makeGear(12, 0, 'candidate');

    // scoreWithEquip is exactly the score of the state with that item equipped.
    const equippedState: GameState = {
      ...base,
      gear: { ...base.gear, equipped: { ...base.gear.equipped, weapon: item } },
    };
    expect(scoreWithEquip(base, 'weapon', item)).toBe(powerScore(equippedState));
  });
});

describe('getStallAdvisory — BOTH conditions required', () => {
  const upgradeAvailable = { equippedWeapon: makeGear(5, 0, 'equipped'), bag: [makeGear(20, 0, 'better')] };

  it('is none while progressing (stall window not reached) even with an upgrade', () => {
    const state = makeState({ ...upgradeAvailable, stage: 20, totalPlayedMs: 100_000 });
    const advisory = getStallAdvisory(state, state.meta.totalPlayedMs - 1_000);
    expect(advisory.severity).toBe('none');
    expect(advisory.stalled).toBe(false);
    expect(advisory.best).not.toBeNull();
  });

  it('is none when stalled but NO upgrade is available', () => {
    const state = makeState({
      stage: 20,
      totalPlayedMs: 100_000,
      equippedWeapon: makeGear(20, 0, 'best'),
      bag: [makeGear(3, 0, 'junk')],
    });
    const advisory = getStallAdvisory(state, 0);
    expect(advisory.severity).toBe('none');
    expect(advisory.stalled).toBe(true);
    expect(advisory.best).toBeNull();
    expect(advisory.upgrades).toEqual([]);
  });

  it('is none without a known stage anchor (the honest "unknown")', () => {
    const state = makeState({ ...upgradeAvailable, stage: 20, totalPlayedMs: 100_000 });
    const advisory = getStallAdvisory(state);
    expect(advisory.severity).toBe('none');
    expect(advisory.stalledMs).toBe(0);
    expect(advisory.stalled).toBe(false);
  });

  it('escalates hint → nag as the stall window grows', () => {
    const state = makeState({ ...upgradeAvailable, stage: 20, totalPlayedMs: 200_000 });

    const hint = getStallAdvisory(state, state.meta.totalPlayedMs - STALL_HINT_MS);
    expect(hint.severity).toBe('hint');
    expect(hint.stalled).toBe(true);
    expect(hint.stalledMs).toBe(STALL_HINT_MS);

    const nag = getStallAdvisory(state, state.meta.totalPlayedMs - STALL_NAG_MS);
    expect(nag.severity).toBe('nag');
    expect(nag.stalledMs).toBe(STALL_NAG_MS);

    const justUnder = getStallAdvisory(state, state.meta.totalPlayedMs - (STALL_HINT_MS - 1));
    expect(justUnder.severity).toBe('none');
  });

  it('reports the stage, the best upgrade, and every upgrade slot', () => {
    const state = makeState({
      stage: 33,
      totalPlayedMs: 500_000,
      equippedWeapon: makeGear(5, 0, 'equipped'),
      equippedRing1: makeRing(1, 'ring1', 0, 'ring-equipped'),
      bag: [makeGear(30, 0, 'better-weapon'), makeRing(6, 'ring1', 0, 'better-ring')],
    });
    const advisory = getStallAdvisory(state, 0);

    expect(advisory.severity).toBe('nag');
    expect(advisory.stage).toBe(33);
    expect(advisory.stalledMs).toBe(500_000);
    expect(advisory.upgrades.map((entry) => entry.slot).sort()).toEqual(['ring1', 'weapon']);
    expect(advisory.best).not.toBeNull();
    expect(['weapon', 'ring1']).toContain(advisory.best?.slot);
  });
});

describe('advisory — no persisted state (schema v4)', () => {
  it('writes no advisory field and recomputes the advisory on load', () => {
    const state = makeState({
      stage: 39,
      totalPlayedMs: 123_456,
      equippedWeapon: makeGear(34, 0, 'equipped'),
      bag: [makeGear(38, 0, 'better')],
    });
    const save = saveGame(state);

    expect(save.version).toBe(4);
    expect('advisory' in save.state).toBe(false);
    expect('stallAdvisory' in save.state).toBe(false);

    const loaded = loadGame(save);
    const before = getStallAdvisory(state, 0);
    const after = getStallAdvisory(loaded, 0);
    expect(after.severity).toBe(before.severity);
    expect(after.best?.bestInstanceId).toBe(before.best?.bestInstanceId);
    expect(after.best?.ratio).toBeCloseTo(before.best?.ratio ?? 0, 10);
  });
});
