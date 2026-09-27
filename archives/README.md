# archives

Frozen snapshots of the project at a known-good, committed state.

Snapshots are produced with `git archive`, so each zip is **exactly the tree at one commit** —
no `node_modules`, no `dist`, no caches. Everything needed to rebuild is included
(`package.json`, `package-lock.json`, `tsconfig.base.json`, all source).

## Contents

| File | Commit | Date | State |
|---|---|---|---|
| `auto-auto-clicker_2026-09-27_e5b43c4.zip` | `e5b43c4` | 2026-09-27 | Browser-playable idle clicker: pure `engine-core` + `web` renderer + headless pacing `sim`. Item slots (crit rings, QoL necklaces), 24 achievements with unlock splash, save schema v3. All gates green. |

## How to make a new snapshot

```bash
cd <repo root>
git status --porcelain          # confirm the tree is clean first
mkdir -p archives
NAME="auto-auto-clicker_$(date +%Y-%m-%d)_$(git rev-parse --short HEAD).zip"
git archive --format=zip --output="archives/$NAME" HEAD
```

Then add a row to the table above and commit.

## How to restore a snapshot

```bash
mkdir restore && cd restore
unzip ../archives/auto-auto-clicker_2026-09-27_e5b43c4.zip
npm install          # rebuilds node_modules from package-lock.json
npm run test         # 85 tests
npm run sim          # PACING OK (soft ~5.97 min, hard ~49.07 min)
npm run smoke        # 5 Playwright tests (installs/caches Chromium on a fresh machine)
npm run dev          # play at http://localhost:5173
```

Notes:
- `@playwright/test` needs a browser binary. On a fresh machine run
  `npx playwright install chromium` once (the dev machine already has it cached in
  `~/.cache/ms-playwright`).
- The archive is source-only by design. `dist/` is a build artifact; regenerate with
  `npm run build`.
