// Share addresses (#/<host>/post/<id>, #/<host>/comment/<id>): "share"
// copies one; opening one goes to your instance's copy when it can, and
// otherwise shows it read only from its own instance.

import { readFileSync } from 'node:fs';
import { test, expect, INSTANCE } from './fake-instance.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
const REMOTE = 'lemmy.world';
const POST = fixture('post').post_view.post;
const REPLY = fixture('comments').comments.find((c) => c.comment.path.split('.').length === 3).comment;
/** The instance in use, as the app names it. */
const HOME = new URL(fixture('site').site_view.site.actor_id).host;

/** A remote instance answering for the fixture post (as post 777 there) and its comments. */
async function remote(page) {
  const asked = [];
  await page.route((u) => u.hostname === REMOTE, (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/v3\//, '');
    asked.push({ path, query: Object.fromEntries(url.searchParams), auth: route.request().headers().authorization });
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (path === 'post') {
      const body = fixture('post');
      Object.assign(body.post_view.post, { id: 777, ap_id: `https://${REMOTE}/post/777` });
      return json(body);
    }
    if (path === 'comment/list') {
      const body = fixture('comments');
      body.comments.forEach((c) => { c.comment.post_id = 777; c.post.id = 777; });
      return json(body);
    }
    if (path === 'comment') {
      const c = fixture('comments').comments[1];
      c.comment.post_id = 777;
      return json({ comment_view: c });
    }
    return json({ error: 'not_found' }, 404);
  });
  return asked;
}

test('"share" copies an address that names the post\'s own instance', async ({ page }) => {
  await page.addInitScript(() => {
    window.copied = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.copied.push(t); } } });
  });
  await page.goto('/#/');
  const row = page.locator('.thing.link').first();
  await expect(row).toBeVisible();
  const id = await row.getAttribute('data-id');
  const apId = fixture('post-list').posts.find((p) => String(p.post.id) === id).post.ap_id;
  await row.locator('.share-button').first().click({ force: true });
  const copied = await page.evaluate(() => window.copied[0]);
  const m = apId.match(/^https:\/\/([^/]+)\/post\/(\d+)$/);
  expect(copied).toBe(m ? `${new URL(page.url()).origin}/#/${m[1]}/post/${m[2]}` : `${new URL(page.url()).origin}/#/resolve?q=${encodeURIComponent(apId)}`);
});

