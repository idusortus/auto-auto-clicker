import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  advance,
  applyAction,
  evaluateAchievements,
  getCritStats,
} from '../src/index';
import { BALANCE, BAG_CAP, CRIT_CHANCE_CAP } from '../src/balance';
import { makeGear, makeNecklace, makeRing, makeState } from './helpers';

/** Unlocked ids emitted in an event list. */
function unlockedIds(events: { type: string; id?: string }[]): string[] {
  return events
    .filter((event) => event.type === 'achievementUnlocked')
    .map((event) => event.id ?? '');
}

describe('achievements — catalog', () => {
  it('is a static catalog of 18-24 uniquely-identified achievements', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(18);
    expect(ACHIEVEMENTS.length).toBeLessThanOrEqual(24);
    const ids = ACHIEVEMENTS.map((achievement) => achievement.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.title.length).toBeGreaterThan(0);
      expect(achievement.description.length).toBeGreaterThan(0);
    }
  });

  it('covers the required milestones', () => {
    const ids = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));
    for (const required of ['first-blood', 'geared-up', 'boss-slayer', 'stage-10', 'crit-maxed', 'bedazzled']) {
      expect(ids.has(required)).toBe(true);
    }
  });
});

describe('achievements — unlock emission', () => {
  it('emits achievementUnlocked for the first kill and persists the id', () => {
    const start = makeState({ stage: 1, enemyHp: 1 });
    const { state, events } = applyAction(start, { type: 'click' });

    expect(events).toContainEqual({
      type: 'achievementUnlocked',
      id: 'first-blood',
      title: 'First Blood',
    });
    expect(state.meta.achievements).toContain('first-blood');
  });

  it('emits geared-up on the first equip', () => {
    const weapon = makeGear(1);
    const start = makeState({ bag: [weapon] });
    const { state, events } = applyAction(start, { type: 'equip', instanceId: weapon.id });

    expect(unlockedIds(events)).toContain('geared-up');
    expect(state.meta.achievements).toContain('geared-up');
  });

  it('emits boss-slayer when a boss is killed', () => {
    const start = makeState({ stage: 10, enemyHp: 1, equippedWeapon: makeGear(1) });
    const { state, events } = applyAction(start, { type: 'click' });

    expect(state.combat.stage).toBe(11);
    expect(unlockedIds(events)).toContain('boss-slayer');
  });

  it('emits a stage milestone on entering the milestone stage', () => {
    const start = makeState({ stage: 9, enemyHp: 1 });
    const { state, events } = applyAction(start, { type: 'click' });

    expect(state.combat.stage).toBe(10);
    expect(unlockedIds(events)).toContain('stage-10');
  });

  it('emits crit milestones from equipped rings', () => {
    const ring = makeRing(20, 'ring1');
    const start = makeState({ bag: [ring] });
    const { state, events } = applyAction(start, { type: 'equip', instanceId: ring.id });

    expect(getCritStats(state).critChance).toBe(CRIT_CHANCE_CAP);
    expect(unlockedIds(events)).toContain('crit-investor');
    expect(unlockedIds(events)).toContain('crit-maxed');
  });

  it('emits bedazzled when a necklace is acquired', () => {
    const necklace = makeNecklace(5);
    const start = makeState({ bag: [necklace] });
    const { events } = applyAction(start, { type: 'equip', instanceId: necklace.id });
    expect(unlockedIds(events)).toContain('bedazzled');
  });

  it('emits double-ringed when both ring slots are filled', () => {
    const ring1 = makeRing(1, 'ring1');
    const ring2 = makeRing(1, 'ring2');
    const start = makeState({ bag: [ring1, ring2] });

    const first = applyAction(start, { type: 'equip', instanceId: ring1.id });
    expect(unlockedIds(first.events)).not.toContain('double-ringed');

    const second = applyAction(first.state, { type: 'equip', instanceId: ring2.id });
    expect(unlockedIds(second.events)).toContain('double-ringed');
  });

  it('emits touch-grass from accumulated playtime via advance', () => {
    const start = makeState({
      stage: 1,
      enemyHp: 1_000_000,
      totalPlayedMs: 10 * 60 * 1000 - 100,
    });
    const { state, events } = advance(start, 200);

    expect(state.meta.totalPlayedMs).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(unlockedIds(events)).toContain('touch-grass');
  });

  it('emits bag-lady when the bag is full', () => {
    const bag = Array.from({ length: BAG_CAP }, (_, index) =>
      makeGear(index + 1, 0, `bag-${index + 1}`),
    );
    const start = makeState({
      stage: 1,
      enemyHp: 1,
      equippedWeapon: makeGear(1, 0, 'w'),
      bag,
    });
    const { events } = applyAction(start, { type: 'click' });
    expect(unlockedIds(events)).toContain('bag-lady');
  });
});

