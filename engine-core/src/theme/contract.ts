// theme/contract.ts — the declared TEMPLATE every theme must match, plus the
// validator that checks one against it.
//
// This is a runtime/build-time CONTRACT, deliberately NOT TypeScript branding.
// The `Theme` type proves shape at compile time; this module re-checks the SAME
// facts at RUNTIME so a partially-constructed or JS-authored theme cannot slip
// through, and it adds the things a type cannot express: per-group character
// limits (measured, not invented), the achievement catalog id set, identity-key
// safety, and the declared asset/animation slots.
//
// It is PURE: no DOM, no clocks, no network, no filesystem. It reads only the
// theme it is handed plus code-owned identity (`ACHIEVEMENTS`, `CONTENT`,
// `GEAR_SLOTS`) and `types.ts` unions. It NEVER throws for an invalid theme —
// it reports EVERY problem at once so authoring a theme is a checklist, not a
// scavenger hunt.
//
// ── How the limits below were derived ────────────────────────────────────────
// Limits are derived from MEASUREMENT of the current `fantasy` theme, then
// given deliberate headroom — they exist to catch "someone pasted a paragraph
// / a template exploded", not to freeze today's wording. Run
// `npm run theme:check` to print the measured maximum per group next to each
// limit; `measureTheme()` is the same measurement the validator performs.
//
// ── Filesystem checks stay OUT of this module ────────────────────────────────
// `validateTheme` checks that the `assets` section is well-formed but never
// touches disk. The real on-disk check (file exists + PNG pixel dimensions) is
// split: `validateAssetMeasurements` below is the PURE comparison, and
// `engine-core/scripts/check-theme.ts` does the `node:fs` reading and feeds
// measured facts in. `npm run theme:check` runs both.

import { GEAR_SLOTS } from '../balance';
import { CONTENT } from '../content';
import { ACHIEVEMENTS } from '../achievements';
import type { ShinyKind } from '../types';
import type { Theme } from './types';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * A length class for a slot. Slots are grouped by where the rendered string
 * lands so a limit reflects real layout pressure rather than one global number.
 */
export type LimitGroup =
  | 'label'
  | 'chrome'
  | 'achievement-title'
  | 'achievement-description'
  | 'prose'
  | 'color';

export interface LimitRule {
  /** Maximum rendered characters allowed for a slot in this group. */
  max: number;
  /** Why this number — derived from the measured maximum, not invented. */
  rationale: string;
}

/**
 * The limits table. Each `max` is comfortably above the current measured
 * maximum for that group (see `rationale`), so humor and rewording have room
 * while genuine overflow is still caught. Text limits are intentionally
 * GENEROUS; only layout-critical chrome is tight.
 */
export const LIMITS: Record<LimitGroup, LimitRule> = {
  label: {
    max: 48,
    rationale:
      'Short, layout-critical chrome (HUD labels, buttons, slot names, badges, units, ' +
      'kind names). Longest current slot is 22 chars ("Watch ad — coming soon"); these sit ' +
      'in fixed-width rows/cards, so they get the least headroom.',
  },
  chrome: {
    max: 120,
    rationale:
      'One-line interpolated chrome: hints, aria labels, stat/summary lines, counters, ' +
      'durations, and short format templates. Longest current rendered line is 85 chars ' +
      '(the ring stat line); this catches a format string that grew into a paragraph ' +
      'while leaving room for longer formatted numbers.',
  },
  'achievement-title': {
    max: 64,
    rationale:
      'Achievement shelf card header. Longest current title is 35 chars ("Have You Tried ' +
      'Touching More Grass?"); a title is a single line so it gets less headroom than ' +
      'prose but more than fixed chrome.',
  },
  'achievement-description': {
    max: 200,
    rationale:
      'Achievement description: rendered on a single shelf card, so deliberately below ' +
      'the 240 prose ceiling. Longest current description is 80 chars; 200 leaves real ' +
      'room for jokes while catching "someone pasted a paragraph".',
  },
  prose: {
    max: 240,
    rationale:
      'Paragraph copy: advisory bodies, offline/choice copy, empty states. Longest ' +
      'current rendered body is 139 chars (the better-slot advisory with sample args). ' +
      'Generous headroom per the requirement that text limits stay spacious.',
  },
  color: {
    max: 64,
    rationale:
      'A palette colour value. Longest current value is 7 chars (#rrggbb); the limit ' +
      'allows the widest legal forms the validator accepts (8-digit hex, rgb()/rgba()/' +
      'hsl()/hsla()) with room for embedded whitespace, while still catching a value ' +
      'that is really a paragraph.',
  },
};

// ---------------------------------------------------------------------------
// Field specs (the required slots)
// ---------------------------------------------------------------------------

interface BaseFieldSpec {
  path: string;
  group: LimitGroup;
}

