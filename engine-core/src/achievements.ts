// achievements.ts — static achievement catalog + pure evaluator.
//
// Achievements are static CONTENT, not save state: GameState.meta.achievements
// stores only the unlocked ids. The catalog never reads the RNG or mutates
// anything, so unlocking cannot perturb balance or the RNG stream.
//
// IDENTITY vs DISPLAY: this file owns the stable `id` and the pure `unlocked`
// predicate of every achievement (identity — persisted in saves and asserted by
// the sim). The human `title`/`description` are DISPLAY and come from the active
// theme, keyed by id. A theme therefore can never rename an id or change a
// predicate. The public `ACHIEVEMENTS` shape is unchanged: the specs below are
// resolved against the theme once at module load.
//
// Predicates are deliberately limited to what the engine can genuinely observe
// (events emitted by the action, combat stage, equipped/bagged gear, gold,
// playtime). There is no player HP, no death, and no enemy attack in this build,
// so no achievement may imply one. Every entry must be reachable by a real
// playthrough — no untriggerable flavour.

import { BAG_CAP, CRIT_CHANCE_CAP, isBoss } from './balance';
import { gearDefinitionFor } from './content';
import { getCritStats } from './gear-stats';
import { ACTIVE_THEME } from './theme';
import type { GameEvent, GameState } from './types';

/** Playtime, in ms, that counts as "idling" for the comedic achievements. */
const IDLE_THRESHOLD_MS = 10 * 60 * 1000;
const GRASS_THRESHOLD_MS = 30 * 60 * 1000;
/** Bag size that reads as "hoarding". BAG_CAP is the hard maximum. */
const HOARDER_THRESHOLD = 12;
/** Gold balance worth bragging about (gold income in this economy is flat/small). */
const LOOSE_CHANGE_GOLD = 100;
/** Item level that qualifies as "big iron". */
const BIG_IRON_ITEM_LEVEL = 40;
/** Total upgrade levels across equipped gear that reads as "invested". */
const UPGRADE_VETERAN_LEVELS = 10;

export interface AchievementContext {
  /** State AFTER the change that is being evaluated. */
  state: GameState;
  /** Events emitted by that change. */
  events: readonly GameEvent[];
  /** Total capped critical chance from `getCritStats(state)`. */
  critChance: number;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  unlocked(context: AchievementContext): boolean;
}

/**
 * The code-owned half of an achievement: its stable id and pure predicate.
 * `descriptionValue` is handed to the theme's description template when that
 * template is a function, so a balance number is never hard-coded in the theme.
 */
interface AchievementSpec {
  id: string;
  descriptionValue?: number;
  unlocked(context: AchievementContext): boolean;
}

function hasEvent(
  context: AchievementContext,
  predicate: (event: GameEvent) => boolean,
): boolean {
  return context.events.some(predicate);
}

function ownsNecklace(state: GameState): boolean {
  if (state.gear.equipped.necklace) return true;
  return state.gear.bag.some(
    (item) => gearDefinitionFor(item.definitionId)?.slot === 'necklace',
  );
}

function wornRingCount(state: GameState): number {
  return (state.gear.equipped.ring1 ? 1 : 0) + (state.gear.equipped.ring2 ? 1 : 0);
}

/** Total upgrade levels across every equipped slot (0 for empty slots). */
function totalUpgradeLevels(state: GameState): number {
  const eq = state.gear.equipped;
  return (
    (eq.weapon?.upgradeLevel ?? 0) +
    (eq.ring1?.upgradeLevel ?? 0) +
    (eq.ring2?.upgradeLevel ?? 0) +
    (eq.necklace?.upgradeLevel ?? 0)
  );
}

/**
 * Resolve one spec against the active theme. The theme holds the copy; this
 * function holds the identity. A missing catalog entry is a programming error
 * (a theme must define every id), so it fails loudly rather than rendering
 * blanks.
 */
function resolveAchievement(spec: AchievementSpec): AchievementDefinition {
  const copy = ACTIVE_THEME.achievements.catalog[spec.id];
  if (copy === undefined) {
    throw new Error(
      `Theme "${ACTIVE_THEME.name}" is missing achievement copy for id "${spec.id}"`,
    );
  }
  const description =
    typeof copy.description === 'function'
      ? copy.description(spec.descriptionValue ?? 0)
      : copy.description;
  return { id: spec.id, title: copy.title, description, unlocked: spec.unlocked };
}

