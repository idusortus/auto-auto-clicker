// renderer.ts — imperative DOM renderer for engine state.
//
// The renderer is a pure function of the GameState it is handed: it owns no
// game rules, no balance numbers, and never mutates engine state. Every value
// it displays comes from engine-core (state fields or exported getters). All
// player input is forwarded to the host through the handlers passed to
// mountRenderer; the renderer never dispatches actions itself.
//
// Achievement splashes are driven by diffing the unlocked-id list across
// renders (the host passes no events here). A splash is purely visual: it never
// touches engine state and never pauses the tick loop, and unlocks are queued so
// a burst of them is shown one after another. Any tap dismisses the current
// splash early — the tap still reaches the game underneath (the overlay is
// pointer-events:none), so the splash is non-blocking.

import {
  ACHIEVEMENTS,
  gearDefinitionFor,
  getActiveBoost,
  getActiveEvent,
  getCritStats,
  getEffectiveStats,
  getEnemyMaxHp,
  getGearStats,
  getGlobalBonuses,
  getMilestoneInfo,
  getProjectedKillMs,
  getSlotMilestones,
  getSlotUpgradeAdvisory,
  getStallAdvisory,
  getUpgradeCost,
  isBoss,
} from '@auto-auto-clicker/engine-core';
import type {
  AchievementDefinition,
  GameState,
  GearInstance,
  GearSlot,
  MilestoneInfo,
  PendingChoice,
  ShinyKind,
  SlotUpgradeAdvisory,
  StallAdvisory,
} from '@auto-auto-clicker/engine-core';

type ChoiceOption = PendingChoice['options'][number];

export interface RendererHandlers {
  /** The player tapped the enemy. */
  onClick(): void;
  /** The player asked to upgrade the equipped item in `slot`. */
  onUpgrade(slot: GearSlot): void;
  /** The player asked to equip a bag item. */
  onEquip(instanceId: string): void;
  /** The player picked a resolution for a pending choice. */
  onChoice(choice: ChoiceOption): void;
  /** The player tapped the wandering Stray Goblin (a Golden Event). */
  onClaim(): void;
}

export interface OfflineSummary {
  /** Wall-clock time since the save was written. */
  elapsedMs: number;
  /** Time actually replayed through `advance` (<= elapsedMs). */
  simulatedMs: number;
  /** Gold gained during the replay. */
  goldEarned: number;
  /** Whether elapsedMs was longer than the offline cap. */
  capped: boolean;
}

/**
 * Host-supplied context for rendering guidance that the engine cannot derive
 * from state alone. The host watches `combat.stage` across renders and records
 * the SIM-TIME (`meta.totalPlayedMs`) at which the current stage began; it is
 * never persisted (the save schema stays v4). Omitted/null means "unknown", and
 * the stall advisory then stays `none`.
 */
export interface RenderContext {
  stageBeganAtMs: number | null;
}

export interface Renderer {
  /** Project the given state onto the DOM. */
  render(state: GameState, context?: RenderContext): void;
  /** Show the "welcome back" summary for offline progress. */
  showOfflineSummary(summary: OfflineSummary): void;
}

// Presentation constants: CSS widths are expressed in percent; durations are
// human-readable formatting, not gameplay numbers.
const FULL_PERCENT = 100;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
/** How long a splash stays up before auto-dismissing. */
const SPLASH_DURATION_MS = 2600;
/** How long the Shiny escape toast / claim flourish stays up. */
const SHINY_MESSAGE_MS = 2200;
/** How long the milestone step-change flourish stays up. */
const MILESTONE_MESSAGE_MS = 2400;
const MS_PER_SECOND = 1000;

/** Achievement catalog keyed by id, for splash lookup. */
const ACHIEVEMENT_BY_ID = new Map<string, AchievementDefinition>(
  ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]),
);

/** One per-slot upgrade control: its button plus level/cost readouts. */
interface UpgradeRow {
  button: HTMLButtonElement;
  level: HTMLElement;
  cost: HTMLElement;
}

interface Refs {
  gold: HTMLElement;
  stage: HTMLElement;
  dps: HTMLElement;
  enemy: HTMLButtonElement;
  enemyName: HTMLElement;
  bossBadge: HTMLElement;
  enemyHp: HTMLElement;
  hpFill: HTMLElement;
  boostPill: HTMLElement;
  boostLabel: HTMLElement;
  boostTimer: HTMLElement;
  shiny: HTMLButtonElement;
  shinyName: HTMLElement;
  shinyToast: HTMLElement;
  shinyFlourish: HTMLElement;
  milestoneFlourish: HTMLElement;
  advisory: HTMLElement;
  advisoryKicker: HTMLElement;
  advisoryBody: HTMLElement;
  advisoryEquip: HTMLButtonElement;
  upgradeRows: Record<GearSlot, UpgradeRow>;
  upgradeHint: HTMLElement;
  equipped: HTMLElement;
  bagList: HTMLElement;
  bagEmpty: HTMLElement;
  bagCount: HTMLElement;
  achievementsList: HTMLElement;
  achievementsCount: HTMLElement;
  choices: HTMLElement;
  choicesTitle: HTMLElement;
  choicesBody: HTMLElement;
  waitBtn: HTMLButtonElement;
  watchAdBtn: HTMLButtonElement;
  iapBtn: HTMLButtonElement;
  offline: HTMLElement;
  offlineText: HTMLElement;
  offlineDismiss: HTMLButtonElement;
  splash: HTMLElement;
  splashTitle: HTMLElement;
  splashDesc: HTMLElement;
}

