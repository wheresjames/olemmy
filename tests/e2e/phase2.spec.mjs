// Phase 2: user tags, hover cards and other helpers, accounts, mod tools, offline and more, and API v4,
// against the fake instance.

import { test, expect } from './fake-instance.mjs';

const login = (page, list = [{ instance: 'fixture.test', username: 'tester', jwt: 'test-jwt', remember: true }], active = 0) =>
  page.addInitScript(([l, a]) => {
    localStorage.setItem('olemmy:accounts', JSON.stringify({ v: 1, data: { active: a, list: l } }));
  }, [list, active]);

/** Seed [key] once per page session (reloads keep what the app changed). */
const setLocal = (page, key, data) => page.addInitScript(([k, d]) => {
  if (sessionStorage.getItem(`seeded:${k}`)) return;
  localStorage.setItem(k, JSON.stringify({ v: 1, data: d }));
  sessionStorage.setItem(`seeded:${k}`, '1');
}, [key, data]);

test('user tagger: a tag shows on every post by that user', async ({ page }) => {
  await page.goto('/#/');
  const row = page.locator('.thing.link').first();
  const author = (await row.locator('.author').first().getAttribute('title')).replace(/^.*\((.*)\)$/, '$1');
  await row.locator('.tagline').hover();
  await row.locator('.tag-button').click();
  await page.getByLabel('tag', { exact: true }).fill('helpful');
  await page.getByRole('dialog').getByRole('button', { name: 'save' }).click();
  await expect(row.locator('.user-tag')).toHaveText('helpful');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('olemmy:tags')).data);
  expect(Object.values(stored)[0].tag).toBe('helpful');
  expect(Object.keys(stored)[0]).toContain('@');
  expect(author).toBeTruthy();
});

