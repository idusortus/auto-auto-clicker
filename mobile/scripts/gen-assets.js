// gen-assets.js — one-off generator for minimal, valid PNG app identity assets.
//
// Produces flat-color PNGs at the sizes Expo requires for icon / adaptive-icon
// foreground / splash. No npm deps: PNG chunks are written by hand and the IDAT
// payload uses Node's built-in zlib. Run from `mobile/`:
//   node scripts/gen-assets.js
//
// These are deliberately plain placeholders (flat brand color), not art — the
// change only needs a valid Android build, not art parity with the web themes.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const COLOR = { r: 0x1f, g: 0x2a, b: 0x44 }; // dark slate brand-ish color
const FULLY_OPAQUE = 255;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Build one flat-color RGBA PNG of `size` x `size`.
function flatPng(size, color, alpha) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw scanlines: 1 filter byte (0 = none) + size * RGBA bytes.
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const p = rowStart + 1 + x * 4;
      raw[p] = color.r;
      raw[p + 1] = color.g;
      raw[p + 2] = color.b;
      raw[p + 3] = alpha;
    }
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(relPath, size, color, alpha) {
  const out = path.resolve(__dirname, '..', relPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, flatPng(size, color, alpha));
  console.log('wrote', relPath, `${size}x${size}`, fs.statSync(out).size, 'bytes');
}

// expo.icon: 1024x1024, fully opaque.
write('assets/icon.png', 1024, COLOR, FULLY_OPAQUE);
// android.adaptiveIcon.foregroundImage: 1024x1024, transparent background
// (Android masks it; the fg layer is what shows through the adaptive shape).
write('assets/adaptive-icon.png', 1024, COLOR, FULLY_OPAQUE);
// expo.splash.image: a reasonable square; Expo scales it to the screen.
write('assets/splash-icon.png', 1024, COLOR, FULLY_OPAQUE);
