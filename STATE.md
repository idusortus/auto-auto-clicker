# auto-auto-clicker — Current State

> Cross-session memory for all agents. Update on exit; read on entry.

## Status
**The 12-enemy roster with PER-ENEMY HP/gold curves landed (replacing the factor/canonical-curve
approach), `ACTIVE_THEME` is now the `lucky` dog theme, and T6 animation + enemy taunts + F1
tap-to-equip all shipped — every gate is green.**

- **`ACTIVE_THEME` is `lucky`** (the golden retriever × husky dog theme). `THEMES = [fantasy, lucky]`
  and the unit suite validates BOTH; `fantasy` is the original "Standard Fantasy RPG" theme.
- **12 distinct enemies** live in `engine-core/src/content.ts` `ENEMY_ROSTER` (grunt, goblin, wolf,
  bat, slime, bandit, spider, wraith, ogre, harpy, golem, dragonling). `enemyForStage(stage) =
  roster[(stage − 1) % 12]` is pure, ZERO RNG, no persisted state (save schema stays **v4**). Each
  enemy owns its OWN live HP/gold curve (`baseHp`/`hpGrowth`/`baseGold`/`goldGrowth`) and its OWN boss
  multipliers — `enemyMaxHp(stage)`/`goldReward(stage)` compute straight from them; there are NO
  `hpFactor`/`goldFactor` factors and NO global canonical curve. Boss CADENCE stays global
  (`isBoss`, every 10th stage); boss SIZE is per-enemy. `archetype` is an inert label. The per-enemy
  `hpGrowth` values sit in a deliberately tight band (1.4273–1.4336) so the pacing proof holds; the
  set came from a ~4,415-candidate measured search. `BALANCE.baseHp`/`hpGrowth`/`baseGold`/`goldGrowth`
  remain documentation anchors only; `BALANCE.bossHpMultiplier`/`bossGoldMultiplier` were DELETED.
  `gear.gearGrowth` is now **1.2832**.
- **Enemy taunts are engine-emitted and theme-worded.** `{type:'enemyTaunt', enemyId, kind,
  phraseIndex}` on kinds spawn/defeat/bossDefeat/wall/shiny/ambient; deterministic via a SEPARATE
  derived RNG channel (`seed ^ totalPlayedMs ^ discriminator`) that NEVER touches `meta.rngState`, so
  taunts cannot perturb the loot stream. Each theme ships 12 enemies × 6 kinds × 4 phrases = **288
  lines**. No taunt fires for a boot/offline kill (offline events are deliberately dropped).
- **T6 animation shipped.** `Theme.animation` has 8 semantic cue keys mapping to declared asset slots +
  display-only durations; `handleEvents` runs a bounded transient-effect queue
  (`MAX_ACTIVE_EFFECTS = 8`, same-target replace, one re-armed drain timer) with per-actor cue priority
  (deaths win) and a `prefers-reduced-motion` gate that suppresses JS sprite frame-swaps while still
  showing text. Honest caveat: the `animation` cues are registered in `theme/contract.ts` but only a
  4-line allow-list registration exists, so `npm run theme:check` does NOT validate animation cues —
  the unit tests do. (`theme:check` DOES validate the enemy roster's shape — every id, ≥4 non-empty
  phrases per kind — via `validateTheme`.)
- **F1 tap-to-equip.** Tapping a FLAGGED ("strictly better") bag row equips it, reusing the existing
  `equip` action; only flagged rows are row-tappable, the `equip-btn` remains the keyboard control,
  and one tap = exactly one dispatch.

Gates (current, verified this session):
- `npm run typecheck` → clean for all three workspaces.
- `npm run test` → **236 passed (16 files), exit 0**.
- `npm run sim` → **PACING OK (exit 0).** Canonical soft 6.22 / hard 55.52 (deltas +3.8% / +2.8%);
  sweep soft 5.63–6.22, hard 50.60–55.52; drops-primary net 97.3–98.6% / gross 90.4–90.9%; per-seed
  equips 43–48, upgrades 100–125, milestones 21–27, per-item peak level 8–10; free-path 0.3–0.5%;
  eq/stage 0.88–0.98; Shiny boost uptime 1.4–1.9%.
- `npm run build` → exit 0 (23 modules). `npm run smoke` → **28 passed, exit 0**.
- `npm run theme:check` → green for `lucky`: 32/32 files exact size; observed max per limit group
  label 18 / chrome 85 / achievement-title 35 / achievement-description 105 / prose 141 / color 7 /
  catchphrase 69 (limits 48/120/64/200/240/64/140).

The one-line switch is `export const ACTIVE_THEME: Theme = <name>;` in
`engine-core/src/theme/index.ts` (committed value: `lucky`).

*The `Prior:` sections below are historical session logs. Their gate counts and pacing/peak
measurements are snapshots from that session, not current — the current gates are in **Status**
above.*

