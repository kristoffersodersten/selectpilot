import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: './',
  testMatch: ['*.spec.mjs'],
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  webServer: {
    command: 'python3 server/nano_server.py --run-dir /tmp/selectpilot-e2e-run --log-dir /tmp/selectpilot-e2e-log',
    cwd: projectRoot,
    env: {
      ...process.env,
      CHROMEAI_AUTO_PULL_MODELS: '0',
    },
    url: 'http://127.0.0.1:8083/health',
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  use: {
    baseURL: 'http://127.0.0.1:8083',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--allow-file-access-from-files', '--disable-web-security'],
      ...(process.env.SELECTPILOT_CHROME_EXECUTABLE
        ? { executablePath: process.env.SELECTPILOT_CHROME_EXECUTABLE }
        : {}),
    },
  },
});
