// enemy-roster.test.ts — F2 / M3a: deterministic enemy selection + LIVE per-enemy curves.
//
// The roster is the SINGLE source of truth for the HP/gold curve. Every enemy
// carries its own REAL `baseHp`/`hpGrowth`/`baseGold`/`goldGrowth` and its own
// REAL `bossHpMultiplier`/`bossGoldMultiplier`; there is no global/canonical
// curve and no `hpFactor`/`goldFactor` scaling it. `enemyMaxHp`/`goldReward`
// (from `../src/content`, re-exported by `index`) are pure functions of the
// stage, so identity AND stats reconstruct from a save with no persisted field.

import { describe, expect, it } from 'vitest';
import {
  applyAction,
  CONTENT,
  ENEMY_ROSTER,
  enemyForStage,
  enemyMaxHp,
  getEnemyMaxHp,
  goldReward,
  GRUNT_DEFINITION,
} from '../src/index';
import { enemyMaxHpFor, goldRewardFor } from '../src/content';
import { BALANCE, isBoss } from '../src/balance';
import { deepFreeze, makeState } from './helpers';

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

  it('wraps negatives like JS modulo and falls back for NaN', () => {
    const size = ENEMY_ROSTER.length;
    expect(size).toBe(12);
    // A negative stage wraps over the roster exactly like JS modulo.
    expect(enemyForStage(-1)).toBe(ENEMY_ROSTER[((-1 - 1) % size + size) % size]);
    expect(enemyForStage(-12)).toBe(enemyForStage(0));
    // NaN must not index past the array: it falls back to a real roster entry.
    expect(ENEMY_ROSTER).toContain(enemyForStage(Number.NaN));
  });

  it('keeps CONTENT.enemies in sync and GRUNT_DEFINITION backward-compatible', () => {
    expect(Object.keys(CONTENT.enemies)).toHaveLength(ENEMY_ROSTER.length);
    expect(GRUNT_DEFINITION.id).toBe('grunt');
    expect(enemyForStage(1).id).toBe('grunt');
  });
});

describe('enemy roster — per-enemy curve parameters', () => {
  it('gives every enemy finite positive curve parameters and boss multipliers', () => {
    for (const enemy of ENEMY_ROSTER) {
      expect(Number.isFinite(enemy.baseHp), `${enemy.id}.baseHp`).toBe(true);
      expect(enemy.baseHp, enemy.id).toBeGreaterThan(0);
      expect(Number.isFinite(enemy.hpGrowth), `${enemy.id}.hpGrowth`).toBe(true);
      expect(enemy.hpGrowth, enemy.id).toBeGreaterThan(1);
      expect(Number.isFinite(enemy.baseGold), `${enemy.id}.baseGold`).toBe(true);
      expect(enemy.baseGold, enemy.id).toBeGreaterThan(0);
      expect(Number.isFinite(enemy.goldGrowth), `${enemy.id}.goldGrowth`).toBe(true);
      expect(enemy.goldGrowth, enemy.id).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(enemy.bossHpMultiplier), `${enemy.id}.bossHpMultiplier`).toBe(true);
      expect(enemy.bossHpMultiplier, enemy.id).toBeGreaterThan(1);
      expect(Number.isFinite(enemy.bossGoldMultiplier), `${enemy.id}.bossGoldMultiplier`).toBe(true);
      expect(enemy.bossGoldMultiplier, enemy.id).toBeGreaterThan(1);
    }
  });

  it('uses genuinely distinct per-enemy curve numbers and one distinct archetype each', () => {
    expect(new Set(ENEMY_ROSTER.map((enemy) => enemy.baseHp)).size).toBeGreaterThan(1);
    expect(new Set(ENEMY_ROSTER.map((enemy) => enemy.hpGrowth)).size).toBeGreaterThan(1);
    expect(new Set(ENEMY_ROSTER.map((enemy) => enemy.baseGold)).size).toBeGreaterThan(1);
    expect(new Set(ENEMY_ROSTER.map((enemy) => enemy.bossHpMultiplier)).size).toBeGreaterThan(1);
    expect(new Set(ENEMY_ROSTER.map((enemy) => enemy.archetype)).size).toBe(ENEMY_ROSTER.length);
  });

  it('no longer exposes the removed factor/interval fields on an enemy', () => {
    const enemy = ENEMY_ROSTER[0]!;
    expect('hpFactor' in enemy).toBe(false);
    expect('goldFactor' in enemy).toBe(false);
    expect('bossStageInterval' in enemy).toBe(false);
    // Type-level guard: these property reads only compile while the directive is
    // suppressing an error. Reintroducing the field makes `tsc` fail with an
    // unused-`@ts-expect-error` error, so the deletion cannot silently regress.
    // @ts-expect-error hpFactor was deleted from EnemyDefinition
    void enemy.hpFactor;
    // @ts-expect-error goldFactor was deleted from EnemyDefinition
    void enemy.goldFactor;
    // @ts-expect-error bossStageInterval was deleted from EnemyDefinition
    void enemy.bossStageInterval;
  });
});

