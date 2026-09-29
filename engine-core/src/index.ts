// engine-core — pure, platform-agnostic idle-game simulation.
//
// This is the permanent artifact of the project. It contains no DOM, React
// Native, network, or save-backend imports; persistence lives behind the
// SaveRepository interface in ./save.

export {
  ACTIVE_CLICKS_PER_SECOND,
  BAG_CAP,
  BALANCE,
  BOSS_TIMER_MS,
  CRIT_CHANCE_CAP,
  CRIT_MULTIPLIER_CAP,
  CURRENT_SAVE_VERSION,
  GEAR_SLOTS,
  GOLD_MULTIPLIER_CAP,
  HARD_WALL_PROJECTED_KILL_MS,
  isBoss,
  POWER_MULTIPLIER_CAP,
  SHINY_BASE_CADENCE_MS,
  SHINY_CACHE_GOLD_MULTIPLE,
  SHINY_DROP_SHARE,
  SHINY_FRENZY_DURATION_MS,
  SHINY_FRENZY_MULTIPLIER,
  SHINY_FRENZY_SHARE,
  SHINY_MIN_GAP_MS,
  SHINY_SPAWN_CHANCE,
  SHINY_TUTORIAL_DELAYS_MS,
  SHINY_WINDOW_MS,
  shinySpawnDelayMs,
  shinySpawnRoll,
  SLOT_DROP_WEIGHTS,
  STALL_HINT_MS,
  STALL_NAG_MS,
  TAUNT_AMBIENT_CHANCE,
  TAUNT_AMBIENT_INTERVAL_MS,
  TAUNT_BOSS_DEFEAT_CHANCE,
  TAUNT_DEFEAT_CHANCE,
  TAUNT_NOMINAL_PHRASES,
  TAUNT_SHINY_CHANCE,
  TAUNT_SPAWN_CHANCE,
  TAUNT_WALL_CHANCE,
  UPGRADE_MILESTONE_BONUS,
  UPGRADE_MILESTONE_INTERVAL,
  upgradeMilestoneCount,
} from './balance';

export {
  CONTENT,
  ENEMY_ROSTER,
  enemyForStage,
  enemyMaxHp,
  gearDefinitionFor,
  goldReward,
  GRUNT_DEFINITION,
  NECKLACE_DEFINITION,
  RING_DEFINITION,
  RING_DEFINITION_2,
  WEAPON_DEFINITION,
} from './content';

export {
  cloneGameState,
  createGame,
  getActiveBoost,
  getActiveEvent,
  getBoostMultiplier,
  getChoiceGoldGrant,
  getCritStats,
  getEffectiveStats,
  getEnemyMaxHp,
  getGearStats,
  getGlobalBonuses,
  getGoldReward,
  getMilestoneInfo,
  getProjectedKillMs,
  getShinyCacheGold,
  getSlotMilestones,
  getUpgradeCost,
  isUnarmed,
  loadGame,
  powerScore,
  saveGame,
  scoreWithEquip,
} from './state';

export {
  getSlotUpgradeAdvisory,
  getStallAdvisory,
} from './advisory';

export { ACHIEVEMENTS, evaluateAchievements, grantAchievements } from './achievements';

export { ACTIVE_THEME, fantasy } from './theme';
export type {
  AchievementCopy,
  AnimationCueKey,
  EnemyDisplayEntry,
  Theme,
  ThemeAnimation,
  ThemeAnimationCue,
} from './theme';

export { advance } from './advance';
export { applyAction } from './actions';

export type { GearStats, MilestoneBonus } from './balance';

export type {
  AdvisorySeverity,
  SlotUpgradeAdvisory,
  StallAdvisory,
} from './advisory';

export type { MilestoneInfo } from './state';

export type {
  AchievementContext,
  AchievementDefinition,
} from './achievements';

export type {
  Action,
  ActiveBoost,
  ActiveShiny,
  EnemyDefinition,
  EnemyTauntEvent,
  GameEvent,
  GameState,
  GearDefinition,
  GearInstance,
  GearSlot,
  PendingChoice,
  SaveGame,
  ShinyKind,
  TauntKind,
} from './types';

export type { SaveRepository } from '../save/repository';
export { LocalStorageSaveRepository } from '../save/localStorage';
