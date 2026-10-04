# Tasks

## 1. Setup & dependencies

- [x] 1.1 Install `react-native-safe-area-context`, `react-native-reanimated`, and
  `react-native-worklets` in the `mobile` workspace with `npx expo install …` (SDK-57-pinned);
  verify `mobile/package.json` lists all three and `npm run mobile:typecheck` is clean.
  (NOTE: `npx expo install` re-hoisted `react-native`, deleting the committed
  `mobile/node_modules/react-native@0.86.3` nesting that `jest.config.js` requires — restored via
  `npm install` from the committed lock, then the three deps were added with
  `npm install … --workspace mobile --legacy-peer-deps` and exact SDK-57 versions to preserve it.)
- [x] 1.2 Add the Reanimated Jest mock to `mobile/jest.setup.js` (per the installed version's
  testing guide) and confirm `npm run mobile:test` still passes on the existing suites.
  (`react-native-reanimated/mock`; 78/78 pass.)
- [x] 1.3 Add an ambient `*.png` module declaration for TypeScript (e.g.
  `mobile/src/types/assets.d.ts`) so image `require()`s type-check; verify with
  `npm run mobile:typecheck`.

## 2. Theme art pipeline

- [x] 2.1 Add `mobile/scripts/sync-theme-assets.mjs` that copies
  `web/public/themes/<name>/*.png` → `mobile/assets/themes/<name>/` **for every shipped theme** and
  emits `mobile/src/themeAssets.gen.ts` with one literal `require()` per PNG (key
  `` `<name>/<file>.png` ``), embedding each PNG's width/height measured from its IHDR header;
  verify a run produces the expected file count for both `fantasy` and `lucky`.
  (NOTE: both themes emit **32** entries; the `require()` literal is `../assets/themes/<name>/<file>.png`
  — the design's `../../assets` example is one level too high for a registry at `mobile/src/themeAssets.gen.ts`.
  The gate is resolution: `npm run mobile:test` fails on a wrong path, and `../assets` is the correct one.)
- [x] 2.2 Wire an npm script (`mobile:assets`, plus a root alias) to run the sync; verify
  re-running is idempotent and the generated registry/PNGs are committed.
  (`mobile/package.json` `assets` + root `mobile:assets`; two runs produce byte-identical
  `sha256` trees, 64 PNGs + the registry.)
- [x] 2.3 Extend `mobile/src/theme.ts` `resolveAsset` to return the resolved
  `{ source, width, height }` entry from the registry and to **throw** when the active theme
  declares a slot the registry lacks; verify a unit test covers both the resolved case and the
  throwing case.
  (NOTE: added the `png` extension to `mobile/jest.config.js` `moduleFileExtensions` so Jest can
  resolve the registry's `require()`s — the jest-expo preset ships the asset transformer but does
  not list image extensions; the file is outside the phase file list, required for the pipeline.)
- [x] 2.4 Add a Jest test asserting `THEME_ASSETS` covers every key in `ACTIVE_THEME.assets`;
  verify it passes and fails if a registry entry is removed.
  (NOTE: `THEMES`/`lucky` are not exported from the engine's public index and engine-core is
  off-limits, so the "every theme" check works from the generated keys: 32 entries per shipped
  `fantasy`/`lucky` directory + full `ACTIVE_THEME` coverage + a shrunk-registry case.)
- [x] 2.5 Replace `AssetPlaceholder` with a `ThemeImage` component (`<Image resizeMode="contain">`
  at the registry's measured pixel size) and update the Arena and Shiny call sites; verify
  component tests still find `asset-<slot>` and render an `Image`.

## 3. Animation core (event → cue)

- [x] 3.1 Add `mobile/src/animation/cues.ts`: the target union, `CUE_PRIORITY`, and
  `collectCueWinners(events, initialStage)` ported from `/web`'s `handleEvents` (left-to-right
  scan, `stageEntered` updates the running stage, ties to the last occurrence); verify unit tests
  cover boss-vs-normal frame choice, kill-beats-hit, and ties-to-last within one batch.
  (NOTE: `isBoss` is imported from the engine's public index; the port uses the same 6/6/5/4/3/3/2/1
  priority ordering and the `>=` last-wins selection. `cues.test.ts` covers click→player+enemy,
  boss-vs-normal hit frames from the RUNNING stage, boss-vs-normal death frame from the killed
  stage, kill-beats-hit, ties-to-last, `stageEntered` mid-batch stage advance, shiny spawn/claim,
  taunt-ignored, and the declared priority ordering.)