### Prior: T5 — a second theme (`lucky`) proves the theme seam (kept)
**`lucky` (a golden retriever × husky) was added to prove the theme seam; it is now the committed
`ACTIVE_THEME`.** `engine-core/src/theme/lucky.ts` is a
complete `Theme`: player = Lucky; `weapon` → the Jaw, `ring1/2` → dog tags, `necklace` → bandana;
enemy → the mail carrier (boss = the Truck); Shiny → a squirrel; gold → kibble. Its palette is a
deliberately **light "sunlit lawn"** scheme, which exposed real seam gaps now fixed: the **browser
smoke suite was hard-wired to fantasy copy + `/themes/fantasy/`** (now derives every expected string
and asset URL from `ACTIVE_THEME`), and several `style.css` colours were **literals, not tokens** (the
arena vignette, boss arena, escape-toast plate, frenzy pill, `#ffd257` accent badges, advisory
bg/kicker, splash glow — now token-derived via `color-mix`). New `THEMES = [fantasy, lucky]` registry
means the unit suite validates EVERY theme, asserts both carry the same achievement-id + asset-slot
sets, and asserts they genuinely differ. Added a committed dependency-free placeholder generator
(`npm run theme:assets -- <name>`) and the 32 `web/public/themes/lucky/*.png`; README gained an
"Adding a theme" guide. Known residual gap: `color-scheme` is not a palette token (fixed `dark`), so a
light theme leaves UA scrollbar/form chrome dark.

Gates (that session — historical snapshot, green on BOTH themes; at the time `fantasy` was the default
and `lucky` was a temporary switch):
- `npm run typecheck` → clean for all three workspaces.
- `npm run test` → **191 passed (14 files), exit 0** (+10 theme tests: every theme validates, same
  id/slot sets, themes differ).
- `npm run sim` → **PACING OK (exit 0)** (engine untouched; identity/balance unchanged).
- `npm run build` → exit 0 (22 modules). `npm run smoke` → **19 passed, exit 0** (theme-agnostic).
- `npm run theme:check` → `✓ theme contract OK` for both; `lucky` limits 18/85/35/89/142 and
  `32/32 files present at the exact size`.
- Browser-verified in real Chromium: `lucky` body bg `rgb(244,249,234)` + dog copy + `/themes/lucky/`
  sprites; `fantasy` unchanged (`rgb(8,9,12)`, ember, fantasy sprites).

### Prior: Soft-lock fix — surface a better bag item, the player decides (kept)
**The game SURFACES a better bag item and escalates guidance, but the PLAYER is the
only one who ever equips.** A player who equips badly can stall
forever (the projection stays finite-but-slow, so no wall fires); the fix is guidance only. New leaf
engine module `advisory.ts` exposes `getSlotUpgradeAdvisory(state, slot)` and
`getStallAdvisory(state, stageBeganAtMs?)` (severity `none → hint → nag`, requiring BOTH a stall
window and a strictly better bag item). Both rank candidates with the ONE shared metric
`powerScore`/`scoreWithEquip`, now moved into the leaf `gear-stats.ts` and consumed by the sim — so
the advisory can never recommend a downgrade. Stall detection adds **no persisted state**: `main.ts`
tracks the stage anchor in memory and passes it via `render(state, { stageBeganAtMs })`; **schema
stays v4**, `DEFAULT_SAVE_KEY` unchanged. `/web` shows a quiet badge (any upgrade) and, at `nag`, a
prominent inline "Bag check" callout whose single button dispatches the EXISTING `equip` action.
Nothing is ever auto-equipped.

Gates (that session — historical snapshot):
- `npm run typecheck` → clean for all three workspaces (`engine-core`, `web`, `sim`).
- `npm run test` → **141 passed (12 files), exit 0** (new `advisory.test.ts`, 12 tests).
- `npm run sim` → **PACING OK (exit 0).** Canonical sections **byte-identical** to pre-change
  (`diff` clean): canonical soft 6.21 / hard 50.25; all-seed soft 5.76–6.21, hard 45.01–46.80;
  drops-primary net 97.4–98.6%.
- `npm run build` → exit 0. `npm run smoke` → **14 passed, exit 0** (new advisory test).

### Prior: Option A gold retune (kept)
**Gold is now a MINOR but LEGIBLE lever, and the every-3-levels milestone
system genuinely fires — `npm run sim` is GREEN with no threshold, tolerance, canonical range,
or assertion touched.** The cost curve flattened (`upgradeCostBase` 10→**3**, `upgradeCostGrowth`
6→**1.25**) and each level became a smaller nudge (`upgradeStatMultiplier` 1.05→**1.01**), so a run
affords a steady stream of cheap levels on the weapon's per-stage lifetime (measured per-item peak
**8–12** levels, was 2–7) and **17–23 milestones fire per run** (was 0–2). Gold stays minor because
`gearGrowth` (1.283) still dwarfs `upgradeStatMultiplier` (1.01): a newer drop beats any affordable
upgrade stack, so the weapon keeps tracking the stage and most upgrade power is reset by each equip.

