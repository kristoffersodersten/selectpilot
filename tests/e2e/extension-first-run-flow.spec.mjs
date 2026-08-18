import { test, expect, chromium } from '@playwright/test';

test('real extension first-run sends only the canonical local example', async () => {
  const executablePath = process.env.SELECTPILOT_CHROME_EXECUTABLE;
  test.skip(!executablePath, 'SELECTPILOT_CHROME_EXECUTABLE is required for unpacked-extension proof');

  const context = await chromium.launchPersistentContext(test.info().outputPath('extension-user-data'), {
    executablePath,
    headless: process.env.SELECTPILOT_HEADED !== '1',
    args: [
      `--disable-extensions-except=${process.cwd()}`,
      `--load-extension=${process.cwd()}`,
      '--disable-web-security',
    ],
  });

  let extractRequest = null;
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
    if (path === '/extract') {
      extractRequest = request.postDataJSON();
      return fulfill({
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

  try {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker');
    const extensionId = new URL(serviceWorker.url()).host;
    const panelPage = await context.newPage();
    await panelPage.goto(`chrome-extension://${extensionId}/panel/panel.html`);
    await expect(panelPage.locator('#btn-first-run-example')).toHaveCount(0);

    const lockedResponse = await panelPage.evaluate(() => globalThis.chrome.runtime.sendMessage({ type: 'panel:extract_demo' }));
    expect(lockedResponse.error).toBe('Paid license required for deterministic extraction');
    expect(extractRequest).toBeNull();

    await panelPage.evaluate(async () => {
      const storage = await import(globalThis.chrome.runtime.getURL('licensing/license-storage.js'));
      const now = Date.now();
      await storage.saveLicense({
        token: 'sp_e2e_paid_token', tier: 'essential', issuedAt: now,
        expiresAt: now + 86_400_000, cachedAt: now,
      });
    });
    await panelPage.reload();

    await expect(panelPage.locator('#btn-first-run-example')).toBeVisible();
    await panelPage.locator('#btn-first-run-example').click();
    await expect.poll(() => extractRequest).not.toBeNull();
    expect(extractRequest).toEqual({
      text: 'The launch review is Friday. Maya owns the privacy check by Thursday. Jonas will verify payment and store assets. Publishing stays blocked until both checks pass.',
      preset: 'action_brief',
      url: 'selectpilot://first-run',
      title: 'Launch review notes',
      metadata: { source: 'selectpilot_first_run', sample_version: 'v1' },
    });

    await expect(panelPage.locator('#result-title')).toHaveText('Action Brief');
    await expect(panelPage.locator('#exports')).toContainText('Copy Markdown');
    await panelPage.locator('#tab-structured').click();
    await expect(panelPage.locator('#workflow')).toContainText('Publishing waits for both checks');
    await expect(panelPage.locator('#btn-first-run-example')).toHaveCount(0);

    await panelPage.reload();
    await expect(panelPage.locator('#btn-first-run-example')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
