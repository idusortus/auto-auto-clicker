# auto-auto-clicker — Project Vision

## One-line
A browser-playable idle clicker whose entire simulation/economy lives in a standalone,
platform-agnostic TypeScript engine that can later be lifted into a React Native/Expo app.

## Goal
Build a browser-playable idle clicker (defeat enemies → gear drops → upgrade gear →
periodic boss checks, no real-time-skill combat) with all simulation and economy logic
isolated in a standalone `engine-core`, and prove the pacing target (~6 min soft boss
check, ~54 min hard wall) with an automated headless simulation rather than manual play.

## Stack
- TypeScript (strict) + Vite + vanilla DOM for the browser host; a pure TypeScript engine
  (`engine-core`) with zero runtime dependencies
- Local-only this phase: no backend, no auth, no Supabase, no network calls

## Frameworks / Key Libraries
- Vite (dev server + build), Vitest (engine unit tests), tsx (headless sim), Playwright
  (mobile smoke test), npm workspaces. No UI framework.

## Quickstart
```bash
npm install
npm run dev        # play at http://localhost:5173
npm run test       # engine-core unit tests (Vitest)
npm run sim        # headless pacing proof (soft ~6 min, hard ~54 min)
npm run smoke      # Playwright mobile-viewport smoke test
npm run build      # engine-core typecheck + production web bundle
npm run typecheck  # typecheck engine-core + web
```

## Hard Constraints
None declared.

## Current shape (2026-09-28)
- **Themes:** two ship — `lucky` (golden retriever × husky, the committed default) and `fantasy`.
  A theme owns DISPLAY only: copy, a 19-token palette, 32 declared art slots, animation cues, and
  the enemy roster's names/catchphrases. Identity (achievement ids, gear/enemy ids, `GearSlot`s,
  `ShinyKind`s, save schema) is NEVER theme-controlled.
- **Enemy roster:** 12 enemies, selected deterministically from the stage
  (`enemyForStage(stage) = roster[(stage-1) % 12]` — zero RNG, no persisted state, schema v4).
  Each enemy owns a REAL HP/gold curve and its own boss multipliers; boss cadence is global
  (every 10th stage).
- **Catchphrases:** the engine emits deterministic `enemyTaunt` events on a separate derived RNG
  channel that never touches `meta.rngState`; themes supply the wording.
- **Animation:** the `GameEvent[]` seam drives a bounded, themeable transient-frame system with a
  `prefers-reduced-motion` gate.


## Out of Scope
_(populate as you discover things this project will NOT do)_

## Success Criteria
`npm run sim` passes within tolerance (soft boss check ~6 min ±20%, hard progression wall
~54 min ±20%, hard-asserted for every sweep seed), `npm run test` passes, `npm run dev`
serves a playable mobile-shaped app (validated by the Playwright smoke test at 390×844
with ≥44 px touch targets), and `engine-core` has zero imports from `/web` (the engine is
pure and platform-agnostic).

---

## Source Documents

The following documents were provided via `--doc` at project init time.

### startprompt.md

## Context (carry forward)
- Building the first title in a shared idle-game engine/story-universe; this prototype's engine is meant to be lifted into an Expo (React Native) app later — treat the renderer built here as disposable, the engine as the permanent artifact
- Reuse this pacing target unless simulation proves it needs tuning: soft boss check ~6 minutes of active play, hard progression wall ~54 minutes
- Reuse this save-state shape: versioned SaveGame wrapper; content definitions (GearDefinition, EnemyDefinition) kept separate from per-player save state; save state is one serializable blob (today: localStorage, later: Supabase jsonb)
- Progression walls resolve via player choice (wait / ad-watch / future IAP hook) — never a hard paywall with no free path

Objective:
Build a browser-playable idle clicker (defeat enemies → gear drops → upgrade gear → periodic boss checks, no real-time-skill combat) with all simulation/economy logic isolated into a standalone, platform-agnostic engine-core module. Prove the pacing target above holds via an automated headless simulation, not manual playtesting.

Starting state:
Empty repo, new directory. No existing code for this project.

Target state:
- /engine-core — pure TypeScript, zero DOM/React/React Native imports, exports a pure tick-based simulation (state in → state + events out), unit tested
- /web — thin Vite + TypeScript + vanilla DOM renderer that imports engine-core and contains no rules, no balance numbers, no direct state mutation
- /engine-core/save — a SaveRepository interface + LocalStorageSaveRepository implementation, shaped so a SupabaseSaveRepository can be dropped in later without touching engine-core
- `npm run sim` — a headless script that runs N simulated hours of the tick loop with no rendering and asserts: soft boss check lands ~6min (±20%), hard wall ~54min (±20%); fails loudly (non-zero exit, printed deltas) if it doesn't
- Mobile-shaped UI: correct viewport meta, touch targets ≥44px, playable at a 390×844 viewport — validated via a Playwright mobile-viewport smoke test (load, tap upgrade, counter increments), not by a human on a phone
- README section "Porting to Expo": what engine-core assumes about its host (nothing) and what the RN layer will need to supply (a renderer + a SaveRepository impl)

Allowed actions:
- Scaffold/modify anything inside this project's directory
- Install packages, but justify each new dependency in the completion summary
- Run build, test, and sim scripts freely

Forbidden actions:
- No backend, no auth, no Supabase, no network calls — local-only for this phase
- Do NOT invent mechanics beyond the loop above (no crafting, no multiplayer, no monetization UI) — log ideas to NOTES.md instead of building them
- /web must not contain balance numbers, drop tables, or state mutation — that's an engine-core boundary violation
- Do NOT loosen the pacing target to make the sim pass — if it's unreachable with a sane economy, stop and report why

Stop conditions — pause and report instead of proceeding when:
- The pacing sim can't be made to pass after 2 genuine tuning attempts
- Any change would alter the save-schema shape above
- A choice has real architectural weight for the future Expo port (tick-driving mechanism, offline-time calculation)
- An error isn't resolved in 2 attempts

Checkpoints:
After each phase: ✅ [phase] — [what exists now] — [what's next]
Phases: scaffold → engine-core + unit tests → sim passing → renderer wired → mobile smoke test passing → README

Done when:
`npm run sim` passes within tolerance, `npm run test` passes, `npm run dev` serves a playable app, and engine-core has zero imports from /web.

_This file is the durable vision. It changes rarely. Day-to-day status lives in `STATE.md`._
_Generated by `npx cli-five` on 2026-09-26._
