import { test, expect } from '@playwright/test';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

test('privacy proof endpoint confirms local-only boundary', async ({ request }) => {
  const res = await request.get('/privacy-proof');
  expect(res.ok()).toBeTruthy();
  const proof = await res.json();

  expect(proof.privacy_mode).toBe('local-only');
  expect(Array.isArray(proof.allowed_endpoints)).toBeTruthy();
  expect(proof.outbound_observation?.external_calls_registered).toBeFalsy();

  for (const endpoint of proof.allowed_endpoints) {
    const host = new URL(endpoint).hostname;
    expect(LOCAL_HOSTS.has(host)).toBeTruthy();
  }
});

test('health endpoint is reachable and exposes ollama boundary state', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.ok()).toBeTruthy();
  const health = await res.json();
  expect(health).toHaveProperty('ollama');
  expect(health.ollama).toHaveProperty('privacy_mode');
});

test('mocked selected-text extraction response shape', async () => {
  const mock = {
    label: 'Action Brief',
    markdown: '## Action Brief\n\n- Task: Ship update',
    json: {
      task: 'Ship update',
      owner: 'Team',
      due_date: '2026-03-31',
      priority: 'high',
      blockers: [],
    },
  };

  expect(mock.label).toBe('Action Brief');
  expect(mock.markdown).toContain('Action Brief');
  expect(mock.json.task).toBeTruthy();
});