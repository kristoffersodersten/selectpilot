import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

test('panel harness keeps fetch traffic local and shows privacy proof timestamp', async ({ page }) => {
  const harnessPath = resolve(process.cwd(), 'tests/e2e/panel-harness.html');
  await page.goto(pathToFileURL(harnessPath).toString());

  await expect(page.locator('#memory-status')).toContainText('Memory OFF');
  await page.click('#btn-refresh');
  await expect(page.locator('#truth-privacy')).toHaveText('Verified local-only');
  await expect(page.locator('#truth-privacy-meta')).toContainText('Verified');
  await expect(page.locator('#leakage-status')).toHaveText('No leakage detected');
  await expect(page.locator('#leakage-details')).toContainText('verified local through Ollama on-device');

  const fetchLog = await page.evaluate(() => globalThis.__fetchLog || []);
  expect(fetchLog.length).toBeGreaterThan(0);

  for (const entry of fetchLog) {
    const parsed = new URL(entry.href, 'http://127.0.0.1:8083');
    expect(LOCAL_HOSTS.has(parsed.hostname)).toBeTruthy();
  }
});
