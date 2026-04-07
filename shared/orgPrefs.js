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