const SKELETON = `
  <div class="app">
    <header class="hud">
      <div class="hud__stat">
        <span class="hud__label">Gold</span>
        <span class="hud__value" data-testid="gold">0</span>
      </div>
      <div class="hud__stat">
        <span class="hud__label">Stage</span>
        <span class="hud__value" data-testid="stage">1</span>
      </div>
      <div class="hud__stat">
        <span class="hud__label">DPS</span>
        <span class="hud__value" data-testid="dps">0</span>
      </div>
    </header>

    <div class="boost" data-testid="boost-pill" data-role="boost-pill" hidden aria-live="polite">
      <span class="boost__label" data-role="boost-label">FRENZY</span>
      <span class="boost__timer" data-role="boost-timer"></span>
    </div>

    <section class="advisory" data-testid="upgrade-advisory" data-role="upgrade-advisory" hidden aria-live="polite">
      <p class="advisory__kicker" data-role="advisory-kicker">Bag check</p>
      <p class="advisory__body" data-testid="upgrade-advisory-body" data-role="advisory-body"></p>
      <button
        class="btn btn--primary btn--small"
        data-testid="upgrade-advisory-equip"
        data-role="advisory-equip"
        type="button"
      >
        Equip it
      </button>
    </section>

    <main class="stage">
      <button class="enemy" data-testid="enemy" type="button" aria-label="Attack the enemy">
        <span class="enemy__badge" data-role="boss-badge" hidden>Boss</span>
        <span class="enemy__name" data-role="enemy-name">Enemy</span>
        <span class="enemy__hp">
          <span class="hp-bar"><span class="hp-bar__fill" data-role="hp-fill"></span></span>
          <span class="enemy__hp-text" data-testid="enemy-hp">0 / 0</span>
        </span>
      </button>
      <button
        class="shiny"
        data-testid="shiny"
        data-role="shiny"
        type="button"
        aria-label="Catch the Stray Goblin"
        hidden
      >
        <span class="shiny__goblin" aria-hidden="true">&#128520;</span>
        <span class="shiny__name" data-role="shiny-name">Stray Goblin</span>
      </button>
      <p class="hint">Tap the enemy to attack.</p>
    </main>

    <div class="shiny-toast" data-testid="shiny-toast" data-role="shiny-toast" hidden aria-live="polite"></div>
    <div class="shiny-flourish" data-testid="shiny-flourish" data-role="shiny-flourish" hidden aria-live="polite"></div>
    <div class="milestone-flourish" data-testid="milestone-flourish" data-role="milestone-flourish" hidden aria-live="polite"></div>

    <section class="panel" aria-labelledby="equipped-title">
      <div class="panel__header">
        <h2 class="panel__title" id="equipped-title">Equipped</h2>
      </div>
      <div class="equipped" data-testid="equipped" data-role="equipped"></div>
      <ul class="upgrades" data-role="upgrades">
        <li class="upgrade" data-slot="weapon">
          <span class="upgrade__name">Weapon</span>
          <span class="upgrade__level" data-testid="upgrade-level" data-role="upgrade-level">—</span>
          <span class="upgrade__cost" data-testid="upgrade-cost" data-role="upgrade-cost">—</span>
          <button class="btn btn--primary btn--small" data-testid="upgrade-btn" data-role="upgrade-btn" data-slot="weapon" type="button" disabled>Upgrade</button>
        </li>
        <li class="upgrade" data-slot="ring1">
          <span class="upgrade__name">Left ring</span>
          <span class="upgrade__level" data-testid="upgrade-level-ring1">—</span>
          <span class="upgrade__cost" data-testid="upgrade-cost-ring1">—</span>
          <button class="btn btn--primary btn--small" data-testid="upgrade-btn-ring1" data-role="upgrade-btn-ring1" data-slot="ring1" type="button" disabled>Upgrade</button>
        </li>
        <li class="upgrade" data-slot="ring2">
          <span class="upgrade__name">Right ring</span>
          <span class="upgrade__level" data-testid="upgrade-level-ring2">—</span>
          <span class="upgrade__cost" data-testid="upgrade-cost-ring2">—</span>
          <button class="btn btn--primary btn--small" data-testid="upgrade-btn-ring2" data-role="upgrade-btn-ring2" data-slot="ring2" type="button" disabled>Upgrade</button>
        </li>
        <li class="upgrade" data-slot="necklace">
          <span class="upgrade__name">Necklace</span>
          <span class="upgrade__level" data-testid="upgrade-level-necklace">—</span>
          <span class="upgrade__cost" data-testid="upgrade-cost-necklace">—</span>
          <button class="btn btn--primary btn--small" data-testid="upgrade-btn-necklace" data-role="upgrade-btn-necklace" data-slot="necklace" type="button" disabled>Upgrade</button>
        </li>
      </ul>
      <p class="hint" data-role="upgrade-hint"></p>
    </section>

    <section class="panel" aria-labelledby="bag-title">
      <div class="panel__header">
        <h2 class="panel__title" id="bag-title">Bag</h2>
        <span class="panel__meta"><span data-role="bag-count">0</span> items</span>
      </div>
      <ul class="bag" data-role="bag-list"></ul>
      <p class="hint" data-role="bag-empty">No drops yet — defeat enemies to find gear.</p>
    </section>

    <section class="panel" aria-labelledby="achievements-title">
      <div class="panel__header">
        <h2 class="panel__title" id="achievements-title">Achievements</h2>
        <span class="panel__meta"><span data-testid="achievements-count">0</span> unlocked</span>
      </div>
      <ul class="ach" data-testid="achievements-list"></ul>
    </section>
  </div>

  <div class="splash" data-role="splash" data-testid="achievement-splash" hidden aria-live="polite">
    <span class="splash__burst" aria-hidden="true"></span>
    <span class="splash__kicker">Achievement unlocked</span>
    <span class="splash__title" data-testid="achievement-splash-title"></span>
    <span class="splash__desc" data-role="splash-desc"></span>
  </div>

  <div class="overlay" data-role="choices" hidden>
    <div class="overlay__card" role="dialog" aria-modal="true" aria-labelledby="choices-title">
      <h2 class="overlay__title" id="choices-title" data-role="choices-title">Choice</h2>
      <p class="overlay__body" data-role="choices-body"></p>
      <div class="overlay__actions">
        <button class="btn btn--primary btn--wide" type="button" data-testid="choice-wait" data-role="choice-wait">Wait — free</button>
        <button class="btn btn--ghost" type="button" data-testid="choice-watchAd" data-role="choice-watchAd" disabled aria-disabled="true" title="Placeholder — ad integration is not wired in this build (see NOTES.md)">Watch ad — coming soon</button>
        <button class="btn btn--ghost" type="button" data-testid="choice-iap" data-role="choice-iap" disabled aria-disabled="true" title="Placeholder — purchases are not wired in this build (see NOTES.md)">Buy — coming soon</button>
      </div>
      <p class="overlay__note">The free wait option always works. Ad and purchase paths are placeholders.</p>
    </div>
  </div>

  <div class="overlay" data-role="offline" hidden>
    <div class="overlay__card" role="dialog" aria-modal="true" aria-labelledby="offline-title">
      <h2 class="overlay__title" id="offline-title">Welcome back</h2>
      <p class="overlay__body" data-role="offline-text"></p>
      <button class="btn btn--primary btn--wide" type="button" data-role="offline-dismiss">Continue</button>
    </div>
  </div>
`;

