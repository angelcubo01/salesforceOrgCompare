/**
 * Normaliza la respuesta de `runTestsAsynchronous` (objeto, string u otras claves).
 */
export function extractApexTestRunJobId(result) {
  if (result == null) return '';
  if (Array.isArray(result) && result.length) {
    return extractApexTestRunJobId(result[0]);
  }
  if (typeof result === 'string') {
    const t = result.trim();
    if (/^[a-zA-Z0-9]{15,18}$/.test(t)) return t;
    try {
      return extractApexTestRunJobId(JSON.parse(t));
    } catch {
      return '';
    }
  }
  if (typeof result === 'object') {
    if (result.body != null) {
      const inner = extractApexTestRunJobId(result.body);
      if (inner) return inner;
    }
    const cand = result.id ?? result.testRunId ?? result.jobId ?? result.asyncApexJobId ?? result.AsyncApexJobId;
    if (cand != null && String(cand).trim()) return String(cand).trim();
    for (const v of Object.values(result)) {
      if (typeof v === 'string' && /^[a-zA-Z0-9]{15,18}$/.test(v.trim())) return v.trim();
    }
  }
  return '';
}
