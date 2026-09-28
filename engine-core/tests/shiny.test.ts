import { describe, expect, it } from 'vitest';
import {
  advance,
  applyAction,
  createGame,
  gearDefinitionFor,
  getActiveBoost,
  getActiveEvent,
  getEffectiveStats,
  getShinyCacheGold,
  RING_DEFINITION,
  RING_DEFINITION_2,
} from '../src/index';
import {
  SHINY_BASE_CADENCE_MS,
  SHINY_CACHE_GOLD_MULTIPLE,
  SHINY_DROP_SHARE,
  SHINY_FRENZY_DURATION_MS,
  SHINY_FRENZY_MULTIPLIER,
  SHINY_FRENZY_SHARE,
  SHINY_MIN_GAP_MS,
  SHINY_TUTORIAL_DELAYS_MS,
  SHINY_WINDOW_MS,
  shinySpawnDelayMs,
  shinySpawnRoll,
} from '../src/balance';
import { makeGear, makeRing, makeState } from './helpers';
import type { GameEvent, GameState } from '../src/types';

/** A state that will never spawn by itself: the next check is effectively unreachable. */
const NEVER_MS = 1e12;

/** No enemy dies during these ticks, so only Golden Events drive the assertions. */
const TOUGH_ENEMY_HP = 1e15;

/** Timestamps (meta.totalPlayedMs basis) at which spawns were emitted. */
function spawnTimes(state: GameState, totalMs: number, stepMs = 250): number[] {
  const times: number[] = [];
  let next = state;
  let elapsed = 0;
  while (elapsed < totalMs) {
    const delta = Math.min(stepMs, totalMs - elapsed);
    const tick = advance(next, delta);
    next = tick.state;
    elapsed += delta;
    for (const event of tick.events) {
      if (event.type === 'eventSpawned') times.push(elapsed);
    }
  }
  return times;
}

function eventTypes(events: readonly GameEvent[]): string[] {
  return events.map((event) => event.type);
}

describe('Golden Events — spawn cadence', () => {
  it('spawns the first Shiny after the first tutorial delay', () => {
    const start = makeState({ enemyHp: TOUGH_ENEMY_HP });
    const early = advance(start, SHINY_TUTORIAL_DELAYS_MS[0]! - 1);
    expect(early.state.event.active).toBeNull();

    const onTime = advance(start, SHINY_TUTORIAL_DELAYS_MS[0]!);
    expect(onTime.state.event.active).not.toBeNull();
    expect(onTime.state.event.spawned).toBe(1);
    expect(onTime.events.some((event) => event.type === 'eventSpawned')).toBe(true);
  });

  it('uses the tutorial table for the first two spawns, then the base cadence', () => {
    const start = makeState({ enemyHp: TOUGH_ENEMY_HP });
    const times = spawnTimes(start, 400_000, 500);

    // Spawns are scheduled at cumulative delays: 25s, +70s, +120s, +120s.
    expect(times[0]).toBe(SHINY_TUTORIAL_DELAYS_MS[0]);
    expect(times[1]).toBe(SHINY_TUTORIAL_DELAYS_MS[0]! + SHINY_TUTORIAL_DELAYS_MS[1]!);
    expect(times[2]).toBe(
      SHINY_TUTORIAL_DELAYS_MS[0]! + SHINY_TUTORIAL_DELAYS_MS[1]! + SHINY_BASE_CADENCE_MS,
    );
    // The steady-state cadence is not crushed: the tutorial table only covers
    // the first two spawns, so a second full base gap is the next entry.
    expect(times[3]).toBe(
      SHINY_TUTORIAL_DELAYS_MS[0]! +
        SHINY_TUTORIAL_DELAYS_MS[1]! +
        2 * SHINY_BASE_CADENCE_MS,
    );
  });

  it('is deterministic: same seed yields the same Shiny sequence', () => {
    const a = spawnTimes(createGame(4242, 0), 400_000, 500);
    const b = spawnTimes(createGame(4242, 0), 400_000, 500);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(3);
  });

  it('never schedules a gap below the minimum gap', () => {
    expect(shinySpawnDelayMs(0)).toBeGreaterThanOrEqual(SHINY_MIN_GAP_MS);
    expect(shinySpawnDelayMs(1)).toBeGreaterThanOrEqual(SHINY_MIN_GAP_MS);
    expect(shinySpawnDelayMs(2)).toBeGreaterThanOrEqual(SHINY_MIN_GAP_MS);
    expect(shinySpawnDelayMs(-1)).toBeGreaterThanOrEqual(SHINY_MIN_GAP_MS);
    expect(shinySpawnDelayMs(2)).toBe(SHINY_BASE_CADENCE_MS);
  });

  it('resolves one roll into spawn + a three-way reward kind', () => {
    // Kind is read from the same draw (normalised by the spawn chance), so the
    // reward mix is independent of `SHINY_SPAWN_CHANCE`. The boundaries are
    // derived from the constants so a retune cannot silently make a kind
    // unreachable.
    const dropBoundary = SHINY_FRENZY_SHARE + SHINY_DROP_SHARE;
    expect(dropBoundary).toBeLessThan(1);

    expect(shinySpawnRoll(0).spawns).toBe(true);
    expect(shinySpawnRoll(0).kind).toBe('frenzy');
    expect(shinySpawnRoll(Math.max(0, SHINY_FRENZY_SHARE - 0.01)).kind).toBe('frenzy');
    expect(shinySpawnRoll(SHINY_FRENZY_SHARE).kind).toBe('drop');
    expect(shinySpawnRoll(dropBoundary - 0.01).kind).toBe('drop');
    expect(shinySpawnRoll(dropBoundary).kind).toBe('cache');
    expect(shinySpawnRoll(0.99).kind).toBe('cache');
  });

  it('expires a Shiny with no penalty and emits eventExpired', () => {
    const start = makeState({
      enemyHp: TOUGH_ENEMY_HP,
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'cache', spawnedAtMs: 0, expiresAtMs: SHINY_WINDOW_MS },
    });

    const before = advance(start, SHINY_WINDOW_MS - 1);
    expect(before.state.event.active).not.toBeNull();
    expect(before.state.player.gold).toBe(0);

    const after = advance(start, SHINY_WINDOW_MS);
    expect(after.state.event.active).toBeNull();
    expect(after.events).toContainEqual({ type: 'eventExpired', kind: 'cache' });
    expect(after.state.player.gold).toBe(0);
  });
});

