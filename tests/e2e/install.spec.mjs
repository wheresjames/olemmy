// The install offer (features/pwa.js): a toast where the browser can install
// Olemmy, at most once a day, until it's installed or the user says never;
// and the install button in preferences. The browser's beforeinstallprompt
// is faked, since Playwright's browsers never fire it.

import { test, expect } from './fake-instance.mjs';

const DAY = 24 * 60 * 60 * 1000;

/** Make the page installable: a fake beforeinstallprompt, answering [outcome], fired once the app is up. */
async function installable(page, outcome = 'accepted') {
  await page.addInitScript((answer) => {
    window.__prompted = 0;
    window.__installable = () => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__prompted++; };
      e.userChoice = Promise.resolve({ outcome: answer });
      dispatchEvent(e);
    };
  }, outcome);
}

/** As if the last offer was a day ago. */
const dayLater = (page) => page.evaluate((day) => {
  const s = JSON.parse(localStorage.getItem('olemmy:install-offer'));
  localStorage.setItem('olemmy:install-offer', JSON.stringify({ ...s, last: s.last - day }));
}, DAY);

const offerToast = (page) => page.locator('.toast', { hasText: 'Install Olemmy as an app?' });

/** Load [path] afresh (going to a hash on the same page wouldn't reload) and, if the page is installable, say so. */
async function visit(page, path) {
  await page.goto('about:blank');
  await page.goto(path);
  await expect(page.locator('#main')).not.toBeEmpty();
  await page.evaluate(() => window.__installable?.());
}

/** Open the front page and wait past the toast's delay. */
async function open(page) {
  await visit(page, '/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await page.clock.runFor(6000);
}

test.beforeEach(async ({ page }) => { await page.clock.install(); });

test('not offered where the browser can\'t install', async ({ page }) => {
  await open(page);
  await expect(offerToast(page)).toHaveCount(0);
  await page.goto('/#/settings');
  await expect(page.locator('.setting', { hasText: 'Install as an app' })).toContainText('menu item');
});

test('offered once a day until installed', async ({ page }) => {
  await installable(page);
  await open(page);
  await offerToast(page).getByRole('button', { name: 'later' }).click();
  await expect(offerToast(page)).toHaveCount(0);

  // The same day: not again.
  await open(page);
  await expect(offerToast(page)).toHaveCount(0);

  // A day later: again, and installing stops it for good.
  await dayLater(page);
  await open(page);
  await offerToast(page).getByRole('button', { name: 'install' }).click();
  await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('olemmy:install-offer'))?.done)).toBe(true);

  await dayLater(page);
  await open(page);
  await expect(offerToast(page)).toHaveCount(0);
});

test('never stops the offer, and preferences can turn it back on', async ({ page }) => {
  await installable(page);
  await open(page);
  await offerToast(page).getByRole('button', { name: 'never' }).click();

  await dayLater(page);
  await open(page);
  await expect(offerToast(page)).toHaveCount(0);
  await page.goto('/#/settings?tab=features&feature=pwa');
  await expect(page.getByRole('switch', { name: 'Offer to install' })).not.toBeChecked();
});

test('preferences has an install button', async ({ page }) => {
  await installable(page, 'dismissed');
  await visit(page, '/#/settings');
  await page.locator('.setting', { hasText: 'Install as an app' }).getByRole('button', { name: 'install' }).click();
  await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(1);
});

test('installing from the browser\'s own menu takes the toast away', async ({ page }) => {
  await installable(page);
  await open(page);
  await expect(offerToast(page)).toBeVisible();
  // A development copy has no offline shell, so the toast doesn't promise one.
  await expect(offerToast(page)).not.toContainText('offline');
  await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
  await expect(offerToast(page)).toHaveCount(0);
});

test('after installing, preferences says so', async ({ page }) => {
  await installable(page);
  await visit(page, '/#/settings');
  const row = page.locator('.setting', { hasText: 'Install as an app' });
  await row.getByRole('button', { name: 'install' }).click();
  await expect(row).toContainText('installed as an app');
  // And still after a reload.
  await page.reload();
  await expect(row).toContainText('installed as an app');
});

test('with App and offline off, no toast and no install button', async ({ page }) => {
  await installable(page);
  await visit(page, '/#/settings?tab=features');
  await page.getByRole('switch', { name: 'App and offline' }).uncheck();
  await open(page);
  await expect(offerToast(page)).toHaveCount(0);
  await visit(page, '/#/settings');
  await expect(page.locator('.setting', { hasText: 'Install as an app' })).toContainText('Turn on "App and offline"');
});

test('the offer option is explained, and found by search', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('once a day');
  const feature = page.locator('#feature-pwa');
  await expect(feature).toBeVisible();
  await feature.locator('summary').click();
  await expect(feature).toContainText('A reminder at most once a day');
});
