// handlers.test.tsx — end-to-end handler wiring through useGameHost.
//
// Covers tasks 4.2 and 6.3: every component handler reaches the engine's
// `applyAction` exactly once per tap, so the engine module is the only thing that
// mutates state. `applyAction` and `advance` are wrapped so the tests can count
// calls while every other engine export stays real.
//
// RNTL v14 makes `render` / `fireEvent` / `waitFor` async, so interactions are
// awaited.

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { applyAction, createGame, saveGame } from '@auto-auto-clicker/engine-core';
import type { GameState, SaveGame } from '@auto-auto-clicker/engine-core';

import { GameScreen } from './GameScreen';
import { ManualScheduler, MemorySaveRepository } from '../../tests/helpers';

jest.mock('@auto-auto-clicker/engine-core', () => {
  const actual = jest.requireActual('@auto-auto-clicker/engine-core');
  return {
    ...actual,
    applyAction: jest.fn(actual.applyAction),
    advance: jest.fn(actual.advance),
  };
});

const mockedApplyAction = applyAction as jest.MockedFunction<typeof applyAction>;
const realApplyAction = jest.requireActual('@auto-auto-clicker/engine-core')
  .applyAction as typeof applyAction;

let addEventListenerSpy: jest.SpyInstance;
let scheduler: ManualScheduler;
let nowMs = 0;

beforeEach(() => {
  scheduler = new ManualScheduler();
  nowMs = 0;
  mockedApplyAction.mockReset();
  mockedApplyAction.mockImplementation(realApplyAction);
  addEventListenerSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(() => {
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  addEventListenerSpy.mockRestore();
});

/** A save at time zero so boot credits no offline time and preserves the state. */
function savedAtZero(state: GameState): SaveGame {
  return saveGame(state, 0);
}

async function bootScreen(
  repository: MemorySaveRepository,
): Promise<Awaited<ReturnType<typeof render>>> {
  const view = await render(
    <GameScreen hostOptions={{ repository, now: () => nowMs, seed: () => 7, scheduler }} />,
  );
  await waitFor(() => expect(view.getByTestId('game-screen')).toBeTruthy());
  return view;
}

describe('one tap dispatches exactly one engine action (4.2, 6.3)', () => {
  it('maps a single enemy tap to one click action', async () => {
    const view = await bootScreen(new MemorySaveRepository(null));
    mockedApplyAction.mockClear();

    await fireEvent.press(view.getByTestId('enemy'));

    expect(mockedApplyAction).toHaveBeenCalledTimes(1);
    expect(mockedApplyAction).toHaveBeenCalledWith(expect.anything(), { type: 'click' });
  });

  it('maps one upgrade control tap to one upgradeEquipped action', async () => {
    const state = createGame(1, 0);
    state.gear.equipped.weapon = { id: 'w1', definitionId: 'weapon', itemLevel: 1, upgradeLevel: 0 };
    state.player.gold = 100_000;
    const view = await bootScreen(new MemorySaveRepository(savedAtZero(state)));
    mockedApplyAction.mockClear();

    await fireEvent.press(view.getByTestId('upgrade-btn-weapon'));

    expect(mockedApplyAction).toHaveBeenCalledTimes(1);
    expect(mockedApplyAction).toHaveBeenCalledWith(expect.anything(), {
      type: 'upgradeEquipped',
      slot: 'weapon',
    });
  });

  it('maps one equip tap to one equip action', async () => {
    const state = createGame(1, 0);
    state.gear.bag.push({ id: 'bag-1', definitionId: 'weapon', itemLevel: 3, upgradeLevel: 0 });
    const view = await bootScreen(new MemorySaveRepository(savedAtZero(state)));
    mockedApplyAction.mockClear();

    await fireEvent.press(view.getByTestId('equip-btn-bag-1'));

    expect(mockedApplyAction).toHaveBeenCalledTimes(1);
    expect(mockedApplyAction).toHaveBeenCalledWith(expect.anything(), {
      type: 'equip',
      instanceId: 'bag-1',
    });
  });

  it('maps one choice tap to one resolveChoice action', async () => {
    const state = createGame(1, 0);
    state.choices.pending = { kind: 'boss-check', stage: 1, options: ['wait', 'watchAd', 'iap'] };
    const view = await bootScreen(new MemorySaveRepository(savedAtZero(state)));
    mockedApplyAction.mockClear();

    await fireEvent.press(view.getByTestId('choice-wait'));

    expect(mockedApplyAction).toHaveBeenCalledTimes(1);
    expect(mockedApplyAction).toHaveBeenCalledWith(expect.anything(), {
      type: 'resolveChoice',
      choice: 'wait',
    });
  });

  it('maps one Shiny tap to one claimEvent action', async () => {
    const state = createGame(1, 0);
    state.event.active = { kind: 'cache', spawnedAtMs: 0, expiresAtMs: 999_999 };
    const view = await bootScreen(new MemorySaveRepository(savedAtZero(state)));
    mockedApplyAction.mockClear();

    await fireEvent.press(view.getByTestId('shiny'));

    expect(mockedApplyAction).toHaveBeenCalledTimes(1);
    expect(mockedApplyAction).toHaveBeenCalledWith(expect.anything(), { type: 'claimEvent' });
  });
});
