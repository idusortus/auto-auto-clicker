// palette.ts — push the active theme's colour tokens into CSS.
//
// The stylesheet owns the layout (sizes, spacing, motion) and keeps its `:root`
// colour block purely as a documented FALLBACK (so the page still reads
// correctly before the host boots, or if it never does). At boot `applyPalette`
// overrides those same custom properties from the theme, so swapping the theme
// retints the whole UI without touching `style.css`.
//
// The override is written as a `<style>` rule (not inline styles on the root):
// an injected rule of equal specificity wins by source order, which lets the
// stylesheet's `prefers-contrast: more` block — written as `:root:root`, one
// point of specificity higher — keep overriding the theme for high-contrast
// users. Inline styles on the root would beat that block and break the setting.

import type { Theme } from '@auto-auto-clicker/engine-core';

type PaletteKey = keyof Theme['palette'];

/**
 * Maps each semantic theme palette token to the CSS custom property that
 * `style.css` consumes. This is the single bridge between the theme's names and
 * the stylesheet's variable names; no colour value is written here.
 */
const PALETTE_VARS: Record<PaletteKey, string> = {
  bg: '--ink-900',
  surface: '--ink-800',
  panel: '--ink-700',
  surfaceRaised: '--ink-600',
  control: '--ink-500',
  line: '--line',
  lineStrong: '--line-strong',
  text: '--text',
  textDim: '--text-dim',
  textMuted: '--text-muted',
  textDisabled: '--text-disabled',
  accent: '--ember',
  accentHi: '--ember-hi',
  accentLo: '--ember-lo',
  accentEdge: '--ember-edge',
  accentInk: '--ember-ink',
  dangerMuted: '--danger-dim',
  hpHi: '--hp-hi',
  hpLo: '--hp-lo',
};

const PALETTE_STYLE_ID = 'theme-palette';

/** Apply `theme.palette` to the document as CSS custom properties. */
export function applyPalette(theme: Theme): void {
  const declarations = (Object.keys(PALETTE_VARS) as PaletteKey[])
    .filter((key) => typeof theme.palette[key] === 'string')
    .map((key) => `${PALETTE_VARS[key]}:${theme.palette[key]};`)
    .join('');

  let style = document.getElementById(PALETTE_STYLE_ID);
  if (!(style instanceof HTMLStyleElement)) {
    style = document.createElement('style');
    style.id = PALETTE_STYLE_ID;
    document.head.append(style);
  }
  style.textContent = `:root{${declarations}}`;

  // Keep the browser chrome colour in step with the theme's page background.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta !== null) meta.setAttribute('content', theme.palette.bg);
}
