// scripts/make-pixel-art.ts — generate the `fantasy` theme's REAL pixel art.
//
// Successor to `make-placeholder-assets.ts` (kept for themes still on the
// placeholder path). This script draws old-school 16-bit-era sprites AS DATA — a
// tiny drawing DSL (rect / ellipse / line / outline) over a per-theme palette —
// and writes each declared FRAME as an RGBA PNG at the exact declared size, so
// `npm run theme:check` passes and both hosts render recognisable characters.
//
// Design rules (recorded so the art is reviewable, not just taste):
//   - Readable silhouette: a hero with a sword, a grunt humanoid, a bigger horned
//     boss, a small imp (Stray Goblin). Dark outline + 2 shading steps, ≥ 8 colours.
//   - Frames differ MEANINGFULLY: idle = a subtle vertical bob/blink; attack =
//     wind-up then a forward strike (weapon displaced); hurt = a recoil + red
//     flash; death = a multi-frame collapse (drop → crumple → fade), so a cue is
//     unmistakable rather than a recoloured blob.
//
// Dependency-free: `node:fs` + `node:zlib` + a local CRC32, exactly like the
// placeholder generator. `ASSET_SLOTS` is a pure import, so no engine `src/`
// module ever touches the filesystem.
//
// Usage (from engine-core/):  npx tsx scripts/make-pixel-art.ts
// Output: `web/public/themes/fantasy/<slot>-<frame>.png`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { ASSET_SLOTS } from '../src/theme/contract';

// ---------------------------------------------------------------------------
// A tiny RGBA canvas + drawing DSL
// ---------------------------------------------------------------------------

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse `#rrggbb` into `{r,g,b}` (0-255). */
function hex(value: string): Rgb {
  const v = value.replace('#', '');
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

/**
 * The `fantasy` sprite palette. A single cohesive 16-bit set: warm hero tones,
 * sickly greens for the grunt, crimson/iron for the boss, gold/green for the
 * imp. Each colour has a highlight and shadow variant for 2-step shading.
 */
const PALETTE = {
  outline: '#1b1712',
  // hero (knight)
  heroSkin: '#e8b088',
  heroSkinShade: '#c08858',
  heroHair: '#c8963c',
  heroTunic: '#3f6fb0',
  heroTunicHi: '#5f8fd0',
  heroTunicLo: '#264a80',
  heroSteel: '#d8dde0',
  heroSteelHi: '#f4f7f8',
  heroSteelLo: '#8a949a',
  heroLeather: '#6a4a2a',
  // grunt (goblin is the shiny; grunt = a small troll)
  gruntSkin: '#7fa83c',
  gruntSkinHi: '#a4cc58',
  gruntSkinLo: '#557a26',
  gruntEye: '#f2e04a',
  gruntCloth: '#8a4a3a',
  // boss (horned ogre)
  bossSkin: '#b0554a',
  bossSkinHi: '#d47a68',
  bossSkinLo: '#7a332c',
  bossHorn: '#e6dcc4',
  bossHornLo: '#b8ae94',
  bossEye: '#ffd23a',
  bossArmor: '#5a5a68',
  bossArmorHi: '#84848f',
  // imp (stray goblin)
  impSkin: '#8fc24a',
  impSkinHi: '#b6e070',
  impSkinLo: '#5f8a2a',
  impEye: '#fff2a0',
  // shiny reward tints (per kind)
  shinyGold: '#ffd257',
  shinyRose: '#ff6b3d',
  shinyIce: '#6fe3ff',
  // hurt flash + death fade
  hurtFlash: '#ff5a4a',
  deathDim: '#2a2a34',
} as const;

/** A mutable RGBA pixel canvas with primitive drawing ops. */
class Canvas {
  readonly width: number;
  readonly height: number;
  private readonly pixels: Rgba[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = Array.from({ length: width * height }, () => ({ r: 0, g: 0, b: 0, a: 0 }));
  }

  private put(x: number, y: number, rgb: Rgb, alpha = 255): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    this.pixels[iy * this.width + ix] = { r: rgb.r, g: rgb.g, b: rgb.b, a: alpha };
  }

  /** A filled axis-aligned rectangle. */
  rect(x: number, y: number, w: number, h: number, rgb: Rgb, alpha = 255): void {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) this.put(xx, yy, rgb, alpha);
    }
  }

  /** A filled ellipse centered at (cx, cy). */
  ellipse(cx: number, cy: number, rx: number, ry: number, rgb: Rgb, alpha = 255): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.put(x, y, rgb, alpha);
      }
    }
  }

  /** A 1px-thick line (Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number, rgb: Rgb): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - x);
    const dy = -Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.put(x, y, rgb);
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /**
   * Outline every opaque pixel's transparent neighbours in `rgb` — the dark
   * keyline that makes sprite art read at small sizes. Added AFTER the body is
   * drawn so it frames the silhouette.
   */
  outline(rgb: Rgb): void {
    const snapshot = this.pixels.map((p) => p.a > 0);
    const at = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < this.width && y < this.height && snapshot[y * this.width + x] === true;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (at(x, y)) continue;
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) {
          this.put(x, y, rgb);
        }
      }
    }
  }

  /** Scale every pixel's alpha by `alpha / 255` (death fade). */
  applyAlpha(alpha: number): void {
    const factor = Math.max(0, Math.min(1, alpha / 255));
    for (const pixel of this.pixels) pixel.a = Math.round(pixel.a * factor);
  }

  toBuffer(): Buffer {
    const raw = Buffer.alloc((this.width * 4 + 1) * this.height);
    let offset = 0;
    for (let y = 0; y < this.height; y += 1) {
      raw[offset] = 0; // filter: none
      offset += 1;
      for (let x = 0; x < this.width; x += 1) {
        const p = this.pixels[y * this.width + x]!;
        raw[offset] = p.r;
        raw[offset + 1] = p.g;
        raw[offset + 2] = p.b;
        raw[offset + 3] = p.a;
        offset += 4;
      }
    }
    return encodePng(this.width, this.height, raw);
  }
}

