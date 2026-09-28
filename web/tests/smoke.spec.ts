import { expect, test as base } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ACTIVE_THEME, getMilestoneInfo } from '@auto-auto-clicker/engine-core';

// Phase 5 — mobile-viewport smoke test for the /web host.
//
// These tests drive the real Vite dev server through Playwright's mobile
// Chromium emulation (390x844, touch, DPR 3). They assert only observable app
// behaviour: DOM hooks, HP/upgrade/dps readouts, gold spending, and touch-target
// geometry. Gameplay numbers are read from the DOM, never hard-coded, so a
// balance change cannot make the smoke test brittle.
//
// They are also THEME-AGNOSTIC (T5): every expected display string and asset URL
// is derived from the ACTIVE_THEME this build ships, so swapping the theme (one
// line in engine-core/src/theme/index.ts) does not require editing this file.
// Identity (testids, classes, definition ids) is still asserted literally.

const MIN_TOUCH_TARGET_PX = 44;

type Fixtures = {
  /** Console errors and uncaught page errors seen during a test. */
  consoleErrors: string[];
};

const test = base.extend<Fixtures>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      // The dev-server-less favicon fetch 404s as "Failed to load resource";
      // a missing favicon is not an application error.
      if (/favicon\.ico/.test(message.text()) || /favicon\.ico/.test(message.location().url)) {
        return;
      }
      errors.push(`console.error: ${message.text()}`);
    });
    page.on('pageerror', (error) => {
      errors.push(`pageerror: ${error.message}`);
    });
    await use(errors);
  },
});

// Every test boots a brand-new game: the app autosaves to localStorage, so a
// stale save would otherwise leak state (and offline replay) between runs.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
});

test('boots on a 390x844 mobile viewport with the core UI visible', async ({
  page,
  consoleErrors,
}) => {
  await page.goto('/');

  await expect(page.getByTestId('gold')).toBeVisible();
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByTestId('enemy')).toBeVisible();
  await expect(page.getByTestId('upgrade-btn')).toBeVisible();

  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
  expect(consoleErrors).toEqual([]);
});

test('tapping the enemy reduces its HP', async ({ page, consoleErrors }) => {
  await page.goto('/');

  const enemy = page.getByTestId('enemy');
  const enemyHp = page.getByTestId('enemy-hp');
  await expect(enemy).toBeVisible();
  await expect(enemyHp).toBeVisible();

  const hpBefore = parseLeadingInt(await enemyHp.textContent());

  for (let tap = 0; tap < 5; tap += 1) {
    await enemy.click();
  }

  const hpAfter = parseLeadingInt(await enemyHp.textContent());

  // The app also deals idle auto-damage, so assert a strict decrease rather
  // than an exact value.
  expect(hpAfter).toBeLessThan(hpBefore);
  expect(consoleErrors).toEqual([]);
});

test('earning gold enables a weapon upgrade that increments the counter and spends gold', async ({
  page,
  consoleErrors,
}) => {
  await page.goto('/');

  const enemy = page.getByTestId('enemy');
  const gold = page.getByTestId('gold');
  const dps = page.getByTestId('dps');
  const upgradeBtn = page.getByTestId('upgrade-btn');
  const equipBtn = page.getByTestId('equip-btn');

  await expect(enemy).toBeVisible();

  // A fresh game is unarmed, so the upgrade button cannot enable until a weapon
  // is equipped. The first kill is guaranteed to drop one.
  await tapUntilVisible(enemy, equipBtn, 40);
  await equipBtn.first().click();
  await expect(page.getByTestId('equipped')).toContainText(ACTIVE_THEME.slots.display.weapon);

  // Earn enough gold to afford the first upgrade, then bank the readouts.
  await tapUntilEnabled(enemy, upgradeBtn, 60);
  const goldBefore = parseLeadingInt(await gold.textContent());
  const levelBefore = await readUpgradeLevel(page);

  await upgradeBtn.click();

  const levelAfter = await readUpgradeLevel(page);
  const goldAfter = parseLeadingInt(await gold.textContent());
  expect(levelAfter).toBe(levelBefore + 1); // "tap upgrade, counter increments"
  expect(goldAfter).toBeLessThan(goldBefore); // upgrade spends gold

  // The economy is drops-primary: gear drops (not cheap upgrades) drive power,
  // and a single upgrade is a small multiplicative bump the floored auto-DPS
  // readout may not even show at low item levels. Assert the loop the economy is
  // built on — equipping a higher-level drop strictly raises the HUD DPS
  // readout. Every number is read from the DOM; none are hard-coded here.
  const dpsBeforeDrop = parseLeadingInt(await dps.textContent());
  await tapUntil(page, enemy, async () => (await bagMaxWeaponLevel(page)) >= 3, 80);
  await equipHighestLevelWeapon(page);
  const dpsAfterDrop = parseLeadingInt(await dps.textContent());
  expect(dpsAfterDrop).toBeGreaterThan(dpsBeforeDrop);
  expect(consoleErrors).toEqual([]);
});

