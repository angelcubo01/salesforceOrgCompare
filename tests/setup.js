/**
 * Entorno de pruebas: mock mínimo de chrome.storage y carga de Diff global (como en code.html).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const diffScript = readFileSync(join(root, 'vendor/jsdiff/diff.min.js'), 'utf8');
const sandbox = { Diff: undefined };
vm.runInNewContext(diffScript, sandbox);
globalThis.Diff = sandbox.Diff;

if (typeof globalThis.chrome === 'undefined') {
  const store = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        get: (keys) =>
          Promise.resolve(
            typeof keys === 'string'
              ? { [keys]: store.get(keys) }
              : Object.fromEntries(
                  (Array.isArray(keys) ? keys : Object.keys(keys || {})).map((k) => [k, store.get(k)])
                )
          ),
        set: (obj) => {
          for (const [k, v] of Object.entries(obj || {})) store.set(k, v);
          return Promise.resolve();
        }
      }
    },
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`
    }
  };
}
