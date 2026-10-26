// The updater (docs/OLEMMY.md §10a, docs/cache-bust.md) with a fake
// deployment.json: first visits record the build, a new build at startup
// refreshes changed files and reloads, and one found while the app is open
// shows a banner instead of reloading under the user.

import { test, expect } from './fake-instance.mjs';

/** Serve deployment.json and its list for [build], with [files] { path: hash }. */
async function deploy(page, state) {
  await page.route(/\/deployment\.json/, (r) => r.fulfill({ json: { build: state.build, built: '2026-10-25T12:00:00Z', commit: 'abc1234', files: `files-${state.build}.json` } }));
  await page.route(/\/files-[0-9a-f]+\.json$/, (r) => r.fulfill({ json: { build: state.build, files: state.files } }));
}

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('olemmy:deployment')));

/** As if this browser had installed [build] with [files] on an earlier visit. */
async function installedBefore(page, build, files) {
  await page.addInitScript(([b, f]) => {
    if (!localStorage.getItem('olemmy:deployment')) {
      localStorage.setItem('olemmy:deployment', JSON.stringify({ build: b, built: '2026-10-25T12:00:00Z', commit: 'abc1234', files: f }));
    }
  }, [build, files]);
}

test.describe('a first visit', () => {
  // Nothing of Olemmy's in storage at all.
  test.use({ instanceOptions: { noInstance: true } });
  test('records the build without updating', async ({ page }) => {
    const state = { build: 'aaaa000000000001', files: { 'index.html': '1', 'js/main.js': '1' } };
    await deploy(page, state);
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: 'Choose your Lemmy instance' })).toBeVisible();
    await expect.poll(async () => (await stored(page))?.build).toBe('aaaa000000000001');
    await expect(page.locator('dialog.ol-update')).toHaveCount(0);
  });
});

test('a new build at startup refreshes the changed files, then reloads', async ({ page }) => {
  const state = { build: 'aaaa000000000001', files: { 'index.html': '1', 'js/main.js': '1', 'css/base.css': '1' } };
  await deploy(page, state);
  await installedBefore(page, state.build, state.files);
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();

  state.build = 'bbbb000000000002';
  state.files = { ...state.files, 'js/main.js': '2' };
  const refreshed = [];
  page.on('request', (r) => { if (r.url().includes('/js/main.js')) refreshed.push(r.headers()['cache-control'] || r.url()); });
  await page.reload();
  await expect.poll(async () => (await stored(page))?.build, { timeout: 15000 }).toBe('bbbb000000000002');
  expect(refreshed.length).toBeGreaterThan(0);
  await expect(page.locator('.thing.link').first()).toBeVisible();
});

test('a build found while the app is open shows a banner, not a reload', async ({ page }) => {
  const state = { build: 'aaaa000000000001', files: { 'index.html': '1' } };
  await deploy(page, state);
  await installedBefore(page, state.build, state.files);
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  state.build = 'cccc000000000003';
  // Coming back to the tab is when a long-lived SPA checks again.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.banner')).toContainText('A new version of Olemmy is available');
  await expect(page.locator('.thing.link').first()).toBeVisible();
});

test('an update that fails partway closes its dialog and carries on', async ({ page }) => {
  const state = { build: 'aaaa000000000001', files: { 'index.html': '1', 'js/main.js': '1' } };
  await deploy(page, state);
  await installedBefore(page, state.build, state.files);
  state.build = 'dddd000000000004';
  state.files = { ...state.files, 'js/main.js': '2' };
  // The updater loads this part of itself mid-update: as if the connection dropped then.
  await page.route(/\/js\/cache-bust\.js/, (r) => r.abort());
  await page.goto('/#/');
  await expect(page.locator('dialog.ol-update')).toContainText('The update stopped');
  await expect(page.locator('dialog.ol-update')).toHaveCount(0, { timeout: 10000 });
  await expect(page.locator('.thing.link').first()).toBeVisible();
  expect((await stored(page))?.build).toBe('aaaa000000000001');
});