describe('Golden Events — claim', () => {
  it('claims a cache for gold proportional to the stage reward', () => {
    const stage = 30;
    const start = makeState({
      stage,
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'cache', spawnedAtMs: 0, expiresAtMs: SHINY_WINDOW_MS },
    });
    const expectedGold = getShinyCacheGold(start, stage);
    expect(expectedGold).toBeGreaterThan(0);

    const { state, events } = applyAction(start, { type: 'claimEvent' });

    expect(state.player.gold).toBe(expectedGold);
    expect(state.event.active).toBeNull();
    expect(events).toContainEqual({ type: 'eventClaimed', kind: 'cache' });
    expect(events).toContainEqual({
      type: 'goldChanged',
      amount: expectedGold,
      total: expectedGold,
      reason: 'event:cache',
    });
  });

  it('claims a drop as a guaranteed current-stage ring in the bag', () => {
    const stage = 25;
    const start = makeState({
      stage,
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'drop', spawnedAtMs: 0, expiresAtMs: SHINY_WINDOW_MS },
    });
    expect(start.gear.bag).toEqual([]);

    const { state, events } = applyAction(start, { type: 'claimEvent' });

    expect(state.event.active).toBeNull();
    expect(events).toContainEqual({ type: 'eventClaimed', kind: 'drop' });
    expect(state.gear.bag).toHaveLength(1);
    const dropped = state.gear.bag[0];
    // The drop tracks the CURRENT stage and is a ring — a drop on the designed
    // bounded secondary lever, never a weapon that would leapfrog the curve.
    expect(dropped?.itemLevel).toBe(stage);
    expect(dropped?.upgradeLevel).toBe(0);
    expect(gearDefinitionFor(dropped?.definitionId ?? '')?.slot).toBe('ring1');
    // No gold and no boost: the drop kind is a pure loot grant.
    expect(state.player.gold).toBe(start.player.gold);
    expect(state.boost).toBeNull();
  });

  it('routes a drop into the weaker ring slot', () => {
    const start = makeState({
      stage: 12,
      equippedRing1: makeRing(20, 'ring1'),
      equippedRing2: makeRing(3, 'ring2'),
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'drop', spawnedAtMs: 0, expiresAtMs: SHINY_WINDOW_MS },
    });

    const { state } = applyAction(start, { type: 'claimEvent' });

    // ring2 holds the lower item level, so the guaranteed ring goes there.
    expect(state.gear.bag[0]?.definitionId).toBe(RING_DEFINITION_2.id);

    const bothEmpty = makeState({
      stage: 12,
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'drop', spawnedAtMs: 0, expiresAtMs: SHINY_WINDOW_MS },
    });
    const claimed = applyAction(bothEmpty, { type: 'claimEvent' });
    expect(claimed.state.gear.bag[0]?.definitionId).toBe(RING_DEFINITION.id);
  });

  it('claims a frenzy into a temporary damage multiplier', () => {
    const weapon = makeGear(10);
    const start = makeState({
      equippedWeapon: weapon,
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'frenzy', spawnedAtMs: 0, expiresAtMs: SHINY_WINDOW_MS },
    });
    const baseDps = getEffectiveStats(start).autoDps;

    const { state, events } = applyAction(start, { type: 'claimEvent' });

    expect(state.event.active).toBeNull();
    expect(getActiveBoost(state)).toEqual({
      dpsMultiplier: SHINY_FRENZY_MULTIPLIER,
      expiresAtMs: SHINY_FRENZY_DURATION_MS,
    });
    expect(events).toContainEqual({
      type: 'boostActivated',
      dpsMultiplier: SHINY_FRENZY_MULTIPLIER,
      expiresAtMs: SHINY_FRENZY_DURATION_MS,
    });
    expect(events).toContainEqual({ type: 'eventClaimed', kind: 'frenzy' });
    expect(getEffectiveStats(state).autoDps).toBeCloseTo(baseDps * SHINY_FRENZY_MULTIPLIER, 6);
  });

  it('is a no-op when nothing is active', () => {
    const start = makeState({ nextSpawnAtMs: NEVER_MS });
    const result = applyAction(start, { type: 'claimEvent' });
    expect(result.state).toBe(start);
    expect(result.events).toEqual([]);
  });

  it('is a no-op for an expired window', () => {
    const start = makeState({
      totalPlayedMs: 5000,
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'cache', spawnedAtMs: 0, expiresAtMs: 1000 },
    });
    expect(getActiveEvent(start)).toBeNull();

    const result = applyAction(start, { type: 'claimEvent' });
    expect(result.state).toBe(start);
    expect(result.events).toEqual([]);
  });

  it('is a no-op on the second claim of the same Shiny', () => {
    const start = makeState({
      stage: 30,
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'cache', spawnedAtMs: 0, expiresAtMs: SHINY_WINDOW_MS },
    });
    const first = applyAction(start, { type: 'claimEvent' });
    expect(first.state).not.toBe(start);

    const second = applyAction(first.state, { type: 'claimEvent' });
    expect(second.state).toBe(first.state);
    expect(second.events).toEqual([]);
  });

  it('is a no-op while a choice is pending (world frozen)', () => {
    const start = makeState({
      pending: { kind: 'boss-check', stage: 10, options: ['wait', 'watchAd', 'iap'] },
      activeEvent: { kind: 'cache', spawnedAtMs: 0, expiresAtMs: SHINY_WINDOW_MS },
    });
    const result = applyAction(start, { type: 'claimEvent' });
    expect(result.state).toBe(start);
    expect(result.events).toEqual([]);
  });
});

