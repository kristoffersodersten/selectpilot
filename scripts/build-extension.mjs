#!/usr/bin/env node

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(projectRoot, 'content/content-script.ts')],
  outfile: path.join(projectRoot, 'content/content-script.bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome127'],
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
});
