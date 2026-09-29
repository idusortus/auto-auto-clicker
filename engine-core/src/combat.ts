// combat.ts — damage, kills, and stage-entry pacing checks.
//
// Every exported function here mutates the *draft* it is given. Callers must
// pass a state produced by cloneGameState; they then return that draft as the
// new state. Nothing in this file touches the caller's input.

import {
  BOSS_TIMER_MS,
  HARD_WALL_PROJECTED_KILL_MS,
  isBoss,
  TAUNT_BOSS_DEFEAT_CHANCE,
  TAUNT_DEFEAT_CHANCE,
  TAUNT_SPAWN_CHANCE,
  TAUNT_WALL_CHANCE,
} from './balance';
import { enemyForStage, enemyMaxHp } from './content';
import { rollGearDrop } from './loot';
import { getGoldReward, getProjectedKillMs } from './state';
import { makeTaunt } from './taunts';
import type { GameEvent, GameState, GearInstance } from './types';

/**
 * Run the pacing checks for the stage currently entered on `draft`. Hard wall
 * takes precedence over the boss check. Mutates draft.choices.pending and
 * returns the emitted events.
 */
export function evaluateStageEntry(draft: GameState): GameEvent[] {
  const projected = getProjectedKillMs(draft);
  if (projected === null) return [];

  const stage = draft.combat.stage;
  const enemyId = enemyForStage(stage).id;
  if (projected > HARD_WALL_PROJECTED_KILL_MS) {
    draft.choices.pending = { kind: 'progression-wall', stage, options: ['wait', 'watchAd', 'iap'] };
    const events: GameEvent[] = [{ type: 'progressionWall', stage, projectedKillMs: projected }];
    const wall = makeTaunt(draft, 'wall', enemyId, stage, TAUNT_WALL_CHANCE);
    if (wall) events.push(wall);
    return events;
  }
  if (isBoss(stage) && projected > BOSS_TIMER_MS) {
    draft.choices.pending = { kind: 'boss-check', stage, options: ['wait', 'watchAd', 'iap'] };
    const events: GameEvent[] = [{ type: 'bossCheckFailed', stage, projectedKillMs: projected }];
    const wall = makeTaunt(draft, 'wall', enemyId, stage, TAUNT_WALL_CHANCE);
    if (wall) events.push(wall);
    return events;
  }
  return [];
}

/**
 * Resolve exactly one kill on the current stage: award gold, roll a drop,
 * advance the stage, spawn the next enemy, and run stage-entry checks.
 *
 * The live HP and kill gold come from `content.ts` (`enemyMaxHp` / `goldReward`),
 * which evaluate the standing enemy's OWN curve (and its own boss multipliers on
 * a boss stage). The roster therefore supplies both the IDENTITY (`enemyId`) and
 * the live stats, all as a pure function of the stage and so reconstructable
 * from a save with no persisted field.
 */
export function killCurrentEnemy(draft: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const killedStage = draft.combat.stage;
  const killedEnemyId = enemyForStage(killedStage).id;
  const gold = getGoldReward(draft, killedStage);

  draft.player.gold += gold;
  events.push({ type: 'goldChanged', amount: gold, total: draft.player.gold, reason: 'enemyKilled' });

  const drops: GearInstance[] = [];
  const drop = rollGearDrop(draft, killedStage);
  if (drop) drops.push(drop);
  events.push({
    type: 'enemyKilled',
    stage: killedStage,
    gold,
    drops,
    enemyId: killedEnemyId,
  });

  const nextStage = killedStage + 1;
  const nextEnemyId = enemyForStage(nextStage).id;
  const maxHp = enemyMaxHp(nextStage);
  draft.combat.stage = nextStage;
  draft.combat.enemyHp = maxHp;
  events.push({
    type: 'stageEntered',
    stage: nextStage,
    isBoss: isBoss(nextStage),
    maxHp,
    enemyId: nextEnemyId,
  });

  // Boss-aware defeat cue for the enemy just killed, then the spawn cue for the
  // one just entered. Both read the state; neither touches `meta.rngState`.
  const defeat = isBoss(killedStage)
    ? makeTaunt(draft, 'bossDefeat', killedEnemyId, killedStage, TAUNT_BOSS_DEFEAT_CHANCE)
    : makeTaunt(draft, 'defeat', killedEnemyId, killedStage, TAUNT_DEFEAT_CHANCE);
  if (defeat) events.push(defeat);

  const spawn = makeTaunt(draft, 'spawn', nextEnemyId, nextStage, TAUNT_SPAWN_CHANCE);
  if (spawn) events.push(spawn);

  events.push(...evaluateStageEntry(draft));
  return events;
}

/**
 * Apply an integer damage amount to the live enemy. While the damage budget
 * outlives the enemy it kills, the remainder flows into the next enemy within
 * the same call (one large tick may clear several stages). Any leftover budget
 * when a pending choice blocks progression is discarded.
 */
export function applyDamageToEnemy(
  draft: GameState,
  amount: number,
  source: 'auto' | 'click',
): GameEvent[] {
  const events: GameEvent[] = [];
  if (amount <= 0) return events;

  events.push({ type: 'damageDealt', amount, source });

  let remaining = amount;
  let kills = 0;
  while (remaining > 0 && draft.choices.pending === null) {
    const hp = draft.combat.enemyHp;
    if (hp <= 0) break;

    if (remaining < hp) {
      draft.combat.enemyHp = hp - remaining;
      remaining = 0;
      break;
    }

    remaining -= hp;
    events.push(...killCurrentEnemy(draft));
    kills += 1;
    // Defensive guard: progression is always finite, but never loop forever.
    if (kills > 1_000_000) break;
  }
  return events;
}
