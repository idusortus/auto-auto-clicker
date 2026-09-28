import { describe, expect, it } from 'vitest';
import { ACTIVE_THEME, fantasy, lucky, THEMES } from '../src/theme';
import type { Theme } from '../src/theme';
import { ACHIEVEMENTS } from '../src/achievements';
import {
  ASSET_SLOTS,
  LIMITS,
  PALETTE_FIELDS,
  isColorValue,
  measureTheme,
  validateTheme,
  validateAssetMeasurements,
} from '../src/theme/contract';
import type {
  AssetMeasurement,
  ThemeProblem,
  ThemeProblemKind,
} from '../src/theme/contract';

/**
 * Deep clone that PRESERVES functions (structuredClone throws on them). Theme
 * fixtures differ from `fantasy` by one deliberate break, so a clean clone is
 * the starting point for every negative case.
 */
function cloneTheme(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneTheme);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) out[key] = cloneTheme(child);
    return out;
  }
  return value;
}

type BrokenTheme = Record<string, any>;

function broken(): BrokenTheme {
  return cloneTheme(fantasy) as BrokenTheme;
}

function findProblem(
  problems: readonly ThemeProblem[],
  path: string,
  kind: ThemeProblemKind,
): ThemeProblem | undefined {
  return problems.find((problem) => problem.path === path && problem.kind === kind);
}

