import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'shared/telemetryConfig.js');
const example = join(root, 'shared/telemetryConfig.example.js');

if (!existsSync(target)) {
  if (!existsSync(example)) {
    console.error('[SFOC] Falta shared/telemetryConfig.example.js');
    process.exit(1);
  }
  copyFileSync(example, target);
  console.log('[SFOC] Creado shared/telemetryConfig.js desde telemetryConfig.example.js');
}