// ---------------------------------------------------------------------------
// Minimal dependency-free PNG encoder (RGBA, 8-bit)
// ---------------------------------------------------------------------------

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

function encodePng(width: number, height: number, raw: Buffer): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour + alpha
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Sprite drawing — each function draws ONE frame of a slot onto a canvas
// ---------------------------------------------------------------------------

const C = Object.fromEntries(
  Object.entries(PALETTE).map(([key, value]) => [key, hex(value)]),
) as Record<keyof typeof PALETTE, Rgb>;

type Pose = 'idle' | 'attack' | 'hurt' | 'death';

/**
 * A small humanoid enemy (the "grunt"): head, body, two legs, two arms, and a
 * club. `bob` shifts the whole body vertically (idle loop / death sink); `lean`
 * shifts the upper body toward the target (attack); `flash` tints it red (hurt);
 * `crumple` collapses the body downward and to the side (death); `alpha` fades.
 */
function drawGrunt(size: number, pose: Pose, frame: number): Canvas {
  const cv = new Canvas(size, size);
  const s = size / 64; // scale factor relative to the 64px design grid
  const u = (n: number): number => Math.round(n * s);

  const bob = pose === 'idle' ? (frame % 2 === 0 ? 0 : -2) : 0;
  const sink = pose === 'death' ? frame * u(9) : 0;
  const crumple = pose === 'death' ? frame * 3 : 0;
  const lean = pose === 'attack' ? (frame === 0 ? u(-3) : u(4)) : 0;
  const recoil = pose === 'hurt' ? u(3) : 0;
  const alpha = pose === 'death' ? Math.max(90, 255 - frame * 70) : 255;
  const dead = pose === 'death';
  const bodyY = u(20) + bob + sink;
  const cx = u(32) + crumple + lean + recoil;

  const tint = (rgb: Rgb): Rgb =>
    pose === 'hurt' && frame === 0 ? C.hurtFlash : dead ? mix(rgb, C.deathDim, 0.4) : rgb;

  // legs
  if (!dead || frame < 2) {
    cv.rect(cx - u(7), u(46) + bob + sink, u(5), u(10), tint(C.gruntSkinLo));
    cv.rect(cx + u(2), u(46) + bob + sink, u(5), u(10), tint(C.gruntSkinLo));
  }
  // body
  cv.ellipse(cx, bodyY + u(8), u(11), u(13), tint(C.gruntSkin));
  cv.ellipse(cx - u(3), bodyY + u(5), u(7), u(8), tint(C.gruntSkinHi));
  // cloth wrap
  cv.rect(cx - u(9), bodyY + u(15), u(18), u(5), tint(C.gruntCloth));
  // arms
  const armLift = pose === 'attack' && frame === 1 ? u(-10) : 0;
  cv.rect(cx - u(14), bodyY + u(2) + armLift, u(5), u(12), tint(C.gruntSkinLo));
  cv.rect(cx + u(9), bodyY + u(2) + armLift, u(5), u(12), tint(C.gruntSkin));
  // head + ears + eye
  const headY = bodyY - u(12);
  cv.ellipse(cx, headY, u(9), u(8), tint(C.gruntSkin));
  cv.ellipse(cx - u(2), headY - u(2), u(5), u(4), tint(C.gruntSkinHi));
  cv.rect(cx - u(13), headY - u(3), u(5), u(6), tint(C.gruntSkinLo)); // ear
  cv.rect(cx + u(8), headY - u(3), u(5), u(6), tint(C.gruntSkinLo));
  cv.rect(cx - u(5), headY - u(1), u(3), u(3), C.gruntEye);
  cv.rect(cx + u(2), headY - u(1), u(3), u(3), C.gruntEye);
  // club (displaced on attack)
  const clubX = cx + u(13) + (pose === 'attack' ? u(6) : 0);
  const clubY = bodyY + (pose === 'attack' && frame === 1 ? u(-8) : u(6)) + armLift;
  cv.rect(clubX, clubY, u(4), u(16), tint(C.heroLeather));
  cv.rect(clubX - u(1), clubY - u(5), u(6), u(6), tint(C.gruntSkinLo));

  if (dead) {
    // crumble: lose the head uprightness as frames progress
    cv.rect(cx - u(13), headY + u(2) + frame * 2, u(26), u(3), tint(C.gruntSkinLo));
  }

  cv.applyAlpha(alpha);
  cv.outline(C.outline);
  return cv;
}

