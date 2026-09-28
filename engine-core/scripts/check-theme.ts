// scripts/check-theme.ts — `npm run theme:check`
//
// Validates the ACTIVE theme against the theme contract and prints a readable
// report, exiting non-zero on any problem. This is the authoring checklist: a
// new theme runs this and gets the exact list of anything wrong or missing.
//
// Dependency-free: plain `tsx`, no new packages. Not part of the engine's
// runtime surface (it lives outside `src/`, so the boundary scan does not see
// it and no host imports it).

import { ACTIVE_THEME } from '../src/theme';
import {
  ASSET_SLOTS,
  LIMITS,
  THEME_FIELDS,
  validateTheme,
} from '../src/theme/contract';
import type { LimitGroup } from '../src/theme/contract';

const ORDER = Object.keys(LIMITS) as LimitGroup[];

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value;
}

const themeName = String(ACTIVE_THEME.name ?? '(unnamed)');
const result = validateTheme(ACTIVE_THEME);

console.log(`Theme contract check — ACTIVE_THEME "${themeName}"`);
console.log(
  `  slots:        ${result.stats.stringFields} strings + ${result.stats.templateFields} templates ` +
    `(${THEME_FIELDS.length} declared + ${result.stats.achievementIds} achievement ids)`,
);
console.log(
  `  achievements: ${result.stats.achievementIds}/${result.stats.achievementIds} ids required`,
);
console.log(
  `  assets:       ${ASSET_SLOTS.length} declared slots (file existence + pixel size are checked in T4)`,
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

if (result.ok) {
  console.log('✓ theme contract OK — no problems found.');
} else {
  console.error(`✗ theme contract FAILED — ${result.problems.length} problem(s):`);
  for (const problem of result.problems) {
    console.error(`    ${pad(problem.path, 44)} [${problem.kind}] ${problem.message}`);
  }
  process.exitCode = 1;
}
