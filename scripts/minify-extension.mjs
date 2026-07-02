#!/usr/bin/env node
/**
 * Minifica JS propio de la extensión (sin bundling) para el ZIP de Chrome Web Store.
 * Uso: node scripts/minify-extension.mjs <stagingRoot>
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { transform } from 'esbuild';

const TRANSFORM_OPTS = {
  loader: 'js',
  minify: true,
  format: 'esm',
  target: 'chrome114',
  legalComments: 'none'
};

const MINIFY_ROOTS = [
  'background.js',
  'background',
  'code',
  'popup',
  'shared'
];

const EXCLUDE_DIR_NAMES = new Set(['vendor', 'node_modules']);

async function collectJsFiles(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
      await collectJsFiles(join(dir, entry.name), files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

async function resolveTargets(stageRoot) {
  const targets = [];
  for (const root of MINIFY_ROOTS) {
    const abs = join(stageRoot, root);
    try {
      const info = await stat(abs);
      if (info.isFile()) {
        targets.push(abs);
      } else if (info.isDirectory()) {
        targets.push(...(await collectJsFiles(abs)));
      }
    } catch (err) {
      if (err?.code === 'ENOENT') continue;
      throw err;
    }
  }
  return targets;
}

async function minifyFile(filePath) {
  const source = await readFile(filePath, 'utf8');
  const before = Buffer.byteLength(source, 'utf8');
  const result = await transform(source, TRANSFORM_OPTS);
  const after = Buffer.byteLength(result.code, 'utf8');
  await writeFile(filePath, result.code, 'utf8');
  return { before, after };
}

async function main() {
  const stageArg = process.argv[2];
  if (!stageArg) {
    console.error('Uso: node scripts/minify-extension.mjs <stagingRoot>');
    process.exit(1);
  }

  const stageRoot = resolve(stageArg);
  const files = await resolveTargets(stageRoot);

  if (!files.length) {
    console.error(`[SFOC] No se encontraron ficheros .js para minificar en ${stageRoot}`);
    process.exit(1);
  }

  let processed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  const failures = [];

  for (const filePath of files) {
    try {
      const { before, after } = await minifyFile(filePath);
      processed += 1;
      bytesBefore += before;
      bytesAfter += after;
    } catch (err) {
      failures.push({
        file: relative(stageRoot, filePath),
        message: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const savedKb = ((bytesBefore - bytesAfter) / 1024).toFixed(1);
  const ratio = bytesBefore > 0 ? ((bytesAfter / bytesBefore) * 100).toFixed(1) : '100.0';

  console.log(`[SFOC] Minificados ${processed} ficheros JS (${savedKb} KB ahorrados, ${ratio}% del tamaño original)`);

  if (failures.length) {
    console.error('[SFOC] Errores de minificacion:');
    for (const failure of failures) {
      console.error(`  - ${failure.file}: ${failure.message}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[SFOC] Minificacion fallida:', err);
  process.exit(1);
});
