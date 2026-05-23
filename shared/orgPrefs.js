/**
 * Preferencias de orgs (alias, grupo) compartidas entre popup y vista code.
 */

/**
 * Texto para <option> de org: grupo opcional y nombre.
 */
export function buildOrgPicklistLabel(org, extras) {
  const alias = extras?.aliases?.[org.id];
  const group = (extras?.groups?.[org.id] || '').trim();
  const name = alias || org.label || org.displayName || safeHost(org.instanceUrl);
  if (group) return `[${group}] · ${name}`;
  return name;
}

function safeHost(instanceUrl) {
  try {
    return new URL(instanceUrl).hostname;
  } catch {
    return '—';
  }
}

export function sameGroupKey(a, b) {
  return (a || '') === (b || '');
}

export function normalizeInstanceOrigin(url) {
  try {
    return new URL(url).origin.toLowerCase();
  } catch {
    return String(url || '').trim().toLowerCase().replace(/\/$/, '');
  }
}

/** Org detectada ya guardada (por id de Salesforce o misma instancia). */
export function isOrgAlreadySaved(detectedOrg, savedOrgs) {
  if (!detectedOrg?.id || !Array.isArray(savedOrgs)) return false;
  if (savedOrgs.some((o) => o.id === detectedOrg.id)) return true;
  const detectedOrigin = normalizeInstanceOrigin(detectedOrg.instanceUrl);
  if (!detectedOrigin) return false;
  return savedOrgs.some((o) => normalizeInstanceOrigin(o.instanceUrl) === detectedOrigin);
}
