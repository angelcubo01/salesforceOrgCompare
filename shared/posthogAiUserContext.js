import { getOrCreateTelemetryInstallId } from './telemetryInstallId.js';

export const SFOC_AI_USER_ID_PROP = 'sfoc_ai_user_id';

/**
 * ID pseudónimo de IA (mismo UUID que distinct_id PostHog y X-SFOC-Install-Id del proxy).
 * @returns {Promise<string>}
 */
export async function getSfocAiUserId() {
  return getOrCreateTelemetryInstallId();
}

/**
 * @param {string} installId
 * @returns {Record<string, string>}
 */
export function buildSfocAiUserProperties(installId) {
  const id = String(installId || '').trim();
  if (!id) return {};
  return { [SFOC_AI_USER_ID_PROP]: id };
}
