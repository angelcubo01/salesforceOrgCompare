import { bg } from '../core/bridge.js';

/**
 * @param {string} artifactType
 * @param {string} phase
 * @param {Record<string, unknown>} [extra]
 */
export async function logToolUsage(artifactType, phase, extra = {}) {
  try {
    await bg({
      type: 'usage:log',
      entry: {
        kind: 'extension_usage',
        artifactType,
        phase,
        ...extra
      }
    });
  } catch {
    /* ignore */
  }
}
