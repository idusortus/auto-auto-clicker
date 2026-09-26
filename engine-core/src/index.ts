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
  CURRENT_SAVE_VERSION,
  HARD_WALL_PROJECTED_KILL_MS,
  isBoss,
} from './balance';

export { CONTENT, GRUNT_DEFINITION, WEAPON_DEFINITION } from './content';

export {
  cloneGameState,
  createGame,
  getEffectiveStats,
  getEnemyMaxHp,
  getGearStats,
  getProjectedKillMs,
  getUpgradeCost,
  loadGame,
  saveGame,
} from './state';

export { advance } from './advance';
export { applyAction } from './actions';

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
