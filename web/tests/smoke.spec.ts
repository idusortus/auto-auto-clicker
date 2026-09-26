import { expect, test as base } from '@playwright/test';

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
  const dpsBefore = parseLeadingInt(await dps.textContent());
  const goldBefore = parseLeadingInt(await gold.textContent());
  const levelBefore = await readUpgradeLevel(page);

  await upgradeBtn.click();

  const levelAfter = await readUpgradeLevel(page);
  const goldAfter = parseLeadingInt(await gold.textContent());
  expect(levelAfter).toBe(levelBefore + 1); // "tap upgrade, counter increments"
  expect(goldAfter).toBeLessThan(goldBefore); // upgrade spends gold

  // Keep upgrading until the HUD DPS readout strictly increases. The readout is
  // the floor of auto-DPS; integer flooring means a level-1 weapon's first
  // upgrade (floor(2 * 1.3^1) = 2) does not move it, while the second
  // (floor(2 * 1.3^2) = 3) does. Observed by the loop, not assumed.
  let dpsAfter = dpsBefore;
  for (let attempt = 0; attempt < 6 && dpsAfter <= dpsBefore; attempt += 1) {
    await tapUntilEnabled(enemy, upgradeBtn, 80);
    await upgradeBtn.click();
    dpsAfter = parseLeadingInt(await dps.textContent());
  }
  expect(dpsAfter).toBeGreaterThan(dpsBefore);
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
