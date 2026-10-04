import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { ASSET_SLOTS, validateAssetMeasurements } from '../src/theme/contract';
import type { AssetMeasurement } from '../src/theme/contract';
import { readPngDimensions, PNG_SIGNATURE } from '../scripts/png';
import { fantasy } from '../src/theme/fantasy';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const engineRoot = fileURLToPath(new URL('..', import.meta.url));
const fantasyDir = join(repoRoot, 'web', 'public', 'themes', 'fantasy');
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');
const checker = join(engineRoot, 'scripts', 'check-theme.ts');

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aac-theme-assets-'));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/** A header-only PNG buffer: enough for the dimension reader, no image data. */
function headerOnlyPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  PNG_SIGNATURE.copy(buf, 0);
  buf.writeUInt32BE(13, 8); // IHDR length
  buf.write('IHDR', 12, 'latin1');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/** Read + measure a directory the same way the CLI does (every frame). */
function measureDir(dir: string): AssetMeasurement[] {
  const out: AssetMeasurement[] = [];
  for (const slot of ASSET_SLOTS) {
    for (let frameIndex = 0; frameIndex < slot.frames.length; frameIndex += 1) {
      const file = slot.frames[frameIndex] ?? slot.file;
      const path = join(dir, file);
      let bytes: Buffer;
      try {
        bytes = readFileSync(path);
      } catch {
        out.push({
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
      const size = readPngDimensions(bytes);
      if (size === null) {
        out.push({
          slot: slot.name,
          frameIndex,
          path,
          exists: true,
          width: null,
          height: null,
          error: 'not a PNG',
        });
        continue;
      }
      out.push({
        slot: slot.name,
        frameIndex,
        path,
        exists: true,
        width: size.width,
        height: size.height,
        error: null,
      });
    }
  }
  return out;
}

/** Total declared frames across every slot. */
const TOTAL_FRAMES = ASSET_SLOTS.reduce((sum, slot) => sum + slot.frames.length, 0);

describe('png dimension reader', () => {
  it('reads the real committed sprite dimensions', () => {
    const bytes = readFileSync(join(fantasyDir, 'player-idle-0.png'));
    expect(readPngDimensions(bytes)).toEqual({ width: 64, height: 64 });

    const boss = readFileSync(join(fantasyDir, 'boss-grunt-idle-0.png'));
    expect(readPngDimensions(boss)).toEqual({ width: 96, height: 96 });

    const popup = readFileSync(join(fantasyDir, 'spawn-popup-0.png'));
    expect(readPngDimensions(popup)).toEqual({ width: 96, height: 32 });
  });

  it('reads width/height from a header-only IHDR buffer', () => {
    expect(readPngDimensions(headerOnlyPng(48, 48))).toEqual({ width: 48, height: 48 });
    expect(readPngDimensions(headerOnlyPng(96, 32))).toEqual({ width: 96, height: 32 });
  });

  it('returns null for a non-PNG buffer or one that is too short', () => {
    expect(readPngDimensions(Buffer.from('definitely not a png'))).toBeNull();
    const tooShort = PNG_SIGNATURE.subarray(0, 8);
    expect(readPngDimensions(tooShort)).toBeNull();
  });
});

describe('fantasy assets on disk', () => {
  it('every declared frame has a file at the exact declared size', () => {
    const result = validateAssetMeasurements(fantasy, measureDir(fantasyDir));
    expect(result.problems).toEqual([]);
    expect(result.correct).toBe(TOTAL_FRAMES);
  });
});

describe('theme:check CLI', () => {
  it('exits 0 for the fantasy theme (frames exist at the right size)', () => {
    const run = spawnSync(process.execPath, [tsxBin, checker], {
      cwd: engineRoot,
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain(`${TOTAL_FRAMES}/${TOTAL_FRAMES} frames present`);
  });

  it('exits non-zero and reports mis-sized + missing frames for a broken directory', () => {
    const dir = makeTempDir();
    // A valid PNG signature but the wrong size, plus a file that is not a PNG.
    writeFileSync(join(dir, 'player-idle-0.png'), headerOnlyPng(8, 8));
    writeFileSync(join(dir, 'enemy-grunt-idle-0.png'), Buffer.from('this is not a PNG'));

    const run = spawnSync(process.execPath, [tsxBin, checker], {
      cwd: engineRoot,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, AAC_THEME_DIR: dir },
    });

    expect(run.status).not.toBe(0);
    const output = `${run.stdout}\n${run.stderr}`;
    expect(output).toContain('player-idle-0.png is 8x8, expected 64x64');
    expect(output).toContain('missing shiny-idle-0.png');
    expect(output).toContain('could not read PNG dimensions');
  });
});