test('hover card shows account facts after a pause', async ({ page }) => {
  await page.goto('/#/');
  await page.locator('.thing.link .author').first().hover();
  const card = page.locator('.hover-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('posts');
  await expect(card).toContainText('comments');
  await expect(card).toContainText('cake day');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
});

test('editor helpers: toolbar bolds the selection; big editor shows the preview', async ({ page }) => {
  await login(page);
  await page.goto('/#/post/100040');
  const ta = page.locator('.commentarea > .reply-form textarea');
  await ta.fill('hello world');
  await ta.evaluate((el) => el.setSelectionRange(6, 11));
  await page.locator('.commentarea > .reply-form .tool-bold').click();
  await expect(ta).toHaveValue('hello **world**');
  await page.locator('.commentarea > .reply-form .editor-big-toggle').click();
  await expect(page.locator('.editor-big .editor-preview strong')).toHaveText('world');
  await ta.press('Escape');
  await expect(page.locator('.editor-big')).toHaveCount(0);
});

test('comment navigator jumps between the poster\'s comments', async ({ page }) => {
  await page.goto('/#/post/100040');
  await expect(page.locator('.comment-navigator')).toBeVisible();
  await page.locator('.comment-navigator select').selectOption('staff');
  await page.locator('.comment-navigator select').selectOption('op');
  await page.keyboard.press('n');
  const count = await page.locator('.comment.by-op').count();
  if (count) await expect(page.locator('.comment.by-op.kb-selected')).toHaveCount(1);
  else await expect(page.locator('.cn-count')).toHaveText('');
  await page.goto('/#/');
  await expect(page.locator('.comment-navigator')).toHaveCount(0);
});

test('display modes: text only drops thumbnails and images', async ({ page }) => {
  await setLocal(page, 'olemmy:settings', { instance: 'fixture.test', displayMode: 'text' });
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await expect(page.locator('.thing.link .thumbnail')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-display', 'text');
});

test('accounts: switch between two', async ({ page, calls }) => {
  await login(page, [
    { instance: 'fixture.test', username: 'tester', jwt: 'test-jwt', remember: true },
    { instance: 'fixture.test', username: 'other', jwt: 'other-jwt', remember: true },
  ]);
  await page.goto('/#/');
  await page.locator('.account-menu > summary').click();
  await page.getByRole('button', { name: 'other@fixture.test' }).click();
  await expect(page.locator('.account-menu summary .username')).toHaveText('other');
  await expect.poll(() => calls.some((c) => c.auth === 'Bearer other-jwt')).toBe(true);
});

test('gallery mode shows image posts as a grid', async ({ page }) => {
  await page.goto('/#/');
  await page.locator('.gallery-button').click();
  await expect(page.locator('.gallery-grid')).toBeVisible();
  await expect(page.locator('#siteTable')).toBeHidden();
  await page.locator('.gallery-button').click();
  await expect(page.locator('.gallery-grid')).toHaveCount(0);
});

test('listing toggles survive going into a post and back', async ({ page }) => {
  await page.goto('/#/');
  await page.locator('.show-images').click();
  await page.locator('.videos-button').click();
  await page.locator('.gallery-button').click();
  await expect(page.locator('.gallery-grid')).toBeVisible();
  await page.locator('.gallery-tile').first().click();
  await expect(page).toHaveURL(/\/post\//);
  await page.goBack();
  await expect(page.locator('.show-images')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.videos-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.gallery-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.gallery-grid')).toBeVisible();
  await expect(page.locator('#siteTable.videos-only')).toHaveCount(1);
  // And a reload keeps them too.
  await page.reload();
  await expect(page.locator('.videos-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.gallery-grid')).toBeVisible();
  // A fresh visit starts with them off.
  await page.goto('/#/all');
  await expect(page.locator('.show-images')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.gallery-button')).toHaveAttribute('aria-pressed', 'false');
});

test('avatars beside names are off until turned on; broken ones leave no gap', async ({ page }) => {
  // Remote images are a pixel (fake-instance.mjs); this user's avatar is gone.
  await page.route('https://assets.example/avatars/300079.png', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await expect(page.locator('.tagline-avatar')).toHaveCount(0);
  await setLocal(page, 'olemmy:settings', { instance: 'fixture.test', features: { avatars: { enabled: true } } });
  await page.reload();
  await expect(page.locator('.thing.link .tagline-avatar').first()).toBeVisible();
  await expect(page.locator('.tagline-avatar[src$="300079.png"]')).toHaveCount(0);
});

test('language labels: codes by default, on posts, comments and user pages; optionally not for your own languages', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.thing.link .lang-label').first()).toHaveText('EN');
  await page.goto('/#/u/harbor_reader@fixture.test');
  await expect(page.locator('.user-listing .thing.link .lang-label').first()).toHaveText('EN');
  await expect(page.locator('.user-listing .comment .lang-label').first()).toHaveText('EN');
  await setLocal(page, 'olemmy:settings', { instance: 'fixture.test', features: { languageLabels: { hideMine: true } } });
  await page.goto('/#/');
  await page.reload();   // the hash change alone doesn't reload, and the seed needs one
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await expect(page.locator('.lang-label')).toHaveCount(0);
});

test('language labels as a name or a flag', async ({ page }) => {
  await setLocal(page, 'olemmy:settings', { instance: 'fixture.test', features: { languageLabels: { style: 'name' } } });
  await page.goto('/#/');
  await expect(page.locator('.thing.link .lang-label').first()).toHaveText('English');
  await expect(page.locator('.thing.link .lang-code')).toHaveCount(0);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('olemmy:settings'));
    s.data.features.languageLabels.style = 'flag';
    localStorage.setItem('olemmy:settings', JSON.stringify(s));
  });
  await page.reload();
  const flag = page.locator('.thing.link img.lang-flag').first();
  await expect(flag).toHaveAttribute('src', /flags\/4x3\/gb\.svg$/);
  await expect(flag).toHaveAttribute('title', 'Written in English');
  await expect.poll(() => flag.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
});

test.describe('language labels in another locale', () => {
  test.use({ locale: 'de-DE' });
  test('an English post says so', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('.thing.link .lang-label').first()).toHaveText('EN');
  });
});

test('a user page opens with their profile: avatar, bio, counts and cake day', async ({ page }) => {
  await page.goto('/#/u/harbor_reader@fixture.test');
  const header = page.locator('.user-header');
  await expect(header.locator('.user-header-name')).toHaveText('Harbor Reader');
  await expect(header.locator('.user-header-full')).toHaveText('@harbor_reader@fixture.test');
  await expect(header.locator('.user-header-avatar')).toBeVisible();
  await expect(header).toContainText('Enjoys quiet projects');
  await expect(header.locator('.user-header-chips')).toContainText('posts');
  await expect(header).toContainText('Cake day: April 12');
  // Languages come from the posts and comments on the page (the fixture's are English or untagged).
  await expect(header.locator('.user-header-langs')).toContainText('Writes in');
  await expect(header.locator('.user-header-langs .lang-with-flag')).toHaveText(['English']);
  await expect(header.locator('.user-header-langs img.lang-flag')).toHaveAttribute('src', /gb\.svg$/);
  // The bio moved up; the sidebar keeps the facts and actions.
  await expect(page.locator('.user-box .side-md')).toHaveCount(0);
});

test('saved searches', async ({ page }) => {
  await page.goto('/#/search?q=linux');
  await page.locator('.save-search').click();
  await expect(page.locator('.saved-searches')).toContainText('linux');
});

test('custom CSS applies under the strict CSP', async ({ page, errors }) => {
  await setLocal(page, 'olemmy:settings', { instance: 'fixture.test', features: { customCss: { css: 'body { background: rgb(1, 2, 3) !important; }' } } });
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(1, 2, 3)');
  expect(errors).toEqual([]);
});

test('videos: only posts with a video until pressed again', async ({ page }) => {
  await page.goto('/#/');
  const rows = page.locator('.thing.link:visible');
  await expect(rows.first()).toBeVisible();
  expect(await page.locator('.thing.link.has-video').count()).toBeGreaterThan(0);
  const button = page.locator('.videos-button');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  // Never-ending scroll may load more pages to fill the screen; whatever is
  // loaded, only the video posts show.
  await expect(page.locator('.thing.link:visible:not(.has-video)')).toHaveCount(0);
  expect(await rows.count()).toBeGreaterThan(0);
  // Keyboard navigation skips the hidden rows.
  await page.keyboard.press('j');
  await expect(page.locator('.thing.kb-selected')).toHaveClass(/has-video/);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await rows.count()).toBe(await page.locator('.thing.link').count());
});

