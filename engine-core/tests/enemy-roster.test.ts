// enemy-roster.test.ts — F2: deterministic enemy selection + pacing neutrality.
//
// The central claim under test: the roster gives every stage a DISTINCT enemy
// (identity + profile), while the LIVE blocking curve (HP/gold the sim and the
// player actually fight) stays EXACTLY the canonical stage-only formula. Only
// the canonical curve keeps the pacing proof byte-identical; applying even a
// cycle-mean-1 per-enemy factor to the live curve drifts it (see decisions.md —
// HP-only variant moved canonical hard 50.25 -> 49.04 min).

import { describe, expect, it } from 'vitest';
import {
  applyAction,
  CONTENT,
  ENEMY_ROSTER,
  enemyForStage,
  getEnemyMaxHp,
  GRUNT_DEFINITION,
} from '../src/index';
import { BALANCE, enemyMaxHp, goldReward, isBoss } from '../src/balance';
import { deepFreeze, makeState } from './helpers';

function meanOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe('enemy roster — selection', () => {
  it('has at least 10 entries with unique, stable, lowercase ids', () => {
    expect(ENEMY_ROSTER.length).toBeGreaterThanOrEqual(10);
    const ids = ENEMY_ROSTER.map((enemy) => enemy.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id, id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it('is deterministic and wraps at the roster length', () => {
    const size = ENEMY_ROSTER.length;
    for (let stage = 1; stage <= size * 3; stage += 1) {
      const first = enemyForStage(stage);
      expect(enemyForStage(stage).id).toBe(first.id);
      expect(enemyForStage(stage + size).id).toBe(first.id);
    }
  });

  it('selects the roster by (stage - 1) % length', () => {
    for (let stage = 1; stage <= 2 * ENEMY_ROSTER.length; stage += 1) {
      expect(enemyForStage(stage)).toBe(ENEMY_ROSTER[(stage - 1) % ENEMY_ROSTER.length]);
    }
  });

  it('keeps CONTENT.enemies in sync and GRUNT_DEFINITION backward-compatible', () => {
    expect(Object.keys(CONTENT.enemies)).toHaveLength(ENEMY_ROSTER.length);
    expect(GRUNT_DEFINITION.id).toBe('grunt');
    expect(enemyForStage(1).id).toBe('grunt');
  });
});

describe('enemy roster — distinct profiles', () => {
  it('gives genuinely distinct stats with a cycle mean of exactly 1 per factor', () => {
    const hpFactors = ENEMY_ROSTER.map((enemy) => enemy.hpFactor);
    const goldFactors = ENEMY_ROSTER.map((enemy) => enemy.goldFactor);

    // Distinct: the profile carries real variation, not a constant 1.
    expect(new Set(hpFactors).size).toBeGreaterThan(1);
    expect(new Set(goldFactors).size).toBeGreaterThan(1);
    // Normalised: the arithmetic mean over one full roster cycle is exactly 1.
    expect(meanOf(hpFactors)).toBeCloseTo(1, 10);
    expect(meanOf(goldFactors)).toBeCloseTo(1, 10);

    // The catalog numbers are genuinely different per enemy too.
    expect(new Set(ENEMY_ROSTER.map((enemy) => enemy.baseHp)).size).toBeGreaterThan(1);
    expect(new Set(ENEMY_ROSTER.map((enemy) => enemy.hpGrowth)).size).toBeGreaterThan(1);
    expect(new Set(ENEMY_ROSTER.map((enemy) => enemy.archetype)).size).toBe(ENEMY_ROSTER.length);
  });
});

describe('enemy roster — boss stages stay bosses', () => {
  it('still flags every 10th stage and applies the boss multipliers', () => {
    for (let stage = 1; stage <= 40; stage += 1) {
      expect(isBoss(stage), `stage ${stage}`).toBe(stage % 10 === 0);
    }
    expect(enemyMaxHp(10)).toBe(
      Math.floor(BALANCE.baseHp * Math.pow(BALANCE.hpGrowth, 9) * BALANCE.bossHpMultiplier),
    );
    expect(goldReward(10)).toBe(
      Math.floor(BALANCE.baseGold * Math.pow(BALANCE.goldGrowth, 9) * BALANCE.bossGoldMultiplier),
    );
    expect(enemyMaxHp(10)).toBeGreaterThan(enemyMaxHp(9) * 2);
    // A boss stage names a real roster enemy and still carries the boss knobs.
    expect(enemyForStage(10).bossHpMultiplier).toBe(BALANCE.bossHpMultiplier);
    expect(enemyForStage(10).bossGoldMultiplier).toBe(BALANCE.bossGoldMultiplier);
  });
});

describe('enemy roster — pacing neutrality invariant', () => {
  it('combat HP and gold equal the canonical stage-only formula across a sweep', () => {
    for (let stage = 1; stage <= 24; stage += 1) {
      // Exactly one click's worth of HP so the kill consumes the whole budget
      // and no damage flows into the next enemy (which would reduce its HP).
      const before = makeState({ stage, enemyHp: BALANCE.baseClickDamage });
      const { state, events } = applyAction(before, { type: 'click' });
      const nextStage = stage + 1;

      // Live HP is canonical, independent of which enemy the roster picked.
      expect(state.combat.enemyHp, `stage ${nextStage}`).toBe(enemyMaxHp(nextStage));
      expect(getEnemyMaxHp(state), `getEnemyMaxHp ${nextStage}`).toBe(enemyMaxHp(nextStage));
      // Kill gold is canonical.
      expect(state.player.gold - before.player.gold, `gold ${stage}`).toBe(goldReward(stage));

      const entered = events.find((event) => event.type === 'stageEntered');
      expect(entered, `stageEntered ${nextStage}`).toBeDefined();
      if (entered && entered.type === 'stageEntered') {
        expect(entered.maxHp).toBe(enemyMaxHp(nextStage));
        expect(entered.enemyId).toBe(enemyForStage(nextStage).id);
      }
    }
  });

  it('stamps the stable enemy id on kill and on the following stage entry', () => {
    // Stage 1 -> grunt, stage 2 -> goblin (the roster's first two entries).
    const before = makeState({ stage: 1, enemyHp: BALANCE.baseClickDamage });
    const { events } = applyAction(before, { type: 'click' });

    const killed = events.find((event) => event.type === 'enemyKilled');
    expect(killed && killed.type === 'enemyKilled' ? killed.enemyId : null).toBe(
      enemyForStage(1).id,
    );

    const entered = events.find((event) => event.type === 'stageEntered');
    expect(entered && entered.type === 'stageEntered' ? entered.enemyId : null).toBe(
      enemyForStage(2).id,
    );
  });
});

describe('enemy roster — RNG isolation', () => {
  it('selection alone mutates nothing and never touches meta.rngState', () => {
    const state = deepFreeze(makeState({ stage: 7, enemyHp: 10 }));
    const snapshot = JSON.stringify(state);
    const rngBefore = state.meta.rngState;

    for (let stage = 1; stage <= 999; stage += 1) enemyForStage(stage);

    expect(JSON.stringify(state)).toBe(snapshot);
    expect(state.meta.rngState).toBe(rngBefore);
  });
});
