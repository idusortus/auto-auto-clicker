# auto-auto-clicker — Current State

> Cross-session memory for all agents. Update on exit; read on entry.

## Status
**Shinies are now felt AND wall-neutral (Option 3); `npm run sim` is GREEN with no threshold
changed.** The wall-projection fix is kept (projection measures the stage's MAX HP against
sustained, boost-excluding power); the frenzy's residual wall-clock effect is bounded by
construction (`D × (M−1)` per claim) and the reward mix was shifted onto tempo + gold + a
guaranteed ring drop, with a longer cadence (151 s) that lifts the canonical hard baseline to
~51.9 min.

Gates (this session):
- `npm run typecheck` → clean for all three workspaces (`engine-core`, `web`, `sim`).
- `npm run test` → **113 passed (9 files), exit 0**.
- `npm run sim` → **PACING OK (exit 0).** Canonical soft 6.19 / hard 49.55 (inside comfortable);
  all-seed hard 43.90–45.90; boost-uptime 0.9–2.2%; drops-primary net 99.6%; eq/stage 0.82–0.96.
- `npm run build` → exit 0. `npm run smoke` → **10 passed, exit 0**.

### This session's changes
- **Third Shiny reward kind `'drop'`** (guaranteed ring at the current stage, weaker ring slot,
  no RNG), plus `drop`/`frenzy`/`cache` mix rebalanced (`SHINY_DROP_SHARE` new; share 0.3 / 0.3).
  `ActiveShiny.kind` gains a `'drop'` value (schema stays **v4**; parser accepts it, unknown kinds
  still rejected). New `grantGearDrop` in `loot.ts`; `applyClaimEvent` handles the kind.
- **Frenzy bounded:** `SHINY_FRENZY_MULTIPLIER` 5 → **3**, `SHINY_FRENZY_DURATION_MS` 15 s → **6 s**
  (per-claim wall budget 12 s, test-pinned); cadence 120 s → **151 s**; cache ×25 → **×2**.
- **Sim reporting:** per-seed reward mix + claims-by-kind (`spawn — mix(c=claims)`).
- **/web:** distinct `drop` target style + "Ring goblin!" label + "Ring grabbed" flourish; smoke
  test +1 (drop claim banks a ring and flourishes).
- **Tests:** `shiny.test.ts` re-expressed the felt-magnitude guard as tempo + mix + wall-budget
  terms and added `drop` claim/routing cases; `save.test.ts` added a `drop` round-trip and updated
  the malformed-kind error regex. +3 net (110 → 113).

### Prior: wall-projection correctness fix (kept)
- **Wall-projection bug fixed.** `engine-core/src/state.ts` `getProjectedKillMs` uses
  `enemyMaxHp(state.combat.stage)` and `sustainedActiveDps(state)` (leaf `gear-stats.ts`), so a
  temporary frenzy can never change whether a wall is raised. Signature/`null` semantics unchanged.
  The literal "max HP only" change was a sim no-op; the boost exclusion is what closes the leak.
- **Sim ordering fix.** `sim/src/sim.ts` resolves a pending choice BEFORE claiming a Shiny.

### Prior: Phases 1–3 of the 3-phase extension (still in place)
Phase 1 added the ring/necklace/achievement engine + save schema v3; Phase 2 retuned the drop
weights to restore pacing; Phase 3 corrected the sim's equip policy so rings/necklaces are actually
validated, capped their multiplicative bonuses, and shipped the /web achievements splash + shelf.
The earlier prototype (Phases 0–6), the 2026-09-26 economy reversal, and the save-schema v2 change
remain underneath.

## In Flight
Nothing blocking. Optional follow-up: if the frenzy should feel bigger/longer, make it *stage-local*
(a budget consumed on stage change) so the run-average lever is structurally zero — a new decision,
not a knob change. Do NOT edit `BOSS_TIMER_MS` / `HARD_WALL_PROJECTED_KILL_MS` / the ±20% tolerance /
the canonical comfortable ranges / the drops-primary gate.

## Blockers / Known trade-offs
- **All gates are green.** `npm run sim` is PACING OK (exit 0).
- **The Shiny reward is bounded by the hard window.** The per-claim frenzy wall budget is
  `D × (M−1) = 12 s` (test-pinned); the 151 s cadence exists to lift the canonical hard baseline to
  ~51.9 min and leave the ~2.4–3.9 min of slack the mix consumes. A longer/bigger frenzy or a larger
  cache (×3+) breaches the canonical floor — do not raise either without a structural change.
- **The `drop` reward is ring-only on purpose.** Weapons are the unbounded exponential lever; a
  guaranteed same-stage weapon drop leapfrogs the equipped weapon and moved the wall stage 50 → 59.
  Rings are the designed bounded lever and hold the wall stage.
- **`sustainedActiveDps` is a second stats path** and must stay in sync with `getEffectiveStats`'s
  pre-boost factor. It is intentionally NOT exported from `index.ts`.
- **Pacing is in tolerance for every seed.** Do NOT widen the window.
- **Rings/necklaces are bounded secondary levers** (≈+16% DPS at saturation, ≈10% pacing effect).
- **Effective stats are fractional**; damage is floored at the accumulation/click boundary.
- **Gold is deliberately a small lever**; `watchAd`/`iap` remain disabled UI placeholders.
- **Four save schema versions, one migration path**; `SaveRepository` has no `clear()`.
- **No player HP / armor / dodge / enemy attacks** — explicitly deferred (see `NOTES.md`).

## Recent Decisions
See `decisions.md`. Most recent: 2026-09-27 "Option 3: Shinies felt but WALL-NEUTRAL — tempo + gold
+ a guaranteed ring drop; sim green with no threshold changed". Also authoritative: "Fix a real
wall-projection bug" (the leak fix, kept), the Phase 3 sim-policy/caps and /web splash entries,
"Break the `state ↔ achievements` import cycle via a `gear-stats.ts` leaf", "Golden Events
(Shinies): spawn/claim/boost engine slice, save v4", "Save schema v3", and the 2026-09-26 economy
reversal.

## Next
1. Build the Expo/RN port by supplying a renderer + a `SaveRepository` and a host clock driving
   `advance()` — see README "Porting to Expo".
3. Optional polish: compact numeral formatting, tap/feedback cosmetics, bag sorting
   (would need a new engine action first).

---

_Generated by `npx cli-five` on 2026-09-26._
