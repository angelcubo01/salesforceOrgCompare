import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'node_modules', 'read-excel-file', 'bundle');
const destination = resolve(root, 'vendor', 'read-excel-file');

await mkdir(destination, { recursive: true });
await Promise.all([
  copyFile(resolve(source, 'read-excel-file.min.js'), resolve(destination, 'read-excel-file.min.js')),
  copyFile(resolve(source, 'read-excel-file.min.js.map'), resolve(destination, 'read-excel-file.min.js.map'))
]);

console.log('[SFOC] Lector local de archivos Excel sincronizado en vendor/read-excel-file.');
