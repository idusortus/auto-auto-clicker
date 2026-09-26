// renderer.ts — imperative DOM renderer for engine state.
//
// The renderer is a pure function of the GameState it is handed: it owns no
// game rules, no balance numbers, and never mutates engine state. Every value
// it displays comes from engine-core (state fields or exported getters). All
// player input is forwarded to the host through the handlers passed to
// mountRenderer; the renderer never dispatches actions itself.

import {
  getEffectiveStats,
  getEnemyMaxHp,
  getGearStats,
  getProjectedKillMs,
  getUpgradeCost,
  isBoss,
} from '@auto-auto-clicker/engine-core';
import type { GameState, GearInstance, PendingChoice } from '@auto-auto-clicker/engine-core';

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

// Presentation constant: CSS widths are expressed in percent.
const FULL_PERCENT = 100;
// Presentation constants for human-readable durations (not gameplay numbers).
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

interface Refs {
  gold: HTMLElement;
  stage: HTMLElement;
  dps: HTMLElement;
  enemy: HTMLButtonElement;
  enemyName: HTMLElement;
  bossBadge: HTMLElement;
  enemyHp: HTMLElement;
  hpFill: HTMLElement;
  upgradeBtn: HTMLButtonElement;
  upgradeCost: HTMLElement;
  upgradeHint: HTMLElement;
  equipped: HTMLElement;
  bagList: HTMLElement;
  bagEmpty: HTMLElement;
  bagCount: HTMLElement;
  choices: HTMLElement;
  choicesTitle: HTMLElement;
  choicesBody: HTMLElement;
  waitBtn: HTMLButtonElement;
  watchAdBtn: HTMLButtonElement;
  iapBtn: HTMLButtonElement;
  offline: HTMLElement;
  offlineText: HTMLElement;
  offlineDismiss: HTMLButtonElement;
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

    <main class="stage">
      <button class="enemy" data-testid="enemy" type="button" aria-label="Attack the enemy">
        <span class="enemy__badge" data-role="boss-badge" hidden>Boss</span>
        <span class="enemy__name" data-role="enemy-name">Enemy</span>
        <span class="enemy__hp">
          <span class="hp-bar"><span class="hp-bar__fill" data-role="hp-fill"></span></span>
          <span class="enemy__hp-text" data-testid="enemy-hp">0 / 0</span>
        </span>
      </button>
      <p class="hint">Tap the enemy to attack.</p>
    </main>

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

    const equippedWeapon = state.gear.equipped.weapon;
    const equippedSignature = equippedWeapon
      ? `${equippedWeapon.id}:${equippedWeapon.itemLevel}:${equippedWeapon.upgradeLevel}`
      : 'empty';
    if (equippedSignature !== lastEquippedSignature) {
      lastEquippedSignature = equippedSignature;
      refs.equipped.replaceChildren(...equippedNodes(equippedWeapon));
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

    const cost = getUpgradeCost(state, 'weapon');
    refs.upgradeCost.textContent = cost === null ? '—' : `Cost ${formatInt(cost)}`;
    refs.upgradeBtn.disabled = cost === null || state.player.gold < cost;
    refs.upgradeHint.textContent = equippedWeapon === null ? 'Equip a weapon from your bag to upgrade it.' : '';

    renderChoice(state);
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

  return { render, showOfflineSummary };
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
    upgradeBtn: req(root, '[data-testid="upgrade-btn"]'),
    upgradeCost: req(root, '[data-role="upgrade-cost"]'),
    upgradeHint: req(root, '[data-role="upgrade-hint"]'),
    equipped: req(root, '[data-role="equipped"]'),
    bagList: req(root, '[data-role="bag-list"]'),
    bagEmpty: req(root, '[data-role="bag-empty"]'),
    bagCount: req(root, '[data-role="bag-count"]'),
    choices: req(root, '[data-role="choices"]'),
    choicesTitle: req(root, '[data-role="choices-title"]'),
    choicesBody: req(root, '[data-role="choices-body"]'),
    waitBtn: req(root, '[data-testid="choice-wait"]'),
    watchAdBtn: req(root, '[data-testid="choice-watchAd"]'),
    iapBtn: req(root, '[data-testid="choice-iap"]'),
    offline: req(root, '[data-role="offline"]'),
    offlineText: req(root, '[data-role="offline-text"]'),
    offlineDismiss: req(root, '[data-role="offline-dismiss"]'),
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

function equippedNodes(weapon: GearInstance | null): Node[] {
  const card = document.createElement('div');
  card.className = 'card';

  const title = document.createElement('p');
  title.className = 'card__title';
  title.textContent = weapon ? `Weapon · level ${formatInt(weapon.itemLevel)}` : 'No weapon equipped';

  const stats = document.createElement('p');
  stats.className = 'card__stats';
  if (weapon) {
    const gear = getGearStats(weapon);
    stats.textContent = `DPS ${formatInt(gear.dps)} · click ${formatInt(gear.clickDamage)} · upgrades ${formatInt(weapon.upgradeLevel)}`;
  } else {
    stats.textContent = 'Equip a drop from your bag.';
  }

  card.append(title, stats);
  return [card];
}

function bagItemNode(item: GearInstance): Node {
  const li = document.createElement('li');
  li.className = 'bag__item';

  const gear = getGearStats(item);
  const info = document.createElement('span');
  info.className = 'bag__info';
  info.textContent = `Level ${formatInt(item.itemLevel)} · DPS ${formatInt(gear.dps)} · click ${formatInt(gear.clickDamage)}`;

  const equipButton = document.createElement('button');
  equipButton.className = 'btn btn--small';
  equipButton.type = 'button';
  equipButton.textContent = 'Equip';
  equipButton.setAttribute('data-testid', 'equip-btn');
  equipButton.setAttribute('data-instance-id', item.id);

  li.append(info, equipButton);
  return li;
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
