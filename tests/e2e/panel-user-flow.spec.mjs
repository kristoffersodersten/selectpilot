import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('sidepanel harness can run extract action and render result', async ({ page }) => {
  const harnessPath = resolve(process.cwd(), 'tests/e2e/panel-harness.html');
  await page.goto(pathToFileURL(harnessPath).toString());

  await expect(page.locator('#truth-privacy')).toHaveText(/Verified local-only|Boundary degraded|Unavailable/);
  await expect(page.locator('#memory-status')).toContainText('Memory OFF');
  await page.click('#btn-memory-toggle');
  await expect(page.locator('#memory-status')).toContainText('Memory ON');
  await page.click('#btn-extract');
  await expect(page.locator('#result-title')).toHaveText('Action Brief');
  await expect(page.locator('#workflow')).toContainText('Ship update');
  await expect(page.locator('#memory-status')).toContainText('1 retained event');
  await page.click('#btn-memory-inspect');
  await expect(page.locator('#result-title')).toHaveText('Memory ledger');
  await page.click('#tab-structured');
  await expect(page.locator('#workflow')).toContainText('"action": "extract"');
  await page.click('#btn-memory-delete');
  await expect(page.locator('#memory-status')).toContainText('0 retained events');

  await page.fill('#order-id', 'SP-PENDING');
  await page.click('#btn-sync-order');
  await expect(page.locator('#status')).toContainText('No payment detected yet');

  await page.fill('#order-id', 'SP-PAID');
  await page.click('#btn-sync-order');
  await expect(page.locator('#entitlement-status')).toContainText('Token attached · tier pro');

  await page.click('#btn-sync-order');
  await expect(page.locator('#status')).toContainText('Order already synced; entitlement refreshed');
});