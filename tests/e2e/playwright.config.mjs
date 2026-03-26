import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',
  testMatch: ['*.spec.mjs'],
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8083',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--allow-file-access-from-files', '--disable-web-security'],
    },
  },
});