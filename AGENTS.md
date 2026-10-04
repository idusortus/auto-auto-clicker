# auto-auto-clicker

> An idle clicker whose entire simulation/economy lives in a standalone, platform-agnostic TypeScript engine — played in the browser (`/web`) **and** shipped as an installable Android app (`/mobile`, Expo / React Native).

This file is the tool-agnostic project context. Codex, Cursor, Aider, Gemini CLI, Zed,
and Copilot all read `AGENTS.md` per the [agents.md](https://agents.md) convention.

## Goal
Defeat enemies → gear drops → upgrade gear → periodic boss checks (no real-time-skill
combat), with all simulation and economy logic isolated in a standalone `engine-core`,
and the pacing target (~6 min soft boss check, ~54 min hard wall) proven by an automated
headless simulation rather than manual play.

## Stack
typescript, vite, vanilla dom, pure ts engine; expo / react native mobile host — local-only
(no backend, no supabase, no network)

## Frameworks / Key Libraries
vite, vitest, tsx, playwright, jest-expo + @testing-library/react-native, npm workspaces
(`engine-core`, `web`, `sim`, `mobile`); no UI framework (RN primitives only)

## Constraints
- `engine-core` is PURE and ACYCLIC: no DOM, no timers, no clock, no `Math.random`, no `fs`.
  All randomness flows through `GameState.meta.rngState` (mulberry32).
- IDENTITY (achievement ids, gear `definitionId`s, `GearSlot`s, enemy ids, `ShinyKind`s,
  save-schema version) is persisted in saves and asserted by the sim. A **theme must NEVER
  control identity** — themes own DISPLAY only (copy, palette, art slots, animation cues,
  enemy names/catchphrases).
- Save schema is **v4**; a schema change needs explicit user sign-off.
- `/web` and `/mobile` hold NO balance numbers and never mutate engine state — both are hosts
  that consume `engine-core` through its public API only.
- No new npm dependencies without justification.
- **The version is declared ONCE** in `mobile/package.json` `version`; `mobile/app.json`
  `expo.version` and root `package.json` `version` are DERIVED. Never hand-edit a derived copy —
  use `npm run version:sync` / `version:bump`, and `npm run version:check` must pass.
- **Releases are tag-driven.** A `v*` tag must match the declared version (CI fails closed if not).
  `android.versionCode` is the commit count, never derived from semver. Tags are immutable —
  bump, never force-push.
- **The Android app identity `com.autoautoclicker.app` is permanent** — changing it forces every
  tester to uninstall. `mobile/android/`, `mobile/ios/`, `mobile/dist/`, and keystores are
  generated/gitignored (CNG); never commit them.
- **Pacing is a hard gate.** `npm run sim` must print `PACING OK`; the ±20% tolerance,
  `BOSS_TIMER_MS`, `HARD_WALL_PROJECTED_KILL_MS`, the canonical comfortable ranges and the
  drops-primary gate are acceptance criteria, NOT tuning knobs. Never widen them to make a
  number pass — report measured failure instead.

## Current shape (2026-10-03)
- **Four workspaces:** `engine-core` (pure engine), `web` (browser DOM host), `sim` (headless
  pacing proof), `mobile` (Expo / React Native host, `@auto-auto-clicker/mobile`). The mobile
  host consumes `engine-core` **unchanged** and proves the host contract.
- **Android APK distribution is live.** `npm run mobile:apk` builds a debug-key-signed release
  APK locally; a `v*` tag runs `.github/workflows/build-apk.yml` (self-provisioned Android SDK,
  no secret) which validates the tag, builds, and publishes a GitHub Release. Latest release:
  **`v0.3.0`**. Release process: see README "Cutting a release".
- **Version tracking:** single source `mobile/package.json`; `version:sync|bump|check`; a
  `CHANGELOG.md` (Keep a Changelog). `version:check` fails closed in CI without a resolvable
  `v*` tag.
- **Expo SDK 57 (stable)** — `mobile/` on the SDK-57 paired set (`react-native 0.86.3`). SDK 58
  is preview and deliberately avoided.
- **Mobile renders theme art + animation.** The Expo host shows the active theme's declared PNGs
  (`ThemeImage`; art copied mobile-local and resolved via the generated `mobile/src/themeAssets.gen.ts`
  registry — `npm run mobile:assets`) and ports the `GameEvent[]`→cue animation framework (pure
  `cues.ts`, `useAnimationCues`, `useReducedMotion`, Reanimated flourishes), with a
  `reduceMotionChanged` gate that suppresses movement but keeps informational text. It is
  safe-area aware (`SafeAreaProvider`). Engine/web/sim untouched; save schema stays **v4**.
- `ACTIVE_THEME` is **`fantasy`** (the "Standard Fantasy RPG" original); `lucky` (golden retriever × husky) also ships. The theme
  switch is one line in `engine-core/src/theme/index.ts`.
- **12 enemies** (`ENEMY_ROSTER`), selected deterministically from the stage
  (`enemyForStage(stage) = roster[(stage-1) % 12]`, zero RNG, no persisted state). Each enemy
  owns a REAL HP/gold curve and REAL boss multipliers — one source of truth, no scaling factors.
- Engine-emitted deterministic **catchphrases** (`enemyTaunt`) on a separate derived RNG channel
  that never touches `meta.rngState`.
- Themeable **animation** driven by the `GameEvent[]` seam, with a `prefers-reduced-motion` gate.
- Current pacing: canonical soft **6.22** / hard **55.52** min; all 5 sweep seeds pass.

## Specs & changes (OpenSpec)
Specs live in `openspec/specs/` (`expo-host`, `android-apk-distribution`, `version-tracking`);
completed changes are archived under `openspec/changes/archive/`. Workflow: `openspec` skills
(`openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-sync-specs`).

## Adding dependencies to `mobile/`
Do **not** use `npx expo install` — it re-resolves the workspace tree and hoists `react-native`,
deleting the committed `mobile/node_modules/react-native` nesting that `mobile/jest.config.js`
requires (Jest must test the same RN minor the APK ships). Add exact SDK-57-pinned versions with
`npm install <pkg>@<ver> --workspace mobile --legacy-peer-deps` (versions live in
`node_modules/expo/bundledNativeModules.json`).

## Follow-ups (open work — see `STATE.md` "Follow-ups" for detail)
Verify `v0.2.0` on a real device; then the deferred items (persistent release keystore, Play
Store `.aab`, iOS path, PR-time `version:check`) and the CI action-version deprecation cleanup.

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

<!-- JEV_TIER_ROUTING_START -->
## Tier routing

Before planning, call the `tier_classifier` tool once with the task description.

- If it returns `confidence` >= 0.6, use its `tier` (trivial | minor | major) as your planning depth.
- If `confidence` < 0.6, or the tool is unavailable, use your own judgment and default to `major`.
- The classifier is optional: it uses real Jev when a credential is available (Jev is free on OpenCode) and a local heuristic otherwise. Never block or fail a turn because the tool is unavailable.
<!-- JEV_TIER_ROUTING_END -->
