import { afterEach, describe, expect, it } from 'vitest';
import { advance, createGame, loadGame, saveGame } from '../src/index';
import { LocalStorageSaveRepository } from '../save/index';
import type { SaveGame } from '../src/types';

describe('save serialization', () => {
  it('round-trips createGame -> saveGame -> loadGame identically', () => {
    // Play a little so rngState, gold, carry, and totals are non-trivial.
    const state = advance(createGame(987654321, 111), 200_000).state;
    const save = saveGame(state, 222);

    expect(save.version).toBe(1);
    expect(save.savedAt).toBe(222);

    const loaded = loadGame(save);
    expect(loaded).toEqual(state);
    expect(loaded.meta.rngState).toBe(state.meta.rngState);

    // Survives JSON transport (localStorage / Supabase jsonb).
    const transported = JSON.parse(JSON.stringify(save)) as SaveGame;
    expect(loadGame(transported)).toEqual(state);
  });

  it('throws on unsupported save versions', () => {
    const state = createGame(1, 0);
    expect(() => loadGame({ version: 2, savedAt: 0, state })).toThrow(/Unsupported save version/);
    expect(() => loadGame({ version: 0, savedAt: 0, state })).toThrow(/Unsupported save version/);
  });

  it('throws a descriptive error for a valid version with a missing or invalid state', () => {
    const nullState = { version: 1, savedAt: 0, state: null } as unknown as SaveGame;
    expect(() => loadGame(nullState)).toThrow(/version 1 has a missing or invalid state/);

    const missingState = { version: 1, savedAt: 0 } as unknown as SaveGame;
    expect(() => loadGame(missingState)).toThrow(/version 1 has a missing or invalid state/);

    const arrayState = { version: 1, savedAt: 0, state: [] } as unknown as SaveGame;
    expect(() => loadGame(arrayState)).toThrow(/version 1 has a missing or invalid state/);
  });
});

describe('LocalStorageSaveRepository', () => {
  const globals = globalThis as { localStorage?: unknown };
  const original = globals.localStorage;

  afterEach(() => {
    if (original === undefined) delete globals.localStorage;
    else globals.localStorage = original;
  });

  it('round-trips through an injected localStorage', async () => {
    const store = new Map<string, string>();
    globals.localStorage = {
      getItem: (key: string) => (store.has(key) ? store.get(key) ?? null : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };

    const repo = new LocalStorageSaveRepository('unit.test.key');
    expect(await repo.load()).toBeNull();

    const save = saveGame(createGame(5, 0), 7);
    await repo.save(save);
    expect(await repo.load()).toEqual(save);
  });

  it('resolves null when storage is missing and rejects on save', async () => {
    delete globals.localStorage;

    const repo = new LocalStorageSaveRepository();
    expect(await repo.load()).toBeNull();
    await expect(repo.save(saveGame(createGame(5, 0)))).rejects.toThrow(
      /localStorage is not available/,
    );
  });
});
