# Design

## Context

See `proposal.md` — Why. Current state and constraints that shape the approach:

- **The art is generated placeholders.** `engine-core/scripts/make-placeholder-assets.ts` emits 32
  flat-colour PNGs per theme from the engine-owned `ASSET_SLOTS` table in
  `engine-core/src/theme/contract.ts` (name + exact width/height + file). The README calls them
  "deliberately not art". `npm run theme:check` verifies existence + exact size; the engine theme
  tests assert the slot set is identical across themes and every cue points at a declared slot.
- **The contract is one image per action.** `Theme.assets: Record<string, string>` maps a slot name
  to a single file; `ThemeAnimationCue` is `{ slot, durationMs }`. There is no notion of an ordered
  frame sequence anywhere, so the existing cue framework can only swap one static image for another
  — which is why near-identical placeholder frames read as "no animation".
- **Three consumers of `assets`:** `web/src/renderer.ts` (`assetUrl(slot)` →
  `/themes/<name>/<assets[slot]>`), `mobile/src/theme.ts` (`resolveAsset` → generated
  literal-`require` registry), and `engine-core/scripts/check-theme.ts` (+ the pure
  `validateAssetMeasurements`). Any shape change must be handled by all three.
- **Hard constraints (AGENTS.md):** `engine-core` is pure (no DOM/timers/clock/random/fs in `src/`);
  identity (slot names, ids, save schema v4) is code-owned and must not move into a theme; a theme
  owns DISPLAY only. `theme:check` and the engine tests are gates. Mobile/`web` hold no balance
  numbers.
- **Animation today:** web drives `setSprite`/`currentEffectSlot` from the cue model with a drain
  timer; mobile ported that model (`animation/cues.ts` + `useAnimationCues` + `useReducedMotion`)
  and renders a slot via `ThemeImage`. Both already have the seam where a *sequence ticker* slots
  in.

## Goals / Non-Goals

**Goals:**

- Replace the placeholder blobs with real, readable old-school pixel-RPG sprites for the `fantasy`
  theme, produced reproducibly by a repo script (no external assets, no new dependencies).
- Introduce ordered **frame sequences** in the engine's display contract, additively, so idle loops
  and one-shot action animations are expressible and actually visible.
- Port sequence playback to both hosts (web + mobile) through the existing cue seam, with reduced
  motion holding a rest frame and a loud, actionable failure on a missing frame.
- Keep every existing gate green: `theme:check`, engine tests, `web` smoke, mobile tests, sim
  pacing, and the engine purity/boundary tests.

**Non-Goals:**

- Any engine simulation, balance, RNG, economy, or **save-schema** change (stays v4).
- Gear-icon art (neither host renders gear sprites today).
- Re-authoring the `lucky` theme's art (it keeps generated placeholders this change, but migrates to
  the new shape so both themes stay contract-identical).
- Exact parity with the web host's CSS transitions; frame sequences are the animation model.
- A sprite/animation editor or any runtime art authoring.

## Decisions

### D1 — Frame sequences are an ordered list of frames per slot, additively

`Theme.assets` becomes a map from slot name to an **ordered frame list**, and `ASSET_SLOTS` declares
how many frames each slot has. Concretely, mirroring the existing file-naming convention:

```ts
// contract.ts — the slot declares its ordered frame files; each frame gets a conventional filename.
interface AssetSlotSpec {
  name: string;          // e.g. 'enemy-grunt-idle'  (UNCHANGED — identity)
  width: number;
  height: number;
  frames: string[];      // NEW — the required file names, in play order
                         //       e.g. ['enemy-grunt-idle-0.png', 'enemy-grunt-idle-1.png'].
                         //       The frame COUNT is `frames.length` (no separate `frameCount`
                         //       field — one source of truth, no drift).
  description: string;
}
```

and the theme maps the slot to its declared frame files:

```ts
// fantasy.ts — DISPLAY only; the theme names its own files, the engine owns the slot identity.
assets: {
  'enemy-grunt-idle': ['enemy-grunt-idle-0.png', 'enemy-grunt-idle-1.png'],
  // …
}
```

- **Why a list on the same slot name, not new slot names:** slot names are *identity* asserted by
  the theme tests and used as test hooks; adding `enemy-grunt-idle-1` as a slot would shred the
  "exactly 32 declared slots" invariant and the cue→slot mapping. Keeping one slot with N frames
  preserves identity while adding motion.
- **Backward compatibility:** a slot with a single frame (`frames.length === 1`) behaves exactly as
  today. The contract bumps every animated slot to ≥ 2 frames; single-frame slots (e.g.
  `spawn-popup`) stay at 1.
- **Alternatives rejected:** (a) a separate `frames: Record<slot, string[]>` section — splits the
  single source of truth and needs its own completeness pass; (b) new per-frame slot names — breaks
  identity and the 32-slot invariant; (c) an animated sprite-sheet PNG — `theme:check` is built
  around one-size-per-file and the renderers use `<img>`/`<Image>` per frame, so a sheet would need
  sub-rect sampling in both hosts (more machinery, harder to validate) — rejected for this change.

### D2 — Real art is generated by a new dependency-free script; placeholders remain for `lucky`

Add `engine-core/scripts/make-pixel-art.ts` (successor to `make-placeholder-assets.ts`) that draws
`fantasy` sprites **as data**: a small palette + per-slot pixel maps (or a tiny shape DSL), rendered
by the existing dependency-free PNG encoder. It writes the exact declared files/sizes so
`theme:check` passes. Design rules for the art (recorded so it is reviewable, not taste):

