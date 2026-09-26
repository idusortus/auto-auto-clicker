// repository.ts — persistence contract for the versioned SaveGame blob.
//
// Asynchronous by design so a future remote adapter (e.g. Supabase) can be
// dropped in without changing engine-core. No network code lives here.

import type { SaveGame } from '../src/types';

export interface SaveRepository {
  /** Resolve the stored save, or null when none exists. */
  load(): Promise<SaveGame | null>;
  /** Persist the save, overwriting any previous value. */
  save(save: SaveGame): Promise<void>;
}
