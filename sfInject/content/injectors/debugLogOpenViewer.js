import { sfInjectT } from '../../lib/strings.js';
import { isApexDebugLogsInjectPage } from '../matchers/debugLogPages.js';
import { fetchDebugLogCatalog, openApexLogInViewer } from '../bridge.js';
import { createSfocActionLink, findInjectedForLog } from './dom.js';
import {
  INTEGRATION_ID,
  findDebugLogActionRows,
  findDebugLogActionsHost,
  isDebugLogsTableDocument
} from './debugLogOpenViewerDom.js';
import { resolveDebugLogRowsWithIds } from './debugLogRowResolver.js';
import { mountDebouncedDomObserver } from './observer.js';

/** @typedef {{ orgId: string, lang: string, onError?: (msg: string) => void }} InjectCtx */

let opening = false;
/** Evita solapar inyecciones async. */
let injectInFlight = false;
/** @type {Promise<Array<{ id?: string }> | null> | null} */
let catalogPromise = null;

/**
 * @param {InjectCtx} ctx
 * @param {string} logId
 */
async function handleOpenLog(ctx, logId) {
  if (opening || !ctx.orgId || !logId) return;
  opening = true;
  try {
    const res = await openApexLogInViewer(ctx.orgId, logId);
    if (!res?.ok) {
      const msg =
        res?.reason === 'NO_SID'
          ? sfInjectT(ctx.lang, 'sfInject.debugLogOpenViewer.errorNoSession')
          : res?.reason === 'ORG_NOT_SAVED'
            ? sfInjectT(ctx.lang, 'sfInject.debugLogOpenViewer.errorOrgNotSaved')
            : res?.error || sfInjectT(ctx.lang, 'sfInject.debugLogOpenViewer.errorOpen');
      ctx.onError?.(msg);
    }
  } finally {
    opening = false;
  }
}

/**
 * Catálogo API cacheado por sesión de página (una sola llamada).
 * @param {string} orgId
 */
function fetchCatalogCached(orgId) {
  if (!catalogPromise) {
    catalogPromise = fetchDebugLogCatalog(orgId)
      .then((res) => (res?.ok && Array.isArray(res.logs) ? res.logs : []))
      .catch(() => []);
  }
  return catalogPromise.then((logs) => ({ ok: true, logs: logs || [] }));
}

/**
 * @param {Element} row
 * @param {InjectCtx} ctx
 * @param {string} logId
 */
function injectRowActionLink(row, ctx, logId) {
  const subKey = 'row-link';
  const ownerDoc = row.ownerDocument || document;
  if (findInjectedForLog(ownerDoc, INTEGRATION_ID, subKey, logId)) return;

  const host = findDebugLogActionsHost(row);
  if (!host) return;

  const templateLink = host.querySelector('a.actionLink, a.link-button, a.slds-text-link');
  const link = createSfocActionLink({
    ownerDoc,
    label: sfInjectT(ctx.lang, 'sfInject.debugLogOpenViewer.button'),
    ariaLabel: sfInjectT(ctx.lang, 'sfInject.debugLogOpenViewer.ariaOpen'),
    onClick: () => void handleOpenLog(ctx, logId),
    integrationId: INTEGRATION_ID,
    subKey,
    logId,
    templateLink: templateLink || undefined
  });

  host.appendChild(ownerDoc.createTextNode(' | '));
  host.appendChild(link);
}

/**
 * @param {Document} doc
 * @param {InjectCtx} ctx
 */
export async function injectDebugLogOpenViewer(doc, ctx) {
  if (injectInFlight) return;
  injectInFlight = true;
  try {
    const rows = await resolveDebugLogRowsWithIds(doc, ctx.orgId, fetchCatalogCached);
    for (const { row, logId } of rows) {
      injectRowActionLink(row, ctx, logId);
    }
    if (rows.length && doc.documentElement) {
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
export function mountDebugLogOpenViewer(doc, ctx) {
  catalogPromise = null;
  return mountDebouncedDomObserver(
    doc,
    () => {
      void injectDebugLogOpenViewer(doc, ctx).catch(() => {});
    },
    { debounceMs: 400 }
  );
}

function isParentDebugLogsHomePage() {
  try {
    return isApexDebugLogsInjectPage(window.top.location.href);
  } catch {
    return isApexDebugLogsInjectPage(location.href);
  }
}

/** Integración registrada para el host genérico. */
export const debugLogOpenViewerIntegration = {
  id: INTEGRATION_ID,
  isParentPageActive: isParentDebugLogsHomePage,
  isFrameRelevant: isDebugLogsTableDocument,
  mount(doc, ctx) {
    return mountDebugLogOpenViewer(doc, ctx);
  },
  retryInject(doc, ctx) {
    if (findDebugLogActionRows(doc).length > 0) {
      void injectDebugLogOpenViewer(doc, ctx);
    }
  }
};
