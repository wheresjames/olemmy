// Every route renders, logged in and out, without errors.

import { readFileSync } from 'node:fs';
import { test, expect } from './fake-instance.mjs';

const post = JSON.parse(readFileSync(new URL('../fixtures/post.json', import.meta.url), 'utf8')).post_view.post;

const PAGES = [
  ['#/', '.thing.link'],
  ['#/all?sort=TopWeek', '.thing.link'],
  ['#/c/linux', '.community-box'],
  [`#/post/${post.id}`, '.comment-tree'],
  ['#/u/harbor_reader', '.user-box'],
  ['#/u/harbor_reader/comments', '.user-box'],
  ['#/search?q=linux&type=Communities', '.community-row'],
  ['#/search?q=linux', '.thing.link'],
  ['#/communities', '.community-row'],
  ['#/settings', '.settings-page'],
  ['#/about', '.doc-page'],
  ['#/instance', '.instance-page'],
  ['#/signup', '.signup-page form'],
  ['#/nowhere', '.error-box'],
];

const LOGGED_IN = [
  ['#/inbox', '.inbox-item'],
  ['#/inbox?tab=messages', '.inbox-message'],
  ['#/message/compose?to=harbor_reader@fixture.test', '.compose-form'],
  ['#/submit', '.submit-form'],
  [`#/submit?crosspost=${post.id}`, '.submit-form'],
  ['#/account', '.account-form'],
];

for (const [hash, selector] of PAGES) {
  test(`renders ${hash}`, async ({ page, errors }) => {
    await page.goto(`/${hash}`);
    await expect(page.locator(selector).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test.describe('no instance chosen', () => {
  test.use({ instanceOptions: { noInstance: true } });
  test('the about page opens without an instance, from the footer', async ({ page, errors }) => {
    await page.goto('/#/about');
    await expect(page).toHaveURL(/#\/about$/);
    await expect(page.locator('.doc-page h1')).toHaveText('About Olemmy');
    await expect(page.locator('#about-privacy')).toHaveText('privacy policy');
    await page.goto('/#/instance');
    await page.locator('#footer a', { hasText: 'about' }).click();
    await expect(page.locator('.doc-page')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('logged in', () => {
  test.use({ instanceOptions: { loggedIn: true } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('olemmy:accounts', JSON.stringify({ v: 1, data: { active: 0, list: [{ instance: 'fixture.test', username: 'tester', jwt: 'test-jwt', remember: true }] } }));
    });
  });
  for (const [hash, selector] of LOGGED_IN) {
    test(`renders ${hash}`, async ({ page, errors }) => {
      await page.goto(`/${hash}`);
      await expect(page.locator(selector).first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
  test('crosspost prefills the form', async ({ page }) => {
    await page.goto(`/#/submit?crosspost=${post.id}`);
    await expect(page.locator('#post-title')).toHaveValue(post.name);
    await expect(page.locator('#post-body')).toHaveValue(/^cross-posted from: https:/);
  });
});

test('the front page\'s welcome note closes for good', async ({ page }) => {
  await page.goto('/#/');
  const note = page.locator('.welcome-note');
  await expect(note).toContainText('without an account');
  await note.getByRole('button', { name: 'Close' }).click();
  await expect(note).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await expect(note).toHaveCount(0);
});
