import { afterEach, describe, expect, it } from 'vitest';
import {
  advance,
  createGame,
  getEffectiveStats,
  getEnemyMaxHp,
  getGearStats,
  loadGame,
  saveGame,
} from '../src/index';
import { BALANCE, computeGearStats, CURRENT_SAVE_VERSION, enemyMaxHp, shinySpawnDelayMs } from '../src/balance';
import { WEAPON_DEFINITION } from '../src/content';
import { LocalStorageSaveRepository } from '../save/index';
import type { SaveGame } from '../src/types';
import { makeGear, makeState } from './helpers';

describe('save serialization', () => {
  it('round-trips createGame -> saveGame -> loadGame identically', () => {
    // Play a little so rngState, gold, carry, and totals are non-trivial.
    const state = advance(createGame(987654321, 111), 200_000).state;
    const save = saveGame(state, 222);

    expect(save.version).toBe(4);
    expect(save.savedAt).toBe(222);

    // Version 4 persists SOURCE fields only — no derived copies.
    expect('baseAutoDps' in save.state.player).toBe(false);
    expect('baseClickDamage' in save.state.player).toBe(false);
    expect('enemyMaxHp' in save.state.combat).toBe(false);
    expect('dpsMultiplier' in save.state.event).toBe(false);
    expect('boostMultiplier' in save.state.event).toBe(false);

    const loaded = loadGame(save);
    expect(loaded).toEqual(state);
    expect(loaded.meta.rngState).toBe(state.meta.rngState);

    // Survives JSON transport (localStorage / Supabase jsonb).
    const transported = JSON.parse(JSON.stringify(save)) as SaveGame;
    expect(loadGame(transported)).toEqual(state);
  });

  it('migrates a version-1 save (derived values persisted) forward to version 4', () => {
    // A hand-built version-1 state: it carries the derived copies v2 dropped —
    // the base stat copies, the enemy max-HP copy, and per-instance dps/click.
    const v1Weapon = { ...makeGear(30, 2, 'stale-equipped'), dps: 84, clickDamage: 84 };
    const v1BagItem = { ...makeGear(5, 0, 'stale-bag'), dps: -1, clickDamage: -1 };
    const v1State = {
      meta: { saveVersion: 1, seed: 7, rngState: 7, createdAt: 0, totalPlayedMs: 0 },
      player: { gold: 123, baseAutoDps: 2, baseClickDamage: 2 },
      combat: { stage: 5, enemyHp: 42, enemyMaxHp: 999, damageCarry: 0.25 },
      gear: { equipped: { weapon: v1Weapon }, bag: [v1BagItem], nextInstanceId: 11 },
      choices: { pending: null },
    };
    const save = { version: 1, savedAt: 0, state: v1State } as unknown as SaveGame;

    const loaded = loadGame(save);

    // Derived copies are gone from the migrated v2 state.
    expect('baseAutoDps' in loaded.player).toBe(false);
    expect('baseClickDamage' in loaded.player).toBe(false);
    expect('enemyMaxHp' in loaded.combat).toBe(false);
    const migratedWeapon = loaded.gear.equipped.weapon;
    const migratedBagItem = loaded.gear.bag[0];
    expect(migratedWeapon).not.toBeNull();
    expect(migratedBagItem).toBeDefined();
    expect('dps' in (migratedWeapon as object)).toBe(false);
    expect('clickDamage' in (migratedWeapon as object)).toBe(false);
    expect('dps' in (migratedBagItem as object)).toBe(false);
    expect('clickDamage' in (migratedBagItem as object)).toBe(false);

    // Source fields survive untouched (instances reduced to their source shape).
    expect(loaded.meta.saveVersion).toBe(4);
    expect(loaded.player.gold).toBe(123);
    expect(loaded.combat.stage).toBe(5);
    expect(loaded.combat.enemyHp).toBe(42);
    expect(loaded.combat.damageCarry).toBe(0.25);
    expect(loaded.gear.nextInstanceId).toBe(11);
    expect(migratedWeapon).toEqual({
      id: 'stale-equipped',
      definitionId: 'weapon',
      itemLevel: 30,
      upgradeLevel: 2,
    });
    expect(migratedBagItem).toEqual({
      id: 'stale-bag',
      definitionId: 'weapon',
      itemLevel: 5,
      upgradeLevel: 0,
    });

    // Derived values are computed on read from the CURRENT formula, not the
    // stale copies the v1 blob carried.
    expect(getEnemyMaxHp(loaded)).toBe(enemyMaxHp(5));
    const expectedWeapon = computeGearStats(WEAPON_DEFINITION, 30, 2);
    if (migratedWeapon) expect(getGearStats(migratedWeapon)).toEqual(expectedWeapon);
    const stats = getEffectiveStats(loaded);
    expect(stats.autoDps).toBe(BALANCE.baseAutoDps + expectedWeapon.dps);
    expect(stats.clickDamage).toBe(BALANCE.baseClickDamage + expectedWeapon.clickDamage);
    expect(stats.autoDps).not.toBe(BALANCE.baseAutoDps + 84);
  });

  it('migrates a version-2 save with no ring/necklace/achievements fields to version 4', () => {
    // A version-2 blob predates ring/necklace slots and achievements. It has a
    // single weapon equipped and nothing else in the four-slot map.
    const v2Weapon = makeGear(8, 1, 'v2-weapon');
    const v2State = {
      meta: { saveVersion: 2, seed: 9, rngState: 9, createdAt: 0, totalPlayedMs: 5000 },
      player: { gold: 77 },
      combat: { stage: 12, enemyHp: 345, damageCarry: 0.5 },
      gear: { equipped: { weapon: v2Weapon }, bag: [], nextInstanceId: 3 },
      choices: { pending: null },
    };
    const save = { version: 2, savedAt: 0, state: v2State } as unknown as SaveGame;

    const loaded = loadGame(save);

    expect(loaded.meta.saveVersion).toBe(4);
    // New in v3: every missing slot defaults to null and achievements to [].
    expect(loaded.gear.equipped).toEqual({
      weapon: v2Weapon,
      ring1: null,
      ring2: null,
      necklace: null,
    });
    expect(loaded.meta.achievements).toEqual([]);
    // New in v4: a fresh Golden-Event schedule and no boost.
    expect(loaded.event).toEqual({ active: null, spawned: 0, nextSpawnAtMs: shinySpawnDelayMs(0) });
    expect(loaded.boost).toBeNull();
    // Everything else survives untouched.
    expect(loaded.player.gold).toBe(77);
    expect(loaded.combat.stage).toBe(12);
    expect(loaded.combat.enemyHp).toBe(345);
    expect(loaded.combat.damageCarry).toBe(0.5);
    expect(loaded.gear.nextInstanceId).toBe(3);
    expect(loaded.meta.totalPlayedMs).toBe(5000);
  });

  it('migrates a version-3 save with no event/boost fields to version 4', () => {
    // A v3 blob has rings/necklaces/achievements but predates Golden Events.
    const v3Weapon = makeGear(12, 2, 'v3-weapon');
    const v3State = {
      meta: {
        saveVersion: 3,
        seed: 11,
        rngState: 11,
        createdAt: 0,
        totalPlayedMs: 90_000,
        achievements: ['first-blood'],
      },
      player: { gold: 500 },
      combat: { stage: 21, enemyHp: 1234, damageCarry: 0.125 },
      gear: {
        equipped: { weapon: v3Weapon, ring1: null, ring2: null, necklace: null },
        bag: [],
        nextInstanceId: 4,
      },
      choices: { pending: null },
    };
    const save = { version: 3, savedAt: 0, state: v3State } as unknown as SaveGame;

    const loaded = loadGame(save);

    expect(loaded.meta.saveVersion).toBe(4);
    // New fields default; the v3 source fields are preserved verbatim.
    expect(loaded.event).toEqual({ active: null, spawned: 0, nextSpawnAtMs: shinySpawnDelayMs(0) });
    expect(loaded.boost).toBeNull();
    expect(loaded.meta.achievements).toEqual(['first-blood']);
    expect(loaded.player.gold).toBe(500);
    expect(loaded.combat.stage).toBe(21);
    expect(loaded.combat.enemyHp).toBe(1234);
    expect(loaded.meta.totalPlayedMs).toBe(90_000);
  });

  it('migrates a version-1 save with no new fields and keeps v1->v4 defaults', () => {
    const v1State = {
      meta: { saveVersion: 1, seed: 3, rngState: 3, createdAt: 0, totalPlayedMs: 10 },
      player: { gold: 5, baseAutoDps: 2, baseClickDamage: 2 },
      combat: { stage: 2, enemyHp: 20, enemyMaxHp: 999, damageCarry: 0 },
      gear: { equipped: { weapon: null }, bag: [], nextInstanceId: 1 },
      choices: { pending: null },
    };
    const save = { version: 1, savedAt: 0, state: v1State } as unknown as SaveGame;

    const loaded = loadGame(save);

    expect(loaded.meta.saveVersion).toBe(4);
    expect(loaded.gear.equipped).toEqual({
      weapon: null,
      ring1: null,
      ring2: null,
      necklace: null,
    });
    expect(loaded.meta.achievements).toEqual([]);
    expect(loaded.event).toEqual({ active: null, spawned: 0, nextSpawnAtMs: shinySpawnDelayMs(0) });
    expect(loaded.boost).toBeNull();
  });

  it('round-trips an active Golden Event and a frenzy boost', () => {
    const state = makeState({
      totalPlayedMs: 40_000,
      spawned: 2,
      nextSpawnAtMs: 130_000,
      activeEvent: { kind: 'frenzy', spawnedAtMs: 39_000, expiresAtMs: 49_000 },
      boost: { dpsMultiplier: 5, expiresAtMs: 55_000 },
    });
    const loaded = loadGame(saveGame(state));

    expect(loaded.event).toEqual({
      active: { kind: 'frenzy', spawnedAtMs: 39_000, expiresAtMs: 49_000 },
      spawned: 2,
      nextSpawnAtMs: 130_000,
    });
    expect(loaded.boost).toEqual({ dpsMultiplier: 5, expiresAtMs: 55_000 });
  });

  it('round-trips a `drop` Shiny (same v4 shape, new kind value)', () => {
    const state = makeState({
      totalPlayedMs: 30_000,
      spawned: 1,
      nextSpawnAtMs: 181_000,
      activeEvent: { kind: 'drop', spawnedAtMs: 29_000, expiresAtMs: 39_000 },
    });
    const loaded = loadGame(saveGame(state));

    expect(loaded.event).toEqual({
      active: { kind: 'drop', spawnedAtMs: 29_000, expiresAtMs: 39_000 },
      spawned: 1,
      nextSpawnAtMs: 181_000,
    });
  });

  it('rejects malformed Golden Event fields', () => {
    const base = saveGame(createGame(1, 0), 0);
    const mutate = (patch: (state: Record<string, unknown>) => void): (() => void) => {
      const copy = JSON.parse(JSON.stringify(base.state)) as Record<string, unknown>;
      patch(copy);
      return () =>
        loadGame({ version: CURRENT_SAVE_VERSION, savedAt: 0, state: copy } as unknown as SaveGame);
    };

    expect(
      mutate((state) => {
        (state.event as Record<string, unknown>).active = {
          kind: 'jackpot',
          spawnedAtMs: 0,
          expiresAtMs: 1,
        };
      }),
    ).toThrow(/Invalid save: version 4\.event\.active\.kind must be 'frenzy', 'cache', or 'drop'/);

    expect(
      mutate((state) => {
        (state.event as Record<string, unknown>).spawned = 1.5;
      }),
    ).toThrow(/Invalid save: version 4\.event\.spawned must be a non-negative integer/);

    expect(
      mutate((state) => {
        (state.event as Record<string, unknown>).nextSpawnAtMs = Number.NaN;
      }),
    ).toThrow(/Invalid save: version 4\.event\.nextSpawnAtMs must be a finite number/);

    expect(
      mutate((state) => {
        state.boost = { dpsMultiplier: 'lots', expiresAtMs: 1 };
      }),
    ).toThrow(/Invalid save: version 4\.boost\.dpsMultiplier must be a finite number/);
  });

  it('persists and validates unlocked achievement ids', () => {
    const state = makeState({ achievements: ['first-blood', 'geared-up'] });
    const loaded = loadGame(saveGame(state));
    expect(loaded.meta.achievements).toEqual(['first-blood', 'geared-up']);

    // Non-string entries are rejected.
    const save = saveGame(createGame(1, 0));
    const raw = JSON.parse(JSON.stringify(save)) as { state: { meta: Record<string, unknown> } };
    raw.state.meta.achievements = ['first-blood', 42];
    expect(() => loadGame({ version: 4, savedAt: 0, state: raw.state } as unknown as SaveGame)).toThrow(
      /Invalid save: version 4\.meta\.achievements\[1\] must be a string/,
    );

    // A non-array value is rejected.
    raw.state.meta.achievements = 'first-blood';
    expect(() => loadGame({ version: 4, savedAt: 0, state: raw.state } as unknown as SaveGame)).toThrow(
      /Invalid save: version 4\.meta\.achievements must be an array of strings/,
    );
  });

  it('drops unknown achievement ids and collapses duplicates on load', () => {
    // A save whose id list drifted from the current catalog: an id that no
    // longer exists and a repeated id. Both recover by filtering, not by
    // rejecting the whole save.
    const state = makeState({
      achievements: ['first-blood', 'not-a-real-achievement', 'geared-up', 'first-blood'],
    });
    const loaded = loadGame(saveGame(state));
    expect(loaded.meta.achievements).toEqual(['first-blood', 'geared-up']);
  });

  it('throws on unsupported save versions, naming every accepted version', () => {
    const state = createGame(1, 0);
    expect(() => loadGame({ version: 5, savedAt: 0, state })).toThrow(
      `Unsupported save version 5; expected 1, 2, 3, or ${CURRENT_SAVE_VERSION}`,
    );
    expect(() => loadGame({ version: 0, savedAt: 0, state })).toThrow(
      `Unsupported save version 0; expected 1, 2, 3, or ${CURRENT_SAVE_VERSION}`,
    );
  });

  it('rejects a save whose gear definitionId does not resolve to a definition', () => {
    const equippedState = makeState({
      equippedWeapon: {
        id: 'bogus-equipped',
        definitionId: 'bogus',
        itemLevel: 1,
        upgradeLevel: 0,
      },
    });
    expect(() => loadGame(saveGame(equippedState))).toThrow(
      /Invalid save: version 4\.gear\.equipped\.weapon\.definitionId "bogus" does not match a known gear definition/,
    );

    const bagState = makeState({
      bag: [{ id: 'bogus-bag', definitionId: 'bogus', itemLevel: 1, upgradeLevel: 0 }],
    });
    expect(() => loadGame(saveGame(bagState))).toThrow(
      /Invalid save: version 4\.gear\.bag\[0\]\.definitionId "bogus" does not match a known gear definition/,
    );
  });

  it('rejects unknown equipped slot keys so they never reach the loaded state', () => {
    const save = saveGame(createGame(1, 0), 0);
    const state = JSON.parse(JSON.stringify(save.state)) as Record<string, unknown>;
    const gear = state.gear as Record<string, unknown>;

    // A stray slot key ('armor') must not leak past Record<GearSlot, ...>.
    gear.equipped = { weapon: null, armor: null };
    expect(() => loadGame({ version: CURRENT_SAVE_VERSION, savedAt: 0, state } as unknown as SaveGame)).toThrow(
      /Invalid save: version 4\.gear\.equipped\.armor is not a known gear slot \(expected weapon, ring1, ring2, necklace\)/,
    );

    // `__proto__` from JSON.parse is an OWN enumerable key, so it must be
    // rejected like any other unknown slot instead of becoming the prototype.
    gear.equipped = JSON.parse('{"weapon": null, "__proto__": null}') as Record<string, unknown>;
    expect(() => loadGame({ version: CURRENT_SAVE_VERSION, savedAt: 0, state } as unknown as SaveGame)).toThrow(
      /Invalid save: version 4\.gear\.equipped\.__proto__ is not a known gear slot/,
    );
  });

  it('throws a descriptive error for a valid version with a missing or invalid state', () => {
    const nullState = { version: 1, savedAt: 0, state: null } as unknown as SaveGame;
    expect(() => loadGame(nullState)).toThrow(/version 1 has a missing or invalid state/);

    const missingState = { version: 1, savedAt: 0 } as unknown as SaveGame;
    expect(() => loadGame(missingState)).toThrow(/version 1 has a missing or invalid state/);

    const arrayState = { version: 1, savedAt: 0, state: [] } as unknown as SaveGame;
    expect(() => loadGame(arrayState)).toThrow(/version 1 has a missing or invalid state/);

    const v2NullState = { version: 2, savedAt: 0, state: null } as unknown as SaveGame;
    expect(() => loadGame(v2NullState)).toThrow(/version 2 has a missing or invalid state/);
  });
});

describe('LocalStorageSaveRepository', () => {
  const globals = globalThis as { localStorage?: unknown };
  const original = globals.localStorage;

  afterEach(() => {
    if (original === undefined) delete globals.localStorage;
    else globals.localStorage = original;
  });

  it('round-trips through an injected localStorage', async () => {
    const store = new Map<string, string>();
    globals.localStorage = {
      getItem: (key: string) => (store.has(key) ? store.get(key) ?? null : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };

    const repo = new LocalStorageSaveRepository('unit.test.key');
    expect(await repo.load()).toBeNull();

    const save = saveGame(createGame(5, 0), 7);
    await repo.save(save);
    expect(await repo.load()).toEqual(save);
  });

  it('resolves null when storage is missing and rejects on save', async () => {
    delete globals.localStorage;

    const repo = new LocalStorageSaveRepository();
    expect(await repo.load()).toBeNull();
    await expect(repo.save(saveGame(createGame(5, 0)))).rejects.toThrow(
      /localStorage is not available/,
    );
  });
});
