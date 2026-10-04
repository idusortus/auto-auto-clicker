# Design

## Context

See `proposal.md` — Why. Current state that shapes the approach:

- `engine-core` already declares the full display seam this change consumes: 32 asset slots
  (`ASSET_SLOTS` in `theme/contract.ts`), a per-theme `assets` map (slot → file name), and 8
  semantic animation cues under `theme.animation.cues` (`AnimationCueKey` /
  `ThemeAnimationCue`). The animation **types** are exported from the engine's public index;
  `ASSET_SLOTS` is **not** (it is a build/validation detail). No engine change is needed or
  permitted — the save schema stays v4.
- `/web` is the reference implementation: `web/src/renderer.ts` maps `GameEvent[]` → per-actor
  cue winners (priority table, ties to the last), swaps `<img>` `src` for a theme-declared slot
  for a display-only duration, and owns a single drain timer; `web/public/style.css` holds the
  reduced-motion rules and the flourish keyframes.
- The theme PNGs live at `web/public/themes/<name>/*.png`, generated from `ASSET_SLOTS` by
  `engine-core/scripts/make-placeholder-assets.ts`. They are committed placeholder art (flat
  blocks with markers), not final sprites — this change reuses them rather than authoring art.
- The RN host already captures the seam it needs: `useGameHost` exposes
  `frame.events: readonly GameEvent[]` per rendered frame and `frame.stageBeganAtMs`; `GameScreen`
  currently never passes `events` down. `mobile/src/theme.ts` resolves a slot to
  `{ slot, themeName, fileName, uri: null }` and `AssetPlaceholder` paints a bordered `View`.
- `mobile/app.json` sets `android.edgeToEdgeEnabled: true`; `layout.screen` applies a flat
  `paddingVertical: 16` with no inset awareness, so the HUD renders under the status bar.
- Mobile pins Expo SDK 57 (`react-native 0.86.3`, `react@19.2.3`, New Architecture enabled).
  Metro resolves `@auto-auto-clicker/engine-core` to its TypeScript source; there is no build step.

## Goals / Non-Goals

**Goals:**

- Render the active theme's declared art in the RN arena (and gear/Shiny/popup slots), driven only
  by the theme's `name` + `assets` map.
- Port `/web`'s event→cue animation model to RN, including its reduced-motion contract, plus the
  informational/flourish surfaces the user asked to bring over.
- Make the host inset-aware so the header clears the system status bar / cutout / home indicator.
- Keep the engine, `/web`, and `/sim` untouched; keep the save schema v4; add only the two
  dependencies justified below.

**Non-Goals:**

- Authoring new/better pixel art (reuse the declared PNGs).
- Exact pixel-fidelity/parity with `/web`'s CSS (which has `image-rendering: pixelated`,
  `color-mix()`, and `env(safe-area-inset-*)`, none of which RN exposes directly).
- Any engine export change (notably: do **not** export `ASSET_SLOTS` to satisfy the registry —
  the registry is generated from the PNG set on disk and validated against the public theme map).
- A navigation library or new screens.

## Decisions

### Reuse the declared PNGs via a generated, mobile-local asset registry

Metro requires **static** `require()` calls, so an RN image cannot be loaded from a runtime path
string (`theme.assets[slot]`). Add `mobile/scripts/sync-theme-assets.mjs` that copies
`web/public/themes/<name>/*.png` → `mobile/assets/themes/<name>/` and emits
`mobile/src/themeAssets.gen.ts`:

```ts
export interface ThemeAssetSource {
  /** The bundled image module Metro resolves from the literal require. */
  source: ImageSourcePropType;
  /** Pixel width measured from the PNG's IHDR header. */
  width: number;
  /** Pixel height measured from the PNG's IHDR header. */
  height: number;
}

export const THEME_ASSETS: Record<string, ThemeAssetSource> = {
  'fantasy/player-idle.png': {
    source: require('../assets/themes/fantasy/player-idle.png'),
    width: 64,
    height: 64,
  },
  // …one literal require per PNG, dimensions measured from the file
};
```