export function mountRenderer(root: HTMLElement, handlers: RendererHandlers): Renderer {
  root.innerHTML = SKELETON;
  const refs = collectRefs(root);
  wireHandlers(refs, handlers);

  let lastEquippedSignature = '';
  let lastBagSignature = '';
  let lastChoiceKey = '';
  let lastAchievementsSignature: string | null = null;

  // Golden Event (Shiny) presentation state. Position/drift is /web-only and
  // NEVER reaches engine state: the engine only knows the window's clock.
  // `lastShinyId` identifies the Shiny currently on screen; when it disappears,
  // a pending claim means the player grabbed it, otherwise it escaped.
  let lastShinyId: string | null = null;
  let lastShinyKind: ShinyKind | null = null;
  let pendingClaim = false;
  let shinyMessageTimer: number | null = null;

  // Milestone step-change presentation: the achieved-milestone count per slot as
  // of the last render (null until the first render seeds it, so a save restored
  // mid-milestone never replays a flourish at boot), plus the flourish timer.
  let seenMilestones: Record<GearSlot, number> | null = null;
  let milestoneMessageTimer: number | null = null;

  // Achievement splash state: a queue so a burst of unlocks is never lost, and
  // a timer that auto-dismisses the current one.
  const splashQueue: AchievementDefinition[] = [];
  let splashTimer: number | null = null;
  // `null` until the first render seeds the set, so achievements restored from a
  // save (or unlocked during offline replay) do not replay as splashes at boot.
  let seenAchievements: Set<string> | null = null;

  function showNextSplash(): void {
    const definition = splashQueue.shift();
    if (definition === undefined) {
      splashTimer = null;
      refs.splash.hidden = true;
      refs.splash.classList.remove('splash--in');
      return;
    }
    refs.splashTitle.textContent = definition.title;
    refs.splashDesc.textContent = definition.description;
    refs.splash.hidden = false;
    // Restart the entrance animation even if a splash is already animating.
    refs.splash.classList.remove('splash--in');
    void refs.splash.offsetWidth;
    refs.splash.classList.add('splash--in');
    if (splashTimer !== null) window.clearTimeout(splashTimer);
    splashTimer = window.setTimeout(dismissSplash, SPLASH_DURATION_MS);
  }

  function enqueueSplash(definition: AchievementDefinition): void {
    splashQueue.push(definition);
    if (splashTimer === null) showNextSplash();
  }

  function dismissSplash(): void {
    if (splashTimer === null) return;
    window.clearTimeout(splashTimer);
    splashTimer = null;
    showNextSplash();
  }

  // Any tap dismisses the current splash early. The overlay never captures the
  // pointer, so the tap also reaches the game underneath (non-blocking).
  root.ownerDocument.addEventListener(
    'pointerdown',
    () => {
      if (splashTimer !== null) dismissSplash();
    },
    { capture: true },
  );

  // A tap on the wandering Stray Goblin is a claim. The renderer marks the
  // claim as its own so the next render can tell a grab from an escape (it
  // deliberately never receives the event list).
  refs.shiny.addEventListener('click', () => {
    pendingClaim = true;
    handlers.onClaim();
  });

  function render(state: GameState, context?: RenderContext): void {
    const stats = getEffectiveStats(state);

    refs.gold.textContent = formatInt(state.player.gold);
    refs.stage.textContent = formatInt(state.combat.stage);
    refs.dps.textContent = formatInt(stats.autoDps);

    const boss = isBoss(state.combat.stage);
    refs.enemyName.textContent = boss ? 'Boss' : 'Enemy';
    refs.bossBadge.hidden = !boss;

    const maxHp = getEnemyMaxHp(state);
    refs.enemyHp.textContent = `${formatInt(Math.min(state.combat.enemyHp, maxHp))} / ${formatInt(maxHp)}`;
    refs.hpFill.style.width = `${hpPercent(state) * FULL_PERCENT}%`;

    renderBoost(state);
    renderShiny(state);

    // Guidance surface. The per-slot advisory powers the "better item in your
    // bag" badges; the stall advisory powers the escalating callout. Both are
    // pure engine reads and NEVER change state — the only way the equipped item
    // changes is the player's own tap on the callout's button.
    const advisories = {} as Record<GearSlot, SlotUpgradeAdvisory>;
    const bestBagIds = new Set<string>();
    for (const slot of EQUIP_SLOTS) {
      const advisory = getSlotUpgradeAdvisory(state, slot);
      advisories[slot] = advisory;
      if (advisory.hasUpgrade && advisory.bestInstanceId !== null) {
        bestBagIds.add(advisory.bestInstanceId);
      }
    }
    renderAdvisory(state, context);

    const equippedSignature = EQUIP_SLOTS.map(
      (slot) => `${gearSignature(state.gear.equipped[slot])}:${advisories[slot].hasUpgrade ? '1' : '0'}`,
    ).join('|');
    if (equippedSignature !== lastEquippedSignature) {
      lastEquippedSignature = equippedSignature;
      refs.equipped.replaceChildren(...equippedNodes(state, advisories));
    }

    const bagSignature = state.gear.bag
      .map(
        (item) =>
          `${item.id}:${item.itemLevel}:${item.upgradeLevel}:${bestBagIds.has(item.id) ? '1' : '0'}`,
      )
      .join('|');
    if (bagSignature !== lastBagSignature) {
      lastBagSignature = bagSignature;
      refs.bagList.replaceChildren(...state.gear.bag.map((item) => bagItemNode(item, bestBagIds.has(item.id))));
      refs.bagEmpty.hidden = state.gear.bag.length > 0;
    }
    refs.bagCount.textContent = formatInt(state.gear.bag.length);

    const equippedWeapon = state.gear.equipped.weapon;
    renderUpgradeControls(state);
    renderMilestones(state);
    refs.upgradeHint.textContent =
      equippedWeapon === null ? 'Equip a weapon from your bag to upgrade it.' : '';

    renderAchievements(state);
    renderChoice(state);
  }

  /**
   * The escalating guidance callout. It states the FACTS plainly — the stage,
   * how long with no progress, and which bag item is stronger by roughly how
   * much — and offers ONE action the player can take: tap to equip. Nothing is
   * ever applied automatically. The callout is inline (never an overlay), so it
   * cannot block the tick loop or collide with the achievement splash or the
   * Shiny messages.
   *
   * `hint` (an early stall) shows only the per-card badges; `nag` (the stall
   * persists) raises this prominent callout. Both come from the engine, so /web
   * holds no thresholds or balance numbers.
   */
  function renderAdvisory(state: GameState, context: RenderContext | undefined): void {
    // A pending choice freezes the world and shows its own overlay; keep the
    // inline callout out of the way until it is resolved.
    const stall: StallAdvisory =
      state.choices.pending !== null
        ? getStallAdvisory(state)
        : getStallAdvisory(state, context?.stageBeganAtMs ?? undefined);

    if (stall.severity !== 'nag' || stall.best === null) {
      refs.advisory.hidden = true;
      refs.advisory.dataset.severity = 'none';
      refs.advisoryEquip.removeAttribute('data-instance-id');
      return;
    }

    const best = stall.best;
    const instanceId = best.bestInstanceId;
    if (instanceId === null) {
      refs.advisory.hidden = true;
      refs.advisory.dataset.severity = 'none';
      refs.advisoryEquip.removeAttribute('data-instance-id');
      return;
    }
    const item = state.gear.bag.find((candidate) => candidate.id === instanceId) ?? null;
    if (item === null) {
      refs.advisory.hidden = true;
      refs.advisory.dataset.severity = 'none';
      refs.advisoryEquip.removeAttribute('data-instance-id');
      return;
    }
    const current = state.gear.equipped[best.slot];
    const bestLevel = formatInt(item.itemLevel);
    const currentLevel = current ? formatInt(current.itemLevel) : null;

    refs.advisoryKicker.textContent = 'Bag check';
    refs.advisoryBody.textContent = advisoryBody(stall, best, bestLevel, currentLevel);
    refs.advisoryEquip.textContent = `Equip the Level ${bestLevel} ${advisorySlotNoun(best.slot)}`;
    refs.advisoryEquip.setAttribute('data-instance-id', instanceId);
    refs.advisory.dataset.severity = stall.severity;
    refs.advisory.hidden = false;
  }

  /**
   * One upgrade control per slot: its own cost (engine getter), its own current
   * upgrade level, and an independent disabled state. Gold is an allocation
   * choice across four slots, not a single mandatory tap.
   */
  function renderUpgradeControls(state: GameState): void {
    for (const slot of EQUIP_SLOTS) {
      const row = refs.upgradeRows[slot];
      const item = state.gear.equipped[slot];
      const cost = getUpgradeCost(state, slot);
      row.level.textContent = item ? `Lv ${formatInt(item.upgradeLevel)}` : '—';
      row.cost.textContent = cost === null ? '—' : `Cost ${formatInt(cost)}`;
      row.button.disabled = cost === null || state.player.gold < cost;
    }
  }

  /**
   * The visible step change. When an upgrade crosses a milestone, the host gets
   * no event list, so the renderer diffs each slot's achieved-milestone count
   * across renders (the same technique the achievement splash uses). The first
   * render only seeds the counts.
   */
  function renderMilestones(state: GameState): void {
    const milestones = getSlotMilestones(state);
    const counts = {} as Record<GearSlot, number>;
    for (const slot of EQUIP_SLOTS) counts[slot] = milestones[slot]?.achievedCount ?? 0;

    const previous = seenMilestones;
    seenMilestones = counts;
    if (previous === null) return;

    let reached: { slot: GearSlot; info: MilestoneInfo } | null = null;
    for (const slot of EQUIP_SLOTS) {
      if (counts[slot] <= previous[slot]) continue;
      const info = milestones[slot];
      if (info) reached = { slot, info };
    }
    if (reached) showMilestoneFlourish(reached.slot, reached.info);
  }

  /**
   * A brief, non-blocking flourish for a crossed milestone: it reuses the
   * transient-message vocabulary but sits ABOVE the Shiny toast/flourish so it
   * never collides with them or the centered achievement splash. It is
   * pointer-events:none and never touches engine state or the tick loop.
   */
  function showMilestoneFlourish(slot: GearSlot, info: MilestoneInfo): void {
    refs.milestoneFlourish.textContent =
      `★ ${upgradeSlotLabel(slot)} milestone ×${formatInt(info.achievedCount)} — ${info.bonusDescription}`;
    refs.milestoneFlourish.hidden = false;
    refs.milestoneFlourish.classList.remove('shiny-message--in');
    void refs.milestoneFlourish.offsetWidth;
    refs.milestoneFlourish.classList.add('shiny-message--in');
    if (milestoneMessageTimer !== null) window.clearTimeout(milestoneMessageTimer);
    milestoneMessageTimer = window.setTimeout(() => {
      refs.milestoneFlourish.hidden = true;
      refs.milestoneFlourish.classList.remove('shiny-message--in');
      milestoneMessageTimer = null;
    }, MILESTONE_MESSAGE_MS);
  }

  function renderAchievements(state: GameState): void {
    const unlocked = new Set(state.meta.achievements);

    if (seenAchievements === null) {
      seenAchievements = new Set(state.meta.achievements);
    } else {
      for (const id of state.meta.achievements) {
        if (seenAchievements.has(id)) continue;
        seenAchievements.add(id);
        const definition = ACHIEVEMENT_BY_ID.get(id);
        if (definition) enqueueSplash(definition);
      }
    }

    refs.achievementsCount.textContent = formatInt(unlocked.size);

    const signature = state.meta.achievements.join('|');
    if (signature !== lastAchievementsSignature) {
      lastAchievementsSignature = signature;
      refs.achievementsList.replaceChildren(...achievementNodes(unlocked));
    }
  }

  function renderChoice(state: GameState): void {
    const pending = state.choices.pending;
    refs.choices.hidden = pending === null;

    const key = pending === null ? '' : `${pending.kind}:${pending.stage}`;
    if (key === lastChoiceKey) return;
    lastChoiceKey = key;
    if (pending === null) return;

    refs.choicesTitle.textContent = pending.kind === 'boss-check' ? 'Boss check' : 'Progression wall';
    refs.choicesBody.textContent = choiceBody(state, pending);
  }

  function showOfflineSummary(summary: OfflineSummary): void {
    refs.offlineText.textContent = offlineText(summary);
    refs.offline.hidden = false;
  }

  /**
   * The active frenzy pill: label from the engine's multiplier, countdown from
   * the engine's clock. Hidden while no boost is running. While a choice is
   * pending the world is frozen, so the countdown naturally holds.
   */
  function renderBoost(state: GameState): void {
    const boost = getActiveBoost(state);
    if (boost === null) {
      refs.boostPill.hidden = true;
      return;
    }
    const remainingMs = Math.max(0, boost.expiresAtMs - state.meta.totalPlayedMs);
    refs.boostLabel.textContent = `FRENZY ×${formatMultiplier(boost.dpsMultiplier)}`;
    refs.boostTimer.textContent = `${Math.ceil(remainingMs / MS_PER_SECOND)}s`;
    refs.boostPill.hidden = false;
  }

  /**
   * The wandering Stray Goblin. The engine owns the window; /web owns only its
   * on-screen position and drift. When a Shiny disappears, a pending claim is a
   * grab (flourish); otherwise it escaped (toast) — and missing it costs
   * nothing, which the toast says out loud.
   */
  function renderShiny(state: GameState): void {
    // While a choice is pending the world is frozen: the Shiny window pauses
    // too, so hide the (unclaimable) target without treating it as escaped.
    if (state.choices.pending) {
      refs.shiny.hidden = true;
      return;
    }

    const active = getActiveEvent(state);
    const id = active ? `${active.kind}:${active.spawnedAtMs}` : null;

    if (active) {
      if (id !== lastShinyId) {
        lastShinyId = id;
        lastShinyKind = active.kind;
        refs.shiny.dataset.kind = active.kind;
        refs.shinyName.textContent = shinyName(active.kind);
        // Restart the drift each time a NEW Shiny appears so it always wanders
        // across a fresh screen. Reduced-motion users get a static target.
        refs.shiny.classList.remove('shiny--drift');
        void refs.shiny.offsetWidth;
        refs.shiny.classList.add('shiny--drift');
      }
      // Same Shiny still on screen: the claim (if any) did not take.
      pendingClaim = false;
      refs.shiny.hidden = false;
      return;
    }

    // The previously-shown Shiny is gone: a pending claim means the player
    // grabbed it, otherwise it escaped — and missing it costs nothing.
    if (lastShinyId !== null) {
      if (pendingClaim && lastShinyKind !== null) showShinyFlourish(lastShinyKind, state);
      else showShinyToast();
    }
    lastShinyId = null;
    lastShinyKind = null;
    pendingClaim = false;
    refs.shiny.hidden = true;
    refs.shiny.classList.remove('shiny--drift');
  }

  function showShinyToast(): void {
    showShinyMessage(refs.shinyToast, "It got away. It's fine. You didn't want it anyway.");
  }

  function showShinyFlourish(kind: ShinyKind, state: GameState): void {
    const boost = getActiveBoost(state);
    let message = 'GOTCHA! Shiny claimed.';
    if (kind === 'frenzy' && boost) {
      message = `GOTCHA! FRENZY ×${formatMultiplier(boost.dpsMultiplier)}`;
    } else if (kind === 'drop') {
      message = 'GOTCHA! Ring grabbed — check your bag.';
    }
    showShinyMessage(refs.shinyFlourish, message);
  }

  function showShinyMessage(element: HTMLElement, text: string): void {
    element.textContent = text;
    element.hidden = false;
    element.classList.remove('shiny-message--in');
    void element.offsetWidth;
    element.classList.add('shiny-message--in');
    if (shinyMessageTimer !== null) window.clearTimeout(shinyMessageTimer);
    shinyMessageTimer = window.setTimeout(() => {
      element.hidden = true;
      element.classList.remove('shiny-message--in');
      shinyMessageTimer = null;
    }, SHINY_MESSAGE_MS);
  }

  return { render, showOfflineSummary };
}

