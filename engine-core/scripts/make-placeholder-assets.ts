// scripts/make-placeholder-assets.ts — regenerate a theme's 32 placeholder PNGs.
//
// These are deliberately NOT art: flat per-slot colour blocks in a per-theme
// hue family, with a corner marker, a progress/index bar, one fully transparent
// square, and one 50%-alpha square (so RGBA is genuinely exercised). They exist
// so a theme's declared asset seam can be rendered, loaded, and size-checked
// end-to-end before real art arrives.
//
// Usage (from engine-core/):
//     npx tsx scripts/make-placeholder-assets.ts lucky
//
// Output: `web/public/themes/<name>/<slot>.png` at the EXACT declared dimensions
// (`ASSET_SLOTS` in `src/theme/contract.ts` is the single source of truth for
// slot names, sizes, and file names). The encoder is dependency-free
// (`node:zlib` + a local CRC32); `ASSET_SLOTS` is a pure import, so no engine
// `src/` module ever touches the filesystem.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { ASSET_SLOTS } from '../src/theme/contract';

/**
 * Per-theme base hue (degrees). Chosen so two themes' placeholder sets are
 * obviously different to a human: `fantasy` is a cool blue family, `lucky` a
 * warm grass/sun family. Unknown themes fall back to a neutral magenta so a new
 * theme's blocks are still visibly "not fantasy".
 */
const THEME_BASE_HUE: Record<string, number> = {
  fantasy: 220,
  lucky: 78,
};
const FALLBACK_BASE_HUE = 320;

type Rgb = readonly [number, number, number];

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function rgba(rgb: Rgb, alpha = 255): Rgba {
  return { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha };
}

/** One placeholder image's pixels, derived from the slot's index within the set. */
function slotPixels(width: number, height: number, index: number, count: number, baseHue: number): Buffer {
  const hue = baseHue + (index % 8) * 8;
  const base = hslToRgb(hue, 0.55, 0.45);
  const barColor = hslToRgb(hue + 40, 0.85, 0.62);
  const markerColor = hslToRgb(hue + 180, 0.6, 0.3);

  const barHeight = Math.max(2, Math.round(height * 0.08));
  const barWidth = Math.max(1, Math.round((width * (index + 1)) / count));
  const markerSize = Math.max(3, Math.round(Math.min(width, height) * 0.12));
  const holeWidth = Math.max(2, Math.round(width * 0.25));
  const holeHeight = Math.max(2, Math.round(height * 0.25));

  const buffer = Buffer.alloc(width * height * 4);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let pixel: Rgba = rgba(base);
      // Progress/index bar along the top edge.
      if (y < barHeight && x < barWidth) pixel = rgba(barColor);
      // Corner markers frame the block.
      const atLeft = x < markerSize;
      const atRight = x >= width - markerSize;
      const atTop = y < markerSize;
      const atBottom = y >= height - markerSize;
      if ((atLeft || atRight) && (atTop || atBottom)) pixel = rgba(markerColor);
      // Fully transparent square (lower-left) — proves alpha survives.
      if (x < holeWidth && y >= height - holeHeight) pixel = { ...rgba(base), a: 0 };
      // 50%-alpha square (lower-right) — proves partial alpha survives.
      if (x >= width - holeWidth && y >= height - holeHeight) pixel = { ...rgba(base), a: 128 };
      buffer[offset] = pixel.r;
      buffer[offset + 1] = pixel.g;
      buffer[offset + 2] = pixel.b;
      buffer[offset + 3] = pixel.a;
      offset += 4;
    }
  }
  return buffer;
}

// --- Minimal dependency-free PNG (RGBA, 8-bit) encoder ------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(width: number, height: number, pixels: Buffer): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour + alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Entry point --------------------------------------------------------------

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function main(): void {
  const themeName = process.argv[2];
  if (themeName === undefined || themeName.length === 0) {
    console.error('usage: npx tsx scripts/make-placeholder-assets.ts <theme-name>');
    process.exitCode = 1;
    return;
  }

  const baseHue = THEME_BASE_HUE[themeName] ?? FALLBACK_BASE_HUE;
  const dir = join(repoRoot, 'web', 'public', 'themes', themeName);
  mkdirSync(dir, { recursive: true });

  ASSET_SLOTS.forEach((slot, index) => {
    const pixels = slotPixels(slot.width, slot.height, index, ASSET_SLOTS.length, baseHue);
    writeFileSync(join(dir, slot.file), encodePng(slot.width, slot.height, pixels));
  });

  console.log(
    `wrote ${ASSET_SLOTS.length} placeholder PNGs to ${dir} (base hue ${baseHue}°)`,
  );
}

main();
