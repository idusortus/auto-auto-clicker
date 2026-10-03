import AsyncStorage from '@react-native-async-storage/async-storage';
import { createGame, saveGame } from '@auto-auto-clicker/engine-core';
import { DEFAULT_SAVE_KEY } from '@auto-auto-clicker/engine-core/save';

import { AsyncStorageSaveRepository } from './saveRepository';

// `jest.setup.js` swaps the native module for the official in-memory mock, so
// this suite exercises the real adapter against the real mock implementation.
beforeEach(async () => {
  await AsyncStorage.removeItem(DEFAULT_SAVE_KEY);
});

describe('AsyncStorageSaveRepository', () => {
  it('round-trips a save through AsyncStorage under the default key', async () => {
    const repository = new AsyncStorageSaveRepository();
    const save = saveGame(createGame(4242, 111), 222);

    await repository.save(save);

    expect(await repository.load()).toEqual(save);
    // The blob lands under the engine's canonical key.
    expect(await AsyncStorage.getItem(DEFAULT_SAVE_KEY)).not.toBeNull();
  });

  it('resolves null when no save has been written', async () => {
    const repository = new AsyncStorageSaveRepository();
    expect(await repository.load()).toBeNull();
  });

  it('resolves null when the stored blob is corrupt JSON', async () => {
    await AsyncStorage.setItem(DEFAULT_SAVE_KEY, '{not valid json');
    const repository = new AsyncStorageSaveRepository();
    expect(await repository.load()).toBeNull();
  });

  it('honours a custom key', async () => {
    const repository = new AsyncStorageSaveRepository('custom.save.key');
    const save = saveGame(createGame(7, 0), 9);

    await repository.save(save);
    expect(await repository.load()).toEqual(save);
    // The default key is untouched.
    expect(await AsyncStorage.getItem(DEFAULT_SAVE_KEY)).toBeNull();
  });
});
