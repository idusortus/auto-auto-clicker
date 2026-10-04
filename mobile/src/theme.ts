// theme.ts — the single bridge between the active theme and React Native styles.
//
// This is the RN analogue of `web/src/palette.ts` plus the asset-url helper in
// `web/src/renderer.ts`. It holds NO colour values and NO file names: every
// style colour comes from a theme palette TOKEN, and every asset is located by
// the theme's own `name` + `assets` map. Swapping `ACTIVE_THEME` (one line in
// engine-core) therefore rescans every component that styles through this
// module, with no component edit.
//
// Palette values are CSS colour strings. React Native accepts the hex / rgb /
// rgba / hsl forms the theme validator already permits, so no parsing or colour
// library is needed. `color-mix()`-style derived surfaces have no RN equivalent
// and are replaced with flat palette tokens (plus opacity where a smaller
// emphasis is wanted) — a visual simplification, not a behaviour change.

import type { ImageSourcePropType } from 'react-native';

import { ACTIVE_THEME } from '@auto-auto-clicker/engine-core';
import type { Theme } from '@auto-auto-clicker/engine-core';

import { THEME_ASSETS } from './themeAssets.gen';

/** The color-token shape of a theme palette (Theme['palette']). */
type ThemePalette = Theme['palette'];

/** The 19 semantic colour tokens, in a stable order, for iteration. */
export const PALETTE_KEYS = [
  'bg',
  'surface',
  'panel',
  'surfaceRaised',
  'control',
  'line',
  'lineStrong',
  'text',
  'textDim',
  'textMuted',
  'textDisabled',
  'accent',
  'accentHi',
  'accentLo',
  'accentEdge',
  'accentInk',
  'dangerMuted',
  'hpHi',
  'hpLo',
] as const satisfies readonly (keyof ThemePalette)[];

export type PaletteKey = (typeof PALETTE_KEYS)[number];

/**
 * The full set of RN style objects the components render through, derived
 * entirely from `theme.palette`. No member carries a hard-coded colour.
 */
export interface ThemeStyles {
  /** Root housing surface (page background). */
  screen: { backgroundColor: string };
  /** Recessed surface above the root. */
  surface: { backgroundColor: string };
  /** Panel plate. */
  panel: { backgroundColor: string; borderColor: string };
  /** Raised surface (cards, bag rows). */
  raised: { backgroundColor: string; borderColor: string };
  /** Control (button) base fill. */
  control: { backgroundColor: string; borderColor: string };
  /** Hairline separator / border. */
  hairline: { borderColor: string };
  /** Stronger edge for interactive surfaces. */
  edge: { borderColor: string };
  /** Primary body text. */
  text: { color: string };
  /** De-emphasised text. */
  textDim: { color: string };
  /** Muted label text. */
  textMuted: { color: string };
  /** Disabled text. */
  textDisabled: { color: string };
  /** The single accent, as a fill. */
  accent: { backgroundColor: string };
  /** Accent, brighter (highlight fill). */
  accentHi: { backgroundColor: string };
  /** Accent, darker (gradient base fill). */
  accentLo: { backgroundColor: string };
  /** Accent edge/outline. */
  accentEdge: { borderColor: string };
  /** Ink used on top of the accent. */
  accentInk: { color: string };
  /** Muted danger/badge text. */
  dangerMuted: { color: string };
  /** Health-bar gradient top. */
  hpHi: { backgroundColor: string };
  /** Health-bar gradient bottom. */
  hpLo: { backgroundColor: string };
  /** The recessed health-bar track behind the fill. */
  hpTrack: { backgroundColor: string };
  /** A full-screen modal backdrop, drawn in the theme's page background. */
  overlayBackdrop: { backgroundColor: string };
}

/**
 * Derive every component style object from one theme's palette. Pure: given the
 * same theme object it returns byte-identical styles, and changing any token
 * changes exactly the styles that read it.
 */
