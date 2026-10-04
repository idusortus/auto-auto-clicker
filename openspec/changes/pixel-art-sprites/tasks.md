# Tasks

## 1. Extend the theme display contract to frame sequences

- [x] 1.1 Add frame-sequence support to the theme contract: extend `AssetSlotSpec` in
  `engine-core/src/theme/contract.ts` with `frameCount` + `frames` (the required file names), and
  update `ASSET_FILENAME_PATTERN` for the `-<n>` frame suffix; verify `npm run typecheck` is clean
  for `engine-core`.
- [x] 1.2 Change `Theme.assets` in `engine-core/src/theme/types.ts` from `Record<string, string>` to
  an ordered frame list per slot (`Record<string, readonly string[]>`), documenting that it stays
  DISPLAY-only and identity-free; verify typecheck is clean.
- [x] 1.3 Migrate `fantasy.ts` and `lucky.ts` `assets` (and any cue/animation references) to the new
  shape using **placeholder** frames (frameCount per slot) so the tree compiles before real art
  exists; verify `npm run typecheck` + `npm run test -w engine-core` stay green (frames not yet
  checked on disk).

## 2. Frame-aware validation + gates

- [x] 2.1 Update `validateAssetMeasurements` (`contract.ts`) and `check-theme.ts` to verify EVERY
  frame of every slot (existence + exact declared size) and report each missing/mis-sized frame with
  its path and actual-vs-expected size. Note: `AssetMeasurement`/`AssetCheckResult` are slot-keyed
  today, so frame-aware checking needs a frame-in-slot identifier (e.g. `{ slot, frameIndex, … }`)
  and the aggregate counts become per-frame; verify the checker's unit tests (`asset-check.test.ts`)
  and `npm run theme:check` pass on the migrated placeholder frames.
- [x] 2.2 Update the engine theme tests (`theme.test.ts`, `asset-check.test.ts`) to assert every
  theme declares the same frame set (same slots, same frame counts) and that cues point at
  sequence-capable slots; verify `npm run test -w engine-core` is green and the "32 slots" invariant
  is restated (slot count unchanged, frame counts added).

## 3. Author the real `fantasy` pixel art

- [x] 3.1 Add `engine-core/scripts/make-pixel-art.ts` (dependency-free; reuses the PNG encoder) with
  an explicit art model (palette, per-slot pixel maps/shape DSL, per-frame poses) for the player,
  normal enemy, boss enemy, the four Shiny variants, and the spawn popup; verify it writes the exact
  declared files at the exact declared sizes and `npm run theme:check` passes.
- [x] 3.2 Draw meaningfully distinct frames per action (idle bob/blink, attack wind-up→strike, hurt
  flash/recoil, multi-frame death collapse) with dark outline + shading steps and ≥8 colours; verify
  by rendering the PNGs and confirming same-action frames differ pixel-wise (a test/command that
  asserts frames within a slot are not identical).
- [x] 3.3 Regenerate `web/public/themes/fantasy/**` from the new script and confirm the old
  placeholder generator is retained for `lucky`; verify `npm run theme:check` reports every frame
  present at the exact size for the active theme.

## 4. Web host: play frame sequences

- [x] 4.1 Extend the web renderer (`renderer.ts`) so the idle state loops its idle sequence and each
  cue plays its declared frame sequence once across the cue duration, then returns to idle; resolve
  frames via the theme's `assets` (no hard-coded file names); update the Playwright smoke test
  (`web/tests/smoke.spec.ts`, which asserts the `player-sprite`/`enemy-sprite` `src`) so the
  existing sprite-frame cases pass and add a case asserting the frame advances.
- [x] 4.2 Hold frame 0 of every sequence under `prefers-reduced-motion` (no loop, no advancement)
  while leaving informational text intact; verify the reduced-motion smoke test still passes and a
  new assertion shows the sprite frame does not change.

## 5. Mobile host: play frame sequences

- [x] 5.1 Make the mobile asset pipeline frame-aware: `theme.assets[slot]` is now an ordered frame
  list, so update `mobile/src/theme.ts` `resolveAsset` to return the ordered frame sources (each
  frame file looked up in the existing file-keyed registry, throwing loudly on a missing frame) and
  keep `sync-theme-assets.mjs` file-keyed (it must NOT import `ASSET_SLOTS`); verify
  `npm run mobile:assets` is idempotent and `mobile:typecheck` + `mobile:test` pass.
- [x] 5.2 Update `ThemeImage` to render a slot at a given frame index, and `useAnimationCues` to
  drive sequence playback (idle loop when no cue is live; one-shot sequence for a cue across its
  duration; return the frame index); verify unit tests cover idle looping, one-shot advance + return
  to idle, and a missing frame throwing.
- [x] 5.3 Honor reduced motion by holding frame 0 of every sequence (no loop, no advance) in the
  mobile host; verify the reduced-motion tests assert a stable frame and that informational text
  still renders.
- [x] 5.4 Wire the arena/Shiny/spawn-popup call sites to the frame-aware `ThemeImage`; verify
  `mobile/components` tests pass and an integration test shows a cue visibly changing the displayed
  frame then idling.

## 6. Verification & docs

- [x] 6.1 Run the full gates — `npm run typecheck`, `npm run test` (engine, incl. purity/boundary),
  `npm run sim` (`PACING OK`), `npm run build`, `npm run smoke`, `npm run mobile:typecheck`,
  `npm run mobile:test`, `npm run theme:check` — all green, and confirm no save-schema/balance
  change (schema stays v4; `git diff` shows no simulation/economy edits).
- [x] 6.2 Update `README.md` (theme section: real art + frame sequences + the generator; the
  `theme:check` frame contract) and `STATE.md`; verify the docs describe the new shape and that no
  identity or balance value changed.
- [ ] 6.3 Build the APK (`npm run mobile:apk`) and visually confirm on a device/emulator that
  sprites are recognisable pixel art and animations play (idle loop + cue sequences), with reduced
  motion holding a rest frame; record the outcome.
