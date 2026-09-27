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
  GOLD_MULTIPLIER_CAP,
  HARD_WALL_PROJECTED_KILL_MS,
  isBoss,
  POWER_MULTIPLIER_CAP,
  SLOT_DROP_WEIGHTS,
} from './balance';

export {
  CONTENT,
  gearDefinitionFor,
  GRUNT_DEFINITION,
  NECKLACE_DEFINITION,
  RING_DEFINITION,
  RING_DEFINITION_2,
  WEAPON_DEFINITION,
} from './content';

export {
  cloneGameState,
  createGame,
  getChoiceGoldGrant,
  getCritStats,
  getEffectiveStats,
  getEnemyMaxHp,
  getGearStats,
  getGlobalBonuses,
  getGoldReward,
  getProjectedKillMs,
  getUpgradeCost,
  loadGame,
  saveGame,
} from './state';

export { ACHIEVEMENTS, evaluateAchievements, grantAchievements } from './achievements';

export { advance } from './advance';
export { applyAction } from './actions';

export type { GearStats } from './balance';

export type {
  AchievementContext,
  AchievementDefinition,
} from './achievements';

export type {
  Action,
  EnemyDefinition,
  GameEvent,
  GameState,
  GearDefinition,
  GearInstance,
  GearSlot,
  PendingChoice,
  SaveGame,
} from './types';

export type { SaveRepository } from '../save/repository';
export { LocalStorageSaveRepository } from '../save/localStorage';