/** Format a damage multiplier without trailing zeros (e.g. 5, 2.5). */
function formatMultiplier(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** The Stray Goblin's label for the reward it is carrying (engine-owned kind). */
function shinyName(kind: ShinyKind): string {
  if (kind === 'frenzy') return 'FRENZY goblin!';
  if (kind === 'drop') return 'Ring goblin!';
  return 'Gold goblin!';
}

/** Every occupiable gear slot, in display order. */
const EQUIP_SLOTS: readonly GearSlot[] = ['weapon', 'ring1', 'ring2', 'necklace'];

/** The upgrade-button testid for a slot (the weapon keeps the original testid). */
function upgradeButtonTestId(slot: GearSlot): string {
  return slot === 'weapon' ? 'upgrade-btn' : `upgrade-btn-${slot}`;
}

function upgradeCostTestId(slot: GearSlot): string {
  return slot === 'weapon' ? 'upgrade-cost' : `upgrade-cost-${slot}`;
}

function upgradeLevelTestId(slot: GearSlot): string {
  return slot === 'weapon' ? 'upgrade-level' : `upgrade-level-${slot}`;
}

function milestoneBadgeTestId(slot: GearSlot): string {
  return slot === 'weapon' ? 'milestone-badge' : `milestone-badge-${slot}`;
}

/** The "better item in your bag" badge testid for a slot. */
function upgradeBadgeTestId(slot: GearSlot): string {
  return slot === 'weapon' ? 'upgrade-advisory-badge' : `upgrade-advisory-badge-${slot}`;
}

/** Short slot noun used in advisory copy (both rings read as "ring"). */
function advisorySlotNoun(slot: GearSlot): string {
  if (slot === 'weapon') return 'weapon';
  if (slot === 'necklace') return 'necklace';
  return 'ring';
}

/**
 * The nag callout's fact line, assembled from engine values only: the stage,
 * the elapsed stall, the better item's level, and roughly how much stronger it
 * is (the engine's ratio). Snarky in tone but the facts are unambiguous, and
 * the actionable button sits right below it.
 */
function advisoryBody(
  stall: StallAdvisory,
  best: SlotUpgradeAdvisory,
  bestLevel: string,
  currentLevel: string | null,
): string {
  const stage = formatInt(stall.stage);
  const duration = formatStallDuration(stall.stalledMs);
  const noun = advisorySlotNoun(best.slot);
  if (currentLevel === null) {
    return (
      `Stage ${stage} — ${duration} with no progress. Your ${noun} slot is empty and a ` +
      `Level ${bestLevel} ${noun} is sitting in your bag. It won't equip itself.`
    );
  }
  const ratio = Number.isFinite(best.ratio) && best.ratio >= 1.05 ? `~${best.ratio.toFixed(1)}× ` : '';
  return (
    `Stage ${stage} — ${duration} with no progress. The Level ${bestLevel} ${noun} in your bag ` +
    `is ${ratio}the power of the Level ${currentLevel} you're running. It won't equip itself.`
  );
}

/** Stall duration: seconds under a minute, otherwise the shared duration format. */
function formatStallDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < MS_PER_MINUTE) {
    const seconds = Math.max(0, Math.floor(ms / MS_PER_SECOND));
    return `${seconds} s`;
  }
  return formatDuration(ms);
}

