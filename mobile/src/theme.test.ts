// theme.test.ts — the palette→RN mapping and asset resolution.
//
// Proves requirement 5.1: every style is derived from a theme palette TOKEN
// (changing a token changes the produced style), and every asset is located via
// the theme's own `name` + `assets` map (no hard-coded colours or file names).

import { fantasy } from '@auto-auto-clicker/engine-core';
import type { Theme } from '@auto-auto-clicker/engine-core';

import { PALETTE_KEYS, paletteToStyles, resolveAsset } from './theme';

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

describe('resolveAsset', () => {
  it('resolves a slot through the theme name and asset map', () => {
    const asset = resolveAsset(fantasy, 'player-idle');
    expect(asset.slot).toBe('player-idle');
    expect(asset.themeName).toBe(fantasy.name);
    expect(asset.fileName).toBe(fantasy.assets['player-idle']);
  });

  it('resolves different file names for different slots from the theme alone', () => {
    const a = resolveAsset(fantasy, 'player-idle');
    const b = resolveAsset(fantasy, 'boss-grunt-idle');
    expect(a.fileName).not.toBe(b.fileName);
  });

  it('throws for a slot the theme does not declare', () => {
    expect(() => resolveAsset(fantasy, 'not-a-real-slot')).toThrow(/no asset slot "not-a-real-slot"/);
  });
});
