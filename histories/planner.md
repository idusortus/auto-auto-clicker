# Planner History

> Accumulated learnings about this project. Read at session start, append non-obvious discoveries.

<!-- Append entries below this line -->
- 2026-09-25: Greenfield repo with Node v24.18.1/npm 12; no existing code; PROJECT.md and startprompt.md carry identical constraints. Save schema and pacing targets must be locked before coding. Chose npm workspaces + Vite/vanilla web + vitest + tsx sim; Node type stripping exists but tsx is safer for the sim script. Economy numbers were pre-tuned in a scratch simulation: hpGrowth 1.5, baseHp 25, weaponLevelExp 1.4, upgradeStatMultiplier 1.18 yields soft check ~6.2 min and hard wall ~52.9 min under a greedy active-clicker policy.
