// Fixes from a code review: a password change keeps you logged in, a failed
// update doesn't leave its dialog up, lookups don't redirect a page you've
// left, addresses from an instance or the address bar only become links
// when they're safe, imports say what they bring, and later comment pages
// go under their parents.

import { readFileSync } from 'node:fs';
import { test, expect } from './fake-instance.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
const API = 'https://fixture.test/api/v3';
const json = (route, body, status = 200) => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' },
});

test.describe('logged in', () => {
  test.use({ instanceOptions: { loggedIn: true } });

  test('changing the password keeps the new token', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('olemmy:accounts')) {
        localStorage.setItem('olemmy:accounts', JSON.stringify({ v: 1, data: { active: 0, list: [{ instance: 'fixture.test', username: 'tester', jwt: 'old-token', remember: true }] } }));
      }
    });
    await page.route(`${API}/user/change_password`, (r) => json(r, { jwt: 'new-token' }));
    await page.goto('/#/account');
    await page.getByLabel('current password').fill('correct horse');
    await page.getByLabel('new password (10 to 60 characters)').fill('battery staple');
    await page.getByRole('button', { name: 'change password' }).click();
    await expect(page.locator('.toast')).toContainText('Password changed');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('olemmy:accounts')).data.list[0].jwt);
    expect(stored).toBe('new-token');
  });
});

test('a lookup that finishes after you\'ve left doesn\'t take you back', async ({ page }) => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(`${API}/resolve_object*`, async (r) => { await held; return json(r, { community: fixture('community').community_view }); });
  await page.goto('/#/resolve?q=https%3A%2F%2Fother.example%2Fc%2Fthing');
  await expect(page.locator('.loading')).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Olemmy preferences' })).toBeVisible();
  release();
  await page.waitForTimeout(300);
  expect(new URL(page.url()).hash).toBe('#/settings');
});

test('a profile address that isn\'t http(s) isn\'t linked', async ({ page }) => {
  await page.route(`${API}/user*`, (r) => {
    const body = fixture('user');
    body.person_view.person.actor_id = 'javascript:alert(1)';
    return json(r, body);
  });
  const { name } = fixture('user').person_view.person;
  await page.goto(`/#/u/${name}`);
  await expect(page.locator('#sidebar')).toContainText(name);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'view on their instance' })).toHaveCount(0);
});

test('?return= only ever links inside the app', async ({ page }) => {
  await page.goto('/#/instance?use=other.example&return=javascript:alert(1)');
  const keep = page.getByRole('link', { name: /^keep using/ });
  await expect(keep).toBeVisible();
  await expect(keep).toHaveAttribute('href', '#/');
});

test('importing a file with logins or custom CSS says so first', async ({ page }) => {
  await page.goto('/#/settings?tab=advanced');
  const file = {
    app: 'olemmy',
    data: {
      'olemmy:accounts': { v: 1, data: { active: 0, list: [{ instance: 'evil.example', username: 'someone', jwt: 'their-token', remember: true }] } },
      'olemmy:settings': { v: 1, data: { features: { customCss: { css: 'body { background: url(https://evil.example/x) }' } } } },
    },
  };
  await page.locator('#import-file').setInputFiles({ name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('logs this browser in as someone@evil.example');
  await expect(dialog).toContainText('custom CSS');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  const accounts = await page.evaluate(() => localStorage.getItem('olemmy:accounts'));
  expect(accounts || '').not.toContain('their-token');
});

/** 300 top-level comments (a full first page), then [second] for page 2. */
async function longThread(page, second) {
  const base = fixture('comments').comments[0];
  const one = (id, path) => {
    const c = structuredClone(base);
    Object.assign(c.comment, { id, path });
    c.counts = { ...c.counts, child_count: 0 };
    return c;
  };
  await page.route(`${API}/comment/list*`, (r) => {
    const pageNo = new URL(r.request().url()).searchParams.get('page');
    if (pageNo === '2') return second(r, one);
    return json(r, { comments: Array.from({ length: 300 }, (_, i) => one(10000 + i, `0.${10000 + i}`)) });
  });
  await page.goto(`/#/post/${fixture('post').post_view.post.id}`);
  await expect(page.locator('#c10299')).toBeAttached({ timeout: 15000 });
}

test('a later page\'s reply goes under its parent', async ({ page }) => {
  await longThread(page, (r, one) => json(r, { comments: [one(20000, '0.10005.20000')] }));
  await page.getByRole('button', { name: 'load more comments' }).click();
  await expect(page.locator('#c10005 > .children > #c20000')).toBeAttached();
});

test('a later page that fails says so', async ({ page }) => {
  await longThread(page, (r) => json(r, { error: 'boom' }, 400));
  await page.getByRole('button', { name: 'load more comments' }).click();
  await expect(page.locator('.toast-error')).toContainText('Couldn\'t load more comments');
  await expect(page.getByRole('button', { name: 'load more comments' })).toBeEnabled();
});