/** Short slot name used in upgrade/milestone copy. */
function upgradeSlotLabel(slot: GearSlot): string {
  if (slot === 'weapon') return 'Weapon';
  if (slot === 'ring1') return 'Left ring';
  if (slot === 'ring2') return 'Right ring';
  return 'Necklace';
}

/** Resolve the four per-slot upgrade controls from the mounted DOM. */
function collectUpgradeRows(root: ParentNode): Record<GearSlot, UpgradeRow> {
  const rows = {} as Record<GearSlot, UpgradeRow>;
  for (const slot of EQUIP_SLOTS) {
    rows[slot] = {
      button: req(root, `[data-testid="${upgradeButtonTestId(slot)}"]`),
      cost: req(root, `[data-testid="${upgradeCostTestId(slot)}"]`),
      level: req(root, `[data-testid="${upgradeLevelTestId(slot)}"]`),
    };
  }
  return rows;
}

function collectRefs(root: HTMLElement): Refs {
  return {
    gold: req(root, '[data-testid="gold"]'),
    stage: req(root, '[data-testid="stage"]'),
    dps: req(root, '[data-testid="dps"]'),
    enemy: req(root, '[data-testid="enemy"]'),
    enemyName: req(root, '[data-role="enemy-name"]'),
    bossBadge: req(root, '[data-role="boss-badge"]'),
    enemyHp: req(root, '[data-testid="enemy-hp"]'),
    hpFill: req(root, '[data-role="hp-fill"]'),
    boostPill: req(root, '[data-testid="boost-pill"]'),
    boostLabel: req(root, '[data-role="boost-label"]'),
    boostTimer: req(root, '[data-role="boost-timer"]'),
    shiny: req(root, '[data-testid="shiny"]'),
    shinyName: req(root, '[data-role="shiny-name"]'),
    shinyToast: req(root, '[data-testid="shiny-toast"]'),
    shinyFlourish: req(root, '[data-testid="shiny-flourish"]'),
    milestoneFlourish: req(root, '[data-testid="milestone-flourish"]'),
    advisory: req(root, '[data-role="upgrade-advisory"]'),
    advisoryKicker: req(root, '[data-role="advisory-kicker"]'),
    advisoryBody: req(root, '[data-role="advisory-body"]'),
    advisoryEquip: req(root, '[data-testid="upgrade-advisory-equip"]'),
    upgradeRows: collectUpgradeRows(root),
    upgradeHint: req(root, '[data-role="upgrade-hint"]'),
    equipped: req(root, '[data-role="equipped"]'),
    bagList: req(root, '[data-role="bag-list"]'),
    bagEmpty: req(root, '[data-role="bag-empty"]'),
    bagCount: req(root, '[data-role="bag-count"]'),
    achievementsList: req(root, '[data-testid="achievements-list"]'),
    achievementsCount: req(root, '[data-testid="achievements-count"]'),
    choices: req(root, '[data-role="choices"]'),
    choicesTitle: req(root, '[data-role="choices-title"]'),
    choicesBody: req(root, '[data-role="choices-body"]'),
    waitBtn: req(root, '[data-testid="choice-wait"]'),
    watchAdBtn: req(root, '[data-testid="choice-watchAd"]'),
    iapBtn: req(root, '[data-testid="choice-iap"]'),
    offline: req(root, '[data-role="offline"]'),
    offlineText: req(root, '[data-role="offline-text"]'),
    offlineDismiss: req(root, '[data-role="offline-dismiss"]'),
    splash: req(root, '[data-role="splash"]'),
    splashTitle: req(root, '[data-testid="achievement-splash-title"]'),
    splashDesc: req(root, '[data-role="splash-desc"]'),
  };
}

