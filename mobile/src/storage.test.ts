import { createGame, saveGame } from '@auto-auto-clicker/engine-core';
import type { GameState, SaveGame } from '@auto-auto-clicker/engine-core';

import { OFFLINE_CAP_MS, hydrate, loadSave, offlineElapsedMs, persistState } from './storage';
import { MemorySaveRepository, ThrowingSaveRepository } from '../tests/helpers';

describe('offlineElapsedMs', () => {
  it('returns zero when the save timestamp is not finite', () => {
    expect(offlineElapsedMs(Number.NaN, 1000)).toBe(0);
    expect(offlineElapsedMs(1000, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('returns zero for a save from the future', () => {
    expect(offlineElapsedMs(2000, 1000)).toBe(0);
  });

  it('returns the raw elapsed time when under the cap', () => {
    expect(offlineElapsedMs(1000, 4000)).toBe(3000);
  });

  it('caps the elapsed time at 8 hours', () => {
    const tenHours = 10 * 60 * 60 * 1000;
    expect(offlineElapsedMs(0, tenHours)).toBe(OFFLINE_CAP_MS);
    expect(OFFLINE_CAP_MS).toBe(8 * 60 * 60 * 1000);
  });
});

describe('loadSave', () => {
  it('resolves null when the repository has no save', async () => {
    const repository = new MemorySaveRepository(null);
    expect(await loadSave(repository)).toBeNull();
  });

  it('returns a valid save unchanged', async () => {
    const save = saveGame(createGame(1, 0), 5);
    const repository = new MemorySaveRepository(save);
    expect(await loadSave(repository)).toEqual(save);
  });

  it('resolves null when the repository throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const loaded = await loadSave(new ThrowingSaveRepository());
    expect(loaded).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('persistState', () => {
  it('wraps the state in a versioned blob with the given timestamp', async () => {
    const repository = new MemorySaveRepository(null);
    const state = createGame(3, 0);

    await persistState(state, 1234, repository);

    const save = repository.lastSave();
    expect(save).not.toBeNull();
    expect((save as SaveGame).version).toBe(4);
    expect((save as SaveGame).savedAt).toBe(1234);
  });

  it('round-trips: persist then hydrate yields an equal state', async () => {
    const repository = new MemorySaveRepository(null);
    const state = createGame(99, 0);

    await persistState(state, 1, repository);
    const save = repository.lastSave();
    expect(save).not.toBeNull();
    expect(hydrate(save as SaveGame)).toEqual(state);
  });
});

describe('hydrate', () => {
  it('returns the state for a valid save', () => {
    const state: GameState = createGame(11, 0);
    expect(hydrate(saveGame(state))).toEqual(state);
  });

  it('throws for an unsupported save version', () => {
    const bad = { version: 5, savedAt: 0, state: createGame(11, 0) } as unknown as SaveGame;
    expect(() => hydrate(bad)).toThrow(/Unsupported save version 5/);
  });
});