test('enemy and upgrade controls meet the 44px touch-target minimum', async ({
  page,
  consoleErrors,
}) => {
  await page.goto('/');

  const enemy = page.getByTestId('enemy');
  const upgradeBtn = page.getByTestId('upgrade-btn');
  await expect(enemy).toBeVisible();
  await expect(upgradeBtn).toBeVisible();

  const controls: Array<[string, typeof enemy]> = [
    ['enemy', enemy],
    ['upgrade-btn', upgradeBtn],
    ['upgrade-btn-ring1', page.getByTestId('upgrade-btn-ring1')],
  ];

  for (const [name, control] of controls) {
    const box = await control.boundingBox();
    if (box === null) throw new Error(`${name} has no bounding box`);
    expect(box.width, `${name} width`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(box.height, `${name} height`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  }

  expect(consoleErrors).toEqual([]);
});

test('offers one upgrade control per slot, disabled while its slot is empty', async ({
  page,
  consoleErrors,
}) => {
  await page.goto('/');

  // A fresh game is unarmed and has no rings/necklace, so every control exists
  // but is independently disabled. The weapon control keeps its original testid.
  await expect(page.getByTestId('upgrade-btn')).toBeVisible();
  for (const testId of ['upgrade-btn', 'upgrade-btn-ring1', 'upgrade-btn-ring2', 'upgrade-btn-necklace']) {
    await expect(page.getByTestId(testId)).toBeDisabled();
  }
  await expect(page.getByTestId('upgrade-level')).toHaveText(ACTIVE_THEME.ui.placeholder);
  await expect(page.getByTestId('upgrade-level-ring1')).toHaveText(ACTIVE_THEME.ui.placeholder);
  await expect(page.getByTestId('upgrade-cost')).toHaveText(ACTIVE_THEME.ui.placeholder);

  expect(consoleErrors).toEqual([]);
});

test('a non-weapon slot upgrades independently of the weapon', async ({ page, consoleErrors }) => {
  await injectSave(page, {
    gold: 100_000,
    weapon: { itemLevel: 20, upgradeLevel: 0 },
    ring1: { itemLevel: 20, upgradeLevel: 0 },
  });
  await page.goto('/');

  const ringBtn = page.getByTestId('upgrade-btn-ring1');
  await expect(ringBtn).toBeEnabled();
  await expect(page.getByTestId('upgrade-level-ring1')).toHaveText(
    ACTIVE_THEME.ui.upgradeRow.level('0'),
  );

  await ringBtn.click();

  // Only the ring is upgraded; the weapon's level is untouched (per-slot choice).
  await expect(page.getByTestId('upgrade-level-ring1')).toHaveText(
    ACTIVE_THEME.ui.upgradeRow.level('1'),
  );
  await expect(page.getByTestId('upgrade-level')).toHaveText(ACTIVE_THEME.ui.upgradeRow.level('0'));

  expect(consoleErrors).toEqual([]);
});

test('crossing an upgrade milestone shows a card badge and a non-blocking flourish', async ({
  page,
  consoleErrors,
}) => {
  // Plenty of gold so the milestone interval is reachable within a few clicks,
  // whatever the interval is tuned to.
  await injectSave(page, {
    gold: 1_000_000,
    weapon: { itemLevel: 20, upgradeLevel: 0 },
  });
  await page.goto('/');

  const upgradeBtn = page.getByTestId('upgrade-btn');
  const badge = page.getByTestId('milestone-badge');
  const flourish = page.getByTestId('milestone-flourish');

  await expect(upgradeBtn).toBeEnabled();
  await expect(badge).toBeHidden();
  await expect(flourish).toBeHidden();

  // Upgrade the weapon until the milestone badge appears (bounded).
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await badge.isVisible()) break;
    await upgradeBtn.click();
  }

  await expect(badge).toBeVisible();
  // The badge/flourish copy is theme-owned and the count/bonus are engine-owned,
  // so build the expected strings from the SAME getters the renderer uses — no
  // display copy is hard-coded here.
  const weaponLevel = await readUpgradeLevel(page);
  const milestone = getMilestoneInfo('weapon', weaponLevel);
  const count = String(milestone.achievedCount);
  await expect(badge).toHaveText(
    ACTIVE_THEME.slots.milestone.badge(count, milestone.bonusDescription),
  );
  // The step change is announced, not just the number.
  await expect(flourish).toBeVisible();
  await expect(flourish).toContainText(
    ACTIVE_THEME.slots.milestone.flourish(
      ACTIVE_THEME.slots.display.weapon,
      count,
      milestone.bonusDescription,
    ),
  );

  expect(consoleErrors).toEqual([]);
});

