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
import { BALANCE, computeGearStats, CURRENT_SAVE_VERSION, enemyMaxHp } from '../src/balance';
import { WEAPON_DEFINITION } from '../src/content';
import { LocalStorageSaveRepository } from '../save/index';
import type { SaveGame } from '../src/types';
import { makeGear, makeState } from './helpers';

describe('save serialization', () => {
  it('round-trips createGame -> saveGame -> loadGame identically', () => {
    // Play a little so rngState, gold, carry, and totals are non-trivial.
    const state = advance(createGame(987654321, 111), 200_000).state;
    const save = saveGame(state, 222);

    expect(save.version).toBe(2);
    expect(save.savedAt).toBe(222);

    // Version 2 persists SOURCE fields only — no derived copies.
    expect('baseAutoDps' in save.state.player).toBe(false);
    expect('baseClickDamage' in save.state.player).toBe(false);
    expect('enemyMaxHp' in save.state.combat).toBe(false);

    const loaded = loadGame(save);
    expect(loaded).toEqual(state);
    expect(loaded.meta.rngState).toBe(state.meta.rngState);

    // Survives JSON transport (localStorage / Supabase jsonb).
    const transported = JSON.parse(JSON.stringify(save)) as SaveGame;
    expect(loadGame(transported)).toEqual(state);
  });

  it('migrates a version-1 save (derived values persisted) to version 2', () => {
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
    expect(loaded.meta.saveVersion).toBe(2);
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

  it('throws on unsupported save versions, naming every accepted version', () => {
    const state = createGame(1, 0);
    expect(() => loadGame({ version: 3, savedAt: 0, state })).toThrow(
      `Unsupported save version 3; expected 1 or ${CURRENT_SAVE_VERSION}`,
    );
    expect(() => loadGame({ version: 0, savedAt: 0, state })).toThrow(
      `Unsupported save version 0; expected 1 or ${CURRENT_SAVE_VERSION}`,
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
      /Invalid save: version 2\.gear\.equipped\.weapon\.definitionId "bogus" does not match a known gear definition/,
    );

    const bagState = makeState({
      bag: [{ id: 'bogus-bag', definitionId: 'bogus', itemLevel: 1, upgradeLevel: 0 }],
    });
    expect(() => loadGame(saveGame(bagState))).toThrow(
      /Invalid save: version 2\.gear\.bag\[0\]\.definitionId "bogus" does not match a known gear definition/,
    );
  });

  it('rejects unknown equipped slot keys so they never reach the loaded state', () => {
    const save = saveGame(createGame(1, 0), 0);
    const state = JSON.parse(JSON.stringify(save.state)) as Record<string, unknown>;
    const gear = state.gear as Record<string, unknown>;

    // A stray slot key ('armor') must not leak past Record<GearSlot, ...>.
    gear.equipped = { weapon: null, armor: null };
    expect(() => loadGame({ version: CURRENT_SAVE_VERSION, savedAt: 0, state } as unknown as SaveGame)).toThrow(
      /Invalid save: version 2\.gear\.equipped\.armor is not a known gear slot \(expected weapon\)/,
    );

    // `__proto__` from JSON.parse is an OWN enumerable key, so it must be
    // rejected like any other unknown slot instead of becoming the prototype.
    gear.equipped = JSON.parse('{"weapon": null, "__proto__": null}') as Record<string, unknown>;
    expect(() => loadGame({ version: CURRENT_SAVE_VERSION, savedAt: 0, state } as unknown as SaveGame)).toThrow(
      /Invalid save: version 2\.gear\.equipped\.__proto__ is not a known gear slot/,
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
