// AssetPlaceholder.tsx — the RN stand-in for a theme asset slot.
//
// RN has no `/themes/<name>/` static route and this change ships no bundled
// pixel art, so an asset cannot be loaded. Instead the slot is RESOLVED through
// the active theme (`name` + `assets`) and rendered as a placeholder `View` that
// carries the resolved identity in its `testID`. The goal is a clear placeholder
// strategy, explicitly NOT art parity (see the change's Non-Goals).
//
// The component never names a file or a directory: it renders whatever
// `resolveActiveAsset` returns, so swapping `ACTIVE_THEME` changes the identity
// shown here without a component edit.

import { View } from 'react-native';

import { resolveActiveAsset } from '../theme';
import { styles } from '../theme';

export interface AssetPlaceholderProps {
  /** The declared asset slot to resolve through the active theme. */
  slot: string;
  /** Square size in points. Purely presentational. */
  size: number;
}

export function AssetPlaceholder({ slot, size }: AssetPlaceholderProps): React.JSX.Element {
  const asset = resolveActiveAsset(slot);
  return (
    <View
      testID={`asset-${asset.slot}`}
      accessibilityLabel={`${asset.themeName}:${asset.fileName}`}
      style={[
        styles.surface,
        styles.hairline,
        { borderWidth: 1, borderRadius: 6, height: size, width: size },
      ]}
    />
  );
}
