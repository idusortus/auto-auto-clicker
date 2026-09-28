// achievements.ts — static achievement catalog + pure evaluator.
//
// Achievements are static CONTENT, not save state: GameState.meta.achievements
// stores only the unlocked ids. The catalog never reads the RNG or mutates
// anything, so unlocking cannot perturb balance or the RNG stream.
//
// Predicates are deliberately limited to what the engine can genuinely observe
// (events emitted by the action, combat stage, equipped/bagged gear, gold,
// playtime). There is no player HP, no death, and no enemy attack in this build,
// so no achievement may imply one. Every entry must be reachable by a real
// playthrough — no untriggerable flavour.
//
// Tone: snarky, PG-13, a little crass; the joke is at the player's expense.

import { BAG_CAP, CRIT_CHANCE_CAP, isBoss } from './balance';
import { gearDefinitionFor } from './content';
import { getCritStats } from './gear-stats';
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

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  // --- Combat ---
  {
    id: 'first-blood',
    title: 'First Blood',
    description: 'Kill your first enemy. Congratulations, you monster.',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'enemyKilled'),
  },
  {
    id: 'first-click',
    title: 'Finger Guns',
    description: 'Deal damage by actually tapping the enemy. Feel that wrist.',
    unlocked: (context) =>
      hasEvent(context, (event) => event.type === 'damageDealt' && event.source === 'click'),
  },
  {
    id: 'boss-slayer',
    title: 'Boss Slayer',
    description: 'Defeat your first boss. They had a family; you had a spreadsheet.',
    unlocked: (context) =>
      hasEvent(context, (event) => event.type === 'enemyKilled' && isBoss(event.stage)),
  },
  {
    id: 'wall-hit',
    title: 'The Wall',
    description: "Hit your first progression wall. This is fine. Everything is fine.",
    unlocked: (context) => hasEvent(context, (event) => event.type === 'progressionWall'),
  },
  {
    id: 'choice-made',
    title: 'Deal With It',
    description: 'Resolve your first boss-check or wall choice. Growth is uncomfortable.',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'choiceResolved'),
  },

  // --- Stages ---
  {
    id: 'stage-10',
    title: 'Getting Somewhere',
    description: 'Reach stage 10. Momentum is a hell of a drug.',
    unlocked: (context) => context.state.combat.stage >= 10,
  },
  {
    id: 'stage-25',
    title: 'Deep Run',
    description: 'Reach stage 25. This is your life now.',
    unlocked: (context) => context.state.combat.stage >= 25,
  },
  {
    id: 'stage-50',
    title: 'Halfway to Nowhere',
    description: 'Reach stage 50. Congratulations on the absence of an ending.',
    unlocked: (context) => context.state.combat.stage >= 50,
  },

  // --- Gear ---
  {
    id: 'geared-up',
    title: 'Geared Up',
    description: "Equip your first piece of gear. Now you're somebody.",
    unlocked: (context) => hasEvent(context, (event) => event.type === 'gearEquipped'),
  },
  {
    id: 'first-upgrade',
    title: 'Cha-Ching',
    description: 'Buy your first upgrade. The gold-to-power pipeline is now open.',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'gearUpgraded'),
  },
  {
    id: 'ring-bearer',
    title: 'My Precious',
    description: "Equip a ring. It's not obsessive if it's enchanted.",
    unlocked: (context) => wornRingCount(context.state) >= 1,
  },
  {
    id: 'double-ringed',
    title: 'Double-Fisted',
    description: 'Wear a ring in both slots. Two hands, twice the commitment issues.',
    unlocked: (context) => wornRingCount(context.state) >= 2,
  },
  {
    id: 'bedazzled',
    title: 'Bedazzled',
    description: "Acquire a necklace. It's heavy, it's gaudy, it's load-bearing.",
    unlocked: (context) => ownsNecklace(context.state),
  },
  {
    id: 'bling',
    title: 'Bling Bling',
    description: 'Wear a necklace and at least one ring at once. Subtlety is for other games.',
    unlocked: (context) =>
      context.state.gear.equipped.necklace !== null && wornRingCount(context.state) >= 1,
  },
  {
    id: 'full-kit',
    title: 'Dressed to Kill',
    description: 'Fill all four slots — weapon, both rings, necklace. Absolutely shredded.',
    unlocked: (context) => {
      const eq = context.state.gear.equipped;
      return eq.weapon !== null && eq.ring1 !== null && eq.ring2 !== null && eq.necklace !== null;
    },
  },
  {
    id: 'big-iron',
    title: 'Big Iron on His Hip',
    description: `Equip a weapon of item level ${BIG_IRON_ITEM_LEVEL} or higher.`,
    unlocked: (context) =>
      (context.state.gear.equipped.weapon?.itemLevel ?? 0) >= BIG_IRON_ITEM_LEVEL,
  },
  {
    id: 'hoarder',
    title: "It's Not Hoarding If It's Gear",
    description: `Hold ${HOARDER_THRESHOLD} unequipped items in your bag. You may need them. You won't.`,
    unlocked: (context) => context.state.gear.bag.length >= HOARDER_THRESHOLD,
  },
  {
    id: 'bag-lady',
    title: 'Bag Lady',
    description: "Fill every bag slot. It's not a problem, it's a collection.",
    unlocked: (context) => context.state.gear.bag.length >= BAG_CAP,
  },

  // --- Crit / economy / time ---
  {
    id: 'crit-investor',
    title: 'Crit Investor',
    description: 'Reach 25% total critical chance. Math is on your side.',
    unlocked: (context) => context.critChance >= 0.25,
  },
  {
    id: 'crit-half',
    title: 'Coin Flip',
    description: 'Reach 50% total critical chance. Half the time, it works every time.',
    unlocked: (context) => context.critChance >= 0.5,
  },
  {
    id: 'crit-maxed',
    title: 'Statistically Inevitable',
    description: `Reach the ${CRIT_CHANCE_CAP * 100}% critical chance cap. The dice are rigged, and you rigged them.`,
    unlocked: (context) => context.critChance >= CRIT_CHANCE_CAP,
  },
  {
    id: 'loose-change',
    title: 'Loose Change',
    description: `Bank ${LOOSE_CHANGE_GOLD} gold at once. Big spender energy.`,
    unlocked: (context) => context.state.player.gold >= LOOSE_CHANGE_GOLD,
  },
  {
    id: 'touch-grass',
    title: 'Touch Grass',
    description: 'Play for 10 minutes straight. The grass remains untouched.',
    unlocked: (context) => context.state.meta.totalPlayedMs >= IDLE_THRESHOLD_MS,
  },
  {
    id: 'grass-30',
    title: 'Have You Tried Touching More Grass?',
    description: 'Play for 30 minutes straight. The sun is, statistically, a myth.',
    unlocked: (context) => context.state.meta.totalPlayedMs >= GRASS_THRESHOLD_MS,
  },

  // --- Upgrade milestones (the gold-allocation decision) ---
  {
    id: 'milestone-first',
    title: 'The Spike Is Real',
    description: 'Cross your first upgrade milestone. Same gold, but it finally did something.',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'milestoneReached'),
  },
  {
    id: 'upgrade-diversified',
    title: 'Equal Opportunity Investor',
    description: 'Put at least one upgrade into every equipped slot. Diversify, they said.',
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
    title: 'Serial Upgrader',
    description: `Hold ${UPGRADE_VETERAN_LEVELS} total upgrade levels across your gear. Gold well spent, allegedly.`,
    unlocked: (context) => totalUpgradeLevels(context.state) >= UPGRADE_VETERAN_LEVELS,
  },

  // --- Golden Events (Shinies) ---
  {
    id: 'shiny-claimed',
    title: 'Ooh, Shiny',
    description: 'Claim your first Stray Goblin haul. It was carrying that for you the whole time.',
    unlocked: (context) => hasEvent(context, (event) => event.type === 'eventClaimed'),
  },
  {
    id: 'shiny-frenzy',
    title: 'Double-Dipping',
    description: 'Claim a Shiny while a frenzy is already running. Greed is a strategy.',
    unlocked: (context) =>
      context.state.boost !== null &&
      hasEvent(context, (event) => event.type === 'eventClaimed') &&
      !hasEvent(context, (event) => event.type === 'boostActivated'),
  },
  {
    id: 'shiny-escape',
    title: 'No Shiny Left Behind',
    description: "Let a Stray Goblin escape. It's fine. You didn't want it anyway.",
    unlocked: (context) => hasEvent(context, (event) => event.type === 'eventExpired'),
  },
];

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