- [x] 3.2 Add `mobile/src/animation/useReducedMotion.ts` using
  `AccessibilityInfo.isReduceMotionEnabled()` + the change listener; verify tests cover
  initial-on, initial-off, and a live flip.
  (NOTE: accepts an injectable `ReducedMotionSource` (defaults to `AccessibilityInfo`) so tests mock
  the read/listener; unavailable/rejected reads are treated as motion-allowed; the listener is
  removed on unmount. `useReducedMotion.test.ts` covers initial-on, initial-off, live flip both
  ways, unmount cleanup, and the unavailable-read fallback.)
- [x] 3.3 Add `mobile/src/animation/useAnimationCues.ts`: enqueue at most one live frame per target
  with an expiry from `theme.animation.cues`, one drain timer, "duration 0 disables", and a bounded
  queue, via an injectable timer seam; verify tests drive expiries deterministically and that no
  frame is enqueued under reduced motion.
  (NOTE: mirrors `/web`'s `enqueueEffect`/`scheduleDrain`/`clearEffects` with `MAX_ACTIVE_EFFECTS=8`;
  expiry uses wall-clock `Date.now()` (injectable; RN lacks portable `performance.now()`), and the
  drain wakes at the EARLIEST deadline across all live frames. `useAnimationCues.test.ts` drives a
  `ManualCueScheduler`, asserting cue-frame→idle on expiry, the earliest-deadline delay, no enqueue
  under reduced motion, mid-session clear on flip, and the duration-0 off switch.)
- [x] 3.4 Pass `host.frame.events` from `GameScreen` into `Arena` (and the Shiny control), swap the
  player/enemy/Shiny sprite slots while a cue is live, and return to idle on expiry; verify a
  component test shows the declared cue frame then idle, and `npm run mobile:test` passes.
  (NOTE: `Arena` gained an optional `events` prop and drives the enemy + Shiny targets via
  `slotFor`; **there is NO player sprite site in the RN Arena** — `/web` renders `stage__player`,
  but the RN layout never did, so no player layout was invented (the `player` target is still
  computed by `cues.ts` should one be added). `GameScreen` passes `host.frame.events` only.
  `Arena.cues.test.tsx` mocks `AccessibilityInfo` + timers and shows the declared `enemyHit` frame
  then the idle frame on drain. `npm run mobile:test`: 13 suites / 106 tests green.)

## 4. Flourishes (fuller set)

- [x] 4.1 Animate the HP-bar fill toward the new percentage with Reanimated (replacing the instant
  width change); verify the component test renders the target width and reduced motion snaps
  without tweening.
  (NOTE: `useHpFillWidth` in `animation/motion.ts` drives the fill width with
  `useSharedValue`/`useAnimatedStyle`/`withTiming`; reduced motion sets the value directly (no
  tween). `flourishes.test.tsx` asserts the target `%` in both branches.)
- [x] 4.2 Add the boost-pill pulse (scale loop while a boost is active; static under reduced
  motion); verify the component test covers active and inactive states.
  (NOTE: `usePulse` wraps the pill in an `Animated.View`; `flourishes.test.tsx` covers active,
  inactive, and reduced-motion (`scale === 1`).)
- [x] 4.3 Add Shiny drift + pulse while a Shiny is live and the escape/claim message
  (`theme.shiny.*`) with a pop entrance (message text still shows under reduced motion); verify
  component tests for spawn, claim, and escape.
  (NOTE: `useDrift` + `usePulse` on the Shiny; `useShinyMessage` diffs the active Shiny across
  renders and distinguishes a grab (a `pendingClaim` ref set by the tap wrapper, consumed by the
  diff) from an escape. `theme.shiny.frenzyClaim`/`dropClaim`/`claimed`/`escape` all resolve from
  the theme. `flourishes.test.tsx` covers spawn→escape, tap→claim, and escape-under-reduced-motion.)
- [x] 4.4 Add the global spawn popup from the `stageEntered` cue with a pop entrance; verify the
  component test shows the declared `spawn-popup` slot for the cue duration and hides on expiry.
  (NOTE: `SpawnPopup` reads `cues.slotFor('global', '')` (the SAME cue hook as 3.4) and renders the
  declared slot with `useEntrance`; `flourishes.test.tsx` asserts the `stageEntered` slot shows and
  the popup is absent with no global cue.)
- [x] 4.5 Add the enemy taunt toast from `enemyTaunt` events (shows under reduced motion, auto-
  dismisses); verify a component test renders the theme catchphrase and then clears it.
  (NOTE: `useEnemyTaunt` scans the frame batch for the LAST `enemyTaunt`, resolves
  `ACTIVE_THEME.enemy.roster[id].catchphrases[kind][phraseIndex % len]`, and auto-dismisses. It
  never consults reduced motion — it is text. `flourishes.test.tsx` covers resolve + dismiss; the
  Toast component test covers reduced motion.)
