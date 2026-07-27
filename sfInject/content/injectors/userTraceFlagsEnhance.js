import { sfInjectT } from '../../lib/strings.js';
import { isApexDebugLogsInjectPage } from '../matchers/debugLogPages.js';
import {
  detectClassicDateOrder,
  formatClassicDateTime,
  parseClassicDateTimeMs
} from '../matchers/classicDateTime.js';
import {
  extendUserTraceFlag,
  fetchUserTraceFlags,
  saveSfInjectPrefsRemote
} from '../bridge.js';
import { showInjectToast } from '../ui.js';
import { createSfocActionLink, findInjectedForLog } from './dom.js';
import {
  INTEGRATION_ID,
  appendSyntheticTraceRows,
  clearSyntheticTraceRows,
  createSyntheticTraceRow,
  ensureExpiredBadge,
  ensureFilterCheckbox,
  extractTraceFlagIdFromRow,
  extractUserIdFromRow,
  findExpirationColumnIndex,
  findTraceActionsHost,
  findUserTraceFlagRows,
  findUserTraceFlagsTable,
  isUserTraceFlagsDocument,
  normalizeTraceFlagId,
  readRowCellText,
  removeExpiredBadge,
  restoreAllUserTraceFlagRows,
  setRowFilteredHidden,
  setUserTraceFlagsPagerHidden,
  stampRowTraceId
} from './userTraceFlagsEnhanceDom.js';
import {
  USER_DEBUG_TRACE_RECENTLY_INACTIVE_MS,
  canExtendOrReactivateUserDebugTrace,
  isUserDebugTraceActive,
  isUserDebugTraceRecentlyInactive,
  isUserDebugTraceVisibleByDefault
} from '../../../shared/userDebugTraceFlagStatus.js';

/** @typedef {{ orgId: string, lang: string, prefs?: { userTraceFlagsActiveOnly?: boolean }, onError?: (msg: string) => void }} InjectCtx */

let extending = false;
let injectInFlight = false;
/** @type {Promise<{ byId: Map<string, Record<string, unknown>>, byEntity: Map<string, Record<string, unknown>>, list: Record<string, unknown>[], ok: boolean, error?: string } | null> | null} */
let tracesCatalogPromise = null;
/** Preferencia local (default: filtro inactivo). */
let activeOnlyFilter = false;
let catalogErrorToasted = false;

/**
 * @param {InjectCtx} ctx
 */
function readActiveOnlyPref(ctx) {
  if (ctx.prefs && typeof ctx.prefs.userTraceFlagsActiveOnly === 'boolean') {
    return ctx.prefs.userTraceFlagsActiveOnly;
  }
  return false;
}

/**
 * @param {string} orgId
 */
function fetchTracesCached(orgId) {
  if (!tracesCatalogPromise) {
    tracesCatalogPromise = fetchUserTraceFlags(orgId)
      .then((res) => {
        /** @type {Map<string, Record<string, unknown>>} */
        const byId = new Map();
        /** @type {Map<string, Record<string, unknown>>} */
        const byEntity = new Map();
        /** @type {Record<string, unknown>[]} */
        const list = [];
        if (!res?.ok) {
          return { byId, byEntity, list, ok: false, error: res?.error || res?.reason || 'error' };
        }
        if (Array.isArray(res.traces)) {
          for (const t of res.traces) {
            const id = normalizeTraceFlagId(String(t?.id || '')) || String(t?.id || '').slice(0, 15);
            const entity = String(t?.tracedEntityId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 15);
            if (id) {
              byId.set(id, t);
              list.push(t);
            }
            if (entity) byEntity.set(entity, t);
          }
        }
        return { byId, byEntity, list, ok: true };
      })
      .catch((e) => ({
        byId: new Map(),
        byEntity: new Map(),
        list: [],
        ok: false,
        error: e?.message || String(e)
      }));
  }
  return tracesCatalogPromise;
}

/**
 * @param {Element} row
 * @param {{ byId: Map<string, Record<string, unknown>>, byEntity: Map<string, Record<string, unknown>> }} catalog
 * @returns {Record<string, unknown> | null}
 */
function matchTraceForRow(row, catalog) {
  const traceId = extractTraceFlagIdFromRow(row);
  if (traceId && catalog.byId.has(traceId)) {
    const t = catalog.byId.get(traceId) || null;
    if (t) stampRowTraceId(row, String(t.id || traceId).slice(0, 15));
    return t;
  }
  const userId = extractUserIdFromRow(row);
  if (userId && catalog.byEntity.has(userId)) {
    const t = catalog.byEntity.get(userId) || null;
    if (t?.id) stampRowTraceId(row, String(t.id).slice(0, 15));
    return t;
  }
  return null;
}