- **Readable silhouette at 64×64 / 96×96:** a player hero (head/body/weapon), a grunt humanoid, a
  larger horned boss; the Stray Goblin stays a small imp. Distinct outlines, ≥ 8–12 colours each,
  dark outline + 2–3 shading steps (16-bit era look).
- **Frames differ meaningfully:** idle = a subtle 2-frame bob/blink; attack = wind-up then strike
  (weapon/limb displaced); hurt = flash/tint + recoil; death = multi-frame collapse (drop, crumple,
  fade), so a cue is unmistakable.
- **Transparency:** sprites composite over the themed background (existing RGBA support).
- `make-placeholder-assets.ts` is kept (used for `lucky`); the new script targets `fantasy`.

**Alternative rejected:** vendoring a CC0 pack — avoids authoring but adds third-party files,
licence bookkeeping, and dimension-matching per slot, and the repo has been dependency/vendor-averse.

### D3 — Playback lives in a small, shared *model* per host, driven by the existing cue seam

Both hosts already compute a per-actor live cue (web `handleEvents`/`currentEffectSlot`; mobile
`cues.ts`/`useAnimationCues`). Add sequence playback on top:

- **Idle loop:** when an actor has no live cue, advance its **idle** sequence by a per-frame
  interval on a loop (one repeating ticker, not per-actor timers — web already keeps one drain
  timer; mobile keeps one interval/monotonic tick).
- **One-shot cue:** when a cue wins for an actor, play its declared frames in order across the cue's
  `durationMs` (frame *i* shows for `durationMs / frameCount`, remainder to the last), then return
  to the idle loop.
- **Reduced motion:** hold frame 0 of every sequence; no loop, no advancement (matches the modified
  spec and the existing reduced-motion contract).
- **Missing frame:** the renderer throws a descriptive error (mirroring the existing missing-slot
  throw), never a silent blank.

Mobile detail: the generated registry stays **file-keyed** (`` `<theme>/<file>.png` `` → source +
measured size), exactly as today — the script deliberately does not import `ASSET_SLOTS`. With
`theme.assets[slot]` now an ordered frame-file list, `resolveAsset` resolves each frame by looking
its file up in the registry, returning the ordered **frame sources** (throwing loudly if a declared
frame file is absent from the registry). `ThemeImage` takes a slot **and a frame index** and renders
the resolved frame; `useAnimationCues` returns the frame index (idle loop position or the live
cue's sequence position) instead of only a slot.

**Alternative rejected:** per-actor `setInterval` in RN — unbounded timers; the existing single
drain/interval seam is the established pattern and is already test-injected.

### D4 — Validation gains frame-set checks; identity and size checks stay

- `validateAssetMeasurements` checks **every frame file** (existence + exact declared size).
- The theme tests assert every theme declares the **same frame set** (same slots, same frame counts)
  and that every cue points at a slot whose frame count supports the cue.
- `ASSET_FILENAME_PATTERN` gains the `-<n>` frame suffix convention (still lower-kebab `.png`).
- No new identity tokens; slot names and the 32-slot count are unchanged.

## Risks / Trade-offs

- **[Contract change ripples to 3 consumers + sim]** → the shape change is confined to DISPLAY
  (`assets` + `ASSET_SLOTS`); the engine simulation never reads assets, so purity/balance/sim are
  untouched — verified by the existing boundary + pacing gates. Each consumer gets a task.
- **[Hand-"drawn"-in-code art can look crude]** → define explicit art rules (outline, shading steps,
  distinct poses, ≥8 colours) in D2 and review the rendered PNGs against them; iterate on the
  generator, not by hand-editing PNGs (which keeps it reproducible). Acceptable: the bar is
  "readable old-school pixel sprites, clearly not blobs", not professional illustration.
- **[Frame count ↔ cue duration mismatch]** → playback is time-based (`durationMs / frameCount`),
  so any positive frame count works; the tests assert the cue still ends and returns to idle.
- **[`lucky` drifts from the contract]** → its `assets`/`animation` are migrated to the new shape
  and it keeps generated placeholders, so both themes validate identically; only `fantasy` gets real
  art, which the proposal states as a non-goal.
- **[Perf: looping idle ticks both hosts]** → reuse the existing single-timer seam and only tick
  when at least one sprite is visible; the frames are tiny (64/96 px) and already bundled.
- **[`theme:check` used to validate exactly 32 files]** → it now validates frames (≈ 32 slots × ≥2);
  the count moves, but the "every declared frame present at exact size" contract is preserved and
  strengthened.

## Migration Plan

1. Extend the contract (`types.ts`, `contract.ts`) to frame sequences; migrate both themes' `assets`
   + animation to the new shape **still using placeholder frames** so the tree stays green.
2. Update `validateAssetMeasurements` + `check-theme.ts` + theme/asset tests for frame sets.
3. Add `make-pixel-art.ts`, generate the real `fantasy` frames, run `theme:check` + engine tests.
4. Port sequence playback: web `renderer.ts` first (its smoke tests cover sprite frames), then
   mobile `useAnimationCues`/`ThemeImage` + the generated registry.
5. Update docs (README theme section, `STATE.md`), then re-run all gates.

Rollback: the change is additive to the display contract; reverting the engine/`web`/`mobile` edits
and regenerating placeholders restores the prior state with no save-schema impact.

## Open Questions

- The precise per-slot frame **counts** (e.g. idle 2 vs 4, death 3 vs 4) and per-frame durations are
  art-tuning choices — settle them while generating art; they do not change the approach, the
  contract, or the task breakdown.
