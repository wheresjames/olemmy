// Reading, voting, login, themes, keyboard, filters and failure states,
// against the fake instance (fake-instance.mjs).

import { test, expect, INSTANCE } from './fake-instance.mjs';

test.describe('first run', () => {
  test.use({ instanceOptions: { noInstance: true } });
  test('without an instance starts at the picker', async ({ page }) => {
  await page.goto('/#/');
  await expect(page).toHaveURL(/#\/instance\?return=/);
  await expect(page.getByRole('heading', { name: 'Choose your Lemmy instance' })).toBeVisible();
  });

  test('the picker lists instances to search, sort and star', async ({ page, errors }) => {
    await page.goto('/#/instance');
    const cards = page.locator('.instance-cards:not(.starred-instances) .instance-card');
    // Ranked by Lemmyverse's score; flagged instances left out.
    await expect(cards).toHaveCount(3);
    await expect(cards.first().locator('.instance-card-name')).toHaveText('Big Place');
    await expect(page.locator('[data-host="spam.example"]')).toHaveCount(0);
    await expect(cards.nth(2)).toContainText('sign-ups closed');
    await page.locator('#instance-search').fill('gardening');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute('data-host', 'quiet.example');
    await page.locator('#instance-search').fill('');
    await page.getByLabel('accepting sign-ups').check();
    await expect(cards).toHaveCount(2);
    // A star moves it to the top, and stays after a reload.
    await page.getByRole('button', { name: 'Star Fixture' }).click();
    await expect(page.locator('.starred-instances .instance-card')).toHaveAttribute('data-host', 'fixture.test');
    await expect(cards).toHaveCount(1);
    await page.reload();
    await expect(page.locator('.starred-instances .instance-card')).toHaveAttribute('data-host', 'fixture.test');
    await expect(page.getByRole('button', { name: 'Unstar Fixture' })).toHaveAttribute('aria-pressed', 'true');
    // Choosing one checks it and switches to it.
    await page.locator('.starred-instances .instance-card-name').click();
    await expect(page.locator('.thing.link').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('without the instance list, the picker keeps its built-in few and starred ones', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('olemmy:starredInstances', JSON.stringify({ v: 1, data: { list: ['fixture.test'] } })));
    await page.route('https://data.lemmyverse.net/**', (r) => r.fulfill({ status: 503, body: '' }));
    await page.goto('/#/instance');
    await expect(page.locator('.instance-directory .error-box')).toContainText('Couldn\'t load the instance list');
    await expect(page.locator('.instance-list li')).toHaveCount(10);
    await expect(page.locator('.starred-instances .instance-card-name')).toHaveText('fixture.test');
  });
});

test('the header\'s instance is a link, or with starred instances a menu headed by the picker', async ({ page, errors }) => {
  await page.goto('/#/');
  await expect(page.locator('#header-bottom-right .instance-name a')).toHaveAttribute('href', '#/instance');
  await page.evaluate(() => localStorage.setItem('olemmy:starredInstances', JSON.stringify({ v: 1, data: { list: ['fixture.test', 'big.example'] } })));
  await page.reload();
  const menu = page.locator('details.instance-menu');
  await menu.locator('summary').click();
  const items = menu.locator('.account-list li');
  await expect(items).toHaveCount(3);
  await expect(items.first()).toHaveText('choose an instance…');
  await expect(items.nth(1)).toHaveClass(/current/);
  // The fake instance is the only one that answers: no switch, and an explanation.
  await items.nth(2).getByRole('button', { name: 'big.example' }).click();
  await expect(page.locator('.toast-error')).toContainText('Couldn\'t switch to big.example');
  await expect(menu.locator('summary')).toContainText('fixture.test');
  await menu.locator('summary').click();
  await items.first().locator('a').click();
  await expect(page).toHaveURL(/#\/instance/);
  expect(errors.filter((e) => !/Failed to load resource|ERR_FAILED|NetworkError|CORS/i.test(e))).toEqual([]);
});

test('front page lists posts with ranks, scores and sidebar', async ({ page, calls, errors }) => {
  await page.goto('/#/');
  await expect(page.locator('.thing.link')).toHaveCount(25);
  await expect(page.locator('.thing.link .rank').first()).toHaveText('1');
  await expect(page.locator('.side-box.site-box')).toContainText('Lemmy');
  const list = calls.find((c) => c.path === 'post/list');
  expect(list.query.type_).toBe('Local');
  expect(errors).toEqual([]);
});

test('sort tabs change the request', async ({ page, calls }) => {
  await page.goto('/#/all');
  await page.getByRole('link', { name: 'new', exact: true }).click();
  await expect(page).toHaveURL(/sort=New/);
  await expect.poll(() => calls.filter((c) => c.path === 'post/list').at(-1)?.query.sort).toBe('New');
  expect(calls.filter((c) => c.path === 'post/list').at(-1).query.type_).toBe('All');
});

test('post page: comments nest, collapse, and stay collapsed', async ({ page, errors }) => {
  await page.goto('/#/post/100040');
  const first = page.locator('.comment-tree > .comment').first();
  await expect(first).toBeVisible();
  const withKids = page.locator('.comment-tree > .comment:has(> .children > .comment)').first();
  const kids = withKids.locator(':scope > .children');
  await expect(kids).toBeVisible();
  await withKids.locator(':scope > .comment-inner .expand').click();
  await expect(kids).toBeHidden();
  await expect(withKids.locator(':scope > .comment-inner .child-count')).toContainText('child');
  await page.reload();
  await expect(page.locator('.comment-tree > .comment:has(> .children > .comment)').first().locator(':scope > .children')).toBeHidden();
  expect(errors).toEqual([]);
});

test('voting logged out goes to login; logging in and voting sends the vote', async ({ page, calls }) => {
  await page.goto('/#/');
  await page.locator('.thing.link').first().locator('.arrow.up').click();
  await expect(page).toHaveURL(/#\/login\?return=/);
  await page.getByLabel('username or email').fill('tester');
  await page.getByLabel('password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'log in' }).click();
  await expect(page.locator('.error-box')).toContainText('Wrong username or password');
  await page.getByLabel('password', { exact: true }).fill('correct horse');
  await page.getByRole('button', { name: 'log in' }).click();
  await expect(page.locator('.username')).toHaveText('tester');
  await expect(page.locator('.inbox-link .badge')).toHaveText('1');

  const row = page.locator('.thing.link').first();
  await row.locator('.arrow.up').click();
  await expect(row.locator('.midcol')).toHaveClass(/likes/);
  await expect(row.locator('.arrow.up')).toHaveAttribute('aria-pressed', 'true');
  const vote = calls.find((c) => c.path === 'post/like');
  expect(vote.body.score).toBe(1);
  expect(vote.auth).toBe('Bearer test-jwt');
});

test('"remember me" off keeps the token out of localStorage', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByLabel('username or email').fill('tester');
  await page.getByLabel('password', { exact: true }).fill('correct horse');
  await page.getByLabel('remember me').uncheck();
  await page.getByRole('button', { name: 'log in' }).click();
  await expect(page.locator('.username')).toHaveText('tester');
  const local = await page.evaluate(() => JSON.stringify(localStorage));
  expect(local).not.toContain('test-jwt');
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).toContain('test-jwt');
});

test('theme: Auto follows the system; the toggle forces Light/Dark before first paint', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await bg()).toBe('rgb(24, 25, 26)');
  await page.locator('.theme-toggle').click();            // auto -> light
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await bg()).toBe('rgb(255, 255, 255)');
  await page.locator('.theme-toggle').click();            // light -> dark
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await bg()).toBe('rgb(24, 25, 26)');
});