The generator measures each PNG's `IHDR` width/height (the same header-read `check-theme.ts`
already does) so the registry carries the declared size **without** exporting `ASSET_SLOTS` from
the engine. `mobile/src/theme.ts`'s `resolveAsset(theme, slot)` looks the entry up by
`` `${theme.name}/${theme.assets[slot]}` `` and **throws** (mirroring the engine renderer's
missing-roster-entry behavior) when the active theme declares a slot the registry lacks. The
host therefore still names no file or directory — the theme does.

- **Alternatives rejected:** referencing `web/public/themes` through Metro `watchFolders` (fragile
  cross-workspace coupling, and `/web/public` is a Vite convention); a top-level shared `themes/`
  directory (correct long-term, but it edits `/web` and the engine generator — out of scope);
  exporting `ASSET_SLOTS` and reading it at runtime (an engine API change, and unnecessary: the
  theme already supplies slot→file).
- The generated PNGs and registry are **committed** (small, deterministic, and needed so the APK
  build and Jest run with no prior step). `mobile:assets` regenerates them; a Jest test asserts
  the registry covers every slot in `ACTIVE_THEME.assets` so a stale registry fails loudly in CI.
  A `*.png` ambient module declaration is added for TypeScript.

### Render art with a themed `<Image>`, sized to the declared dimensions

Replace `AssetPlaceholder` with `ThemeImage` (`<Image source={resolveActiveAsset(slot).source}
resizeMode="contain" style={{ width, height }} />`), keeping the `asset-<slot>` testID. RN has no
`image-rendering: pixelated`; to avoid resampling blur, sprites are drawn at (or an integer
multiple of) the dimensions measured from their own PNG and carried in the registry (player/enemy
64, boss 96, Shiny 48, spawn popup 96×32), so the engine never needs to export `ASSET_SLOTS`. Boss
frames use the larger declaration.

### Animation: port `/web`'s cue model as a pure module + a hook

- `src/animation/cues.ts` — **pure, no RN**: the `AnimationTarget` union, the `CUE_PRIORITY`
  table, and `collectCueWinners(events, initialStage)` returning per-actor winners exactly like
  `/web`'s `handleEvents` (left-to-right scan; `stageEntered` updates the running stage so later
  events use the new boss/normal frame; ties go to the last occurrence). Unit-tested without a
  renderer.
- `src/animation/useAnimationCues.ts` — the stateful half: consumes `frame.events`, enqueues at
  most one live frame per target with an expiry (`Date.now() + cue.durationMs`; display-only, so a
  wall-clock jump can at worst end a frame early — `/web` uses monotonic `performance.now()`, which
  RN lacks portably), exposes `slotFor(target, idleSlot)`, and owns one drain timer that re-renders
  when a frame expires. Mirrors `/web`'s `enqueueEffect` / `scheduleDrain` / `activeEffectFor`,
  including "duration 0 disables the cue" and a bounded queue. Uses an injectable timer seam (the
  same `HostScheduler` idea) so tests drive expiries deterministically.
- `src/animation/useReducedMotion.ts` — `AccessibilityInfo.isReduceMotionEnabled()` plus the
  `reduceMotionChanged` listener, held live. While on, `useAnimationCues` enqueues nothing and
  clears live frames, and every movement flourish is suppressed.

**Alternative rejected:** driving discrete sprite-frame swaps with Reanimated shared values. The
frame swap is state, not motion, and `/web`'s timer model ports directly; Reanimated is used for
the continuous flourishes below.

### Reanimated for the continuous flourishes; enumerate the "fuller set"

`react-native-reanimated` powers the movement/interpolation effects (`useSharedValue` +
`useAnimatedStyle` + `withTiming` / `withRepeat`), driven from the same event/state diffs:

- **HP bar tween** — animate the fill width toward the new HP percentage (replaces the instant
  jump in `Arena`).
- **Boost pill pulse** — a scale loop while a boost is active.
- **Shiny drift + pulse** — a horizontal drift loop and a scale loop while a Shiny is live
  (reduced motion: a static position, as `/web` does).
- **Spawn popup / toasts / overlay entrance** — fade/slide "pop" on the global spawn popup, the
  Shiny escape/claim message, and the choice/offline overlay cards.
