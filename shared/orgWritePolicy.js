/**
 * Políticas de escritura por org (deploy, DML, REST mutaciones).
 */

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
 */
export function shouldBlockProductionDeploy(org, verifiedIsSandbox, checkOnly = false) {
  if (checkOnly) return false;
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
