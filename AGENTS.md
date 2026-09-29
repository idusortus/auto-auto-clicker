# auto-auto-clicker

> A browser-playable idle clicker whose entire simulation/economy lives in a standalone, platform-agnostic TypeScript engine that can later be lifted into a React Native/Expo app.

This file is the tool-agnostic project context. Codex, Cursor, Aider, Gemini CLI, Zed,
and Copilot all read `AGENTS.md` per the [agents.md](https://agents.md) convention.

## Goal
Defeat enemies → gear drops → upgrade gear → periodic boss checks (no real-time-skill
combat), with all simulation and economy logic isolated in a standalone `engine-core`,
and the pacing target (~6 min soft boss check, ~54 min hard wall) proven by an automated
headless simulation rather than manual play.

## Stack
typescript, vite, vanilla dom, pure ts engine — local-only (no backend, no supabase, no network)

## Frameworks / Key Libraries
vite, vitest, tsx, playwright, npm workspaces (no UI framework)

## Constraints
- `engine-core` is PURE and ACYCLIC: no DOM, no timers, no clock, no `Math.random`, no `fs`.
  All randomness flows through `GameState.meta.rngState` (mulberry32).
- IDENTITY (achievement ids, gear `definitionId`s, `GearSlot`s, enemy ids, `ShinyKind`s,
  save-schema version) is persisted in saves and asserted by the sim. A **theme must NEVER
  control identity** — themes own DISPLAY only (copy, palette, art slots, animation cues,
  enemy names/catchphrases).
- Save schema is **v4**; a schema change needs explicit user sign-off.
- `/web` holds NO balance numbers and never mutates engine state.
- No new npm dependencies without justification.
- **Pacing is a hard gate.** `npm run sim` must print `PACING OK`; the ±20% tolerance,
  `BOSS_TIMER_MS`, `HARD_WALL_PROJECTED_KILL_MS`, the canonical comfortable ranges and the
  drops-primary gate are acceptance criteria, NOT tuning knobs. Never widen them to make a
  number pass — report measured failure instead.

## Current shape (2026-09-28)
- `ACTIVE_THEME` is **`lucky`** (golden retriever × husky); `fantasy` also ships. The theme
  switch is one line in `engine-core/src/theme/index.ts`.
- **12 enemies** (`ENEMY_ROSTER`), selected deterministically from the stage
  (`enemyForStage(stage) = roster[(stage-1) % 12]`, zero RNG, no persisted state). Each enemy
  owns a REAL HP/gold curve and REAL boss multipliers — one source of truth, no scaling factors.
- Engine-emitted deterministic **catchphrases** (`enemyTaunt`) on a separate derived RNG channel
  that never touches `meta.rngState`.
- Themeable **animation** driven by the `GameEvent[]` seam, with a `prefers-reduced-motion` gate.
- Current pacing: canonical soft **6.22** / hard **55.52** min; all 5 sweep seeds pass.

## Workflow
1. Read `PROJECT.md` for the long-form vision.
2. Check `STATE.md` for current status, blockers, in-flight decisions.
3. Check `decisions.md` for architectural decisions already locked in.
4. Per-agent memory lives in `histories/<agent>.md`.
5. Append a session summary to `agent-diary.md` when work completes.


<!-- CODEGRAPH_START -->
## CodeGraph

This project is configured to use [CodeGraph](https://codegraph.ru) for graph-backed codebase context.
When you need to understand relationships, call paths, or impacts, use:

```
codegraph explore "<your question>"
```

The CodeGraph MCP server is registered in the project config. Run `codegraph init` in this directory
if the project has not been indexed yet.
<!-- CODEGRAPH_END -->

