import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'node_modules', 'tabulator-tables', 'dist');
const destination = resolve(root, 'vendor', 'tabulator');

await mkdir(destination, { recursive: true });
await Promise.all([
  copyFile(resolve(source, 'js', 'tabulator_esm.min.js'), resolve(destination, 'tabulator_esm.min.js')),
  copyFile(resolve(source, 'js', 'tabulator_esm.min.js.map'), resolve(destination, 'tabulator_esm.min.js.map')),
  copyFile(resolve(source, 'css', 'tabulator.min.css'), resolve(destination, 'tabulator.min.css'))
]);

console.log('[SFOC] Tabulator 6 sincronizado en vendor/tabulator.');
