// sim — headless pacing harness for the engine tick loop. No rendering, no UI.
//
// Drives `advance`/`applyAction` with a fixed 100 ms step and a 2-clicks/sec
// active player, greedily buying weapon upgrades and equipping better drops.
// Asserts the pacing targets:
//   - soft boss check lands 6.0 min  (±20% → [4.8, 7.2])
//   - hard progression wall 54.0 min (±20% → [43.2, 64.8])
//
// Exit code 1 when the canonical seed misses a target, 0 otherwise. Sweep
// seeds are informational only and never fail the process.

import {
  ACTIVE_CLICKS_PER_SECOND,
  advance,
  applyAction,
  createGame,
  getEffectiveStats,
  getUpgradeCost,
} from '@auto-auto-clicker/engine-core';
import type { GameEvent, GameState, GearInstance } from '@auto-auto-clicker/engine-core';

const STEP_MS = 100;
const CLICK_INTERVAL_MS = 1000 / ACTIVE_CLICKS_PER_SECOND; // 500 ms → 2 clicks/sec
const MAX_SIM_MS = 2 * 60 * 60 * 1000;

const CANONICAL_SEED = 12345;
const SWEEP_SEEDS = [CANONICAL_SEED, 1, 999, 424242, 20250925];

const SOFT_TARGET_MS = 6 * 60 * 1000;
const HARD_TARGET_MS = 54 * 60 * 1000;
const TOLERANCE = 0.2;

interface Milestone {
  ms: number;
  stage: number;
  autoDps: number;
  clickDamage: number;
  projectedKillMs: number | null;
}

interface SimRecord {
  soft: Milestone | null;
  hard: Milestone | null;
}

interface SimResult {
  seed: number;
  totalMs: number;
  start: Milestone;
  soft: Milestone | null;
  hard: Milestone | null;
}

function milestone(state: GameState, ms: number, projectedKillMs: number | null): Milestone {
  const stats = getEffectiveStats(state);
  return {
    ms,
    stage: state.combat.stage,
    autoDps: stats.autoDps,
    clickDamage: stats.clickDamage,
    projectedKillMs,
  };
}

/** Record the first boss-check failure and the first progression wall. */
function processEvents(
  events: GameEvent[],
  atMs: number,
  state: GameState,
  record: SimRecord,
): void {
  for (const event of events) {
    if (event.type === 'bossCheckFailed' && record.soft === null) {
      record.soft = milestone(state, atMs, event.projectedKillMs);
    }
    if (event.type === 'progressionWall' && record.hard === null) {
      record.hard = milestone(state, atMs, event.projectedKillMs);
    }
  }
}

/**
 * Greedy economy: spend every affordable upgrade on the equipped weapon, then
 * equip the highest-itemLevel bag weapon when it is strictly better.
 */
function runEconomy(state: GameState): GameState {
  let next = state;

  for (;;) {
    const cost = getUpgradeCost(next, 'weapon');
    if (cost === null || next.player.gold < cost) break;
    const upgraded = applyAction(next, { type: 'upgradeEquipped', slot: 'weapon' });
    if (upgraded.state === next) break;
    next = upgraded.state;
  }

  const equipped = next.gear.equipped.weapon;
  let best: GearInstance | null = null;
  for (const item of next.gear.bag) {
    if (best === null || item.itemLevel > best.itemLevel) best = item;
  }

  if (best !== null && (equipped === null || best.itemLevel > equipped.itemLevel)) {
    const swapped = applyAction(next, { type: 'equip', instanceId: best.id });
    if (swapped.state !== next) next = swapped.state;
  }

  return next;
}

function runSim(seed: number): SimResult {
  const initial = createGame(seed, 0);
  const record: SimRecord = { soft: null, hard: null };
  const start = milestone(initial, 0, null);

  let state = initial;
  let totalMs = 0;
  let clickAcc = 0;

  while (totalMs < MAX_SIM_MS && record.hard === null) {
    const tick = advance(state, STEP_MS);
    state = tick.state;
    totalMs += STEP_MS;
    processEvents(tick.events, totalMs, state, record);

    clickAcc += STEP_MS;
    if (clickAcc >= CLICK_INTERVAL_MS) {
      clickAcc -= CLICK_INTERVAL_MS;
      const clicked = applyAction(state, { type: 'click' });
      state = clicked.state;
      processEvents(clicked.events, totalMs, state, record);
    }

    if (record.hard !== null) break;

    if (state.choices.pending) {
      const resolved = applyAction(state, { type: 'resolveChoice', choice: 'wait' });
      state = resolved.state;
      processEvents(resolved.events, totalMs, state, record);
    }

    state = runEconomy(state);
  }

  return { seed, totalMs, start, soft: record.soft, hard: record.hard };
}

function toMinutes(ms: number): number {
  return ms / 60000;
}

function formatMinutes(ms: number): string {
  return toMinutes(ms).toFixed(2);
}

