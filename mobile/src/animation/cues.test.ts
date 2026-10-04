// cues.test.ts — task 3.1: the PURE event → cue mapping.
//
// Verifies the port of `/web`'s `handleEvents` semantics: boss vs normal frame
// choice, kill-beats-hit within one batch, and ties going to the last occurrence.

import type { GameEvent } from '@auto-auto-clicker/engine-core';

import { ANIMATION_TARGETS, CUE_PRIORITY, collectCueWinners } from './cues';

/** Build a stageEntered event with the fields cues.ts reads. */
function stageEntered(stage: number): GameEvent {
  return { type: 'stageEntered', stage, isBoss: false, maxHp: 100, enemyId: 'rat' };
}

describe('collectCueWinners (3.1)', () => {
  it('maps a click damage event to the player and the enemy', () => {
    const winners = collectCueWinners(
      [{ type: 'damageDealt', amount: 5, source: 'click' }],
      1,
    );
    expect(winners.player).toBe('playerAttack');
    expect(winners.enemy).toBe('enemyHit');
  });

  it('maps a non-click damage event to the enemy only', () => {
    const winners = collectCueWinners([{ type: 'damageDealt', amount: 5, source: 'auto' }], 1);
    expect(winners.player).toBeUndefined();
    expect(winners.enemy).toBe('enemyHit');
  });

  it('selects the boss frame on a boss stage and the normal frame otherwise', () => {
    const normal = collectCueWinners([{ type: 'damageDealt', amount: 1, source: 'auto' }], 1);
    expect(normal.enemy).toBe('enemyHit');

    const boss = collectCueWinners([{ type: 'damageDealt', amount: 1, source: 'auto' }], 10);
    expect(boss.enemy).toBe('bossHit');
  });

  it('selects the boss death frame from the killed stage', () => {
    const normal = collectCueWinners(
      [{ type: 'enemyKilled', stage: 3, gold: 1, drops: [], enemyId: 'rat' }],
      3,
    );
    expect(normal.enemy).toBe('enemyDeath');

    const boss = collectCueWinners(
      [{ type: 'enemyKilled', stage: 10, gold: 1, drops: [], enemyId: 'rat' }],
      10,
    );
    expect(boss.enemy).toBe('bossDeath');
  });

  it('lets a kill beat a same-batch hit for the same actor', () => {
    const winners = collectCueWinners(
      [
        { type: 'damageDealt', amount: 5, source: 'auto' },
        { type: 'enemyKilled', stage: 1, gold: 1, drops: [], enemyId: 'rat' },
      ],
      1,
    );
    expect(winners.enemy).toBe('enemyDeath');
  });

  it('ties go to the LAST occurrence within a batch', () => {
    // Two same-priority hits: the loser is the earlier one but the winner is
    // defined only by priority, so use two targets at equal priority and verify
    // last-wins via a same-priority pair on the enemy (enemyHit / bossHit = 3).
    // A later normal hit after a boss hit must win by position, not content.
    const winners = collectCueWinners(
      [
        { type: 'enemyKilled', stage: 10, gold: 1, drops: [], enemyId: 'rat' }, // bossDeath (6)
        { type: 'enemyKilled', stage: 3, gold: 1, drops: [], enemyId: 'rat' }, // enemyDeath (6)
      ],
      3,
    );
    expect(winners.enemy).toBe('enemyDeath');
  });

  it('applies `stageEntered` before later events in the same batch', () => {
    // A tick enters a boss stage and then deals damage. The post-entry damage
    // must use the BOSS hit frame (the running stage advanced mid-batch).
    const winners = collectCueWinners(
      [
        stageEntered(10),
        { type: 'damageDealt', amount: 5, source: 'auto' },
      ],
      1,
    );
    expect(winners.enemy).toBe('bossHit');
    expect(winners.global).toBe('stageEntered');
  });

  it('maps shiny spawn and claim and ignores taunts/other events', () => {
    const spawned = collectCueWinners([{ type: 'eventSpawned', kind: 'frenzy' }], 1);
    expect(spawned.shiny).toBe('shinySpawn');

    const claimed = collectCueWinners([{ type: 'eventClaimed', kind: 'cache' }], 1);
    expect(claimed.shiny).toBe('shinyClaim');

    const taunt = collectCueWinners(
      [{ type: 'enemyTaunt', enemyId: 'rat', kind: 'ambient', phraseIndex: 0 }],
      1,
    );
    expect(taunt).toEqual({});
  });

  it('keeps the declared relative cue priority', () => {
    expect(CUE_PRIORITY.bossDeath).toBe(CUE_PRIORITY.enemyDeath);
    expect(CUE_PRIORITY.enemyDeath).toBeGreaterThan(CUE_PRIORITY.stageEntered);
    expect(CUE_PRIORITY.stageEntered).toBeGreaterThan(CUE_PRIORITY.playerAttack);
    expect(CUE_PRIORITY.playerAttack).toBeGreaterThan(CUE_PRIORITY.enemyHit);
    expect(CUE_PRIORITY.enemyHit).toBe(CUE_PRIORITY.bossHit);
    expect(CUE_PRIORITY.bossHit).toBeGreaterThan(CUE_PRIORITY.shinySpawn);
    expect(CUE_PRIORITY.shinySpawn).toBeGreaterThan(CUE_PRIORITY.shinyClaim);
    expect(ANIMATION_TARGETS).toEqual(['player', 'enemy', 'shiny', 'global']);
  });
});