describe('Golden Events — boost', () => {
  it('expires the boost and restores base stats', () => {
    const weapon = makeGear(10);
    const start = makeState({
      equippedWeapon: weapon,
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'frenzy', spawnedAtMs: 0, expiresAtMs: SHINY_WINDOW_MS },
      boost: { dpsMultiplier: SHINY_FRENZY_MULTIPLIER, expiresAtMs: 20_000 },
    });
    const boostedDps = getEffectiveStats(start).autoDps;

    const stillBoosted = advance(start, 19_999);
    expect(getActiveBoost(stillBoosted.state)).not.toBeNull();
    expect(getEffectiveStats(stillBoosted.state).autoDps).toBeCloseTo(boostedDps, 6);

    const expired = advance(start, 20_000);
    expect(expired.state.boost).toBeNull();
    expect(expired.events).toContainEqual({ type: 'boostExpired' });
    expect(getActiveBoost(expired.state)).toBeNull();
    const baseDps = getEffectiveStats(
      makeState({ equippedWeapon: weapon, nextSpawnAtMs: NEVER_MS }),
    ).autoDps;
    expect(getEffectiveStats(expired.state).autoDps).toBeCloseTo(baseDps, 6);
  });

  it('extends an already-running frenzy without lowering or stacking it', () => {
    const existingExpiry = 51_000;
    const start = makeState({
      totalPlayedMs: 50_000,
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'frenzy', spawnedAtMs: 49_000, expiresAtMs: 59_000 },
      boost: { dpsMultiplier: SHINY_FRENZY_MULTIPLIER, expiresAtMs: existingExpiry },
    });

    const { state, events } = applyAction(start, { type: 'claimEvent' });

    // The new window is `now + duration`; it is longer than the remaining old
    // one, so the window is extended (the multiplier is replaced, not stacked).
    const expectedExpiry = 50_000 + SHINY_FRENZY_DURATION_MS;
    expect(expectedExpiry).toBeGreaterThan(existingExpiry);
    expect(state.boost).toEqual({
      dpsMultiplier: SHINY_FRENZY_MULTIPLIER,
      expiresAtMs: expectedExpiry,
    });
    expect(events).toContainEqual({ type: 'eventClaimed', kind: 'frenzy' });
  });

  it('never shortens a longer running boost', () => {
    const farExpiry = 500_000;
    const start = makeState({
      totalPlayedMs: 10_000,
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'frenzy', spawnedAtMs: 9_000, expiresAtMs: 19_000 },
      boost: { dpsMultiplier: 2, expiresAtMs: farExpiry },
    });

    const { state } = applyAction(start, { type: 'claimEvent' });
    expect(state.boost?.expiresAtMs).toBe(farExpiry);
    expect(state.boost?.dpsMultiplier).toBe(SHINY_FRENZY_MULTIPLIER);
  });

  it('is tuned as a felt burst with a genuinely three-way mix (wall-budget guard)', () => {
    // Guards against silently re-crushing the feature AND against re-inflating
    // its pacing effect. Felt-ness is asserted in TEMPO + MIX terms rather than
    // as a raw DPS number: the frenzy must last several seconds (not a 2 s
    // blip) and must still visibly multiply damage, and all three reward kinds
    // must stay reachable so the mix is genuinely varied.
    expect(SHINY_FRENZY_DURATION_MS).toBeGreaterThanOrEqual(5_000);
    expect(SHINY_FRENZY_MULTIPLIER).toBeGreaterThanOrEqual(3);
    expect(SHINY_FRENZY_SHARE).toBeGreaterThan(0.1);
    expect(SHINY_DROP_SHARE).toBeGreaterThan(0.1);
    expect(SHINY_CACHE_GOLD_MULTIPLE).toBeGreaterThanOrEqual(2);

    // The mix always leaves a real cache share.
    expect(SHINY_FRENZY_SHARE + SHINY_DROP_SHARE).toBeLessThan(0.9);

    // THE WALL BUDGET (see balance.ts): one frenzy can shorten wall-clock
    // progress by at most `duration × (multiplier − 1)` ms, independent of
    // stage and DPS. Pinning that per-claim budget to a small ceiling is what
    // keeps the felt burst wall-inert — growing either knob must fail here.
    const perClaimWallBudgetMs = SHINY_FRENZY_DURATION_MS * (SHINY_FRENZY_MULTIPLIER - 1);
    expect(perClaimWallBudgetMs).toBeLessThanOrEqual(20_000);

    // The cadence stays frequent enough that a player actually meets Shinies.
    expect(SHINY_BASE_CADENCE_MS).toBeLessThanOrEqual(300_000);
  });
});

