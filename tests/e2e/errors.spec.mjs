// Error handling: the red box before start-up (with a report to copy), and
// after it the error log (core/errors.js): the header's warning icon, and
// #/errors to read, copy, share and clear.

import { test, expect } from './fake-instance.mjs';

/**
 * Run [body] as a script file of the page's own ([times] over): errors from
 * code a test evaluates directly don't reach the page's error listeners. Not
 * from a timer, either: the tests' fixed clock (fake-instance.mjs) catches
 * errors thrown in timers itself.
 */
async function runScript(page, name, body, times = 1) {
  await page.route(new RegExp(`/${name}\\.js`), (r) => r.fulfill({ contentType: 'text/javascript', body }));
  await page.evaluate(([src, n]) => {
    for (let i = 0; i < n; i++) { const s = document.createElement('script'); s.src = src; document.head.append(s); }
  }, [`${name}.js`, times]);
}

const capture = (page) => page.addInitScript(() => {
  window.copied = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.copied.push(t); } } });
});

test('an error after start-up: the warning icon, then the errors page', async ({ page }) => {
  await capture(page);
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await expect(page.locator('.sr-errors')).toHaveCount(0);

  // A bug: an error nothing catches, twice.
  await runScript(page, 'zz-bug', 'throw new Error("something broke");', 2);
  const icon = page.locator('#sr-header-area .sr-errors');
  await expect(icon).toBeVisible();
  await expect(icon.locator('.badge')).toHaveText('1');
  await expect(icon).toHaveAttribute('title', /1 new error/);

  await icon.click();
  await expect(page).toHaveURL(/#\/errors$/);
  const entry = page.locator('.error-entry').first();
  await expect(entry.locator('.error-message')).toHaveText('something broke ×2');
  await expect(entry.locator('.error-where')).toContainText('uncaught');
  await expect(entry.locator('.error-where a')).toHaveAttribute('href', '#/');
  // Seen: the icon goes.
  await expect(page.locator('.sr-errors')).toHaveCount(0);

  await page.getByRole('button', { name: 'copy report' }).click();
  const report = await page.evaluate(() => window.copied.at(-1));
  expect(report).toMatch(/^Olemmy error report\n/);
  expect(report).toContain('- something broke (×2');
  expect(report).toContain('browser: ');

  // Kept across a reload; cleared on request.
  await page.reload();
  await expect(page.locator('.error-entry')).toHaveCount(1);
  await page.getByRole('button', { name: 'clear' }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.errors-page .empty')).toContainText('No errors');
});

test('not bugs: network trouble and cancelled requests aren\'t logged', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await runScript(page, 'zz-noise', `
    Promise.reject(Object.assign(new Error('offline'), { kind: 'network' }));
    Promise.reject(new DOMException('stopped', 'AbortError'));
    // ...and one real one, so the test knows the listeners were listening.
    Promise.resolve().then(() => Promise.reject(new Error('a real one')));
    throw new Error('ResizeObserver loop completed with undelivered notifications.');`);
  await expect(page.locator('#sr-header-area .sr-errors .badge')).toHaveText('1');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('olemmy:errors')).map((e) => e.message))).toEqual(['a real one']);
});

test('a feature that throws is logged with its name, and the page carries on', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await page.evaluate(async () => {
    const { reportError } = await import('./js/core/errors.js');
    const { runHook } = await import('./js/features/index.js');
    const registry = await import('./js/features/registry.js');
    registry.defineFeature({ id: 'brokenTest', name: 'Broken', category: 'Test', description: '', onRoute() { throw new Error('hook failed'); } });
    runHook('onRoute', {});
    return !!reportError;
  });
  await page.goto('/#/errors');
  await expect(page.locator('.error-entry', { hasText: 'hook failed' }).locator('.error-where')).toContainText('feature brokenTest.onRoute');
});

test('before start-up: the red box has a report to copy', async ({ page }) => {
  test.setTimeout(30000);
  await capture(page);
  await page.route(/\/js\/main\.js$/, (r) => r.fulfill({ contentType: 'text/javascript', body: 'throw new Error("broken start");' }));
  await page.goto('/#/');
  const box = page.locator('#main .start-failed');
  await expect(box).toBeVisible({ timeout: 12000 });
  await box.getByRole('button', { name: 'copy report' }).click();
  await expect(box.getByRole('button', { name: 'copied' })).toBeVisible();
  const report = await page.evaluate(() => window.copied.at(-1));
  expect(report).toMatch(/^Olemmy start-up report\n/);
  expect(report).toContain('broken start');
  expect(report).toContain('address: ');
});

test('copying works without the clipboard API (plain http, as on a phone on the network)', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  const ok = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined });
    const { copyText } = await import('./js/components/send-link.js');
    return copyText('hello');
  });
  expect(ok).toBe(true);
});