/**
 * @param {Element[]} rows
 * @param {number} expCol
 * @returns {'dmy' | 'mdy'}
 */
function detectDateOrderFromRows(rows, expCol) {
  return detectClassicDateOrder(rows.map((row) => readRowCellText(row, expCol)));
}

/**
 * Estado de la fila: prioriza fechas ISO de la API; si no hay match, usa la celda DOM.
 * @param {Element} row
 * @param {number} expCol
 * @param {'dmy' | 'mdy'} dateOrder
 * @param {number} nowMs
 * @param {Record<string, unknown> | null} [trace]
 * @returns {{ known: boolean, visible: boolean, recentlyExpired: boolean }}
 */
export function resolveRowFilterState(row, expCol, dateOrder, nowMs, trace = null) {
  if (trace) {
    const visible = isUserDebugTraceVisibleByDefault(trace, nowMs);
    const recentlyExpired =
      isUserDebugTraceRecentlyInactive(trace, nowMs) && !isUserDebugTraceActive(trace, nowMs);
    return { known: true, visible, recentlyExpired };
  }

  const expMs = parseClassicDateTimeMs(readRowCellText(row, expCol), dateOrder);
  if (!Number.isFinite(expMs)) {
    return { known: false, visible: true, recentlyExpired: false };
  }
  const expired = expMs <= nowMs;
  const recentlyExpired = expired && nowMs - expMs <= USER_DEBUG_TRACE_RECENTLY_INACTIVE_MS;
  return { known: true, visible: !expired || recentlyExpired, recentlyExpired };
}

/**
 * @param {InjectCtx} ctx
 * @param {Record<string, unknown>} trace
 */
async function handleExtend(ctx, trace) {
  if (extending || !ctx.orgId || !trace?.id) return;
  if (!canExtendOrReactivateUserDebugTrace(trace)) {
    showInjectToast(sfInjectT(ctx.lang, 'sfInject.userTraceFlags.extendMaxWindow'), true);
    return;
  }
  extending = true;
  const recentlyInactive = isUserDebugTraceRecentlyInactive(trace);
  showInjectToast(sfInjectT(ctx.lang, 'sfInject.userTraceFlags.extending'));
  try {
    const res = await extendUserTraceFlag({
      orgId: ctx.orgId,
      traceFlagId: String(trace.id),
      allowReactivate: recentlyInactive,
      startIso: String(trace.startIso || ''),
      expirationIso: String(trace.expirationIso || '')
    });
    if (!res?.ok) {
      const msg =
        res?.reason === 'NO_SID'
          ? sfInjectT(ctx.lang, 'sfInject.userTraceFlags.errorNoSession')
          : res?.reason === 'ORG_NOT_SAVED'
            ? sfInjectT(ctx.lang, 'sfInject.userTraceFlags.errorOrgNotSaved')
            : res?.error?.includes('24 hour') || res?.error?.includes('24 hours')
              ? sfInjectT(ctx.lang, 'sfInject.userTraceFlags.extendMaxWindow')
              : res?.error || sfInjectT(ctx.lang, 'sfInject.userTraceFlags.extendError');
      showInjectToast(msg, true);
      return;
    }
    showInjectToast(
      sfInjectT(
        ctx.lang,
        res.reactivated
          ? 'sfInject.userTraceFlags.reactivateOk'
          : 'sfInject.userTraceFlags.extendOk'
      )
    );
    try {
      location.reload();
    } catch {
      /* ignore */
    }
  } finally {
    extending = false;
  }
}

/**
 * @param {Element} row
 * @param {InjectCtx} ctx
 * @param {Record<string, unknown>} trace
 */
function injectExtendLink(row, ctx, trace) {
  const subKey = 'extend-link';
  const traceId = normalizeTraceFlagId(String(trace.id || '')) || String(trace.id || '').slice(0, 15);
  if (!traceId) return;
  const ownerDoc = row.ownerDocument || document;
  if (findInjectedForLog(ownerDoc, INTEGRATION_ID, subKey, traceId)) return;
  if (!canExtendOrReactivateUserDebugTrace(trace)) return;

  const host = findTraceActionsHost(row);
  if (!host) return;

  const recentlyInactive = isUserDebugTraceRecentlyInactive(trace);
  const labelKey = recentlyInactive
    ? 'sfInject.userTraceFlags.reactivate'
    : 'sfInject.userTraceFlags.extend';
  const ariaKey = recentlyInactive
    ? 'sfInject.userTraceFlags.ariaReactivate'
    : 'sfInject.userTraceFlags.ariaExtend';

  const templateLink = host.querySelector('a.actionLink, a.link-button, a.slds-text-link, a');
  const link = createSfocActionLink({
    ownerDoc,
    label: sfInjectT(ctx.lang, labelKey),
    ariaLabel: sfInjectT(ctx.lang, ariaKey),
    onClick: () => void handleExtend(ctx, trace),
    integrationId: INTEGRATION_ID,
    subKey,
    logId: traceId,
    templateLink: templateLink || undefined
  });

  host.appendChild(ownerDoc.createTextNode(' | '));
  host.appendChild(link);
}

