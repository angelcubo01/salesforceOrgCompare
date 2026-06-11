/** AsyncApexJob `Completed` no implica que todos los métodos hayan pasado. */
export function apexTestRunHasFailures(outcomeCounts, job) {
  if (outcomeCounts && typeof outcomeCounts === 'object') {
    const failN =
      Number(outcomeCounts.Fail || 0) +
      Number(outcomeCounts.CompileFail || 0);
    if (failN > 0) return true;
  }
  const errs = job?.NumberOfErrors;
  if (errs != null && Number(errs) > 0) return true;
  return false;
}
