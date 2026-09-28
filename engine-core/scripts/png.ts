// scripts/png.ts — read PNG pixel dimensions from a buffer, with ZERO deps.
//
// A PNG always starts with the 8-byte signature, then the IHDR chunk whose
// payload begins at byte 16: width (big-endian uint32) at 16 and height at 20.
// We only need those two numbers here, so we do not decode the image. `Buffer`
// is a Node type, so this helper lives in the script layer (not `src/`), which
// keeps engine-core's pure runtime filesystem- and Node-free.

/** The 8-byte PNG file signature: `89 50 4E 47 0D 0A 1A 0A`. */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngSize {
  width: number;
  height: number;
}

/**
 * Return the pixel size from a PNG buffer, or null when the buffer is too short,
 * lacks the PNG signature, or does not start with an IHDR chunk.
 */
export function readPngDimensions(bytes: Buffer): PngSize | null {
  // 8 signature bytes + 4 length + 4 type + 4 width + 4 height = 24 minimum.
  if (bytes.length < 24) return null;
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
