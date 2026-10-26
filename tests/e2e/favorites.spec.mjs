// Favorites: starring communities (logged in or not), the FAVORITES feed
// a page at a time, managing pages on #/subscriptions (buttons and
// dragging), the federation warning, and multis becoming pages.

import { readFileSync } from 'node:fs';
import { test, expect, INSTANCE, fakeInstance } from './fake-instance.mjs';

const seed = (page, pages, current = 0) => page.addInitScript(([host, p, c]) => {
  if (sessionStorage.getItem('seeded:favorites')) return;
  localStorage.setItem('olemmy:favorites', JSON.stringify({ v: 1, data: { [host]: { pages: p, current: c } } }));
  sessionStorage.setItem('seeded:favorites', '1');
}, [INSTANCE, pages, current]);

const stored = (page) => page.evaluate((host) => JSON.parse(localStorage.getItem('olemmy:favorites') || '{}').data?.[host]?.pages || [], INSTANCE);
const names = (n, prefix = 'c') => Array.from({ length: n }, (_, i) => `${prefix}${i}@lemmy.ml`);

test('star a community logged out; FAVORITES shows its posts', async ({ page, calls }) => {
  await page.goto('/#/c/linux');
  const star = page.locator('.community-box .favorite-button');
  await expect(star).toHaveText('☆ favorite');
  await star.click();
  await expect(star).toHaveText('★ page 1');
  expect(await stored(page)).toEqual([{ name: '', communities: ['linux@fixture.test'] }]);

  await page.locator('#sr-header-area a', { hasText: 'favorites' }).click();
  await expect(page.locator('.fav-feed .thing.link').first()).toBeVisible();
  await expect(page.locator('.fav-pager .fav-pick-label')).toHaveText('page 1');
  expect(calls.some((c) => c.path === 'post/list' && c.query.community_name === 'linux@fixture.test')).toBe(true);
  await page.locator('.sr-dropdown > summary').click();
  await expect(page.locator('.sr-dropdown-menu .fav-menu-item')).toHaveText('page 1');
});

test('menus close when an item is chosen, on a click outside, on Escape, and when another opens', async ({ page }) => {
  await seed(page, [{ name: 'news', communities: ['linux@lemmy.ml'] }]);
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  const menu = page.locator('details.sr-dropdown');
  await expect(menu.locator('summary')).toHaveText('my communities');

  await menu.locator('summary').click();
  await expect(menu).toHaveAttribute('open', '');
  await menu.locator('.fav-menu-item a').click();
  await expect(page).toHaveURL(/#\/favorites\?page=1/);
  await expect(menu).not.toHaveAttribute('open', '');

  await menu.locator('summary').click();
  await page.locator('#footer').click({ position: { x: 5, y: 5 } });
  await expect(menu).not.toHaveAttribute('open', '');

  await menu.locator('summary').click();
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(menu.locator('summary')).toBeFocused();

  // Opening one menu closes another.
  await page.goto('/#/');
  const more = page.locator('.thing.link details.more-menu').first();
  await more.locator('summary').click();
  await expect(more).toHaveAttribute('open', '');
  await menu.locator('summary').click();
  await expect(more).not.toHaveAttribute('open', '');
  await expect(menu).toHaveAttribute('open', '');
});

test('the pager: next, previous, [ and ], and FAVORITES remembers the page', async ({ page, calls }) => {
  await seed(page, [{ name: 'news', communities: ['news@lemmy.ml'] }, { name: '', communities: ['linux@lemmy.ml', 'privacy@lemmy.ml'] }]);
  await page.goto('/#/favorites');
  await expect(page.locator('.fav-pick-label')).toHaveText('page 1 · news');
  await expect(page.locator('.fav-feed')).toHaveClass(/fav-c0/);
  await page.locator('.fav-step[rel="next"]').click();
  await expect(page.locator('.fav-pick-label')).toHaveText('page 2');
  await expect(page.locator('.fav-feed')).toHaveClass(/fav-c1/);
  await expect(page.locator('.fav-feed .thing.link').first()).toBeVisible();
  const asked = calls.filter((c) => c.path === 'post/list').map((c) => c.query.community_name);
  expect(asked).toEqual(expect.arrayContaining(['news@lemmy.ml', 'linux@lemmy.ml', 'privacy@lemmy.ml']));
  await page.keyboard.press('[');
  await expect(page.locator('.fav-pick-label')).toHaveText('page 1 · news');
  await page.keyboard.press(']');
  await expect(page.locator('.fav-pick-label')).toHaveText('page 2');
  // Plain FAVORITES opens where you left off.
  await page.goto('/#/');
  await page.goto('/#/favorites');
  await expect(page.locator('.fav-pick-label')).toHaveText('page 2');
  // The page menu jumps anywhere.
  await page.locator('.fav-pick > summary').click();
  await page.locator('.fav-pick-menu a', { hasText: 'news' }).click();
  await expect(page.locator('.fav-pick-label')).toHaveText('page 1 · news');
});

test('multis became favorites pages; #/m/<name> still works', async ({ page, calls }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded:multis')) return;
    localStorage.setItem('olemmy:multis', JSON.stringify({ v: 1, data: { list: [{ name: 'tech', communities: ['linux@lemmy.ml', 'privacy@lemmy.ml'] }] } }));
    sessionStorage.setItem('seeded:multis', '1');
  });
  await page.goto('/#/m/tech?sort=New');
  await expect(page.locator('.fav-pick-label')).toHaveText('page 1 · tech');
  await expect(page.locator('.fav-feed .thing.link').first()).toBeVisible();
  // Two communities answering the same fixture: each post once.
  await expect(page.locator('.fav-feed .thing.link')).toHaveCount(25);
  expect(calls.filter((c) => c.path === 'post/list').map((c) => c.query.community_name).sort()).toEqual(['linux@lemmy.ml', 'privacy@lemmy.ml']);
  expect(await page.evaluate(() => localStorage.getItem('olemmy:multis'))).toBeNull();
  expect(await stored(page)).toEqual([{ name: 'tech', communities: ['linux@lemmy.ml', 'privacy@lemmy.ml'] }]);
});