/**
 * Vista filtrada completa vía Tooling API (sin depender de la paginación Classic).
 * @param {Document} doc
 * @param {InjectCtx} ctx
 * @param {{ list: Record<string, unknown>[] }} catalog
 * @param {number} nowMs
 */
function renderApiFilteredView(doc, ctx, catalog, nowMs) {
  const table = findUserTraceFlagsTable(doc);
  if (!table) return;

  const expCol = findExpirationColumnIndex(table);
  // Formato de fecha = el de la página Classic (no el idioma de la extensión).
  const nativeRows = findUserTraceFlagRows(doc).filter(
    (r) => !r.hasAttribute?.('data-sfoc-utf-synthetic')
  );
  const dateOrder = detectDateOrderFromRows(nativeRows, expCol);

  const visible = catalog.list
    .filter((t) => isUserDebugTraceVisibleByDefault(t, nowMs))
    .sort((a, b) => String(a.tracedEntityName || '').localeCompare(String(b.tracedEntityName || '')));

  // Ocultar TODAS las filas nativas (pueden estar en otras páginas del listado).
  for (const row of nativeRows) {
    setRowFilteredHidden(row, true);
    removeExpiredBadge(row);
  }

  clearSyntheticTraceRows(doc);
  setUserTraceFlagsPagerHidden(doc, true);

  const synthRows = visible.map((trace, index) => {
    const id = normalizeTraceFlagId(String(trace.id || '')) || String(trace.id || '').slice(0, 15);
    const row = createSyntheticTraceRow(doc, {
      id,
      name: String(trace.tracedEntityName || trace.tracedEntityId || id),
      startText: formatClassicDateTime(String(trace.startIso || ''), dateOrder),
      expirationText: formatClassicDateTime(String(trace.expirationIso || ''), dateOrder),
      logType: String(trace.logType || 'USER_DEBUG'),
      debugLevel: String(trace.debugLevelLabel || trace.debugLevelDeveloperName || ''),
      even: index % 2 === 0
    });
    return { row, trace };
  });

  appendSyntheticTraceRows(
    table,
    synthRows.map((x) => x.row)
  );

  for (const { row, trace } of synthRows) {
    if (isUserDebugTraceRecentlyInactive(trace, nowMs) && !isUserDebugTraceActive(trace, nowMs)) {
      ensureExpiredBadge(row, sfInjectT(ctx.lang, 'sfInject.userTraceFlags.badgeExpired'), expCol);
    }
    injectExtendLink(row, ctx, trace);
  }
}

/**
 * Fallback: filtrar solo las filas de la página actual (sin catálogo API).
 * @param {Document} doc
 * @param {InjectCtx} ctx
 * @param {number} nowMs
 */
function applyDomOnlyFilter(doc, ctx, nowMs) {
  const table = findUserTraceFlagsTable(doc);
  if (!table) return;
  const expCol = findExpirationColumnIndex(table);
  const rows = findUserTraceFlagRows(doc).filter((r) => !r.hasAttribute?.('data-sfoc-utf-synthetic'));
  const dateOrder = detectDateOrderFromRows(rows, expCol);
  const filterOn = activeOnlyFilter;

  clearSyntheticTraceRows(doc);
  setUserTraceFlagsPagerHidden(doc, filterOn);

  for (const row of rows) {
    const state = resolveRowFilterState(row, expCol, dateOrder, nowMs, null);
    const hide = filterOn && state.known && !state.visible;
    setRowFilteredHidden(row, hide);
    if (!hide && state.recentlyExpired) {
      ensureExpiredBadge(row, sfInjectT(ctx.lang, 'sfInject.userTraceFlags.badgeExpired'), expCol);
    } else {
      removeExpiredBadge(row);
    }
  }
}

/**
 * @param {Document} doc
 * @param {InjectCtx} ctx
 * @param {{ byId: Map<string, Record<string, unknown>>, byEntity: Map<string, Record<string, unknown>>, list?: Record<string, unknown>[], ok: boolean, error?: string } | null} catalog
 */
