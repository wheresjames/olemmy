// The §6 layout fixes at 360, 768 and 1280px, light and dark: no
// sideways page scroll, the sidebar's place, big enough touch targets,
// and screenshots to catch visual regressions.

import { test, expect } from './fake-instance.mjs';

const WIDTHS = [360, 768, 1280];
const SCHEMES = ['light', 'dark'];

for (const width of WIDTHS) {
  for (const scheme of SCHEMES) {
    test(`listing and comments at ${width}px, ${scheme}`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'screenshots from one browser');
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      for (const [name, hash, ready] of [['listing', '#/', '.thing.link'], ['comments', '#/post/100040', '.comment-tree > .comment']]) {
        await page.goto(`/${hash}`);
        await expect(page.locator(ready).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, 'no sideways page scroll').toBeLessThanOrEqual(0);
        // The baselines are rendered with this machine's fonts: in CI, where the
        // fonts differ, only the layout checks run (OLEMMY_SCREENSHOTS=1 for both).
        if (!process.env.CI || process.env.OLEMMY_SCREENSHOTS) {
          await expect(page).toHaveScreenshot(`${name}-${width}-${scheme}.png`, { animations: 'disabled' });
        }
      }
    });
  }
}

test('the sidebar is a column on wide screens and a drawer on narrow ones', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/');
  await expect(page.locator('#sidebar .site-box')).toBeVisible();
  await expect(page.locator('.sidebar-toggle')).toBeHidden();

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.locator('#sidebar')).toBeHidden();
  await page.locator('.sidebar-toggle').click();
  await expect(page.locator('#sidebar .site-box')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sidebar')).toBeHidden();
});

test('the settings gear is on screen at every width, with or without shortcuts', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('olemmy:shortcuts', JSON.stringify({ v: 1, data: { 'lemmy.ml': Array.from({ length: 12 }, (_, i) => `community${i}@lemmy.ml`) } }));
    }
  });
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/#/');
    const gear = page.locator('#sr-header-area .sr-settings');
    await expect(gear).toBeInViewport({ ratio: 1 });
  }
  await page.locator('#sr-header-area .sr-settings').click();
  await expect(page).toHaveURL(/#\/settings/);
});

test('the text size slider can be dragged; the size changes on release', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#/settings');
  const slider = page.getByLabel('Text size');
  await expect(slider).toBeVisible();
  await slider.evaluate((el) => { el.dataset.mark = '1'; });
  const box = await slider.boundingBox();
  const y = box.y + box.height / 2;
  // 100% sits at 2/7 of the 80-150 range; drag to the far end.
  await page.mouse.move(box.x + box.width * 2 / 7, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (2 / 7 + i * 0.08), y);
  await expect(page.locator('.range output')).toHaveText('150%');
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--font-scale'))).toBe('1');
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--font-scale'))).toBe('1.5');
  // The same slider: changing a setting doesn't rebuild the page.
  expect(await slider.evaluate((el) => el.dataset.mark)).toBe('1');
  await expect(slider).toHaveValue('150');
});

test('settings on a phone: tabs, switches, folded options, search across tabs', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#/settings');
  await expect(page.locator('.settings-group:not([hidden])').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'no sideways scroll').toBeLessThanOrEqual(0);
  await expect(page.locator('.sidebar-toggle')).toBeHidden();

  // A switch: clicking the row's name flips it, and it's saved.
  const scores = page.getByRole('switch', { name: 'Show scores' });
  await expect(scores).toBeChecked();
  await page.locator('label.setting-name', { hasText: 'Show scores' }).click();
  await expect(scores).not.toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('olemmy:settings')).data.showScores)).toBe(false);

  // Features: options are folded, and gone while the feature is off.
  await page.locator('.tabmenu a', { hasText: 'features' }).click();
  await expect(page).toHaveURL(/tab=features/);
  const ner = page.locator('#feature-neverEndingScroll');
  await expect(ner.locator('.feature-options-body')).toBeHidden();
  await ner.locator('.feature-options > summary').click();
  await expect(ner.getByLabel(/Pause after/)).toBeVisible();
  await ner.getByRole('switch').click({ force: true });
  await expect(ner.locator('.feature-options')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('olemmy:settings')).data.features.neverEndingScroll.enabled)).toBe(false);

  // Search reaches other tabs; clearing it goes back to this one.
  const search = page.locator('.settings-search');
  await search.fill('api version');
  await expect(page.locator('.setting:not([hidden])', { hasText: 'Lemmy API version' })).toBeVisible();
  await expect(page.locator('#feature-favorites')).toBeHidden();
  await search.fill('zzzz');
  await expect(page.locator('.settings-empty')).toBeVisible();
  await search.fill('');
  await expect(page.locator('#feature-favorites')).toBeVisible();
});