test('manage: move with buttons and "move to"; a full page refuses', async ({ page }) => {
  await seed(page, [{ name: '', communities: names(10, 'a') }, { name: '', communities: ['b0@lemmy.ml', 'b1@lemmy.ml'] }]);
  await page.goto('/#/subscriptions');
  const pages = page.locator('.fav-page');
  await expect(pages).toHaveCount(2);
  await expect(pages.nth(0).locator('.fav-count')).toHaveText('10 / 10');
  await expect(pages.nth(0)).toHaveClass(/fav-c0/);

  // ↓ on the last row of page 1 moves it to the top of page 2.
  await page.getByRole('button', { name: 'Move a9@lemmy.ml down' }).click();
  await expect.poll(async () => (await stored(page))[1].communities).toEqual(['a9@lemmy.ml', 'b0@lemmy.ml', 'b1@lemmy.ml']);
  // "move to" a new page.
  await page.getByLabel('Move b1@lemmy.ml to another page').selectOption({ label: 'a new page' });
  await expect(pages).toHaveCount(3);
  // Page 1 is full again after moving a9 back; then nothing else fits.
  await page.getByLabel('Move a9@lemmy.ml to another page').selectOption({ index: 1 });
  await expect(pages.nth(0).locator('.fav-count')).toHaveText('10 / 10');
  await expect(page.getByLabel('Move b0@lemmy.ml to another page').locator('option', { hasText: 'page 1' })).toBeDisabled();
  // Remove.
  await page.getByRole('button', { name: 'Remove b0@lemmy.ml from favorites' }).click();
  await expect(pages).toHaveCount(2);
});