- [x] 4.6 Add the queued achievement splash (diff unlocked ids; seed on first render so restored
  unlocks do not replay) and the milestone flourish (diff per-slot milestone counts); verify tests
  cover a burst queue and a step change, including reduced motion (text without pop).
  (NOTE: `useAchievementSplash` seeds `seen` on first render, queues a burst and shows one at a
  time; `useMilestoneFlourish` seeds per-slot `achievedCount` and fires on an increase (both diff
  `state`, mirroring `/web`). `flourishes.test.tsx` covers seed-no-replay, a queued burst advancing
  on dismiss, and a milestone step change; `Splash` renders its text under reduced motion.)
- [x] 4.7 Add an entrance animation to the choice/offline overlay cards; verify the overlay tests
  still pass and reduced motion renders without movement.
  (NOTE: `useEntrance` wraps each overlay card in an `Animated.View`; reduced motion resolves to the
  final (still) style. The existing `components.test.tsx` overlay tests still pass; a reduced-motion
  case is added in `flourishes.test.tsx`.)

## 5. Safe-area insets

- [x] 5.1 Wrap the app in `SafeAreaProvider` (`App.tsx`) and apply top/bottom insets in
  `GameScreen` (with `layout` changes) so the HUD clears the status bar/cutout and bottom content
  clears the gesture area; verify insets flow to the screen style in a test and the app renders on
  an edge-to-edge Android device with the header fully visible.
  (NOTE: `App.tsx` now renders `<SafeAreaProvider><GameScreen /></SafeAreaProvider>`. `GameScreen`
  calls `useSafeAreaInsets()` and composes `screenFramePadding(insets)` — a pure helper in
  `layout.ts` — onto the screen frame for BOTH the booting and game-screen roots. The helper adds
  the insets ON TOP of `SCREEN_PADDING_VERTICAL = 16`, so zero insets degrade to exactly the base
  design padding. `safeArea.test.tsx` renders the REAL `SafeAreaProvider` with fixed `initialMetrics`
  (no device metrics) and asserts padding = base + inset (24/34) and = base at zero. `handlers.test.tsx`
  now wraps `GameScreen` in `SafeAreaProvider` (the provider is now a render-time requirement). The
  on-device header-visibility check is deferred to task 6.2 — it needs a real device/emulator.)
- [x] 5.2 Offset the bottom-anchored transient messages by the bottom inset so they do not sit in
  the gesture area; verify visually on device and that a zero inset adds no extra padding.
  (NOTE: the bottom-anchored surface is the `GameScreen` toast stack (enemy taunt + milestone).
  Its `paddingBottom` comes from `bottomInsetPadding(insets)` (= `insets.bottom`), so zero insets add
  NO padding. The achievement `Splash` is top-anchored (`top: '32%'`) and Arena's Shiny-message
  `Toast` is in the stage flow, so neither is a bottom-anchored surface. `safeArea.test.tsx` covers
  the helper's non-zero and zero cases. The visual device check is deferred to task 6.2.)

## 6. Verification & docs

- [x] 6.1 Run `npm run mobile:typecheck`, `npm run mobile:test`, and the repo gates
  (`npm run test`, `npm run sim`, `npm run build`, and `npm run smoke` with the web dev server
  running) — all green, and `git diff --stat engine-core web sim` shows no changes.
  (Verified: mobile typecheck clean; mobile 131/131; engine 236/236; sim `PACING OK`; build OK;
  smoke 28/28; `git diff --stat engine-core web sim` empty.)
- [x] 6.2 Build the APK (`npm run mobile:apk`) and smoke-check the header padding, sprite art, and
  animation on a device/emulator; confirm reduced motion suppresses movement and that informational
  text still appears.
  (APK built successfully with the `$HOME` JDK17 + Android SDK toolchain: `BUILD SUCCESSFUL`,
  77M / 80,008,829 bytes at `mobile/dist/auto-auto-clicker.apk`; `aapt2 dump badging` confirms
  `com.autoautoclicker.app`, `versionName 0.2.0`, `compileSdk 36`. The ON-DEVICE visual smoke-check
  cannot be run from this environment — it is the manual follow-up in `STATE.md`, and it is the
  only remaining unverified item.)
- [x] 6.3 Update `README.md` (mobile visual/animation behavior + the `mobile:assets` step) and
  `STATE.md`; verify the docs describe the new pipeline and that no balance/identity values changed.
  (Updated README "Second host" + repo layout + commands + a `mobile/` dependency-add warning;
  `STATE.md` Status/Mobile gates/Follow-ups; `AGENTS.md` current-shape + dep note. No balance or
  identity values touched.)