interface StringFieldSpec extends BaseFieldSpec {
  kind: 'string';
}

interface FunctionFieldSpec extends BaseFieldSpec {
  kind: 'function';
  /** Sample arguments used to measure a template's RETURN value. See note. */
  sampleArgs: readonly (string | number)[];
}

export type FieldSpec = StringFieldSpec | FunctionFieldSpec;

/**
 * Declared sample arguments for every template slot. A template is a function,
 * so its declared limit can only bind when it is CALLED — that is what catches
 * "a template that interpolates to something huge". The args are deliberately
 * modest and documented rather than clever: the goal is to measure the
 * template's own literal length plus representative interpolation, not to
 * simulate every runtime value. Limits include headroom for longer values.
 */
const s = (path: string, group: LimitGroup): StringFieldSpec => ({ path, kind: 'string', group });
const t = (
  path: string,
  group: LimitGroup,
  sampleArgs: readonly (string | number)[],
): FunctionFieldSpec => ({ path, kind: 'function', group, sampleArgs });

/** Every plain-string and template slot, excluding the dynamic catalog. */
export const THEME_FIELDS: readonly FieldSpec[] = [
  s('name', 'label'),

  // palette — the themeable colour scheme, applied to CSS custom properties.
  s('palette.bg', 'color'),
  s('palette.surface', 'color'),
  s('palette.panel', 'color'),
  s('palette.surfaceRaised', 'color'),
  s('palette.control', 'color'),
  s('palette.line', 'color'),
  s('palette.lineStrong', 'color'),
  s('palette.text', 'color'),
  s('palette.textDim', 'color'),
  s('palette.textMuted', 'color'),
  s('palette.textDisabled', 'color'),
  s('palette.accent', 'color'),
  s('palette.accentHi', 'color'),
  s('palette.accentLo', 'color'),
  s('palette.accentEdge', 'color'),
  s('palette.accentInk', 'color'),
  s('palette.dangerMuted', 'color'),
  s('palette.hpHi', 'color'),
  s('palette.hpLo', 'color'),

  // ui — HUD, panels, overlays, formatting.
  s('ui.hud.gold', 'label'),
  s('ui.hud.stage', 'label'),
  s('ui.hud.dps', 'label'),
  s('ui.placeholder', 'label'),
  s('ui.tapHint', 'chrome'),
  s('ui.equippedTitle', 'label'),
  s('ui.upgradeButton', 'label'),
  s('ui.upgradeHint', 'chrome'),
  t('ui.upgradeRow.level', 'chrome', ['12']),
  t('ui.upgradeRow.cost', 'chrome', ['30']),
  s('ui.boost.label', 'label'),
  t('ui.boost.pill', 'chrome', ['3']),
  t('ui.boost.timer', 'label', ['6']),
  s('ui.splashKicker', 'label'),
  s('ui.choice.title', 'label'),
  s('ui.choice.wait', 'label'),
  s('ui.choice.watchAd', 'label'),
  s('ui.choice.watchAdTitle', 'prose'),
  s('ui.choice.iap', 'label'),
  s('ui.choice.iapTitle', 'prose'),
  s('ui.choice.note', 'prose'),
  s('ui.offline.title', 'label'),
  s('ui.offline.dismiss', 'label'),
  t('ui.offline.earned', 'prose', ['450', '2 h 3 min']),
  s('ui.offline.capped', 'prose'),
  s('ui.duration.lessThanMinute', 'chrome'),
  t('ui.duration.seconds', 'chrome', ['45']),
  t('ui.duration.minutes', 'chrome', ['9']),
  t('ui.duration.hours', 'chrome', ['2']),
  t('ui.duration.hoursMinutes', 'chrome', ['2', '3']),
  s('ui.bag.title', 'label'),
  s('ui.bag.countSuffix', 'label'),
  s('ui.bag.empty', 'prose'),
  s('ui.bag.betterTag', 'label'),
  s('ui.bag.equip', 'label'),
  t('ui.bag.level', 'chrome', ['14']),
  t('ui.bag.weaponSummary', 'chrome', ['14', '203', '96']),
  t('ui.bag.ringSummary', 'chrome', ['12', '18.0%', '6.0%']),
  t('ui.bag.necklaceSummary', 'chrome', ['7', '5.0%', '1.0%']),

  // slots — names, equipped cards, stat lines, milestone badges.
  s('slots.display.weapon', 'label'),
  s('slots.display.ring1', 'label'),
  s('slots.display.ring2', 'label'),
  s('slots.display.necklace', 'label'),
  s('slots.noun.weapon', 'label'),
  s('slots.noun.ring', 'label'),
  s('slots.noun.necklace', 'label'),
  t('slots.card.weapon', 'chrome', ['12']),
  t('slots.card.ring1', 'chrome', ['12']),
  t('slots.card.ring2', 'chrome', ['12']),
  t('slots.card.necklace', 'chrome', ['12']),
  s('slots.empty.weapon', 'label'),
  s('slots.empty.ring1', 'label'),
  s('slots.empty.ring2', 'label'),
  s('slots.empty.necklace', 'label'),
  t('slots.stats.weapon', 'chrome', ['203', '96', '4']),
  t('slots.stats.ring', 'chrome', ['18.0%', '6.0%', '75.0%', '18.0%']),
  t('slots.stats.necklace', 'chrome', ['5.0%', '1.0%', '25.0%', '2.0%']),
  s('slots.stats.empty', 'prose'),
  t('slots.milestone.badge', 'chrome', ['3', '+6.0% crit']),
  t('slots.milestone.flourish', 'chrome', ['Weapon', '3', '+2.0% power']),
  s('slots.milestone.bonus.separator', 'label'),
  t('slots.milestone.bonus.crit', 'chrome', ['6.0%']),
  t('slots.milestone.bonus.critDamage', 'chrome', ['6.0%']),
  t('slots.milestone.bonus.gold', 'chrome', ['5.0%']),
  t('slots.milestone.bonus.power', 'chrome', ['2.0%']),

  // enemy — arena + pending-choice overlay.
  s('enemy.label', 'label'),
  s('enemy.boss', 'label'),
  s('enemy.attackAria', 'chrome'),
  t('enemy.hp', 'label', ['76', '120']),
  s('enemy.bossCheck', 'label'),
  s('enemy.progressionWall', 'label'),
  t('enemy.projectedKill', 'chrome', ['12345']),
  t('enemy.bossCheckBody', 'prose', ['30', ' Projected time to kill: 12345 ms.']),
  t('enemy.progressionWallBody', 'prose', ['45', ' Projected time to kill: 99999 ms.']),

  // shiny — the Golden Event.
  s('shiny.name', 'label'),
  s('shiny.catchAria', 'chrome'),
  s('shiny.kind.frenzy', 'label'),
  s('shiny.kind.drop', 'label'),
  s('shiny.kind.cache', 'label'),
  s('shiny.escape', 'prose'),
  s('shiny.claimed', 'chrome'),
  t('shiny.frenzyClaim', 'chrome', ['3']),
  s('shiny.dropClaim', 'chrome'),

  // advisory — escalating soft-lock guidance.
  s('advisory.kicker', 'label'),
  s('advisory.equipFallback', 'label'),
  t('advisory.equipCallout', 'chrome', ['12', 'weapon']),
  t('advisory.badge', 'chrome', ['ring']),
  t('advisory.emptySlot', 'prose', ['30', '2 min', 'weapon', '14']),
  t('advisory.betterSlot', 'prose', ['30', '2 min', 'weapon', '14', '1.3× ', '10']),

  // achievements — shelf chrome (catalog is dynamic, checked by id).
  s('achievements.title', 'label'),
  s('achievements.shelf.countDefault', 'label'),
  t('achievements.shelf.count', 'chrome', ['30']),
  s('achievements.shelf.showDefault', 'label'),
  t('achievements.shelf.show', 'chrome', ['25']),
  s('achievements.shelf.hide', 'label'),
  s('achievements.shelf.teaser', 'label'),
  s('achievements.shelf.locked', 'label'),
  s('achievements.shelf.empty', 'prose'),
];

