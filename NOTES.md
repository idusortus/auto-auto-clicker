# NOTES.md — parking lot

> Out-of-scope ideas and open questions. Nothing here is built unless it is
> explicitly pulled into a phase. The project rules forbid inventing mechanics
> beyond the core loop, so ideas land here instead of in code.

## Build / phase notes

- **Offline progress is auto-DPS only.** On boot the web host replays real
  elapsed time through the same `advance(state, 1000)` the live loop uses, in
  bounded 1000 ms steps, capped at 8 h (`OFFLINE_CAP_MS`). No clicks are
  replayed, so a returning player earns strictly less than they would have by
  tapping. If a choice is pending in the save, replay stops immediately (the
  engine freezes the world) and the choice is shown on boot. This is a host
  policy choice, not an engine rule.
- **`watchAd` / `iap` are placeholders.** The engine already supports the
  `resolveChoice('watchAd' | 'iap')` actions, but this build ships no ad SDK and
  no payment code. The renderer shows them as disabled "coming soon" buttons so
  the free `wait` path is always the working one; a future phase hooks a real
  monetisation adapter in behind `RendererHandlers.onChoice`. The
  `engine-core` actions are intentionally left untouched.
- **No balance numbers in `/web`.** All loop timing (100 ms step, 10-step
  catch-up cap, 5 s autosave, 1000 ms offline step, 8 h cap) and all formatting
  constants (percent, minutes/hour) are host/presentation values, not gameplay
  tuning. Every gameplay value displayed comes from engine-core state or its
  exported getters.
- **README is intentionally not updated this phase.** The phase brief scopes
  Phase 4 to `web/*` + `NOTES.md` and reserves the README rewrite for Phase 6,
  so the README's "later phases" wording is left for that phase.
- **Runtime verification without a browser:** Phase 5 owns the Playwright smoke
  test. During Phase 4 the renderer + boot path were exercised headlessly with a
  throwaway DOM shim (selectors validated against the generated skeleton, all
  render branches driven); the shim was deleted afterwards.

## Ideas (not built)

- Floating damage / gold popups and a tap ripple — purely cosmetic; a candidate
  for the Phase 4b visual pass.
- Offline summary could show a per-stage "furthest stage reached" line.
- Bag sorting / bulk sell — would need an engine action first; out of scope.
- Number abbreviation (1.2K / 3.4M) for very large gold values — the renderer
  currently prints full integers so tests stay exact.
