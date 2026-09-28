# `lucky` theme art

These 32 PNGs are **PLACEHOLDERS**. They exist so the game renders the theme's
declared asset seam end-to-end. They are flat-coloured blocks with a corner
marker and a small index bar — deliberately not art.

They are the **grass/sun** hue family (warm yellows and greens), so a human can
tell at a glance that the theme swapped away from `fantasy`'s cool blue blocks.

Each file is named and sized to match one slot in `ASSET_SLOTS`
(`engine-core/src/theme/contract.ts`), which is the single source of truth for
the slot list, the exact pixel dimensions, and the file-name convention
(`^[a-z0-9]+(?:-[a-z0-9]+)*\.png$`).

## Verifying

From the repo root (with this theme active — see `engine-core/src/theme/index.ts`):

```sh
npm run theme:check
```

This checks every slot's file exists and its real PNG pixel size matches the
contract, and prints `N/N files present at the exact size` plus the path + actual
vs expected size for anything wrong. `npm run test` also covers the checker.

## Regenerating

From the repo root:

```sh
npm run theme:assets -- lucky
```

This rewrites all 32 files at the exact declared dimensions using the
dependency-free encoder in `engine-core/scripts/make-placeholder-assets.ts`
(a per-theme base hue makes each theme's block set visually distinct).

## Replacing them

Drop a real RGBA PNG in at the exact declared dimensions and name. Keep the file
name identical (the theme's `assets` map in
`engine-core/src/theme/lucky.ts` points at it). Nothing else needs to change;
the host loads `/themes/lucky/<file>` from this folder at boot.

Sprites are drawn with `image-rendering: pixelated`, so keep them low-resolution
and let the CSS scale them up. Transparency is honoured: sprites composite over
the themed background.
