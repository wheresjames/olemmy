import { readFileSync } from 'node:fs';
import { test, expect } from './fake-instance.mjs';

const postList = JSON.parse(readFileSync(new URL('../fixtures/post-list.json', import.meta.url), 'utf8'));
const community = JSON.parse(readFileSync(new URL('../fixtures/community.json', import.meta.url), 'utf8'));
const user = JSON.parse(readFileSync(new URL('../fixtures/user.json', import.meta.url), 'utf8'));

test.use({ instanceOptions: { loggedIn: true } });

async function seedAccounts(page, secondInstance = 'fixture.test') {
  await page.addInitScript((instance) => {
    localStorage.setItem('olemmy:accounts', JSON.stringify({ v: 1, data: {
      active: 0,
      list: [
        { instance: 'fixture.test', username: 'first', jwt: 'first-token', remember: true },
        { instance, username: 'second', jwt: 'second-token', remember: true },
      ],
    } }));
  }, secondInstance);
}

const switchToSecond = (page) => page.evaluate(async () => {
  const { switchAccount } = await import('/js/state/session.js');
  switchAccount(1);
});

async function accountPosts(page) {
  await page.route('https://fixture.test/api/v3/post/list*', (route) => {
    const body = structuredClone(postList);
    body.posts[0].post.name = route.request().headers().authorization === 'Bearer second-token'
      ? 'Second account post' : 'First account post';
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'access-control-allow-origin': '*' } });
  });
}

function heldLookup(page, path, response) {
  let release;
  let started;
  const hold = new Promise((resolve) => { release = resolve; });
  const requested = new Promise((resolve) => { started = resolve; });
  const install = page.route(`https://fixture.test/api/v3/${path}?*`, async (route) => {
    started();
    await hold;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response),
      headers: { 'access-control-allow-origin': '*' } });
  });
  return { install, requested, release: () => release() };
}

test('a retained client cannot send the new account token to its old instance', async ({ page, calls }) => {
  await seedAccounts(page, 'second.test');
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await page.evaluate(async () => {
    const { api, switchAccount } = await import('/js/state/session.js');
    const retained = api.peek();
    switchAccount(1);
    await retained.get('site', { review: 'retained' }, { fresh: true });
  });
  expect(calls.find((c) => c.path === 'site' && c.query.review === 'retained')?.auth).toBeUndefined();
});

test('a cached favorites merge refreshes for the newly selected account', async ({ page }) => {
  await seedAccounts(page);
  await page.addInitScript(() => {
    localStorage.setItem('olemmy:favorites', JSON.stringify({ v: 1, data: {
      'fixture.test': { pages: [{ name: '', communities: ['linux@fixture.test'] }], current: 0 },
    } }));
  });
  await accountPosts(page);
  await page.goto('/#/favorites');
  await expect(page.locator('.fav-feed .title').first()).toHaveText('First account post');
  await switchToSecond(page);
  await expect(page.locator('.fav-feed .title').first()).toHaveText('Second account post');
});

test('back navigation does not restore another account\'s listing', async ({ page }) => {
  await seedAccounts(page);
  await accountPosts(page);
  await page.goto('/#/all');
  await expect(page.locator('.thing.link .title').first()).toHaveText('First account post');
  await page.goto('/#/about');
  await switchToSecond(page);
  await page.goBack();
  await expect(page.locator('.thing.link .title').first()).toHaveText('Second account post');
});

test('switching accounts during community lookup does not submit a post', async ({ page, calls }) => {
  await seedAccounts(page);
  const lookup = heldLookup(page, 'community', community);
  await lookup.install;
  await page.goto('/#/submit?type=text');
  await page.locator('#post-title').fill('A quiet update');
  await page.locator('#post-community').fill('linux@fixture.test');
  await page.locator('.submit-form button[type="submit"]').click();
  await lookup.requested;
  await switchToSecond(page);
  lookup.release();
  await page.waitForTimeout(100);
  expect(calls.filter((c) => c.path === 'post' && c.method === 'POST')).toHaveLength(0);
});

test('switching accounts during recipient lookup does not send a message', async ({ page, calls }) => {
  await seedAccounts(page);
  const lookup = heldLookup(page, 'user', user);
  await lookup.install;
  await page.goto('/#/message/compose?to=harbor_reader@fixture.test');
  await page.locator('#compose-body').fill('A private note');
  await page.locator('.compose-form button[type="submit"]').click();
  await lookup.requested;
  await switchToSecond(page);
  lookup.release();
  await page.waitForTimeout(100);
  expect(calls.filter((c) => c.path === 'private_message' && c.method === 'POST')).toHaveLength(0);
});