describe('achievements — expanded catalog triggers', () => {
  it('emits first-click on the first tap that deals damage', () => {
    const start = makeState({ stage: 1, enemyHp: 30 });
    const { state, events } = applyAction(start, { type: 'click' });
    expect(unlockedIds(events)).toContain('first-click');
    expect(state.meta.achievements).toContain('first-click');
  });

  it('emits first-upgrade when an upgrade is bought', () => {
    const start = makeState({ gold: 1000, equippedWeapon: makeGear(20) });
    const { events } = applyAction(start, { type: 'upgradeEquipped', slot: 'weapon' });
    expect(unlockedIds(events)).toContain('first-upgrade');
  });

  it('emits ring-bearer, bling and full-kit as slots fill', () => {
    const weapon = makeGear(1, 0, 'w');
    const ring1 = makeRing(1, 'ring1');
    const ring2 = makeRing(1, 'ring2');
    const necklace = makeNecklace(1);
    const start = makeState({ bag: [weapon, ring1, ring2, necklace] });

    const afterWeapon = applyAction(start, { type: 'equip', instanceId: weapon.id });
    expect(unlockedIds(afterWeapon.events)).not.toContain('ring-bearer');
    expect(unlockedIds(afterWeapon.events)).not.toContain('full-kit');

    const afterRing1 = applyAction(afterWeapon.state, { type: 'equip', instanceId: ring1.id });
    expect(unlockedIds(afterRing1.events)).toContain('ring-bearer');
    expect(unlockedIds(afterRing1.events)).not.toContain('bling');

    const afterNecklace = applyAction(afterRing1.state, {
      type: 'equip',
      instanceId: necklace.id,
    });
    expect(unlockedIds(afterNecklace.events)).toContain('bling');
    expect(unlockedIds(afterNecklace.events)).not.toContain('full-kit');

    const afterRing2 = applyAction(afterNecklace.state, { type: 'equip', instanceId: ring2.id });
    expect(unlockedIds(afterRing2.events)).toContain('double-ringed');
    expect(unlockedIds(afterRing2.events)).toContain('full-kit');
  });

  it('emits big-iron when a level-40 weapon is equipped', () => {
    const weapon = makeGear(40);
    const start = makeState({ bag: [weapon] });
    const { events } = applyAction(start, { type: 'equip', instanceId: weapon.id });
    expect(unlockedIds(events)).toContain('big-iron');
  });

  it('emits loose-change once the gold balance reaches the threshold', () => {
    const start = makeState({ stage: 1, enemyHp: 1, gold: 97 });
    const { state, events } = applyAction(start, { type: 'click' });
    expect(state.player.gold).toBeGreaterThanOrEqual(100);
    expect(unlockedIds(events)).toContain('loose-change');
  });

  it('emits wall-hit on a progression wall and choice-made when it is resolved', () => {
    const entered = applyAction(makeState({ stage: 18, enemyHp: 1 }), { type: 'click' });
    expect(entered.state.combat.stage).toBe(19);
    expect(unlockedIds(entered.events)).toContain('wall-hit');

    const resolved = applyAction(entered.state, { type: 'resolveChoice', choice: 'wait' });
    expect(unlockedIds(resolved.events)).toContain('choice-made');
  });

  it('emits hoarder below the hard bag cap, and bag-lady only at the cap', () => {
    const hoard = Array.from({ length: 12 }, (_, index) =>
      makeGear(index + 1, 0, `hoard-${index + 1}`),
    );
    const start = makeState({
      stage: 1,
      enemyHp: 1,
      equippedWeapon: makeGear(1, 0, 'w'),
      bag: hoard,
    });
    const { events } = applyAction(start, { type: 'click' });
    expect(unlockedIds(events)).toContain('hoarder');
    expect(unlockedIds(events)).not.toContain('bag-lady');
  });
});

describe('achievements — purity and idempotence', () => {
  it('does not re-emit an already-unlocked achievement', () => {
    const start = makeState({ stage: 1, enemyHp: 1 });
    const first = applyAction(start, { type: 'click' });
    expect(unlockedIds(first.events)).toContain('first-blood');

    // Re-evaluating the same state yields nothing new.
    expect(evaluateAchievements(first.state, first.state, [])).toEqual([]);
  });

  it('does not perturb the RNG stream', () => {
    const seeded = makeState({ stage: 1, enemyHp: 1, achievements: ['first-blood'] });
    const bare = makeState({ stage: 1, enemyHp: 1 });

    const withAchievements = applyAction(seeded, { type: 'click' }).state;
    const withoutAchievements = applyAction(bare, { type: 'click' }).state;

    expect(withAchievements.meta.rngState).toBe(withoutAchievements.meta.rngState);
    expect(withAchievements.gear.bag).toEqual(withoutAchievements.gear.bag);
  });

  it('does not change gold or balance numbers when unlocking', () => {
    const start = makeState({ stage: 1, enemyHp: 1 });
    const { state } = applyAction(start, { type: 'click' });
    expect(state.player.gold).toBeGreaterThanOrEqual(BALANCE.baseGold);
    expect(state.meta.achievements).toContain('first-blood');
  });
});
