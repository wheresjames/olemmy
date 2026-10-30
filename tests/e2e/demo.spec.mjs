// The demo (docs/demo.md), in the browser: offered to everyone on the
// instance picker, clearly marked on every page, things you do stick, the
// DEMO panel changes your role, links can't be shared, and leaving it takes
// you back to the real instances with nothing left behind.

import { test, expect } from './fake-instance.mjs';

test.use({ instanceOptions: { noInstance: true } });

const storedVote = (page, id) => page.evaluate((pid) => JSON.parse(localStorage.getItem('olemmy:demo') || 'null')?.me.votes.post[pid], id);

test('votes toggle per post, without changing another post by the same author', async ({ page, errors }) => {
  await page.goto('/#/instance');
  await page.getByRole('button', { name: 'try the demo' }).click();
  const rows = page.locator('.thing.link');
  await expect(rows.first()).toBeVisible();
  await expect(page.locator('#header')).toContainText('visitor');
  const pair = await rows.evaluateAll((nodes) => {
    const seen = new Map();
    for (let i = 0; i < nodes.length; i++) {
      const author = nodes[i].dataset.author;
      if (seen.has(author)) return [seen.get(author), i];
      seen.set(author, i);
    }
    return null;
  });
  expect(pair).not.toBeNull();
  const first = rows.nth(pair[0]);
  const second = rows.nth(pair[1]);
  const firstId = await first.getAttribute('data-id');
  const firstScore = Number(await first.locator('.midcol .score').innerText());
  const secondScore = await second.locator('.midcol .score').innerText();
  const secondVote = await second.locator('.arrow.up').getAttribute('aria-pressed');

  await first.locator('.arrow.up').click();
  await expect(first.locator('.midcol .score')).toHaveText(String(firstScore + 1));
  await expect.poll(() => storedVote(page, firstId)).toBe(1);
  await first.locator('.arrow.up').click();
  await expect(first.locator('.midcol .score')).toHaveText(String(firstScore));
  await expect.poll(() => storedVote(page, firstId)).toBeUndefined();
  await first.locator('.arrow.down').click();
  await expect(first.locator('.midcol .score')).toHaveText(String(firstScore - 1));
  await expect.poll(() => storedVote(page, firstId)).toBe(-1);
  await first.locator('.arrow.down').click();
  await expect(first.locator('.midcol .score')).toHaveText(String(firstScore));
  await expect.poll(() => storedVote(page, firstId)).toBeUndefined();

  // Two clicks before the first request finishes must leave no vote behind.
  await first.locator('.arrow.up').click();
  await first.locator('.arrow.up').click();
  await expect(first.locator('.midcol .score')).toHaveText(String(firstScore));
  await page.waitForTimeout(500);
  expect(await storedVote(page, firstId)).toBeUndefined();

  await expect(second.locator('.midcol .score')).toHaveText(secondScore);
  await expect(second.locator('.arrow.up')).toHaveAttribute('aria-pressed', secondVote);

  await first.locator('.arrow.up').click();
  await expect.poll(() => storedVote(page, firstId)).toBe(1);
  await first.locator('a.comments').click();
  await expect(page.locator(`.thing.link[data-id="${firstId}"] .midcol .score`)).toHaveText(String(firstScore + 1));
  await page.goBack();
  await expect(page.locator(`.thing.link[data-id="${firstId}"] .midcol .score`)).toHaveText(String(firstScore + 1));
  expect(errors).toEqual([]);
});

