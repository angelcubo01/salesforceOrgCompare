import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USED_ICON_NAMES, WORKBENCH_ICON_VERSION } from '../code/workbench/iconRegistry.js';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoot = resolve(process.argv[2] || 'node_modules/@tabler/icons/icons/outline');
const outputDir = resolve(repoRoot, 'code/assets');
const outputFile = resolve(outputDir, 'tabler-icons.svg');

function extractSvgBody(source, iconName) {
  const viewBox = source.match(/viewBox="([^"]+)"/)?.[1];
  if (viewBox !== '0 0 24 24') throw new Error(`${iconName}: viewBox inesperado: ${viewBox}`);
  const body = source.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1]?.trim();
  if (!body) throw new Error(`${iconName}: SVG inválido`);
  return body
    .replace(/<path[^>]*stroke="none"[^>]*><\/path>\s*/g, '')
    .replace(/<path[^>]*stroke="none"[^>]*\/>\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const symbols = [];
for (const iconName of USED_ICON_NAMES) {
  const source = await readFile(resolve(sourceRoot, `${iconName}.svg`), 'utf8');
  symbols.push(`  <symbol id="icon-${iconName}" viewBox="0 0 24 24">${extractSvgBody(source, iconName)}</symbol>`);
}

await mkdir(outputDir, { recursive: true });
await writeFile(
  outputFile,
  `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:none">\n${symbols.join('\n')}\n</svg>\n`,
  'utf8'
);

console.log(`Tabler Icons v${WORKBENCH_ICON_VERSION}: ${symbols.length} símbolos -> ${outputFile}`);