function deltaPercent(actualMs: number, targetMs: number): number {
  return ((actualMs - targetMs) / targetMs) * 100;
}

function formatDelta(actualMs: number, targetMs: number): string {
  const delta = deltaPercent(actualMs, targetMs);
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

function withinTolerance(actualMs: number | null, targetMs: number): boolean {
  if (actualMs === null) return false;
  const ratio = actualMs / targetMs;
  return ratio >= 1 - TOLERANCE && ratio <= 1 + TOLERANCE;
}

function milestoneLine(label: string, m: Milestone | null): string {
  if (m === null) return `  ${label.padEnd(12)} not reached within ${formatMinutes(MAX_SIM_MS)} min`;
  const projected = m.projectedKillMs === null ? '' : `  projected=${m.projectedKillMs}ms`;
  return (
    `  ${label.padEnd(12)} t=${formatMinutes(m.ms).padStart(7)}min  ` +
    `stage=${String(m.stage).padStart(3)}  autoDps=${String(m.autoDps).padStart(6)}  ` +
    `clickDamage=${String(m.clickDamage).padStart(6)}${projected}`
  );
}

function targetLine(label: string, targetMs: number, actual: Milestone | null): string {
  if (actual === null) {
    return (
      `${label} ${formatMinutes(targetMs)} min target ±20% → actual not reached ` +
      `within ${formatMinutes(MAX_SIM_MS)} min  [FAIL]`
    );
  }
  const pass = withinTolerance(actual.ms, targetMs) ? 'PASS' : 'FAIL';
  return (
    `${label} ${formatMinutes(targetMs)} min target ±20% → actual ` +
    `${formatMinutes(actual.ms)} min (delta ${formatDelta(actual.ms, targetMs)})  [${pass}]`
  );
}

function main(): void {
  console.log('=== auto-auto-clicker pacing sim ===');
  console.log(
    `canonical seed=${CANONICAL_SEED}  step=${STEP_MS}ms  click=${CLICK_INTERVAL_MS}ms  ` +
      `max=${formatMinutes(MAX_SIM_MS)}min`,
  );
  console.log('');

  const canonical = runSim(CANONICAL_SEED);

  console.log('milestones (canonical seed)');
  console.log(milestoneLine('start', canonical.start));
  console.log(milestoneLine('soft check', canonical.soft));
  console.log(milestoneLine('hard wall', canonical.hard));
  console.log('');

  const softPass = withinTolerance(canonical.soft?.ms ?? null, SOFT_TARGET_MS);
  const hardPass = withinTolerance(canonical.hard?.ms ?? null, HARD_TARGET_MS);

  console.log('targets (canonical seed)');
  console.log(targetLine('soft', SOFT_TARGET_MS, canonical.soft));
  console.log(targetLine('hard', HARD_TARGET_MS, canonical.hard));
  console.log('');

  console.log('seed sweep (canonical seed is the hard assertion; others informational)');
  for (const seed of SWEEP_SEEDS) {
    const result = seed === CANONICAL_SEED ? canonical : runSim(seed);
    const softText = result.soft === null ? 'not reached' : `${formatMinutes(result.soft.ms)} min`;
    const hardText = result.hard === null ? 'not reached' : `${formatMinutes(result.hard.ms)} min`;
    const marker = seed === CANONICAL_SEED ? '*' : ' ';
    console.log(` ${marker} seed ${String(seed).padEnd(9)} soft ${softText.padStart(11)}  hard ${hardText.padStart(11)}`);

    if (seed !== CANONICAL_SEED) {
      if (result.soft !== null && !withinTolerance(result.soft.ms, SOFT_TARGET_MS)) {
        console.log(
          `   WARNING seed ${seed} soft ${formatMinutes(result.soft.ms)} min ` +
            `(delta ${formatDelta(result.soft.ms, SOFT_TARGET_MS)}) outside ±20%`,
        );
      }
      if (result.hard !== null && !withinTolerance(result.hard.ms, HARD_TARGET_MS)) {
        console.log(
          `   WARNING seed ${seed} hard ${formatMinutes(result.hard.ms)} min ` +
            `(delta ${formatDelta(result.hard.ms, HARD_TARGET_MS)}) outside ±20%`,
        );
      }
    }
  }
  console.log('');

  if (softPass && hardPass) {
    console.log('PACING OK');
    process.exitCode = 0;
  } else {
    console.log('PACING FAILED');
    console.log(
      `  soft target ${formatMinutes(SOFT_TARGET_MS)} min: ` +
        (softPass ? 'PASS' : `FAIL (actual ${canonical.soft === null ? 'not reached' : formatMinutes(canonical.soft.ms) + ' min'})`),
    );
    console.log(
      `  hard target ${formatMinutes(HARD_TARGET_MS)} min: ` +
        (hardPass ? 'PASS' : `FAIL (actual ${canonical.hard === null ? 'not reached' : formatMinutes(canonical.hard.ms) + ' min'})`),
    );
    process.exitCode = 1;
  }
}

main();
