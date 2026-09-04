// module_name: extension_privacy_integration
// spec_ref: "privacy_and_debug_policy"
import { test, expect, chromium } from '@playwright/test';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectRuntimeFiles } from '../../scripts/package-chrome-store.mjs';

test('real extension preserves privacy from selected text through rendered output', async () => {
  const executablePath = process.env.SELECTPILOT_CHROME_EXECUTABLE || chromium.executablePath();
  const keyId = 'e2e-ephemeral';
  const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const publicKeyHex = Buffer.from(await crypto.subtle.exportKey('raw', keyPair.publicKey)).toString('hex');
  const extensionRoot = test.info().outputPath('extension');
  for (const relative of await collectRuntimeFiles(process.cwd())) {
    const destination = path.join(extensionRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(process.cwd(), relative), destination);
  }
  await writeFile(
    path.join(extensionRoot, 'pricing/entitlement-public-keys.json'),
    JSON.stringify({
      schema_version: 1,
      keys: [{ kid: keyId, alg: 'Ed25519', public_key_hex: publicKeyHex, status: 'active' }],
    }),
  );

  const context = await chromium.launchPersistentContext(test.info().outputPath('extension-user-data'), {
    executablePath,
    headless: process.env.SELECTPILOT_HEADED !== '1',
    args: [
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`,
      '--disable-web-security',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--no-first-run',
    ],
  });

  const extractRequests = [];
  const externalRequests = [];
  context.on('request', (request) => {
    const url = new URL(request.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      externalRequests.push(request.url());
    }
  });
  await context.route('http://127.0.0.1:8083/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const fulfill = (body) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });


    if (path === '/profiles') {
      return fulfill({
        profiles: [{
          key: 'fast', label: 'Fast', description: 'Local test profile',
          generation_model: 'test-generation', embedding_model: 'test-embedding',
          target_latency: 'local', intended_for: 'Test', command: 'not-used',
        }],
        recommended_profile: 'fast',
        reason: 'Recommended from local hardware.',
      });
    }
    if (path === '/health') {
      return fulfill({
        ok: true,
        ollama: {
          reachable: true, model_available: true, active_model: 'test-generation',
          privacy_mode: 'local-only', ignored_remote_models: [],
        },
      });
    }
    if (path === '/privacy-proof') {
      return fulfill({
        ok: true,
        privacy_mode: 'local-only',
        generated_at: new Date().toISOString(),
        outbound_observation: { external_calls_registered: false },
      });
    }
    if (path === '/benchmark') {
      return fulfill({
        ok: true, active_model: 'test-generation', extract_latency_ms: 20,
        summarize_latency_ms: 25, recommended_profile: 'fast',
      });
    }
    if (path === '/runtime-meta/health') {
      return fulfill({ ok: false, stream_enabled: false, active_streams: 0, event_version: '1' });
    }
    if (path === '/license/verify') {
      const token = request.postDataJSON().token;
      const now = Date.now();
      const entitlement = {
        token, tier: 'essential', features: ['structured_extraction'], issuedAt: now,
        expiresAt: now + 86_400_000,
      };
      const signature = Buffer.from(await crypto.subtle.sign(
        'Ed25519', keyPair.privateKey, new TextEncoder().encode(JSON.stringify(entitlement)),
      )).toString('base64');
      return fulfill({ entitlement, signature, alg: 'Ed25519', kid: keyId });
    }
    if (path === '/extract') {
      extractRequests.push(request.postDataJSON());
      return fulfill({
        model: 'gemma4:e2b-it-qat',
        source: 'ollama',
        routing: {
          model: 'gemma4:e2b-it-qat',
          num_ctx: 16_384,
          reason: 'smallest_qualified_structured_model',
        },
        preset: 'action_brief',
        label: 'Action Brief',
        description: 'Turn selected text into a concise action-oriented brief.',
        markdown: '## Action Brief\n\n- Maya: privacy check by Thursday',
        json: {
          action_items: ['Maya completes the privacy check by Thursday'],
          risks: ['Publishing waits for both checks'],
        },
      });
    }
    return fulfill({ ok: true });
  });
  await context.route('https://selectpilot.test/e2e-selection', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><title>Private launch plan</title><main><p id="selection">Maya owns the privacy review by Thursday. Publishing remains blocked until the review passes.</p></main>',
  }));

  try {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker');
    const extensionId = new URL(serviceWorker.url()).host;
    const panelPage = await context.newPage();
    await panelPage.goto(`chrome-extension://${extensionId}/panel/panel.html`);
    await expect(panelPage.locator('#btn-first-run-example')).toHaveCount(0);

    const lockedResponse = await panelPage.evaluate(() => globalThis.chrome.runtime.sendMessage({ type: 'panel:extract_demo' }));
    expect(lockedResponse.error).toBe('Paid license required for deterministic extraction');
    expect(extractRequests).toEqual([]);

    const attached = await panelPage.evaluate(() => globalThis.chrome.runtime.sendMessage({
      type: 'license:attach_token', token: 'sp_e2e_paid_token',
    }));
    expect(attached).toMatchObject({ token: 'sp_e2e_paid_token', tier: 'essential' });
    await panelPage.reload();

    await expect(panelPage.locator('#btn-first-run-example')).toBeVisible();
    await panelPage.locator('#btn-first-run-example').click();
    await expect.poll(() => extractRequests.length).toBe(1);
    expect(extractRequests[0]).toEqual({
      text: 'The launch review is Friday. Maya owns the privacy check by Thursday. Jonas will verify payment and store assets. Publishing stays blocked until both checks pass.',
      preset: 'action_brief',
      url: 'selectpilot://first-run',
      title: 'Launch review notes',
      metadata: { source: 'selectpilot_first_run', sample_version: 'v1' },
    });

    await expect(panelPage.locator('#result-title')).toHaveText('Action Brief');
    await expect(panelPage.locator('#truth-model')).toHaveText('gemma4:e2b-it-qat');
    await expect(panelPage.locator('#truth-profile')).toContainText('16,384 ctx');
    await expect(panelPage.locator('#status-bar')).toContainText('smallest qualified structured model');
    await expect(panelPage.locator('#exports')).toContainText('Copy Markdown');
    await panelPage.locator('#tab-structured').click();
    await expect(panelPage.locator('#workflow')).toContainText('Publishing waits for both checks');
    await expect(panelPage.locator('#btn-first-run-example')).toHaveCount(0);

    await panelPage.reload();
    await expect(panelPage.locator('#btn-first-run-example')).toHaveCount(0);

    const sourcePage = await context.newPage();
    await sourcePage.goto('https://selectpilot.test/e2e-selection');
    await expect(sourcePage.locator('body')).toContainText('Maya owns the privacy review by Thursday');
    externalRequests.length = 0;
    await sourcePage.locator('#selection').selectText();
    await expect.poll(() => sourcePage.evaluate(() => globalThis.getSelection()?.toString())).toContain('Maya owns the privacy review');
    await sourcePage.bringToFront();
    const activeTabUrl = await panelPage.evaluate(async () => {
      const [tab] = await globalThis.chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.url || '';
    });
    expect(activeTabUrl).toBe('');
    expect(await sourcePage.evaluate(() => globalThis.getSelection()?.toString())).toBe(
      'Maya owns the privacy review by Thursday. Publishing remains blocked until the review passes.'
    );
    expect(externalRequests).toEqual([]);
  } finally {
    await context.close();
  }
});
