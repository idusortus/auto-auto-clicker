import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { applyAction, advance, createGame, saveGame } from '@auto-auto-clicker/engine-core';
import type { GameState, SaveGame } from '@auto-auto-clicker/engine-core';

import { AUTOSAVE_INTERVAL_MS, MAX_CATCHUP_STEPS, STEP_MS, useGameHost } from './useGameHost';
import type { GameHost } from './useGameHost';
import { OFFLINE_CAP_MS } from './storage';
import {
  GatedSaveRepository,
  ManualScheduler,
  MemorySaveRepository,
  ThrowingSaveRepository,
  flushMicrotasks,
} from '../tests/helpers';

// Wrap the two engine entry points so dispatch mapping and the offline replay
// can be observed, while every other export stays real.
jest.mock('@auto-auto-clicker/engine-core', () => {
  const actual = jest.requireActual('@auto-auto-clicker/engine-core');
  return {
    ...actual,
    advance: jest.fn(actual.advance),
    applyAction: jest.fn(actual.applyAction),
  };
});

const mockedApplyAction = applyAction as jest.MockedFunction<typeof applyAction>;
const mockedAdvance = advance as jest.MockedFunction<typeof advance>;
const realAdvance = jest.requireActual('@auto-auto-clicker/engine-core').advance as typeof advance;
const realApplyAction = jest.requireActual('@auto-auto-clicker/engine-core')
  .applyAction as typeof applyAction;

/** Deterministic wall clock the tests advance in lockstep with the ticker. */
let nowMs = 0;
/** The manual ticker injected into the host under test. */
let scheduler: ManualScheduler;

async function stepTicks(count: number): Promise<void> {
  await act(async () => {
    for (let i = 0; i < count; i += 1) {
      nowMs += STEP_MS;
      scheduler.tick();
    }
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await flushMicrotasks();
  });
}

async function boot(options: Parameters<typeof useGameHost>[0] = {}): Promise<{
  result: { current: GameHost };
  unmount: () => Promise<void>;
}> {
  const rendered = await renderHook(() => useGameHost({ scheduler, ...options }));
  mounted.push(rendered.unmount);
  // Await the async boot effect (hydrate + offline replay) before assertions.
  await waitFor(() => expect(rendered.result.current.ready).toBe(true));
  return rendered;
}

/** A valid save whose state carries a pending choice. */
function pendingChoiceSave(savedAt: number): SaveGame {
  const state = JSON.parse(JSON.stringify(createGame(5, 0))) as GameState;
  state.choices.pending = {
    kind: 'boss-check',
    stage: state.combat.stage,
    options: ['wait', 'watchAd', 'iap'],
  };
  return saveGame(state, savedAt);
}

/** A structurally invalid blob that `loadGame` will reject. */
function corruptSave(): SaveGame {
  return { version: 5, savedAt: 0, state: {} } as unknown as SaveGame;
}

let appStateListener: ((state: AppStateStatus) => void) | null = null;
let addEventListenerSpy: jest.SpyInstance;
const mounted: Array<() => Promise<void>> = [];

beforeEach(() => {
  nowMs = 0;
  scheduler = new ManualScheduler();
  appStateListener = null;
  mounted.length = 0;
  mockedAdvance.mockReset();
  mockedAdvance.mockImplementation(realAdvance);
  mockedApplyAction.mockReset();
  mockedApplyAction.mockImplementation(realApplyAction);

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

describe('boot hydration', () => {
  it('starts a fresh game when the repository has no save', async () => {
    const repository = new MemorySaveRepository(null);
    const { result } = await boot({ repository, now: () => nowMs, seed: () => 77 });

    expect(result.current.ready).toBe(true);
    expect(result.current.state).not.toBeNull();
    expect(result.current.state?.combat.stage).toBe(1);
    expect(result.current.state?.player.gold).toBe(0);
    expect(result.current.state?.meta.seed).toBe(77);
    expect(result.current.offline).toBeNull();
  });

  it('hydrates a valid save instead of starting a new game', async () => {
    const seeded = createGame(123, 0);
    seeded.player.gold = 4321;
    seeded.combat.stage = 9;
    const repository = new MemorySaveRepository(saveGame(seeded, 0));

    const { result } = await boot({ repository, now: () => nowMs });

    expect(result.current.state?.player.gold).toBe(4321);
    expect(result.current.state?.combat.stage).toBe(9);
  });

  it('falls back to a fresh game when the stored blob is rejected', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const repository = new MemorySaveRepository(corruptSave());

    const { result } = await boot({ repository, now: () => nowMs, seed: () => 3 });

    expect(result.current.state?.combat.stage).toBe(1);
    expect(result.current.state?.meta.seed).toBe(3);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('starts a fresh game when the repository itself throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await boot({
      repository: new ThrowingSaveRepository(),
      now: () => nowMs,
      seed: () => 4,
    });
    expect(result.current.state?.meta.seed).toBe(4);
    errorSpy.mockRestore();
  });

  it('registers the ticker at the fixed 100 ms step', async () => {
    await boot({ now: () => nowMs });

    expect(scheduler.scheduled).toBe(true);
    expect(scheduler.intervalMs).toBe(100);
    expect(scheduler.intervalMs).toBe(STEP_MS);
  });
});

