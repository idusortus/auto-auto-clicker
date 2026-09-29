// Public type surface for engine-core.
//
// Content definitions (GearDefinition, EnemyDefinition) describe the game
// catalog and never live inside per-player save state. GameState is the only
// thing persisted, wrapped by the versioned SaveGame blob.

export type GearSlot = 'weapon' | 'ring1' | 'ring2' | 'necklace';

export interface GearDefinition {
  id: string;
  slot: GearSlot;
  dpsFactor: number;
  clickFactor: number;
  /**
   * Per-item-level growth factor. Gear stats are EXPONENTIAL in item level
   * (`floor(factor * gearGrowth^(itemLevel - 1))`), so gear drops supply the
   * exponential power term that tracks the exponential enemy-HP curve. This is
   * a content value, never persisted.
   */
  gearGrowth: number;
  upgradeCostBase: number;
  upgradeCostGrowth: number;
  upgradeStatMultiplier: number;
  dropChance: number;
  /**
   * Base effect contributions at item level 1. They scale by the SAME
   * `gearGrowth^(itemLevel - 1)` (and upgrade multiplier) as the weapon stats,
   * so a slot's effect tracks item level just like `dpsFactor`/`clickFactor`.
   * All four are 0 for slots that do not provide that effect; `critChance` and
   * `critMultiplier` come from rings, `goldMultiplier`/`powerMultiplier` from
   * the necklace.
   *
   * `critMultiplier` is a CONTRIBUTION to the critical-damage bonus: the total
   * critical multiplier is `1 + sum(contributions)`, so a contribution of 0.5
   * means critical hits deal 1.5x. A contribution of 0 therefore leaves the
   * total at the neutral 1x and cannot turn a crit into a penalty.
   */
  critChance: number;
  critMultiplier: number;
  goldMultiplier: number;
  powerMultiplier: number;
}

export interface EnemyDefinition {
  id: string;
  baseHp: number;
  hpGrowth: number;
  baseGold: number;
  goldGrowth: number;
  bossStageInterval: number;
  bossHpMultiplier: number;
  bossGoldMultiplier: number;
  /**
   * Distinct encounter profile (content, never persisted). `hpFactor` /
   * `goldFactor` are relative-to-canonical leanings, normalised so the
   * arithmetic mean over one full roster cycle is exactly 1.0. They are a
   * DERIVED layer: combat's live HP/gold stay on the canonical stage-only curve
   * (`enemyMaxHp` / `goldReward`), so the pacing proof stays byte-identical.
   * Applying these factors to the live curve drifts the pacing (measured in
   * `enemy-roster.test.ts`; see also decisions.md).
   */
  hpFactor: number;
  goldFactor: number;
  /** Stable archetype label (content identity; never persisted). */
  archetype: string;
}

// SOURCE fields only. Battle stats (`dps`, `clickDamage`) are derived from
// `(definitionId, itemLevel, upgradeLevel)` via `computeGearStats` and are
// computed on read, never persisted.
export interface GearInstance {
  id: string;
  definitionId: string;
  itemLevel: number;
  upgradeLevel: number;
}

export interface PendingChoice {
  kind: 'boss-check' | 'progression-wall';
  stage: number;
  options: ('wait' | 'watchAd' | 'iap')[];
}

/**
 * The three Golden-Event reward types ("Shinies"). `frenzy` applies a short,
 * dramatic temporary damage multiplier (tempo); `drop` grants a guaranteed gear
 * drop at the current stage (feeds the designed drops lever); `cache` grants a
 * lump of gold (the deliberately minor lever). All are bonus-only: missing one
 * has no penalty.
 */
export type ShinyKind = 'frenzy' | 'cache' | 'drop';

/** A currently spawnable/collectable Shiny. SOURCE fields only. */
export interface ActiveShiny {
  kind: ShinyKind;
  /** `meta.totalPlayedMs` basis when it appeared. */
  spawnedAtMs: number;
  /** `meta.totalPlayedMs` basis after which it is gone (no penalty). */
  expiresAtMs: number;
}

/** A temporary damage multiplier. SOURCE fields only. */
export interface ActiveBoost {
  dpsMultiplier: number;
  expiresAtMs: number;
}

