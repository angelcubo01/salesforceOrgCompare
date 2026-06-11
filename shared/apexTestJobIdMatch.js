/** Clave estable para comparar Ids de Salesforce (15/18 caracteres, mayúsculas). */
export function sfApexIdKey(id) {
  const s = String(id || '').replace(/[^a-zA-Z0-9]/g, '');
  return s.length >= 15 ? s.slice(0, 15).toLowerCase() : s.toLowerCase();
}

/** @param {{ jobId?: unknown, canonicalJobId?: unknown, job?: { Id?: unknown } }} run */
export function apexRunMatchesStoredJobId(run, jobId) {
  if (!run || jobId == null) return false;
  const want = sfApexIdKey(jobId);
  if (!want) return false;
  if (sfApexIdKey(run.jobId) === want) return true;
  if (sfApexIdKey(run.canonicalJobId) === want) return true;
  if (run.job?.Id && sfApexIdKey(run.job.Id) === want) return true;
  return false;
}
