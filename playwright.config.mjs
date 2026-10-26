// End-to-end tests (docs/OLEMMY.md §12). They run against a fake instance
// made of fictional API responses (tests/fixtures), so they need no network.
//
//   npx playwright test                     the unbuilt site in web/
//   npm run test:e2e:dist                   the built site in dist/web
//   npx playwright test --update-snapshots  after an intended visual change

import { defineConfig, devices } from '@playwright/test';

const PORT = 8740;
const root = process.env.OLEMMY_E2E_ROOT || 'web';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.mjs',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  snapshotPathTemplate: '{testDir}/screenshots/{arg}-{projectName}{ext}',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    // The offline worker would answer requests the tests fake with page.route.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: `node scripts/serve.mjs ${root} ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
