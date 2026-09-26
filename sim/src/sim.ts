// sim — headless pacing harness for the engine tick loop. No rendering, no UI.
//
// Drives `advance`/`applyAction` with a fixed 100 ms step and a 2-clicks/sec
// active player. The economy policy is greedy and deterministic:
//   1. buy weapon upgrades while affordable;
//   2. equip a bag weapon only when it strictly raises total active DPS
//      (auto DPS + ACTIVE_CLICKS_PER_SECOND * click damage).
//
// Drops are the PRIMARY power lever (Phase 3b reversed): every kill almost
// always drops a weapon whose item level tracks the killed stage, and gear stats
// are exponential in item level, so equipping a newer drop is the dominant power
// jump. Gold-funded upgrades are a minor multiplicative smoothing bonus whose
// few affordable levels are reset by each equip.
//
// Asserts the pacing targets for EVERY sweep seed (all are hard assertions):
//   - soft boss check lands 6.0 min  (±20% → [4.8, 7.2])
//   - hard progression wall 54.0 min (±20% → [43.2, 64.8])
// plus the design guards (soft is an early boss, hard wall stage <= 90, no
// Infinity/NaN), a drops-primary gate: the drop-attributed share of the run's
// positive NET log-power growth must exceed 50%, and a drop-stream sanity guard
// (equips must keep pace with stages cleared). Exit code 1 when any seed misses
// any target.
//
// Power attribution: the equipped weapon's stat is multiplicative —
//   ln(stat) = ln(factor) + (itemLevel - 1) * ln(gearGrowth)
//                       + upgradeLevel * ln(upgradeStatMultiplier)
// so the run's log-power growth decomposes EXACTLY into per-equip deltas
// (item-level gain) and per-upgrade deltas. Each equip resets the (gold-funded)
// upgradeLevel to 0, so that upgrade power — and the gold that bought it — is
// destroyed on every swap: gold's NET contribution is ~0. The reset loss is
// therefore charged to GOLD (`goldNet = goldGross - resetLoss`), never
// subtracted from drops, and both a net-of-reset and a gross share are reported.