function wireHandlers(refs: Refs, handlers: RendererHandlers): void {
  refs.enemy.addEventListener('click', () => handlers.onClick());
  for (const slot of EQUIP_SLOTS) {
    refs.upgradeRows[slot].button.addEventListener('click', () => handlers.onUpgrade(slot));
  }
  refs.waitBtn.addEventListener('click', () => handlers.onChoice('wait'));
  refs.watchAdBtn.addEventListener('click', () => handlers.onChoice('watchAd'));
  refs.iapBtn.addEventListener('click', () => handlers.onChoice('iap'));
  refs.offlineDismiss.addEventListener('click', () => {
    refs.offline.hidden = true;
  });

  // The advisory's ONE action: the player taps to equip the item the engine
  // flagged. It dispatches the EXISTING `equip` action — nothing is automatic.
  refs.advisoryEquip.addEventListener('click', () => {
    const instanceId = refs.advisoryEquip.getAttribute('data-instance-id');
    if (instanceId !== null) handlers.onEquip(instanceId);
  });

  // Event delegation keeps equip buttons working across bag re-renders.
  refs.bagList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLButtonElement>('[data-instance-id]');
    if (!button) return;
    const instanceId = button.getAttribute('data-instance-id');
    if (instanceId !== null) handlers.onEquip(instanceId);
  });
}