describe('offline replay on boot', () => {
  it('replays finite elapsed time and reports an offline summary', async () => {
    const seeded = createGame(1, 0);
    const repository = new MemorySaveRepository(saveGame(seeded, 0));
    nowMs = 30_000;

    const { result } = await boot({ repository, now: () => nowMs });

    expect(result.current.offline).not.toBeNull();
    expect(result.current.offline?.simulatedMs).toBe(30_000);
    expect(result.current.offline?.capped).toBe(false);
    expect(result.current.state?.meta.totalPlayedMs).toBe(30_000);
  });

  it('caps away time at 8 hours and flags it as capped', async () => {
    const seeded = createGame(1, 0);
    const repository = new MemorySaveRepository(saveGame(seeded, 0));
    // 10 hours since the save: more than the 8 h cap.
    nowMs = OFFLINE_CAP_MS + 2 * 60 * 60 * 1000;

    const { result } = await boot({ repository, now: () => nowMs });

    expect(result.current.offline?.capped).toBe(true);
    expect(result.current.offline?.elapsedMs).toBe(nowMs);
    expect(result.current.offline?.simulatedMs).toBeLessThanOrEqual(OFFLINE_CAP_MS);
    expect(result.current.offline?.simulatedMs).toBeGreaterThan(0);
  });

  it('replays no time (and shows no summary) when the save is current', async () => {
    const seeded = createGame(1, 0);
    const repository = new MemorySaveRepository(saveGame(seeded, 1000));
    nowMs = 1000;

    const { result } = await boot({ repository, now: () => nowMs });

    expect(result.current.offline).toBeNull();
    expect(result.current.state?.meta.totalPlayedMs).toBe(0);
  });

  it('stops at a pending choice and shows it on boot', async () => {
    const repository = new MemorySaveRepository(pendingChoiceSave(0));
    nowMs = 60_000;

    const { result } = await boot({ repository, now: () => nowMs });

    expect(result.current.state?.choices.pending).not.toBeNull();
    expect(result.current.offline).toBeNull();
  });

  it('replays no player actions (no clicks) during offline time', async () => {
    const repository = new MemorySaveRepository(saveGame(createGame(1, 0), 0));
    nowMs = 30_000;

    await boot({ repository, now: () => nowMs });

    expect(mockedAdvance).toHaveBeenCalled();
    expect(mockedApplyAction).not.toHaveBeenCalled();
  });
});

describe('live fixed-step loop', () => {
  it('advances only whole 100 ms steps', async () => {
    const { result } = await boot({ repository: new MemorySaveRepository(null), now: () => nowMs });

    // First tick anchors the clock; no simulation yet.
    await stepTicks(1);
    expect(result.current.state?.meta.totalPlayedMs).toBe(0);

    await stepTicks(3);
    expect(result.current.state?.meta.totalPlayedMs).toBe(3 * STEP_MS);
  });

  it('bounds catch-up and drops the backlog beyond MAX_CATCHUP_STEPS', async () => {
    const { result } = await boot({ repository: new MemorySaveRepository(null), now: () => nowMs });

    // Anchor the clock first (the first tick never simulates).
    await stepTicks(1);

    // 5 seconds of wall-clock time arrives in a single tick (a "stall").
    await act(async () => {
      nowMs += 50 * STEP_MS;
      scheduler.tick();
    });

    // At most MAX_CATCHUP_STEPS steps ran and the leftover backlog was dropped.
    expect(result.current.state?.meta.totalPlayedMs).toBe(MAX_CATCHUP_STEPS * STEP_MS);

    // The next tick advances normally by one step (backlog did not survive).
    await stepTicks(1);
    expect(result.current.state?.meta.totalPlayedMs).toBe((MAX_CATCHUP_STEPS + 1) * STEP_MS);
  });

  it('freezes the world while a choice is pending', async () => {
    const repository = new MemorySaveRepository(pendingChoiceSave(0));
    const { result } = await boot({ repository, now: () => nowMs });

    const before = result.current.state?.meta.totalPlayedMs ?? -1;
    await stepTicks(20);
    expect(result.current.state?.meta.totalPlayedMs).toBe(before);
    expect(result.current.state?.choices.pending).not.toBeNull();
  });
});

