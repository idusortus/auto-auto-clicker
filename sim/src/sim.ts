// sim — headless pacing harness for the engine tick loop. No rendering, no UI.
//
// Drives `advance`/`applyAction` with a fixed 100 ms step and a 2-clicks/sec
// active player. The economy policy is greedy and deterministic:
//   1. buy weapon upgrades while affordable;
//   2. equip a bag weapon only when it strictly raises total active DPS
//      (auto DPS + ACTIVE_CLICKS_PER_SECOND * click damage).
// Step 2 deliberately replaces the old "swap on higher itemLevel" policy, which
// let a fresh level-0 drop reset the whole upgrade curve and made pacing a
// knife-edge function of drop RNG.
//
// Asserts the pacing targets for EVERY sweep seed (all are hard assertions):
//   - soft boss check lands 6.0 min  (±20% → [4.8, 7.2])
//   - hard progression wall 54.0 min (±20% → [43.2, 64.8])
// plus the design guards: soft is an early boss (stage <= 40), hard wall stage
// <= 90, the canonical seed is comfortably inside its targets, and no reported
// stat is Infinity/NaN. Exit code 1 when any seed misses any target.

import {
  ACTIVE_CLICKS_PER_SECOND,
  advance,
  applyAction,
  createGame,
  getEffectiveStats,
  getUpgradeCost,
  isBoss,
} from '@auto-auto-clicker/engine-core';
import type { GameEvent, GameState, GearInstance } from '@auto-auto-clicker/engine-core';

const STEP_MS = 100;
const CLICK_INTERVAL_MS = 1000 / ACTIVE_CLICKS_PER_SECOND; // 500 ms → 2 clicks/sec
const MAX_SIM_MS = 2 * 60 * 60 * 1000;
// Belt-and-braces guard: a mis-tuned economy can outpace enemy HP and clear
// thousands of stages in one tick. The acceptance rules cap the hard wall at
// stage 90, so anything past this is a failure by definition.
const MAX_SIM_STAGE = 400;
const MAX_ECONOMY_PASSES = 10_000;

const CANONICAL_SEED = 12345;
const SWEEP_SEEDS = [CANONICAL_SEED, 1, 999, 424242, 20250925];

const SOFT_TARGET_MS = 6 * 60 * 1000;
const HARD_TARGET_MS = 54 * 60 * 1000;
const TOLERANCE = 0.2;

// Design guards (not tolerance changes — additional structural requirements).
const SOFT_MAX_STAGE = 40;
const HARD_MAX_STAGE = 90;
const MAX_SOFT_AUTO_DPS = 1e10;
// Canonical must land comfortably inside, never on an edge.
const CANONICAL_SOFT_MS_RANGE: readonly [number, number] = [5.2 * 60 * 1000, 6.8 * 60 * 1000];
const CANONICAL_HARD_MS_RANGE: readonly [number, number] = [48 * 60 * 1000, 60 * 60 * 1000];

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

function totalActiveDps(state: GameState): number {
  const stats = getEffectiveStats(state);
  return stats.autoDps + ACTIVE_CLICKS_PER_SECOND * stats.clickDamage;
}

/** Total active DPS the player would have if `item` replaced the equipped weapon. */
function candidateActiveDps(state: GameState, item: GearInstance): number {
  const autoDps = state.player.baseAutoDps + item.dps;
  const clickDamage = state.player.baseClickDamage + item.clickDamage;
  return autoDps + ACTIVE_CLICKS_PER_SECOND * clickDamage;
}

/**
 * Greedy economy: buy every affordable upgrade, then equip the single bag
 * weapon that strictly raises total active DPS; repeat until neither action
 * changes the state. Equipping is DPS-based, so a level-0 drop never resets a
 * deeply upgraded weapon.
 */
