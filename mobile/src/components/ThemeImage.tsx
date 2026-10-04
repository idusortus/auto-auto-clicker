// ThemeImage.tsx — render a theme asset slot's FRAME as real bundled art.
//
// The slot is RESOLVED through the active theme (`name` + `assets`) into the
// generated registry's ordered frames, which carry the bundled image module and
// the pixel size measured from each PNG. A `frameIndex` picks which frame of the
// sequence to draw (clamped), at that declared size (or an exact integer `scale`
// multiple) with `resizeMode="contain"` so pixel art is not resampled and
// blurred. The component never names a file or a directory: it renders whatever
// `resolveActiveAsset` returns, so swapping `ACTIVE_THEME` changes the art
// without a component edit.

import { Image } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';

import { resolveActiveAsset } from '../theme';

export interface ThemeImageProps {
  /** The declared asset slot to resolve through the active theme. */
  slot: string;
  /** Which frame of the slot's sequence to show (clamped; default 0). */
  frameIndex?: number;
  /** Integer multiplier on the registry's measured size (default 1). */
  scale?: number;
  /** Optional extra image styles appended after the measured size. */
  style?: StyleProp<ImageStyle>;
}

export function ThemeImage({
  slot,
  frameIndex = 0,
  scale = 1,
  style,
}: ThemeImageProps): React.JSX.Element {
  const asset = resolveActiveAsset(slot);
  const index = Math.max(0, Math.min(asset.frames.length - 1, frameIndex));
  const frame = asset.frames[index];
  if (frame === undefined) {
    throw new Error(`[aac] theme slot "${slot}" declares no frames`);
  }
  return (
    <Image
      testID={`asset-${asset.slot}`}
      accessibilityLabel={`${asset.themeName}:${frame.fileName}`}
      source={frame.source}
      resizeMode="contain"
      style={[{ width: frame.width * scale, height: frame.height * scale }, style]}
    />
  );
}
