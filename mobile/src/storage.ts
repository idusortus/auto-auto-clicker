// storage.ts — persistence and offline-time helpers for the React Native host.
//
// This module owns the only reads of the wall clock that relate to saving. It
// talks to the engine's SaveRepository and wraps/unwraps the versioned save
// blob through engine-core's saveGame/loadGame. It holds no gameplay rules and
// never mutates engine state directly.

import { loadGame, saveGame } from '@auto-auto-clicker/engine-core';
import type { GameState, SaveGame, SaveRepository } from '@auto-auto-clicker/engine-core';

import { AsyncStorageSaveRepository } from './saveRepository';

/**
 * Host loop parameter (not a balance number): the maximum amount of time away
 * that the host is willing to replay on boot.
 */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;

/**
 * Host loop parameter (not a balance number): the fixed step used to replay
 * offline time through `advance`.
 */
export const OFFLINE_STEP_MS = 1000;

/** The single repository instance the app reads and writes saves through. */
export const saveRepository: SaveRepository = new AsyncStorageSaveRepository();

/** Resolve the stored save, or null when none exists / the store is unusable. */
export async function loadSave(
  repository: SaveRepository = saveRepository,
): Promise<SaveGame | null> {
  try {
    return await repository.load();
  } catch (error) {
    console.error('[aac] failed to load save; continuing without one', error);
    return null;
  }
}

/** Wrap the current state in a versioned save blob and persist it. */
export async function persistState(
  state: GameState,
  now: number,
  repository: SaveRepository = saveRepository,
): Promise<void> {
  await repository.save(saveGame(state, now));
}

/** Validate and hydrate a save blob, throwing when the version is unsupported. */
export function hydrate(save: SaveGame): GameState {
  return loadGame(save);
}

/**
 * Milliseconds elapsed since the save was written, clamped to the offline cap
 * (and to zero). Non-finite timestamps are treated as "no time passed".
 */
export function offlineElapsedMs(savedAt: number, now: number): number {
  if (!Number.isFinite(savedAt) || !Number.isFinite(now)) return 0;
  const elapsed = now - savedAt;
  if (elapsed <= 0) return 0;
  return Math.min(elapsed, OFFLINE_CAP_MS);
}