test('never-ending scroll stops paging after a few pages that show nothing', async ({ page }) => {
  await setLocal(page, 'olemmy:filters', { keywords: ['/./'], domains: [], communities: [], users: [], instances: [] });
  await page.goto('/#/');
  await expect(page.locator('.filtered-note')).toBeVisible();
  await expect(page.locator('.ner-more button')).toBeVisible();
  await page.waitForTimeout(1500);
  // Each page after the first adds a "page N" separator.
  const separators = page.locator('.ner-separator');
  const loaded = await separators.count() + 1;
  expect(loaded).toBeGreaterThanOrEqual(5);
  expect(loaded).toBeLessThanOrEqual(6);
  // "load more" still works by hand.
  await page.locator('.ner-more button').click();
  await expect(separators).toHaveCount(loaded);
});

test('YouTube posts without a thumbnail get YouTube\'s still, unless turned off; otherwise the video icon', async ({ page }) => {
  await page.goto('/#/');
  const thumb = page.locator('.thing.link.has-video .thumbnail').first();
  await expect(thumb).toHaveClass(/thumb-video/);
  await expect(thumb.locator('img')).toHaveAttribute('src', /^https:\/\/i\.ytimg\.com\/vi\/[\w-]+\/mqdefault\.jpg$/);
  await page.evaluate(async () => (await import('./js/features/registry.js')).setOption('expandos', 'youtubeThumbnails', false));
  await page.reload();
  await expect(page.locator('.thing.link.has-video .thumbnail').first().locator('img')).toHaveCount(0);
  await expect(page.locator('.thing.link.has-video .thumbnail').first().locator('use')).toHaveAttribute('href', /thumb-video/);
});

test('user tagger: settings list every tagged user, to filter, edit and remove', async ({ page }) => {
  await setLocal(page, 'olemmy:tags', {
    'harbor_reader@fixture.test': { tag: 'dev', color: '#2ecc71', votes: 3 },
    'quiet@x.org': { votes: -2 },
    'liked@y.org': { votes: 5 },
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#/settings?feature=userTagger');
  const rows = page.locator('#feature-userTagger .tag-row');
  await expect(rows).toHaveCount(3);
  // Tagged first, then by vote weight.
  expect(await rows.evaluateAll((els) => els.map((el) => el.dataset.user))).toEqual(['harbor_reader@fixture.test', 'liked@y.org', 'quiet@x.org']);
  await expect(page.locator('#feature-userTagger .tag-count')).toHaveText('1 tagged, 2 with only a vote weight');
  await expect(rows.first().locator('.user-tag')).toHaveText('dev');
  await expect(rows.first().locator('.vote-weight')).toHaveText('[+3]');
  await expect(rows.first().locator('a.tag-user')).toHaveAttribute('href', '#/u/harbor_reader@fixture.test');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  // Filter by tag or name.
  await page.locator('.tag-filter').fill('dev');
  await expect(rows).toHaveCount(1);
  await page.locator('.tag-filter').fill('');

  // Edit: the same dialog as beside names.
  await rows.first().getByRole('button', { name: 'Edit the tag for harbor_reader@fixture.test' }).click();
  await page.locator('#tag-text').fill('core dev');
  await page.getByRole('button', { name: 'save' }).click();
  await expect(rows.first().locator('.user-tag')).toHaveText('core dev');

  // ×: the tag goes, the vote weight stays; on a vote-only row, the weight goes, and so does the row.
  await page.getByRole('button', { name: 'Remove the tag for harbor_reader@fixture.test' }).click();
  await expect(page.locator('.tag-row[data-user="harbor_reader@fixture.test"] .tag-none')).toBeVisible();
  await page.getByRole('button', { name: 'Reset the vote weight for quiet@x.org' }).click();
  await expect(rows).toHaveCount(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('olemmy:tags')).data)).toEqual({
    'harbor_reader@fixture.test': { tag: '', color: '', votes: 3 },
    'liked@y.org': { votes: 5 },
  });
});

