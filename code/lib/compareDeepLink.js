/**
 * Deep-link de comparación: org izquierda/derecha, modo, operación e ítem en la URL.
 * Parámetros: `left`, `right`, `nav`, `op`, `type`, `key`, `fileName`, `descriptor`.
 * Compatibilidad: `orgId` → org izquierda (legado).
 */

/** @type {Record<string, string>} */
export const ITEM_TYPE_TO_OP = {
  ApexClass: 'Apex',
  ApexTrigger: 'Apex',
  ApexPage: 'VF',
  ApexComponent: 'VF',
  LWC: 'LWC',
  Aura: 'Aura',
  PermissionSet: 'PermissionSet',
  Profile: 'Profile',
  FlexiPage: 'FlexiPage',
  PackageXml: 'PackageXml',
  CustomObject: 'FieldDependency'
};

/** @param {string} itemType */
export function operationSelectValueForItemType(itemType) {
  return ITEM_TYPE_TO_OP[itemType] || '';
}

/**
 * @param {string | URLSearchParams} search
 * @returns {{
 *   leftOrgId: string | null,
 *   rightOrgId: string | null,
 *   itemType: string | null,
 *   itemKey: string | null,
 *   fileName: string | null,
 *   descriptor: Record<string, unknown> | null,
 *   op: string | null,
 *   navMode: string | null
 * }}
 */
export function parseCompareDeepLink(search) {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(
          String(search || '')
            .replace(/^\?/, '')
            .trim()
        );

  const leftOrgId =
    trimParam(params.get('left')) ||
    trimParam(params.get('leftOrg')) ||
    trimParam(params.get('orgId'));
  const rightOrgId = trimParam(params.get('right')) || trimParam(params.get('rightOrg'));
  const itemType = trimParam(params.get('type'));
  const itemKey = trimParam(params.get('key'));
  const fileName = trimParam(params.get('fileName')) || trimParam(params.get('file'));

  let descriptor = null;
  const descRaw = params.get('descriptor');
  if (descRaw) {
    try {
      const parsed = JSON.parse(descRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        descriptor = /** @type {Record<string, unknown>} */ (parsed);
      }
    } catch {
      descriptor = null;
    }
  }

  const op = trimParam(params.get('op'));
  const navMode = trimParam(params.get('nav'));

  return {
    leftOrgId,
    rightOrgId,
    itemType,
    itemKey,
    fileName,
    descriptor,
    op,
    navMode
  };
}

/** @param {string | null} v */
function trimParam(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * @param {import('../core/state.js').state} appState
 * @returns {URLSearchParams}
 */
export function buildCompareSearchParamsFromState(appState) {
  const p = new URLSearchParams();
  if (appState.leftOrgId) p.set('left', String(appState.leftOrgId));
  if (appState.rightOrgId) p.set('right', String(appState.rightOrgId));

  const item = appState.selectedItem;
  if (item?.type && item?.key != null && item.key !== '') {
    p.set('type', String(item.type));
    p.set('key', String(item.key));
    if (item.fileName) p.set('fileName', String(item.fileName));
    if (item.descriptor && typeof item.descriptor === 'object') {
      try {
        p.set('descriptor', JSON.stringify(item.descriptor));
      } catch {
        /* ignore */
      }
    }
  }

  const typeSelect = typeof document !== 'undefined' ? document.getElementById('typeSelect') : null;
  const op = typeSelect?.value || appState.selectedArtifactType || '';
  if (op) p.set('op', op);

  if (appState.appNavMode && appState.appNavMode !== 'home') {
    p.set('nav', appState.appNavMode);
  }

  return p;
}

/**
 * URL absoluta del comparador con el estado actual (para compartir).
 * @param {import('../core/state.js').state} appState
 */
export function buildComparePageUrl(appState) {
  const base =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('code/code.html')
      : typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : 'code/code.html';
  const q = buildCompareSearchParamsFromState(appState).toString();
  return q ? `${base}?${q}` : base;
}

/** Actualiza la barra de direcciones sin recargar (replaceState). */
export function syncCompareUrlFromState(appState) {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const q = buildCompareSearchParamsFromState(appState).toString();
  const path = window.location.pathname || '';
  const next = q ? `${path}?${q}` : path;
  const current = `${path}${window.location.search || ''}`;
  if (current !== next) {
    window.history.replaceState(null, '', next);
  }
}

/**
 * @param {{
 *   leftOrgId?: string | null,
 *   rightOrgId?: string | null,
 *   itemType?: string | null,
 *   itemKey?: string | null,
 *   fileName?: string | null,
 *   descriptor?: Record<string, unknown> | null
 * }} parsed
 * @param {typeof import('../core/state.js').state} appState
 * @param {Array<{ type: string, key: string, fileName?: string, descriptor?: Record<string, unknown> }>} savedItems
 * @param {{ select?: boolean }} [options] — si `select` es false, solo asegura el ítem en la lista (sin abrir en Monaco).
 * @returns {{ item: object | null, added: boolean }}
 */
export function resolveItemFromDeepLink(parsed, appState, savedItems, options = {}) {
  const select = options.select !== false;
  const { itemType, itemKey, fileName, descriptor } = parsed;
  if (!itemType || !itemKey) return { item: null, added: false };

  let target = (savedItems || []).find((saved) => {
    if (saved.type !== itemType || saved.key !== itemKey) return false;
    if (fileName && saved.fileName && saved.fileName !== fileName) return false;
    return true;
  });

  let added = false;
  if (!target) {
    const baseName = itemKey.includes('/') ? itemKey.split('/')[0] : itemKey;
    target = {
      type: itemType,
      key: itemKey,
      fileName: fileName || undefined,
      descriptor: descriptor || { name: baseName }
    };
    savedItems.push(target);
    added = true;
  } else {
    if (fileName && !target.fileName) target.fileName = fileName;
    if (descriptor && !target.descriptor) target.descriptor = descriptor;
  }

  if (select) {
    appState.selectedItem = target;
  }
  return { item: target, added };
}
