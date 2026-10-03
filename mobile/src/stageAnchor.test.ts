// stageAnchor.test.ts — the in-memory stage anchor (task 4.4).
//
// The host records the sim-time at which the current stage began, passes it to
// the stall advisory, and never persists it. This suite proves the anchor is
// recorded on a real stage change and that a persisted save contains no anchor
// field (the save schema stays v4).

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { createGame, saveGame } from '@auto-auto-clicker/engine-core';
import type { SaveGame } from '@auto-auto-clicker/engine-core';

import { STEP_MS, useGameHost } from './useGameHost';
import type { GameHost } from './useGameHost';
import { MemorySaveRepository, ManualScheduler, flushMicrotasks } from '../tests/helpers';

let appStateListener: ((state: AppStateStatus) => void) | null = null;
let addEventListenerSpy: jest.SpyInstance;
let scheduler: ManualScheduler;
let nowMs = 0;
const mounted: Array<() => Promise<void>> = [];

beforeEach(() => {
  nowMs = 0;
  scheduler = new ManualScheduler();
  appStateListener = null;
  mounted.length = 0;
  addEventListenerSpy = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
});

afterEach(async () => {
  await act(async () => {
    for (const unmount of mounted.splice(0)) {
      await unmount();
    }
  });
  addEventListenerSpy.mockRestore();
});

/** A save that can be one-shot on a single 100 ms step, changing the stage. */
function oneShotSave(): SaveGame {
  const state = createGame(1, 0);
  state.gear.equipped.weapon = {
    id: 'w1',
    definitionId: 'weapon',
    itemLevel: 200,
    upgradeLevel: 0,
  };
  state.combat.enemyHp = 1;
  return saveGame(state, 0);
}

async function boot(repository: MemorySaveRepository): Promise<{ current: GameHost }> {
  const rendered = await renderHook(() =>
    useGameHost({ repository, now: () => nowMs, seed: () => 1, scheduler }),
  );
  mounted.push(rendered.unmount);
  await waitFor(() => expect(rendered.result.current.ready).toBe(true));
  return rendered.result as { current: GameHost };
}

describe('stage anchor (4.4)', () => {
  it('records the anchor when combat.stage changes', async () => {
    const result = await boot(new MemorySaveRepository(oneShotSave()));
    // Boot records an anchor for the first observed stage.
    expect(result.current.frame.stageBeganAtMs).toBe(0);
    expect(result.current.state?.combat.stage).toBe(1);

    // First tick anchors the live clock; the second advances one 100 ms step,
    // which one-shots the enemy and moves to stage 2.
    await act(async () => {
      nowMs += STEP_MS;
      scheduler.tick();
    });
    await act(async () => {
      nowMs += STEP_MS;
      scheduler.tick();
    });

    expect(result.current.state?.combat.stage).toBeGreaterThan(1);
    expect(result.current.state?.meta.totalPlayedMs).toBe(STEP_MS);
    // The anchor was re-recorded for the new stage at the current sim time.
    expect(result.current.frame.stageBeganAtMs).toBe(result.current.state?.meta.totalPlayedMs);
  });

  it('does not persist the anchor and keeps the save at v4', async () => {
    const repository = new MemorySaveRepository(oneShotSave());
    const result = await boot(repository);
    await act(async () => {
      await flushMicrotasks();
    });

    // Force a flush after the stage change so the newest state is persisted.
    await act(async () => {
      nowMs += STEP_MS;
      scheduler.tick();
    });
    await act(async () => {
      nowMs += STEP_MS;
      scheduler.tick();
    });
    await act(async () => {
      appStateListener?.('background');
    });

    const save = repository.lastSave();
    expect(save).not.toBeNull();
    expect(save?.version).toBe(4);
    // The anchor lives on the host frame, never on the persisted state.
    expect(Object.prototype.hasOwnProperty.call(save?.state, 'stageBeganAtMs')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(save?.state.meta, 'stageBeganAtMs')).toBe(false);
    expect(JSON.stringify(save)).not.toContain('stageBeganAtMs');
    // The host still holds the anchor in memory.
    expect(result.current.frame.stageBeganAtMs).toBe(result.current.state?.meta.totalPlayedMs);
  });
});