describe('theme contract — the active theme ships clean', () => {
  it('validates ACTIVE_THEME with no problems', () => {
    const result = validateTheme(ACTIVE_THEME);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('validates the fantasy theme with no problems', () => {
    const result = validateTheme(fantasy);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('pins the measured surface: 136 string slots, 42 templates, 30 achievements, 32 assets, 19 colours', () => {
    const { stats } = validateTheme(fantasy);
    expect(stats.stringFields).toBe(136);
    expect(stats.templateFields).toBe(42);
    expect(stats.achievementIds).toBe(30);
    expect(stats.assetSlots).toBe(32);
    expect(stats.paletteKeys).toBe(19);
  });

  it('keeps every measured slot comfortably inside its limit', () => {
    for (const entry of measureTheme(fantasy)) {
      expect(
        entry.length,
        `${entry.path} measured ${entry.length}, limit ${LIMITS[entry.group].max}`,
      ).toBeLessThanOrEqual(LIMITS[entry.group].max);
    }
  });
});

// T5 — a second implementer is only worth anything if the CONTRACT runs against
// it. These tests validate EVERY shipped theme (not just the active one), so a
// newly added theme is self-checking in CI and an inactive theme cannot rot.
describe('theme contract — every shipped theme ships clean', () => {
  it('registers the fantasy and lucky themes with unique names', () => {
    const names = THEMES.map((theme) => theme.name);
    expect(names).toContain('fantasy');
    expect(names).toContain('lucky');
    // The asset folder convention keys off the theme name, so names must be unique.
    expect(new Set(names).size).toBe(names.length);
  });

  for (const theme of THEMES) {
    it(`validates the "${theme.name}" theme with no problems`, () => {
      const result = validateTheme(theme);
      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
    });

    it(`keeps every "${theme.name}" slot inside its limit`, () => {
      for (const entry of measureTheme(theme)) {
        expect(
          entry.length,
          `${theme.name}:${entry.path} measured ${entry.length}, limit ${LIMITS[entry.group].max}`,
        ).toBeLessThanOrEqual(LIMITS[entry.group].max);
      }
    });
  }
});

describe('theme contract — structural parity across themes', () => {
  it('every theme declares exactly the same achievement id set (the code-owned set)', () => {
    const canonical = ACHIEVEMENTS.map((achievement) => achievement.id).sort();
    const reference = Object.keys(fantasy.achievements.catalog).sort();
    expect(reference).toEqual(canonical);
    for (const theme of THEMES) {
      expect(Object.keys(theme.achievements.catalog).sort(), theme.name).toEqual(reference);
    }
  });

  it('every theme declares exactly the same asset slot set (the declared slots)', () => {
    const canonical = ASSET_SLOTS.map((slot) => slot.name).sort();
    const reference = Object.keys(fantasy.assets).sort();
    expect(reference).toEqual(canonical);
    for (const theme of THEMES) {
      expect(Object.keys(theme.assets).sort(), theme.name).toEqual(reference);
    }
  });
});

// Guard against a "second theme" that is a copy-paste of the first: the whole
// point is different words and different colours.
describe('theme contract — the two themes are genuinely different', () => {
  it('differs in every palette token value', () => {
    const reference = fantasy.palette;
    const compared = lucky.palette;
    const keys = Object.keys(reference) as (keyof typeof reference)[];
    const differing = keys.filter((key) => reference[key] !== compared[key]);
    expect(differing.length).toBe(keys.length);
  });

  it('differs across the display surface', () => {
    expect(lucky.name).not.toBe(fantasy.name);
    expect(lucky.ui.tapHint).not.toBe(fantasy.ui.tapHint);
    expect(lucky.slots.display.weapon).not.toBe(fantasy.slots.display.weapon);
    expect(lucky.shiny.name).not.toBe(fantasy.shiny.name);
    expect(lucky.enemy.label).not.toBe(fantasy.enemy.label);
  });

  it('differs in achievement copy for every id (title+description pair)', () => {
    for (const id of Object.keys(fantasy.achievements.catalog)) {
      const reference = fantasy.achievements.catalog[id];
      const compared = lucky.achievements.catalog[id];
      expect(reference, `fantasy is missing ${id}`).toBeDefined();
      expect(compared, `lucky is missing ${id}`).toBeDefined();
      if (reference === undefined || compared === undefined) continue;
      const referenceDescription =
        typeof reference.description === 'function' ? reference.description(0) : reference.description;
      const comparedDescription =
        typeof compared.description === 'function' ? compared.description(0) : compared.description;
      // A couple of idiomatic titles are reused on purpose; the COPY PAIR
      // (title + description) must never be a verbatim copy-paste.
      expect(
        [compared.title, comparedDescription],
        `${id} copy is identical to fantasy`,
      ).not.toEqual([reference.title, referenceDescription]);
    }
  });
});

describe('theme contract — validator reports broken fixtures with useful paths', () => {
  it('reports a too-long plain string', () => {
    const theme = broken();
    theme.ui.choice.note = 'x'.repeat(300);
    const { problems } = validateTheme(theme as Theme);
    const problem = findProblem(problems, 'ui.choice.note', 'too-long');
    expect(problem).toBeDefined();
    expect(problem?.message).toContain('300');
    expect(problem?.message).toContain(String(LIMITS.prose.max));
  });

  it('reports a missing required key', () => {
    const theme = broken();
    delete theme.ui.tapHint;
    const { problems } = validateTheme(theme as Theme);
    const problem = findProblem(problems, 'ui.tapHint', 'missing');
    expect(problem).toBeDefined();
    expect(problem?.message).toContain('ui.tapHint');
  });

  it('reports a wrong type where a string is required', () => {
    const theme = broken();
    theme.ui.tapHint = 42;
    const { problems } = validateTheme(theme as Theme);
    expect(findProblem(problems, 'ui.tapHint', 'wrong-type')).toBeDefined();
  });

  it('reports a wrong type where a template function is required', () => {
    const theme = broken();
    theme.ui.boost.timer = 'not a function';
    const { problems } = validateTheme(theme as Theme);
    const problem = findProblem(problems, 'ui.boost.timer', 'wrong-type');
    expect(problem).toBeDefined();
    expect(problem?.message).toContain('template function');
  });

  it('reports a missing achievement id', () => {
    const theme = broken();
    delete theme.achievements.catalog['first-blood'];
    const { problems } = validateTheme(theme as Theme);
    expect(
      findProblem(problems, 'achievements.catalog.first-blood', 'missing-achievement'),
    ).toBeDefined();
  });

  it('reports an extra (typo) achievement id', () => {
    const theme = broken();
    theme.achievements.catalog['first-blod'] = { title: 'Typo', description: 'Oops.' };
    const { problems } = validateTheme(theme as Theme);
    const problem = findProblem(problems, 'achievements.catalog.first-blod', 'extra-achievement');
    expect(problem).toBeDefined();
    expect(problem?.message).toContain('missing copy');
  });

  it('reports a template whose RETURN value is too long', () => {
    const theme = broken();
    theme.ui.duration.seconds = () => 'y'.repeat(500);
    const { problems } = validateTheme(theme as Theme);
    const problem = findProblem(problems, 'ui.duration.seconds', 'too-long');
    expect(problem).toBeDefined();
    expect(problem?.message).toContain('500');
  });

  it('reports an identity-key violation (a theme-controlled rename)', () => {
    const theme = broken();
    theme.identity = { weapon: 'blade' };
    const { problems } = validateTheme(theme as Theme);
    const problem = findProblem(problems, 'identity.weapon', 'identity-key');
    expect(problem).toBeDefined();
    expect(problem?.message).toContain('gear identity token');
  });

  it('reports an achievement id used as a key outside the catalog', () => {
    const theme = broken();
    theme.advisory['first-blood'] = 'renamed';
    const { problems } = validateTheme(theme as Theme);
    expect(findProblem(problems, 'advisory.first-blood', 'identity-key')).toBeDefined();
  });

  it('reports a bad/unknown key', () => {
    const theme = broken();
    theme.ui.hud.goldd = 'Gold';
    const { problems } = validateTheme(theme as Theme);
    const problem = findProblem(problems, 'ui.hud.goldd', 'bad-key');
    expect(problem).toBeDefined();
    expect(problem?.message).toContain('not part of the theme contract');
  });

  it('reports every problem at once, not just the first', () => {
    const theme = broken();
    delete theme.ui.tapHint;
    theme.ui.choice.note = 'x'.repeat(300);
    theme.ui.boost.timer = 'not a function';
    delete theme.achievements.catalog.hoarder;
    const { problems, ok } = validateTheme(theme as Theme);
    expect(ok).toBe(false);
    const paths = problems.map((problem) => `${problem.kind}:${problem.path}`);
    expect(paths).toContain('missing:ui.tapHint');
    expect(paths).toContain('too-long:ui.choice.note');
    expect(paths).toContain('wrong-type:ui.boost.timer');
    expect(paths).toContain('missing-achievement:achievements.catalog.hoarder');
  });
});

describe('theme contract — achievement catalog completeness', () => {
  it('requires exactly the canonical achievement id set', () => {
    const theme = broken();
    theme.achievements.catalog['not-real'] = { title: 'Nope', description: 'Nope.' };
    delete theme.achievements.catalog['grass-30'];
    const { problems } = validateTheme(theme as Theme);
    expect(findProblem(problems, 'achievements.catalog.not-real', 'extra-achievement')).toBeDefined();
    expect(
      findProblem(problems, 'achievements.catalog.grass-30', 'missing-achievement'),
    ).toBeDefined();
  });
});

describe('theme contract — assets section is well-formed (files checked in T4)', () => {
  it('declares a unique, convention-respecting slot set', () => {
    const names = ASSET_SLOTS.map((slot) => slot.name);
    expect(new Set(names).size).toBe(names.length);
    for (const slot of ASSET_SLOTS) {
      expect(slot.file).toBe(`${slot.name}.png`);
      expect(slot.width).toBeGreaterThan(0);
      expect(slot.height).toBeGreaterThan(0);
    }
    expect(ASSET_SLOTS.length).toBe(32);
  });

  it('does NOT fail the main validation when asset files are absent from disk', () => {
    // No filesystem access happens in the validator; a well-formed section is
    // enough for now (existence + pixel size land in T4).
    expect(validateTheme(fantasy).ok).toBe(true);
  });

  it('reports a missing asset slot', () => {
    const theme = broken();
    delete theme.assets['player-idle'];
    const { problems } = validateTheme(theme as Theme);
    const problem = findProblem(problems, 'assets.player-idle', 'missing');
    expect(problem).toBeDefined();
    expect(problem?.message).toContain('player-idle.png');
  });

  it('reports a non-conforming file name', () => {
    const theme = broken();
    theme.assets['player-idle'] = 'Player Idle.jpg';
    const { problems } = validateTheme(theme as Theme);
    expect(findProblem(problems, 'assets.player-idle', 'bad-filename')).toBeDefined();
  });

  it('reports an unknown asset slot key', () => {
    const theme = broken();
    theme.assets['player-jump'] = 'player-jump.png';
    const { problems } = validateTheme(theme as Theme);
    expect(findProblem(problems, 'assets.player-jump', 'bad-key')).toBeDefined();
  });
});

describe('theme contract — palette (colour tokens)', () => {
  it('every fantasy palette value is a valid CSS colour', () => {
    for (const spec of PALETTE_FIELDS) {
      const key = spec.path.slice('palette.'.length) as keyof typeof fantasy.palette;
      expect(isColorValue(fantasy.palette[key]), spec.path).toBe(true);
    }
    expect(PALETTE_FIELDS.length).toBe(19);
  });

  it('accepts functional colour forms (rgba/hsl)', () => {
    const theme = broken();
    theme.palette.accent = 'rgba(255, 157, 60, 0.8)';
    theme.palette.accentHi = 'hsl(30 100% 60%)';
    expect(validateTheme(theme as Theme).ok).toBe(true);
  });

  it('reports a missing palette key', () => {
    const theme = broken();
    delete theme.palette.accent;
    const { problems } = validateTheme(theme as Theme);
    expect(findProblem(problems, 'palette.accent', 'missing')).toBeDefined();
  });

  it('reports a non-colour palette value as bad-color', () => {
    const theme = broken();
    theme.palette.accent = 'plaid';
    const { problems } = validateTheme(theme as Theme);
    const problem = findProblem(problems, 'palette.accent', 'bad-color');
    expect(problem).toBeDefined();
    expect(problem?.message).toContain('plaid');
  });

  it('reports an unknown palette key', () => {
    const theme = broken();
    theme.palette.ultraviolet = '#8800ff';
    const { problems } = validateTheme(theme as Theme);
    expect(findProblem(problems, 'palette.ultraviolet', 'bad-key')).toBeDefined();
  });
});

describe('theme contract — asset measurement validation (pure)', () => {
  function goodMeasurements(): AssetMeasurement[] {
    return ASSET_SLOTS.map((slot) => ({
      slot: slot.name,
      path: `fantasy/${slot.file}`,
      exists: true,
      width: slot.width,
      height: slot.height,
      error: null,
    }));
  }

  it('accepts a complete set of correctly-sized files', () => {
    const result = validateAssetMeasurements(fantasy, goodMeasurements());
    expect(result.ok).toBe(true);
    expect(result.correct).toBe(ASSET_SLOTS.length);
    expect(result.problems).toEqual([]);
  });

  it('reports a file whose actual size differs, with actual vs expected', () => {
    const measurements = goodMeasurements().map((m) =>
      m.slot === 'player-idle' ? { ...m, width: 48, height: 48 } : m,
    );
    const { ok, problems } = validateAssetMeasurements(fantasy, measurements);
    expect(ok).toBe(false);
    const problem = problems.find((p) => p.slot === 'player-idle');
    expect(problem?.kind).toBe('wrong-dimensions');
    expect(problem?.message).toContain('player-idle.png is 48x48, expected 64x64');
  });

  it('reports a missing file', () => {
    const measurements = goodMeasurements().map((m) =>
      m.slot === 'shiny-idle' ? { ...m, exists: false, width: null, height: null } : m,
    );
    const { problems } = validateAssetMeasurements(fantasy, measurements);
    const problem = problems.find((p) => p.slot === 'shiny-idle');
    expect(problem?.kind).toBe('missing-file');
    expect(problem?.message).toContain('shiny-idle.png');
  });

  it('reports an unreadable file separately from a missing one', () => {
    const measurements = goodMeasurements().map((m) =>
      m.slot === 'boss-grunt-idle'
        ? { ...m, width: null, height: null, error: 'not a PNG' }
        : m,
    );
    const { problems } = validateAssetMeasurements(fantasy, measurements);
    expect(problems.find((p) => p.slot === 'boss-grunt-idle')?.kind).toBe('unreadable-image');
  });

  it('reports an unknown slot measurement', () => {
    const measurements: AssetMeasurement[] = [
      ...goodMeasurements(),
      { slot: 'player-jump', path: 'fantasy/player-jump.png', exists: true, width: 64, height: 64, error: null },
    ];
    const { problems } = validateAssetMeasurements(fantasy, measurements);
    expect(problems.find((p) => p.slot === 'player-jump')?.kind).toBe('unknown-slot');
  });

  it('aggregates every problem in one pass (never throws, never stops early)', () => {
    const measurements = goodMeasurements().map((m) => {
      if (m.slot === 'player-idle') return { ...m, width: 1, height: 1 };
      if (m.slot === 'shiny-idle') return { ...m, exists: false, width: null, height: null };
      if (m.slot === 'boss-grunt-idle') return { ...m, width: null, height: null, error: 'bad' };
      return m;
    });
    const result = validateAssetMeasurements(fantasy, measurements);
    expect(result.ok).toBe(false);
    expect(result.missing).toBe(1);
    expect(result.mismatched).toBe(2);
    expect(result.correct).toBe(ASSET_SLOTS.length - 3);
    expect(result.problems).toHaveLength(3);
  });
});

describe('theme contract — robustness', () => {
  it('never throws on a garbage theme and reports missing slots', () => {
    let result: ReturnType<typeof validateTheme> | undefined;
    expect(() => {
      result = validateTheme({} as Theme);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    expect(result?.problems.length).toBeGreaterThan(0);
  });

  it('gives every problem a non-empty path, known kind, and message', () => {
    const theme = broken();
    theme.identity = { grunt: 'Ogre' };
    const { problems } = validateTheme(theme as Theme);
    for (const problem of problems) {
      expect(problem.path.length).toBeGreaterThan(0);
      expect(problem.message.length).toBeGreaterThan(0);
      expect(typeof problem.kind).toBe('string');
    }
  });
});