test('keyboard: j/k select, x expands, ? shows help', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await page.keyboard.press('j');
  await expect(page.locator('.thing.link').first()).toHaveClass(/kb-selected/);
  await page.keyboard.press('j');
  await expect(page.locator('.thing.link').nth(1)).toHaveClass(/kb-selected/);
  await page.keyboard.press('k');
  await expect(page.locator('.thing.link').first()).toBeFocused();
  await page.keyboard.press('x');
  await expect(page.locator('.thing.link').first().locator('.expando-slot')).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
});

test('local keyword filter hides matching posts', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.thing.link')).toHaveCount(25);
  const titles = (await page.locator('.thing.link .title').allTextContents()).map((t) => t.trim());
  const title = titles.find((t) => t.split(/\s+/).some((w) => /^[A-Za-z]{5,}$/.test(w)));
  const word = title.split(/\s+/).find((w) => /^[A-Za-z]{5,}$/.test(w));
  await page.goto('/#/settings?feature=filters');
  const box = page.locator('.filter-list').first().locator('textarea');
  await box.fill(word);
  await box.blur();
  await page.goto('/#/');
  await expect(page.locator('.filtered-note')).toContainText('hidden by your filters');
  await expect(page.locator('.thing.link .title', { hasText: title })).toHaveCount(0);
});