/** Cache signature for one equipped slot (or its emptiness). */
function gearSignature(item: GearInstance | null): string {
  return item ? `${item.id}:${item.itemLevel}:${item.upgradeLevel}` : '-';
}

/**
 * The equipped panel: a weapon card plus a card for each equipped ring/necklace.
 * Empty non-weapon slots are omitted to keep the panel compact; the weapon slot
 * always renders (as an empty placeholder before the first weapon).
 */
function equippedNodes(
  state: GameState,
  advisories: Record<GearSlot, SlotUpgradeAdvisory>,
): Node[] {
  const cards: Node[] = [gearCard(state, 'weapon', state.gear.equipped.weapon, advisories.weapon)];
  for (const slot of EQUIP_SLOTS) {
    if (slot === 'weapon') continue;
    const item = state.gear.equipped[slot];
    if (item) cards.push(gearCard(state, slot, item, advisories[slot]));
  }
  return cards;
}

function gearCard(
  state: GameState,
  slot: GearSlot,
  item: GearInstance | null,
  advisory: SlotUpgradeAdvisory,
): Node {
  const card = document.createElement('div');
  card.className = 'card';

  const title = document.createElement('p');
  title.className = 'card__title';
  title.textContent = slotLabel(slot, item);

  const stats = document.createElement('p');
  stats.className = 'card__stats';
  stats.textContent = item ? gearStatLine(state, slot, item) : 'Equip a drop from your bag.';

  card.append(title, stats, milestoneBadge(slot, item), upgradeBadge(slot, advisory));
  return card;
}

/**
 * The modest `hint` badge: a non-intrusive note that a strictly better item for
 * this slot is waiting in the bag. The engine decides whether one exists and by
 * how much (the shared power metric); /web only renders the fact. Shown for any
 * available upgrade, independent of the stall window, so guidance is visible
 * early rather than only after a nag.
 */
