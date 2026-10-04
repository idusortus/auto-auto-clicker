// themeAssets.test.ts — the generated registry's completeness contract (2.4).
//
// The registry (`themeAssets.gen.ts`) is committed so the APK build and Jest run
// with no prior generation step, but it can drift from the theme declarations.
// These tests fail loudly in CI when it does: every slot the active theme
// declares must be present in `THEME_ASSETS`, and every shipped theme directory
// the generator copied must have produced entries for all of its PNGs. (The
// engine's public index exports only `ACTIVE_THEME` / `fantasy`, not the full
// `THEMES`, so the shipped-theme check works from the generated keys rather than
// an engine import — editing engine-core is out of scope for this change.)
//
// The coverage helper is exported so it can be aimed at a deliberately-shrunk
// registry to prove a missing entry is actually caught.

import { ACTIVE_THEME } from '@auto-auto-clicker/engine-core';
import type { Theme } from '@auto-auto-clicker/engine-core';

import { THEME_ASSETS } from './themeAssets.gen';
import type { ThemeAssetSource } from './themeAssets.gen';

/** The shipped theme directory names the generator copies (from `web/public/themes/`). */
const SHIPPED_THEMES = ['fantasy', 'lucky'] as const;

/** Registry keys declared by any theme's `assets` map (name/fileName pairs). */
function declaredKeys(theme: Theme): string[] {
  return Object.values(theme.assets).map((fileName) => `${theme.name}/${fileName}`);
}

/** Keys a theme declares that a given registry lacks. */
function missingKeys(theme: Theme, registry: Record<string, ThemeAssetSource>): string[] {
  return declaredKeys(theme).filter((key) => registry[key] === undefined);
}

/** Registry keys belonging to one shipped theme directory. */
function keysForTheme(registry: Record<string, ThemeAssetSource>, name: string): string[] {
  return Object.keys(registry).filter((key) => key.startsWith(`${name}/`));
}

describe('THEME_ASSETS (2.4)', () => {
  it('covers every asset key the active theme declares', () => {
    expect(missingKeys(ACTIVE_THEME, THEME_ASSETS)).toEqual([]);
  });

  it('has 32 entries per shipped theme (the declared slot count)', () => {
    for (const name of SHIPPED_THEMES) {
      expect(keysForTheme(THEME_ASSETS, name)).toHaveLength(32);
    }
  });

  it('covers a registry key for every active-theme slot, both themes present', () => {
    const activeKeys = declaredKeys(ACTIVE_THEME);
    expect(activeKeys.length).toBe(32);
    for (const key of activeKeys) {
      expect(THEME_ASSETS[key]).toBeDefined();
    }
    for (const name of SHIPPED_THEMES) {
      expect(keysForTheme(THEME_ASSETS, name).length).toBeGreaterThan(0);
    }
  });

  it('carries a positive measured width and height for every entry', () => {
    for (const [key, entry] of Object.entries(THEME_ASSETS)) {
      expect(`${key}: ${entry.width}x${entry.height}`).toMatch(/^\S+: [1-9]\d*x[1-9]\d*$/);
      expect(entry.source).toBeDefined();
    }
  });

  it('fails when a registry entry the active theme needs is removed', () => {
    const shrunk = { ...THEME_ASSETS };
    const firstKey = declaredKeys(ACTIVE_THEME)[0]!;
    delete shrunk[firstKey];
    expect(missingKeys(ACTIVE_THEME, shrunk)).toEqual([firstKey]);
  });
});
