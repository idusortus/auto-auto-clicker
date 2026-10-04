// scripts/check-theme.ts — `npm run theme:check`
//
// Validates the ACTIVE theme against the theme contract AND verifies its declared
// art actually exists on disk at the right pixel size, printing a readable
// report and exiting non-zero on any problem. This is the authoring checklist: a
// new theme runs this and gets the exact list of anything wrong or missing —
// text problems, colour problems, missing files, and mis-sized PNGs.
//
// Dependency-free: plain `tsx`, no new packages. The `node:fs` reading happens
// HERE (the script layer); the pure comparison lives in `src/theme/contract.ts`,
// so engine-core's runtime stays filesystem-free.
//
// The asset directory convention is `web/public/themes/<theme-name>/`. Set
// `AAC_THEME_DIR` to point the check at another directory (used by tests and for
// previewing a theme before it is committed).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTIVE_THEME } from '../src/theme';
import {
  ASSET_SLOTS,
  LIMITS,
  PALETTE_FIELDS,
  THEME_FIELDS,
  validateAssetMeasurements,
  validateTheme,
} from '../src/theme/contract';
import type { AssetMeasurement, LimitGroup } from '../src/theme/contract';
import { readPngDimensions } from './png';

const ORDER = Object.keys(LIMITS) as LimitGroup[];

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value;
}

/** Repo root, resolved from this script's URL (`engine-core/scripts/` → repo). */
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Directory the active theme's art is expected in. */
function themeAssetDir(themeName: string): string {
  return process.env['AAC_THEME_DIR'] ?? join(repoRoot, 'web', 'public', 'themes', themeName);
}

/**
 * Read every declared FRAME from disk and measure its PNG size. A missing file,
 * an unreadable file, and a file with no dimensions are all represented (never
 * thrown) so the pure validator can report them together.
 */
function measureAssets(theme: typeof ACTIVE_THEME, dir: string): AssetMeasurement[] {
  const measurements: AssetMeasurement[] = [];
  for (const slot of ASSET_SLOTS) {
    const declared = theme.assets[slot.name];
    for (let frameIndex = 0; frameIndex < slot.frames.length; frameIndex += 1) {
      const file = declared?.[frameIndex] ?? slot.frames[frameIndex] ?? slot.file;
      const path = join(dir, file);
      if (!existsSync(path)) {
        measurements.push({
          slot: slot.name,
          frameIndex,
          path,
          exists: false,
          width: null,
          height: null,
          error: null,
        });
        continue;
      }
      try {
        const size = readPngDimensions(readFileSync(path));
        if (size === null) {
          measurements.push({
            slot: slot.name,
            frameIndex,
            path,
            exists: true,
            width: null,
            height: null,
            error: 'not a PNG (bad signature or missing IHDR)',
          });
          continue;
        }
        measurements.push({
          slot: slot.name,
          frameIndex,
          path,
          exists: true,
          width: size.width,
          height: size.height,
          error: null,
        });
      } catch (error) {
        measurements.push({
          slot: slot.name,
          frameIndex,
          path,
          exists: true,
          width: null,
          height: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return measurements;
}

const themeName = String(ACTIVE_THEME.name ?? '(unnamed)');
const result = validateTheme(ACTIVE_THEME);

const assetDir = themeAssetDir(themeName);
const measurements = measureAssets(ACTIVE_THEME, assetDir);
const assets = validateAssetMeasurements(ACTIVE_THEME, measurements);
/** Total declared frames across every slot (the unit the checker verifies). */
const totalFrames = ASSET_SLOTS.reduce((sum, slot) => sum + slot.frames.length, 0);

console.log(`Theme contract check — ACTIVE_THEME "${themeName}"`);
console.log(
  `  slots:        ${result.stats.stringFields} strings + ${result.stats.templateFields} templates ` +
    `(${THEME_FIELDS.length} declared + ${result.stats.achievementIds} achievement ids)`,
);
console.log(
  `  achievements: ${result.stats.achievementIds}/${result.stats.achievementIds} ids required`,
);
console.log(
  `  palette:      ${PALETTE_FIELDS.length} colour tokens (applied to CSS custom properties by the host)`,
);
console.log(`  assets:       ${ASSET_SLOTS.length} declared slots · ${totalFrames} frames · dir ${assetDir}`);
console.log(
  `                ${assets.correct}/${totalFrames} frames present at the exact size ` +
    `(${assets.missing} missing, ${assets.mismatched} mis-sized/unreadable)`,
);
console.log('');
console.log('  limits (group · observed max / limit · slots)');
for (const group of ORDER) {
  const observed = result.stats.groupMax[group];
  const count = result.stats.groupCount[group];
  console.log(
    `    ${pad(group, 24)} ${padStart(String(observed), 4)} / ${padStart(String(LIMITS[group].max), 4)}   ${count} slots`,
  );
}
console.log('');

const problems = [
  ...result.problems.map((problem) => `${pad(problem.path, 52)} [${problem.kind}] ${problem.message}`),
  ...assets.problems.map((problem) => `${pad(problem.path, 52)} [${problem.kind}] ${problem.message}`),
];

if (result.ok && assets.ok) {
  console.log('✓ theme contract OK — no problems found.');
} else {
  console.error(
    `✗ theme check FAILED — ${result.problems.length} contract problem(s), ${assets.problems.length} asset problem(s):`,
  );
  for (const line of problems) console.error(`    ${line}`);
  process.exitCode = 1;
}
