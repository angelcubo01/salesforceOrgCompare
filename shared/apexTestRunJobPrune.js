/** Jobs propios / seguidos visibles tras refrescar (24 h). */
export const APEX_TEST_JOBS_TTL_MS = 86_400_000;

/**
 * @param {unknown[]} list
 * @param {number} [nowMs]
 */
export function pruneExpiredStoredJobs(list, nowMs = Date.now()) {
  const cutoff = nowMs - APEX_TEST_JOBS_TTL_MS;
  return (list || []).filter((j) => {
    const t = j?.startedAt != null ? Number(j.startedAt) : 0;
    return Number.isFinite(t) && t >= cutoff;
  });
}
