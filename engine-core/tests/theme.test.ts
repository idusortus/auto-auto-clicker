import { describe, expect, it } from 'vitest';
import { ACTIVE_THEME, fantasy } from '../src/theme';
import type { Theme } from '../src/theme';
import {
  ASSET_SLOTS,
  LIMITS,
  measureTheme,
  validateTheme,
} from '../src/theme/contract';
import type { ThemeProblem, ThemeProblemKind } from '../src/theme/contract';

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

  it('pins the measured surface: 117 string slots, 42 templates, 30 achievements, 32 assets', () => {
    const { stats } = validateTheme(fantasy);
    expect(stats.stringFields).toBe(117);
    expect(stats.templateFields).toBe(42);
    expect(stats.achievementIds).toBe(30);
    expect(stats.assetSlots).toBe(32);
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
