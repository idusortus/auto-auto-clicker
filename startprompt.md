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