describe('Golden Events — achievements', () => {
  it('unlocks shiny-claimed on the first claim', () => {
    const start = makeState({
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'cache', spawnedAtMs: 0, expiresAtMs: SHINY_WINDOW_MS },
    });
    const { state, events } = applyAction(start, { type: 'claimEvent' });

    expect(eventTypes(events)).toContain('achievementUnlocked');
    expect(state.meta.achievements).toContain('shiny-claimed');
    expect(state.meta.achievements).not.toContain('shiny-frenzy');
  });

  it('unlocks shiny-frenzy only when a Shiny is claimed during a running frenzy', () => {
    const start = makeState({
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'cache', spawnedAtMs: 0, expiresAtMs: SHINY_WINDOW_MS },
      boost: { dpsMultiplier: SHINY_FRENZY_MULTIPLIER, expiresAtMs: 100_000 },
    });
    const { state } = applyAction(start, { type: 'claimEvent' });

    expect(state.meta.achievements).toContain('shiny-frenzy');
  });

  it('unlocks shiny-escape when a Shiny is allowed to expire', () => {
    const start = makeState({
      enemyHp: TOUGH_ENEMY_HP,
      nextSpawnAtMs: NEVER_MS,
      activeEvent: { kind: 'cache', spawnedAtMs: 0, expiresAtMs: SHINY_WINDOW_MS },
    });
    const { state, events } = advance(start, SHINY_WINDOW_MS);

    expect(eventTypes(events)).toContain('eventExpired');
    expect(state.meta.achievements).toContain('shiny-escape');
  });
});