export function applyFilterAndBadges(doc, ctx, catalog) {
  const nowMs = Date.now();

  if (!activeOnlyFilter) {
    clearSyntheticTraceRows(doc);
    setUserTraceFlagsPagerHidden(doc, false);
    restoreAllUserTraceFlagRows(doc);
    const table = findUserTraceFlagsTable(doc);
    if (!table || !catalog) return;
    const expCol = findExpirationColumnIndex(table);
    const rows = findUserTraceFlagRows(doc);
    const dateOrder = detectDateOrderFromRows(rows, expCol);
    for (const row of rows) {
      const trace = matchTraceForRow(row, catalog);
      const state = resolveRowFilterState(row, expCol, dateOrder, nowMs, trace);
      if (state.recentlyExpired) {
        ensureExpiredBadge(row, sfInjectT(ctx.lang, 'sfInject.userTraceFlags.badgeExpired'), expCol);
      } else {
        removeExpiredBadge(row);
      }
      if (trace) injectExtendLink(row, ctx, trace);
    }
    return;
  }

  // Filtro ON: vista completa desde API (todas las activas/recientes, sin paginación).
  if (catalog?.ok && Array.isArray(catalog.list)) {
    renderApiFilteredView(doc, ctx, { list: catalog.list }, nowMs);
    return;
  }

  applyDomOnlyFilter(doc, ctx, nowMs);
}

/**
 * @param {Document} doc
 * @param {InjectCtx} ctx
 */
export async function injectUserTraceFlagsEnhance(doc, ctx) {
  if (injectInFlight) return;
  injectInFlight = true;
  try {
    if (!isUserTraceFlagsDocument(doc)) return;

    restoreAllUserTraceFlagRows(doc);

    ensureFilterCheckbox(
      doc,
      sfInjectT(ctx.lang, 'sfInject.userTraceFlags.filterLabel'),
      activeOnlyFilter,
      (next) => {
        activeOnlyFilter = next;
        // Restaurar/ocultar paginación al instante (no esperar a la API).
        if (!next) {
          clearSyntheticTraceRows(doc);
          setUserTraceFlagsPagerHidden(doc, false);
          restoreAllUserTraceFlagRows(doc);
        }
        void saveSfInjectPrefsRemote({ userTraceFlagsActiveOnly: next }).then((res) => {
          if (!res?.ok) {
            ctx.onError?.(sfInjectT(ctx.lang, 'sfInject.userTraceFlags.extendError'));
          }
        });
        void fetchTracesCached(ctx.orgId).then((catalog) => {
          applyFilterAndBadges(doc, ctx, catalog);
        });
      }
    );

    // Sin catálogo aún: si el filtro está off, deja la tabla nativa; si está on, espera API.
    if (!activeOnlyFilter) {
      applyFilterAndBadges(doc, ctx, null);
    }

    const catalog = await fetchTracesCached(ctx.orgId);
    if (catalog && !catalog.ok && !catalogErrorToasted) {
      catalogErrorToasted = true;
      const msg =
        catalog.error === 'NO_SID'
          ? sfInjectT(ctx.lang, 'sfInject.userTraceFlags.errorNoSession')
          : catalog.error === 'ORG_NOT_SAVED'
            ? sfInjectT(ctx.lang, 'sfInject.userTraceFlags.errorOrgNotSaved')
            : sfInjectT(ctx.lang, 'sfInject.userTraceFlags.extendError');
      showInjectToast(msg, true);
    }
    applyFilterAndBadges(doc, ctx, catalog);

    if (doc.documentElement) {
      doc.documentElement.setAttribute('data-sfoc-inject-status', 'active');
    }
  } finally {
    injectInFlight = false;
  }
}

/**
 * @param {Document} doc
 * @param {InjectCtx} ctx
 * @returns {() => void}
 */
export function mountUserTraceFlagsEnhance(doc, ctx) {
  tracesCatalogPromise = null;
  catalogErrorToasted = false;
  activeOnlyFilter = readActiveOnlyPref(ctx);
  void injectUserTraceFlagsEnhance(doc, ctx).catch(() => {});
  return () => {};
}

function isParentDebugLogsHomePage() {
  try {
    return isApexDebugLogsInjectPage(window.top.location.href);
  } catch {
    return isApexDebugLogsInjectPage(location.href);
  }
}

/** Integración registrada para el host genérico. */
export const userTraceFlagsEnhanceIntegration = {
  id: INTEGRATION_ID,
  isParentPageActive: isParentDebugLogsHomePage,
  isFrameRelevant: isUserTraceFlagsDocument,
  mount(doc, ctx) {
    return mountUserTraceFlagsEnhance(doc, ctx);
  },
  retryInject(doc, ctx) {
    if (isUserTraceFlagsDocument(doc)) {
      void injectUserTraceFlagsEnhance(doc, ctx);
    }
  }
};
