/** Dominios Salesforce donde puede existir la cabecera global Lightning. */
export const QUICK_LINKS_SALESFORCE_HOST_SUFFIXES = [
  '.salesforce.com',
  '.force.com',
  '.lightning.force.com',
  '.visual.force.com',
  '.vf.force.com',
  '.visualforce.com',
  '.cloudforce.com',
  '.salesforce-setup.com',
  '.my.salesforce-setup.com'
];

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
  return QUICK_LINKS_SALESFORCE_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix)
  );
}

/** @param {string | URL | undefined | null} value */
export function isQuickLinksSalesforcePage(value) {
  const url = toUrl(value);
  return !!(url && isSalesforceHost(url.hostname));
}
