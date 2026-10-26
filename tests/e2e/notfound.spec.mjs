// The not-found page (404.html, sent by the server for unknown addresses)
// and the favicon.

import { test, expect } from './fake-instance.mjs';

test('an unknown address: status 404 and the themed page', async ({ page }) => {
  const response = await page.goto('/no/such/thing');
  expect(response.status()).toBe(404);
  await expect(page).toHaveTitle('Page not found · Olemmy');
  await expect(page.locator('#nf-path')).toHaveText('/no/such/thing');
  await expect(page.locator('.nf-box-title')).toHaveText('page not found');
  await expect(page.locator('.nf-links a', { hasText: 'front page' })).toHaveAttribute('href', '/#/');
  // Its files load from the root, however deep the address.
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.nf-header')).borderBottomStyle)).toBe('solid');
  await expect(page.locator('.nf-home img')).toHaveJSProperty('complete', true);
  expect(await page.locator('.nf-home img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  // The search box guesses from the address, and searches in Olemmy.
  await expect(page.locator('#nf-q')).toHaveValue('thing');
  await page.locator('#nf-q').fill('linux');
  await page.locator('#nf-search button').click();
  await expect(page).toHaveURL(/\/#\/search\?q=linux$/);
});

test('it follows the saved theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/missing');
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/missing');
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(dark).not.toBe(light);
});

for (const [typed, route] of [
  ['/c/linux@lemmy.ml', '#/c/linux@lemmy.ml'],
  ['/u/harbor_reader@fixture.test', '#/u/harbor_reader@fixture.test'],
  ['/post/100040', '#/post/100040'],
  ['/lemmy.world/post/123', '#/lemmy.world/post/123'],
]) {
  test(`an Olemmy address without its #: ${typed} opens ${route}`, async ({ page }) => {
    await page.goto(typed);
    await expect(page).toHaveURL(new RegExp(`/${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    await expect(page.locator('#main')).not.toBeEmpty();
  });
}

test('the favicon is there, in the usual place', async ({ request }) => {
  const r = await request.get('/favicon.ico');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toBe('image/x-icon');
  expect((await r.body()).length).toBeGreaterThan(1000);
});
