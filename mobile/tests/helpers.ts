// helpers.ts — shared fakes for the RN host tests.
//
// Not a test file (excluded from `testMatch`); imported by `*.test.ts` suites.

import type { SaveGame, SaveRepository } from '@auto-auto-clicker/engine-core';

/** An in-memory SaveRepository double that records every write. */
export class MemorySaveRepository implements SaveRepository {
  /** Every blob written through `save`, in order. */
  readonly saves: SaveGame[] = [];
  /** Optional forced result for `load` (e.g. a structurally invalid blob). */
  private stored: SaveGame | null;

  constructor(initial: SaveGame | null = null) {
    this.stored = initial;
  }

  async load(): Promise<SaveGame | null> {
    return this.stored;
  }

  async save(save: SaveGame): Promise<void> {
    this.stored = save;
    this.saves.push(save);
  }

  /** The most recently written blob, or null when nothing has been saved. */
  lastSave(): SaveGame | null {
    return this.saves.length > 0 ? this.saves[this.saves.length - 1] ?? null : null;
  }
}

/** A repository whose `load` rejects, exercising the storage error path. */
export class ThrowingSaveRepository implements SaveRepository {
  async load(): Promise<SaveGame | null> {
    throw new Error('storage unavailable');
  }

  async save(): Promise<void> {
    throw new Error('storage unavailable');
  }
}

/** A repository whose `save` never resolves until explicitly released. */
export class GatedSaveRepository implements SaveRepository {
  readonly saves: SaveGame[] = [];
  private pending: Array<() => void> = [];

  async load(): Promise<SaveGame | null> {
    return null;
  }

  save(save: SaveGame): Promise<void> {
    this.saves.push(save);
    return new Promise<void>((resolve) => {
      this.pending.push(resolve);
    });
  }

  /** Resolve the oldest in-flight save, if any. */
  releaseOne(): void {
    const resolve = this.pending.shift();
    resolve?.();
  }
}

/** Flush pending microtasks so an async boot effect can resolve under test. */
export async function flushMicrotasks(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

/**
 * A timer seam whose single scheduled handler is invoked manually, so tests can
 * drive the host ticker deterministically without Jest fake timers (which
 * deadlock React 19's async `act` in this environment).
 */
export class ManualScheduler {
  private handler: (() => void) | null = null;
  private readonly handles = new Set<symbol>();
  /** The interval (ms) passed to the most recent `setInterval` call, or null. */
  private lastIntervalMs: number | null = null;

  setInterval(handler: () => void, intervalMs: number): unknown {
    this.handler = handler;
    this.lastIntervalMs = intervalMs;
    const handle = Symbol('interval');
    this.handles.add(handle);
    return handle;
  }

  clearInterval(handle: unknown): void {
    if (handle === undefined) return;
    this.handles.delete(handle as symbol);
    // Only one ticker is ever scheduled; clear it.
    this.handler = null;
  }

  /** Run the scheduled ticker once. */
  tick(times = 1): void {
    for (let i = 0; i < times; i += 1) {
      this.handler?.();
    }
  }

  /** Whether a ticker is currently scheduled. */
  get scheduled(): boolean {
    return this.handler !== null;
  }

  /** The interval (ms) the ticker was registered with, or null when none was scheduled. */
  get intervalMs(): number | null {
    return this.lastIntervalMs;
  }
}
