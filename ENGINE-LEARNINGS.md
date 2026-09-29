# Engine Design Learnings

> Durable, transferable lessons from building **auto-auto-clicker** — a browser idle/clicker
> whose simulation and economy live in a standalone, platform-agnostic `engine-core`
> TypeScript package, proven by a headless pacing simulation and headed for an Expo/React
> Native port.
>
> **What this is:** a distillation of the *non-obvious* choices that repeatedly paid off (or
> repeatedly bit), written so an engineer or agent starting a **brand-new idle/clicker game on
> the same engine** does not have to rediscover them. It is NOT a history log and NOT a
> feature list.
>
> **How it is grounded:** every lesson cites the concrete decision, measurement, or defect it
> came from in this repo (`decisions.md`, `histories/*.md`, `STATE.md`, `NOTES.md`, `README.md`,
> `agent-diary.md`). Where something is uncertain, stale, or a known open gap, that is said
> explicitly rather than smoothed over.
>
> **Portability caveat (read first):** the specific numbers here — `±20%`, `BOSS_TIMER_MS`,
> soft ≈6 min / hard ≈54 min, the 12-enemy roster, the exact caps — are this project's
> *acceptance criteria*, not universal constants. The transferable part is the **discipline**
> (hard gates, one source of truth, identity/display separation, derived-only saves), not the
> values. Re-derive the values for a new game; keep the discipline.

---

## Table of contents