describe('action dispatch', () => {
  it('maps each handler to its engine action', async () => {
    const { result } = await boot({ repository: new MemorySaveRepository(null), now: () => nowMs });
    const state = result.current.state as GameState;

    await act(async () => {
      result.current.onClick();
    });
    expect(mockedApplyAction).toHaveBeenLastCalledWith(state, { type: 'click' });

    await act(async () => {
      result.current.onUpgrade('weapon');
    });
    expect(mockedApplyAction).toHaveBeenLastCalledWith(expect.anything(), {
      type: 'upgradeEquipped',
      slot: 'weapon',
    });

    await act(async () => {
      result.current.onEquip('instance-7');
    });
    expect(mockedApplyAction).toHaveBeenLastCalledWith(expect.anything(), {
      type: 'equip',
      instanceId: 'instance-7',
    });

    await act(async () => {
      result.current.onChoice('watchAd');
    });
    expect(mockedApplyAction).toHaveBeenLastCalledWith(expect.anything(), {
      type: 'resolveChoice',
      choice: 'watchAd',
    });

    await act(async () => {
      result.current.onClaim();
    });
    expect(mockedApplyAction).toHaveBeenLastCalledWith(expect.anything(), { type: 'claimEvent' });
  });

  it('skips re-rendering when applyAction returns the same state (no-op)', async () => {
    const repository = new MemorySaveRepository(null);
    const { result } = await boot({ repository, now: () => nowMs });
    const state = result.current.state;

    // An unaffordable upgrade on a fresh game is a no-op.
    await act(async () => {
      result.current.onUpgrade('weapon');
    });

    expect(mockedApplyAction).toHaveBeenCalled();
    expect(result.current.state).toBe(state);
  });

  it('re-renders with the new state when an action changes it', async () => {
    const { result } = await boot({ repository: new MemorySaveRepository(null), now: () => nowMs });
    const before = result.current.state;

    // A click always deals damage, producing a new state object.
    await act(async () => {
      result.current.onClick();
    });

    expect(result.current.state).not.toBe(before);
    expect(result.current.state?.combat.enemyHp).toBeLessThan(before?.combat.enemyHp ?? 0);
  });
});

describe('autosave and AppState lifecycle', () => {
  it('persists a fresh game immediately on boot', async () => {
    const repository = new MemorySaveRepository(null);
    await boot({ repository, now: () => nowMs });

    expect(repository.saves.length).toBe(1);
    expect(repository.lastSave()?.version).toBe(4);
  });

  it('autosaves on the 5 s cadence, not before', async () => {
    const repository = new MemorySaveRepository(null);
    await boot({ repository, now: () => nowMs });
    await settle(); // let the boot save settle so `saveInFlight` clears
    const afterBoot = repository.saves.length;

    // Just under 5 s: no autosave.
    await stepTicks(Math.floor(AUTOSAVE_INTERVAL_MS / STEP_MS) - 1);
    expect(repository.saves.length).toBe(afterBoot);

    // Crossing 5 s fires exactly one autosave.
    await stepTicks(1);
    expect(repository.saves.length).toBe(afterBoot + 1);
  });

  it('does not start an overlapping save while one is in flight', async () => {
    const repository = new GatedSaveRepository();
    await boot({ repository, now: () => nowMs });
    // Boot save is gated. Release it so the first autosave can fire.
    await act(async () => repository.releaseOne());
    await settle();
    const afterBoot = repository.saves.length;

    // First autosave at 5 s is gated (in flight).
    await stepTicks(Math.ceil(AUTOSAVE_INTERVAL_MS / STEP_MS));
    expect(repository.saves.length).toBe(afterBoot + 1);

    // Second cadence elapses while the save is still in flight: no new save.
    await stepTicks(Math.ceil(AUTOSAVE_INTERVAL_MS / STEP_MS));
    expect(repository.saves.length).toBe(afterBoot + 1);

    await act(async () => repository.releaseOne());
    await settle();
    expect(repository.saves.length).toBe(afterBoot + 1);
  });

  it('flushes the save when the app leaves the active state', async () => {
    const repository = new MemorySaveRepository(null);
    await boot({ repository, now: () => nowMs });
    await settle();
    const afterBoot = repository.saves.length;

    expect(appStateListener).not.toBeNull();
    await act(async () => {
      appStateListener?.('background');
    });

    expect(repository.saves.length).toBe(afterBoot + 1);
  });

  it('does not count background time as a catch-up delta on resume', async () => {
    const { result } = await boot({ repository: new MemorySaveRepository(null), now: () => nowMs });
    // Anchor the live clock, then one real step.
    await stepTicks(1);
    await stepTicks(1);
    const before = result.current.state?.meta.totalPlayedMs ?? -1;

    await act(async () => {
      appStateListener?.('background');
    });
    // An hour passes while backgrounded; timers do not run.
    nowMs += 60 * 60 * 1000;
    await act(async () => {
      appStateListener?.('active');
    });

    // Resume anchors a fresh clock, then ticks one whole step — not an hour.
    await stepTicks(1);
    expect(result.current.state?.meta.totalPlayedMs).toBe(before);
    await stepTicks(1);
    expect(result.current.state?.meta.totalPlayedMs).toBe(before + STEP_MS);
  });
});
