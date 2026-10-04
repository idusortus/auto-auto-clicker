// theme.test.ts — the palette→RN mapping and asset resolution.
//
// Proves requirement 5.1: every style is derived from a theme palette TOKEN
// (changing a token changes the produced style), and every asset is located via
// the theme's own `name` + `assets` map (no hard-coded colours or file names).

import { ACTIVE_THEME, fantasy } from '@auto-auto-clicker/engine-core';
import type { Theme } from '@auto-auto-clicker/engine-core';

import { PALETTE_KEYS, paletteToStyles, resolveAsset } from './theme';
import { THEME_ASSETS } from './themeAssets.gen';

/** A clone of a theme whose `assets` map declares an extra, unbundled slot. */
function withAsset(theme: Theme, slot: string, fileName: string): Theme {
  return { ...theme, assets: { ...theme.assets, [slot]: fileName } };
}

/** A clone of the active theme renamed so its registry key cannot resolve. */
function withName(theme: Theme, name: string): Theme {
  return { ...theme, name };
}

/** A clone of a theme with one palette token overridden. */
function withToken(theme: Theme, key: keyof Theme['palette'], value: string): Theme {
  return { ...theme, palette: { ...theme.palette, [key]: value } };
}

describe('PALETTE_KEYS', () => {
  it('covers exactly the theme palette token set', () => {
    const themeKeys = Object.keys(fantasy.palette).sort();
    expect([...PALETTE_KEYS].sort()).toEqual(themeKeys);
    expect(PALETTE_KEYS).toHaveLength(19);
  });
});

describe('paletteToStyles', () => {
  it('derives every style colour from a palette token, not a literal', () => {
    const styles = paletteToStyles(fantasy);
    expect(styles.screen.backgroundColor).toBe(fantasy.palette.bg);
    expect(styles.text.color).toBe(fantasy.palette.text);
    expect(styles.accent.backgroundColor).toBe(fantasy.palette.accent);
    expect(styles.hpHi.backgroundColor).toBe(fantasy.palette.hpHi);
    expect(styles.hpLo.backgroundColor).toBe(fantasy.palette.hpLo);
    expect(styles.overlayBackdrop.backgroundColor).toBe(fantasy.palette.bg);
  });

  it('changes the produced style when a palette token changes', () => {
    const before = paletteToStyles(fantasy);
    const after = paletteToStyles(withToken(fantasy, 'bg', '#123456'));
    expect(after.screen.backgroundColor).toBe('#123456');
    expect(after.screen.backgroundColor).not.toBe(before.screen.backgroundColor);
    // Only the token that changed moves; unaffected styles are unchanged.
    expect(after.text.color).toBe(before.text.color);
  });

  it('changes the accent style when the accent token changes', () => {
    const after = paletteToStyles(withToken(fantasy, 'accent', 'rgb(1, 2, 3)'));
    expect(after.accent.backgroundColor).toBe('rgb(1, 2, 3)');
  });
});

describe('resolveAsset (2.3)', () => {
  it('resolves a slot through the theme name and asset map', () => {
    const asset = resolveAsset(fantasy, 'player-idle');
    expect(asset.slot).toBe('player-idle');
    expect(asset.themeName).toBe(fantasy.name);
    expect(asset.fileName).toBe(fantasy.assets['player-idle']);
  });

  it('returns the registry source, width, and height for the declared file', () => {
    const asset = resolveAsset(fantasy, 'player-idle');
    const entry = THEME_ASSETS[`${fantasy.name}/${fantasy.assets['player-idle']}`];
    expect(entry).toBeDefined();
    expect(asset.source).toBe(entry!.source);
    expect(asset.width).toBe(entry!.width);
    expect(asset.height).toBe(entry!.height);
  });

  it('takes the boss frame size from the registry (larger than the normal enemy)', () => {
    const normal = resolveAsset(fantasy, 'enemy-grunt-idle');
    const boss = resolveAsset(fantasy, 'boss-grunt-idle');
    expect(boss.width).toBeGreaterThan(normal.width);
    expect(boss.height).toBeGreaterThan(normal.height);
  });

  it('resolves different file names for different slots from the theme alone', () => {
    const a = resolveAsset(fantasy, 'player-idle');
    const b = resolveAsset(fantasy, 'boss-grunt-idle');
    expect(a.fileName).not.toBe(b.fileName);
  });

  it('throws for a slot the theme does not declare', () => {
    expect(() => resolveAsset(fantasy, 'not-a-real-slot')).toThrow(/no asset slot "not-a-real-slot"/);
  });

  it('throws for a declared slot the registry does not contain', () => {
    const theme = withAsset(ACTIVE_THEME, 'player-idle', 'unbundled-slot.png');
    expect(() => resolveAsset(theme, 'player-idle')).toThrow(/does not contain/);
  });

  it('throws when the theme name has no registry entries at all', () => {
    const theme = withName(ACTIVE_THEME, 'no-such-theme');
    expect(() => resolveAsset(theme, 'player-idle')).toThrow(/does not contain/);
  });
});
