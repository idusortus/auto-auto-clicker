// assets.d.ts — ambient module declarations for bundled static assets.
//
// The generated theme-asset registry (`src/themeAssets.gen.ts`) contains literal
// `require('../../assets/themes/<name>/<slot>.png')` calls. Metro resolves those
// to an image module, but TypeScript has no built-in type for a `.png` import —
// this declaration gives every PNG `require` the React Native image-source type
// so `npm run mobile:typecheck` passes without a `@types/*` dependency.
//
// The shape mirrors `ImageSourcePropType` (a registered asset is a number at
// runtime; `Image.resolveAssetSource` handles it). It is kept structurally
// minimal on purpose: this is an ambient default export, not a runtime module.

declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';

  const source: ImageSourcePropType;
  export default source;
}
