const VIEWER_PAGE = 'code/apex-coverage-viewer.html';

export function buildApexCoverageViewerPath(storageKey, options = {}) {
  const params = new URLSearchParams();
  if (storageKey) params.set('k', String(storageKey));
  const className = String(options.className || '').trim();
  if (options.mode === 'split') {
    const leftOrgId = String(options.leftOrgId || '').trim();
    const leftApexId = String(options.leftApexId || '').trim();
    const rightOrgId = String(options.rightOrgId || '').trim();
    const rightApexId = String(options.rightApexId || '').trim();
    if (leftOrgId && leftApexId && rightOrgId && rightApexId) {
      params.set('mode', 'split');
      params.set('leftOrgId', leftOrgId);
      params.set('leftApexId', leftApexId);
      params.set('rightOrgId', rightOrgId);
      params.set('rightApexId', rightApexId);
    }
  } else {
    const orgId = String(options.orgId || '').trim();
    const apexId = String(options.apexId || '').trim();
    if (orgId && apexId) {
      params.set('orgId', orgId);
      params.set('apexId', apexId);
      const jobId = String(options.jobId || '').trim();
      if (jobId) params.set('jobId', jobId);
    }
  }
  if (className) params.set('className', className);
  const query = params.toString();
  return `${VIEWER_PAGE}${query ? `?${query}` : ''}`;
}
