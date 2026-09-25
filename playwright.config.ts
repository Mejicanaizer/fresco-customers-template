import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', workers: 1, fullyParallel: false, retries: 0,
  reporter: 'list', use: {
    baseURL: 'http://127.0.0.1:5375', browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    // Tokens stay out of recorded traces/screenshots. Tests take only explicit nonpersonal screenshots.
    trace: 'off', screenshot: 'off', video: 'off',
  },
  webServer: [
    { command: 'node --experimental-strip-types tests/fixture-server.ts', env: { STOREFRONT_TEST_FIXTURES: '1' }, url: 'http://127.0.0.1:5491/health', reuseExistingServer: false },
    ...(['salon', 'grooming'] as const).map((siteId, index) => ({
      command: 'node --experimental-strip-types server/start.ts', url: `http://127.0.0.1:${5375 + index}`,
      env: { NODE_ENV: 'test', STOREFRONT_SITE_ID: siteId, STOREFRONT_PUBLIC_ORIGIN: `http://127.0.0.1:${5375 + index}`, STOREFRONT_OWNER_API_ORIGIN: `http://127.0.0.1:${5491 + index}`, PORT: String(5375 + index), HOST: '127.0.0.1' }, reuseExistingServer: false,
    })),
  ],
});