test('unlocking an achievement shows a splash and increments the count', async ({
  page,
  consoleErrors,
}) => {
  await page.goto('/');

  const enemy = page.getByTestId('enemy');
  const count = page.getByTestId('achievements-count');
  const splash = page.getByTestId('achievement-splash');
  const splashTitle = page.getByTestId('achievement-splash-title');

  await expect(enemy).toBeVisible();
  await expect(splash).toBeHidden();
  await expect(count).toHaveText('0');
  expect(await page.getByTestId('achievement-item').count()).toBeGreaterThanOrEqual(18);

  // The first tap deals click damage, which unlocks the `first-click` achievement.
  const firstClick = ACTIVE_THEME.achievements.catalog['first-click'];
  expect(firstClick).toBeDefined();
  await enemy.click();

  await expect(splash).toBeVisible();
  await expect(splashTitle).toHaveText(firstClick!.title);
  await expect(count).toHaveText('1');

  // The shelf marks exactly one entry unlocked.
  await expect(
    page.locator('[data-testid="achievement-item"][data-unlocked="true"]'),
  ).toHaveCount(1);

  // Non-blocking: the enemy can still be hit while the splash is up.
  const hpBefore = parseLeadingInt(await page.getByTestId('enemy-hp').textContent());
  await enemy.click();
  const hpAfter = parseLeadingInt(await page.getByTestId('enemy-hp').textContent());
  expect(hpAfter).toBeLessThan(hpBefore);

  expect(consoleErrors).toEqual([]);
});

