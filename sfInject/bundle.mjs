#!/usr/bin/env node
/**
 * Bundle del content script sfInject (IIFE, sin type:module en manifest).
 * Versionado en el repo (scripts/ está en .gitignore y no existe en CI).
 * Uso: node sfInject/bundle.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'sfInject', 'content', 'host.js');
const outfile = join(root, 'sfInject', 'content', 'bundle.js');

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome114',
  legalComments: 'none',
  banner: {
    js: '/* SFOC sfInject content script (bundled; do not edit) */'
  }
});

console.log(`Wrote ${outfile}`);
