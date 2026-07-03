#!/usr/bin/env node
/**
 * Copia dockview + dockview-core a vendor/ para la extensión MV3 (CSP script-src 'self').
 * La app debe importar el paquete público `dockview`, no `dockview-core` directamente.
 * Uso: node scripts/vendor-dockview.mjs
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const corePkgRoot = join(root, 'node_modules', 'dockview-core');
const dockPkgRoot = join(root, 'node_modules', 'dockview');
const coreOutDir = join(root, 'vendor', 'dockview-core');
const dockOutDir = join(root, 'vendor', 'dockview');

const coreCopies = [
  ['dist/package/main.esm.mjs', 'dockview-core.esm.mjs'],
  ['dist/styles/dockview.css', 'dockview.css']
];

await mkdir(coreOutDir, { recursive: true });
await mkdir(dockOutDir, { recursive: true });

for (const [srcRel, destName] of coreCopies) {
  const src = join(corePkgRoot, srcRel);
  const dest = join(coreOutDir, destName);
  await copyFile(src, dest);
  console.log(`vendor-dockview: dockview-core/${destName}`);
}

const dockSrc = join(dockPkgRoot, 'dist/package/main.esm.mjs');
const dockDest = join(dockOutDir, 'dockview.esm.mjs');
let dockSource = await readFile(dockSrc, 'utf8');
dockSource = dockSource.replaceAll(
  "from 'dockview-core'",
  "from '../dockview-core/dockview-core.esm.mjs'"
);
await writeFile(dockDest, dockSource, 'utf8');
console.log('vendor-dockview: dockview/dockview.esm.mjs');