/** The palette field specs (required colour tokens + their length limit group). */
export const PALETTE_FIELDS: readonly FieldSpec[] = THEME_FIELDS.filter((spec) =>
  spec.path.startsWith('palette.'),
);

/**
 * Accepted palette colour shapes: 3/4/6/8-digit hex, or a functional form
 * (`rgb`/`rgba`/`hsl`/`hsla`). Deliberately permissive about the insides of a
 * functional form (the browser is the real authority) but strict about the shape
 * so a non-colour string is caught.
 */
export const COLOR_VALUE_PATTERN =
  /^(?:#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|(?:rgb|rgba|hsl|hsla)\(\s*[^)]*\))$/i;

/** True when `value` has one of the colour shapes the palette accepts. */
export function isColorValue(value: string): boolean {
  return COLOR_VALUE_PATTERN.test(value.trim());
}

/** Rendered length of an achievement description's sample interpolation. */
const DESCRIPTION_SAMPLE_VALUE = 0;

// ---------------------------------------------------------------------------
// Assets — the declared art contract (single source of truth for T4)
// ---------------------------------------------------------------------------

export interface AssetSlotSpec {
  /** Canonical slot name; also the key the theme must use in `assets`. */
  name: string;
  width: number;
  height: number;
  /** Required file name the theme must supply for this slot. */
  file: string;
  description: string;
}

/** File-name convention: lower-kebab-case basename + `.png`. */
export const ASSET_FILENAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.png$/;

const gearSlots = GEAR_SLOTS;
const GEAR_TIERS = [1, 2, 3, 4] as const;

function gearAssetSlots(): AssetSlotSpec[] {
  const specs: AssetSlotSpec[] = [];
  for (const slot of gearSlots) {
    for (const tier of GEAR_TIERS) {
      const name = `gear-${slot}-t${tier}`;
      specs.push({
        name,
        width: 48,
        height: 48,
        file: `${name}.png`,
        description: `${slot} icon, item-level tier ${tier} (tier→item-level banding decided in T4)`,
      });
    }
  }
  return specs;
}

/**
 * The required asset slots: names, expected pixel dimensions, and file names.
 * 4 gear slots × 4 tiers = 16, plus 16 character/spawn slots = 32 total. This
 * is the ONE declaration T4 reads to load, check existence, and verify size.
 */
export const ASSET_SLOTS: readonly AssetSlotSpec[] = [
  { name: 'player-idle', width: 64, height: 64, file: 'player-idle.png', description: 'player character, idle' },
  { name: 'player-attack', width: 64, height: 64, file: 'player-attack.png', description: 'player character, attack frame' },
  { name: 'player-hurt', width: 64, height: 64, file: 'player-hurt.png', description: 'player character, hurt frame' },
  { name: 'enemy-grunt-idle', width: 64, height: 64, file: 'enemy-grunt-idle.png', description: 'normal enemy, idle' },
  { name: 'enemy-grunt-attack', width: 64, height: 64, file: 'enemy-grunt-attack.png', description: 'normal enemy, attack frame' },
  { name: 'enemy-grunt-hurt', width: 64, height: 64, file: 'enemy-grunt-hurt.png', description: 'normal enemy, hurt frame' },
  { name: 'enemy-grunt-death', width: 64, height: 64, file: 'enemy-grunt-death.png', description: 'normal enemy, death frame' },
  { name: 'boss-grunt-idle', width: 96, height: 96, file: 'boss-grunt-idle.png', description: 'boss enemy, idle (larger frame)' },
  { name: 'boss-grunt-attack', width: 96, height: 96, file: 'boss-grunt-attack.png', description: 'boss enemy, attack frame' },
  { name: 'boss-grunt-hurt', width: 96, height: 96, file: 'boss-grunt-hurt.png', description: 'boss enemy, hurt frame' },
  { name: 'boss-grunt-death', width: 96, height: 96, file: 'boss-grunt-death.png', description: 'boss enemy, death frame' },
  { name: 'shiny-idle', width: 48, height: 48, file: 'shiny-idle.png', description: 'Stray Goblin, idle' },
  { name: 'shiny-frenzy', width: 48, height: 48, file: 'shiny-frenzy.png', description: 'Stray Goblin, frenzy variant' },
  { name: 'shiny-drop', width: 48, height: 48, file: 'shiny-drop.png', description: 'Stray Goblin, drop variant' },
  { name: 'shiny-cache', width: 48, height: 48, file: 'shiny-cache.png', description: 'Stray Goblin, cache variant' },
  { name: 'spawn-popup', width: 96, height: 32, file: 'spawn-popup.png', description: 'transient spawn/enemy-intro popup' },
  ...gearAssetSlots(),
];

/** Slot names as a Set, for the extra-key check. */
const ASSET_SLOT_NAMES = new Set(ASSET_SLOTS.map((slot) => slot.name));

// ---------------------------------------------------------------------------
// Identity tokens — things a theme must NEVER be able to rename
// ---------------------------------------------------------------------------

/**
 * Gear definition ids / `GearSlot` values (they are the same strings by design).
 * Sourced from `CONTENT` so this stays in sync with the catalog.
 */
const GEAR_TOKEN_VALUES = Object.values(CONTENT.gear).map((definition) => definition.id);
/**
 * Every `ShinyKind`. The mirror object is annotated `Record<ShinyKind, true>`,
 * so adding a kind to the union is a COMPILE error here until this is updated.
 */
const SHINY_KIND_MIRROR: Record<ShinyKind, true> = { frenzy: true, cache: true, drop: true };
const SHINY_TOKENS: ReadonlySet<string> = new Set<string>(Object.keys(SHINY_KIND_MIRROR));
/** Enemy ids, from the content catalog. */
const ENEMY_TOKEN_VALUES = Object.keys(CONTENT.enemies);
/** Achievement ids, from the resolved static catalog. */
const ACHIEVEMENT_IDS: readonly string[] = ACHIEVEMENTS.map((achievement) => achievement.id);

const GEAR_TOKENS = new Set(GEAR_TOKEN_VALUES);
const ENEMY_TOKENS = new Set(ENEMY_TOKEN_VALUES);
const ACHIEVEMENT_ID_SET = new Set(ACHIEVEMENT_IDS);

/**
 * The only parent paths where an identity token may legitimately appear as a
 * property KEY (it is copy keyed by id/slot — not a rename). Anywhere else a
 * token key means the theme is trying to RENAME identity.
 */
const GEAR_TOKEN_PARENTS = new Set([
  'slots.display',
  'slots.noun',
  'slots.card',
  'slots.empty',
  'slots.stats',
]);
const SHINY_TOKEN_PARENT = 'shiny.kind';
const ACHIEVEMENT_TOKEN_PARENT = 'achievements.catalog';

/** Return a human reason if `key` under `parentPath` is a forbidden identity key. */
function identityViolation(key: string, parentPath: string): string | null {
  if (ACHIEVEMENT_ID_SET.has(key) && parentPath !== ACHIEVEMENT_TOKEN_PARENT) {
    return `achievement id "${key}" may only appear as a catalog KEY (copy keyed by id), not as a theme key under "${parentPath || '(root)'}"`;
  }
  if (GEAR_TOKENS.has(key) && !GEAR_TOKEN_PARENTS.has(parentPath)) {
    return `gear identity token "${key}" (definitionId / GearSlot) is a rename attempt under "${parentPath || '(root)'}"`;
  }
  if (SHINY_TOKENS.has(key) && parentPath !== SHINY_TOKEN_PARENT) {
    return `ShinyKind value "${key}" is a rename attempt under "${parentPath || '(root)'}"`;
  }
  if (ENEMY_TOKENS.has(key)) {
    return `enemy id "${key}" is a rename attempt under "${parentPath || '(root)'}"`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type ThemeProblemKind =
  | 'missing'
  | 'wrong-type'
  | 'too-long'
  | 'bad-key'
  | 'identity-key'
  | 'missing-achievement'
  | 'extra-achievement'
  | 'bad-filename'
  | 'bad-color';

export interface ThemeProblem {
  /** Dotted path, e.g. `ui.choice.note` or `achievements.catalog.hoarder`. */
  path: string;
  kind: ThemeProblemKind;
  /** Human-readable, includes the actual value/limit where relevant. */
  message: string;
}

export interface ThemeStats {
  /** Plain string slots successfully measured (incl. catalog titles + descriptions). */
  stringFields: number;
  /** Template slots successfully called and measured. */
  templateFields: number;
  /** Canonical achievement ids required. */
  achievementIds: number;
  /** Declared asset slots required. */
  assetSlots: number;
  /** Required palette colour tokens. */
  paletteKeys: number;
  /** Highest rendered length observed per group. */
  groupMax: Record<LimitGroup, number>;
  /** Slots measured per group. */
  groupCount: Record<LimitGroup, number>;
}

export interface ThemeValidationResult {
  ok: boolean;
  problems: ThemeProblem[];
  stats: ThemeStats;
}

export interface MeasuredString {
  path: string;
  group: LimitGroup;
  length: number;
}

// ---------------------------------------------------------------------------
// Measurement + validation
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  const type = typeof value;
  if (type === 'string') return `a string (${JSON.stringify(value)})`;
  return type;
}

function readPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const key of path.split('.')) {
    if (!isPlainObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

/** Build the allowed direct children of every object path from the specs. */
function buildAllowedChildren(): Map<string, Set<string>> {
  const allowed = new Map<string, Set<string>>();
  const add = (parent: string, key: string): void => {
    const existing = allowed.get(parent);
    if (existing) existing.add(key);
    else allowed.set(parent, new Set([key]));
  };
  // Add every path prefix, so intermediate containers (`ui.hud`, `shiny.kind`)
  // are themselves allowed keys on their parent.
  const addPath = (path: string): void => {
    let parent = '';
    for (const segment of path.split('.')) {
      add(parent, segment);
      parent = parent === '' ? segment : `${parent}.${segment}`;
    }
  };
  for (const key of [
    'name',
    'palette',
    'ui',
    'slots',
    'enemy',
    'shiny',
    'advisory',
    'achievements',
    'assets',
  ]) {
    addPath(key);
  }
  for (const key of ['title', 'catalog', 'shelf']) add('achievements', key);
  for (const spec of THEME_FIELDS) addPath(spec.path);
  return allowed;
}

const ALLOWED_CHILDREN = buildAllowedChildren();
const DYNAMIC_CONTAINERS = new Set(['achievements.catalog', 'assets']);

interface Collected {
  measured: MeasuredString[];
  problems: ThemeProblem[];
}

function measureField(path: string, group: LimitGroup, value: unknown, spec: FieldSpec): {
  length?: number;
  problem?: ThemeProblem;
} {
  if (spec.kind === 'string') {
    if (typeof value !== 'string') {
      return {
        problem: {
          path,
          kind: 'wrong-type',
          message: `expected a string at "${path}", found ${describeValue(value)}`,
        },
      };
    }
    return { length: value.length };
  }
  if (typeof value !== 'function') {
    return {
      problem: {
        path,
        kind: 'wrong-type',
        message: `expected a template function at "${path}", found ${describeValue(value)}`,
      },
    };
  }
  const render = value as (...args: (string | number)[]) => unknown;
  const result = render(...spec.sampleArgs);
  if (typeof result !== 'string') {
    return {
      problem: {
        path,
        kind: 'wrong-type',
        message: `template at "${path}" must return a string, returned ${describeValue(result)}`,
      },
    };
  }
  return { length: result.length };
}

function validateAchievementCopy(
  id: string,
  copy: unknown,
  measured: MeasuredString[],
  problems: ThemeProblem[],
): void {
  const path = `achievements.catalog.${id}`;
  if (!isPlainObject(copy)) {
    problems.push({
      path,
      kind: 'wrong-type',
      message: `expected { title, description } at "${path}", found ${describeValue(copy)}`,
    });
    return;
  }
  for (const key of Object.keys(copy)) {
    if (key !== 'title' && key !== 'description') {
      problems.push({
        path: `${path}.${key}`,
        kind: 'bad-key',
        message: `unexpected key "${key}" in achievement copy; only "title" and "description" are allowed`,
      });
    }
  }

  const title = copy['title'];
  if (title === undefined) {
    problems.push({ path: `${path}.title`, kind: 'missing', message: `missing achievement title at "${path}.title"` });
  } else if (typeof title !== 'string') {
    problems.push({
      path: `${path}.title`,
      kind: 'wrong-type',
      message: `expected a string title at "${path}.title", found ${describeValue(title)}`,
    });
  } else {
    measured.push({ path: `${path}.title`, group: 'achievement-title', length: title.length });
  }

  const description = copy['description'];
  if (description === undefined) {
    problems.push({
      path: `${path}.description`,
      kind: 'missing',
      message: `missing achievement description at "${path}.description"`,
    });
  } else if (typeof description === 'function') {
    const render = description as (value: number) => unknown;
    const result = render(DESCRIPTION_SAMPLE_VALUE);
    if (typeof result !== 'string') {
      problems.push({
        path: `${path}.description`,
        kind: 'wrong-type',
        message: `description template at "${path}.description" must return a string, returned ${describeValue(result)}`,
      });
    } else {
      measured.push({
        path: `${path}.description`,
        group: 'achievement-description',
        length: result.length,
      });
    }
  } else if (typeof description === 'string') {
    measured.push({
      path: `${path}.description`,
      group: 'achievement-description',
      length: description.length,
    });
  } else {
    problems.push({
      path: `${path}.description`,
      kind: 'wrong-type',
      message: `expected a string or function description at "${path}.description", found ${describeValue(description)}`,
    });
  }
}

function collect(theme: Theme): Collected {
  const measured: MeasuredString[] = [];
  const problems: ThemeProblem[] = [];
  const root: unknown = theme;

  // a. Structural / b. identity-key — walk every own key in the theme.
  const walk = (node: unknown, path: string): void => {
    if (!isPlainObject(node)) return;
    for (const key of Object.keys(node)) {
      const childPath = path === '' ? key : `${path}.${key}`;
      const violation = identityViolation(key, path);
      if (violation) {
        problems.push({ path: childPath, kind: 'identity-key', message: violation });
      }
      const allowedHere = ALLOWED_CHILDREN.get(path);
      if (allowedHere && !allowedHere.has(key)) {
        problems.push({
          path: childPath,
          kind: 'bad-key',
          message: `unknown key "${childPath}"; it is not part of the theme contract (typo, or a field that belongs in code as identity)`,
        });
      }
      if (DYNAMIC_CONTAINERS.has(childPath)) continue;
      walk(node[key], childPath);
    }
  };
  walk(root, '');

  // b. Every declared slot present and of the right type; measure its length.
  for (const spec of THEME_FIELDS) {
    const value = readPath(root, spec.path);
    if (value === undefined) {
      problems.push({
        path: spec.path,
        kind: 'missing',
        message: `missing ${spec.kind === 'function' ? 'template' : 'string'} slot "${spec.path}"`,
      });
      continue;
    }
    const { length, problem } = measureField(spec.path, spec.group, value, spec);
    if (problem) problems.push(problem);
    else if (length !== undefined) measured.push({ path: spec.path, group: spec.group, length });
  }

  // b2. Palette colour shape. Presence/type/length are already covered by the
  // THEME_FIELDS pass above; this only rejects a present string that is not a
  // recognisable CSS colour.
  for (const spec of PALETTE_FIELDS) {
    const value = readPath(root, spec.path);
    if (typeof value === 'string' && !isColorValue(value)) {
      problems.push({
        path: spec.path,
        kind: 'bad-color',
        message: `expected a CSS colour (#rgb/#rrggbb/#rrggbbaa/rgb()/rgba()/hsl()/hsla()) at "${spec.path}", found ${JSON.stringify(value)}`,
      });
    }
  }

  // c. Achievement catalog completeness (exact id set, both directions).
  const catalog = readPath(root, 'achievements.catalog');
  if (catalog === undefined) {
    problems.push({
      path: 'achievements.catalog',
      kind: 'missing',
      message: 'missing "achievements.catalog" (copy must be keyed by every achievement id)',
    });
  } else if (!isPlainObject(catalog)) {
    problems.push({
      path: 'achievements.catalog',
      kind: 'wrong-type',
      message: `expected an object at "achievements.catalog", found ${describeValue(catalog)}`,
    });
  } else {
    const catalogKeys = Object.keys(catalog);
    for (const key of catalogKeys) {
      if (!ACHIEVEMENT_ID_SET.has(key)) {
        problems.push({
          path: `achievements.catalog.${key}`,
          kind: 'extra-achievement',
          message: `unknown achievement id "${key}" — a typo here would ship as missing copy for the real id`,
        });
      }
    }
    for (const id of ACHIEVEMENT_IDS) {
      const copy = catalog[id];
      if (copy === undefined) {
        problems.push({
          path: `achievements.catalog.${id}`,
          kind: 'missing-achievement',
          message: `missing achievement copy for id "${id}"`,
        });
      } else {
        validateAchievementCopy(id, copy, measured, problems);
      }
    }
  }

  // e. Assets section well-formed. On-disk existence + pixel dimensions are
  // checked by the CLI via `validateAssetMeasurements` (this module stays pure).
  const assets = readPath(root, 'assets');
  if (assets === undefined) {
    problems.push({
      path: 'assets',
      kind: 'missing',
      message: 'missing "assets" section (declare a file for every asset slot)',
    });
  } else if (!isPlainObject(assets)) {
    problems.push({
      path: 'assets',
      kind: 'wrong-type',
      message: `expected an object at "assets", found ${describeValue(assets)}`,
    });
  } else {
    for (const key of Object.keys(assets)) {
      if (!ASSET_SLOT_NAMES.has(key)) {
        problems.push({
          path: `assets.${key}`,
          kind: 'bad-key',
          message: `unknown asset slot "${key}"; not one of the ${ASSET_SLOTS.length} declared slots`,
        });
      }
    }
    for (const slot of ASSET_SLOTS) {
      const file = assets[slot.name];
      const path = `assets.${slot.name}`;
      if (file === undefined) {
        problems.push({
          path,
          kind: 'missing',
          message: `missing asset slot "${slot.name}" (expected file "${slot.file}")`,
        });
      } else if (typeof file !== 'string') {
        problems.push({
          path,
          kind: 'wrong-type',
          message: `expected a file-name string at "${path}", found ${describeValue(file)}`,
        });
      } else if (file !== slot.file || !ASSET_FILENAME_PATTERN.test(file)) {
        problems.push({
          path,
          kind: 'bad-filename',
          message: `expected file "${slot.file}" at "${path}" (lower-kebab-case .png), found ${JSON.stringify(file)}`,
        });
      }
    }
  }

  return { measured, problems };
}

/**
 * Measure every declared slot's RENDERED length (plain strings directly,
 * templates by calling them with their sample args). Useful to print the
 * limits table next to actuals when authoring a theme. Never throws.
 */
export function measureTheme(theme: Theme): MeasuredString[] {
  return collect(theme).measured;
}

function emptyGroupRecord(): Record<LimitGroup, number> {
  return {
    label: 0,
    chrome: 0,
    'achievement-title': 0,
    'achievement-description': 0,
    prose: 0,
    color: 0,
  };
}

/**
 * Validate a theme against the contract. Reports EVERY problem (never just the
 * first) and never throws on an invalid theme. `ok` is true only when there are
 * zero problems.
 */
export function validateTheme(theme: Theme): ThemeValidationResult {
  const { measured, problems } = collect(theme);
  const groupMax = emptyGroupRecord();
  const groupCount = emptyGroupRecord();
  let stringFields = 0;
  let templateFields = 0;

  for (const entry of measured) {
    groupCount[entry.group] += 1;
    if (entry.length > groupMax[entry.group]) groupMax[entry.group] = entry.length;
  }

  // Count plain vs template by re-inspecting the source values (cheap, and keeps
  // the measurement path single-purpose).
  for (const spec of THEME_FIELDS) {
    if (readPath(theme, spec.path) === undefined) continue;
    if (spec.kind === 'function') templateFields += 1;
    else stringFields += 1;
  }
  const catalog = readPath(theme, 'achievements.catalog');
  if (isPlainObject(catalog)) {
    for (const id of ACHIEVEMENT_IDS) {
      const copy = catalog[id];
      if (!isPlainObject(copy)) continue;
      if (typeof copy['description'] === 'function') templateFields += 1;
      else if (typeof copy['description'] === 'string') stringFields += 1;
      if (typeof copy['title'] === 'string') stringFields += 1;
    }
  }

  // b(limits). Character limits, applied to plain strings AND template returns.
  for (const entry of measured) {
    const rule = LIMITS[entry.group];
    if (entry.length > rule.max) {
      problems.push({
        path: entry.path,
        kind: 'too-long',
        message: `"${entry.path}" renders ${entry.length} characters; limit for "${entry.group}" is ${rule.max}`,
      });
    }
  }

  const stats: ThemeStats = {
    stringFields,
    templateFields,
    achievementIds: ACHIEVEMENT_IDS.length,
    assetSlots: ASSET_SLOTS.length,
    paletteKeys: PALETTE_FIELDS.length,
    groupMax,
    groupCount,
  };

  return { ok: problems.length === 0, problems, stats };
}

// ---------------------------------------------------------------------------
// Asset measurement validation (pure): the CLI reads the filesystem, this
// compares the MEASURED facts against the declared contract. Keeping the
// comparison here (and the `node:fs` reading in scripts/) keeps engine-core's
// `src/` free of filesystem access.
// ---------------------------------------------------------------------------

/**
 * One slot's measured facts, produced by the CLI. `width`/`height` are null when
 * the file is absent or could not be decoded; `error` carries the human reason
 * for an unreadable file.
 */
export interface AssetMeasurement {
  /** Canonical slot name (one of `ASSET_SLOTS`). */
  slot: string;
  /** Path the CLI read (used verbatim in problem messages). */
  path: string;
  /** Whether the file exists on disk. */
  exists: boolean;
  /** PNG width in pixels, or null when missing/unreadable. */
  width: number | null;
  /** PNG height in pixels, or null when missing/unreadable. */
  height: number | null;
  /** Human reason when the file exists but is not a readable PNG. */
  error: string | null;
}

export type AssetProblemKind =
  | 'unknown-slot'
  | 'missing-file'
  | 'unreadable-image'
  | 'wrong-dimensions';

export interface AssetProblem {
  slot: string;
  path: string;
  kind: AssetProblemKind;
  message: string;
}

export interface AssetCheckResult {
  ok: boolean;
  problems: AssetProblem[];
  /** Declared slots whose file exists and matched the declared dimensions. */
  correct: number;
  /** Declared slots whose file was absent. */
  missing: number;
  /** Declared slots present but with a different size (or unreadable). */
  mismatched: number;
}

/**
 * Compare measured asset facts against `ASSET_SLOTS`. Pure: it reads only its
 * arguments, never the filesystem, never throws, and reports EVERY problem at
 * once (a new theme learns about every missing/mis-sized file in one run).
 */
export function validateAssetMeasurements(
  theme: Theme,
  measurements: readonly AssetMeasurement[],
): AssetCheckResult {
  const problems: AssetProblem[] = [];
  const bySlot = new Map<string, AssetMeasurement>();
  for (const measurement of measurements) {
    if (!ASSET_SLOT_NAMES.has(measurement.slot)) {
      problems.push({
        slot: measurement.slot,
        path: measurement.path,
        kind: 'unknown-slot',
        message: `measured unknown asset slot "${measurement.slot}" (not one of the ${ASSET_SLOTS.length} declared slots)`,
      });
      continue;
    }
    bySlot.set(measurement.slot, measurement);
  }

  let correct = 0;
  let missing = 0;
  let mismatched = 0;
  for (const slot of ASSET_SLOTS) {
    const file = theme.assets[slot.name] ?? slot.file;
    const measurement = bySlot.get(slot.name);
    if (measurement === undefined || !measurement.exists) {
      missing += 1;
      problems.push({
        slot: slot.name,
        path: measurement?.path ?? file,
        kind: 'missing-file',
        message: `missing ${file} (expected ${slot.width}x${slot.height})`,
      });
      continue;
    }
    if (measurement.error !== null || measurement.width === null || measurement.height === null) {
      mismatched += 1;
      problems.push({
        slot: slot.name,
        path: measurement.path,
        kind: 'unreadable-image',
        message: `could not read PNG dimensions from "${measurement.path}"${measurement.error ? `: ${measurement.error}` : ''}`,
      });
      continue;
    }
    if (measurement.width !== slot.width || measurement.height !== slot.height) {
      mismatched += 1;
      problems.push({
        slot: slot.name,
        path: measurement.path,
        kind: 'wrong-dimensions',
        message: `${file} is ${measurement.width}x${measurement.height}, expected ${slot.width}x${slot.height}`,
      });
      continue;
    }
    correct += 1;
  }

  return { ok: problems.length === 0, problems, correct, missing, mismatched };
}
