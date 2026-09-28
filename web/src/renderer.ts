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
  getProjectedKillMs,
  getUpgradeCost,
  isBoss,
} from '@auto-auto-clicker/engine-core';
import type {
  AchievementDefinition,
  GameState,
  GearInstance,
  GearSlot,
  PendingChoice,
  ShinyKind,
} from '@auto-auto-clicker/engine-core';

type ChoiceOption = PendingChoice['options'][number];

export interface RendererHandlers {
  /** The player tapped the enemy. */
  onClick(): void;
  /** The player asked to upgrade the equipped weapon. */
  onUpgrade(): void;
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

export interface Renderer {
  /** Project the given state onto the DOM. */
  render(state: GameState): void;
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
const MS_PER_SECOND = 1000;

/** Achievement catalog keyed by id, for splash lookup. */
const ACHIEVEMENT_BY_ID = new Map<string, AchievementDefinition>(
  ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]),
);

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
  upgradeBtn: HTMLButtonElement;
  upgradeCost: HTMLElement;
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

    <section class="panel" aria-labelledby="equipped-title">
      <div class="panel__header">
        <h2 class="panel__title" id="equipped-title">Equipped</h2>
        <span class="panel__meta" data-role="upgrade-cost">—</span>
      </div>
      <div class="equipped" data-testid="equipped" data-role="equipped"></div>
      <button class="btn btn--primary btn--wide" data-testid="upgrade-btn" data-role="upgrade-btn" type="button">Upgrade weapon</button>
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

  function render(state: GameState): void {
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

    const equippedSignature = EQUIP_SLOTS.map((slot) => gearSignature(state.gear.equipped[slot]))
      .join('|');
    if (equippedSignature !== lastEquippedSignature) {
      lastEquippedSignature = equippedSignature;
      refs.equipped.replaceChildren(...equippedNodes(state));
    }

    const bagSignature = state.gear.bag
      .map((item) => `${item.id}:${item.itemLevel}:${item.upgradeLevel}`)
      .join('|');
    if (bagSignature !== lastBagSignature) {
      lastBagSignature = bagSignature;
      refs.bagList.replaceChildren(...state.gear.bag.map(bagItemNode));
      refs.bagEmpty.hidden = state.gear.bag.length > 0;
    }
    refs.bagCount.textContent = formatInt(state.gear.bag.length);

    const equippedWeapon = state.gear.equipped.weapon;
    const cost = getUpgradeCost(state, 'weapon');
    refs.upgradeCost.textContent = cost === null ? '—' : `Cost ${formatInt(cost)}`;
    refs.upgradeBtn.disabled = cost === null || state.player.gold < cost;
    refs.upgradeHint.textContent = equippedWeapon === null ? 'Equip a weapon from your bag to upgrade it.' : '';

    renderAchievements(state);
    renderChoice(state);
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
    upgradeBtn: req(root, '[data-testid="upgrade-btn"]'),
    upgradeCost: req(root, '[data-role="upgrade-cost"]'),
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
  refs.upgradeBtn.addEventListener('click', () => handlers.onUpgrade());
  refs.waitBtn.addEventListener('click', () => handlers.onChoice('wait'));
  refs.watchAdBtn.addEventListener('click', () => handlers.onChoice('watchAd'));
  refs.iapBtn.addEventListener('click', () => handlers.onChoice('iap'));
  refs.offlineDismiss.addEventListener('click', () => {
    refs.offline.hidden = true;
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
function equippedNodes(state: GameState): Node[] {
  const cards: Node[] = [gearCard(state, 'weapon', state.gear.equipped.weapon)];
  for (const slot of EQUIP_SLOTS) {
    if (slot === 'weapon') continue;
    const item = state.gear.equipped[slot];
    if (item) cards.push(gearCard(state, slot, item));
  }
  return cards;
}

function gearCard(state: GameState, slot: GearSlot, item: GearInstance | null): Node {
  const card = document.createElement('div');
  card.className = 'card';

  const title = document.createElement('p');
  title.className = 'card__title';
  title.textContent = slotLabel(slot, item);

  const stats = document.createElement('p');
  stats.className = 'card__stats';
  stats.textContent = item ? gearStatLine(state, slot, item) : 'Equip a drop from your bag.';

  card.append(title, stats);
  return card;
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

function bagItemNode(item: GearInstance): Node {
  const li = document.createElement('li');
  li.className = 'bag__item';
  const slot = gearDefinitionFor(item.definitionId)?.slot ?? 'weapon';
  li.setAttribute('data-slot', slot);

  const info = document.createElement('span');
  info.className = 'bag__info';
  info.textContent = bagItemSummary(slot, item);

  const equipButton = document.createElement('button');
  equipButton.className = 'btn btn--small';
  equipButton.type = 'button';
  equipButton.textContent = 'Equip';
  equipButton.setAttribute('data-testid', 'equip-btn');
  equipButton.setAttribute('data-slot', slot);
  equipButton.setAttribute('data-instance-id', item.id);

  li.append(info, equipButton);
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