function upgradeBadge(slot: GearSlot, advisory: SlotUpgradeAdvisory): HTMLElement {
  const badge = document.createElement('p');
  badge.className = 'card__advisory';
  badge.setAttribute('data-testid', upgradeBadgeTestId(slot));
  badge.setAttribute('data-slot', slot);
  if (advisory.hasUpgrade) {
    badge.textContent = `↑ Better ${advisorySlotNoun(slot)} in your bag`;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
  return badge;
}

/**
 * The milestone badge for an equipped card. Hidden until the item has crossed a
 * milestone; when shown it reads e.g. "★ ×2 — +1.0% power". Both the count and
 * the wording come from the engine getter, so /web holds no balance number.
 */
function milestoneBadge(slot: GearSlot, item: GearInstance | null): HTMLElement {
  const badge = document.createElement('p');
  badge.className = 'card__milestone';
  badge.setAttribute('data-testid', milestoneBadgeTestId(slot));
  badge.setAttribute('data-slot', slot);

  const info = getMilestoneInfo(slot, item ? item.upgradeLevel : 0);
  if (item && info.achievedCount > 0) {
    badge.textContent = `★ ×${formatInt(info.achievedCount)} — ${info.bonusDescription}`;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
  return badge;
}

function slotLabel(slot: GearSlot, item: GearInstance | null): string {
  const level = item ? formatInt(item.itemLevel) : null;
  if (slot === 'weapon') return item ? `Weapon · level ${level}` : 'No weapon equipped';
  if (slot === 'ring1') return item ? `Ring (left) · level ${level}` : 'No left ring';
  if (slot === 'ring2') return item ? `Ring (right) · level ${level}` : 'No right ring';
  return item ? `Necklace · level ${level}` : 'No necklace';
}

/**
 * Equipped-card stat line. The per-item crit/gold/power values are the item's
 * own RAW contribution, which the engine then clamps when it aggregates both
 * rings and the necklace — so each is labelled "(raw)" and the card also shows
 * the current CAPPED totals (via `getCritStats`/`getGlobalBonuses`). This keeps
 * the card honest without hard-coding any balance number in `/web`.
 */
function gearStatLine(state: GameState, slot: GearSlot, item: GearInstance): string {
  const gear = getGearStats(item);
  if (slot === 'weapon') {
    return `DPS ${formatInt(gear.dps)} · click ${formatInt(gear.clickDamage)} · upgrades ${formatInt(item.upgradeLevel)}`;
  }
  if (slot === 'necklace') {
    const { goldMultiplier, powerMultiplier } = getGlobalBonuses(state);
    return (
      `gold +${formatPercent(gear.goldMultiplier)} (raw) · power +${formatPercent(gear.powerMultiplier)} (raw) · ` +
      `total gold +${formatPercent(goldMultiplier)} · power +${formatPercent(powerMultiplier)} (capped)`
    );
  }
  const { critChance, critMultiplier } = getCritStats(state);
  return (
    `crit ${formatPercent(gear.critChance)} (raw) · crit dmg +${formatPercent(gear.critMultiplier)} (raw) · ` +
    `total crit ${formatPercent(critChance)} · crit dmg +${formatPercent(critMultiplier - 1)} (capped)`
  );
}

function bagItemNode(item: GearInstance, isUpgrade: boolean): Node {
  const li = document.createElement('li');
  li.className = `bag__item${isUpgrade ? ' bag__item--upgrade' : ''}`;
  const slot = gearDefinitionFor(item.definitionId)?.slot ?? 'weapon';
  li.setAttribute('data-slot', slot);
  if (isUpgrade) li.setAttribute('data-upgrade', 'true');

  const info = document.createElement('span');
  info.className = 'bag__info';
  info.textContent = bagItemSummary(slot, item);

  const tag = document.createElement('span');
  tag.className = 'bag__tag';
  tag.setAttribute('data-testid', 'bag-upgrade-tag');
  tag.textContent = '↑ Better';
  tag.hidden = !isUpgrade;

  const equipButton = document.createElement('button');
  equipButton.className = 'btn btn--small';
  equipButton.type = 'button';
  equipButton.textContent = 'Equip';
  equipButton.setAttribute('data-testid', 'equip-btn');
  equipButton.setAttribute('data-slot', slot);
  equipButton.setAttribute('data-instance-id', item.id);

  li.append(info, tag, equipButton);
  return li;
}

/**
 * Slot-aware one-line summary of a bag item (no balance numbers hard-coded).
 * A bag item's crit/gold/power values are labelled "(raw)": they are the item's
 * own contribution before the engine clamps the aggregate, and a bag item is not
 * equipped so there is no meaningful total to show here.
 */
function bagItemSummary(slot: GearSlot, item: GearInstance): string {
  const gear = getGearStats(item);
  const level = `Level ${formatInt(item.itemLevel)}`;
  if (slot === 'necklace') {
    return `${level} · gold +${formatPercent(gear.goldMultiplier)} (raw) · power +${formatPercent(gear.powerMultiplier)} (raw)`;
  }
  if (slot === 'ring1' || slot === 'ring2') {
    return `${level} · crit ${formatPercent(gear.critChance)} (raw) · crit dmg +${formatPercent(gear.critMultiplier)} (raw)`;
  }
  return `${level} · DPS ${formatInt(gear.dps)} · click ${formatInt(gear.clickDamage)}`;
}

/** The achievements shelf: unlocked entries show title+description, locked tease. */
function achievementNodes(unlocked: Set<string>): Node[] {
  return ACHIEVEMENTS.map((definition) => {
    const isUnlocked = unlocked.has(definition.id);
    const li = document.createElement('li');
    li.className = `ach__item${isUnlocked ? ' ach__item--unlocked' : ''}`;
    li.setAttribute('data-testid', 'achievement-item');
    if (isUnlocked) li.setAttribute('data-unlocked', 'true');

    const title = document.createElement('span');
    title.className = 'ach__title';
    title.textContent = isUnlocked ? definition.title : '???';

    const description = document.createElement('span');
    description.className = 'ach__desc';
    description.textContent = isUnlocked ? definition.description : 'Locked';

    li.append(title, description);
    return li;
  });
}

function choiceBody(state: GameState, pending: PendingChoice): string {
  const projected = getProjectedKillMs(state);
  const projectedText = projected === null ? '' : ` Projected time to kill: ${formatInt(projected)} ms.`;
  if (pending.kind === 'boss-check') {
    return `Stage ${formatInt(pending.stage)} is a boss check and you are below the boss timer.${projectedText}`;
  }
  return `Stage ${formatInt(pending.stage)} is a progression wall.${projectedText}`;
}

function offlineText(summary: OfflineSummary): string {
  const duration = formatDuration(summary.simulatedMs);
  const earned = formatInt(summary.goldEarned);
  const capped = summary.capped ? ' Offline progress is capped.' : '';
  return `You earned ${earned} gold while away for about ${duration}.${capped}`;
}

function hpPercent(state: GameState): number {
  const enemyHp = state.combat.enemyHp;
  const enemyMaxHp = getEnemyMaxHp(state);
  if (!Number.isFinite(enemyHp) || !Number.isFinite(enemyMaxHp) || enemyMaxHp <= 0) return 0;
  const ratio = enemyHp / enemyMaxHp;
  return Math.max(0, Math.min(1, ratio));
}

function formatInt(value: number): string {
  return String(Math.floor(value));
}

/** Format a fractional contribution (crit/gold/power) as a percentage. */
function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / MS_PER_MINUTE);
  if (totalMinutes < 1) return 'less than a minute';
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  if (hours < 1) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function req<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`[aac] renderer could not find required element: ${selector}`);
  }
  return element;
}
