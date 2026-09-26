// rng.ts — deterministic mulberry32.
//
// RNG state travels inside GameState.meta.rngState. There is no global mutable
// generator and no Math.random anywhere in the engine.

export interface RngStep {
  /** Uniform value in [0, 1). */
  value: number;
  /** Next generator state to thread back into GameState.meta.rngState. */
  state: number;
}

/** Advance the mulberry32 generator one step and return the value plus next state. */
export function nextRng(state: number): RngStep {
  const nextState = (state + 0x6d2b79f5) | 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: nextState };
}