export function paletteToStyles(theme: Theme): ThemeStyles {
  const palette: ThemePalette = theme.palette;
  return {
    screen: { backgroundColor: palette.bg },
    surface: { backgroundColor: palette.surface },
    panel: { backgroundColor: palette.panel, borderColor: palette.line },
    raised: { backgroundColor: palette.surfaceRaised, borderColor: palette.line },
    control: { backgroundColor: palette.control, borderColor: palette.lineStrong },
    hairline: { borderColor: palette.line },
    edge: { borderColor: palette.lineStrong },
    text: { color: palette.text },
    textDim: { color: palette.textDim },
    textMuted: { color: palette.textMuted },
    textDisabled: { color: palette.textDisabled },
    accent: { backgroundColor: palette.accent },
    accentHi: { backgroundColor: palette.accentHi },
    accentLo: { backgroundColor: palette.accentLo },
    accentEdge: { borderColor: palette.accentEdge },
    accentInk: { color: palette.accentInk },
    dangerMuted: { color: palette.dangerMuted },
    hpHi: { backgroundColor: palette.hpHi },
    hpLo: { backgroundColor: palette.hpLo },
    hpTrack: { backgroundColor: palette.control },
    overlayBackdrop: { backgroundColor: palette.bg },
  };
}

/** The styles for the active theme. Components import this, never a token. */
export const styles: ThemeStyles = paletteToStyles(ACTIVE_THEME);

/**
 * A theme asset resolved to bundled art React Native can render.
 *
 * RN has no `/themes/<name>/` static route, so a slot cannot be loaded from a
 * URL: Metro needs a static `require()`, which the generated registry
 * (`themeAssets.gen.ts`) supplies. Every field here is DERIVED from the theme
 * (`name` + `assets`); no file name is hard-coded outside the theme's own
 * `assets` map. The registry stays FILE-keyed; a slot resolves to its ORDERED
 * frame list, and each frame carries the source + size measured from its PNG, so
 * sprites render at their declared size and sequences play in order.
 */
export interface ResolvedFrame {
  /** The frame file name the theme declares. */
  fileName: string;
  /** The bundled image module Metro resolves for this frame. */
  source: ImageSourcePropType;
  /** Declared pixel width, measured from the PNG's IHDR header. */
  width: number;
  /** Declared pixel height, measured from the PNG's IHDR header. */
  height: number;
}

export interface ResolvedAsset {
  /** Canonical asset slot name (e.g. `player-idle`). */
  slot: string;
  /** The theme that declared the slot. */
  themeName: string;
  /** The theme's declared frame files, in play order. */
  fileNames: readonly string[];
  /** The resolved frames, in play order (one entry per declared file). */
  frames: readonly ResolvedFrame[];
}

/**
 * Resolve an asset slot through the theme's `name` + `assets` map into its
 * ordered frames.
 *
 * Two distinct failures both fail loudly rather than rendering a silent blank:
 * a slot the theme does not declare (a theme authoring bug), and a frame the
 * theme declares but the bundled registry lacks (a stale/missing generated
 * registry — run `npm run mobile:assets`).
 */
export function resolveAsset(theme: Theme, slot: string): ResolvedAsset {
  const fileNames = theme.assets[slot];
  if (fileNames === undefined) {
    throw new Error(`[aac] theme "${theme.name}" declares no asset slot "${slot}"`);
  }
  const frames: ResolvedFrame[] = fileNames.map((fileName) => {
    const key = `${theme.name}/${fileName}`;
    const entry = THEME_ASSETS[key];
    if (entry === undefined) {
      throw new Error(
        `[aac] theme "${theme.name}" slot "${slot}" maps to "${key}", which the bundled ` +
          `asset registry does not contain — run \`npm run mobile:assets\` to regenerate it`,
      );
    }
    return { fileName, source: entry.source, width: entry.width, height: entry.height };
  });
  return { slot, themeName: theme.name, fileNames, frames };
}

/** Resolve a slot's specific FRAME through the ACTIVE_THEME (the common case). */
export function resolveActiveFrame(slot: string, frameIndex: number): ResolvedFrame {
  const asset = resolveAsset(ACTIVE_THEME, slot);
  const index = Math.max(0, Math.min(asset.frames.length - 1, frameIndex));
  const frame = asset.frames[index];
  if (frame === undefined) {
    throw new Error(`[aac] theme "${ACTIVE_THEME.name}" slot "${slot}" has no frames`);
  }
  return frame;
}

/** Resolve a slot through the ACTIVE_THEME (the common case). */
export function resolveActiveAsset(slot: string): ResolvedAsset {
  return resolveAsset(ACTIVE_THEME, slot);
}
