// saveRepository.ts — React Native SaveRepository adapter backed by AsyncStorage.
//
// This is the RN analogue of engine-core's LocalStorageSaveRepository. It
// implements the engine's Promise-based SaveRepository contract exactly, so the
// engine is consumed unchanged. It owns persistence only: it holds no gameplay
// rules and no balance numbers.
//
// The storage backend is injectable so tests can pass the official AsyncStorage
// mock (or any structural double) without a native module; production code
// defaults to the real AsyncStorage export.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_SAVE_KEY } from '@auto-auto-clicker/engine-core/save';
import type { SaveGame, SaveRepository } from '@auto-auto-clicker/engine-core';

/**
 * Minimal structural surface of AsyncStorage this adapter uses. The real
 * AsyncStorage object satisfies it; keeping it structural lets tests inject the
 * official mock without depending on the full native module type.
 */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * AsyncStorage-backed SaveRepository.
 *
 * `load()` resolves the raw JSON under the save key and parses it, resolving
 * `null` when nothing is stored or the blob is not valid JSON (mirroring the
 * localStorage adapter). `save()` writes `JSON.stringify(save)` under the same
 * key.
 */
export class AsyncStorageSaveRepository implements SaveRepository {
  private readonly key: string;
  private readonly storage: KeyValueStorage;

  constructor(key: string = DEFAULT_SAVE_KEY, storage: KeyValueStorage = AsyncStorage) {
    this.key = key;
    this.storage = storage;
  }

  async load(): Promise<SaveGame | null> {
    const raw = await this.storage.getItem(this.key);
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as SaveGame;
    } catch {
      return null;
    }
  }

  async save(save: SaveGame): Promise<void> {
    await this.storage.setItem(this.key, JSON.stringify(save));
  }
}