test('an unreachable instance explains CORS and offers another', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough');
  await page.unroute('**');
  await page.route((u) => u.hostname !== 'localhost', (r) => r.abort());
  await page.goto('/#/');
  await expect(page.locator('.error-box')).toContainText("doesn't allow third-party web clients");
  await expect(page.getByRole('link', { name: 'Choose another instance' }).first()).toBeVisible();
});

test('settings export leaves tokens out unless asked', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByLabel('username or email').fill('tester');
  await page.getByLabel('password', { exact: true }).fill('correct horse');
  await page.getByRole('button', { name: 'log in' }).click();
  await expect(page.locator('.username')).toHaveText('tester');
  const data = await page.evaluate(async () => (await import('./js/views/settings.js')).exportData(false));
  expect(JSON.stringify(data)).not.toContain('test-jwt');
  expect(data.data['olemmy:settings'].data.instance).toBe(INSTANCE);
});

test('never-ending scroll loads the next page with a separator', async ({ page, calls }) => {
  await page.goto('/#/');
  await expect(page.locator('.thing.link')).toHaveCount(25);
  await page.locator('.listing-status').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 3000);
  await expect(page.locator('.ner-separator').first()).toContainText('page 2');
  await expect.poll(() => page.locator('.thing.link').count()).toBeGreaterThanOrEqual(50);
  // Page 1 by number, page 2 by the cursor Lemmy returned.
  const [first, second] = calls.filter((c) => c.path === 'post/list');
  expect(first.query.page).toBe('1');
  expect(second.query.page_cursor).toBeTruthy();
  expect(second.query.page).toBeUndefined();
  await expect(page.locator('.thing.link .rank').nth(30)).toHaveText('31');
});

test('never-ending scroll keeps loading after coming back to a listing', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.thing.link')).toHaveCount(25);
  await page.goto('/#/about');
  await page.goBack();
  await expect(page.locator('.thing.link')).toHaveCount(25);
  await page.locator('.listing-status').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 3000);
  await expect(page.locator('.ner-separator').first()).toContainText('page 2');
});

test.describe('replying', () => {
  test.use({ instanceOptions: { loggedIn: true } });
  test('a reply appears at once and its draft is cleared', async ({ page, calls }) => {
    await page.addInitScript(() => {
      localStorage.setItem('olemmy:accounts', JSON.stringify({ v: 1, data: { active: 0, list: [{ instance: 'fixture.test', username: 'tester', jwt: 'test-jwt', remember: true }] } }));
    });
    await page.goto('/#/post/100040');
    const box = page.locator('.commentarea > .reply-form textarea');
    await box.fill('A **new** top-level comment');
    await page.reload();
    await expect(page.locator('.commentarea > .reply-form textarea')).toHaveValue('A **new** top-level comment');
    await page.locator('.commentarea > .reply-form button[type=submit]').click();
    await expect(page.locator('#c999 .md strong')).toHaveText('new');
    expect(calls.find((c) => c.path === 'comment' && c.method === 'POST').body.content).toBe('A **new** top-level comment');
    await expect(page.locator('.commentarea > .reply-form textarea')).toHaveValue('');
    expect(await page.evaluate(() => localStorage.getItem('olemmy:drafts'))).not.toContain('top-level');
  });
});
