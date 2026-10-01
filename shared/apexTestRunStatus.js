/** AsyncApexJob `Completed` no implica que todos los métodos hayan pasado. */
export function getApexTestRunOutcomeSummary(outcomeCounts) {
  const known = !!outcomeCounts && typeof outcomeCounts === 'object' && !Array.isArray(outcomeCounts);
  if (!known) {
    return { known: false, passed: 0, failed: 0, compileFailed: 0, skipped: 0, total: 0 };
  }
  const count = (name) => Math.max(0, Number(outcomeCounts[name]) || 0);
  const passed = count('Pass');
  const failed = count('Fail');
  const compileFailed = count('CompileFail');
  const skipped = count('Skip');
  const total = Object.values(outcomeCounts).reduce(
    (sum, value) => sum + Math.max(0, Number(value) || 0),
    0
  );
  return { known: true, passed, failed, compileFailed, skipped, total };
}

export function apexTestRunHasFailures(outcomeCounts, job) {
  const summary = getApexTestRunOutcomeSummary(outcomeCounts);
  if (summary.failed + summary.compileFailed > 0) return true;
  const errs = job?.NumberOfErrors;
  if (errs != null && Number(errs) > 0) return true;
  return false;
}

export function isApexTestTerminalJobStatus(status) {
  return ['completed', 'failed', 'aborted', 'error'].includes(String(status || '').trim().toLowerCase());
}
