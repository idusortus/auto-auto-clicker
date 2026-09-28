import { expect, test as base } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// Phase 5 — mobile-viewport smoke test for the /web host.
//
// These tests drive the real Vite dev server through Playwright's mobile
// Chromium emulation (390x844, touch, DPR 3). They assert only observable app
// behaviour: DOM hooks, HP/upgrade/dps readouts, gold spending, and touch-target
// geometry. Gameplay numbers are read from the DOM, never hard-coded, so a
// balance change cannot make the smoke test brittle.

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
  await expect(page.getByTestId('equipped')).toContainText('Weapon');

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
  ];

  for (const [name, control] of controls) {
    const box = await control.boundingBox();
    if (box === null) throw new Error(`${name} has no bounding box`);
    expect(box.width, `${name} width`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(box.height, `${name} height`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  }

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

  // The first tap deals click damage, which unlocks "Finger Guns".
  await enemy.click();

  await expect(splash).toBeVisible();
  await expect(splashTitle).toHaveText('Finger Guns');
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

/* ---------------------------------------------------------------------------
 * Golden Events (Shinies). These tests inject a save with an active event so
 * the mechanic is exercised deterministically, without waiting for the cadence.
 * The save shape is the public v4 blob; the localStorage key is engine-owned.
 * ------------------------------------------------------------------------- */

const SAVE_KEY = 'auto-auto-clicker.save.v1';

interface InjectedState {
  totalPlayedMs?: number;
  active?: { kind: 'frenzy' | 'cache' | 'drop'; spawnedAtMs: number; expiresAtMs: number } | null;
  boost?: { dpsMultiplier: number; expiresAtMs: number } | null;
  gold?: number;
}

/** Build a minimal valid v4 save with an optional active Shiny / boost. */
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
      combat: { stage: 1, enemyHp: 30, damageCarry: 0 },
      gear: {
        equipped: { weapon: null, ring1: null, ring2: null, necklace: null },
        bag: [],
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
      window.localStorage.setItem(
        key,
        JSON.stringify({ ...(save as { version: number; state: unknown }), savedAt: Date.now() }),
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
  await expect(shiny).toContainText('Ring goblin!');
  await expect(bagCount).toHaveText('0');

  // Direct dispatch for the same reason as the cache test above.
  await shiny.dispatchEvent('click');

  await expect(shiny).toBeHidden();
  // The guaranteed ring lands in the bag immediately...
  await expect(bagCount).toHaveText('1');
  // ...and the claim flourish names the reward (not the generic message).
  await expect(page.getByTestId('shiny-flourish')).toBeVisible();
  await expect(page.getByTestId('shiny-flourish')).toContainText('Ring grabbed');
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
  await expect(boostPill).toContainText('FRENZY');
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
  await expect(page.getByTestId('shiny-toast')).toContainText('got away');
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

/** Read the first integer from a text node, e.g. "28 / 30" -> 28. */
function parseLeadingInt(text: string | null): number {
  const match = text === null ? null : text.match(/\d+/);
  if (match === null) throw new Error(`no integer found in ${JSON.stringify(text)}`);
  return Number(match[0]);
}

/** Read the equipped weapon's upgrade level from the "upgrades N" card line. */
async function readUpgradeLevel(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByTestId('equipped').innerText();
  const match = text.match(/upgrades (\d+)/);
  if (match === null) throw new Error(`no upgrade level found in ${JSON.stringify(text)}`);
  return Number(match[1]);
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