test('a share address for your own instance opens in place, with no lookup', async ({ page, calls }) => {
  await page.goto(`/#/${INSTANCE}/post/${POST.id}`);
  await expect(page.locator('.post-header .thing.link')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/${INSTANCE}/post/${POST.id}$`));
  await expect(page.locator('.guest-banner')).toHaveCount(0);
  expect(calls.some((c) => c.path === 'post' && c.query.id === String(POST.id))).toBe(true);
  expect(calls.some((c) => c.path === 'resolve_object')).toBe(false);
});

test('another instance\'s post that yours knows: your copy, under the share address', async ({ page, calls }) => {
  await page.route(/\/api\/v3\/resolve_object/, (route) => route.fulfill({ json: { post: fixture('post').post_view } }));
  await page.goto(`/#/${REMOTE}/post/777`);
  await expect(page.locator('.post-header .thing.link')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/${REMOTE}/post/777$`));
  await expect(page.locator('.guest-banner')).toHaveCount(0);
  // Read by this instance's own number.
  expect(calls.some((c) => c.path === 'post' && c.query.id === String(POST.id))).toBe(true);
});

test('from a listing, the address bar shows the share address, with no lookup, even after a reload', async ({ page, calls }) => {
  await page.goto('/#/');
  const row = page.locator('.thing.link').first();
  const id = await row.getAttribute('data-id');
  const apId = fixture('post-list').posts.find((p) => String(p.post.id) === id).post.ap_id;
  const share = `#/${apId.replace(/^https:\/\//, '')}`;
  await expect(row.locator('a.comments')).toHaveAttribute('href', share);
  await row.locator('a.comments').click();
  await expect(page.locator('.post-header .thing.link')).toBeVisible();
  expect(decodeURIComponent(new URL(page.url()).hash)).toBe(decodeURIComponent(share));
  await page.reload();
  await expect(page.locator('.post-header .thing.link')).toBeVisible();
  expect(calls.some((c) => c.path === 'resolve_object')).toBe(false);
  expect(calls.filter((c) => c.path === 'post').every((c) => c.query.id === id)).toBe(true);
  // Comment permalinks are share addresses too.
  const first = fixture('comments').comments.find((c) => c.comment.path.split('.').length === 2).comment;
  await expect(page.locator(`#c${first.id} a.permalink`).first()).toHaveAttribute('href', `#/${first.ap_id.replace(/^https:\/\//, '')}`);
});

test('a PieFed-style address: your instance\'s copy, or "not found here yet" with the original', async ({ page }) => {
  const apId = POST.ap_id;
  const share = `/#/${apId.replace(/^https:\/\//, '')}`;
  await page.goto(share);
  await expect(page.locator('h1')).toHaveText('Not found here yet');
  await expect(page.locator('.share-page a', { hasText: 'Open it on piefed.example' })).toHaveAttribute('href', apId);
  await page.route(/\/api\/v3\/resolve_object/, (route) => route.fulfill({ json: { post: fixture('post').post_view } }));
  await page.reload();
  await expect(page.locator('.post-header .thing.link')).toBeVisible();
  await expect(page.locator('.post-header .title')).toHaveText(POST.name);
});

test('not known on your instance: read only from its own, nothing sent to yours by number', async ({ page, calls }) => {
  const asked = await remote(page);
  await page.goto(`/#/${REMOTE}/post/777`);
  await expect(page.locator('.guest-banner')).toContainText(`Shown from ${REMOTE}, read only`);
  await expect(page.locator('.guest-banner')).toContainText(`${HOME} doesn't have this yet`);
  await expect(page.locator('.guest-banner a', { hasText: 'Log in' })).toHaveAttribute('href', new RegExp(`return=${encodeURIComponent(`#/${REMOTE}/post/777`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  const post = page.locator('.post-header .thing.link');
  await expect(post).toBeVisible();
  await expect(page.locator('.comment').first()).toBeVisible();
  // Read only: no voting, saving, replying or reporting.
  await expect(post.locator('.arrow.up')).toBeDisabled();
  await expect(page.locator('.comment .arrow.up').first()).toBeDisabled();
  await expect(page.locator('.save-button, .reply-button, .reply-form, .more-menu')).toHaveCount(0);
  // Its links stay share addresses.
  await expect(post.locator('a.comments')).toHaveAttribute('href', `#/${REMOTE}/post/777`);
  // The remote instance was asked without a login; this instance only for resolve_object.
  expect(asked.some((a) => a.path === 'post' && a.query.id === '777')).toBe(true);
  expect(asked.every((a) => !a.auth)).toBe(true);
  expect(calls.filter((c) => /^(post|comment)(\/|$)/.test(c.path))).toEqual([]);
  expect(calls.some((c) => c.path === 'resolve_object' && c.query.q === `https://${REMOTE}/post/777`)).toBe(true);
});

test('a shared comment opens its thread, highlighted', async ({ page }) => {
  await remote(page);
  const c = fixture('comments').comments[1].comment;
  await page.goto(`/#/${REMOTE}/comment/${c.id}`);
  await expect(page.locator('.guest-banner')).toBeVisible();
  await expect(page.locator('.infobar', { hasText: 'single comment' })).toBeVisible();
  await expect(page.locator(`#c${c.id}`)).toHaveClass(/highlighted/);
  await expect(page.locator('.infobar a', { hasText: 'view the rest' })).toHaveAttribute('href', `#/${REMOTE}/post/777`);
});

test('"context": a reply\'s share address with ?context=1 shows its parent\'s thread, the reply marked', async ({ page, calls }) => {
  // Seen on the post page first, so its address is known in this tab.
  await page.goto(`/#/post/${POST.id}`);
  await expect(page.locator(`#c${REPLY.id}`)).toBeVisible();
  await page.goto(`/#/${REPLY.ap_id.replace(/^https:\/\//, '')}?context=1`);
  await expect(page.locator('.infobar', { hasText: 'single comment' })).toBeVisible();
  await expect(page.locator(`#c${REPLY.id}`)).toHaveClass(/highlighted/);
  // The thread is the parent's.
  expect(calls.some((c) => c.path === 'comment/list' && c.query.parent_id === REPLY.path.split('.')[1])).toBe(true);
  expect(calls.some((c) => c.path === 'resolve_object')).toBe(false);
});

test('a permalink on your own instance highlights its comment too', async ({ page }) => {
  const c = fixture('comments').comments[1].comment;
  await page.goto(`/#/post/${POST.id}/comment/${c.id}`);
  await expect(page.locator(`#c${c.id}`)).toHaveClass(/highlighted/);
});

test('a bad share address is a plain "not found"', async ({ page }) => {
  await page.goto('/#/not_a_host/post/5');
  await expect(page.locator('.error-box')).toContainText('not found');
});

test.describe('new to Olemmy (no instance chosen)', () => {
  test.use({ instanceOptions: { noInstance: true } });
  test('reads it straight from its own instance, and offers to choose one', async ({ page, errors }) => {
    await remote(page);
    await page.goto(`/#/${REMOTE}/post/777`);
    await expect(page.locator('.post-header .thing.link')).toBeVisible();
    const choose = page.locator('.guest-banner a', { hasText: 'Choose your instance' });
    await expect(choose).toBeVisible();
    await expect(choose).toHaveAttribute('href', /^#\/instance\?return=/);
    expect(errors).toEqual([]);
  });
});
