// localStorage.ts — browser-local SaveRepository adapter.
//
// Reads localStorage structurally through globalThis so the engine tsconfig
// needs no DOM lib. When localStorage is unavailable (headless/node), load()
// resolves null and save() rejects with a clear error.

import type { SaveGame } from '../src/types';
import type { SaveRepository } from './repository';

/** Minimal structural shape of the browser Storage API the adapter needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_SAVE_KEY = 'auto-auto-clicker.save.v1';

export class LocalStorageSaveRepository implements SaveRepository {
  private readonly key: string;

  constructor(key: string = DEFAULT_SAVE_KEY) {
    this.key = key;
  }

  private storage(): StorageLike | undefined {
    return (globalThis as { localStorage?: StorageLike }).localStorage;
  }

  async load(): Promise<SaveGame | null> {
    const storage = this.storage();
    if (!storage) return null;

    const raw = storage.getItem(this.key);
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as SaveGame;
    } catch {
      return null;
    }
  }

  async save(save: SaveGame): Promise<void> {
    const storage = this.storage();
    if (!storage) {
      throw new Error('localStorage is not available; cannot persist the save.');
    }
    storage.setItem(this.key, JSON.stringify(save));
  }
}
