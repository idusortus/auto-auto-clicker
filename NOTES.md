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
- **Playwright mobile smoke test (Phase 5).** `web/tests/smoke.spec.ts` +
  `web/playwright.config.ts`; run `npm run smoke` from the repo root. The config
  starts the real Vite dev server on a strict port 5173 and drives it at
  390×844 / touch / DPR 3 (mobile Chromium emulation). `beforeEach` clears
  `localStorage` so every test boots a fresh game instead of a stale autosave.
  Chromium v1243 was already in `~/.cache/ms-playwright`, so no browser download
  was needed. Dependency: `@playwright/test` (see `decisions.md`).
- **First upgrade does not move the HUD DPS readout.** With the guaranteed
  item-level-1 starter weapon, `autoDps = base(2) + floor(2 * 1.3^0) = 4`; after
  one upgrade it is `2 + floor(2 * 1.3^1) = 2 + 2 = 4` (integer flooring). The
  readout only rises on the second upgrade (`2 + floor(2 * 1.3^2) = 5`). The
  smoke test therefore asserts the upgrade **counter** increments and gold is
  spent on the first tap, then keeps upgrading until the DPS readout strictly
  increases (observed at upgrade #2). No engine change: flooring is intended.

- **Phase 6 documentation pass.** `README.md` was rewritten for a new contributor:
  architecture and the one-way dependency direction (`web → engine-core`,
  `sim → engine-core`, never reverse), the engine-core purity contract, the pure
  `advance`/`applyAction` simulation contract (hosts own the clock and drive fixed 100 ms
  steps; offline replay goes through the same `advance` in bounded steps, auto-DPS only),
  the versioned `SaveGame` + async `SaveRepository` model, the pacing proof with current
  numbers (soft 5.92 min @ stage 30, hard 52.23 min @ stage 60, 5-seed hard assertion), the
  honest trade-offs, a dependency-justification table, and a concrete "Porting to Expo"
  section. The stale "svelte and supabase" stack text in `PROJECT.md` and `AGENTS.md` was
  corrected to TypeScript + Vite + vanilla DOM + pure engine, local-only. The earlier note
  "README is intentionally not updated this phase" is now superseded. No code, balance,
  save schema, or tests were touched.
- **Documented-but-intentional gaps** (carried into the README trade-offs): `iap` advances
  one stage; `watchAd`/`iap` are disabled placeholders with no SDK; HUD prints full
  integers (late-game auto-DPS ~3e7, no compact notation); and pacing is identical across
  seeds because the power core is deterministic and drops are bounded. These are scoped
  limitations for this brief, not bugs.

## Ideas (not built)

- Floating damage / gold popups and a tap ripple — purely cosmetic; a candidate
  for the Phase 4b visual pass.
- Offline summary could show a per-stage "furthest stage reached" line.
- Bag sorting / bulk sell — would need an engine action first; out of scope.
- Number abbreviation (1.2K / 3.4M) for very large gold values — the renderer
  currently prints full integers so tests stay exact.