test('manage: drag a community to another page, and onto a new page', async ({ page }) => {
  await seed(page, [{ name: '', communities: ['a0@lemmy.ml', 'a1@lemmy.ml', 'a2@lemmy.ml'] }, { name: 'two', communities: ['b0@lemmy.ml', 'b1@lemmy.ml'] }]);
  await page.goto('/#/subscriptions');
  const drag = async (name, target) => {
    const from = await page.locator(`.fav-row[data-name="${name}"] .fav-handle`).boundingBox();
    const to = await target.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + 10, from.y + (to.y + to.height / 2 - from.y) * (i / 8));
    await page.mouse.up();
  };
  // Onto b1's upper half: between b0 and b1.
  const b1 = page.locator('.fav-row[data-name="b1@lemmy.ml"]');
  const box = await b1.boundingBox();
  await drag('a0@lemmy.ml', { boundingBox: async () => ({ ...box, height: box.height / 2 - 2 }) });
  await expect.poll(async () => (await stored(page))[1].communities).toEqual(['b0@lemmy.ml', 'a0@lemmy.ml', 'b1@lemmy.ml']);
  await drag('a1@lemmy.ml', page.locator('.fav-new-page'));
  await expect.poll(async () => (await stored(page)).length).toBe(3);
  expect((await stored(page))[2].communities).toEqual(['a1@lemmy.ml']);
  await expect(page.locator('.fav-ghost')).toHaveCount(0);
});

test('manage: drag with a finger on a phone', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch events through the Chrome DevTools Protocol');
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.addInitScript((host) => localStorage.setItem('olemmy:settings', JSON.stringify({ v: 1, data: { instance: host } })), INSTANCE);
  await page.route(/\/deployment\.json/, (r) => r.fulfill({ status: 404, body: '' }));
  await fakeInstance(page, {});
  await seed(page, [{ name: '', communities: ['a0@lemmy.ml', 'a1@lemmy.ml'] }, { name: '', communities: ['b0@lemmy.ml'] }]);
  await page.goto('/#/subscriptions');
  const from = await page.locator('.fav-row[data-name="a0@lemmy.ml"] .fav-handle').boundingBox();
  const to = await page.locator('.fav-row[data-name="b0@lemmy.ml"]').boundingBox();
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const x = from.x + from.width / 2;
  await touch('touchStart', x, from.y + from.height / 2);
  for (let i = 1; i <= 10; i++) await touch('touchMove', x, from.y + from.height / 2 + (to.y + to.height * 0.75 - from.y - from.height / 2) * (i / 10));
  await touch('touchEnd');
  await expect.poll(async () => (await stored(page))[1].communities).toEqual(['b0@lemmy.ml', 'a0@lemmy.ml']);
  await context.close();
});

test('manage: add by name; warn about communities this instance doesn\'t follow', async ({ page }) => {
  const body = JSON.parse(readFileSync(new URL('../fixtures/community.json', import.meta.url), 'utf8'));
  body.community_view.community.local = false;
  body.community_view.counts.subscribers_local = 0;
  await page.route(/\/api\/v3\/community\?/, (route) => route.fulfill({ json: body }));
  await page.goto('/#/subscriptions');
  await page.locator('#fav-add-input').fill('linux@lemmy.ml');
  await page.locator('.fav-add button[type="submit"]').click();
  await expect(page.locator('.fav-row')).toHaveCount(1);
  await expect(page.locator('.fav-warning')).toContainText(`not followed on ${INSTANCE}`);
});

test.describe('logged in', () => {
  test.use({ instanceOptions: { loggedIn: true } });
  test('the subscribed tab lists the account\'s subscriptions; favorites still work', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('olemmy:accounts', JSON.stringify({ v: 1, data: { active: 0, list: [{ instance: 'fixture.test', username: 'tester', jwt: 'test-jwt', remember: true }] } })));
    await page.goto('/#/subscriptions?tab=subscribed');
    const row = page.locator('.subs-row').first();
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'unsubscribe' })).toBeVisible();
    await row.locator('.favorite-button').click();
    await expect(row.locator('.favorite-button')).toHaveText('★ page 1');
    await page.locator('.tabmenu a', { hasText: 'favorites' }).click();
    await expect(page.locator('.fav-row')).toHaveCount(1);
  });
});

test('phone: the feed and the manage page fit, with no sideways scroll', async ({ page }) => {
  await seed(page, [{ name: 'news', communities: ['linux@lemmy.ml'] }, { name: '', communities: ['privacy@lemmy.ml'] }]);
  await page.setViewportSize({ width: 360, height: 800 });
  for (const [hash, ready] of [['#/favorites', '.fav-feed .thing.link'], ['#/subscriptions', '.fav-row']]) {
    await page.goto(`/${hash}`);
    await expect(page.locator(ready).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), hash).toBeLessThanOrEqual(0);
  }
  await expect(page.locator('.fav-handle').first()).toBeVisible();
});
