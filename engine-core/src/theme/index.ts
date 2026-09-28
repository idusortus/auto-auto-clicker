// theme/index.ts — resolve the active theme.
//
// SWITCHING THEMES IS A ONE-LINE CHANGE: point ACTIVE_THEME at another Theme
// object. A build-time theme swap (text + colors + pixel art + animation) edits
// exactly this assignment and nothing else.

import { fantasy } from './fantasy';
import type { Theme } from './types';

export { fantasy } from './fantasy';
export type { AchievementCopy, Theme } from './types';

/** The theme every consumer renders through. */
export const ACTIVE_THEME: Theme = fantasy;
