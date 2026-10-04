# Proposal

## Why

The Expo host boots and plays the real game, but visually it is inert: the arena is text and
empty bordered boxes (`resolveAsset()` returns `uri: null`, so `AssetPlaceholder` paints a
generic frame), and the host's `GameEvent[]` seam is captured per frame but never consumed for
animation. `/web` ships the opposite — bundled theme sprites plus a full event→cue animation
framework. On top of that, Android is configured `edgeToEdgeEnabled: true` while the screen
applies a flat 16px top padding, so the HUD is drawn under the system status bar (clock,
notifications, Wi-Fi/battery) and the top row is clipped on device. The `expo-transition` change
deliberately deferred art, animation parity, and asset bundling; this change completes that
follow-up and fixes the clipped header.

## What Changes

- **Bundle and render the active theme's declared art.** Copy the 32 declared PNG slots for each
  shipped theme (`fantasy`, `lucky`) into `mobile/` and render the slots the host displays —
  player, normal/boss enemy, Shiny variants, and the spawn popup — through an RN `<Image>` at
  their declared pixel size. `AssetPlaceholder` is replaced by a real image component resolved
  through the theme's `name` + `assets` map; no file name or directory is hard-coded outside the
  theme.
- **Add an RN animation framework driven by engine events.** Consume `host.frame.events` and the
  theme's declared `animation.cues` to swap transient sprite frames for
  `playerAttack` / `enemyHit` / `enemyDeath` / `bossHit` / `bossDeath` / `stageEntered` /
  `shinySpawn` / `shinyClaim`, selecting at most one winner per actor by priority with
  display-only durations. Add web-parity flourishes: the global spawn popup, Shiny drift + pulse
  and escape/claim messages, the enemy taunt toast, the queued achievement splash, the milestone
  flourish, a boost-pill pulse, an HP-bar tween, and overlay entrance animations.
- **Respect the OS reduced-motion preference.** When reduced motion is on, no sprite frame swaps
  and no movement occurs; informational text (achievement splash, enemy taunts, offline summary)
  still appears.
- **Honor device safe-area insets.** Wrap the app in `SafeAreaProvider` and pad the screen's top
  and bottom from `useSafeAreaInsets()`, so the HUD clears the Android status bar / cutout and the
  iOS notch and home indicator.
- **Add three justified mobile dependencies**: `react-native-safe-area-context` (the standard,
  edge-to-edge-correct inset API; RN's own `SafeAreaView` does not cover Android edge-to-edge),
  plus `react-native-reanimated` **and** `react-native-worklets` (UI-thread flourishes; Reanimated 4
  requires the separate worklets package, and New Architecture is already enabled). Installed with
  `npx expo install` so versions match Expo SDK 57.

Explicitly **not** in scope: authoring new/better pixel art (the declared theme PNGs are reused
as-is), any `engine-core` change (save schema stays **v4**), and any `/web` or `/sim` change
(non-goal, but must keep passing).

## Capabilities

### New Capabilities
<!-- None: this strengthens behavior the existing `expo-host` capability already owns. -->

### Modified Capabilities
- `expo-host`: the "Theme-driven presentation" requirement is strengthened. The host must (a)
  render the theme's declared art assets rather than placeholders, (b) drive the theme's animation
  cues from engine events while honoring reduced motion, and (c) respect device safe-area insets.

## Impact

- **New code (mobile only):** an asset sync script + generated asset registry, a themed `<Image>`
  sprite component, an animation hook/module (cue selection + timers + reduced motion), the
  splash / milestone / taunt / Shiny message components, and safe-area wiring in `App.tsx` /
  `GameScreen.tsx` / `layout.ts`.
- **Dependencies (mobile workspace only):** `react-native-safe-area-context`,
  `react-native-reanimated`, `react-native-worklets`, installed via `npx expo install` so versions
  match Expo SDK 57.
- **Config:** an ambient `*.png` module declaration for TypeScript and the generated asset registry;
  `babel-preset-expo` auto-adds the Reanimated worklets plugin when the package is present, so
  `babel.config.js` needs no edit. `app.json` app identity (`com.autoautoclicker.app`) is unchanged.
- **engine-core:** read-only consumer. No source, type, balance value, theme token, or save version
  changes; the save schema stays **v4**.
- **Existing hosts:** `/web` and `/sim` are untouched; their gates (`test`, `sim`, `smoke`, `build`,
  `typecheck`) must keep passing, and `npm run mobile:typecheck` / `npm run mobile:test` gain coverage
  for the new presentation seam.