/**
 * A hero (knight) with a sword and shield. Attack raises then swings the sword;
 * hurt recoils; death kneels then fades.
 */
function drawHero(size: number, pose: Pose, frame: number): Canvas {
  const cv = new Canvas(size, size);
  const s = size / 64;
  const u = (n: number): number => Math.round(n * s);
  const bob = pose === 'idle' ? (frame % 2 === 0 ? 0 : -2) : 0;
  const sink = pose === 'death' ? frame * u(8) : 0;
  const lean = pose === 'attack' ? u(3) : 0;
  const recoil = pose === 'hurt' ? u(2) : 0;
  const alpha = pose === 'death' ? Math.max(90, 255 - frame * 80) : 255;
  const dead = pose === 'death';
  const cy = u(22) + bob + sink;
  const cx = u(30) + lean + recoil;

  const tint = (rgb: Rgb): Rgb =>
    pose === 'hurt' && frame === 0 ? C.hurtFlash : dead ? mix(rgb, C.deathDim, 0.4) : rgb;

  // legs (armoured)
  if (!dead || frame < 2) {
    cv.rect(cx - u(7), u(48) + bob + sink, u(5), u(10), tint(C.heroSteelLo));
    cv.rect(cx + u(2), u(48) + bob + sink, u(5), u(10), tint(C.heroSteelLo));
  }
  // torso
  cv.rect(cx - u(9), cy + u(2), u(18), u(22), tint(C.heroTunic));
  cv.rect(cx - u(9), cy + u(2), u(18), u(4), tint(C.heroSteel)); // pauldrons
  cv.rect(cx - u(5), cy + u(8), u(10), u(12), tint(C.heroTunicHi));
  // arms
  cv.rect(cx - u(13), cy + u(4), u(5), u(14), tint(C.heroSteelLo));
  cv.rect(cx + u(9), cy + u(4), u(5), u(14), tint(C.heroSteel));
  // head + helm
  const headY = cy - u(12);
  cv.ellipse(cx, headY, u(8), u(7), tint(C.heroSkin));
  cv.ellipse(cx, headY - u(1), u(8), u(7), tint(C.heroSteel));
  cv.rect(cx - u(8), headY + u(1), u(16), u(4), tint(C.heroSteelLo));
  cv.rect(cx - u(3), headY - u(8), u(6), u(5), tint(C.heroTunic)); // plume
  cv.rect(cx - u(5), headY + u(1), u(3), u(3), C.outline);
  cv.rect(cx + u(2), headY + u(1), u(3), u(3), C.outline);
  // sword (displaced on attack) + shield
  const swing = pose === 'attack' ? (frame === 0 ? u(-8) : u(10)) : 0;
  cv.rect(cx + u(12) + swing, cy - u(6), u(3), u(22), tint(C.heroSteelHi));
  cv.rect(cx + u(9) + swing, cy + u(12), u(9), u(3), tint(C.heroLeather));
  cv.ellipse(cx - u(13), cy + u(14), u(6), u(8), tint(C.heroTunicLo));

  if (dead) cv.rect(cx - u(12), cy + u(26) + frame * 2, u(24), u(3), tint(C.heroSteelLo));

  cv.applyAlpha(alpha);
  cv.outline(C.outline);
  return cv;
}

