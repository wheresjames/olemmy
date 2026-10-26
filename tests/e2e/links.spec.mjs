// Links that mean the same thing for anyone: full community and user names,
// share addresses in the inbox and on user pages, share links for
// communities, users, favorites pages and instances, and "Share → Olemmy"
// from other apps.

import { readFileSync } from 'node:fs';
import { test, expect } from './fake-instance.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
const share = (apId) => `#/${apId.replace(/^https:\/\//, '')}`;
const copier = (page) => page.addInitScript(() => {
  window.copied = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.copied.push(t); } } });
});
const copied = (page) => page.evaluate(() => window.copied.at(-1));
const login = (page) => page.addInitScript(() => localStorage.setItem('olemmy:accounts', JSON.stringify({ v: 1, data: { active: 0, list: [{ instance: 'fixture.test', username: 'tester', jwt: 'test-jwt', remember: true }] } })));

test('community and user links always carry their instance', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  const hrefs = await page.locator('#siteTable a[href^="#/c/"], #siteTable a[href^="#/u/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(10);
  for (const h of hrefs) expect(h, h).toMatch(/^#\/[cu]\/[^/@]+@[\w.-]+$/);
});

test('share a community and a user: addresses that work anywhere', async ({ page }) => {
  await copier(page);
  await page.goto('/#/c/linux@fixture.test');
  await page.locator('.community-box .share-button').click();
  expect(await copied(page)).toBe(`${new URL(page.url()).origin}/#/c/linux@fixture.test`);
  await page.goto('/#/u/harbor_reader@fixture.test');
  await page.locator('.user-box .share-button').click();
  expect(await copied(page)).toBe(`${new URL(page.url()).origin}/#/u/harbor_reader@fixture.test`);
});

test.describe('logged in', () => {
  test.use({ instanceOptions: { loggedIn: true } });
  test('inbox links use share addresses; "context" opens the parent\'s thread', async ({ page }) => {
    await login(page);
    await page.goto('/#/inbox');
    const item = page.locator('.inbox-item.inbox-reply').first();
    await expect(item).toBeVisible();
    const c = fixture('comments').comments[0];
    await expect(item.locator('.subject a').first()).toHaveAttribute('href', share(c.post.ap_id));
    await expect(item.locator('a', { hasText: 'context' })).toHaveAttribute('href', `${share(c.comment.ap_id)}?context=1`);
    await expect(item.locator('a', { hasText: 'full comments' })).toHaveAttribute('href', share(c.post.ap_id));
    // Followed from here: no lookup needed, this instance's copy.
    await item.locator('a', { hasText: 'full comments' }).click();
    await expect(page.locator('.post-header .thing.link')).toBeVisible();
  });

  test('"Share → Olemmy" from another app opens a new post with the link', async ({ page }) => {
    await login(page);
    await page.goto('/?share_text=Worth%20reading%20https%3A%2F%2Fexample.com%2Fstory&share_title=');
    await expect(page).toHaveURL(/#\/submit\?/);
    expect(new URL(page.url()).search).toBe('');
    await expect(page.locator('#post-url')).toHaveValue('https://example.com/story');
    await expect(page.locator('#post-title')).toHaveValue('Worth reading');
  });
});

test('a shared favorites page: its feed, and a button to keep it', async ({ page, calls }) => {
  await page.goto('/#/favorites/view?c=linux@lemmy.ml,privacy@lemmy.ml&name=tech');
  await expect(page.locator('.fav-shared-banner')).toContainText('A favorites page shared with you (tech): 2 communities');
  await expect(page.locator('.fav-feed .thing.link').first()).toBeVisible();
  expect(calls.filter((c) => c.path === 'post/list').map((c) => c.query.community_name).sort()).toEqual(['linux@lemmy.ml', 'privacy@lemmy.ml']);
  await page.locator('.fav-shared-banner button', { hasText: 'add to my favorites' }).click();
  await expect(page).toHaveURL(/#\/favorites\?page=1/);
  await expect(page.locator('.fav-pick-label')).toHaveText('page 1 · tech');
  // Shared back out: the same address.
  await copier(page);
  await page.reload();
  await page.locator('.fav-pick > summary').click();
  await page.locator('.fav-pick-menu button', { hasText: 'share this page' }).click();
  const url = new URL(await copied(page));
  expect(url.hash.split('?')[0]).toBe('#/favorites/view');
  const q = new URLSearchParams(url.hash.split('?')[1]);
  expect(q.get('c')).toBe('linux@lemmy.ml,privacy@lemmy.ml');
  expect(q.get('name')).toBe('tech');
});

test('a shared favorites page ignores anything that isn\'t a community name', async ({ page }) => {
  await page.goto('/#/favorites/view?c=javascript:alert(1),linux@lemmy.ml,x@bad_host,%3Cb%3E@lemmy.ml');
  await expect(page.locator('.fav-shared-banner')).toContainText('1 communities');
  await expect(page.locator('.fav-box-list li')).toHaveText(['linux@lemmy.ml']);
});

test('"browse this instance" links ask before switching', async ({ page }) => {
  await copier(page);
  await page.goto('/#/');
  await page.locator('.site-box .share-button').click();
  const link = new URL(await copied(page));
  expect(link.hash).toBe(`#/instance?use=${new URL(fixture('site').site_view.site.actor_id).host}`);

  // Someone else's instance: asked, with a way to keep yours.
  await page.route(/other\.example\/api\/v3\/site/, (route) => route.fulfill({ json: fixture('site') }));
  await page.goto('/#/instance?use=other.example');
  const offer = page.locator('.instance-offer');
  await expect(offer).toContainText('browse other.example in Olemmy');
  await expect(offer.locator('a', { hasText: 'keep using' })).toHaveAttribute('href', '#/');
  await offer.locator('button', { hasText: 'browse other.example' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('olemmy:settings')).data.instance)).toBe('other.example');

  // Your own: straight through.
  await page.goto(`/#/instance?use=other.example&return=${encodeURIComponent('#/communities')}`);
  await expect(page).toHaveURL(/#\/communities$/);
});