describe('enemy roster — live curve formula', () => {
  it('computes live HP/gold exactly from the standing enemy on boss and non-boss stages', () => {
    for (const stage of [1, 2, 5, 9, 10, 11, 14, 19, 20, 23, 24]) {
      const enemy = enemyForStage(stage);
      const bossHp = isBoss(stage) ? enemy.bossHpMultiplier : 1;
      const bossGold = isBoss(stage) ? enemy.bossGoldMultiplier : 1;
      expect(enemyMaxHp(stage), `hp stage ${stage}`).toBe(
        Math.floor(enemy.baseHp * Math.pow(enemy.hpGrowth, stage - 1) * bossHp),
      );
      expect(goldReward(stage), `gold stage ${stage}`).toBe(
        Math.floor(enemy.baseGold * Math.pow(enemy.goldGrowth, stage - 1) * bossGold),
      );
    }
  });

  it('applies the boss term only on boss stages and spikes over the previous stage', () => {
    expect(isBoss(9)).toBe(false);
    expect(isBoss(10)).toBe(true);
    expect(isBoss(19)).toBe(false);
    expect(isBoss(20)).toBe(true);
    expect(enemyMaxHp(10)).toBeGreaterThan(enemyMaxHp(9) * 2);
    expect(goldReward(10)).toBeGreaterThan(goldReward(9) * 2);
    expect(enemyMaxHp(20)).toBeGreaterThan(enemyMaxHp(19) * 2);
  });

  it('agrees with the explicit per-enemy helpers', () => {
    for (const stage of [1, 2, 10, 11, 19, 20, 23, 24]) {
      const enemy = enemyForStage(stage);
      expect(enemyMaxHpFor(enemy, stage), `hp stage ${stage}`).toBe(enemyMaxHp(stage));
      expect(goldRewardFor(enemy, stage), `gold stage ${stage}`).toBe(goldReward(stage));
    }
  });

  it('returns 0 for non-positive and NaN stages', () => {
    for (const stage of [0, -1, -12, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(enemyMaxHp(stage), `hp ${stage}`).toBe(0);
      expect(goldReward(stage), `gold ${stage}`).toBe(0);
    }
  });
});

describe('enemy roster — per-enemy boss multipliers, not BALANCE', () => {
  it('reads the boss multiplier from the standing enemy', () => {
    const stageA = 10; // harpy
    const stageB = 20; // wraith
    const enemyA = enemyForStage(stageA);
    const enemyB = enemyForStage(stageB);
    expect(enemyA.id).not.toBe(enemyB.id);
    expect(enemyA.bossHpMultiplier).not.toBe(enemyB.bossHpMultiplier);

    // BALANCE no longer carries a global boss multiplier at all.
    expect('bossHpMultiplier' in BALANCE).toBe(false);
    expect('bossGoldMultiplier' in BALANCE).toBe(false);

    // The live value is the enemy's own curve times its own boss multiplier...
    expect(enemyMaxHp(stageA)).toBe(
      Math.floor(enemyA.baseHp * Math.pow(enemyA.hpGrowth, stageA - 1) * enemyA.bossHpMultiplier),
    );
    expect(enemyMaxHp(stageB)).toBe(
      Math.floor(enemyB.baseHp * Math.pow(enemyB.hpGrowth, stageB - 1) * enemyB.bossHpMultiplier),
    );
    // ...so the implied boss ratio differs between two different boss enemies
    // (the floor only perturbs it slightly).
    const impliedBossA = enemyMaxHp(stageA) / (enemyA.baseHp * Math.pow(enemyA.hpGrowth, stageA - 1));
    const impliedBossB = enemyMaxHp(stageB) / (enemyB.baseHp * Math.pow(enemyB.hpGrowth, stageB - 1));
    expect(impliedBossA).toBeCloseTo(enemyA.bossHpMultiplier, 2);
    expect(impliedBossB).toBeCloseTo(enemyB.bossHpMultiplier, 2);
    expect(impliedBossA).not.toBeCloseTo(impliedBossB, 2);
  });

  it('gives distinct per-enemy curves genuinely different live HP at one stage', () => {
    const grunt = ENEMY_ROSTER.find((enemy) => enemy.id === 'grunt')!;
    const golem = ENEMY_ROSTER.find((enemy) => enemy.id === 'golem')!;
    expect(grunt.hpGrowth).not.toBe(golem.hpGrowth);
    expect(enemyMaxHpFor(grunt, 12)).not.toBe(enemyMaxHpFor(golem, 12));
    expect(enemyMaxHpFor(grunt, 12)).not.toBe(
      Math.floor(BALANCE.baseHp * Math.pow(BALANCE.hpGrowth, 11)),
    );
  });
});

describe('enemy roster — mechanical reality', () => {
  it('drives live combat HP and gold from the stage enemy profile across a sweep', () => {
    for (let stage = 1; stage <= 24; stage += 1) {
      // Exactly one click's worth of HP so the kill consumes the whole budget
      // and no damage flows into the next enemy (which would reduce its HP).
      const before = makeState({ stage, enemyHp: BALANCE.baseClickDamage });
      const { state, events } = applyAction(before, { type: 'click' });
      const nextStage = stage + 1;

      // Live HP is the NEXT stage's own enemy curve.
      expect(state.combat.enemyHp, `stage ${nextStage}`).toBe(enemyMaxHp(nextStage));
      expect(getEnemyMaxHp(state), `getEnemyMaxHp ${nextStage}`).toBe(
        enemyMaxHp(state.combat.stage),
      );
      // Kill gold is the live reward for the killed stage.
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
