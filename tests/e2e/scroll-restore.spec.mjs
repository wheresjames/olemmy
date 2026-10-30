// Going back to a listing returns to where you were, even when the browser
// scrolls on its own afterwards (Firefox for Android).

import { test, expect } from './fake-instance.mjs';
test.use({ viewport: { width: 360, height: 640 } });
test('scroll back holds against a late browser scroll', async ({ page }) => {
  await page.goto('/#/all');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.locator('.thing.link a.comments').nth(5).click();
  await expect(page).toHaveURL(/\/p\//);
  await page.waitForTimeout(500);
  // Mimic Firefox Android adding its own offset after the app restores.
  await page.evaluate(() => addEventListener('popstate', () => setTimeout(() => scrollBy(0, 600), 150), { once: true }));
  await page.goBack();
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => scrollY)).toBe(600);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(600);
});

test('scroll back keeps the post at the top in place when rows above come back a different height', async ({ page }) => {
  await page.goto('/#/all');
  await expect(page.locator('.thing.link').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 600));
  const top = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('.thing.link')].find((r) => r.getBoundingClientRect().bottom > 0);
    return { id: el.dataset.id, top: Math.round(el.getBoundingClientRect().top) };
  });
  const before = await top();
  await page.locator('.thing.link a.comments').nth(5).click();
  await expect(page).toHaveURL(/\/p\//);
  await page.waitForTimeout(500);
  // Rows above come back taller than they were, as when an expando was open
  // or their pictures hadn't loaded yet.
  await page.evaluate(() => document.styleSheets[0].insertRule('.thing.link:nth-child(-n+2) { padding-top: 150px; }', 0));
  await page.goBack();
  await page.waitForTimeout(800);
  expect(await top()).toEqual(before);
});
