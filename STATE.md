# auto-auto-clicker — Current State

> Cross-session memory for all agents. Update on exit; read on entry.

## Status
Phases 1–3 of the 3-phase extension are implemented. Phase 1 added the ring/necklace/
achievement engine + save schema v3; Phase 2 retuned the drop weights to restore pacing;
Phase 3 corrected the sim's equip policy so rings/necklaces are actually validated, capped
their multiplicative bonuses, and shipped the /web achievements splash + shelf. The earlier
prototype (Phases 0–6), the 2026-09-26 economy reversal, and the structural save-schema v2
change remain in place underneath.

Phase 3 gates (this session):
- `npm run typecheck` → clean for all three workspaces (`engine-core`, `web`, `sim`).
- `npm run test` → **84 passed (8 files), exit 0**.
- `npm run sim` → **PACING OK, exit 0**. All 5 seeds PASS; canonical soft 5.97 min (−0.6%),
  hard 49.07 min (−9.1%); drops-primary net 99.6–100.0% / gross 87.4–87.8%; eq/stage 0.84–0.98.
- `npm run build` → exit 0. `npm run smoke` → **5 passed, exit 0**.

### Phase 3 changes
- **Sim equip policy is now per-slot.** `sim/src/sim.ts` equips the bag item that most raises a
  single `powerScore` built ONLY from engine getters (`getEffectiveStats` × necklace gold bonus
  from `getGlobalBonuses`), for EACH of weapon/ring1/ring2/necklace; the winning equip is applied
  through the real `applyAction`. Rings/necklaces ARE now equipped (1–4 non-weapon equips/run).
  The attribution ledger gained a `bonusGross` term (the log delta of the bounded crit/power
  factor on each non-weapon equip) counted with drops; the drops-primary gate and drop-stream
  sanity guard remain hard per-seed assertions.
- **Bonuses capped** in `balance.ts` + the state getters: `CRIT_MULTIPLIER_CAP = 1.18`,
  `POWER_MULTIPLIER_CAP = 0.02`, `GOLD_MULTIPLIER_CAP = 0.25` (plus the existing
  `CRIT_CHANCE_CAP = 0.75`), and ring base `critMultiplier` 0.1 → 0.05. Capping (not
  de-exponentialising) keeps drops the exponential lever. `GOLD_MULTIPLIER_CAP` is looser so the
  flat-gold floor cannot erase the necklace gold bonus.
- **Achievements expanded** to 24 snarky entries (stable ids; new `first-click`, `wall-hit`,
  `choice-made`, `first-upgrade`, `ring-bearer`, `bling`, `full-kit`, `big-iron`, `hoarder`,
  `crit-half`, `loose-change`, `grass-30`), all triggerable by existing mechanics.
- **/web**: brief over-the-top achievement splash (full-screen, non-blocking `pointer-events:none`,
  auto-dismiss ~2.6 s, tap to dismiss, queued, reduced-motion safe) + an achievements shelf
  (`achievements-list`/`achievements-count`, locked = `???`), and slot-aware bag/equipped rendering
  (rings show crit, necklace shows gold/power). New testids added; no existing testid changed;
  `/web` still holds no balance numbers (`gearDefinitionFor` newly exported).

### Phase 2 change (pacing retune)
- `SLOT_DROP_WEIGHTS` rings 0.25/0.25 → **0.04/0.04** (weapon 1.0, necklace 0.02).

### Phase 1 additions
- `GearSlot` = `'weapon' | 'ring1' | 'ring2' | 'necklace'`; `GearDefinition` gained
  `critChance`/`critMultiplier`/`goldMultiplier`/`powerMultiplier` (item-level-scaled content).
- Crit is an **expected-DPS multiplier** (`getCritStats`), capped at `CRIT_CHANCE_CAP = 0.75`;
  the necklace supplies `getGlobalBonuses`. `getEffectiveStats` folds both in (same
  `{autoDps, clickDamage}` shape) and may return fractional values; damage application floors.
- Loot is slot-weighted with a generalized guaranteed-first-weapon rule; two fixed RNG draws per
  kill. **Save schema is version 3** (`loadGame` accepts 1/2/3); `DEFAULT_SAVE_KEY` unchanged.

### Prior prototype status (still true)
The engine's power core is drops-primary: gear stats are exponential in item level
(`floor(factor * gearGrowth^(itemLevel - 1))`, `gearGrowth = 1.283`), and gold-funded upgrades
are a minor smoothing lever (`upgradeStatMultiplier = 1.05`, `upgradeCostGrowth = 6`, flat
`goldGrowth = 1.0`).

## In Flight
None. Phases 1–3 are complete and green.

## Blockers / Known trade-offs
- **Pacing is in tolerance** (all 5 seeds) with the corrected per-slot equip policy. Do NOT widen
  the ±20% window.
- **Rings/necklaces are bounded secondary levers.** Their crit/power totals are capped, so the
  realized factor saturates at ≈**+16% DPS** (`×1.158`) and shifts pacing ≈**10%**; they do not
  change the soft/hard *stage* selection. An unbounded ring/necklace lever would need a
  non-exponential stat channel.
- **Effective stats are fractional** (crit/power multipliers). Integer damage is preserved only
  by flooring at the `advance` accumulation and the `click` action boundary.
- **Drop RNG still affects pacing.** See the 2026-09-26 entry.
- **Gold is deliberately a small lever** (`goldGrowth = 1.0`).
- **`watchAd`/`iap` remain disabled UI placeholders.**
- **Three save schema versions, one migration path**; `SaveRepository` has no `clear()`.
- **No player HP / armor / dodge / enemy attacks** — explicitly deferred (see `NOTES.md`).

## Recent Decisions
See `decisions.md`. Most recent: 2026-09-27 "Phase 3 — sim equip policy values every slot;
ring/necklace bonuses capped" and "Phase 3 — /web achievements: snarky catalog, brief
non-blocking splash, shelf". Also authoritative: 2026-09-27 "Phase 2 — restore pacing by
restoring the weapon drop share", "Multi-slot gear: rings (crit) + necklace (gold/power),
expected-DPS crit model", "Save schema v3", and "Economy reversal: drops are the primary power
lever, gold demoted".

## Next
No required work remains for this brief. If continuing:
1. Build the Expo/RN port by supplying a renderer + a `SaveRepository` (e.g. AsyncStorage
   or Supabase) and a host clock driving `advance()` — see README "Porting to Expo".
2. Optional polish: compact numeral formatting, tap/feedback cosmetics, bag sorting
   (would need a new engine action first).

---

_Generated by `npx cli-five` on 2026-09-26._