const ACHIEVEMENT_SPECS: readonly AchievementSpec[] = [
  // --- Combat ---
  {
    id: 'first-blood',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'enemyKilled'),
  },
  {
    id: 'first-click',
    unlocked: (context) =>
      hasEvent(context, (event) => event.type === 'damageDealt' && event.source === 'click'),
  },
  {
    id: 'boss-slayer',
    unlocked: (context) =>
      hasEvent(context, (event) => event.type === 'enemyKilled' && isBoss(event.stage)),
  },
  {
    id: 'wall-hit',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'progressionWall'),
  },
  {
    id: 'choice-made',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'choiceResolved'),
  },

  // --- Stages ---
  {
    id: 'stage-10',
    unlocked: (context) => context.state.combat.stage >= 10,
  },
  {
    id: 'stage-25',
    unlocked: (context) => context.state.combat.stage >= 25,
  },
  {
    id: 'stage-50',
    unlocked: (context) => context.state.combat.stage >= 50,
  },

  // --- Gear ---
  {
    id: 'geared-up',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'gearEquipped'),
  },
  {
    id: 'first-upgrade',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'gearUpgraded'),
  },
  {
    id: 'ring-bearer',
    unlocked: (context) => wornRingCount(context.state) >= 1,
  },
  {
    id: 'double-ringed',
    unlocked: (context) => wornRingCount(context.state) >= 2,
  },
  {
    id: 'bedazzled',
    unlocked: (context) => ownsNecklace(context.state),
  },
  {
    id: 'bling',
    unlocked: (context) =>
      context.state.gear.equipped.necklace !== null && wornRingCount(context.state) >= 1,
  },
  {
    id: 'full-kit',
    unlocked: (context) => {
      const eq = context.state.gear.equipped;
      return eq.weapon !== null && eq.ring1 !== null && eq.ring2 !== null && eq.necklace !== null;
    },
  },
  {
    id: 'big-iron',
    descriptionValue: BIG_IRON_ITEM_LEVEL,
    unlocked: (context) =>
      (context.state.gear.equipped.weapon?.itemLevel ?? 0) >= BIG_IRON_ITEM_LEVEL,
  },
  {
    id: 'hoarder',
    descriptionValue: HOARDER_THRESHOLD,
    unlocked: (context) => context.state.gear.bag.length >= HOARDER_THRESHOLD,
  },
  {
    id: 'bag-lady',
    unlocked: (context) => context.state.gear.bag.length >= BAG_CAP,
  },

  // --- Crit / economy / time ---
  {
    id: 'crit-investor',
    unlocked: (context) => context.critChance >= 0.25,
  },
  {
    id: 'crit-half',
    unlocked: (context) => context.critChance >= 0.5,
  },
  {
    id: 'crit-maxed',
    descriptionValue: CRIT_CHANCE_CAP * 100,
    unlocked: (context) => context.critChance >= CRIT_CHANCE_CAP,
  },
  {
    id: 'loose-change',
    descriptionValue: LOOSE_CHANGE_GOLD,
    unlocked: (context) => context.state.player.gold >= LOOSE_CHANGE_GOLD,
  },
  {
    id: 'touch-grass',
    unlocked: (context) => context.state.meta.totalPlayedMs >= IDLE_THRESHOLD_MS,
  },
  {
    id: 'grass-30',
    unlocked: (context) => context.state.meta.totalPlayedMs >= GRASS_THRESHOLD_MS,
  },

  // --- Upgrade milestones (the gold-allocation decision) ---
  {
    id: 'milestone-first',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'milestoneReached'),
  },
  {
    id: 'upgrade-diversified',
    unlocked: (context) => {
      const eq = context.state.gear.equipped;
      return (
        eq.weapon !== null &&
        eq.ring1 !== null &&
        eq.ring2 !== null &&
        eq.necklace !== null &&
        eq.weapon.upgradeLevel >= 1 &&
        eq.ring1.upgradeLevel >= 1 &&
        eq.ring2.upgradeLevel >= 1 &&
        eq.necklace.upgradeLevel >= 1
      );
    },
  },
  {
    id: 'upgrade-veteran',
    descriptionValue: UPGRADE_VETERAN_LEVELS,
    unlocked: (context) => totalUpgradeLevels(context.state) >= UPGRADE_VETERAN_LEVELS,
  },

  // --- Golden Events (Shinies) ---
  {
    id: 'shiny-claimed',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'eventClaimed'),
  },
  {
    id: 'shiny-frenzy',
    unlocked: (context) =>
      context.state.boost !== null &&
      hasEvent(context, (event) => event.type === 'eventClaimed') &&
      !hasEvent(context, (event) => event.type === 'boostActivated'),
  },
  {
    id: 'shiny-escape',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'eventExpired'),
  },
];

/**
 * The resolved catalog: identity from the specs above, copy from the active
 * theme. The public shape is `{ id, title, description, unlocked }`, identical
 * to before the theme extraction.
 */
export const ACHIEVEMENTS: readonly AchievementDefinition[] =
  ACHIEVEMENT_SPECS.map(resolveAchievement);

/**
 * Return the achievements unlocked by the change from `stateBefore` to
 * `stateAfter`. Pure: reads both states and the emitted events, mutates nothing.
 * Already-unlocked ids are skipped via `stateBefore.meta.achievements`.
 */
export function evaluateAchievements(
  stateBefore: GameState,
  stateAfter: GameState,
  events: readonly GameEvent[],
): AchievementDefinition[] {
  const unlocked = new Set(stateBefore.meta.achievements);
  const context: AchievementContext = {
    state: stateAfter,
    events,
    critChance: getCritStats(stateAfter).critChance,
  };
  return ACHIEVEMENTS.filter(
    (achievement) => !unlocked.has(achievement.id) && achievement.unlocked(context),
  );
}

/**
 * Evaluate and persist newly-unlocked achievements on `draft`, appending an
 * `achievementUnlocked` event for each. Mutates only the draft (the engine's
 * standard pattern) and never the RNG, so it cannot affect the sim stream.
 */
export function grantAchievements(
  stateBefore: GameState,
  draft: GameState,
  events: GameEvent[],
): void {
  for (const achievement of evaluateAchievements(stateBefore, draft, events)) {
    draft.meta.achievements.push(achievement.id);
    events.push({
      type: 'achievementUnlocked',
      id: achievement.id,
      title: achievement.title,
    });
  }
}