/** A large horned boss ogre (96px design grid). */
function drawBoss(size: number, pose: Pose, frame: number): Canvas {
  const cv = new Canvas(size, size);
  const s = size / 96;
  const u = (n: number): number => Math.round(n * s);
  const bob = pose === 'idle' ? (frame % 2 === 0 ? 0 : -3) : 0;
  const sink = pose === 'death' ? frame * u(14) : 0;
  const lean = pose === 'attack' ? u(5) : 0;
  const recoil = pose === 'hurt' ? u(4) : 0;
  const alpha = pose === 'death' ? Math.max(80, 255 - frame * 75) : 255;
  const dead = pose === 'death';
  const cy = u(34) + bob + sink;
  const cx = u(48) + lean + recoil;

  const tint = (rgb: Rgb): Rgb =>
    pose === 'hurt' && frame === 0 ? C.hurtFlash : dead ? mix(rgb, C.deathDim, 0.45) : rgb;

  // legs
  if (!dead || frame < 2) {
    cv.rect(cx - u(14), u(70) + bob + sink, u(10), u(16), tint(C.bossSkinLo));
    cv.rect(cx + u(4), u(70) + bob + sink, u(10), u(16), tint(C.bossSkinLo));
  }
  // torso
  cv.ellipse(cx, cy + u(12), u(20), u(24), tint(C.bossSkin));
  cv.ellipse(cx - u(6), cy + u(6), u(13), u(15), tint(C.bossSkinHi));
  cv.rect(cx - u(16), cy + u(22), u(32), u(10), tint(C.bossArmor)); // belt/armor
  cv.rect(cx - u(16), cy + u(22), u(32), u(3), tint(C.bossArmorHi));
  // arms
  const armLift = pose === 'attack' && frame === 1 ? u(-16) : 0;
  cv.rect(cx - u(26), cy + u(2) + armLift, u(9), u(22), tint(C.bossSkinLo));
  cv.rect(cx + u(17), cy + u(2) + armLift, u(9), u(22), tint(C.bossSkin));
  // head
  const headY = cy - u(20);
  cv.ellipse(cx, headY, u(16), u(14), tint(C.bossSkin));
  cv.ellipse(cx - u(4), headY - u(3), u(9), u(8), tint(C.bossSkinHi));
  // horns
  cv.rect(cx - u(18), headY - u(14), u(6), u(12), tint(C.bossHorn));
  cv.rect(cx + u(12), headY - u(14), u(6), u(12), tint(C.bossHorn));
  cv.rect(cx - u(19), headY - u(16), u(4), u(4), tint(C.bossHornLo));
  cv.rect(cx + u(16), headY - u(16), u(4), u(4), tint(C.bossHornLo));
  // eyes + tusks
  cv.rect(cx - u(9), headY - u(2), u(5), u(4), C.bossEye);
  cv.rect(cx + u(4), headY - u(2), u(5), u(4), C.bossEye);
  cv.rect(cx - u(7), headY + u(8), u(3), u(5), tint(C.bossHorn));
  cv.rect(cx + u(4), headY + u(8), u(3), u(5), tint(C.bossHorn));

  if (dead) cv.rect(cx - u(22), headY + u(4) + frame * 3, u(44), u(4), tint(C.bossSkinLo));

  cv.applyAlpha(alpha);
  cv.outline(C.outline);
  return cv;
}

