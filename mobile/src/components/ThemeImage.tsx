// ThemeImage.tsx — render a theme asset slot as real bundled art.
//
// The slot is RESOLVED through the active theme (`name` + `assets`) into the
// generated registry entry, which carries the bundled image module and the
// pixel size measured from the PNG. It is drawn at that declared size (or an
// exact integer `scale` multiple) with `resizeMode="contain"` so pixel art is
// not resampled and blurred. The component never names a file or a directory:
// it renders whatever `resolveActiveAsset` returns, so swapping `ACTIVE_THEME`
// changes the art without a component edit.

import { Image } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';

import { resolveActiveAsset } from '../theme';

export interface ThemeImageProps {
  /** The declared asset slot to resolve through the active theme. */
  slot: string;
  /** Integer multiplier on the registry's measured size (default 1). */
  scale?: number;
  /** Optional extra image styles appended after the measured size. */
  style?: StyleProp<ImageStyle>;
}

export function ThemeImage({ slot, scale = 1, style }: ThemeImageProps): React.JSX.Element {
  const asset = resolveActiveAsset(slot);
  return (
    <Image
      testID={`asset-${asset.slot}`}
      accessibilityLabel={`${asset.themeName}:${asset.fileName}`}
      source={asset.source}
      resizeMode="contain"
      style={[{ width: asset.width * scale, height: asset.height * scale }, style]}
    />
  );
}