test('the demo: try it, browse, vote, reply, and become a moderator', async ({ page, errors }) => {
  await page.goto('/#/instance');
  await page.getByRole('button', { name: 'try the demo' }).click();
  const rows = page.locator('.thing.link');
  await expect(rows.first()).toBeVisible();
  await expect(page.locator('.banner-demo')).toContainText('Nothing you do here leaves your browser');
  await expect(page.locator('.demo-button')).toBeVisible();
  await expect(page.locator('#header')).toContainText('visitor');
  await expect(page.locator('.inbox-link .badge')).toHaveText('6');
  await expect(rows.first()).toContainText('Welcome to the Olemmy demo');

  // A vote sticks across a reload, and moves the score by one.
  const row = rows.nth(1);
  const id = await row.getAttribute('data-id');
  const score = Number(await row.locator('.midcol .score').innerText());
  await row.locator('.arrow.up').click();
  await expect(row.locator('.midcol')).toHaveClass(/likes/);
  await expect(row.locator('.midcol .score')).toHaveText(String(score + 1));
  // The screen changes at once; wait for the demo to have it before reloading.
  await expect.poll(() => storedVote(page, id)).toBe(1);
  await page.reload();
  await expect(page.locator(`.thing.link[data-id="${id}"] .midcol`)).toHaveClass(/likes/);

  // A reply on a post appears, and is still there after a reload.
  await page.locator(`.thing.link[data-id="${id}"] a.comments`).click();
  await page.locator('.commentarea > .reply-form textarea').fill('Hello from the **demo**');
  await page.locator('.commentarea > .reply-form button[type=submit]').click();
  await expect(page.locator('.comment .md strong', { hasText: 'demo' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.comment .md strong', { hasText: 'demo' })).toBeVisible();

  // Sharing explains why it can't; "original" links to the demo's addresses aren't offered.
  await page.locator('.thing.link .share-button').first().click();
  await expect(page.locator('.toast')).toContainText('only work in your own browser');
  await expect(page.locator('.thing.link a', { hasText: /^original$/ })).toHaveCount(0);

  // No moderation as a user; the panel makes you a moderator.
  await expect(page.locator('.mod-link')).toHaveCount(0);
  await page.locator('.demo-button').click();
  await page.locator('#demo-role').selectOption('mod');
  await page.getByRole('button', { name: 'apply' }).click();
  await expect(page.locator('.mod-link .badge')).toBeVisible();
  await page.locator('.mod-link').click();
  await expect(page.locator('#main')).toContainText(/Off topic|Rude|Spam|Harassment|Not their own photo|Misinformation/);

  // Reset puts it all back.
  await page.locator('.demo-button').click();
  await page.locator('.demo-panel').getByRole('button', { name: 'reset' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('.banner-demo')).toBeVisible();
  await expect(page.locator('.mod-link')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('leaving keeps your changes; continue takes you back, start over resets', async ({ page }) => {
  await page.goto('/#/instance');
  await page.getByRole('button', { name: 'try the demo' }).click();
  // Nothing to reset yet.
  await expect(page.locator('.banner-demo')).toBeVisible();
  await expect(page.locator('.banner-demo .demo-reset')).toHaveCount(0);
  const row = page.locator('.thing.link').nth(1);
  const id = await row.getAttribute('data-id');
  await row.locator('.arrow.up').click();
  await expect.poll(() => storedVote(page, id)).toBe(1);
  await expect(page.locator('.banner-demo .demo-reset')).toBeVisible();

  // Leaving logs out, but keeps the demo.
  await page.locator('.banner-demo').getByRole('button', { name: 'Leave the demo' }).click();
  await expect(page).toHaveURL(/#\/instance/);
  await expect(page.locator('.banner-demo')).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Your changes in the demo are kept');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('olemmy:accounts')).data.list)).toEqual([]);
  await expect(page.locator('.demo-offer h2')).toHaveText('Continue the demo');

  // Continue: the vote is still there.
  await page.getByRole('button', { name: 'continue the demo' }).click();
  await expect(page.locator(`.thing.link[data-id="${id}"] .midcol`)).toHaveClass(/likes/);

  // Start over, from the instance picker: as new.
  await page.goto('/#/instance');
  await page.getByRole('button', { name: 'start over' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Start over', exact: true }).click();
  await expect(page.locator(`.thing.link[data-id="${id}"] .midcol`)).not.toHaveClass(/likes/);
  await expect(page.locator('.banner-demo .demo-reset')).toHaveCount(0);
});

test('reset from the demo bar', async ({ page }) => {
  await page.goto('/#/instance');
  await page.getByRole('button', { name: 'try the demo' }).click();
  const row = page.locator('.thing.link').nth(1);
  await row.locator('.arrow.up').click();
  await page.locator('.banner-demo').getByRole('button', { name: 'Reset the demo' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('.thing.link').nth(1).locator('.midcol')).not.toHaveClass(/likes/);
  await expect(page.locator('.banner-demo .demo-reset')).toHaveCount(0);
});

test('reset clears demo vote weight, and a new comment counts its own upvote', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded:demo-tags')) return;
    localStorage.setItem('olemmy:tags', JSON.stringify({ v: 1, data: {
      'visitor@demo.olemmy.invalid': { tag: 'mine', color: '#3498db', votes: -1 },
      'remote@lemmy.world': { votes: 5 },
      'iris@beta.olemmy.invalid': { votes: 2 },
    } }));
    sessionStorage.setItem('seeded:demo-tags', '1');
  });
  await page.goto('/#/instance');
  await page.getByRole('button', { name: 'try the demo' }).click();
  await expect(page.locator('#header')).toContainText('visitor');
  await page.locator('.thing.link').nth(1).locator('.arrow.up').click();
  await expect(page.locator('.banner-demo .demo-reset')).toBeVisible();
  await page.locator('.banner-demo .demo-reset').click();
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('dialog').getByRole('button', { name: 'Reset', exact: true }).click(),
  ]);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('olemmy:tags')).data);
  expect(stored['visitor@demo.olemmy.invalid']).toMatchObject({ tag: 'mine', votes: 0 });
  expect(stored['iris@beta.olemmy.invalid']).toBeUndefined();
  expect(stored['remote@lemmy.world'].votes).toBe(5);

  await page.locator('.thing.link').first().locator('a.comments').click();
  await page.locator('.commentarea > .reply-form textarea').fill('Fresh vote weight check');
  await page.locator('.commentarea > .reply-form button[type=submit]').click();
  await expect(page.locator('.comment.thing', { hasText: 'Fresh vote weight check' }).locator('.vote-weight')).toHaveText('[+1]');
});

test('the demo can be browsed logged out', async ({ page }) => {
  await page.goto('/#/instance');
  await expect(page.locator('.demo-offer')).toBeVisible();
  await page.getByRole('button', { name: 'browse it logged out' }).click();
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await expect(page.locator('#header')).toContainText(/log in/);
  await expect(page.locator('.welcome-note')).toHaveCount(0);
});

test('the account menu stays open while the account finishes loading after login', async ({ page }) => {
  await page.goto('/#/login');
  await page.locator('#login-instance').fill('demo.olemmy.invalid');
  await page.locator('#login-user').fill('bob');
  await page.locator('#login-pass').fill('whatever');
  await page.getByRole('button', { name: 'log in' }).click();
  await expect(page.locator('#header .username')).toHaveText('bob');
  // Opened at once: unread counts and the account's details arrive after.
  const menu = page.locator('#header details.account-menu');
  await menu.locator('> summary').click();
  await page.waitForTimeout(1000);
  await expect(menu).toHaveAttribute('open', '');
  await expect(menu.locator('.account-list a', { hasText: '(profile)' })).toBeVisible();
});

test('the login page takes any name and password for the demo', async ({ page }) => {
  await page.goto('/#/login');
  await page.locator('#login-instance').fill('demo.olemmy.invalid');
  await expect(page.locator('.demo-login-note')).toBeVisible();
  await page.locator('#login-user').fill('bob');
  await page.locator('#login-pass').fill('whatever');
  await page.getByRole('button', { name: 'log in' }).click();
  await expect(page.locator('.banner-demo')).toBeVisible();
  await expect(page.locator('#header .username')).toHaveText('bob');
  await page.locator('#header .account-menu > summary').click();
  await page.locator('#header .account-list a', { hasText: '(profile)' }).click();
  await expect(page.locator('.user-header-full')).toHaveText('@bob@demo.olemmy.invalid');

  // The account menu leads to other instances too; you browse them logged out, the account kept.
  await page.locator('#header .account-menu > summary').click();
  await page.locator('#header .account-list').getByRole('link', { name: 'browse another instance…' }).click();
  await expect(page).toHaveURL(/#\/instance/);
  await expect(page.locator('.instance-logged-in-note')).toBeVisible();
});

test('an account from the old test server comes back logged in to the demo', async ({ page, errors }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('olemmy:accounts', JSON.stringify({ v: 1, data: { active: 0, list: [{ instance: 'test.olemmy.invalid', username: 'tester', jwt: 'olemmy-test-server-token', remember: true }] } }));
    localStorage.setItem('olemmy:settings', JSON.stringify({ v: 1, data: { instance: 'test.olemmy.invalid' } }));
  });
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await expect(page.locator('.banner-demo')).toBeVisible();
  await expect(page.locator('#header .username')).toHaveText('tester');
  await expect(page.locator('#banners')).not.toContainText('Your login has expired');
  expect(errors).toEqual([]);
});