import {
  ACTIVE_CLICKS_PER_SECOND,
  advance,
  applyAction,
  BALANCE,
  createGame,
  getEffectiveStats,
  getGearStats,
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

// Drops-primary gate: drop-attributed share of positive NET log-power growth.
const MIN_DROP_LOG_SHARE = 0.5;
// Drop-stream sanity: equips must keep pace with progress (at least 1 equip per
// 5 stages cleared). A run whose attributed drops never actually happened cannot
// pass, even if arithmetic alone would clear the share gate. Generous on purpose
// — the real rate is ~1 equip/stage — so it only catches a dead drop stream.
const MIN_EQUIPS_PER_STAGE = 1 / 5;

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

/** Log-power bookkeeping accumulated over a run. All values are natural logs. */
interface Attribution {
  /** Sum of item-level gains on each equip: Δ(itemLevel - 1) * ln(gearGrowth). */
  dropGross: number;
  /** Sum of +ln(upgradeStatMultiplier) for every upgrade purchased. */
  goldGross: number;
  /** Sum of oldUpgradeLevel * ln(upgradeStatMultiplier) lost on each equip. */
  resetLoss: number;
  equips: number;
  upgrades: number;
  killGold: number;
  waitGold: number;
}

interface SimResult {
  seed: number;
  totalMs: number;
  start: Milestone;
  soft: Milestone | null;
  hard: Milestone | null;
  /** Stage the run ended on (the wall/stop stage); stages cleared = endStage - 1. */
  endStage: number;
  attr: Attribution;
}

function emptyAttribution(): Attribution {
  return { dropGross: 0, goldGross: 0, resetLoss: 0, equips: 0, upgrades: 0, killGold: 0, waitGold: 0 };
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
  attr: Attribution,
): void {
  for (const event of events) {
    if (event.type === 'bossCheckFailed' && record.soft === null) {
      record.soft = milestone(state, atMs, event.projectedKillMs);
    }
    if (event.type === 'progressionWall' && record.hard === null) {
      record.hard = milestone(state, atMs, event.projectedKillMs);
    }
    if (event.type === 'enemyKilled') attr.killGold += event.gold;
  }
}

function totalActiveDps(state: GameState): number {
  const stats = getEffectiveStats(state);
  return stats.autoDps + ACTIVE_CLICKS_PER_SECOND * stats.clickDamage;
}

/** Total active DPS the player would have if `item` replaced the equipped weapon. */
function candidateActiveDps(state: GameState, item: GearInstance): number {
  // Same derivation the engine uses: BALANCE base stats + the item's computed
  // gear stats, so candidate DPS and the engine's `getEffectiveStats` never
  // diverge.
  const stats = getGearStats(item);
  const autoDps = BALANCE.baseAutoDps + stats.dps;
  const clickDamage = BALANCE.baseClickDamage + stats.clickDamage;
  return autoDps + ACTIVE_CLICKS_PER_SECOND * clickDamage;
}

/**
 * Greedy economy: buy every affordable upgrade, then equip the single bag
 * weapon that strictly raises total active DPS; repeat until neither action
 * changes the state. Equipping is DPS-based, so a weaker bag item never resets
 * an upgraded weapon — but with drops-primary tuning the newest (highest item
 * level) drop is always the strongest, so drops drive the power curve.
 *
 * Attribution is recorded on real state changes only: each upgrade adds
 * +ln(upgradeStatMultiplier); each equip adds Δ(itemLevel - 1) * ln(gearGrowth)
 * and charges the reset loss of the discarded weapon's upgrade levels.
 */
function runEconomy(state: GameState, attr: Attribution): GameState {
  let next = state;
  const lnGrowth = Math.log(BALANCE.gear.gearGrowth);
  const lnUpgrade = Math.log(BALANCE.gear.upgradeStatMultiplier);

  for (let pass = 0; pass < MAX_ECONOMY_PASSES; pass += 1) {
    let changed = false;

    for (;;) {
      const cost = getUpgradeCost(next, 'weapon');
      if (cost === null || next.player.gold < cost) break;
      const upgraded = applyAction(next, { type: 'upgradeEquipped', slot: 'weapon' });
      if (upgraded.state === next) break;
      next = upgraded.state;
      attr.goldGross += lnUpgrade;
      attr.upgrades += 1;
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
    const old = next.gear.equipped.weapon;
    const oldItemLevel = old ? old.itemLevel : 1;
    const oldUpgradeLevel = old ? old.upgradeLevel : 0;
    const swapped = applyAction(next, { type: 'equip', instanceId: best.id });
    if (swapped.state === next) break;
    next = swapped.state;
    attr.dropGross += (best.itemLevel - oldItemLevel) * lnGrowth;
    attr.resetLoss += oldUpgradeLevel * lnUpgrade;
    attr.equips += 1;
    changed = true;

    if (!changed) break;
  }

  return next;
}

function runSim(seed: number): SimResult {
  const initial = createGame(seed, 0);
  const record: SimRecord = { soft: null, hard: null };
  const attr = emptyAttribution();
  const start = milestone(initial, 0, null);

  let state = initial;
  let totalMs = 0;
  let clickAcc = 0;

  while (totalMs < MAX_SIM_MS && record.hard === null && state.combat.stage <= MAX_SIM_STAGE) {
    const tick = advance(state, STEP_MS);
    state = tick.state;
    totalMs += STEP_MS;
    processEvents(tick.events, totalMs, state, record, attr);

    clickAcc += STEP_MS;
    if (clickAcc >= CLICK_INTERVAL_MS) {
      clickAcc -= CLICK_INTERVAL_MS;
      const clicked = applyAction(state, { type: 'click' });
      state = clicked.state;
      processEvents(clicked.events, totalMs, state, record, attr);
    }

    if (record.hard !== null) break;

    if (state.choices.pending) {
      const goldBefore = state.player.gold;
      const resolved = applyAction(state, { type: 'resolveChoice', choice: 'wait' });
      state = resolved.state;
      attr.waitGold += state.player.gold - goldBefore;
      processEvents(resolved.events, totalMs, state, record, attr);
    }

    state = runEconomy(state, attr);
  }

  return { seed, totalMs, start, soft: record.soft, hard: record.hard, endStage: state.combat.stage, attr };
}

interface AttributionSummary {
  dropGross: number;
  goldGross: number;
  resetLoss: number;
  /** Drop-attributed NET log growth. Drops carry no reset loss, so this is gross. */
  dropNet: number;
  /** Gold-attributed NET log growth after the reset loss each equip destroys (≈0). */
  goldNet: number;
  /** Total NET log-power growth over the run (`dropNet + goldNet`). */
  totalNet: number;
  /** Gross positive log growth (drops + upgrades), before reset losses. */
  grossTotal: number;
  /** Denominator for the net share: `dropNet + max(goldNet, 0)` (never negative). */
  netTotal: number;
  /** Drop share of positive NET log-power growth (the drops-primary metric). */
  dropShareNet: number;
  /** Drop share of GROSS positive log growth. */
  dropShareGross: number;
  /** Approximate share of net growth funded by the free `wait` grants. */
  freeShare: number;
  equips: number;
  upgrades: number;
}

function summarizeAttribution(attr: Attribution): AttributionSummary {
  // Each equip resets the gold-funded upgradeLevel to 0, so the upgrade power
  // (and the gold that bought it) is destroyed by the swap. Charge that loss to
  // GOLD, the lever it came from — never to drops.
  const dropNet = attr.dropGross;
  const goldNet = attr.goldGross - attr.resetLoss;
  const totalNet = dropNet + goldNet;
  const netTotal = dropNet + Math.max(goldNet, 0);
  const grossTotal = attr.dropGross + attr.goldGross;
  const goldIncome = attr.killGold + attr.waitGold;
  const freeGoldShare = goldIncome > 0 ? attr.waitGold / goldIncome : 0;
  return {
    dropGross: attr.dropGross,
    goldGross: attr.goldGross,
    resetLoss: attr.resetLoss,
    dropNet,
    goldNet,
    totalNet,
    grossTotal,
    netTotal,
    dropShareNet: netTotal > 0 ? dropNet / netTotal : 0,
    dropShareGross: grossTotal > 0 ? attr.dropGross / grossTotal : 0,
    freeShare: netTotal > 0 ? (freeGoldShare * attr.goldGross) / netTotal : 0,
    equips: attr.equips,
    upgrades: attr.upgrades,
  };
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

function formatLog(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
}

function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/** Stages cleared by a run: it ends on the wall/stop stage, which it has not cleared. */
function stagesCleared(result: SimResult): number {
  return Math.max(0, result.endStage - 1);
}

function attributionLine(result: SimResult): string {
  const a = summarizeAttribution(result.attr);
  const cleared = stagesCleared(result);
  const equipsPerStage = cleared > 0 ? a.equips / cleared : 0;
  const marker = result.seed === CANONICAL_SEED ? '*' : ' ';
  return (
    ` ${marker} seed ${String(result.seed).padEnd(9)} equips=${String(a.equips).padStart(3)} ` +
    `upgrades=${String(a.upgrades).padStart(3)}  ` +
    `drop-gross ${formatLog(a.dropGross)}  gold-gross ${formatLog(a.goldGross)}  ` +
    `reset-loss ${a.resetLoss.toFixed(3)}  gold-net ${formatLog(a.goldNet)}  ` +
    `drop-share net ${formatPercent(a.dropShareNet)} / gross ${formatPercent(a.dropShareGross)}  ` +
    `eq/stage ${equipsPerStage.toFixed(2)} (${a.equips}/${cleared})  ` +
    `free-path ${formatPercent(a.freeShare)}  ` +
    `[${a.dropShareNet > MIN_DROP_LOG_SHARE ? 'DROPS-PRIMARY' : 'GOLD-PRIMARY'}]`
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

  const attribution = summarizeAttribution(result.attr);
  if (!(attribution.totalNet > 0)) {
    problems.push('attribution: net log-power growth is not positive');
  } else if (attribution.dropShareNet <= MIN_DROP_LOG_SHARE) {
    problems.push(
      `drops-primary: drop share of net log-power growth ${formatPercent(attribution.dropShareNet)} ` +
        `<= ${formatPercent(MIN_DROP_LOG_SHARE)}`,
    );
  }

  // Second, independent sanity metric: the attributed drops must correspond to
  // real equip events keeping pace with progress, not one telescoping final drop.
  const cleared = stagesCleared(result);
  if (cleared > 0 && attribution.equips < cleared * MIN_EQUIPS_PER_STAGE) {
    problems.push(
      `drop-stream sanity: ${attribution.equips} equips < ${MIN_EQUIPS_PER_STAGE} per clear ` +
        `(${cleared} stages cleared)`,
    );
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
  console.log(
    `dropChance=${BALANCE.gear.dropChance}  gearGrowth=${BALANCE.gear.gearGrowth}  ` +
      `upgradeStatMultiplier=${BALANCE.gear.upgradeStatMultiplier}`,
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

  console.log('power attribution (log-power decomposition; net-of-reset drops-primary gate > 50%)');
  for (const result of results) {
    console.log(attributionLine(result));
  }
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
