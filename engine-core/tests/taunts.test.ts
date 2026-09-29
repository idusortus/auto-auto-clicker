// taunts.test.ts — F3: the taunt channel is deterministic and RNG-isolated.
//
// The load-bearing property: taunts NEVER touch `meta.rngState`. Taunt rolls are
// derived only from `(seed, totalPlayedMs, discriminator)`, so the loot stream is
// untouched and `npm run sim` stays byte-identical (verified separately). These
// tests prove isolation directly (frozen-state, rngState-independence, zero-draw
// tick) rather than trusting the sim diff alone.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { advance, enemyForStage, TAUNT_NOMINAL_PHRASES } from '../src/index';
import { ambientTaunt, makeTaunt, tauntRoll } from '../src/taunts';
import { deepFreeze, makeState } from './helpers';
import type { GameState } from '../src/types';

/** A state that cannot kill or spawn a Shiny in one 100 ms tick. */
function quietState(overrides: Partial<Parameters<typeof makeState>[0]> = {}): GameState {
  return makeState({
    stage: 4,
    enemyHp: Number.MAX_SAFE_INTEGER,
    nextSpawnAtMs: Number.MAX_SAFE_INTEGER,
    totalPlayedMs: 44_950,
    ...overrides,
  });
}

describe('taunt channel — determinism', () => {
  it('is deterministic for the same seed + totalPlayedMs + discriminator', () => {
    const a = makeState({ seed: 12345, totalPlayedMs: 90_000, stage: 5 });
    const b = makeState({ seed: 12345, totalPlayedMs: 90_000, stage: 5 });
    for (let discriminator = 0; discriminator < 50; discriminator += 1) {
      expect(tauntRoll(a, discriminator)).toBe(tauntRoll(b, discriminator));
    }

    for (let stage = 1; stage <= 20; stage += 1) {
      const first = makeState({ seed: 999, totalPlayedMs: stage * 1000, stage });
      const second = makeState({ seed: 999, totalPlayedMs: stage * 1000, stage });
      const enemyId = enemyForStage(stage).id;
      expect(makeTaunt(first, 'defeat', enemyId, stage, 1)).toEqual(
        makeTaunt(second, 'defeat', enemyId, stage, 1),
      );
    }
  });

  it('rejects a non-positive chance and accepts a certain one', () => {
    const state = quietState();
    expect(makeTaunt(state, 'defeat', 'grunt', 1, 0)).toBeNull();
    expect(makeTaunt(state, 'defeat', 'grunt', 1, 1)).not.toBeNull();
  });
});

describe('taunt channel — isolation from meta.rngState', () => {
  it('derives the same rolls regardless of meta.rngState', () => {
    const base = makeState({ seed: 42, totalPlayedMs: 12_345, stage: 3, rngState: 0 });
    const shifted = makeState({
      seed: 42,
      totalPlayedMs: 12_345,
      stage: 3,
      rngState: 0xdeadbeef,
    });
    for (let discriminator = 0; discriminator < 25; discriminator += 1) {
      expect(tauntRoll(base, discriminator)).toBe(tauntRoll(shifted, discriminator));
    }
    expect(makeTaunt(base, 'spawn', 'grunt', 1, 1)).toEqual(
      makeTaunt(shifted, 'spawn', 'grunt', 1, 1),
    );
  });

  it('never mutates a frozen state', () => {
    const state = deepFreeze(makeState({ seed: 7, totalPlayedMs: 46_000, stage: 4 }));
    const snapshot = JSON.stringify(state);

    tauntRoll(state, 1);
    makeTaunt(state, 'wall', 'slime', 5, 1);
    ambientTaunt(state, 45_000, enemyForStage(4).id);

    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('emits an ambient taunt across the interval boundary without consuming rngState', () => {
    const enemyId = enemyForStage(4).id;
    let preState: GameState | null = null;
    let expected: ReturnType<typeof ambientTaunt> = null;

    for (let seed = 1; seed <= 500 && preState === null; seed += 1) {
      const after = quietState({ seed, totalPlayedMs: 45_050 });
      const taunt = ambientTaunt(after, 44_950, enemyId);
      if (taunt !== null) {
        expected = taunt;
        preState = quietState({ seed });
      }
    }

    expect(expected, 'no seed produced an ambient taunt in 500 tries').not.toBeNull();
    expect(preState).not.toBeNull();
    if (preState === null) return;

    const rngBefore = preState.meta.rngState;
    const { state: after, events } = advance(preState, 100);

    // The crossing emitted a taunt, yet the loot stream is untouched.
    expect(events).toContainEqual(expected);
    expect(after.meta.rngState).toBe(rngBefore);
    expect(events.some((event) => event.type === 'enemyKilled')).toBe(false);
    expect(events.some((event) => event.type === 'eventSpawned')).toBe(false);
  });
});

describe('taunt channel — event shape', () => {
  it('carries stable identity + a bounded phraseIndex, never display text', () => {
    for (let stage = 1; stage <= 30; stage += 1) {
      for (let discriminator = 0; discriminator < 40; discriminator += 1) {
        const state = makeState({ seed: 1000 + discriminator, totalPlayedMs: discriminator * 137, stage });
        const event = makeTaunt(state, 'defeat', enemyForStage(stage).id, stage, 1, discriminator);
        expect(event, `stage ${stage}`).not.toBeNull();
        if (event === null) continue;
        expect(Number.isInteger(event.phraseIndex)).toBe(true);
        expect(event.phraseIndex).toBeGreaterThanOrEqual(0);
        expect(event.phraseIndex).toBeLessThan(TAUNT_NOMINAL_PHRASES);
        expect(Object.keys(event).sort()).toEqual(['enemyId', 'kind', 'phraseIndex', 'type']);
      }
    }
  });

  it('echoes the engine-owned enemy id and semantic kind', () => {
    const state = makeState({ seed: 1, totalPlayedMs: 0, stage: 2 });
    const event = makeTaunt(state, 'bossDefeat', 'golem', 20, 1);
    expect(event).not.toBeNull();
    expect(event?.enemyId).toBe('golem');
    expect(event?.kind).toBe('bossDefeat');
  });
});

describe('taunts.ts purity', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/taunts.ts', import.meta.url)), 'utf8');
  const forbidden: readonly [string, RegExp][] = [
    ['Math.random', /Math\.random\s*\(/],
    ['Date.now', /Date\.now\s*\(/],
    ['performance.now', /performance\.now\s*\(/],
    ['setTimeout', /setTimeout\s*\(/],
    ['setInterval', /setInterval\s*\(/],
    ['fetch', /\bfetch\s*\(/],
    ['window', /\bwindow\b/],
    ['document', /\bdocument\b/],
    ['node io', /from\s+['"](?:node:)?(?:fs|path|os|child_process)['"]/],
  ];

  it('references no DOM, clock, timer, or IO', () => {
    for (const [name, pattern] of forbidden) {
      expect(pattern.test(source), `${name} found in taunts.ts`).toBe(false);
    }
  });
});