test('black (OLED) palette', async ({ page }) => {
  await setLocal(page, 'olemmy:settings', { instance: 'fixture.test', theme: 'oled' });
  await page.goto('/#/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oled');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(0, 0, 0)');
});

for (const scheme of ['light', 'dark']) {
  test(`every theme has readable text with the system in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/#/');
    await expect(page.locator('.thing.link').first()).toBeVisible();
    for (const theme of ['auto', 'light', 'dark', 'oled', 'contrast']) {
      const ratio = await page.evaluate(async (t) => {
        (await import('./js/features/themes.js')).setTheme(t);
        const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
        const lum = (c) => {
          const [r, g, b] = rgb(c).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const pairs = [
          [getComputedStyle(document.body).color, getComputedStyle(document.body).backgroundColor],
          [getComputedStyle(document.querySelector('.thing.link .tagline')).color, getComputedStyle(document.body).backgroundColor],
        ];
        return Math.min(...pairs.map(([fg, bg]) => { const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); }));
      }, theme);
      expect(ratio, `${theme} on a ${scheme} system`).toBeGreaterThanOrEqual(theme === 'contrast' ? 7 : 4.5);
    }
  });
}

test.describe('moderator', () => {
  test.use({ instanceOptions: { loggedIn: true, moderator: true } });
  test('remove a post from the mod menu; reports queue; mod log', async ({ page, calls }) => {
    await login(page);
    await page.goto('/#/post/100040');
    // Counted as soon as /site says you moderate (session.js), not a poll later.
    await expect(page.locator('.mod-link .badge')).toHaveText('1');
    await page.locator('.post-header .mod-menu > summary').click();
    await page.getByRole('button', { name: 'remove post' }).click();
    await page.locator('#dialog-field').fill('off topic');
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(page.locator('.post-header .thing.link')).toHaveClass(/removed/);
    const call = calls.find((c) => c.path === 'post/remove');
    expect(call.body).toMatchObject({ removed: true, reason: 'off topic' });

    await page.goto('/#/reports');
    await expect(page.locator('.report-item')).toContainText('spam?');
    await page.locator('.report-item').getByRole('button', { name: 'resolve' }).click();
    await expect(page.locator('.report-item')).toHaveClass(/resolved/);

    await page.goto('/#/modlog');
    await expect(page.locator('.modlog-table tbody tr').first()).toBeVisible();
  });
});

test.describe('API v4', () => {
  test.use({ instanceOptions: { loggedIn: true, api4: true } });
  test('with "v4 on Lemmy 1.x", a v4 instance is read and voted on through /api/v4', async ({ page, calls }) => {
    await setLocal(page, 'olemmy:settings', { instance: 'fixture.test', apiVersion: 'auto' });
    await login(page);
    await page.goto('/#/');
    await expect(page.locator('.thing.link')).toHaveCount(25);
    await expect.poll(() => calls.some((c) => c.version === 4 && c.path === 'post/list')).toBe(true);
    await expect(page.locator('.username')).toHaveText('tester');
    await page.locator('.thing.link').first().locator('.arrow.up').click();
    await expect.poll(() => calls.find((c) => c.version === 4 && c.path === 'post/like')?.body).toMatchObject({ is_upvote: true });
    await expect(page.locator('.thing.link').first().locator('.midcol')).toHaveClass(/likes/);
    await page.goto('/#/post/100040');
    await expect(page.locator('.comment-tree > .comment').first()).toBeVisible();
  });
});

test('single-click opener: off by default; when on, only beside links that don\'t show inline', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.thing.link')).toHaveCount(25);
  await expect(page.locator('.single-click')).toHaveCount(0);
  await page.evaluate(async () => (await import('./js/features/registry.js')).setEnabled('singleClick', true));
  await page.reload();
  await expect(page.locator('.thing.link')).toHaveCount(25);
  await expect(page.locator('.thing.link[data-domain="articles.example"] .single-click').first()).toBeVisible();
  await expect(page.locator('.thing.link[data-domain="assets.example"] .single-click')).toHaveCount(0);
  await expect(page.locator('.thing.link.has-video .single-click')).toHaveCount(0);
});