test('a link to a feature opens its tab and its options', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#/settings?feature=filters');
  await expect(page.locator('.tabmenu li.selected')).toHaveText('filters');
  await expect(page.locator('#feature-filters .filter-list textarea').first()).toBeInViewport();
});

for (const width of [360, 1280]) {
  for (const [where, hash, rows] of [['post', '#/', '.thing.link'], ['comment', '#/post/100040', '.comment-tree > .comment']]) {
    test(`an open "more" menu on a ${where} sits on top of what's below it (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${hash}`);
      const row = page.locator(rows).nth(1);
      await expect(row).toBeVisible();
      const menu = row.locator('.more-menu').first();
      await menu.locator('> summary').click();
      const items = menu.locator(':scope > .menu > li:visible > *');
      expect(await items.count()).toBeGreaterThan(1);
      await items.last().scrollIntoViewIfNeeded();
      // Every item is what's actually on screen at its middle: not clipped, not covered.
      const hidden = await items.evaluateAll((els) => els.filter((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(top === el || el.contains(top));
      }).map((el) => el.textContent));
      expect(hidden).toEqual([]);
    });
  }
}

test('filters are easy to reach: a post\'s "more" menu, and their own settings tab, lists showing', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#/');
  const row = page.locator('.thing.link').first();
  await row.locator('.more-menu > summary').click();
  await row.locator('.more-menu a', { hasText: 'edit filters' }).click();
  await expect(page).toHaveURL(/#\/settings\?tab=filters$/);
  await expect(page.locator('.tabmenu li.selected')).toHaveText('filters');
  // The lists themselves, without unfolding anything.
  await expect(page.locator('#feature-filters .filter-list textarea').first()).toBeVisible();
  await expect(page.locator('#feature-spamFilter')).toBeVisible();
  // ...and other features' editors likewise: custom CSS on the features tab.
  await page.locator('.tabmenu a', { hasText: 'features' }).click();
  await expect(page.locator('#feature-customCss textarea')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('touch targets are at least 44px wide on coarse pointers', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch emulation');
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-25T20:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('olemmy:settings', JSON.stringify({ v: 1, data: { instance: 'fixture.test' } })));
  const { fakeInstance } = await import('./fake-instance.mjs');
  await fakeInstance(page);
  await page.goto('/#/');
  const arrow = await page.locator('.thing.link .arrow.up').first().boundingBox();
  expect(arrow.width).toBeGreaterThanOrEqual(44);
  await context.close();
});

test('long code blocks and tables scroll inside themselves', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#/');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await page.evaluate(async () => {
    const { renderMarkdown } = await import('./js/markdown/render.js');
    const div = document.createElement('div');
    div.className = 'md';
    div.append(renderMarkdown(`\`\`\`\n${'x'.repeat(400)}\n\`\`\`\n\n| ${'a | '.repeat(30)}\n|${'-|'.repeat(30)}\n| ${'1 | '.repeat(30)}\n\n${'https://example.com/'.padEnd(300, 'y')}`));
    document.getElementById('main').prepend(div);
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
