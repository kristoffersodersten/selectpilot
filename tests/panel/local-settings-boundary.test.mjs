import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('extension preferences remain device-local and never use Chrome sync', async () => {
  const source = await readFile(new URL('../../options/options.ts', import.meta.url), 'utf8');
  assert.match(source, /chrome\.storage\.local\.get/);
  assert.match(source, /chrome\.storage\.local\.set/);
  assert.doesNotMatch(source, /chrome\.storage\.sync/);
});
