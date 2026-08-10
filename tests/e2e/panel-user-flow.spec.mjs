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

test('unlocked first-run uses the dedicated example route and resolves once', async ({ page }) => {
  const harnessPath = resolve(process.cwd(), 'tests/e2e/panel-harness.html');
  await page.goto(`${pathToFileURL(harnessPath)}?firstRun=1`);

  await expect(page.locator('#btn-first-run-example')).toHaveCount(0);
  await page.fill('#order-id', 'SP-PAID');
  await page.click('#btn-sync-order');
  await expect(page.locator('#btn-first-run-example')).toBeVisible();
  await expect(page.locator('#selection-card')).toContainText('no page content used');

  await page.click('#btn-first-run-example');
  await expect(page.locator('#result-title')).toHaveText('Action Brief');
  await expect(page.locator('#workflow')).toContainText('Maya');
  await page.click('#tab-structured');
  await expect(page.locator('#workflow')).toContainText('Publishing waits for both checks');
  await expect(page.locator('#exports')).toContainText('Copy Markdown');
  await expect(page.locator('#exports')).toContainText('Copy JSON');
  await expect(page.locator('#btn-first-run-example')).toHaveCount(0);

  const demoMessages = await page.evaluate(() => globalThis.__messageLog.filter((msg) => msg.type === 'panel:extract_demo'));
  expect(demoMessages).toHaveLength(1);
  expect(demoMessages[0]).toEqual({ type: 'panel:extract_demo' });
});