test('locked achievements are hidden by default and revealed by the toggle', async ({
  page,
  consoleErrors,
}) => {
  await page.goto('/');

  const toggle = page.getByTestId('achievements-toggle');
  const empty = page.getByTestId('achievements-empty');
  const visibleItems = page.locator('[data-testid="achievement-item"]:visible');

  // Nothing unlocked yet: the shelf shows an empty state and every catalog entry
  // is present but hidden behind the toggle.
  await expect(page.getByTestId('achievements-count')).toHaveText('0');
  await expect(empty).toBeVisible();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toContainText(ACTIVE_THEME.achievements.shelf.showDefault);
  await expect(visibleItems).toHaveCount(0);

  const total = await page.getByTestId('achievement-item').count();
  expect(total).toBeGreaterThanOrEqual(18);

  // Reveal: the locked entries become visible and tease as ??? / Locked.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toContainText(ACTIVE_THEME.achievements.shelf.hide);
  await expect(visibleItems).toHaveCount(total);
  await expect(empty).toBeHidden();
  await expect(visibleItems.first()).toContainText(ACTIVE_THEME.achievements.shelf.teaser);

  // Hide again — back to the collapsed default, empty state restored.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(visibleItems).toHaveCount(0);
  await expect(empty).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test('the achievements toggle meets the 44px touch-target minimum', async ({ page, consoleErrors }) => {
  await page.goto('/');

  const toggle = page.getByTestId('achievements-toggle');
  await expect(toggle).toBeVisible();
  const box = await toggle.boundingBox();
  if (box === null) throw new Error('achievements-toggle has no bounding box');
  expect(box.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);

  expect(consoleErrors).toEqual([]);
});



/* ---------------------------------------------------------------------------
 * Bag ordering: the shelf lists the strongest item first, ranked by the engine's
 * shared power metric (`scoreWithEquip`). An unkillable enemy keeps the bag
 * frozen so no fresh drop can enter while the order is read.
 * ------------------------------------------------------------------------- */

test('bag items render strongest-first by the engine power metric', async ({ page, consoleErrors }) => {
  await injectSave(page, {
    // Unkillable enemy so no new drops arrive while the order is read.
    enemyHp: 1e15,
    bag: [
      { itemLevel: 4, upgradeLevel: 0, definitionId: 'weapon' },
      { itemLevel: 9, upgradeLevel: 0, definitionId: 'weapon' },
      { itemLevel: 15, upgradeLevel: 0, definitionId: 'weapon' },
      { itemLevel: 22, upgradeLevel: 0, definitionId: 'weapon' },
    ],
  });
  await page.goto('/');

  // The injected bag ids are `test-bag-<index>` in array order; strongest-first
  // means the highest item level (index 3) leads, the lowest (index 0) trails.
  const order = await page
    .locator('[data-testid="equip-btn"]')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-instance-id')));
  expect(order).toEqual(['test-bag-3', 'test-bag-2', 'test-bag-1', 'test-bag-0']);

  // The "better item" tag still rides the strongest (first) row after the re-sort.
  const taggedId = await page
    .locator('[data-testid="bag-upgrade-tag"]:visible')
    .first()
    .evaluate((tag) =>
      tag.closest('li')?.querySelector('[data-testid="equip-btn"]')?.getAttribute('data-instance-id'),
    );
  expect(taggedId).toBe('test-bag-3');

  expect(consoleErrors).toEqual([]);
});

/* ---------------------------------------------------------------------------
 * Golden Events (Shinies). These tests inject a save with an active event so
 * the mechanic is exercised deterministically, without waiting for the cadence.
 * The save shape is the public v4 blob; the localStorage key is engine-owned.
 * ------------------------------------------------------------------------- */

const SAVE_KEY = 'auto-auto-clicker.save.v1';

interface InjectedGear {
  itemLevel: number;
  upgradeLevel: number;
  /** Bag items only: the gear definition id (defaults to 'weapon'). */
  definitionId?: string;
}

interface InjectedState {
  totalPlayedMs?: number;
  active?: { kind: 'frenzy' | 'cache' | 'drop'; spawnedAtMs: number; expiresAtMs: number } | null;
  boost?: { dpsMultiplier: number; expiresAtMs: number } | null;
  gold?: number;
  weapon?: InjectedGear | null;
  ring1?: InjectedGear | null;
  stage?: number;
  enemyHp?: number;
  bag?: InjectedGear[];
}

/** A persisted gear instance (SOURCE fields only). */
function injectedInstance(id: string, definitionId: string, gear: InjectedGear): unknown {
  return {
    id,
    definitionId,
    itemLevel: gear.itemLevel,
    upgradeLevel: gear.upgradeLevel,
  };
}

/** Build a minimal valid v4 save with an optional active Shiny / boost / gear. */
function injectedSave(options: InjectedState): unknown {
  return {
    version: 4,
    savedAt: 0, // overwritten with Date.now() inside the browser
    state: {
      meta: {
        saveVersion: 4,
        seed: 12345,
        rngState: 12345,
        createdAt: 0,
        totalPlayedMs: options.totalPlayedMs ?? 0,
        achievements: [],
      },
      player: { gold: options.gold ?? 0 },
      combat: { stage: options.stage ?? 1, enemyHp: options.enemyHp ?? 30, damageCarry: 0 },
      gear: {
        equipped: {
          weapon: options.weapon ? injectedInstance('test-weapon', 'weapon', options.weapon) : null,
          ring1: options.ring1 ? injectedInstance('test-ring1', 'ring1', options.ring1) : null,
          ring2: null,
          necklace: null,
        },
        bag: (options.bag ?? []).map((gear, index) =>
          injectedInstance(`test-bag-${index}`, gear.definitionId ?? 'weapon', gear),
        ),
        nextInstanceId: 1,
      },
      choices: { pending: null },
      event: {
        active: options.active ?? null,
        spawned: options.active ? 1 : 0,
        // Far in the future so the cadence never spawns a second Shiny mid-test.
        nextSpawnAtMs: 600_000,
      },
      boost: options.boost ?? null,
    },
  };
}

/** Write a save into localStorage before any page script runs. */
async function injectSave(page: Page, options: InjectedState): Promise<void> {
  await page.addInitScript(
    ({ key, save }) => {
      window.localStorage.clear();
      // A FUTURE savedAt means zero offline time, so boot shows no "welcome back"
      // overlay (which would otherwise intercept pointer events on slow loads).
      window.localStorage.setItem(
        key,
        JSON.stringify({ ...(save as { version: number; state: unknown }), savedAt: Date.now() + 60_000 }),
      );
    },
    { key: SAVE_KEY, save: injectedSave(options) },
  );
}

test('tapping a cache Shiny claims gold and hides it', async ({ page, consoleErrors }) => {
  await injectSave(page, {
    active: { kind: 'cache', spawnedAtMs: 0, expiresAtMs: 600_000 },
  });
  await page.goto('/');

  const shiny = page.getByTestId('shiny');
  const gold = page.getByTestId('gold');
  await expect(shiny).toBeVisible();

  const goldBefore = parseLeadingInt(await gold.textContent());
  // The Shiny drifts continuously, so a coordinate-based click can race the
  // animation and miss; dispatch the click event directly to exercise the same
  // tap handler a real finger would hit.
  await shiny.dispatchEvent('click');

  await expect(shiny).toBeHidden();
  expect(parseLeadingInt(await gold.textContent())).toBeGreaterThan(goldBefore);
  expect(consoleErrors).toEqual([]);
});

test('tapping a drop Shiny banks a ring and shows the claim flourish', async ({
  page,
  consoleErrors,
}) => {
  await injectSave(page, {
    active: { kind: 'drop', spawnedAtMs: 0, expiresAtMs: 600_000 },
  });
  await page.goto('/');

  const shiny = page.getByTestId('shiny');
  const bagCount = page.locator('[data-role="bag-count"]');
  await expect(shiny).toBeVisible();
  await expect(shiny).toContainText(ACTIVE_THEME.shiny.kind.drop);
  await expect(bagCount).toHaveText('0');

  // Direct dispatch for the same reason as the cache test above.
  await shiny.dispatchEvent('click');

  await expect(shiny).toBeHidden();
  // The guaranteed ring lands in the bag immediately...
  await expect(bagCount).toHaveText('1');
  // ...and the claim flourish names the reward (not the generic message).
  await expect(page.getByTestId('shiny-flourish')).toBeVisible();
  await expect(page.getByTestId('shiny-flourish')).toContainText(ACTIVE_THEME.shiny.dropClaim);
  expect(consoleErrors).toEqual([]);
});

test('tapping a frenzy Shiny shows the FRENZY boost pill', async ({ page, consoleErrors }) => {
  await injectSave(page, {
    active: { kind: 'frenzy', spawnedAtMs: 0, expiresAtMs: 600_000 },
  });
  await page.goto('/');

  const shiny = page.getByTestId('shiny');
  const boostPill = page.getByTestId('boost-pill');
  await expect(shiny).toBeVisible();
  await expect(boostPill).toBeHidden();

  // Direct dispatch for the same reason as the cache test above.
  await shiny.dispatchEvent('click');

  await expect(boostPill).toBeVisible();
  await expect(boostPill).toContainText(ACTIVE_THEME.ui.boost.label);
  await expect(shiny).toBeHidden();
  expect(consoleErrors).toEqual([]);
});

test('a missed Shiny leaves with a snarky, non-blocking toast', async ({ page, consoleErrors }) => {
  await injectSave(page, {
    totalPlayedMs: 0,
    active: { kind: 'cache', spawnedAtMs: 0, expiresAtMs: 2_000 },
  });
  await page.goto('/');

  // The Shiny is briefly present, then the engine expires it with no penalty.
  await expect(page.getByTestId('shiny-toast')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('shiny-toast')).toContainText(ACTIVE_THEME.shiny.escape);
  expect(consoleErrors).toEqual([]);
});

test('the Shiny meets the 44px touch-target minimum', async ({ page, consoleErrors }) => {
  await injectSave(page, {
    active: { kind: 'frenzy', spawnedAtMs: 0, expiresAtMs: 600_000 },
  });
  await page.goto('/');

  const shiny = page.getByTestId('shiny');
  await expect(shiny).toBeVisible();
  const box = await shiny.boundingBox();
  if (box === null) throw new Error('shiny has no bounding box');
  expect(box.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  expect(box.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  expect(consoleErrors).toEqual([]);
});

/* ---------------------------------------------------------------------------
 * Upgrade advisory (soft-lock guidance). The engine SURFACES the facts and the
 * player decides; nothing is ever auto-equipped. Time is controlled with the
 * Playwright clock so the stall window elapses deterministically.
 * ------------------------------------------------------------------------- */

test('a stalled player is told a better item is in the bag, and only a tap equips it', async ({
  page,
  consoleErrors,
}) => {
  test.setTimeout(120_000);

  // Control time so the stall window elapses without a real wait.
  await page.clock.install();
  await injectSave(page, {
    stage: 39,
    // Effectively unkillable within the test window, so the stage never changes.
    enemyHp: 1e15,
    totalPlayedMs: 0,
    weapon: { itemLevel: 34, upgradeLevel: 0 },
    bag: [{ itemLevel: 38, upgradeLevel: 0, definitionId: 'weapon' }],
  });
  await page.goto('/');

  const advisory = page.getByTestId('upgrade-advisory');
  const body = page.getByTestId('upgrade-advisory-body');
  const equipCallout = page.getByTestId('upgrade-advisory-equip');
  const equipped = page.getByTestId('equipped');

  // The modest `hint` badge shows immediately: a better weapon IS in the bag...
  await expect(page.getByTestId('upgrade-advisory-badge')).toBeVisible();
  await expect(page.getByTestId('bag-upgrade-tag')).toBeVisible();
  // ...but the prominent callout waits for the stall window to elapse.
  await expect(advisory).toBeHidden();

  // Advance sim-time with no stage progress past the nag window.
  await page.clock.runFor(55_000);

  await expect(advisory).toBeVisible();
  // The facts are engine values (theme-independent); the sentence shape is
  // theme-owned and validated by `npm run theme:check`.
  await expect(body).toContainText('39'); // the stalled stage
  await expect(body).toContainText('38'); // the better item's level
  await expect(body).toContainText('34'); // the equipped item's level
  await expect(body).toContainText(ACTIVE_THEME.slots.noun.weapon);
  await expect(equipCallout).toContainText('38');

  // The player decides: the equipped weapon does not change until the tap.
  await expect(equipped).toContainText('level 34');
  await equipCallout.click();

  // The player's tap dispatched the EXISTING equip action.
  await expect(equipped).toContainText('level 38');
  await expect(advisory).toBeHidden();

  expect(consoleErrors).toEqual([]);
});

/* ---------------------------------------------------------------------------
 * Theme sprites. The renderer loads art from the theme's `assets` map at
 * `/themes/<theme>/<file>`, drawn with pixelated scaling. These tests assert the
 * URLs are theme-derived and the correct frame is chosen for the boss and Shiny.
 * ------------------------------------------------------------------------- */

test('renders player and boss theme sprites with pixelated scaling', async ({
  page,
  consoleErrors,
}) => {
  // Stage 10 is a boss stage, so the boss frame must be selected.
  await injectSave(page, { stage: 10, enemyHp: 1e15 });
  await page.goto('/');

  const player = page.getByTestId('player-sprite');
  const enemy = page.getByTestId('enemy-sprite');
  await expect(player).toBeVisible();
  await expect(enemy).toBeVisible();

  await expect(player).toHaveAttribute('src', themeAssetUrl('player-idle'));
  await expect(enemy).toHaveAttribute('src', themeAssetUrl('boss-grunt-idle'));
  await expect(player).toHaveCSS('image-rendering', 'pixelated');
  await expect(enemy).toHaveCSS('image-rendering', 'pixelated');

  // The boss frame is the larger declared size.
  const box = await enemy.boundingBox();
  expect(box?.width).toBe(96);

  expect(consoleErrors).toEqual([]);
});

test('renders the Shiny sprite for the active kind', async ({ page, consoleErrors }) => {
  await injectSave(page, { active: { kind: 'drop', spawnedAtMs: 0, expiresAtMs: 600_000 } });
  await page.goto('/');

  const shiny = page.getByTestId('shiny');
  const sprite = page.getByTestId('shiny-sprite');
  await expect(shiny).toBeVisible();
  await expect(sprite).toHaveAttribute('src', themeAssetUrl('shiny-drop'));
  await expect(sprite).toHaveCSS('image-rendering', 'pixelated');

  expect(consoleErrors).toEqual([]);
});

/** Read the first integer from a text node, e.g. "28 / 30" -> 28. */
function parseLeadingInt(text: string | null): number {
  const match = text === null ? null : text.match(/\d+/);
  if (match === null) throw new Error(`no integer found in ${JSON.stringify(text)}`);
  return Number(match[0]);
}

/**
 * The expected `src` for a theme asset slot, derived from the ACTIVE_THEME —
 * the directory is the theme's own name and the file name is its `assets` map,
 * so the assertion follows a theme swap instead of pinning `fantasy`.
 */
function themeAssetUrl(slot: string): RegExp {
  return new RegExp(`/themes/${ACTIVE_THEME.name}/${ACTIVE_THEME.assets[slot]}$`);
}

/** Read the equipped weapon's upgrade level from the per-slot level readout. */
async function readUpgradeLevel(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByTestId('upgrade-level').textContent();
  return parseLeadingInt(text);
}

/** Tap the enemy until `target` becomes visible (bounded, then a real assertion). */
async function tapUntilVisible(
  enemy: import('@playwright/test').Locator,
  target: import('@playwright/test').Locator,
  maxTaps: number,
): Promise<void> {
  for (let tap = 0; tap < maxTaps; tap += 1) {
    if (await target.first().isVisible()) return;
    await enemy.click();
  }
  await expect(target.first()).toBeVisible();
}

/** Tap the enemy until `button` becomes enabled (bounded, then a real assertion). */
async function tapUntilEnabled(
  enemy: import('@playwright/test').Locator,
  button: import('@playwright/test').Locator,
  maxTaps: number,
): Promise<void> {
  for (let tap = 0; tap < maxTaps; tap += 1) {
    if (await button.isEnabled()) return;
    await enemy.click();
  }
  await expect(button).toBeEnabled();
}

/** Tap the enemy until `predicate` holds (bounded, then a real assertion). */
async function tapUntil(
  page: Page,
  enemy: Locator,
  predicate: () => Promise<boolean>,
  maxTaps: number,
): Promise<void> {
  for (let tap = 0; tap < maxTaps; tap += 1) {
    if (await predicate()) return;
    await enemy.click();
  }
  await expect(await predicate()).toBe(true);
}

/** Highest WEAPON item level currently offered in the bag (read from the DOM). */
async function bagMaxWeaponLevel(page: Page): Promise<number> {
  const texts = await page
    .locator('[data-testid="equip-btn"][data-slot="weapon"]')
    .evaluateAll((buttons) => buttons.map((button) => button.closest('li')?.textContent ?? ''));
  let max = 0;
  for (const text of texts) {
    const match = text.match(/Level (\d+)/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

/** Equip the bag WEAPON with the highest item level (newest, strongest drop). */
async function equipHighestLevelWeapon(page: Page): Promise<void> {
  const buttons = page.locator('[data-testid="equip-btn"][data-slot="weapon"]');
  const count = await buttons.count();
  let bestIndex = 0;
  let bestLevel = -1;
  for (let i = 0; i < count; i += 1) {
    const text = await buttons.nth(i).evaluate((el) => el.closest('li')?.textContent ?? '');
    const match = text.match(/Level (\d+)/);
    const level = match ? Number(match[1]) : -1;
    if (level > bestLevel) {
      bestLevel = level;
      bestIndex = i;
    }
  }
  await buttons.nth(bestIndex).click();
}
