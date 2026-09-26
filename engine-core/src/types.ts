// Public type surface for engine-core.
//
// Content definitions (GearDefinition, EnemyDefinition) describe the game
// catalog and never live inside per-player save state. GameState is the only
// thing persisted, wrapped by the versioned SaveGame blob.

export type GearSlot = 'weapon';

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

export interface GameState {
  meta: {
    saveVersion: number;
    seed: number;
    rngState: number;
    createdAt: number;
    totalPlayedMs: number;
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
}

export type Action =
  | { type: 'click' }
  | { type: 'equip'; instanceId: string }
  | { type: 'upgradeEquipped'; slot: GearSlot }
  | { type: 'resolveChoice'; choice: 'wait' | 'watchAd' | 'iap' };

export type GameEvent =
  | { type: 'stageEntered'; stage: number; isBoss: boolean; maxHp: number }
  | { type: 'damageDealt'; amount: number; source: 'auto' | 'click' }
  | { type: 'enemyKilled'; stage: number; gold: number; drops: GearInstance[] }
  | { type: 'gearEquipped'; instanceId: string }
  | { type: 'gearUpgraded'; instanceId: string; upgradeLevel: number; goldCost: number }
  | { type: 'goldChanged'; amount: number; total: number; reason: string }
  | { type: 'bossCheckFailed'; stage: number; projectedKillMs: number }
  | { type: 'progressionWall'; stage: number; projectedKillMs: number }
  | { type: 'choiceResolved'; choice: 'wait' | 'watchAd' | 'iap' };

export interface SaveGame {
  version: number;
  savedAt: number;
  state: GameState;
}
