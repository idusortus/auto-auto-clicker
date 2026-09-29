// theme/index.ts — resolve the active theme.
//
// SWITCHING THEMES IS A ONE-LINE CHANGE: point ACTIVE_THEME at another Theme
// object. A build-time theme swap (text + colors + pixel art + animation) edits
// exactly this assignment and nothing else.

import { fantasy } from './fantasy';
import { lucky } from './lucky';
import type { Theme } from './types';

export { fantasy } from './fantasy';
export { lucky } from './lucky';
export type {
  AchievementCopy,
  AnimationCueKey,
  EnemyDisplayEntry,
  Theme,
  ThemeAnimation,
  ThemeAnimationCue,
} from './types';

/**
 * Every theme this build ships, keyed by `name`. The theme test suite validates
 * ALL of them (not just the active one), so a newly added theme is self-checking
 * in CI and an inactive theme cannot rot.
 */
export const THEMES: readonly Theme[] = [fantasy, lucky];

/**
 * The theme every consumer renders through.
 *
 * ── TO SWITCH THEMES, EDIT THE NEXT LINE ────────────────────────────────────
 * Replace `fantasy` with any other theme from `./<name>` (e.g. `lucky`):
 *
 *     export const ACTIVE_THEME: Theme = lucky;
 *
 * That one assignment swaps ALL text, colours, and declared pixel art; it is
 * the entire theme switch. Leave `fantasy` here as the committed default.
 */
export const ACTIVE_THEME: Theme = lucky;
