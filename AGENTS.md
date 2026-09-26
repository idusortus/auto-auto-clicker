# auto-auto-clicker

> TODO — write a one-line vision statement.

This file is the tool-agnostic project context. Codex, Cursor, Aider, Gemini CLI, Zed,
and Copilot all read `AGENTS.md` per the [agents.md](https://agents.md) convention.

## Goal
TODO — declare the primary goal.

## Stack
typescript, vite, vanilla dom, pure ts engine — local-only (no backend, no supabase, no network)

## Frameworks / Key Libraries
vite, vitest, tsx, playwright, npm workspaces (no UI framework)

## Constraints
None declared.

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

