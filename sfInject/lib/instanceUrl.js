/**
 * Resolución de instanceUrl desde hostname/URL de pestaña Salesforce.
 */

/**
 * @param {string} hostname
 * @returns {string}
 */
export function instanceUrlFromHostname(hostname) {
  const host = String(hostname || '').trim();
  if (!host) return '';

  if (host.endsWith('.lightning.force.com')) {
    const prefix = host.replace('.lightning.force.com', '');
    return `https://${prefix}.my.salesforce.com`;
  }
  if (host.endsWith('.salesforce-setup.com')) {
    const prefix = host.replace('.salesforce-setup.com', '');
    if (prefix.endsWith('.my')) return `https://${prefix}.salesforce.com`;
    return `https://${prefix}.my.salesforce.com`;
  }
  if (host.endsWith('.my.salesforce.com') || host.endsWith('.salesforce.com')) {
    return `https://${host}`;
  }
  return `https://${host}`;
}

/**
 * @param {string | URL | undefined | null} url
 * @returns {string}
 */
export function instanceUrlFromLocationUrl(url) {
  try {
    const u = typeof url === 'string' ? new URL(url) : url;
    if (!u?.hostname) return '';
    return instanceUrlFromHostname(u.hostname);
  } catch {
    return '';
  }
}

/** @returns {string} */
export function instanceUrlFromLocation() {
  try {
    return instanceUrlFromHostname(location.hostname);
  } catch {
    return '';
  }
}