/** A small imp (the Stray Goblin), tinted per reward kind. */
function drawImp(size: number, tint: Rgb, frame: number): Canvas {
  const cv = new Canvas(size, size);
  const s = size / 48;
  const u = (n: number): number => Math.round(n * s);
  const bob = frame % 2 === 0 ? 0 : -2;
  const cy = u(16) + bob;
  const cx = u(24);

  // legs
  cv.rect(cx - u(6), u(34) + bob, u(4), u(10), C.impSkinLo);
  cv.rect(cx + u(2), u(34) + bob, u(4), u(10), C.impSkinLo);
  // body
  cv.ellipse(cx, cy + u(8), u(9), u(11), C.impSkin);
  cv.ellipse(cx - u(2), cy + u(5), u(6), u(7), C.impSkinHi);
  // arms
  cv.rect(cx - u(12), cy + u(4), u(4), u(9), C.impSkinLo);
  cv.rect(cx + u(8), cy + u(4), u(4), u(9), C.impSkin);
  // head + ears + eyes
  const headY = cy - u(6);
  cv.ellipse(cx, headY, u(8), u(7), C.impSkin);
  cv.ellipse(cx - u(2), headY - u(2), u(5), u(4), C.impSkinHi);
  cv.rect(cx - u(12), headY - u(2), u(4), u(5), C.impSkinLo);
  cv.rect(cx + u(8), headY - u(2), u(4), u(5), C.impSkinLo);
  cv.rect(cx - u(5), headY - u(1), u(3), u(3), C.impEye);
  cv.rect(cx + u(2), headY - u(1), u(3), u(3), C.impEye);
  // reward nugget in hand (kind tint)
  cv.ellipse(cx + u(10), cy + u(12), u(4), u(4), tint);
  cv.ellipse(cx + u(9), cy + u(11), u(2), u(2), mix(tint, hex('#ffffff'), 0.4));
  // tail
  cv.line(cx - u(8), cy + u(12), cx - u(16), cy + u(6), C.impSkinLo);

  cv.outline(C.outline);
  return cv;
}

/** The spawn popup: a "NEW FOE" banner plaque (96x32). */
function drawSpawnPopup(size: number, frame: number): Canvas {
  const cv = new Canvas(size, 32);
  const u = (n: number): number => Math.round((n * size) / 96);
  const h = 32;
  // plaque
  cv.rect(u(4), 4, u(88), h - 8, hex('#2a2233'));
  cv.rect(u(4), 4, u(88), 3, hex('#5a4a6a'));
  cv.rect(u(4), h - 7, u(88), 3, hex('#14101c'));
  // brackets (frame flashes brighter on frame 0 — 1-frame slot, kept for parity)
  const bracket = frame === 0 ? hex('#ffd257') : hex('#c8963c');
  cv.rect(u(8), 8, u(4), h - 16, bracket);
  cv.rect(u(84), 8, u(4), h - 16, bracket);
  // "alert" chevrons
  for (let i = 0; i < 3; i += 1) {
    const bx = u(30 + i * 14);
    cv.rect(bx, 12, u(6), u(4), hex('#ff6b3d'));
    cv.rect(bx + u(2), 16, u(2), u(8), hex('#ff6b3d'));
  }
  return cv;
}

/** Blend two RGB colours; `t` is the weight of `b`. */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

// ---------------------------------------------------------------------------
// Slot → frame renderers
// ---------------------------------------------------------------------------

/** Which pose + size a slot's frames are drawn in. */
interface SlotPlan {
  render(size: number, pose: Pose, frame: number): Canvas;
}

