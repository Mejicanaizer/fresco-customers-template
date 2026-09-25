import { defineConfig } from '@playwright/test';

/** Explicit real-owner browser check. No fixture server and no app process restart. */
export default defineConfig({
  testDir: './tests/live-browser', workers: 1, retries: 0, reporter: 'list',
  outputDir: 'test-results/live-owner',
  use: {
    baseURL: 'http://127.0.0.1:5373', browserName: 'chromium', channel: 'chrome',
    trace: 'off', screenshot: 'off', video: 'off',
  },
});
