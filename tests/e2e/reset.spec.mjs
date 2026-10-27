// The way out when Olemmy won't start: reset.html (also /?reset), which
// shares no code with the app, and the link that appears when the page is
// still empty after loading.

import { test, expect, NOW } from './fake-instance.mjs';

const settings = (page) => page.evaluate(() => localStorage.getItem('olemmy:settings'));

test('the reset page clears and refetches, keeping settings (unbuilt site: it crawls)', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  const before = await settings(page);
  const reloaded = [];
  // The reset page loads none of the app's scripts itself: any fetch of them is the crawl.
  page.on('request', (r) => { if (new URL(r.url()).hostname === 'localhost') reloaded.push(new URL(r.url()).pathname); });
  await page.goto('/reset.html');
  await expect(page.locator('#reset-steps')).toContainText('Done.', { timeout: 20000 });
  await expect(page.locator('#reset-steps')).toContainText(/Fetched all \d+ of the app's files again/);
  // No file list: every script the app imports was found and fetched again.
  for (const p of ['/js/main.js', '/js/theme-init.js', '/js/components/send-link.js', '/css/base.css']) expect(reloaded).toContain(p);
  await expect(page.locator('#reset-open')).toHaveAttribute('href', './#/');
  expect(await settings(page)).toBe(before);
});

test('on a built site: every listed file again, past the cache, and the build recorded', async ({ page }) => {
  const reloads = [];
  page.on('request', (r) => { if (new URL(r.url()).hostname === 'localhost') reloads.push(new URL(r.url()).pathname); });
  await page.route(/\/deployment\.json/, (r) => r.fulfill({ json: { build: 'abc123', built: '2026-10-26T00:00:00Z', commit: 'x', files: 'files-abc123.json' } }));
  await page.route(/\/files-abc123\.json/, (r) => r.fulfill({ json: { build: 'abc123', files: { 'index.html': '1', 'js/main.js': '2', 'css/base.css': '3' } } }));
  await page.goto('/reset.html');
  await expect(page.locator('#reset-steps')).toContainText('Fetched all 4 of the app\'s files again');
  for (const p of ['/js/main.js', '/css/base.css', '/index.html']) expect(reloads).toContain(p);
  await expect(page.locator('#reset-open')).toHaveAttribute('href', './#/');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('olemmy:deployment')));
  expect(stored).toMatchObject({ build: 'abc123', files: { 'js/main.js': '2' } });
});

test('/?reset opens the reset page', async ({ page }) => {
  await page.goto('/?reset');
  await expect(page).toHaveURL(/\/reset\.html$/);
  await expect(page.locator('h1')).toHaveText('Refresh Olemmy');
});

test('"Erase" removes Olemmy\'s data, and only that', async ({ page }) => {
  await page.goto('/reset.html');
  await page.evaluate(() => { localStorage.setItem('olemmy:tags', '{}'); localStorage.setItem('other-site-thing', 'keep'); });
  await expect(page.locator('#reset-more')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.locator('#reset-erase').click();
  await expect(page.locator('#reset-steps')).toContainText('Erased Olemmy\'s data');
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('olemmy:')))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('other-site-thing'))).toBe('keep');
});

test('when the app doesn\'t start, a link to the reset page appears', async ({ page }) => {
  // A broken main.js: the header and page stay empty.
  await page.route(/\/js\/main\.js$/, (r) => r.fulfill({ contentType: 'text/javascript', body: 'throw new Error("stale file");' }));
  await page.clock.install({ time: NOW });
  await page.goto('/#/');
  await page.waitForLoadState('load');
  await page.clock.runFor(8000);
  const notice = page.locator('#main .start-failed');
  await expect(notice).toBeVisible();
  await expect(notice.locator('a', { hasText: 'refresh the app' })).toHaveAttribute('href', 'reset.html');
  // ...with what went wrong.
  await expect(notice.locator('.start-errors')).toContainText('stale file');
});

test('old and new files mixed: Olemmy fetches them again by itself, and comes back', async ({ page }) => {
  test.setTimeout(40000);
  // The phone's copy of links.js from before shareRoute existed: served once.
  let stale = true;
  await page.route(/\/js\/util\/links\.js$/, async (route) => {
    if (!stale) return route.fallback();
    stale = false;
    const real = await (await route.fetch()).text();
    await route.fulfill({ contentType: 'text/javascript', body: real.replace(/export function shareRoute/, 'function shareRoute') });
  });
  await page.goto('/#/communities');
  await expect(page).toHaveURL(/#\/communities$/, { timeout: 30000 });
  await expect(page.locator('.community-row').first()).toBeVisible({ timeout: 15000 });
  expect(stale).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem('olemmy:auto-reset'))).toBe('1');
});

test('a file that stays broken: one automatic try, then the notice (no loop)', async ({ page }) => {
  test.setTimeout(40000);
  const visits = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) visits.push(new URL(f.url()).pathname); });
  await page.route(/\/js\/util\/links\.js$/, async (route) => {
    const real = await (await route.fetch()).text();
    await route.fulfill({ contentType: 'text/javascript', body: real.replace(/export function shareRoute/, 'function shareRoute') });
  });
  await page.clock.install({ time: NOW });
  await page.goto('/#/');
  // Off to the reset page and back; then the start-up check's wait, run at once.
  await expect.poll(() => visits.filter((p) => p.endsWith('reset.html')).length, { timeout: 30000 }).toBe(1);
  await expect(page).toHaveURL(/\/#\/$/, { timeout: 30000 });
  await page.waitForLoadState('load');
  await page.clock.runFor(8000);
  await expect(page.locator('#main .start-failed')).toBeVisible();
  await expect(page.locator('#main .start-errors')).toContainText('shareRoute');
  expect(visits.filter((p) => p.endsWith('reset.html')).length).toBe(1);
});

test('/?debug shows a diagnostics panel, kept for the session; ?debug=off ends it', async ({ page }) => {
  await page.route(/\/js\/features\/gallery\.js$/, (r) => r.fulfill({ status: 404, body: '' }));
  // The panel waits a few seconds for the app; the fake clock skips them.
  await page.clock.install({ time: NOW });
  await page.goto('/?debug#/');
  await page.waitForLoadState('load');
  await page.clock.runFor(3000);
  const panel = page.locator('.olemmy-debug');
  await expect(panel).toBeVisible();
  const text = panel.locator('pre');
  await expect(text).toContainText('address: /?debug#/');
  await expect(text).toContainText('middle of screen:');
  await expect(text).toContainText('settings: instance=fixture.test');
  // A file that failed to load: the browser reports the app's own script
  // (where it can tell, the failing file too).
  await expect(text).toContainText('failed to load /js/main.js');
  // Still on after moving around (no ?debug in the address any more).
  await page.goto('/#/settings');
  await page.waitForLoadState('load');
  await page.clock.runFor(3000);
  await expect(panel).toBeVisible();
  await page.goto('/?debug=off#/');
  await page.waitForLoadState('load');
  await page.clock.runFor(3500);
  await expect(panel).toHaveCount(0);
});

test('the footer links to the reset page', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('#footer a', { hasText: 'app not working? reset' })).toHaveAttribute('href', 'reset.html');
});