function runEconomy(state: GameState): GameState {
  let next = state;

  for (let pass = 0; pass < MAX_ECONOMY_PASSES; pass += 1) {
    let changed = false;

    for (;;) {
      const cost = getUpgradeCost(next, 'weapon');
      if (cost === null || next.player.gold < cost) break;
      const upgraded = applyAction(next, { type: 'upgradeEquipped', slot: 'weapon' });
      if (upgraded.state === next) break;
      next = upgraded.state;
      changed = true;
    }

    const currentDps = totalActiveDps(next);
    let best: GearInstance | null = null;
    let bestDps = currentDps;
    for (const item of next.gear.bag) {
      const dps = candidateActiveDps(next, item);
      if (dps > bestDps) {
        bestDps = dps;
        best = item;
      }
    }

    if (best === null) break;
    const swapped = applyAction(next, { type: 'equip', instanceId: best.id });
    if (swapped.state === next) break;
    next = swapped.state;
    changed = true;

    if (!changed) break;
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

  while (totalMs < MAX_SIM_MS && record.hard === null && state.combat.stage <= MAX_SIM_STAGE) {
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

function isFiniteMilestone(m: Milestone | null): boolean {
  if (m === null) return false;
  return (
    Number.isFinite(m.ms) &&
    Number.isFinite(m.stage) &&
    Number.isFinite(m.autoDps) &&
    Number.isFinite(m.clickDamage) &&
    (m.projectedKillMs === null || Number.isFinite(m.projectedKillMs))
  );
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

interface SeedVerdict {
  seed: number;
  problems: string[];
}

/** Check all acceptance rules for one seed; return human-readable failures. */
function evaluateSeed(result: SimResult): SeedVerdict {
  const problems: string[] = [];
  const { soft, hard } = result;

  if (soft === null) {
    problems.push('soft check not reached');
  } else {
    if (!isFiniteMilestone(soft)) problems.push('soft milestone contains Infinity/NaN');
    if (!withinTolerance(soft.ms, SOFT_TARGET_MS)) {
      problems.push(`soft ${formatMinutes(soft.ms)} min (delta ${formatDelta(soft.ms, SOFT_TARGET_MS)})`);
    }
    if (!isBoss(soft.stage)) problems.push(`soft stage ${soft.stage} is not a boss`);
    if (soft.stage > SOFT_MAX_STAGE) problems.push(`soft stage ${soft.stage} > ${SOFT_MAX_STAGE}`);
    if (soft.autoDps > MAX_SOFT_AUTO_DPS) problems.push(`soft autoDps ${soft.autoDps} > ${MAX_SOFT_AUTO_DPS}`);
  }

  if (hard === null) {
    problems.push('hard wall not reached');
  } else {
    if (!isFiniteMilestone(hard)) problems.push('hard milestone contains Infinity/NaN');
    if (!withinTolerance(hard.ms, HARD_TARGET_MS)) {
      problems.push(`hard ${formatMinutes(hard.ms)} min (delta ${formatDelta(hard.ms, HARD_TARGET_MS)})`);
    }
    if (hard.stage > HARD_MAX_STAGE) problems.push(`hard stage ${hard.stage} > ${HARD_MAX_STAGE}`);
  }

  if (result.seed === CANONICAL_SEED) {
    if (soft !== null && (soft.ms < CANONICAL_SOFT_MS_RANGE[0] || soft.ms > CANONICAL_SOFT_MS_RANGE[1])) {
      problems.push(
        `canonical soft outside comfortable [${formatMinutes(CANONICAL_SOFT_MS_RANGE[0])}, ` +
          `${formatMinutes(CANONICAL_SOFT_MS_RANGE[1])}] min`,
      );
    }
    if (hard !== null && (hard.ms < CANONICAL_HARD_MS_RANGE[0] || hard.ms > CANONICAL_HARD_MS_RANGE[1])) {
      problems.push(
        `canonical hard outside comfortable [${formatMinutes(CANONICAL_HARD_MS_RANGE[0])}, ` +
          `${formatMinutes(CANONICAL_HARD_MS_RANGE[1])}] min`,
      );
    }
  }

  return { seed: result.seed, problems };
}

function main(): void {
  console.log('=== auto-auto-clicker pacing sim ===');
  console.log(
    `canonical seed=${CANONICAL_SEED}  step=${STEP_MS}ms  click=${CLICK_INTERVAL_MS}ms  ` +
      `max=${formatMinutes(MAX_SIM_MS)}min`,
  );
  console.log('');

  const results = SWEEP_SEEDS.map((seed) => runSim(seed));
  const canonical = results[0] as SimResult;

  console.log('milestones (canonical seed)');
  console.log(milestoneLine('start', canonical.start));
  console.log(milestoneLine('soft check', canonical.soft));
  console.log(milestoneLine('hard wall', canonical.hard));
  console.log('');

  console.log('targets (canonical seed)');
  console.log(targetLine('soft', SOFT_TARGET_MS, canonical.soft));
  console.log(targetLine('hard', HARD_TARGET_MS, canonical.hard));
  console.log('');

  console.log('seed sweep (every seed is a hard assertion)');
  let failed = false;
  const verdicts = results.map(evaluateSeed);
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i] as SimResult;
    const verdict = verdicts[i] as SeedVerdict;
    const softText =
      result.soft === null ? 'not reached' : `${formatMinutes(result.soft.ms)} min (stage ${result.soft.stage})`;
    const hardText =
      result.hard === null ? 'not reached' : `${formatMinutes(result.hard.ms)} min (stage ${result.hard.stage})`;
    const marker = result.seed === CANONICAL_SEED ? '*' : ' ';
    const status = verdict.problems.length === 0 ? 'PASS' : 'FAIL';
    if (verdict.problems.length > 0) failed = true;
    console.log(
      ` ${marker} seed ${String(result.seed).padEnd(9)} soft ${softText.padStart(22)}  ` +
        `hard ${hardText.padStart(22)}  [${status}]`,
    );
    for (const problem of verdict.problems) {
      console.log(`     - ${problem}`);
    }
  }
  console.log('');

  if (!failed) {
    console.log('PACING OK');
    process.exitCode = 0;
  } else {
    console.log('PACING FAILED');
    for (const verdict of verdicts) {
      for (const problem of verdict.problems) {
        console.log(`  seed ${verdict.seed}: ${problem}`);
      }
    }
    process.exitCode = 1;
  }
}

main();
