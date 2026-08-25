#!/usr/bin/env node

import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const source = resolve(root, 'node_modules', 'driver.js', 'dist');
const destination = resolve(root, 'vendor', 'driver.js');

await mkdir(destination, { recursive: true });
await Promise.all([
  copyFile(resolve(source, 'driver.js.mjs'), resolve(destination, 'driver.js.mjs')),
  copyFile(resolve(source, 'driver.css'), resolve(destination, 'driver.css'))
]);

console.log('[SFOC] Driver.js 1.8.0 sincronizado en vendor/driver.js.');
