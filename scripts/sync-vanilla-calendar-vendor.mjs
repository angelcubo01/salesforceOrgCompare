import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = [
  ['node_modules/vanilla-calendar-pro/index.mjs', 'vendor/vanilla-calendar-pro/index.mjs'],
  ['node_modules/vanilla-calendar-pro/styles/index.css', 'vendor/vanilla-calendar-pro/styles/index.css']
];

for (const [from, to] of files) {
  const target = resolve(root, to);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, from), target);
}
