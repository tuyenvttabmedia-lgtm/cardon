import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const localChromium = join(
  process.env.LOCALAPPDATA ?? '',
  'ms-playwright',
  'chromium-1234',
  'chrome-win64',
  'chrome.exe',
);

/**
 * Isolated mock-only eSIM UI tests. Do not point this at localhost:3003
 * or the existing agent e2e config — those can reach the runtime API.
 */
export default defineConfig({
  testDir: './e2e-esim-mock',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  outputDir: './test-results/esim-mock',
  use: {
    baseURL: 'http://127.0.0.1:4310',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: undefined,
        launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : undefined,
      },
    },
  ],
});
