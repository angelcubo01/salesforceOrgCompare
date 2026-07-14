/**
 * Políticas de escritura por org (deploy, DML, REST mutaciones).
 */

/** Acciones permitidas en producción (no aplicar bloqueo de deploy). */
export const PRODUCTION_WRITE_ALLOWED_ACTIONS = Object.freeze(['anonymous_apex_execute']);

/**
 * @param {string} [action]
 */
export function isProductionWriteAllowedAction(action) {
  const id = String(action || '').trim();
  return id.length > 0 && PRODUCTION_WRITE_ALLOWED_ACTIONS.includes(id);
}

/**
 * @param {Record<string, unknown> | null | undefined} org
 */
export function isOrgMarkedProduction(org) {
  return !!(org && org.isSandbox === false);
}

/**
 * @param {Record<string, unknown> | null | undefined} org
 * @param {boolean | null} verifiedIsSandbox desde API Organization
 * @param {boolean} [checkOnly]
 * @param {string} [action]
 */
export function shouldBlockProductionDeploy(org, verifiedIsSandbox, checkOnly = false, action = '') {
  if (checkOnly) return false;
  if (isProductionWriteAllowedAction(action)) return false;
  if (verifiedIsSandbox === true) return false;
  if (verifiedIsSandbox === false) return true;
  return isOrgMarkedProduction(org);
}

/**
 * @param {Record<string, boolean> | null | undefined} readOnlyByOrgId
 * @param {string} orgId
 */
export function isOrgReadOnly(readOnlyByOrgId, orgId) {
  if (!orgId || !readOnlyByOrgId) return false;
  return !!readOnlyByOrgId[String(orgId)];
}

/**
 * @param {boolean | null | undefined} storedIsSandbox
 * @param {boolean} verifiedIsSandbox
 */
export function shouldUpdateStoredSandboxFlag(storedIsSandbox, verifiedIsSandbox) {
  return typeof verifiedIsSandbox === 'boolean' && storedIsSandbox !== verifiedIsSandbox;
}
