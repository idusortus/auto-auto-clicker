# auto-auto-clicker — Current State

> Cross-session memory for all agents. Update on exit; read on entry.

## Status
**Gold is now an ALLOCATION decision (Phase C): per-slot upgrade controls + derived milestone
steps; `npm run sim` is GREEN with no threshold changed.** `/web` renders one upgrade control per
equipped slot (weapon keeps `upgrade-btn`); every 3rd upgrade level in an item crosses a
**milestone** that grants a small boost to that slot's *existing capped* stat and shows a
non-blocking flourish + `★ ×N` card badge. The bonus is **derived from `upgradeLevel` on read**, so
the save schema stays **v4**. The sim's economy policy is slot-aware (buys the affordable upgrade
across all four slots with the largest real power gain, skips zero-gain upgrades).

Gates (this session):
- `npm run typecheck` → clean for all three workspaces (`engine-core`, `web`, `sim`).
- `npm run test` → **126 passed (10 files), exit 0**.
- `npm run sim` → **PACING OK (exit 0).** Canonical soft 6.18 / hard 49.54 (inside comfortable);
  all-seed soft 5.72–6.18, hard 43.90–45.88; drops-primary net 98.3–99.6%; eq/stage 0.82–0.96.
- `npm run build` → exit 0. `npm run smoke` → **13 passed, exit 0**.

### This session's changes (Phase C)
- **Per-slot upgrade UI.** One control per equipped slot: `upgrade-btn` (weapon, kept) plus
  `upgrade-btn-ring1`/`-ring2`/`-necklace`, each with `upgrade-cost`/`upgrade-level` readouts and an
  independent disabled state; `onUpgrade(slot)` is now slot-aware. All existing testids/classes kept.
- **Milestones (derived, capped, not persisted).** `UPGRADE_MILESTONE_INTERVAL = 3`;
  `UPGRADE_MILESTONE_BONUS[slot]` → weapon power, rings crit chance+crit dmg, necklace gold
  (power deliberately omitted: the necklace's raw power already saturates the cap). Folded into the
  same clamped `getCritStats`/`getGlobalBonuses`; `getMilestoneInfo`/`getSlotMilestones` return the
  engine-worded `bonusDescription`. New `milestoneReached` GameEvent; `/web` diffs counts per render
  for the flourish + badge. Schema unchanged (v4) — nothing new is persisted.
- **Sim policy + ledger.** `runEconomy` buys the max-power-gain affordable upgrade across all slots
  (skips zero-gain); reports per-slot upgrade counts + milestones; the milestone factor gain is
  charged to GOLD so drops-primary stays honest.
- **Achievements** 27 → 30 (`milestone-first`, `upgrade-diversified`, `upgrade-veteran`); catalog
  test bound 18–30 → 18–33.
- **Tests:** +10 `milestone.test.ts`, +3 achievement triggers, smoke 10 → 13.

### Prior: Shinies felt and wall-neutral (Option 3, kept)
The wall-projection fix is kept (projection measures the stage's MAX HP against sustained,
boost-excluding power); the frenzy's residual wall-clock effect is bounded by construction
(`D × (M−1)` per claim), the reward mix is tempo + gold + a guaranteed ring `drop`, and the cadence
(151 s) lifts the canonical hard baseline to ~51.9 min. The `drop` reward is ring-only on purpose.

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
- **Milestone bonuses are bounded by the caps.** Milestones feed the same clamped aggregations as
  gear, so a cap-saturated stat (power with a necklace equipped, crit with saturated rings) makes a
  milestone's *effective* gain small even though the badge shows the granted amount. This is
  intentional ("use the existing capped stats"); making milestones meaningful past the caps needs a
  new non-multiplicative channel, not a bigger number.
- **The milestone interval is 3, not 5.** Item `upgradeLevel` peaks at 2–7 across the sweep seeds
  (costs grow ×6 against flat gold), so interval 5 would be unreachable content.
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
- **Gold is deliberately a small lever** (now spent as a per-slot choice); `watchAd`/`iap` remain
  disabled UI placeholders.
- **Four save schema versions, one migration path**; `SaveRepository` has no `clear()`. Milestones
  add **no** field, so the schema stays v4.
- **No player HP / armor / dodge / enemy attacks** — explicitly deferred (see `NOTES.md`).

## Recent Decisions
See `decisions.md`. Most recent: 2026-09-27 "Phase C — gold becomes an allocation decision:
per-slot upgrade controls + derived milestone steps". Also authoritative: "Option 3: Shinies felt
but WALL-NEUTRAL — tempo + gold + a guaranteed ring drop", "Fix a real wall-projection bug" (the
leak fix, kept), the Phase 3 sim-policy/caps and /web splash entries, "Break the
`state ↔ achievements` import cycle via a `gear-stats.ts` leaf", "Golden Events (Shinies):
spawn/claim/boost engine slice, save v4", "Save schema v3", and the 2026-09-26 economy reversal.

## Next
1. Build the Expo/RN port by supplying a renderer + a `SaveRepository` and a host clock driving
   `advance()` — see README "Porting to Expo".
3. Optional polish: compact numeral formatting, tap/feedback cosmetics, bag sorting
   (would need a new engine action first).

---

_Generated by `npx cli-five` on 2026-09-26._