const PLANS: Record<string, SlotPlan> = {
  'player-idle': { render: (size, _pose, frame) => drawHero(size, 'idle', frame) },
  'player-attack': { render: (size, _pose, frame) => drawHero(size, 'attack', frame) },
  'player-hurt': { render: (size, _pose, frame) => drawHero(size, 'hurt', frame) },
  'enemy-grunt-idle': { render: (size, _pose, frame) => drawGrunt(size, 'idle', frame) },
  'enemy-grunt-attack': { render: (size, _pose, frame) => drawGrunt(size, 'attack', frame) },
  'enemy-grunt-hurt': { render: (size, _pose, frame) => drawGrunt(size, 'hurt', frame) },
  'enemy-grunt-death': { render: (size, _pose, frame) => drawGrunt(size, 'death', frame) },
  'boss-grunt-idle': { render: (size, _pose, frame) => drawBoss(size, 'idle', frame) },
  'boss-grunt-attack': { render: (size, _pose, frame) => drawBoss(size, 'attack', frame) },
  'boss-grunt-hurt': { render: (size, _pose, frame) => drawBoss(size, 'hurt', frame) },
  'boss-grunt-death': { render: (size, _pose, frame) => drawBoss(size, 'death', frame) },
  'shiny-idle': { render: (size, _pose, frame) => drawImp(size, C.impSkin, frame) },
  'shiny-frenzy': { render: (size, _pose, frame) => drawImp(size, C.shinyRose, frame) },
  'shiny-drop': { render: (size, _pose, frame) => drawImp(size, C.shinyIce, frame) },
  'shiny-cache': { render: (size, _pose, frame) => drawImp(size, C.shinyGold, frame) },
  'spawn-popup': { render: (size, _pose, frame) => drawSpawnPopup(size, frame) },
  // Gear icons are single-frame trinkets; the generic emblem keeps them distinct
  // per tier without claiming item art (neither host renders them yet).
  'gear-weapon-t1': { render: (size) => drawGear(size, 'weapon', 1) },
  'gear-weapon-t2': { render: (size) => drawGear(size, 'weapon', 2) },
  'gear-weapon-t3': { render: (size) => drawGear(size, 'weapon', 3) },
  'gear-weapon-t4': { render: (size) => drawGear(size, 'weapon', 4) },
  'gear-ring1-t1': { render: (size) => drawGear(size, 'ring', 1) },
  'gear-ring1-t2': { render: (size) => drawGear(size, 'ring', 2) },
  'gear-ring1-t3': { render: (size) => drawGear(size, 'ring', 3) },
  'gear-ring1-t4': { render: (size) => drawGear(size, 'ring', 4) },
  'gear-ring2-t1': { render: (size) => drawGear(size, 'ring', 1) },
  'gear-ring2-t2': { render: (size) => drawGear(size, 'ring', 2) },
  'gear-ring2-t3': { render: (size) => drawGear(size, 'ring', 3) },
  'gear-ring2-t4': { render: (size) => drawGear(size, 'ring', 4) },
  'gear-necklace-t1': { render: (size) => drawGear(size, 'necklace', 1) },
  'gear-necklace-t2': { render: (size) => drawGear(size, 'necklace', 2) },
  'gear-necklace-t3': { render: (size) => drawGear(size, 'necklace', 3) },
  'gear-necklace-t4': { render: (size) => drawGear(size, 'necklace', 4) },
};

/** A small gear emblem; tier brightens the trim (48px design grid). */
function drawGear(size: number, kind: 'weapon' | 'ring' | 'necklace', tier: number): Canvas {
  const cv = new Canvas(size, size);
  const u = (n: number): number => Math.round((n * size) / 48);
  const trim = [hex('#8a949a'), hex('#c8963c'), hex('#6fe3ff'), hex('#ff6b3d')][tier - 1] ?? hex('#c8963c');
  const cx = size / 2;
  const cy = size / 2;
  if (kind === 'weapon') {
    cv.rect(cx - u(2), u(8), u(4), u(28), hex('#d8dde0'));
    cv.rect(cx - u(6), u(8), u(12), u(4), trim);
    cv.rect(cx - u(4), u(34), u(8), u(4), hex('#6a4a2a'));
  } else if (kind === 'ring') {
    cv.ellipse(cx, cy, u(14), u(14), hex('#3a2c07'));
    cv.ellipse(cx, cy, u(10), u(10), hex('#191105'));
    cv.ellipse(cx, cy, u(14), u(14), trim === hex('#8a949a') ? hex('#8a949a') : trim);
    cv.ellipse(cx, cy, u(11), u(11), hex('#191105'));
    cv.ellipse(cx, cy - u(13), u(3), u(3), trim);
  } else {
    cv.ellipse(cx, cy + u(8), u(12), u(8), hex('#6a4a2a'));
    cv.ellipse(cx, cy + u(8), u(8), u(5), hex('#191105'));
    cv.ellipse(cx, cy - u(4), u(4), u(4), trim);
  }
  cv.outline(C.outline);
  return cv;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const outDir = join(repoRoot, 'web', 'public', 'themes', 'fantasy');

function main(): void {
  mkdirSync(outDir, { recursive: true });
  let written = 0;

  for (const slot of ASSET_SLOTS) {
    const plan = PLANS[slot.name];
    if (plan === undefined) {
      throw new Error(`make-pixel-art: no renderer for slot "${slot.name}"`);
    }
    slot.frames.forEach((file, frame) => {
      const canvas = plan.render(slot.width, 'idle', frame);
      if (canvas.width !== slot.width || canvas.height !== slot.height) {
        throw new Error(
          `make-pixel-art: "${file}" drew ${canvas.width}x${canvas.height}, expected ${slot.width}x${slot.height}`,
        );
      }
      writeFileSync(join(outDir, file), canvas.toBuffer());
      written += 1;
    });
  }

  console.log(`wrote ${written} fantasy sprite frames to ${outDir}`);
}

main();
