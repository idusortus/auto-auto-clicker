// Pins the documented projection property (see `getProjectedKillMs` in
// `state.ts`): the wall depends on the player's CURRENT sustained DPS, so with
// no weapon equipped — the only item-level power lever — a gear-less player's
// projection degenerates to a pure function of the stage, while equipping a
// weapon changes it. Keeping this exact stops the documented behaviour drifting.

import { describe, expect, it } from 'vitest';
import { applyAction, enemyMaxHp, getProjectedKillMs, isUnarmed } from '../src/index';
import { sustainedActiveDps } from '../src/gear-stats';
import { makeGear, makeNecklace, makeRing, makeState } from './helpers';

describe('projection — unarmed degeneracy', () => {
  it('is a pure function of stage when no gear is equipped', () => {
    const stage = 20;
    const bare = makeState({ stage });
    // Same stage, but every source field that does NOT feed sustained DPS
    // differs: gold, playtime, achievements, and a bag full of non-weapon items.
    const cluttered = makeState({
      stage,
      gold: 987_654,
      totalPlayedMs: 123_456,
      achievements: ['first-blood', 'geared-up'],
      bag: [makeRing(5, 'ring1'), makeRing(9, 'ring2'), makeNecklace(7)],
    });

    expect(isUnarmed(bare)).toBe(true);
    expect(isUnarmed(cluttered)).toBe(true);

    const projected = getProjectedKillMs(bare);
    // With no weapon the sustained DPS is the constant base active DPS, so the
    // projection is exactly `enemyMaxHp(stage) / sustainedActiveDps`, where
    // `enemyMaxHp` is the LIVE curve (the standing enemy's own curve).
    expect(projected).toBe(Math.ceil((enemyMaxHp(stage) / sustainedActiveDps(bare)) * 1000));
    // Gold, achievements, and non-weapon inventory do not move it.
    expect(getProjectedKillMs(cluttered)).toBe(projected);
    // The same pure function at a later stage projects a strictly longer kill.
    expect(getProjectedKillMs(makeState({ stage: stage + 5 }))).toBeGreaterThan(projected as number);
  });

  it('changes when a weapon is equipped', () => {
    const stage = 20;
    const weapon = makeGear(stage);
    const unarmed = makeState({ stage, bag: [weapon] });
    const before = getProjectedKillMs(unarmed);
    expect(isUnarmed(unarmed)).toBe(true);
    expect(before).not.toBeNull();

    const { state: armed } = applyAction(unarmed, { type: 'equip', instanceId: weapon.id });

    expect(isUnarmed(armed)).toBe(false);
    // A weapon adds item-level DPS, so the same stage projects strictly faster.
    expect(getProjectedKillMs(armed)).toBeLessThan(before as number);
  });

  it('reports unarmed when only non-weapon gear is equipped', () => {
    const nonWeaponOnly = makeState({
      equippedRing1: makeRing(4, 'ring1'),
      equippedNecklace: makeNecklace(4),
    });
    expect(isUnarmed(nonWeaponOnly)).toBe(true);
    expect(isUnarmed(makeState({ equippedWeapon: makeGear(4) }))).toBe(false);
  });
});