export interface GameState {
  meta: {
    saveVersion: number;
    seed: number;
    rngState: number;
    createdAt: number;
    totalPlayedMs: number;
    /**
     * Ids of unlocked achievements. Only ids are persisted; the catalog lives
     * in content-like static data (`achievements.ts`), never in save state.
     */
    achievements: string[];
  };
  // SOURCE fields only. The base auto/click stats are `BALANCE.baseAutoDps` /
  // `BALANCE.baseClickDamage`; the enemy's max HP is `enemyMaxHp(combat.stage)`.
  // All three are computed on read via `getEffectiveStats` / `getEnemyMaxHp`.
  player: {
    gold: number;
  };
  combat: {
    stage: number;
    enemyHp: number;
    damageCarry: number;
  };
  gear: {
    equipped: Record<GearSlot, GearInstance | null>;
    bag: GearInstance[];
    nextInstanceId: number;
  };
  choices: {
    pending: PendingChoice | null;
  };
  // Golden Events ("Shinies"). `event` is always present (its `active` is
  // nullable); `boost` is null while no frenzy is running. SOURCE fields only:
  // the multiplier / cache formula are recomputed from balance.ts on read.
  event: {
    /** Currently spawnable/collectable Shiny, or null. */
    active: ActiveShiny | null;
    /** How many Shinies have spawned this save (drives the tutorial cadence). */
    spawned: number;
    /** `meta.totalPlayedMs` basis when the next spawn becomes eligible. */
    nextSpawnAtMs: number;
  };
  boost: ActiveBoost | null;
}

export type Action =
  | { type: 'click' }
  | { type: 'equip'; instanceId: string }
  | { type: 'upgradeEquipped'; slot: GearSlot }
  | { type: 'resolveChoice'; choice: 'wait' | 'watchAd' | 'iap' }
  | { type: 'claimEvent' };

/** Semantic taunt trigger classes. The engine emits the kind; the theme owns the text. */
export type TauntKind = 'spawn' | 'defeat' | 'bossDefeat' | 'wall' | 'shiny' | 'ambient';

/**
 * A deterministic, engine-emitted enemy catchphrase cue. The engine NEVER emits
 * display text: it emits the stable `enemyId`, the semantic `kind`, and a
 * bounded `phraseIndex` into a nominal phrase table; the active theme resolves
 * the wording. The index comes from a SEPARATE derived RNG channel, so it never
 * consumes `meta.rngState` and cannot shift the loot stream (see taunts.ts).
 */
export interface EnemyTauntEvent {
  type: 'enemyTaunt';
  enemyId: string;
  kind: TauntKind;
  phraseIndex: number;
}

export type GameEvent =
  | { type: 'stageEntered'; stage: number; isBoss: boolean; maxHp: number; enemyId: string }
  | { type: 'damageDealt'; amount: number; source: 'auto' | 'click' }
  | { type: 'enemyKilled'; stage: number; gold: number; drops: GearInstance[]; enemyId: string }
  | { type: 'gearEquipped'; instanceId: string }
  | { type: 'gearUpgraded'; instanceId: string; upgradeLevel: number; goldCost: number }
  | {
      type: 'milestoneReached';
      slot: GearSlot;
      upgradeLevel: number;
      description: string;
    }
  | { type: 'goldChanged'; amount: number; total: number; reason: string }
  | { type: 'bossCheckFailed'; stage: number; projectedKillMs: number }
  | { type: 'progressionWall'; stage: number; projectedKillMs: number }
  | { type: 'choiceResolved'; choice: 'wait' | 'watchAd' | 'iap' }
  | { type: 'achievementUnlocked'; id: string; title: string }
  | { type: 'eventSpawned'; kind: ShinyKind }
  | { type: 'eventClaimed'; kind: ShinyKind }
  | { type: 'eventExpired'; kind: ShinyKind }
  | { type: 'boostActivated'; dpsMultiplier: number; expiresAtMs: number }
  | { type: 'boostExpired' }
  | EnemyTauntEvent;

export interface SaveGame {
  version: number;
  savedAt: number;
  state: GameState;
}
