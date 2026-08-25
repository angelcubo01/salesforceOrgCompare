/** Matchers estrictos para Setup > Deployment Status y su iframe Visualforce. */

export const DEPLOY_STATUS_SETUP_RE = /^\/lightning\/setup\/DeployStatus\/(?:page|home)\/?$/i;
export const DEPLOY_STATUS_CLASSIC_FRAME_RE = /^\/changemgmt\/monitorDeployment\.apexp$/i;
export const DEPLOY_STATUS_DETAIL_CLASSIC_FRAME_RE = /^\/changemgmt\/monitorDeploymentsDetails\.apexp$/i;

function toUrl(value) {
  if (!value) return null;
  try {
    return value instanceof URL ? value : new URL(String(value), 'https://example.invalid');
  } catch {
    return null;
  }
}

function isSalesforceHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return [
    '.lightning.force.com',
    '.salesforce-setup.com',
    '.my.salesforce-setup.com',
    '.my.salesforce.com',
    '.salesforce.com'
  ].some((suffix) => host.endsWith(suffix));
}

/** @param {string | URL | undefined | null} value */
export function isDeployStatusSetupPage(value) {
  const url = toUrl(value);
  return !!(url && isSalesforceHost(url.hostname) && DEPLOY_STATUS_SETUP_RE.test(url.pathname));
}

/** @param {string | URL | undefined | null} value */
export function isDeployStatusClassicFrame(value) {
  const url = toUrl(value);
  return !!(url && isSalesforceHost(url.hostname) && DEPLOY_STATUS_CLASSIC_FRAME_RE.test(url.pathname));
}

/** @param {string | URL | undefined | null} value */
export function isDeployStatusInjectPage(value) {
  return isDeployStatusSetupPage(value) || isDeployStatusClassicFrame(value);
}

/** @param {string | URL | undefined | null} value */
export function isDeployStatusDetailSetupPage(value) {
  const url = toUrl(value);
  if (!url || !isSalesforceHost(url.hostname) || !DEPLOY_STATUS_SETUP_RE.test(url.pathname)) return false;
  let address = url.searchParams.get('address') || '';
  try { address = decodeURIComponent(address); } catch { /* malformed address */ }
  return /^\/changemgmt\/monitorDeploymentsDetails\.apexp(?:[?&]|$)/i.test(address);
}

/** @param {string | URL | undefined | null} value */
export function isDeployStatusDetailClassicFrame(value) {
  const url = toUrl(value);
  return !!(url && isSalesforceHost(url.hostname) && DEPLOY_STATUS_DETAIL_CLASSIC_FRAME_RE.test(url.pathname));
}

/** @param {string | URL | undefined | null} value */
export function isDeployStatusDetailInjectPage(value) {
  return isDeployStatusDetailSetupPage(value) || isDeployStatusDetailClassicFrame(value);
}
