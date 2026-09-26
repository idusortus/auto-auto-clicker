import { describe, expect, it } from 'vitest';
import { advance, applyAction, createGame } from '../src/index';
import { deepFreeze, makeGear, makeState } from './helpers';

function snapshot(value: unknown): string {
  return JSON.stringify(value);
}

describe('purity', () => {
  it('advance and applyAction do not mutate a frozen input state', () => {
    const input = deepFreeze(createGame(42, 0));
    const before = snapshot(input);

    const advanced = advance(input, 2500);
    expect(advanced.state).not.toBe(input);
    expect(snapshot(input)).toBe(before);

    const clicked = applyAction(input, { type: 'click' });
    expect(clicked.state).not.toBe(input);
    expect(snapshot(input)).toBe(before);
  });

  it('kill, equip, upgrade, and choice actions leave the input untouched', () => {
    const kill = deepFreeze(makeState({ stage: 9, enemyHp: 1, enemyMaxHp: 1 }));
    const killBefore = snapshot(kill);
    applyAction(kill, { type: 'click' });
    expect(snapshot(kill)).toBe(killBefore);

    const equipInput = deepFreeze(makeState({ gold: 1000, bag: [makeGear(4)] }));
    const equipBefore = snapshot(equipInput);
    applyAction(equipInput, { type: 'equip', instanceId: 'test-gear-4' });
    applyAction(equipInput, { type: 'upgradeEquipped', slot: 'weapon' });
    expect(snapshot(equipInput)).toBe(equipBefore);

    const pending = applyAction(kill, { type: 'click' }).state;
    const frozenPending = deepFreeze(pending);
    const pendingBefore = snapshot(frozenPending);
    applyAction(frozenPending, { type: 'resolveChoice', choice: 'wait' });
    expect(snapshot(frozenPending)).toBe(pendingBefore);
  });
});