1. [How to use this document](#1-how-to-use-this-document)
2. [The engine/host boundary and the purity contract](#2-the-enginehost-boundary-and-the-purity-contract)
3. [Identity vs display separation](#3-identity-vs-display-separation)
4. [Derived-state doctrine](#4-derived-state-doctrine)
5. [Determinism and RNG channels](#5-determinism-and-rng-channels)
6. [The pacing proof as a HARD gate](#6-the-pacing-proof-as-a-hard-gate)
7. [Economy design](#7-economy-design)
8. [Content / roster design](#8-content--roster-design)
9. [Theming as a proven seam](#9-theming-as-a-proven-seam)
10. [Testing and verification doctrine](#10-testing-and-verification-doctrine)
11. [Save-schema discipline](#11-save-schema-discipline)
12. [Process and coordination lessons](#12-process-and-coordination-lessons)
13. [Known gaps and honest uncertainties](#13-known-gaps-and-honest-uncertainties)
14. [Checklist for the next game](#14-checklist-for-the-next-game)

---

## 1. How to use this document

- **Building the same kind of game?** Read §2–§8 before writing code; they define the shape
  that makes everything else cheap.
- **Reviewing or extending?** Read §6 and §10 first — they are the acceptance-criteria and
  proof disciplines that keep a green check honest.
- **Porting to Expo/RN?** §2 and §11 are the port contract; the engine changes *not at all*
  (README "Porting to Expo").
- **Each lesson is `Rule / Why / Evidence`.** The Evidence line is the reason to trust it —
  if you cannot reproduce the evidence in your game, the rule is not yet earned.

---

## 2. The engine/host boundary and the purity contract

### 2.1 The engine is the permanent artifact; the host is disposable

**Rule.** Put *all* simulation, rules, content, and balance in a dependency-free `engine-core`
package. The browser (or React Native) layer is a thin projection that owns the clock, I/O,
and pixels — never rules.

**Why.** It makes the engine headlessly testable, keeps a fast deterministic pacing proof
possible, and lets the renderer be deleted and rewritten for a new platform without touching
the game. This project's stated whole point: "The engine is the permanent artifact. The web UI
is disposable."

**Evidence.** `README.md` architecture + "Porting to Expo"; `PROJECT.md` goal; `AGENTS.md`
constraints. `web` holds no balance numbers and never mutates state (`NOTES.md` "No balance
numbers in /web"). `sim/` is a pure in-memory tick loop that imports only the engine root and
references no persistence API.

### 2.2 Purity is a test-enforced contract, not a comment

**Rule.** Forbid DOM, `fetch`, timers, `Date.now()`, `Math.random()`, and `fs` in `src/`.
Enforce it with a source-scanning test and a `tsconfig` that cannot silently inject globals.

**Why.** A "the engine cannot do X" claim with no test is just prose, and it will rot. It did:
the README claimed engine-core had no DOM lib, but `tsconfig.json` had no `lib`, so TypeScript
default-injected DOM and `document.title` **typechecked inside the engine**.

**Evidence.** `engine-core/tests/boundary.test.ts` scans `src/` and `save/` with `node:fs`;
`tsconfig.json` now sets `"lib": ["ES2022"]`. Probes (`export const probe = document.body`,
`import { useState } from 'react'`) fail after the fix (orchestrator history 2026-09-25;
README purity contract). The scanner strips comments and import-specifier strings, so a
comment merely *naming* `document` passes — keep that probe alive for any future edit.

### 2.3 Impure work is isolated behind a pure seam, not banned

**Rule.** When the engine needs to know an impure fact (e.g. "does this art file exist at the
declared size?"), split it: an impure CLI layer *reads* the fact, and a pure `src/` function
*compares* measured facts to the contract.

**Why.** This is how you verify real filesystem/PNG facts without letting `fs` into the engine
(which would break the boundary and the RN port).

**Evidence.** `scripts/png.ts` reads PNG signature + IHDR width/height with zero deps;
`scripts/check-theme.ts` does `node:fs`; the **pure** `validateAssetMeasurements()` lives in
`src/theme/contract.ts` and is fed the measurements (decisions.md T4; orchestrator history
2026-09-28).

### 2.4 The host owns the clock; the engine is a pure function of state

**Rule.** The engine exposes `advance(state, deltaMs)` and `applyAction(state, action)`.
Neither knows a tick size, schedules anything, or reads a clock. The host accumulates real time
into **fixed steps** and calls `advance` while a whole step is available, with a catch-up cap.

**Why.** Identical input → identical output; the offline/live paths share one simulation; and
RN can drive the exact same loop with a different frame primitive.

**Evidence.** `README.md` "The simulation contract": `web/src/main.ts` drives fixed 100 ms
steps with a 10-step catch-up clamp; `sim` drives the identical 100 ms step so its pacing
matches live play. Offline replay uses the *same* `advance` in bounded 1000 ms steps capped at
8 h, auto-DPS only, stopping at a pending choice. `advance` guards non-finite/`<=0` deltas and
returns the **same** state reference.

### 2.5 One-way workspace dependencies, and keep the module graph acyclic

**Rule.** `web → engine-core`, `sim → engine-core`, never the reverse. Inside the engine,
dependency edges point one way; a leaf module must not import a module that imports it.

**Why.** A cycle "works" at runtime only because both references resolve at call time — it
makes import order load-bearing and couples modules with no reason to know each other.

**Evidence.** A real `state ↔ achievements` ES-module cycle shipped (functional only by
call-time resolution) and was fixed by extracting the leaf `gear-stats.ts` (imports only
`balance`/`content`/`types`). Verified with a DFS over relative imports → 0 cycles, and the fix
was proven a no-op by **byte-identical `npm run sim` output** (decisions.md 2026-09-27; coder
history).

**Corollary — put a function on the importing side.** When the live per-enemy wrappers needed
`BALANCE` (from `balance.ts`) *and* the roster (in `content.ts`), they had to live in
`content.ts`, because `content.ts` already imports `balance.ts`; the reverse would create a
`balance ↔ content` cycle (orchestrator history 2026-09-28).

### 2.6 The public entry is one root export (plus one narrow subpath)

**Rule.** Hosts import the package root (`engine-core/src/index.ts`), never deep files. Keep a
single `save` subpath for the persistence adapter. Keep the `"types"` condition first in the
`exports` map.

**Why.** It bounds the coupling surface and prevents a host from depending on internals that
are free to move.

**Evidence.** `README.md` layout; coder history notes the deliberate side-effect import that
makes `npm run typecheck` fail if workspace resolution regresses; and the advice to keep
`"types"` first or resolution picks the wrong target.

---

## 3. Identity vs display separation

### 3.1 Persisted identity must never be themeable

**Rule.** Treat these as **identity**, owned by code and persisted/asserted by the sim:
achievement `id`s, gear `definitionId`s, `GearSlot` values, enemy ids, `ShinyKind` values, and
the save-schema version. Everything human-readable is **display**, owned by a theme. A theme
may supply copy *keyed by* an identity, but can never rename or create one.

**Why.** Identity is in saves and in the pacing assertions. If a theme could change it, a
theme swap would corrupt saves or move the economy. This split has "saved this codebase once"
already (orchestrator history).

**Evidence.** `AGENTS.md` / `PROJECT.md` constraints; README Theming. `achievements.ts` keeps
`id` + pure `unlocked` predicate in code and resolves `title`/`description` from
`ACTIVE_THEME.achievements.catalog[id]`; a missing entry **throws** rather than rendering
blank. The enemy roster supplies names/catchphrases keyed by the stable engine id, and the
renderer throws loudly (naming theme + id) on a missing entry.

### 3.2 Identity safety is a KEY check, not a value check

**Rule.** A validator that forbids "identity tokens in themes" must flag an identity token only
when it appears as a **property key** in an unsanctioned location, not when it appears as a
value.

**Why.** `theme.slots.noun.weapon = 'weapon'` is legitimate (its value equals a `GearSlot`
token). Scanning values false-positives on every slot label.

**Evidence.** decisions.md T3 / coder history 2026-09-28: identity tokens are allowed as keys
only in the sanctioned copy-keyed locations (`slots.display/noun/card/empty/stats`,
`shiny.kind`, `achievements.catalog`); anywhere else is a rename attempt.

### 3.3 A skip-list in a validator creates a blind spot — mirror the sibling that has a pass

**Rule.** When you add a container to a validator's "dynamic/id-keyed, don't walk unknown keys"
skip-list, diff its validation against a sibling you already validate by hand — and add a
dedicated completeness pass. An allow-list registration is not validation.

**Why (repeated twice).** Registering `achievements.catalog` in `DYNAMIC_CONTAINERS` silently
disabled the unknown-key walk for that subtree; the same then happened to `enemy.roster`. A
theme missing a roster entry (or with a bogus key / empty phrase list) **passed** `theme:check`
while the renderer **throws** — and `main.ts` has no try/catch around it, so it would freeze
the rAF loop. The fix was a dedicated completeness pass mirroring the achievement catalog.

**Evidence.** decisions.md 2026-09-28; orchestrator history "logged twice"; T6 animation's
required `Theme.animation` field similarly only got a 4-line allow-list registration, so
`theme:check` still does **not** validate animation cues (unit tests do) — a documented gap.

---

## 4. Derived-state doctrine

### 4.1 Persist source fields only; compute derived values on read

**Rule.** The save stores only inputs (`gold`, `stage`, `enemyHp`, `damageCarry`, gear as
`{id, definitionId, itemLevel, upgradeLevel}`, meta/choices/events). Every derived quantity
(gear stats, effective DPS/click, max HP, milestone bonuses, cache gold) is a pure getter.

**Why.** An engine/balance change then cannot drift a stale copy on an existing save. This
doctrine is what has kept the save schema stable across almost every feature since.

**Evidence.** Save v2 refactor: dropped `baseAutoDps`/`baseClickDamage`/`enemyMaxHp` and
per-instance `dps`/`clickDamage` (NOTES.md, `agent-diary.md` 2026-09-26). Since then:
- enemy identity derives from `combat.stage` (schema stays v4);
- milestones derive from `upgradeLevel` (`floor(level / 3)`, no persisted field);
- the stall anchor is host-owned in memory (`stageBeganAtMs` via render context);
- taunt rolls derive from `seed`/`totalPlayedMs`;
- a Shiny `drop` reward adds no field (it is a normal bag `GearInstance`).

### 4.2 A persisted copy of a derived value is a bug waiting for a formula change

**Rule.** If a persisted field is a pure function of other persisted fields, it *must* be
recomputed on load — or, better, deleted from the save entirely.

**Why.** `loadGame` did not re-derive `GearInstance.dps`, so after a balance change an old
save loaded with a stale cache ~32× wrong, self-healing only on the next equip/upgrade.
Recompute-on-load was first used as a patch (kept the schema shape *and* the version); the
structural fix was v2's "stop persisting derived values." **If you can afford the schema bump,
delete the field; if you cannot, at least recompute it on load.**

**Evidence.** decisions.md / orchestrator history 2026-09-26; NOTES.md "Save schema v2".

### 4.3 Fields adjacent to derived values change meaning silently

**Rule.** Watch persisted fields that sit next to a derived one. When the derivation changes,
the persisted value's units quietly change.

**Why.** `combat.enemyHp` is a live value; its *max* is derived from `stage`. Changing the
HP curve means a pre-change save can have `enemyHp` above the new max. The renderer clamps the
bar and HUD text so nothing lies on screen, and the next kill respawns at the new max
(self-healing) — but the record must say so.

**Evidence.** Per-enemy-curves decisions.md trade-offs; reviewer history 2026-09-28.

---

## 5. Determinism and RNG channels

### 5.1 All randomness flows through one seeded stream persisted in state

**Rule.** No `Math.random()`. Use a small seeded PRNG (mulberry32) whose state travels in
`GameState.meta.rngState`; persist it so a reload continues the exact stream.

**Why.** Reproducibility is what makes the pacing proof checkable and save-stable.

**Evidence.** `AGENTS.md`; `README.md` save model; `rng.ts`.

### 5.2 Fix the number and order of draws per event

**Rule.** Loot consumes **exactly two** `nextRng` draws per kill, in a fixed order (drop-chance
roll, then slot roll). Document draw order as load-bearing.

**Why.** A missing/extra draw shifts the entire downstream stream; the sim then moves for
reasons unrelated to the feature.

**Evidence.** coder history 2026-09-27 (loot draw order); the Shiny spawn consumes **exactly
one** draw and thus perturbs the loot stream *on purpose* — and even a **zero-effect** Shiny
can move a run by several minutes purely via that draw and its schedule
(coder history 2026-09-27).

### 5.3 Cosmetic randomness rides a separate derived channel

**Rule.** Any cosmetic randomness (taunt/catchphrase selection, VFX variation) must use a
**separate derived channel** that never reads or writes `meta.rngState`, e.g.
`nextRng(seed ^ floor(totalPlayedMs) ^ imul(discriminator, 0x9e3779b1))`.

**Why.** Threading cosmetics through the main stream shifts the loot stream, so adding a line
of flavor text could move every pacing number. This is the reusable pattern.

**Evidence.** decisions.md F1/F2/F3; coder history 2026-09-28. Verified three ways: code walk,
a non-frozen twin probe (`meta.rngState` byte-identical under taunt hammering), and a
byte-identical sim diff. The engine emits a stable `{enemyId, kind, phraseIndex}` — never
display text — so the theme owns wording.

### 5.4 Never make a per-hit RNG roll part of the projection

**Rule.** Model crit as an **expected-DPS multiplier**, not a per-hit roll.

**Why.** `getProjectedKillMs` must stay exact and RNG-free against `BOSS_TIMER_MS` /
`HARD_WALL_PROJECTED_KILL_MS`; a per-hit roll would make wall decisions stochastic and the
pacing proof unprovable.

**Evidence.** decisions.md "Multi-slot gear … expected-DPS crit model"; NOTES.md "luck beats a
boss is explicitly deferred" (turning the wall into an actual-fight check trades away pacing
determinism).

---

## 6. The pacing proof as a HARD gate

### 6.1 The numbers are acceptance criteria, not tuning knobs

**Rule.** `npm run sim` must print `PACING OK` and exit 0. The `±20%` tolerance,
`BOSS_TIMER_MS`, `HARD_WALL_PROJECTED_KILL_MS`, the canonical comfortable ranges, and the
drops-primary gate are **acceptance criteria**. Never widen them to make a number pass — report
measured failure instead.

**Why.** A gate you can move to fit the result is not a gate. This rule is encoded as an
explicit prompt instruction and held under pressure.

**Evidence.** `AGENTS.md` constraints; decisions.md revisit triggers repeatedly ("never widen
the ±20 % tolerance, never re-neuter drops"); the 2026-09-26 reversal honesty guardrail.

### 6.2 Multi-seed, and never downgrade a primary signal to a warning

**Rule.** Assert every seed (`SWEEP_SEEDS = [12345, 1, 999, 424242, 20250925]`). If a core
metric is worth measuring, it is a hard assertion or it is dropped — never an "informational
WARNING."

**Why.** Making the seed sweep informational let a fragile result look green (`PACING OK`, exit
0) while **4/5 seeds failed**. Hardening it to an all-seed assertion surfaced the true state.

**Evidence.** orchestrator history 2026-09-25. The reviewer later extended the shipped tune to
**70 seeds, all PASS**, worst margin 6.47 min above the hard floor — the robustness claim was
demonstrated, not asserted.

### 6.3 Capture a baseline before an engine change; require an EMPTY diff for neutral changes

**Rule.** Before any engine change whose intent is neutral, capture the `npm run sim` baseline
and require the new output to `diff` **empty**. For an intentional change, measure the drift
explicitly and re-prove every seed.

**Why.** It converts "this refactor shouldn't change anything" from a hope into a checkable
proof. It is the single highest-leverage discipline in the repo.

**Evidence.** Adopted as a standing proof obligation (orchestrator history); used for the
advisory metric move, the cycle-breaking refactor, T1 event plumbing, and T2 text extraction —
each "byte-identical" diff. Where the change was *meant* to move pacing (live per-enemy
profiles), the drift was measured: canonical hard 50.25 → 49.15, all seeds still passing.

### 6.4 A green check proves the assertion — not the property you believe it stands for

**Rule.** Ask "what is the harness NOT varying?" and measure policy/parameter sensitivity
before trusting a green check.

**Why.** An adversarial audit showed wall timing is heavily **policy-dependent**: canonical
greedy 5.63–6.22/50.60–55.52; equip-only 5.66–6.28/40.05–56.54; upgrade-lazy
5.53–6.13/50.48–55.53; a passive clicker 3.73–4.11/26.07–26.83 (walls at stage 15 — the
*unarmed degeneracy*); and a naive
first-in-bag equip player **never** reaches either wall (soft-locks at stage 39). "Soft ≈6 min /
hard ≈54 min" is a property of one scripted playstyle, not a guarantee about the game.

**Evidence.** Policy sensitivity diagnostic added to `npm run sim` (informational only, never
gates), `isUnarmed` getter + `projection.test.ts`; README "Policy sensitivity".

### 6.5 A metric can prove the wrong thing

**Rule.** Verify that your headline metric actually measures the behavior you care about, and
that the harness policy can *reach* the new code.

**Why (two examples).** (a) The `dropGross` metric telescopes to the final item level, so the
drops-primary gate was frequency-insensitive and passed even at `dropChance 0.3` — proving
end-state dominance, not loot-stream behavior; fixed by charging the equip reset loss to **gold**
and adding an equips-per-stage sanity guard. (b) Phase 2 "passed" the sim by tuning drop
weights while the sim's DPS-only policy **never equipped a ring or necklace**, so the green
check exercised none of the new code.

**Evidence.** reviewer history 2026-09-26; orchestrator history 2026-09-27; README
power-attribution ledger.

### 6.6 Demonstrate harness coverage by perturbation, not assertion

**Rule.** "The harness now covers X" must be shown by zeroing/altering X and observing a
shift.

**Why.** Otherwise you are re-asserting the thing under test. Here zeroing
`BALANCE.ring.*`/`necklace.*` moved canonical soft 5.97 → 6.55 min, proving the equip policy now
actually reaches and is *sensitive to* rings/necklaces.

**Evidence.** decisions.md Phase 3; reviewer history.

### 6.7 A suggested starting point is a hypothesis; when a subagent contradicts you, reproduce both

**Rule.** Ask for the sweep that tests a proposed number. When an implementing agent's evidence
contradicts yours, reproduce both before choosing a side.

**Why.** The orchestrator's suggested parameter band was proven wrong by a subagent (it would
break drops-primary because a ×1.05/level stack reaches the drop's ×1.283 in ~6 levels). A
later audit produced equip-only numbers that contradicted the orchestrator's own probe; the
discrepancy was real and came down to equip policy — and resolving it surfaced the soft-lock
finding.

**Evidence.** orchestrator history 2026-09-27 and 2026-09-28.

### 6.8 "Robust by making an input inert" is a product decision, not a win

**Rule.** When a fix makes a metric robust by hollowing out a gameplay lever, surface the
trade-off explicitly.

**Why.** The first robust build achieved seed-invariance by making drops power-neutral — which
removed the "gear drops → upgrade gear" lever the whole game is about. The later drops-primary
reversal restored the lever and accepted real sampling variance.

**Evidence.** orchestrator history 2026-09-25; NOTES.md economy reversal.

### 6.9 If a feature must be tuned to near-invisibility to pass, suspect a design conflict

**Rule.** Treat "it only passes when the feature barely fires" as a signal to investigate the
engine, not to crush the knob.

**Why.** A frenzy that passed only at ~0.1% uptime was treating a symptom; the real cause was a
buff laundering a permanent wall-pass through the projection. The fix was structural
(project against sustained, boost-excluding DPS), which turned a knife-edge problem into a
bounded one.

**Evidence.** orchestrator history 2026-09-27; decisions.md "Fix a real wall-projection bug."

---

## 7. Economy design

### 7.1 Allow exactly one unbounded exponential lever

**Rule.** Pick one primary lever that grows exponentially (here: gear **item level**,
`gearGrowth = 1.2832`) and make it the only unbounded one. Make every secondary lever bounded
by clamping its bonus **on the aggregate**, in the state getters.

**Why.** An exponential *item* times a *multiplicative* bonus is explosive (`gearGrowth^(itemLevel-1)`
applied to a multiplier — an item-level-50 ring contributed ~2×10⁴). Clamping the aggregate
means every consumer (sim, web, projection) inherits the bound for free.

**Evidence.** `CRIT_CHANCE_CAP = 0.75`, `CRIT_MULTIPLIER_CAP = 1.18`, `POWER_MULTIPLIER_CAP =
0.02`, `GOLD_MULTIPLIER_CAP = 0.25` in `gear-stats.ts`; the realized bounded lever saturates at
≈ **+16% DPS** (≈10% pacing effect); reviewer verified finite at itemLevel 1e12 (Math.pow →
Infinity clamped).

### 7.2 Drops-primary: the primary lever should be loot, not a currency

**Rule.** If the fantasy is "loot drives power," make drops carry the large majority of net
power growth and gate that per seed.

**Why.** With gold-funded upgrades compounding, drops stop being the power jump. Keeping
`goldGrowth ≈ 1.0` (flat income) and each upgrade a small nudge (`upgradeStatMultiplier = 1.01`)
preserves the invariant `1.01^L > 1.283` needs L≈25 — so a newer drop beats any affordable
upgrade stack and each equip resets the gold-funded level, preventing a second exponential.

**Evidence.** drops-primary gate (>50% of positive **net** log growth, per seed) plus an
equips-per-stage sanity guard; measured drops 97.3–98.6% net / 90.4–90.9% gross on the current
tune. Lowering `dropChance` toward 0.8 blows the soft range out to 2.33–8.75 min — drops are a
real lever, not cosmetic.

### 7.3 A new reward/threshold must be checked against the ACHIEVABLE range

**Rule.** Before shipping any reward or threshold keyed off a state value, measure whether that
value actually reaches it.

**Why (twice).** A milestone interval of 5 was **unreachable content** (per-item peak
`upgradeLevel` was 2–7 because costs grew ×6 against flat income); lowering to 3 made it fire.
A guaranteed same-stage **weapon** drop leapfrogged the equipped weapon and pushed the wall
stage 50 → 59 (~100 min) — replaced by a ring-only drop on the designed bounded lever.

**Evidence.** orchestrator history 2026-09-27; coder history; decisions.md Option A / Option 3.

### 7.4 Flat, legible cost curves; free paths grant levels, not stage-scaled currency

**Rule.** Keep the gold cost curve flat and legible (`upgradeCostBase = 3`,
`upgradeCostGrowth = 1.25`), and make free-path grants a **fixed number of upgrade levels**, not
a stage-scaled gold amount.

**Why.** Stage-scaled gold injected "enormous gold at high stages" (`goldReward` grew ~1.45^stage),
making pacing hypersensitive; and a steep cost curve made upgrades functionally absent (~2
levels/run). There must always be a working free path — never a hard paywall.

**Evidence.** coder history 2026-09-25 (RCA note); decisions.md Option A (`wait`/`watchAd` grant
2/4 upgrade *levels*); `PROJECT.md` "never a hard paywall with no free path."

### 7.5 Attribute "net" as its own gross minus the loss that lever actually suffers

**Rule.** When decomposing power growth between levers, charge each loss to the lever that
caused it.

**Why.** The first ledger charged every equip's reset loss to *drops*, understating them as 85.8%
when the true net drop share was ≈100%; and it labelled a gross figure as net. Correct
accounting (reset loss → gold) made drops genuinely primary and the gate meaningful.

**Evidence.** reviewer history 2026-09-26; decisions.md / README ledger.

### 7.6 Bound a temporary buff structurally

**Rule.** Prefer a structural bound over a tuned magnitude. A burst running `D` ms at multiplier
`M` saves exactly `D × (M − 1)` ms of wall-clock **independent of stage and DPS** — pin that
product in a test.

**Why.** It converts a fragile "how big before it breaks pacing" problem into a predictable
budget. Here the per-claim budget is 6 s × 3 → **12 s**, and the cadence (151 s) was *lengthened*
so the bounded rewards fit inside the canonical hard window's slack rather than eating it.

**Evidence.** `shiny.test.ts` wall-budget guard; decisions.md Option 3; coder history 2026-09-27.

---

## 8. Content / roster design

### 8.1 One source of truth per entity — no dual representation, no scaling factors

**Rule.** Each content entity (enemy, gear) owns its real numbers. Never keep descriptive
metadata *plus* a live factor scaling a global curve; one of the two will be inert and mislead
the next editor.

**Why.** The roster shipped for a while as 12 enemies with genuinely distinct catalog numbers
*and* live `hpFactor`/`goldFactor` scaling a canonical curve — but only two fields were
mechanically real, and the other eight did nothing. The user asked for real per-enemy curves;
the factor approach was deleted entirely.

**Evidence.** decisions.md "Per-enemy curves replace the factor approach"; `enemyMaxHp(stage)`/
`goldReward(stage)` now compute from the standing enemy's own `baseHp`/`hpGrowth`/`baseGold`/
`goldGrowth` and its own boss multipliers; `hpFactor`/`goldFactor`/`bossStageInterval` deleted.

### 8.2 A round-robin or repeating roster imposes a TIGHT growth band

**Rule.** If the live stage curve is the product of a repeating roster's growth rates, all
roster growth rates must sit in a narrow band or the stage sequence zig-zags and drifts the
pacing proof.

**Why.** Shipped band: **1.4273–1.4336** (span 0.0063; stage-50 divergence only 1.24×). The
*original* descriptive metadata (1.39–1.46) diverges ~30× by stage 50 — which is exactly why it
never worked as authored. Distinctness must therefore live in **base values** (`baseHp` 24–29,
`baseGold` 4–7) and **boss multipliers** (HP 2.033–2.514), not in a wide growth spread.

**Caveat for a new game.** The specific band is a function of this roster size (12) and the
round-robin selection; a different roster size or selection rule needs its own measured band.

**Evidence.** planner + coder + diary (per-enemy curves); `STATE.md`; ~4,415-candidate measured
search produced the shipped set.

### 8.3 Keep entities stage-derived so the save schema never grows

**Rule.** Prefer selecting content entities as a pure function of persisted progress
(`enemyForStage(stage) = roster[(stage-1) % 12]`) over drawing them with RNG or persisting a
mapping.

**Why.** Zero RNG and zero new persisted state keeps the schema stable, and a reload reconstructs
exactly the same entity. Boss **cadence** stays globally derivable from stage (`isBoss`, every
10th) so projection/wall logic is not enemy-dependent; only boss **size** is per-enemy.

**Evidence.** README Theming / save model; decisions.md.

### 8.4 Flooring makes "distinct" numbers collapse — measure the observable range

**Rule.** With integer flooring and a flat base, distinct authored values can produce identical
payoffs. Check the *observable* set, not the authored set.

**Why.** `goldGrowth = 1.0` for all 12 and `goldReward` floored, so the roster's `baseGold` values
`{4,5,6,7}` give four observable non-boss payouts — 8/12 enemies pay exactly 5. (The factor era
had six authored `goldFactor`s that collapsed to the same four; historical only.) Gold
distinctness is an open gap needing the flat gold curve addressed first.

**Evidence.** decisions.md per-enemy-curves trade-offs; reviewer history.

---

## 9. Theming as a proven seam

### 9.1 An abstraction with one implementer is a guess — build the second implementer

**Rule.** Do not trust a seam until a **second, real** implementation exercises it.

**Why.** T5's second theme (`lucky`, a light dog-themed palette) exposed three genuine seam
failures that no amount of fantasy-only testing could reveal:
1. the browser smoke suite was hard-wired to fantasy literals, so "gates pass after a theme
   swap" was impossible;
2. the palette did not cover a **light** theme — the arena vignette, boss glow, toast plate,
   frenzy pill, and accent badges were hard-coded `rgba()` literals;
3. a unit test pinned the literal title `'First Blood'`.

**Evidence.** orchestrator history 2026-09-28; decisions.md T5. Fixes: smoke derives every
expected string/URL from `ACTIVE_THEME`; literals tokenised via `color-mix`; the test resolves
the title.

### 9.2 A contract + validator that fails loudly is the authoring checklist

**Rule.** Declare per-group limits and a required surface, and validate them at runtime,
reporting **every** problem at once with a path, a kind, and an actual-vs-allowed message.
Derive limits from measured usage with headroom; never invent them.

**Why.** Authoring a theme becomes a checklist rather than a scavenger hunt, and genuinely
broken copy ("someone pasted a paragraph") fails loudly.

**Evidence.** `theme/contract.ts` `LIMITS`: label 48 (observed 22), chrome 120 (85),
achievement-title 64 (35), achievement-description 200 (80), prose 240 (139), catchphrase 140
(66), color 64 (7). `validateTheme` never throws, reports all problems, and exits non-zero from
`npm run theme:check`. Limits are raised deliberately (with updated rationale), never loosened
to pass.

### 9.3 A required new theme field is not free

**Rule.** Adding a required field to the `Theme` type can break the validator's unknown-key walk
and force `theme:check` to reject the new section. Either validate the new section fully or keep
it out of the contract.

**Why.** `Theme.animation` shipped as a required field but only got a **4-line allow-list
registration**; `theme:check` therefore validates *nothing* about animation cues, and a bad cue
`slot` survives every gate and silently resolves to a broken image at runtime. The unit suite
covers it, and `ACTIVE_THEME` is compile-time, so residual risk is low — but the authoring-tool
blind spot is real and documented.

**Evidence.** decisions.md T6; README honest caveat; orchestrator history.

### 9.4 Reach CSS without breaking accessibility

**Rule.** Apply theme colours through an injected `:root` `<style>` rule, **not** inline styles
on the root element, and keep the stylesheet's `:root` block as a documented pre-boot fallback.

**Why.** Inline styles out-rank `@media (prefers-contrast: more)` and silently break
high-contrast users. The contrast block's selector was raised to `:root:root` so it
out-specifies the injected rule.

**Evidence.** decisions.md T4; differential Playwright fingerprint byte-identical before/after;
a `#123456` mutation probe proved the injected rule (not the fallback) is effective.

### 9.5 Don't ship the validator spec into the host bundle

**Rule.** Do not re-export the validator/spec table from the package root if the host only needs
the theme object; import the deep path from tests/scripts.

**Why.** Pulling the 159-entry spec table in grew the Vite bundle 20 → 21 modules / +6.7 kB.

**Evidence.** coder history T3.

---

## 10. Testing and verification doctrine

### 10.1 Measure, don't assume — and make the measurement the deliverable

**Rule.** For emergent/numeric features, require a throwaway parameter-search or probe harness
(with its own acceptance criterion) before a design is called done.

**Why.** The planner's written economy numbers were the single highest-risk artifact and were
genuinely wrong: it claimed a scratch sim hit ~6.2/~52.9 min, but the real sim produced a
knife-edge exponential race (player ≈1.384×/stage vs HP 1.5×/stage) that passed on one seed and
missed ±20% by 30–75% on four others. Contrast the later economy work, where acceptance was
measured and multi-seed from the start — and held. A written estimate is not evidence.

**Evidence.** orchestrator history 2026-09-25; the `/tmp/opencode` throwaway harness convention
(never committed).

### 10.2 Prove tests non-vacuous by probing the failure

**Rule.** Every boundary/guard test must be demonstrated to fail when the thing it guards is
violated.

**Why.** A test that passes for the wrong reason is worse than none. Examples:
- injecting a save with `savedAt: Date.now()` surfaced a real "Welcome back" overlay that
  intercepted pointer events, forcing a future timestamp;
- the reduced-motion centering assertion was **probed to fail** (97.5px off) before the fix;
- the fs-boundary probes (`document.body`, `react`) fail when added.

**Evidence.** orchestrator/coder histories; decisions.md F1/F3.

### 10.3 Differential proofs for pure refactors

**Rule.** A refactor whose intent is "no output change" must be proven by an identical-output
capture, not just green gates.

**Why.** Gates would not catch a subtly reworded string or a shifted pixel. T2 captured
`#app` outerHTML+innerText across 12 scenarios (fake clock, fixed saves, fixed taps) and proved
**byte-identical** before/after; T4 fingerprinting proved colour identity across
normal/high-contrast/reduced-motion.

**Evidence.** `agent-diary.md` T2/T4; orchestrator history 2026-09-28.

### 10.4 Assert geometry, not just visibility

**Rule.** Where geometry is the point, assert the geometry.

**Why.** The reduced-motion test only asserted an element was visible, so it could not catch that
four elements sat in the right half of the screen (center 292.5 vs viewport 195) because a base
`transform: translateX(-50%)` was missing and the reduced-motion animation reset removed the
keyframe that supplied it. Fixed with a base transform + a ±2px centering assertion.

**Evidence.** orchestrator history 2026-09-28.

### 10.5 Every boundary claim needs a failing-when-violated test

**Rule.** "The engine cannot do X" ships with a test that fails if it starts doing X.

**Why.** See §2.2 — the no-DOM claim was prose until a probe proved `document.title`
typechecked inside the engine.

**Evidence.** orchestrator history 2026-09-25; `boundary.test.ts`.

### 10.6 Derive expectations from the engine; don't pin derived numbers

**Rule.** Tests assert through formula helpers / engine getters, or synthesize the state they
need. A hard-coded derived number is a maintenance liability every time the derivation changes.

**Why.** Six tests pinned old canonical numbers and had to be repointed when the live curve
changed; verified as a *repoint* (no comparator loosened), not laundering. The reviewer's
standing rule: never delete or weaken a behavioral assertion.

**Evidence.** coder history 2026-09-25/2026-09-28; reviewer history.

### 10.7 A weakened assertion is a bug, not a fix

**Rule.** If data no longer satisfies an assertion, fix the data or the assertion's subject —
do not lower the assertion.

**Why.** An `archetype` distinctness assertion was silently weakened from `toBe(12)` to
`toBeGreaterThan(1)` to accommodate reduced data. The correct fix was restoring 12 distinct
labels.

**Evidence.** reviewer history 2026-09-28.

### 10.8 Browser-test gotchas worth carrying forward

**Rule.**
- Clear `localStorage` in `beforeEach` — the app autosaves on boot.
- A continuously drifting element fails Playwright's actionability "stable" check; use
  `locator.dispatchEvent('click')` to exercise the listener.
- To inject a deterministic save, write a valid blob and set `savedAt` to a **future**
  timestamp so offline replay (and the "Welcome back" overlay) is ~0.
- `page.clock` drives `performance.now()` and `setTimeout`, which is what makes
  transient-frame/elapsed-time features testable without real sleeps.

**Evidence.** coder histories 2026-09-27/2026-09-28; orchestrator history 2026-09-28.

### 10.9 Know your typecheck gaps

**Rule.** Confirm which files the typechecker actually covers.

**Why.** In this repo `sim/` was transpile-only through `tsx` (later given a tsconfig), and
`web/tests/*` + `playwright.config.ts` were not typechecked. A test suite that compiles nothing
can hide type drift.

**Evidence.** reviewer history 2026-09-25; coder history (sim tsconfig added).

---

## 11. Save-schema discipline

### 11.1 One versioned blob behind an async repository interface

**Rule.** Persist exactly one serializable `SaveGame { version, savedAt, state }` through an
async `SaveRepository { load(); save(); }`. Keep content definitions separate from per-player
state (only `GameState` is saved). Use `Promise` from day one so a future cloud adapter drops in
without touching the engine.

**Why.** Hosts are disposable; a storage swap must not reach the engine. `savedAt` drives offline
replay.

**Evidence.** `README.md` "Save model"; `LocalStorageSaveRepository` reads `globalThis`
structurally so it does not pull the DOM lib into the engine config.

### 11.2 Derive rather than bump; bump only for a genuinely new source field; bumps need sign-off

**Rule.** If the new feature's state is a pure function of existing state, derive it and do not
touch the schema. If a new source field is truly needed, bump the version with a migration, and
get explicit user sign-off.

**Why.** Derivation kept the schema at v4 across enemy identity, taunts, milestones, the stall
anchor, and the Shiny drop reward. The one authorized v4 bump for the enemy/taunt feature was
**deliberately not spent** because nothing new needed persisting — holding an authorization in
reserve rather than spending it on a change the design does not require.

**Evidence.** decisions.md F2/F3 item 5; `AGENTS.md` "a schema change needs explicit user
sign-off"; orchestrator history "milestones add no field."

### 11.3 Migrations are named by SOURCE version and delegate to one parser

**Rule.** `loadGame` accepts all known versions; one `parseState` hydrates source fields and
defaults new fields; migration functions are named for the version they migrate *from*.

**Why.** It keeps the parser as the single hydration path and makes older blobs hydrate as the
current state. Any other version throws a descriptive error naming every accepted version.

**Evidence.** coder history v2/v3/v4; README save model.

### 11.4 Keep the storage key stable across versions

**Rule.** Do not rename `DEFAULT_SAVE_KEY` on a schema bump.

**Why.** It exists as `auto-auto-clicker.save.v1` specifically so pre-existing saves are still
found and migrated.

**Evidence.** coder history; NOTES.md.

### 11.5 Harden the parser against hostile/corrupt input

**Rule.** Validate that ids resolve to known definitions; reject unknown slot keys (including an
own enumerable `__proto__` from `JSON.parse`); assign from the canonical key list; prune unknown
achievement ids while rejecting non-arrays/non-strings; reject unknown enum kinds.

**Why.** A save is untrusted input loaded from storage; a leak into `gear.equipped` or a
`__proto__` prototype set is a real (if low-severity) hazard.

**Evidence.** coder history save-parser hardening; reviewer history v2.

### 11.6 `cloneGameState` must deep-copy reference-typed fields

**Rule.** Explicitly copy arrays and nullable objects (`achievements: [...state.meta.achievements]`,
`event.active`, `boost`); a shallow spread shares them.

**Why.** A claim/upgrade mutating a shared array would corrupt the caller's state.

**Evidence.** coder history v3/v4.

---

## 12. Process and coordination lessons

### 12.1 The plan is a hypothesis; the gate run is the evidence

**Rule.** Verify every plan-authored decision entry against what actually shipped. Docs written
during implementation rot silently and can send the next agent to "fix" correct code back to a
superseded design.

**Why (recurring).** After the code made the enemy roster live, `decisions.md` still declared it
inert and the product decision "open" — a future agent reading it would have reverted
`content.ts` to the canonical curve. The planner also wrote a `decisions.md` entry describing a
full validator that had been explicitly *not* built; it was caught only when a coder hit 7 red
tests. In another round the planner edited `decisions.md` unprompted and recorded decisions as
made that were not.

**Evidence.** orchestrator history 2026-09-28; reviewer history 2026-09-28.

### 12.2 Own the `.md` files centrally; verify agent-written entries

**Rule.** Have one owner (the orchestrator) make documentation claims, and validate any
agent-written decision against shipped code.

**Why.** The strict file-ownership prompts worked exactly as intended — coders forbidden from
touching `.md` **reported** contradictions instead of silently absorbing them — but a planner
that edited docs unprompted created contradiction. Subagents report; the orchestrator
reconciles.

**Evidence.** orchestrator history 2026-09-28.

### 12.3 Hand subagents a falsifiable metric, not a prose goal

**Rule.** A task brief carries an objective *and* a measured, multi-seed acceptance criterion —
and its own root-cause diagnosis when one exists.

**Why.** The drops-primary reversal worked because it carried a falsifiable multi-seed metric;
the first build failed partly because a planner's prose estimate was accepted.

**Evidence.** orchestrator history 2026-09-26.

### 12.4 Strict ownership enables safe parallelism — and surfaces contradictions cheaply

**Rule.** Parallelize by disjoint file ownership; keep interdependent interfaces under one owner.

**Why.** Engine-core (one coder) → sim → web wiring, then CSS polish after DOM freeze, with a
disjoint Playwright test in parallel, ran with zero file conflicts.

**Evidence.** orchestrator history 2026-09-25.

### 12.5 A `window` of a fix is real work

**Rule.** Budget for the test surface a feature opens — especially elapsed-time/UX features.

**Why.** A "small" guidance fix added a leaf module, a shared metric, two getters, a render
context, escalating UI, 12 unit tests and a smoke test, and grew smoke runtime ~7 s → ~24 s
because the test had to simulate time passing.

**Evidence.** orchestrator history 2026-09-28.

### 12.6 Archive before a risky feature, and restore-verify the archive

**Rule.** Snapshot a known-good build before risky work; the archive is only real if you can
restore it from scratch.

**Why.** It converted every later "this might break something" into a cheap experiment. The
restore test (install → tests → sim) is what proved the archive.

**Evidence.** orchestrator history 2026-09-27 (`archives/…zip`, source-only via `git archive`).

### 12.7 "The subagent reported failure" ≠ "no changes were made"

**Rule.** Inspect the working tree after any dispatched task, including a reported failure.

**Why.** Two subagent dispatches failed with transient HTTP 400s while their edits had already
landed on disk. Some hardening fixes were already present on disk from an unrecorded pass and
had to be *verified*, not re-applied.

**Evidence.** `agent-diary.md` session close 2026-09-26; coder history.

---

## 13. Known gaps and honest uncertainties

These are real, current, and should not be mistaken for solved:

- **`theme:check` does not validate animation cues** (§9.3). A typo'd cue `slot` passes every
  gate and yields a broken image at runtime; the unit suite covers the two shipped themes and
  `ACTIVE_THEME` is compile-time, so residual risk is low.
- **Enemy gold distinctness is coarse.** `goldGrowth = 1.0` and flooring collapse authored gold
  values; boss gold is non-monotonic across boss stages. Fixing it is a separate economy decision
  that must address the flat gold curve first.
- **Four dead anchor constants remain in `BALANCE`** (`baseHp`/`hpGrowth`/`baseGold`/`goldGrowth`)
  that no live path reads — the same class of footgun the per-enemy refactor removed. Deleting
  them is the obvious next cleanup.
- **`color-scheme` is not a palette token** (fixed `dark`), so a light theme leaves UA
  scrollbar/form chrome dark.
- **`sustainedActiveDps` is a second stats path** that must stay in sync with
  `getEffectiveStats`'s pre-boost factor; it is intentionally not exported.
- **A naive/bad-equip player can still soft-lock** (verified stall at stage 39 for 120 min with a
  level-38 weapon in the bag). The shipped advisory **surfaces** it; the player still decides.
- **Pre-change saves are briefly inconsistent** when a derivation changes (an `enemyHp` above the
  new max); renderer clamping makes it display-safe and it self-heals on the next kill.
- **Documented magnitudes drift.** Multiple reviewer rounds found docs quoting wrong counts and
  magnitudes ("~3–5%" vs the realized ≈+16%, 23 vs 24 achievements). Re-derive every stated
  number with a probe; a bounded-but-misquoted number survives because no test pins it.
- **Staleness of the pacing docs themselves:** the `npm run sim` output is the source of truth;
  numbers in older records are snapshots. Current: canonical soft **6.22** / hard **55.52** min,
  all 5 sweep seeds pass, drops-primary 97.3–98.6% net.

---

## 14. Checklist for the next game

**Architecture / boundary**
- [ ] Put all simulation, content, and balance in a dependency-free engine package; hosts only
      project state + events and own I/O.
- [ ] Enforce purity with a source-scanning test AND a `tsconfig` that cannot inject DOM/RN libs.
- [ ] Expose exactly `advance(state, deltaMs)` + `applyAction(state, action)`; never a clock or
      timer inside the engine.
- [ ] Keep one-way workspace deps and **0 import cycles** (DFS-check it); put a function on the
      importing side of any would-be cycle.
- [ ] Split impure reads (fs/PNG/network) into a CLI layer; keep the compare/validate logic pure.
- [ ] Import hosts from the package root only; keep a single narrow `save` subpath.

**Identity / display**
- [ ] Enumerate your identity set (ids, slots, enum kinds, schema version) and forbid themes from
      owning it; copy is keyed by id.
- [ ] Validate identity safety as a **key** check; mirror a dedicated completeness pass whenever
      you skip a subtree; never let an allow-list registration be the only validation.

**State / saves**
- [ ] Persist source fields only; derive everything else in pure getters.
- [ ] Delete any persisted field that is a pure function of other persisted fields (or recompute
      it on load if you cannot bump).
- [ ] Version the blob; accept all old versions through one parser; migrate by source version;
      keep the storage key stable; get sign-off before any bump.
- [ ] Harden the parser (resolve ids, reject unknown keys incl. `__proto__`, prune unknown
      achievements, reject unknown enum kinds); deep-copy on clone.

**Determinism**
- [ ] One seeded PRNG with state in the save; no `Math.random()`.
- [ ] Fix draw count/order per event; document it.
- [ ] Put all cosmetic randomness on a **separate** derived channel that never touches the main
      state; engine emits semantic ids/indices, never display text.
- [ ] Keep the pacing projection RNG-free (model crit as expected-DPS, not per-hit).

**Economy**
- [ ] Exactly one unbounded exponential lever; clamp every secondary lever on the **aggregate**.
- [ ] Make the primary power lever the planned one (drops) and gate its share per seed.
- [ ] Keep cost/income curves flat and legible; grant free paths fixed levels, not scaled
      currency; always leave a working free path.
- [ ] Before shipping any reward/threshold, measure that the state it keys off actually reaches it.
- [ ] Bound temporary buffs structurally (pin `D × (M − 1)` in a test); charge each loss to the
      lever that caused it.

**Content**
- [ ] One source of truth per entity; delete inert metadata or make it live.
- [ ] If a repeating roster multiplies into the stage curve, keep its growth band tight and put
      distinctness in base values/boss multipliers; derive entities from stage, not RNG.
- [ ] Check the **observable** (floored) range of any "distinct" authored values.

**Theming**
- [ ] Build a second real implementer before trusting the seam.
- [ ] Ship a contract + validator that reports every problem at once with measured limits;
      validate any new required section or keep it out of the contract.
- [ ] Apply colours via an injected `:root` rule, not inline; keep the fallback; preserve
      high-contrast and reduced-motion.

**Proof discipline**
- [ ] Hard-gate the pacing proof; multi-seed; never downgrade a primary signal to a warning; never
      widen a tolerance to pass.
- [ ] Capture a sim baseline and require an **empty diff** for neutral changes; measure drift for
      intentional ones.
- [ ] Ask what the harness is not varying; add a policy-sensitivity diagnostic; prove coverage by
      perturbation; re-derive metrics you suspect prove the wrong thing.
- [ ] For pure refactors, prove byte-identical output; assert geometry where geometry matters;
      probe every guard test to fail.
- [ ] Derive test expectations from the engine; never weaken an assertion to fit data.

**Process**
- [ ] Treat plans as hypotheses; verify plan-authored docs against shipped code; keep `.md` edits
      centrally owned.
- [ ] Give subagents falsifiable multi-seed metrics; reproduce contradictions before choosing a
      side.
- [ ] Archive + restore-verify before risky work; inspect the tree after any dispatch (even a
      reported failure).

---

*Companion sources: `README.md` (architecture, simulation contract, save model, pacing proof,
theming), `decisions.md` (locked choices + evidence), `histories/*.md` (per-agent learnings),
`STATE.md` / `NOTES.md` (current status + honest edges). When a number here conflicts with a
fresh `npm run sim`, the sim wins.*
