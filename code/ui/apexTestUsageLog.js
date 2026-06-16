import { bg } from '../core/bridge.js';
import { state } from '../core/state.js';

function classNamesFromRunBody(runBody) {
  const tests = runBody?.tests;
  if (!Array.isArray(tests)) return [];
  const out = [];
  for (const t of tests) {
    if (t && t.className) out.push(String(t.className).trim());
  }
  return out.filter(Boolean);
}

/**
 * Monitorización vía PostHog: mismo patrón que comparaciones / retrieve.
 * @param {string[] | undefined} classNamesHint Nombres desde la selección del runner (resuelve classId → nombre).
 */
export async function logApexTestRunUsage(orgId, runBody, classNamesHint) {
  const names =
    Array.isArray(classNamesHint) && classNamesHint.length
      ? classNamesHint.map((s) => String(s).trim()).filter(Boolean)
      : classNamesFromRunBody(runBody);
  const descriptor = {
    testLevel: runBody?.testLevel || '',
    testsConfigured: Array.isArray(runBody?.tests) ? runBody.tests.length : 0
  };
  if (names.length === 1) {
    descriptor.name = names[0];
  } else if (names.length > 1) {
    descriptor.names = names;
  }
  try {
    await bg({
      type: 'usage:log',
      entry: {
        kind: 'codeComparison',
        artifactType: 'ApexTests',
        phase: 'runTestsAsynchronous',
        descriptor,
        leftOrgId: orgId != null ? String(orgId) : '',
        rightOrgId: orgId != null ? String(orgId) : '',
        comparisonUrl: typeof window !== 'undefined' ? window.location.href : ''
      }
    });
  } catch {
    /* ignorar errores de logging */
  }
}

/**
 * Fallo operacional de Apex Tests (analytics, no Error Tracking).
 * @param {string} orgId
 * @param {string} phase
 * @param {{ reason?: string, error?: string }} [opts]
 */
export async function logApexTestFailureUsage(orgId, phase, opts = {}) {
  try {
    await bg({
      type: 'usage:log',
      entry: {
        kind: 'extension_failure',
        artifactType: 'ApexTests',
        phase,
        ok: false,
        reason: opts.reason || '',
        error: opts.error || '',
        leftOrgId: orgId != null ? String(orgId) : '',
        rightOrgId: orgId != null ? String(orgId) : '',
        comparisonUrl: typeof window !== 'undefined' ? window.location.href : ''
      }
    });
  } catch {
    /* ignorar errores de logging */
  }
}