- **Achievement splash (queued) and milestone flourish** — diff-based (`/web` drives these by
  diffing unlocked ids / milestone counts, not by events), queued so a burst is never lost.

Informational text that must survive reduced motion: the achievement splash, the enemy taunt
toast, and the offline summary render regardless of the preference.

### Safe area via `react-native-safe-area-context`

Wrap the app in `SafeAreaProvider` (`App.tsx`) and consume `useSafeAreaInsets()` in `GameScreen`
to add `paddingTop`/`paddingBottom` to the screen frame and to offset bottom overlays/toasts.
RN's own `SafeAreaView` is rejected: it does not handle Android edge-to-edge (which is enabled)
and is deprecated in favor of this library.

### Dependencies (justified)

- `react-native-safe-area-context` — the standard, edge-to-edge-correct inset API; required
  because Android edge-to-edge is on and RN's built-in option cannot inset it.
- `react-native-reanimated` **and** `react-native-worklets` — UI-thread continuous animations for
  the flourishes; New Architecture is already enabled (a Reanimated 4 requirement). Install with
  `npx expo install react-native-reanimated react-native-worklets` so versions match SDK 57;
  `babel-preset-expo` auto-adds the worklets Babel plugin, so **no `babel.config.js` edit** is
  needed.

## Risks / Trade-offs

- **[Reanimated/Worklets Babel misconfiguration breaks the bundle]** → use `npx expo install`
  (pins the SDK-57-compatible versions and auto-wires the plugin via `babel-preset-expo`); reset
  Metro cache if a stale bundle is suspected; validate with a real device build (`npm run
  mobile:apk`) after typecheck/tests.
- **[Jest cannot run Reanimated natively]** → add the official Reanimated Jest mock in
  `jest.setup.js` (the repo's `transformIgnorePatterns` already anticipates
  `react-native-reanimated/plugin`); keep cue logic in the pure module so most coverage needs no
  animation runtime.
- **[RN cannot guarantee nearest-neighbour scaling; art may look soft]** → render sprites at their
  declared integer dimensions; note the limitation; revisit only if real art demands scaling.
- **[Registry drifts from the theme]** → generated registry is committed and a Jest test asserts
  it covers every `ACTIVE_THEME.assets` slot; missing slots throw at resolve time.
- **[Duplicated PNGs in git (mobile copy of web placeholders)]** → small flat files; accepted as
  the cost of Metro's static-require requirement until real art justifies a shared location.
- **[`frame.events` is only refreshed on state change]** → cue handling is driven from the same
  frame the host already produces per tick/click; a no-op action returns no new frame, so no
  spurious animations. The drain's own re-render carries no events (bounded, no recursion).
- **[Reduced-motion detection varies by platform/emulator]** → treat "unavailable" as
  motion-allowed and rely on the live `reduceMotionChanged` event; component tests mock
  `AccessibilityInfo`.

## Migration Plan

1. Add the two dependencies (`npx expo install …`) + Reanimated Jest mock + `*.png` types;
   confirm `mobile:typecheck` and `mobile:test` still pass.
2. Add the asset sync script, generate+commit `mobile/assets/themes/**` and
   `mobile/src/themeAssets.gen.ts`, wire `resolveAsset`/`ThemeImage`, replace `AssetPlaceholder`.
3. Add `cues.ts` + `useReducedMotion` + `useAnimationCues`, and pass `host.frame.events` from
   `GameScreen` into the arena; swap sprite frames for player/enemy/Shiny.
4. Add the flourishes (popup, toasts, splash, milestone, boost pulse, HP tween, overlay entrance).
5. Add safe-area wiring (`SafeAreaProvider` + insets in `GameScreen`/`layout`).
6. Tests + docs (`README.md`, `STATE.md`), then a device build sanity check.

Rollback: the change is additive and mobile-local. Reverting the `mobile/` edits, removing the two
dependencies and the generated assets returns the repo to the current state with no effect on
`engine-core`, `/web`, or `/sim`.

## Open Questions

- The precise Reanimated 4 Jest-mock entry point/version for SDK 57 (the library's testing guide
  moves between releases) — resolve at implementation from the installed package; it does not
  change the approach or the specs.