Gates (that session — historical snapshot):
- `npm run typecheck` → clean for all three workspaces (`engine-core`, `web`, `sim`).
- `npm run test` → **126 passed (10 files), exit 0** (no test edited; no balance value was hard-coded).
- `npm run sim` → **PACING OK (exit 0).** Canonical soft 6.21 / hard 50.25 (inside comfortable);
  all-seed soft 5.76–6.21, hard 45.01–46.80; drops-primary net 97.4–98.6%; per-slot upgrades
  w86–101 / r0–13 / n0–7; milestones 17–23 (w16–19 / r0–4 / n0–2); per-item peak level 8–12;
  free-path share 0.4%.
- `npm run build` → exit 0. `npm run smoke` → **13 passed, exit 0**.

### Prior: Phase C (per-slot upgrades + derived milestones, kept)
**Gold is an ALLOCATION decision (Phase C): per-slot upgrade controls + derived milestone
steps; `npm run sim` is GREEN with no threshold changed.** `/web` renders one upgrade control per
equipped slot (weapon keeps `upgrade-btn`); every 3rd upgrade level in an item crosses a
**milestone** that grants a small boost to that slot's *existing capped* stat and shows a
non-blocking flourish + `★ ×N` card badge. The bonus is **derived from `upgradeLevel` on read**, so
the save schema stays **v4**. The sim's economy policy is slot-aware (buys the affordable upgrade
across all four slots with the largest real power gain, skips zero-gain upgrades).

Gates (that session — historical snapshot):
- `npm run typecheck` → clean for all three workspaces (`engine-core`, `web`, `sim`).
- `npm run test` → **126 passed (10 files), exit 0**.
- `npm run sim` → **PACING OK (exit 0).** Canonical soft 6.18 / hard 49.54 (inside comfortable);
  all-seed soft 5.72–6.18, hard 43.90–45.88; drops-primary net 98.3–99.6%; eq/stage 0.82–0.96.
- `npm run build` → exit 0. `npm run smoke` → **13 passed, exit 0**.

### Prior Phase C changes
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
- **The milestone interval is 3 and now actually fires.** With the Option A curve the per-item
  `upgradeLevel` peaks at 8–10 across the sweep seeds, so interval 3 crosses 2–3 times per item
  lifetime; interval 5 would still be a stretch. Milestones are still bounded by the caps (below).
- **The weapon still absorbs most upgrades; the per-slot split is genuine, not a policy bug.**
  Measured per-slot upgrades are w91–112 / r0–9 / n0–7. The weapon wins the greedy comparison
  because it is the only *unbounded* lever and its next level is always cheap (it resets to 0 each
  equip); rings/necklaces reach their caps early (crit multiplier saturates by item level ~4, single
  ring crit chance by ~15) so an upgrade there often scores exactly zero gain and is skipped. Seeds
  that get a ring drop early with cap headroom DO invest in it (max ring level up to 9, r3
  milestones); seeds whose only ring drops late get zero ring upgrades. This is the designed
  ceiling, not a tuning miss.
- **The Shiny reward is bounded by the hard window.** The per-claim frenzy wall budget is
  `D × (M−1) = 12 s` (test-pinned); the 151 s cadence keeps the bounded rewards inside the canonical
  hard window's slack. A longer/bigger frenzy or a larger
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
See `decisions.md` for the locked entries. The current session landed **per-enemy enemy curves (the
12-enemy roster in `content.ts`, replacing the factor/canonical-curve approach), T6 themeable
animation, engine-emitted enemy taunts on a separate RNG channel, and F1 tap-to-equip** — on top of
the previously authoritative 2026-09-28 "Soft-lock fix: surface a better bag item, let the PLAYER
decide (never auto-equip)" and "Audit corrections: sim policy-sensitivity diagnostic + documented
unarmed projection degeneracy", the 2026-09-27 "Phase C — gold becomes an allocation decision",
"Option 3: Shinies felt but WALL-NEUTRAL", and "Fix a real wall-projection bug" (the leak fix, kept),
the Phase 3 sim-policy/caps and /web splash entries, "Break the `state ↔ achievements` import cycle
via a `gear-stats.ts` leaf", "Golden Events (Shinies): spawn/claim/boost engine slice, save v4",
"Save schema v3", and the 2026-09-26 economy reversal.

## Next
1. Build the Expo/RN port by supplying a renderer + a `SaveRepository` and a host clock driving
   `advance()` — see README "Porting to Expo".
2. Optional polish: compact numeral formatting (large late-game values print as full integers),
   tap/feedback cosmetics, and a bulk-sell action (a real engine action, not yet built — bag
   *ordering* already ships strongest-first).

---

_Generated by `npx cli-five` on 2026-09-26._
