/**
 * Normaliza datos de sesión/org para el desplegable de Environment Status.
 */

/**
 * @param {string} instanceUrl
 * @param {string} apiVersion e.g. "59.0"
 */
export function buildRestDataEndpoint(instanceUrl, apiVersion) {
  const base = String(instanceUrl || '').replace(/\/$/, '');
  const ver = String(apiVersion || '59.0').replace(/^v/i, '');
  return `${base}/services/data/v${ver}`;
}

/**
 * @param {string} instanceUrl
 */
export function buildUserInfoEndpoint(instanceUrl) {
  const base = String(instanceUrl || '').replace(/\/$/, '');
  return `${base}/services/oauth2/userinfo`;
}

/**
 * @param {Record<string, unknown> | null | undefined} sessionUser
 * @param {Record<string, unknown> | null | undefined} sf
 * @param {Record<string, unknown>} saved
 * @param {string | null} liveApiVersion
 */
export function buildSessionDetailPayload(sessionUser, sf, saved, liveApiVersion) {
  const instanceUrl = String(saved.instanceUrl || '');
  const savedApiVersion = String(saved.apiVersion || '59.0');
  const effectiveApi = liveApiVersion || savedApiVersion;

  const user = sessionUser
    ? {
        userId: String(sessionUser.userId || ''),
        username: String(sessionUser.username || ''),
        name: String(sessionUser.name || '')
      }
    : null;

  const org = sf
    ? {
        orgId: String(sf.id || saved.id || ''),
        name: String(sf.name || ''),
        isSandbox: typeof sf.isSandbox === 'boolean' ? sf.isSandbox : !!saved.isSandbox,
        organizationType: String(sf.organizationType || ''),
        instanceName: String(sf.instanceName || ''),
        namespacePrefix: String(sf.namespacePrefix || ''),
        languageLocaleKey: String(sf.languageLocaleKey || ''),
        timeZoneSidKey: String(sf.timeZoneSidKey || ''),
        trialExpirationDate: sf.trialExpirationDate || null
      }
    : {
        orgId: String(saved.id || ''),
        name: String(saved.displayName || saved.label || ''),
        isSandbox: !!saved.isSandbox,
        organizationType: '',
        instanceName: '',
        namespacePrefix: '',
        languageLocaleKey: '',
        timeZoneSidKey: '',
        trialExpirationDate: null
      };

  return {
    user,
    org,
    session: {
      instanceUrl,
      savedApiVersion,
      liveApiVersion: liveApiVersion || null,
      effectiveApiVersion: effectiveApi,
      restDataEndpoint: buildRestDataEndpoint(instanceUrl, effectiveApi),
      userInfoEndpoint: buildUserInfoEndpoint(instanceUrl)
    }
  };
}

/**
 * @param {Record<string, string>} labels clave i18n ya resueltas
 * @param {ReturnType<typeof buildSessionDetailPayload>} detail
 */
export function buildSessionDetailRows(labels, detail) {
  /** @type {{ label: string, value: string }[]} */
  const rows = [];
  const push = (label, value) => {
    const v = value == null || value === '' ? '—' : String(value);
    rows.push({ label, value: v });
  };

  if (detail.user) {
    push(labels.userId, detail.user.userId);
    push(labels.username, detail.user.username);
    push(labels.name, detail.user.name);
  }

  push(labels.orgId, detail.org.orgId);
  push(labels.orgName, detail.org.name);
  push(labels.orgType, detail.org.organizationType);
  push(labels.isSandbox, detail.org.isSandbox ? labels.yes : labels.no);
  push(labels.namespace, detail.org.namespacePrefix);
  push(labels.timezone, detail.org.timeZoneSidKey);
  push(labels.locale, detail.org.languageLocaleKey);
  push(labels.instanceName, detail.org.instanceName);

  push(labels.instanceUrl, detail.session.instanceUrl);
  push(labels.savedApi, detail.session.savedApiVersion);
  push(labels.liveApi, detail.session.liveApiVersion || '—');
  push(labels.restEndpoint, detail.session.restDataEndpoint);
  push(labels.userInfoEndpoint, detail.session.userInfoEndpoint);

  return rows;
}
