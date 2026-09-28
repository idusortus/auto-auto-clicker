# `fantasy` theme art

These 32 PNGs are **PLACEHOLDERS**. They exist so the game renders the theme's
declared asset seam end-to-end. They are flat-coloured blocks with a corner
marker and a small index bar — deliberately not art.

Each file is named and sized to match one slot in `ASSET_SLOTS`
(`engine-core/src/theme/contract.ts`), which is the single source of truth for
the slot list, the exact pixel dimensions, and the file-name convention
(`^[a-z0-9]+(?:-[a-z0-9]+)*\.png$`).

## Verifying

From the repo root:

```sh
npm run theme:check
```

This checks every slot's file exists and its real PNG pixel size matches the
contract, and prints `N/N files present at the exact size` plus the path + actual
vs expected size for anything wrong. `npm run test` also covers the checker.

## Replacing them

Drop a real RGBA PNG in at the exact declared dimensions and name. Keep the file
name identical (the theme's `assets` map in
`engine-core/src/theme/fantasy.ts` points at it). Nothing else needs to change;
the host loads `/themes/fantasy/<file>` from this folder at boot.

Sprites are drawn with `image-rendering: pixelated`, so keep them low-resolution
and let the CSS scale them up. Transparency is honoured: sprites composite over
the themed background.

## Adding a theme

Create `web/public/themes/<theme-name>/`, add an `assets` map for that theme
(the directory name must equal the theme's `name`), and run `npm run theme:check`
with that theme active. The checker tells you exactly which files are missing or
the wrong size.
