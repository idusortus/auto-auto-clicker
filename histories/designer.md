# Designer History

> Accumulated learnings about this project. Read at session start, append non-obvious discoveries.

<!-- Append entries below this line -->
- 2026-09-25: `/web` HUD (Phase 4b) — the renderer exposes only classes + `data-testid`/`data-role`, so state-dependent styling must be derived structurally, not via new classes. Two hooks make this work without touching `renderer.ts`: `.enemy:has(.enemy__badge:not([hidden]))` styles the boss arena (renderer only toggles the `hidden` attribute), and `.overlay:has(.overlay__note)` identifies the choice overlay alone (the note element is unique to it), letting it render as a bottom sheet while the offline dialog stays centered. Reacting to a tap with pure CSS is possible: an absolutely-positioned `::after` radial gradient over `.enemy` with `:active { opacity: 1; transition-duration: 0ms }` gives a hit-spark with zero JS.
- 2026-09-25: `/web` HUD — `.hud__stat` has no distinguishing class, only the `data-testid` of its child readout, so per-stat emphasis (gold = ember + wider cell, DPS = recessive) is written as `.hud__stat:has([data-testid="gold"])`. Verify this rule if the HUD ever gains a fourth stat, since `flex-grow` there is positional.
- 2026-09-25: `/web` HUD — contrast floor: `--text-muted #98a2b8` clears 7:1 on `--ink-700 #171b24`, so it is safe for 10–11px labels and hints. The HUD strip (one bordered container with `border-left` dividers) reads more like game chrome than three identical rounded cards; reserve multi-card layouts for genuinely separate sections (only Equipped and Bag are cards here).
- 2026-09-25: `/web` HUD — `vite build` copies `public/style.css` to `dist/style.css` verbatim (no CSS processing/critical-path step), so the stylesheet is not validated at build time. Confirm brace balance and hook coverage manually; a `grep` for `.<class>\b` across the 36 renderer class names is a fast regression check.

