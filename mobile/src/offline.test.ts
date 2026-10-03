import { advance, createGame } from '@auto-auto-clicker/engine-core';
import type { GameState } from '@auto-auto-clicker/engine-core';

import { replayOffline } from './offline';
import { OFFLINE_STEP_MS } from './storage';

// Wrap the real `advance` in a jest mock so the suite can prove it is the
// single engine entry point used for replay and that its events are discarded.
jest.mock('@auto-auto-clicker/engine-core', () => {
  const actual = jest.requireActual('@auto-auto-clicker/engine-core');
  return { ...actual, advance: jest.fn(actual.advance) };
});

const mockedAdvance = advance as jest.MockedFunction<typeof advance>;
const realAdvance = jest.requireActual('@auto-auto-clicker/engine-core').advance as typeof advance;

beforeEach(() => {
  mockedAdvance.mockReset();
  mockedAdvance.mockImplementation(realAdvance);
});

/** Deep-clone a state, then force a pending choice on the clone. */
function withPendingChoice(state: GameState): GameState {
  const clone = JSON.parse(JSON.stringify(state)) as GameState;
  clone.choices.pending = { kind: 'boss-check', stage: clone.combat.stage, options: ['wait', 'watchAd', 'iap'] };
  return clone;
}

describe('replayOffline', () => {
  it('returns the state unchanged for zero or negative elapsed time', () => {
    const state = createGame(1, 0);
    for (const elapsed of [0, -100]) {
      const result = replayOffline(state, elapsed);
      expect(result.state).toBe(state);
      expect(result.simulatedMs).toBe(0);
      expect(result.goldEarned).toBe(0);
    }
    expect(mockedAdvance).not.toHaveBeenCalled();
  });

  it('replays in 1000 ms steps and accumulates simulated time', () => {
    const state = createGame(1, 0);
    const result = replayOffline(state, 5 * OFFLINE_STEP_MS);

    expect(OFFLINE_STEP_MS).toBe(1000);
    expect(result.simulatedMs).toBe(5 * OFFLINE_STEP_MS);
    expect(mockedAdvance).toHaveBeenCalledTimes(5);
    for (const call of mockedAdvance.mock.calls) {
      expect(call[1]).toBe(OFFLINE_STEP_MS);
    }
    // Time actually moved in the returned state.
    expect(result.state.meta.totalPlayedMs).toBe(5 * OFFLINE_STEP_MS);
  });

  it('replays a partial final step', () => {
    const state = createGame(1, 0);
    const result = replayOffline(state, 2500);
    expect(result.simulatedMs).toBe(2500);
    expect(result.state.meta.totalPlayedMs).toBe(2500);
  });

  it('stops immediately when a choice is already pending', () => {
    const state = withPendingChoice(createGame(1, 0));
    const result = replayOffline(state, 60_000);

    expect(result.state).toBe(state);
    expect(result.simulatedMs).toBe(0);
    expect(mockedAdvance).not.toHaveBeenCalled();
  });

  it('stops at the step where a pending choice appears', () => {
    // Force the engine to hand back a pending-choice state on the second step so
    // the loop exits before consuming the remaining elapsed time.
    const start = createGame(1, 0);
    let calls = 0;
    mockedAdvance.mockImplementation((state, deltaMs) => {
      calls += 1;
      if (calls === 2) return { state: withPendingChoice(state), events: [] };
      return realAdvance(state, deltaMs);
    });

    const result = replayOffline(start, 10 * OFFLINE_STEP_MS);

    expect(calls).toBe(2);
    expect(result.simulatedMs).toBe(2 * OFFLINE_STEP_MS);
    expect(result.state.choices.pending).not.toBeNull();
  });

  it('breaks when advance returns an unchanged state', () => {
    const start = createGame(1, 0);
    mockedAdvance.mockImplementation(() => ({ state: start, events: [] }));

    const result = replayOffline(start, 10 * OFFLINE_STEP_MS);

    expect(mockedAdvance).toHaveBeenCalledTimes(1);
    expect(result.state).toBe(start);
    expect(result.simulatedMs).toBe(0);
  });

  it('serves no clicks and discards the engine events it produces', () => {
    const start = createGame(1, 0);
    const result = replayOffline(start, 60 * OFFLINE_STEP_MS);

    // The replay ran through advance and the engine did emit events...
    expect(mockedAdvance).toHaveBeenCalled();
    const emittedEvents = mockedAdvance.mock.results.flatMap((entry) => entry.value.events);
    expect(emittedEvents.length).toBeGreaterThan(0);

    // ...but the replay result carries only state/time/gold — no events.
    expect(result).toEqual({
      state: expect.anything(),
      simulatedMs: expect.any(Number),
      goldEarned: expect.any(Number),
    });
    expect('events' in result).toBe(false);
  });
});
