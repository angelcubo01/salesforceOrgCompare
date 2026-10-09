import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { escapeHtml } from '../../shared/htmlEscape.js';
import { stageDataForImport } from '../../shared/dataTransfer.js';
import {
  applyTabulatorTheme,
  disposeTabulatorTheme,
  styleTabulatorRow
} from './tabulatorTheme.js';
import { applyArtifactTypeUi, getSelectedArtifactType } from './artifactTypeUi.js';
import { navigateToModeAndTool } from './appModeNav.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { showToast } from './toast.js';
import { handleToolError } from '../../shared/reportToolError.js';
import { bindRunShortcut } from './runShortcut.js';
import { confirmSfocToolAction, mountSfocOverlay, unmountSfocOverlay } from './sfocModal.js';

function reportQueryExplorerError(e) {
  // Los errores devueltos al ejecutar SOQL/SOSL forman parte del resultado de
  // la consulta (sintaxis, permisos, campos inexistentes, etc.), no son fallos
  // de la extensión y no deben convertirse en $exception de PostHog.
  if (e && typeof e === 'object' && e.queryExecutionError === true) return;
  const code = e && typeof e === 'object' && e.salesforceErrorCode ? String(e.salesforceErrorCode).trim() : '';
  void handleToolError(e, {
    artifact_type: 'QueryExplorer',
    phase: 'query',
    reason: code || undefined
  });
}

function createQueryExecutionError(message, errorCode = '') {
  const error = new Error(message);
  error.queryExecutionError = true;
  if (errorCode) error.salesforceErrorCode = String(errorCode);
  return error;
}
import {
  ensureQueryExplorerEditor,
  getQueryExplorerQueryText,
  getQueryExplorerEditorRawText,
  setQueryExplorerEditorValue,
  invalidateQueryExplorerSchemaCache,
  syncQueryExplorerEditorLanguage,
  applyQueryExplorerEditorHeight
} from './queryExplorerMonaco.js';
import { parseQueryExplorerDeepLink } from '../../shared/queryExplorerBuilder.js';

const QUERY_EXPLORER_SAVED_KEY = 'sfoc_query_explorer_saved_queries';
let selectedSavedQueryId = '';

let lastQueryExplorerSchemaOrgId = null;
let appliedQueryExplorerUrl = false;
let tabulatorPromise = null;
const flattenedRowCache = new WeakMap();
const formattedObjectCache = new WeakMap();
const filterValueCache = new WeakMap();
const filterNeedleCache = new Map();
/** @type {{ cancelled: boolean, startedAt: number, hasResults: boolean, runId: string } | null} */
let activeQueryRun = null;
let queryCompareMatchField = 'auto';

function queryClockNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function formatQueryDuration(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  if (safeMs < 1000) return `${Math.round(safeMs)} ms`;
  if (safeMs < 60000) return `${(safeMs / 1000).toFixed(1)} s`;
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.round((safeMs % 60000) / 1000);
  return `${minutes} min ${seconds} s`;
}

function loadTabulator() {
  if (!tabulatorPromise) {
    tabulatorPromise = import('../../vendor/tabulator/tabulator_esm.min.js')
      .then(({ TabulatorFull }) => TabulatorFull);
  }
  return tabulatorPromise;
}

/** @typedef {{ records: unknown[], totalSize?: number, nextPath: string | null }} Snapshot */

/** @param {unknown} snap */
function snapshotFromRunResponse(snap) {
  return {
    records: Array.isArray(snap?.records) ? snap.records : [],
    totalSize: typeof snap?.totalSize === 'number' ? snap.totalSize : undefined,
    nextPath: snap?.nextPath != null && snap.nextPath !== '' ? String(snap.nextPath) : null
  };
}

/** Acumula los lotes de Salesforce que se muestran en la misma tabla. */
export class ExplorerPageNav {
  constructor() {
    /** @type {Snapshot | null} */
    this.current = null;
    this.loadingAll = false;
    this.batchCount = 0;
    this.startedAt = 0;
    this.finishedAt = 0;
  }

  beginRun(startedAt = queryClockNow()) {
    this.current = null;
    this.loadingAll = false;
    this.batchCount = 0;
    this.startedAt = startedAt;
    this.finishedAt = 0;
  }

  finishRun() {
    this.finishedAt = queryClockNow();
  }

  resetFromResponse(resp) {
    this.current = snapshotFromRunResponse(resp);
    this.batchCount = 1;
  }

  /** Añade un lote Salesforce a los resultados que se están mostrando. */
  appendResponse(resp) {
    const next = snapshotFromRunResponse(resp);
    this.batchCount += 1;
    if (!this.current) {
      this.current = next;
      return;
    }
    this.current.records.push(...next.records);
    if (typeof next.totalSize === 'number') this.current.totalSize = next.totalSize;
    this.current.nextPath = next.nextPath;
  }

  /**
   * Sigue todas las páginas de Salesforce, igual que Data Export. La página
   * siguiente se solicita mientras la UI agrupa el lote recién recibido.
   * @param {(path: string) => Promise<{ ok?: boolean, reason?: string, error?: string, records?: unknown[], totalSize?: number, nextPath?: string | null }>} fetchPage
   * @param {() => void} [onBatch]
   */
  async loadAll(fetchPage, onBatch, shouldContinue) {
    this.loadingAll = true;
    const visited = new Set();
    try {
      let path = this.current?.nextPath || null;
      let pendingPage = null;
      const startFetch = (nextPath) => {
        if (!nextPath) return null;
        if (visited.has(nextPath)) throw createQueryExecutionError(t('queryExplorer.runError'));
        visited.add(nextPath);
        const promise = Promise.resolve(fetchPage(nextPath));
        // Marca el rechazo como observado mientras el pintado del lote previo
        // termina; se vuelve a propagar al hacer await en la iteración siguiente.
        promise.catch(() => {});
        return promise;
      };
      pendingPage = startFetch(path);
      while (path && pendingPage) {
        if (shouldContinue?.() === false) return;
        const next = await pendingPage;
        if (shouldContinue?.() === false) return;
        if (!next?.ok) {
          const err = next?.reason === 'NO_SID'
            ? t('queryExplorer.noSid')
            : next?.error || t('queryExplorer.runError');
          throw createQueryExecutionError(err, next?.errorCode);
        }
        const startIndex = this.getRows().length;
        this.appendResponse(next);
        path = this.current?.nextPath || null;
        pendingPage = shouldContinue?.() === false ? null : startFetch(path);
        await onBatch?.(next.records, startIndex);
      }
    } finally {
      this.loadingAll = false;
    }
  }

  getRows() {
    return this.current?.records || [];
  }

  metaLine() {
    const n = this.getRows().length;
    const tot = this.current?.totalSize;
    if (this.batchCount > 0 && this.startedAt > 0) {
      const duration = formatQueryDuration((this.finishedAt || queryClockNow()) - this.startedAt);
      if (typeof tot === 'number') {
        return t('queryExplorer.completedMetrics', {
          rows: String(n), total: String(tot), batches: String(this.batchCount), duration
        });
      }
      return t('queryExplorer.completedMetricsRows', {
        rows: String(n), batches: String(this.batchCount), duration
      });
    }
    if (typeof tot === 'number')
      return t('queryExplorer.pageMeta', { rows: String(n), total: String(tot) });
    return t('queryExplorer.pageMetaRows', { rows: String(n) });
  }

  progressLine() {
    const n = this.getRows().length;
    const tot = this.current?.totalSize;
    const duration = formatQueryDuration(queryClockNow() - (this.startedAt || queryClockNow()));
    if (typeof tot === 'number') {
      return t('queryExplorer.loadingMetrics', {
        rows: String(n), total: String(tot), batches: String(this.batchCount), duration
      });
    }
    return t('queryExplorer.loadingMetricsRows', {
      rows: String(n), batches: String(this.batchCount), duration
    });
  }

}

/** @type {ExplorerPageNav} */
const navSingle = new ExplorerPageNav();
/** @type {ExplorerPageNav} */
const navLeft = new ExplorerPageNav();
/** @type {ExplorerPageNav} */
const navRight = new ExplorerPageNav();
const queryTables = new Map();

// El contador sigue avanzando por cada respuesta, pero varias páginas REST
// comparten una única mutación para no invalidar continuamente el viewport.
const TABLE_APPEND_FLUSH_MS = 1500;
const TABLE_SCROLL_IDLE_MS = 300;
const TABLE_APPEND_CHUNK_ROWS = 600;

function disposeIncrementalAppend(table) {
  const appendState = table?.__sfocAppendState;
  if (!appendState) return;
  appendState.disposed = true;
  appendState.pending.length = 0;
  if (appendState.flushTimer) clearTimeout(appendState.flushTimer);
  if (appendState.scrollTimer) clearTimeout(appendState.scrollTimer);
  appendState.holder?.removeEventListener?.('scroll', appendState.onInteraction);
  for (const eventName of appendState.interactionEvents || []) {
    appendState.root?.removeEventListener?.(eventName, appendState.onInteraction);
  }
  appendState.ownerDocument?.removeEventListener?.('pointerup', appendState.onPointerEnd, true);
  appendState.ownerDocument?.removeEventListener?.('pointercancel', appendState.onPointerEnd, true);
  appendState.ownerDocument?.removeEventListener?.('touchend', appendState.onTouchEnd, true);
  appendState.ownerDocument?.removeEventListener?.('touchcancel', appendState.onTouchEnd, true);
  appendState.ownerWindow?.removeEventListener?.('pointerup', appendState.onPointerEnd, true);
  appendState.ownerWindow?.removeEventListener?.('pointercancel', appendState.onPointerEnd, true);
  appendState.ownerWindow?.removeEventListener?.('blur', appendState.onWindowBlur);
  table.off?.('dataFiltering', appendState.onDataFiltering);
  table.off?.('dataFiltered', appendState.onDataFiltered);
  for (const resolve of appendState.idleWaiters || []) resolve();
  delete table.__sfocAppendState;
}

function destroyQueryTable(mount) {
  if (!mount) return;
  const table = queryTables.get(mount.id);
  if (table) {
    disposeIncrementalAppend(table);
    disposeTabulatorTheme(table);
    table.off?.('renderComplete', table.__sfocOnRenderComplete);
    table.off?.('dataSorted', table.__sfocOnDataSorted);
    table.__sfocResolveReady?.();
    table.destroy();
  }
  queryTables.delete(mount.id);
  delete mount.dataset.tabulatorRenderToken;
  mount.innerHTML = '';
}

function activeResultMounts() {
  if (state.queryExplorerCompareMode) {
    return [
      document.getElementById('queryExplorerLeftTableMount'),
      document.getElementById('queryExplorerRightTableMount')
    ];
  }
  return [document.getElementById('queryExplorerSingleTableMount')];
}

function renderQueryResultState(kind, message = '') {
  activeResultMounts().forEach((mount) => {
    if (!mount) return;
    destroyQueryTable(mount);
    const stateEl = document.createElement('div');
    stateEl.className = `query-explorer-result-state query-explorer-result-state--${kind}`;
    if (kind === 'loading') {
      const spinner = document.createElement('span');
      spinner.className = 'query-explorer-result-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      stateEl.appendChild(spinner);
    }
    const text = document.createElement('p');
    text.textContent = message || t(kind === 'loading' ? 'queryExplorer.loadingTable' : 'queryExplorer.runError');
    stateEl.appendChild(text);
    if (kind === 'loading') {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'query-explorer-secondary-btn query-explorer-cancel-btn';
      cancel.textContent = t('queryExplorer.cancelLoading');
      cancel.addEventListener('click', cancelActiveQueryRun);
      stateEl.appendChild(cancel);
    }
    mount.appendChild(stateEl);
  });
}

async function cancelActiveQueryRun() {
  if (!activeQueryRun) return;
  const run = activeQueryRun;
  run.cancelled = true;
  activeQueryRun = null;
  void bg({ type: 'queryExplorer:cancel', runId: run.runId });
  setRunButtonBusy(false);
  const status = document.getElementById('queryExplorerStatus');
  if (status) status.textContent = t('queryExplorer.loadingCancelled');
  if (!run.hasResults) {
    clearResultLoadingStates(true);
    renderQueryResultState('cancelled', t('queryExplorer.loadingCancelled'));
    return;
  }
  const targets = state.queryExplorerCompareMode
    ? [[navLeft, renderers.left, 'left'], [navRight, renderers.right, 'right']]
    : [[navSingle, renderers.single, 'single']];
  try {
    await Promise.all(targets.map(async ([nav, renderer]) => {
      await renderer?.flushLocal?.();
      nav.finishRun();
    }));
  } catch {
    targets.forEach(([nav]) => nav.finishRun());
  } finally {
    clearResultLoadingStates();
    targets.forEach(([nav, , side]) => setResultLoadingState(side, nav, false));
  }
}

function beginQueryRun() {
  if (activeQueryRun) activeQueryRun.cancelled = true;
  const runId = globalThis.crypto?.randomUUID?.()
    || `query-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const run = { cancelled: false, startedAt: queryClockNow(), hasResults: false, runId };
  activeQueryRun = run;
  setRunButtonBusy(true);
  clearResultLoadingStates(true);
  renderQueryResultState('loading', t('queryExplorer.loadingTable'));
  return run;
}

function setRunButtonBusy(busy) {
  const button = document.getElementById('queryExplorerRunBtn');
  if (!button) return;
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
  button.disabled = false;
  button.dataset.allowWhileBusy = busy ? 'true' : 'false';
  button.dataset.workbenchVariant = busy ? 'destructive' : 'primary';
  const key = busy ? 'queryExplorer.stopRun' : 'queryExplorer.run';
  button.dataset.i18n = key;
  button.textContent = t(key);
  button.classList.toggle('sfoc-btn--primary', !busy);
  button.classList.toggle('sfoc-btn--danger', busy);
}

function resultElements(side) {
  const prefix = side === 'left'
    ? 'queryExplorerLeft'
    : side === 'right'
      ? 'queryExplorerRight'
      : 'queryExplorerSingle';
  return {
    meta: document.getElementById(`${prefix}Meta`),
    mount: document.getElementById(`${prefix}TableMount`)
  };
}

function metaElementForTableMount(mount) {
  if (!mount?.id) return null;
  return document.getElementById(mount.id.replace(/TableMount$/, 'Meta'));
}

function querySortSummary(table) {
  const [sorter] = table?.getSorters?.() || [];
  if (!sorter) return null;
  const definition = sorter.column?.getDefinition?.() || {};
  const column = definition.title || definition.field || sorter.field || sorter.column?.getField?.();
  if (!column) return null;
  return {
    column: String(column),
    direction: sorter.dir === 'desc' ? 'desc' : 'asc'
  };
}

function setQueryResultMeta(meta, baseText, table) {
  if (!meta) return;
  meta.__sfocBaseText = String(baseText || '');
  const filter = table?.__sfocFilterSummary;
  const sort = querySortSummary(table);
  const sortingSuffix = sort ? ` · ${t('queryExplorer.sortingMetrics', sort)}` : '';
  const suffix = filter?.active
    ? ` · ${t('queryExplorer.filteringMetrics', {
      filtered: String(filter.filtered),
      total: String(filter.total)
    })}`
    : '';
  meta.textContent = `${meta.__sfocBaseText}${suffix}${sortingSuffix}`;
}

function updateQueryFilterSummary(table, mount) {
  if (!table) return;
  const filters = table.getHeaderFilters?.() || [];
  table.__sfocFilterSummary = {
    active: filters.length > 0,
    filtered: table.getDataCount?.('active') || 0,
    total: table.getDataCount?.() || 0
  };
  const meta = metaElementForTableMount(mount);
  setQueryResultMeta(meta, meta?.__sfocBaseText ?? meta?.textContent ?? '', table);
}

function setResultLoadingState(side, nav, loading) {
  const { meta, mount } = resultElements(side);
  if (meta) {
    setQueryResultMeta(meta, loading ? nav.progressLine() : nav.metaLine(), mount ? queryTables.get(mount.id) : null);
    meta.classList.toggle('is-loading', loading);
  }
  if (mount) {
    mount.classList.toggle('is-streaming', loading);
    mount.setAttribute('aria-busy', loading ? 'true' : 'false');
  }
}

function clearResultLoadingStates(clearMeta = false) {
  for (const side of ['single', 'left', 'right']) {
    const { meta, mount } = resultElements(side);
    meta?.classList.remove('is-loading');
    if (clearMeta && meta) setQueryResultMeta(meta, '', mount ? queryTables.get(mount.id) : null);
    mount?.classList.remove('is-streaming');
    mount?.setAttribute('aria-busy', 'false');
  }
}

function scrollQueryExplorerContentToTop() {
  const content = document.querySelector('#queryExplorerPanel > .query-explorer-panel-inner');
  if (content) content.scrollTop = 0;
}

function isCurrentQueryRun(run) {
  return activeQueryRun === run && !run.cancelled;
}

function getOrgLabel(orgId) {
  const org = (state.orgsList || []).find((o) => o.id === orgId);
  if (!org) return String(orgId || '').trim();
  try {
    return buildOrgPicklistLabel(org);
  } catch {
    return org.label || org.displayName || String(org.id || '');
  }
}

function variantFromControls() {
  const apiSel = /** @type {HTMLSelectElement} */ (document.getElementById('queryExplorerApiSelect'));
  const langSel = /** @type {HTMLSelectElement} */ (document.getElementById('queryExplorerLangSelect'));
  const api = apiSel?.value === 'tooling' ? 'tooling' : 'rest';
  const lang = langSel?.value === 'sosl' ? 'sosl' : 'soql';
  if (api === 'tooling' && lang === 'sosl') return null;
  if (lang === 'sosl') return 'rest-sosl';
  if (api === 'tooling') return 'tooling-soql';
  return 'rest-soql';
}

function syncToolingSoslRule() {
  const apiSel = /** @type {HTMLSelectElement} */ (document.getElementById('queryExplorerApiSelect'));
  const langSel = /** @type {HTMLSelectElement} */ (document.getElementById('queryExplorerLangSelect'));
  const status = document.getElementById('queryExplorerStatus');
  if (!apiSel || !langSel) return;
  const tooling = apiSel.value === 'tooling';
  const soslOpt = langSel.querySelector('option[value="sosl"]');
  if (soslOpt) {
    soslOpt.disabled = tooling;
    if (tooling && langSel.value === 'sosl') langSel.value = 'soql';
  }
  if (tooling && status && !state.queryExplorerCompareMode) {
    status.textContent = '';
  }
}

function formatCell(val) {
  if (val == null) return '';
  if (typeof val === 'object') {
    const cached = formattedObjectCache.get(val);
    if (cached !== undefined) return cached;
    try {
      const formatted = JSON.stringify(deepStripAttributes(val));
      formattedObjectCache.set(val, formatted);
      return formatted;
    } catch {
      return String(val);
    }
  }
  return String(val);
}

/** Quita metadatos REST `attributes` anidados típicos de Salesforce. */
function deepStripAttributes(val) {
  if (val == null) return val;
  if (Array.isArray(val)) return val.map(deepStripAttributes);
  if (typeof val !== 'object') return val;
  /** @type Record<string, unknown> */
  const out = {};
  for (const [k, v] of Object.entries(val)) {
    if (k === 'attributes') continue;
    out[k] = deepStripAttributes(v);
  }
  return out;
}

/**
 * Valores objeto que conviene aplanar como Relación.Campo (no arrays: subconsultas / colecciones).
 * @param {unknown} v
 */
function isFlattenableNestedObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Inserta en `out` claves `prefix.campo` recursivamente para objetos REST de Salesforce.
 * @param {Record<string, unknown>} out
 * @param {string} prefix
 * @param {Record<string, unknown>} obj sin `attributes`
 */
function flattenNestedInto(out, prefix, obj) {
  let added = false;
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'attributes') continue;
    const path = `${prefix}.${k}`;
    if (isFlattenableNestedObject(v)) {
      added = flattenNestedInto(out, path, /** @type {Record<string, unknown>} */ (v)) || added;
    } else {
      out[path] = v;
      added = true;
    }
  }
  return added;
}

/**
 * Aplana relaciones anidadas (p. ej. LastModifiedBy → LastModifiedBy.Name en cabecera, "Mia…" en celda).
 * No expande arrays (resultados de subconsultas siguen como un solo valor / JSON si hiciera falta).
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
function flattenQueryExplorerRow(row) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'attributes') continue;
    if (isFlattenableNestedObject(v)) {
      const added = flattenNestedInto(out, k, /** @type {Record<string, unknown>} */ (v));
      if (!added) out[k] = v;
      continue;
    }
    out[k] = v;
  }
  return out;
}

/** @param {Record<string, unknown> | null | undefined} r */
function maybeFlattenRow(r) {
  if (!r || typeof r !== 'object') return /** @type {Record<string, unknown>} */ ({});
  const cached = flattenedRowCache.get(r);
  if (cached) return cached;
  const flattened = flattenQueryExplorerRow(r);
  flattenedRowCache.set(r, flattened);
  return flattened;
}

/** Firma estable para comparar celdas: null, ausente, "" y solo espacios se tratan como vacío equivalente. */
function cellCompareSignature(v) {
  if (v === undefined || v === null) return '\0__sfoc_empty__';
  if (typeof v === 'string') {
    if (v.trim() === '') return '\0__sfoc_empty__';
    return `s:${v}`;
  }
  if (typeof v === 'boolean' || typeof v === 'number') {
    if (typeof v === 'number' && !Number.isFinite(v)) return '\0__sfoc_empty__';
    return `p:${JSON.stringify(v)}`;
  }
  if (typeof v === 'object') {
    try {
      const stripped = deepStripAttributes(v);
      if (stripped === null) return '\0__sfoc_empty__';
      if (typeof stripped === 'object' && !Array.isArray(stripped) && Object.keys(stripped).length === 0) {
        return '\0__sfoc_empty__';
      }
      return `o:${JSON.stringify(stripped)}`;
    } catch {
      return `x:${String(v)}`;
    }
  }
  return `z:${String(v)}`;
}

/** Valor del campo en fila aplanada (clave ausente ≡ undefined). */
function flatFieldValue(flat, k) {
  if (!flat || typeof flat !== 'object') return undefined;
  return Object.prototype.hasOwnProperty.call(flat, k) ? flat[k] : undefined;
}

/** @returns {string[]} */
function unionKeysVisible(rows) {
  const set = new Set();
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    Object.keys(maybeFlattenRow(/** @type {Record<string, unknown>} */ (r))).forEach((k) => set.add(k));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

const AUTO_COMPARE_EXCLUDED_FIELDS = new Set([
  'Id', 'CreatedDate', 'LastModifiedDate', 'SystemModstamp', 'LastViewedDate', 'LastReferencedDate',
  'CreatedById', 'LastModifiedById', 'OwnerId'
]);
const AUTO_COMPARE_FIELD_PRIORITY = ['ExternalId', 'External_Id__c', 'Email', 'Username', 'DeveloperName', 'Name', 'RecordNumber'];

function isVolatileCompareField(field) {
  return AUTO_COMPARE_EXCLUDED_FIELDS.has(field)
    || /^(CreatedBy|LastModifiedBy)(\.|$)/.test(field);
}

function isEmptyCompareValue(value) {
  return cellCompareSignature(value) === '\0__sfoc_empty__';
}

function commonCompareFields(leftRows, rightRows) {
  const left = new Set(unionKeysVisible(leftRows));
  return unionKeysVisible(rightRows).filter((field) => left.has(field));
}

function compareFieldRank(field) {
  const exact = AUTO_COMPARE_FIELD_PRIORITY.indexOf(field);
  if (exact >= 0) return exact;
  if (/external.?id/i.test(field)) return 20;
  if (/(email|username|recordnumber|developern?ame)$/i.test(field)) return 30;
  if (/name$/i.test(field)) return 40;
  return 100;
}

function usableCompareValues(rows, field) {
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => flatFieldValue(maybeFlattenRow(/** @type {Record<string, unknown>} */ (row)), field))
    .filter((value) => !isEmptyCompareValue(value))
    .map((value) => cellCompareSignature(value));
}

function resolveAutoCompareField(leftRows, rightRows) {
  const candidates = commonCompareFields(leftRows, rightRows)
    .filter((field) => !isVolatileCompareField(field));
  let best = null;
  for (const field of candidates) {
    const leftValues = usableCompareValues(leftRows, field);
    const rightValues = usableCompareValues(rightRows, field);
    if (!leftValues.length || !rightValues.length) continue;
    if (new Set(leftValues).size !== leftValues.length || new Set(rightValues).size !== rightValues.length) continue;
    const rightSet = new Set(rightValues);
    const shared = leftValues.filter((value) => rightSet.has(value)).length;
    if (!shared) continue;
    const candidate = { field, shared, rank: compareFieldRank(field) };
    if (!best || candidate.rank < best.rank || (candidate.rank === best.rank && candidate.shared > best.shared)) {
      best = candidate;
    }
  }
  return best?.field || '';
}

function resolvedCompareMatchField(leftRows, rightRows) {
  if (queryCompareMatchField && queryCompareMatchField !== 'auto' && queryCompareMatchField !== '__row_order') {
    return queryCompareMatchField;
  }
  return queryCompareMatchField === 'auto' ? resolveAutoCompareField(leftRows, rightRows) : '';
}

function addRowsToCompareBuckets(rows, field, side) {
  const buckets = new Map();
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const value = flatFieldValue(maybeFlattenRow(/** @type {Record<string, unknown>} */ (row)), field);
    const key = isEmptyCompareValue(value) ? `__missing_${side}_${index}` : cellCompareSignature(value);
    const group = buckets.get(key) || [];
    group.push(/** @type {Record<string, unknown>} */ (row));
    buckets.set(key, group);
  });
  return buckets;
}

/**
 * Alinea filas para comparar resultados de la misma consulta en dos orgs.
 * - Una sola fila en cada lado: siempre por posición (índice 0), aunque el Id difiera;
 *   así se comparan campo a campo dos registros distintos sin duplicar filas.
 * - Si hay Id en ambos lados y más de una fila en algún lado: unión por Id (comportamiento anterior).
 * - Si no hay Id coherente: por índice con relleno de null.
 * @returns {{ left: (Record<string, unknown> | null)[], right: (Record<string, unknown> | null)[] }}
 */
function alignRowsForCompare(leftRows, rightRows) {
  const L = Array.isArray(leftRows) ? leftRows : [];
  const R = Array.isArray(rightRows) ? rightRows : [];
  const matchField = resolvedCompareMatchField(L, R);
  if (matchField) {
    const leftBuckets = addRowsToCompareBuckets(L, matchField, 'left');
    const rightBuckets = addRowsToCompareBuckets(R, matchField, 'right');
    const sharedKeys = [...leftBuckets.keys()].filter((key) => rightBuckets.has(key));
    // Si no existe ninguna coincidencia por el campo elegido, las dos consultas
    // siguen mostrando sus filas en paralelo. No se convierten en dos bloques de
    // "ausente en la otra org", que ocultaba el resultado real de cada entorno.
    if (!sharedKeys.length) {
      const n = Math.max(L.length, R.length);
      return {
        left: Array.from({ length: n }, (_, i) => L[i] || null),
        right: Array.from({ length: n }, (_, i) => R[i] || null)
      };
    }
    const left = [];
    const right = [];
    const matchedLeftRows = new Set();
    const matchedRightRows = new Set();
    for (const key of sharedKeys) {
      const leftGroup = leftBuckets.get(key);
      const rightGroup = rightBuckets.get(key);
      const size = Math.max(leftGroup.length, rightGroup.length);
      for (let index = 0; index < size; index += 1) {
        const leftRow = leftGroup[index] || null;
        const rightRow = rightGroup[index] || null;
        if (leftRow) matchedLeftRows.add(leftRow);
        if (rightRow) matchedRightRows.add(rightRow);
        left.push(leftRow);
        right.push(rightRow);
      }
    }
    const remainingLeft = L.filter((row) => !matchedLeftRows.has(row));
    const remainingRight = R.filter((row) => !matchedRightRows.has(row));
    const remainingSize = Math.max(remainingLeft.length, remainingRight.length);
    for (let index = 0; index < remainingSize; index += 1) {
      left.push(remainingLeft[index] || null);
      right.push(remainingRight[index] || null);
    }
    return { left, right };
  }
  const n = Math.max(L.length, R.length);
  return {
    left: Array.from({ length: n }, (_, i) => (L[i] && typeof L[i] === 'object' ? /** @type {Record<string, unknown>} */ (L[i]) : null)),
    right: Array.from({ length: n }, (_, i) =>
      R[i] && typeof R[i] === 'object' ? /** @type {Record<string, unknown>} */ (R[i]) : null
    )
  };
}

function normalizedFilterValue(rowData, field, value) {
  let cache = filterValueCache.get(rowData);
  if (!cache) {
    cache = new Map();
    filterValueCache.set(rowData, cache);
  }
  if (cache.has(field)) return cache.get(field);
  const normalized = formatCell(value).toLowerCase();
  cache.set(field, normalized);
  return normalized;
}

function fastHeaderFilter(headerValue, rowValue, rowData, params) {
  const rawNeedle = String(headerValue ?? '');
  let needle = filterNeedleCache.get(rawNeedle);
  if (needle === undefined) {
    needle = rawNeedle.trim().toLowerCase();
    if (filterNeedleCache.size > 100) filterNeedleCache.clear();
    filterNeedleCache.set(rawNeedle, needle);
  }
  if (!needle) return true;
  return normalizedFilterValue(rowData, params.field, rowValue).includes(needle);
}

function queryColumnDefinition(key) {
  // Evita que fitData mida todas las celdas al cambiar la ventana virtual.
  const width = Math.max(120, Math.min(280, Math.ceil(String(key).length * 7.5) + 34));
  return {
    title: key,
    field: key,
    headerSort: true,
    headerFilter: 'input',
    headerFilterFunc: fastHeaderFilter,
    headerFilterFuncParams: { field: key },
    width,
    minWidth: 120,
    formatter: (cell) => escapeHtml(formatCell(cell.getValue()))
  };
}

function syncCompareMatchFieldUi(leftRows = navLeft.getRows(), rightRows = navRight.getRows()) {
  const wrap = document.getElementById('queryExplorerCompareMatchFieldWrap');
  const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('queryExplorerCompareMatchField'));
  const compare = !!state.queryExplorerCompareMode;
  if (wrap) wrap.classList.toggle('hidden', !compare);
  if (!select) return;

  const availableFields = commonCompareFields(leftRows, rightRows);
  if (queryCompareMatchField !== 'auto' && queryCompareMatchField !== '__row_order' && !availableFields.includes(queryCompareMatchField)) {
    queryCompareMatchField = 'auto';
  }
  const autoMatch = resolveAutoCompareField(leftRows, rightRows);
  const previous = queryCompareMatchField;
  select.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = 'auto';
  auto.textContent = autoMatch
    ? t('queryExplorer.compareMatchAutoUsing', { field: autoMatch })
    : t('queryExplorer.compareMatchAuto');
  const rowOrder = document.createElement('option');
  rowOrder.value = '__row_order';
  rowOrder.textContent = t('queryExplorer.compareMatchRowOrder');
  select.append(auto, rowOrder);
  availableFields.forEach((field) => {
    const option = document.createElement('option');
    option.value = field;
    option.textContent = field;
    select.appendChild(option);
  });
  select.value = previous;
  if (select.value !== previous) {
    queryCompareMatchField = 'auto';
    select.value = 'auto';
  }
}

function prepareTableRows(list, keys, startIndex = 0) {
  const missingLabel = t('queryExplorer.rowMissingInOtherOrg');
  return list.map((rec, offset) => {
    const isMissing = rec == null;
    const row = isMissing
      ? Object.fromEntries(keys.map((key) => [key, missingLabel]))
      : maybeFlattenRow(rec && typeof rec === 'object' ? /** @type {Record<string, unknown>} */ (rec) : null);
    return { ...row, __sfocRowIndex: startIndex + offset };
  });
}

function queueTableMutation(table, operation) {
  const previous = table.__sfocMutationQueue || table.__sfocReady || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  table.__sfocMutationQueue = next.catch(() => {});
  return next;
}

function reconcilePendingRowsAfterSnapshot(appendState, sourceRows, endIndex) {
  // `sourceRows` es el array vivo del navegador de resultados. Si un flush que
  // ya estaba en cola consumió filas recibidas después del snapshot, se vuelven
  // a dejar aquí como cola autoritativa para no perderlas al hacer replaceData.
  const sourceEnd = sourceRows.length;
  const trailingRows = sourceRows.slice(endIndex);
  const beyondSource = appendState.pending.flatMap((group) => {
    const groupEnd = group.startIndex + group.rows.length;
    if (groupEnd <= sourceEnd) return [];
    const offset = Math.max(0, sourceEnd - group.startIndex);
    return [{
      rows: group.rows.slice(offset),
      startIndex: group.startIndex + offset
    }];
  });
  appendState.pending = trailingRows.length
    ? [{ rows: trailingRows, startIndex: endIndex }, ...beyondSource]
    : beyondSource;
}

/**
 * @param {HTMLElement | null} mount
 * @param {unknown[] | null} rows filas puede incluir null (solo en comparación alineada)
 * @param {string[] | null} columnKeys si null, se deduce de las filas
 * @param {{ allowEmptyKeySet?: boolean, emptyColumnsMessage?: string, selectable?: boolean }} [opts]
 */
async function renderTableInto(mount, rows, columnKeys = null, opts = {}) {
  if (!mount) return;
  const tableKey = mount.id;
  const list = Array.isArray(rows) ? rows : [];
  const previousTable = queryTables.get(tableKey);
  if (!list.length) {
    destroyQueryTable(mount);
    const p = document.createElement('p');
    p.className = 'query-explorer-table-empty';
    p.setAttribute('data-i18n', 'queryExplorer.empty');
    p.textContent = t('queryExplorer.empty');
    mount.appendChild(p);
    return;
  }
  let keys = columnKeys != null ? [...columnKeys] : unionKeysVisible(list.filter(Boolean));
  if (!keys.length && opts.allowEmptyKeySet && opts.emptyColumnsMessage) {
    destroyQueryTable(mount);
    const p = document.createElement('p');
    p.className = 'query-explorer-table-empty';
    p.textContent = opts.emptyColumnsMessage;
    mount.appendChild(p);
    return;
  }
  if (!keys.length) keys = unionKeysVisible(list.filter(Boolean));
  if (!keys.length) {
    destroyQueryTable(mount);
    const p = document.createElement('p');
    p.className = 'query-explorer-table-empty';
    p.textContent = t('queryExplorer.empty');
    mount.appendChild(p);
    return;
  }
  const data = prepareTableRows(list, keys);
  const columnSignature = keys.join('\u001f');
  if (previousTable?.__sfocColumnSignature === columnSignature) {
    const appendState = getIncrementalAppendState(previousTable);
    const replaceVersion = (appendState.replaceVersion || 0) + 1;
    appendState.replaceVersion = replaceVersion;
    appendState.replacing = true;
    if (appendState.flushTimer) {
      clearTimeout(appendState.flushTimer);
      appendState.flushTimer = 0;
    }
    const previousFlush = appendState.flushQueue;
    const replacement = previousFlush
      .catch(() => {})
      .then(async () => {
        await waitForTableScrollIdle(appendState);
        if (appendState.disposed || queryTables.get(tableKey) !== previousTable) return;
        reconcilePendingRowsAfterSnapshot(appendState, list, data.length);
        previousTable.__sfocNextRowIndex = data.length;
        await queueTableMutation(previousTable, async () => {
          if (appendState.disposed || queryTables.get(tableKey) !== previousTable) return;
          appendState.mutating = true;
          try {
            await previousTable.replaceData(data);
          } finally {
            appendState.mutating = false;
          }
        });
        if (!appendState.disposed && queryTables.get(tableKey) === previousTable) {
          // El dataset completo sustituye cualquier estado de error de un
          // append anterior que ya quedó representado en `data`.
          appendState.error = null;
        }
      });
    appendState.flushQueue = replacement.catch(() => {});
    try {
      await replacement;
    } finally {
      if (appendState.replaceVersion === replaceVersion) {
        appendState.replacing = false;
        if (!appendState.disposed && appendState.pending.length) {
          scheduleQueuedRowsFlush(mount, previousTable, appendState);
        }
      }
    }
    return previousTable;
  }
  destroyQueryTable(mount);
  const renderToken = `${tableKey}-${Date.now()}-${Math.random()}`;
  mount.dataset.tabulatorRenderToken = renderToken;
  try {
    const Tabulator = await loadTabulator();
    if (!mount.isConnected || mount.dataset.tabulatorRenderToken !== renderToken) return;
    const table = new Tabulator(mount, {
      data,
      layout: 'fitDataStretch',
      height: 'min(52vh, 560px)',
      index: '__sfocRowIndex',
      nestedFieldSeparator: false,
      placeholder: t('queryExplorer.empty'),
      renderVertical: 'virtual',
      renderHorizontal: 'virtual',
      renderVerticalBuffer: 560,
      rowHeight: 28,
      headerFilterLiveFilterDelay: 250,
      selectableRows: opts.selectable === true,
      selectableRowsPersistence: false,
      columns: keys.map(queryColumnDefinition),
      rowFormatter: styleTabulatorRow
    });
    // Tabulator difiere `_create` con setTimeout. El guard evita que una
    // instancia sustituida reconstruya el mismo mount después de destruirla.
    if (typeof table._create === 'function') {
      const createTable = table._create;
      table._create = function createCurrentTableOnly() {
        if (
          this.destroyed
          || !mount.isConnected
          || mount.dataset.tabulatorRenderToken !== renderToken
        ) {
          this.__sfocResolveReady?.();
          return;
        }
        return createTable.call(this);
      };
    }
    table.__sfocColumnSignature = columnSignature;
    table.__sfocColumnKeys = new Set(keys);
    table.__sfocNextRowIndex = data.length;
    table.__sfocRenderToken = renderToken;
    table.__sfocReady = new Promise((resolve) => {
      let resolved = false;
      table.__sfocResolveReady = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      table.on('tableBuilt', table.__sfocResolveReady);
    });
    table.__sfocOnRenderComplete = () => {
      if (
        table.destroyed
        || mount.dataset.tabulatorRenderToken !== renderToken
        || queryTables.get(tableKey) !== table
      ) return;
      updateQueryFilterSummary(table, mount);
    };
    table.on('renderComplete', table.__sfocOnRenderComplete);
    table.__sfocOnDataSorted = () => updateQueryFilterSummary(table, mount);
    table.on('dataSorted', table.__sfocOnDataSorted);
    applyTabulatorTheme(table);
    queryTables.set(tableKey, table);
    await table.__sfocReady;
    if (
      table.destroyed
      || !mount.isConnected
      || mount.dataset.tabulatorRenderToken !== renderToken
      || queryTables.get(tableKey) !== table
    ) return;
    getIncrementalAppendState(table);
    updateQueryFilterSummary(table, mount);
    return table;
  } catch (error) {
    if (mount.dataset.tabulatorRenderToken === renderToken) {
      mount.textContent = t('queryExplorer.empty');
    }
    throw error;
  }
}

/**
 * Tabulator debe recibir todos los eventos de scroll para mantener sincronizado
 * su DOM virtual. Aquí solo observamos la interacción y pausamos las inserciones
 * de lotes; nunca interceptamos ni redibujamos el viewport manualmente.
 */
function scheduleTableScrollSettle(table, appendState) {
  if (appendState.disposed) return;
  appendState.scrolling = true;
  if (appendState.flushTimer) {
    clearTimeout(appendState.flushTimer);
    appendState.flushTimer = 0;
  }
  if (appendState.scrollTimer) clearTimeout(appendState.scrollTimer);
  const settle = () => {
    if (appendState.disposed) return;
    if (appendState.pointerActive || appendState.touchActive || appendState.filtering) {
      appendState.scrollTimer = setTimeout(settle, TABLE_SCROLL_IDLE_MS);
      return;
    }
    appendState.scrollTimer = 0;
    appendState.scrolling = false;
    const waiters = appendState.idleWaiters.splice(0);
    for (const resolve of waiters) resolve();
    if (appendState.pending.length) {
      scheduleQueuedRowsFlush(table.getElement?.(), table, appendState);
    }
  };
  appendState.scrollTimer = setTimeout(settle, TABLE_SCROLL_IDLE_MS);
}

function getIncrementalAppendState(table) {
  if (table.__sfocAppendState) return table.__sfocAppendState;
  const root = table.getElement?.() || null;
  const holder = root?.querySelector?.('.tabulator-tableholder') || null;
  const appendState = {
    pending: [],
    flushTimer: 0,
    scrollTimer: 0,
    flushQueue: Promise.resolve(),
    disposed: false,
    replacing: false,
    replaceVersion: 0,
    scrolling: false,
    mutating: false,
    pointerActive: false,
    touchActive: false,
    filtering: false,
    error: null,
    holder,
    root,
    ownerDocument: holder?.ownerDocument || null,
    ownerWindow: holder?.ownerDocument?.defaultView || null,
    onInteraction: null,
    onPointerEnd: null,
    onTouchEnd: null,
    onWindowBlur: null,
    onDataFiltering: null,
    onDataFiltered: null,
    interactionEvents: ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown', 'input'],
    idleWaiters: []
  };
  appendState.onInteraction = (event) => {
    if (appendState.disposed) return;
    if (event?.type === 'scroll' && appendState.mutating) return;
    if (event?.type === 'pointerdown') appendState.pointerActive = true;
    if (event?.type === 'touchstart') appendState.touchActive = true;
    scheduleTableScrollSettle(table, appendState);
  };
  appendState.onPointerEnd = () => {
    if (!appendState.pointerActive) return;
    appendState.pointerActive = false;
    scheduleTableScrollSettle(table, appendState);
  };
  appendState.onTouchEnd = () => {
    if (!appendState.touchActive) return;
    appendState.touchActive = false;
    scheduleTableScrollSettle(table, appendState);
  };
  appendState.onWindowBlur = () => {
    if (!appendState.pointerActive && !appendState.touchActive) return;
    appendState.pointerActive = false;
    appendState.touchActive = false;
    scheduleTableScrollSettle(table, appendState);
  };
  appendState.onDataFiltering = () => {
    if (appendState.disposed || appendState.mutating) return;
    appendState.filtering = true;
    scheduleTableScrollSettle(table, appendState);
  };
  appendState.onDataFiltered = () => {
    if (appendState.disposed || appendState.mutating) return;
    appendState.filtering = false;
    scheduleTableScrollSettle(table, appendState);
  };
  holder?.addEventListener?.('scroll', appendState.onInteraction, { passive: true });
  for (const eventName of appendState.interactionEvents) {
    root?.addEventListener?.(eventName, appendState.onInteraction, { passive: true });
  }
  appendState.ownerDocument?.addEventListener?.('pointerup', appendState.onPointerEnd, { capture: true, passive: true });
  appendState.ownerDocument?.addEventListener?.('pointercancel', appendState.onPointerEnd, { capture: true, passive: true });
  appendState.ownerDocument?.addEventListener?.('touchend', appendState.onTouchEnd, { capture: true, passive: true });
  appendState.ownerDocument?.addEventListener?.('touchcancel', appendState.onTouchEnd, { capture: true, passive: true });
  appendState.ownerWindow?.addEventListener?.('pointerup', appendState.onPointerEnd, { capture: true, passive: true });
  appendState.ownerWindow?.addEventListener?.('pointercancel', appendState.onPointerEnd, { capture: true, passive: true });
  appendState.ownerWindow?.addEventListener?.('blur', appendState.onWindowBlur, { passive: true });
  table.on?.('dataFiltering', appendState.onDataFiltering);
  table.on?.('dataFiltered', appendState.onDataFiltered);
  table.__sfocAppendState = appendState;
  return appendState;
}

function waitForTableScrollIdle(appendState) {
  if (appendState.disposed) return Promise.resolve();
  if (!tableInteractionActive(appendState)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => appendState.idleWaiters.push(resolve));
}

/**
 * addData añade cada fila por separado y, por defecto, clona todo activeRows
 * en cada iteración. En un batch grande eso convierte un append lineal en un
 * trabajo cuadrático. La asignación directa mantiene la misma referencia
 * durante el batch; Tabulator reconstruye sus pipelines una vez al finalizar.
 */
async function addTableDataEfficiently(table, data) {
  const rowManager = table?.rowManager;
  if (!rowManager?.setActiveRows || !Array.isArray(data) || data.length < 2) {
    return table.addData(data, false);
  }
  const originalSetActiveRows = rowManager.setActiveRows;
  let operation;
  rowManager.setActiveRows = function setActiveRowsWithoutCopy(activeRows) {
    this.activeRows = activeRows;
    this.activeRowsCount = activeRows.length;
  };
  try {
    // La creación de filas de addData es síncrona; la promesa resuelve después.
    operation = table.addData(data, false);
    // Rompe la referencia temporal al último pipeline con una sola copia.
    originalSetActiveRows.call(rowManager, rowManager.activeRows);
  } finally {
    rowManager.setActiveRows = originalSetActiveRows;
  }
  return operation;
}

function scheduleQueuedRowsFlush(mount, table, appendState) {
  if (
    appendState.disposed
    || appendState.replacing
    || appendState.flushTimer
    || appendState.scrolling
    || appendState.pointerActive
    || appendState.touchActive
    || appendState.filtering
  ) return;
  appendState.flushTimer = setTimeout(() => {
    appendState.flushTimer = 0;
    void flushQueuedRowsInto(mount, false).catch((error) => {
      appendState.error = error;
    });
  }, TABLE_APPEND_FLUSH_MS);
}

function waitForNextTableFrame(table) {
  return new Promise((resolve) => {
    const view = table.getElement?.()?.ownerDocument?.defaultView;
    if (view?.requestAnimationFrame) view.requestAnimationFrame(resolve);
    else setTimeout(resolve, 0);
  });
}

function tableInteractionActive(appendState) {
  return !!(
    appendState.scrolling
    || appendState.pointerActive
    || appendState.touchActive
    || appendState.filtering
  );
}

/**
 * Agrupa varias páginas REST en un único cambio de Tabulator. Durante el
 * desplazamiento conserva las páginas en memoria y las pinta al quedar idle.
 */
function enqueueRowsInto(mount, rows, startIndex) {
  if (!mount || !Array.isArray(rows) || !rows.length) return;
  const table = queryTables.get(mount.id);
  if (!table) return;
  const appendState = getIncrementalAppendState(table);
  appendState.pending.push({ rows, startIndex });
  scheduleQueuedRowsFlush(mount, table, appendState);
}

function flushQueuedRowsInto(mount, force = false) {
  if (!mount) return;
  const table = queryTables.get(mount.id);
  if (!table) return;
  const appendState = getIncrementalAppendState(table);
  if (appendState.disposed) return;
  const operation = appendState.flushQueue
    .catch(() => {})
    .then(() => flushQueuedRowsPass(mount, table, appendState, force));
  appendState.flushQueue = operation.catch(() => {});
  return operation;
}

async function flushQueuedRowsPass(mount, table, appendState, force = false) {
  if (appendState.disposed || queryTables.get(mount.id) !== table) return;
  if (appendState.error) {
    const error = appendState.error;
    appendState.error = null;
    throw error;
  }
  if (appendState.flushTimer) {
    clearTimeout(appendState.flushTimer);
    appendState.flushTimer = 0;
  }
  if (tableInteractionActive(appendState)) {
    if (!force) return;
    await waitForTableScrollIdle(appendState);
    return flushQueuedRowsPass(mount, table, appendState, true);
  }
  const groups = appendState.pending.splice(0);
  if (!groups.length) return;
  const renderToken = table.__sfocRenderToken;
  const rows = groups.flatMap((group) => group.rows);
  const chunks = [];
  for (const group of groups) {
    let offset = 0;
    while (offset < group.rows.length) {
      const index = group.startIndex + offset;
      const previous = chunks[chunks.length - 1];
      const canMerge = previous
        && previous.startIndex + previous.rows.length === index
        && previous.rows.length < TABLE_APPEND_CHUNK_ROWS;
      const capacity = canMerge
        ? TABLE_APPEND_CHUNK_ROWS - previous.rows.length
        : TABLE_APPEND_CHUNK_ROWS;
      const part = group.rows.slice(offset, offset + capacity);
      if (canMerge) previous.rows.push(...part);
      else chunks.push({ rows: part, startIndex: index });
      offset += part.length;
    }
  }
  await waitForNextTableFrame(table);
  if (appendState.disposed || queryTables.get(mount.id) !== table) return;
  if (tableInteractionActive(appendState)) {
    appendState.pending.unshift(...groups);
    if (force) {
      await waitForTableScrollIdle(appendState);
      await flushQueuedRowsPass(mount, table, appendState, true);
    }
    return;
  }
  const batchKeys = unionKeysVisible(rows.filter(Boolean));
  let deferredForScroll = false;
  await queueTableMutation(table, async () => {
    if (
      appendState.disposed
      || queryTables.get(mount.id) !== table
      || table.__sfocRenderToken !== renderToken
    ) return;
    if (tableInteractionActive(appendState)) {
      appendState.pending.unshift(...groups);
      deferredForScroll = true;
      return;
    }
    appendState.mutating = true;
    try {
      const newKeys = batchKeys.filter((key) => !table.__sfocColumnKeys.has(key));
      for (const key of newKeys) {
        if (tableInteractionActive(appendState)) {
          appendState.pending.unshift(...groups);
          deferredForScroll = true;
          return;
        }
        await table.addColumn(queryColumnDefinition(key), false);
        if (appendState.disposed || queryTables.get(mount.id) !== table) return;
        table.__sfocColumnKeys.add(key);
        table.__sfocColumnSignature = [...table.__sfocColumnKeys].join('\u001f');
        if (tableInteractionActive(appendState)) {
          appendState.pending.unshift(...groups);
          deferredForScroll = true;
          return;
        }
      }
    } finally {
      appendState.mutating = false;
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      if (
        appendState.disposed
        || queryTables.get(mount.id) !== table
        || table.__sfocRenderToken !== renderToken
      ) return;
      if (tableInteractionActive(appendState)) {
        appendState.pending.unshift(...chunks.slice(chunkIndex));
        deferredForScroll = true;
        break;
      }
      const chunk = chunks[chunkIndex];
      appendState.mutating = true;
      try {
        const data = prepareTableRows(
          chunk.rows,
          [...table.__sfocColumnKeys],
          chunk.startIndex
        );
        await addTableDataEfficiently(table, data);
        if (appendState.disposed || queryTables.get(mount.id) !== table) return;
        table.__sfocNextRowIndex = Math.max(
          table.__sfocNextRowIndex || 0,
          chunk.startIndex + data.length
        );
      } finally {
        appendState.mutating = false;
      }
      if (chunkIndex < chunks.length - 1) await waitForNextTableFrame(table);
    }
  });
  if (
    appendState.disposed
    || queryTables.get(mount.id) !== table
    || table.__sfocRenderToken !== renderToken
  ) return;
  if (deferredForScroll) {
    if (force) {
      await waitForTableScrollIdle(appendState);
      await flushQueuedRowsPass(mount, table, appendState, true);
    }
    return;
  }
  if (force && appendState.pending.length) {
    await flushQueuedRowsPass(mount, table, appendState, true);
  }
  else if (appendState.pending.length) scheduleQueuedRowsFlush(mount, table, appendState);
}

/** @returns {Blob} */
function rowsToCsvBlob(rows, keysOpt = null) {
  const BOM = '\uFEFF';
  const list = Array.isArray(rows) ? rows : [];
  const keys = keysOpt != null ? keysOpt : unionKeysVisible(list.filter(Boolean));
  const sep = ';';
  const escape = (s) => {
    const inner = String(s).replace(/"/g, '""');
    return `"${inner}"`;
  };
  const lines = [keys.map((k) => escape(k)).join(sep)];
  const missingLabel = t('queryExplorer.rowMissingInOtherOrg');
  for (const rec of list) {
    const isMissing = rec == null;
    const row = isMissing ? {} : maybeFlattenRow(rec && typeof rec === 'object' ? /** @type {Record<string, unknown>} */ (rec) : null);
    lines.push(
      keys.map((k) => escape(isMissing ? missingLabel : formatCell(row[k]))).join(sep)
    );
  }
  return new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

/** Texto tabulado para pegar directamente en Excel. */
function rowsToExcelText(rows, keysOpt = null) {
  const list = Array.isArray(rows) ? rows : [];
  const keys = keysOpt != null ? keysOpt : unionKeysVisible(list.filter(Boolean));
  const clean = (value) => String(value ?? '')
    .replace(/[\t\r\n]+/g, ' ');
  const lines = [keys.map(clean).join('\t')];
  const missingLabel = t('queryExplorer.rowMissingInOtherOrg');
  for (const rec of list) {
    const isMissing = rec == null;
    const row = isMissing ? {} : maybeFlattenRow(rec && typeof rec === 'object' ? /** @type {Record<string, unknown>} */ (rec) : null);
    lines.push(keys.map((key) => clean(isMissing ? missingLabel : formatCell(row[key]))).join('\t'));
  }
  return lines.join('\r\n');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(t('toast.downloaded', { name: filename }), 'info');
  } catch {
    showToast(t('toast.downloadError'), 'error');
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fetchPage(orgId, variant, queryText, pagePath, runId) {
  return bg({
    type: 'queryExplorer:run',
    orgId,
    variant,
    queryText,
    pagePath: pagePath || undefined,
    runId
  });
}

async function renderCompareTables() {
  if (!state.queryExplorerCompareMode) return;
  const mL = document.getElementById('queryExplorerLeftTableMount');
  const mR = document.getElementById('queryExplorerRightTableMount');
  const rawL = navLeft.getRows();
  const rawR = navRight.getRows();
  syncCompareMatchFieldUi(rawL, rawR);
  const { left: alignL, right: alignR } = alignRowsForCompare(rawL, rawR);
  await Promise.all([
    renderTableInto(mL, alignL),
    renderTableInto(mR, alignR)
  ]);

  const metaL = document.getElementById('queryExplorerLeftMeta');
  const metaR = document.getElementById('queryExplorerRightMeta');
  setQueryResultMeta(metaL, navLeft.metaLine(), mL ? queryTables.get(mL.id) : null);
  setQueryResultMeta(metaR, navRight.metaLine(), mR ? queryTables.get(mR.id) : null);
}

function bindResultTable(nav, handlers) {
  const { metaEl, mount, customRender, tableOptions } = handlers;
  let customRenderTimer = 0;
  let customRenderPending = false;
  let customRenderWork = Promise.resolve();
  let customRenderError = null;
  const startCustomRender = () => {
    customRenderWork = Promise.resolve(customRender()).catch((error) => {
      customRenderError = error;
    });
    return customRenderWork;
  };
  const renderLocal = async () => {
    if (typeof customRender === 'function') await customRender();
    else {
      await renderTableInto(mount, nav.getRows(), null, tableOptions);
      setQueryResultMeta(metaEl, nav.metaLine(), mount ? queryTables.get(mount.id) : null);
    }
  };
  const appendLocal = (rows, startIndex) => {
    if (typeof customRender === 'function') {
      customRenderPending = true;
      if (!customRenderTimer) {
        customRenderTimer = setTimeout(() => {
          customRenderTimer = 0;
          if (!customRenderPending) return;
          customRenderPending = false;
          void startCustomRender();
        }, TABLE_APPEND_FLUSH_MS);
      }
    }
    else {
      enqueueRowsInto(mount, rows, startIndex);
      setQueryResultMeta(metaEl, nav.metaLine(), mount ? queryTables.get(mount.id) : null);
    }
  };
  const flushLocal = async () => {
    if (typeof customRender === 'function') {
      if (customRenderTimer) clearTimeout(customRenderTimer);
      customRenderTimer = 0;
      if (customRenderPending) {
        customRenderPending = false;
        await startCustomRender();
      }
      await customRenderWork;
      if (customRenderError) {
        const error = customRenderError;
        customRenderError = null;
        throw error;
      }
    } else {
      await flushQueuedRowsInto(mount, true);
    }
  };

  return { renderLocal, appendLocal, flushLocal };
}

let compareRenderQueue = Promise.resolve();

function scheduleCompareRender() {
  const next = compareRenderQueue.catch(() => {}).then(() => renderCompareTables());
  compareRenderQueue = next.catch(() => {});
  return next;
}

function wireSingle() {
  const meta = document.getElementById('queryExplorerSingleMeta');
  const mount = document.getElementById('queryExplorerSingleTableMount');
  return bindResultTable(navSingle, {
    metaEl: meta,
    mount,
    tableOptions: { selectable: true }
  });
}

function wireCompareLeft() {
  return bindResultTable(navLeft, {
    metaEl: document.getElementById('queryExplorerLeftMeta'),
    mount: document.getElementById('queryExplorerLeftTableMount'),
    customRender: scheduleCompareRender
  });
}

function wireCompareRight() {
  return bindResultTable(navRight, {
    metaEl: document.getElementById('queryExplorerRightMeta'),
    mount: document.getElementById('queryExplorerRightTableMount'),
    customRender: scheduleCompareRender
  });
}

let renderers = { single: null, left: null, right: null };

async function runQueryForOrg(orgId, variant, queryText, runId) {
  const res = await fetchPage(orgId, variant, queryText, undefined, runId);
  if (!res?.ok) {
    const err = res?.reason === 'NO_SID' ? t('queryExplorer.noSid') : res?.error || t('queryExplorer.runError');
    throw createQueryExecutionError(err, res?.errorCode);
  }
  return res;
}

async function loadRemainingQueryPages(nav, orgId, variant, queryText, runId, onBatch, shouldContinue) {
  await nav.loadAll(
    (path) => fetchPage(orgId, variant, queryText, path, runId),
    onBatch,
    shouldContinue
  );
}

async function runOrgQueryStream({ run, side, nav, renderer, orgId, variant, queryText }) {
  const first = await runQueryForOrg(orgId, variant, queryText, run.runId);
  if (!isCurrentQueryRun(run)) return;
  nav.resetFromResponse(first);
  run.hasResults = true;
  await renderer?.renderLocal();
  if (!isCurrentQueryRun(run)) return;

  setResultLoadingState(side, nav, !!nav.current?.nextPath);
  await loadRemainingQueryPages(
    nav,
    orgId,
    variant,
    queryText,
    run.runId,
    (batch, startIndex) => {
      if (!isCurrentQueryRun(run)) return;
      renderer?.appendLocal(batch, startIndex);
      if (isCurrentQueryRun(run)) setResultLoadingState(side, nav, true);
    },
    () => isCurrentQueryRun(run)
  );
  if (!isCurrentQueryRun(run)) return;
  await renderer?.flushLocal?.();
  if (!isCurrentQueryRun(run)) return;
  nav.finishRun();
  setResultLoadingState(side, nav, false);
}

async function runExecute() {
  if (activeQueryRun) {
    await cancelActiveQueryRun();
    return;
  }
  await ensureQueryExplorerEditor();
  syncToolingSoslRule();
  const variant = variantFromControls();
  const q = getQueryExplorerQueryText();
  const status = document.getElementById('queryExplorerStatus');
  if (!variant) {
    if (status) status.textContent = t('queryExplorer.soslRequiresRest');
    showToast(t('queryExplorer.soslRequiresRest'), 'warn');
    return;
  }
  if (!q) {
    if (status) status.textContent = t('queryExplorer.emptyQuery');
    return;
  }
  if (state.queryExplorerCompareMode) {
    if (!state.leftOrgId) {
      if (status) status.textContent = t('queryExplorer.selectLeft');
      return;
    }
    if (!state.rightOrgId) {
      if (status) status.textContent = t('orgLimits.selectRightOrg');
      return;
    }
  } else if (!state.leftOrgId) {
    if (status) status.textContent = t('queryExplorer.selectLeft');
    return;
  }

  if (status) status.textContent = '';
  scrollQueryExplorerContentToTop();
  const run = beginQueryRun();
  try {
    if (state.queryExplorerCompareMode) {
      // Evita mezclar filas de la ejecución anterior mientras cada org entrega
      // su primera página a distinto ritmo.
      navLeft.beginRun(run.startedAt);
      navRight.beginRun(run.startedAt);
      setResultLoadingState('left', navLeft, true);
      setResultLoadingState('right', navRight, true);
      await Promise.all([
        runOrgQueryStream({
          run,
          side: 'left',
          nav: navLeft,
          renderer: renderers.left,
          orgId: state.leftOrgId,
          variant,
          queryText: q
        }),
        runOrgQueryStream({
          run,
          side: 'right',
          nav: navRight,
          renderer: renderers.right,
          orgId: state.rightOrgId,
          variant,
          queryText: q
        })
      ]);
    } else {
      navSingle.beginRun(run.startedAt);
      await runOrgQueryStream({
        run,
        side: 'single',
        nav: navSingle,
        renderer: renderers.single,
        orgId: state.leftOrgId,
        variant,
        queryText: q
      });
    }
    if (!isCurrentQueryRun(run)) return;
    if (status) status.textContent = '';
  } catch (e) {
    if (!isCurrentQueryRun(run)) return;
    reportQueryExplorerError(e);
    clearResultLoadingStates(true);
    renderQueryResultState('error', String(e?.message || e));
  } finally {
    if (activeQueryRun === run) {
      activeQueryRun = null;
      setRunButtonBusy(false);
      clearResultLoadingStates();
    }
  }
}

function updateCompareTitles() {
  const lt = document.getElementById('queryExplorerCompareLeftTitle');
  const rt = document.getElementById('queryExplorerCompareRightTitle');
  if (lt) lt.textContent = getOrgLabel(state.leftOrgId) || t('queryExplorer.paneLeft');
  if (rt) rt.textContent = getOrgLabel(state.rightOrgId) || t('queryExplorer.paneRight');
}

function setupQueryExplorerEditorResize() {
  const handle = document.getElementById('queryExplorerEditorResize');
  const mount = document.getElementById('queryExplorerEditorMount');
  if (!handle || !mount) return;
  let startY = 0;
  let startH = 0;
  const onMove = (e) => {
    applyQueryExplorerEditorHeight(startH + (e.clientY - startY));
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startH = mount.getBoundingClientRect().height;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function syncCompareLayoutUi() {
  const singleWrap = document.getElementById('queryExplorerSingleWrap');
  const compareWrap = document.getElementById('queryExplorerCompareWrap');
  const compare = !!state.queryExplorerCompareMode;
  singleWrap?.classList.toggle('hidden', compare);
  compareWrap?.classList.toggle('hidden', !compare);
  syncCompareMatchFieldUi();
  if (compare) updateCompareTitles();
}

/** @returns {ExplorerPageNav} */
function activeExportNav(which) {
  if (which === 'right') return navRight;
  if (which === 'single') return navSingle;
  return navLeft;
}

function getExportData(which) {
  const nav = activeExportNav(which);
  return { rows: nav.getRows(), keys: /** @type {string[] | null} */ (null) };
}

function canExportData(rows) {
  if (!rows.length) {
    showToast(t('queryExplorer.exportEmpty'), 'warn');
    return false;
  }
  return true;
}

function exportCsv(which) {
  const { rows, keys } = getExportData(which);
  if (!canExportData(rows)) return;
  const blob = rowsToCsvBlob(rows, keys);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  downloadBlob(blob, `query-explorer-${stamp}.csv`);
}

function exportJson(which) {
  const { rows, keys } = getExportData(which);
  if (!canExportData(rows)) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  const payload = rows.map((r) => {
    if (r == null) return null;
    if (keys && keys.length) {
      /** @type Record<string, unknown> */
      const o = {};
      const flat = r && typeof r === 'object' ? flattenQueryExplorerRow(/** @type {Record<string, unknown>} */ (r)) : {};
      for (const k of keys) o[k] = deepStripAttributes(flat[k]);
      return o;
    }
    return r && typeof r === 'object' ? flattenQueryExplorerRow(/** @type {Record<string, unknown>} */ (deepStripAttributes(r))) : r;
  });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, `query-explorer-${stamp}.json`);
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard unavailable');
}

async function copyQueryExport(which, format) {
  const { rows, keys } = getExportData(which);
  if (!canExportData(rows)) return;
  try {
    const text = format === 'csv'
      ? (await rowsToCsvBlob(rows, keys).text()).replace(/^\uFEFF/, '')
      : rowsToExcelText(rows, keys);
    await writeClipboardText(text);
    showToast(t(format === 'csv' ? 'queryExplorer.copyCsvSuccess' : 'queryExplorer.copyExcelSuccess'), 'success');
  } catch {
    showToast(t('queryExplorer.copyFailed'), 'error');
  }
}

function getQueryObjectApiName(rows) {
  const typed = (Array.isArray(rows) ? rows : []).find((row) => row?.attributes?.type);
  if (typed?.attributes?.type) return String(typed.attributes.type);
  const match = /\bfrom\s+([a-zA-Z][\w]*)/i.exec(getQueryExplorerQueryText());
  return match ? match[1] : '';
}

async function sendQueryRowsToImport(which = 'single') {
  const lang = document.getElementById('queryExplorerLangSelect')?.value || 'soql';
  if (lang !== 'soql') {
    showToast(t('queryExplorer.importOnlySoql'), 'warn');
    return;
  }
  const sourceNav = activeExportNav(which);
  const sourceRows = sourceNav.getRows();
  if (!sourceRows.length) {
    showToast(t('queryExplorer.exportEmpty'), 'warn');
    return;
  }
  const mountId = which === 'right'
    ? 'queryExplorerRightTableMount'
    : which === 'left'
      ? 'queryExplorerLeftTableMount'
      : 'queryExplorerSingleTableMount';
  const activeRows = which === 'single' ? queryTables.get(mountId)?.getData?.('active') : null;
  const rows = Array.isArray(activeRows)
    ? activeRows.map(({ __sfocRowIndex, ...row }) => row)
    : sourceRows.map((row) => maybeFlattenRow(row && typeof row === 'object' ? row : null));
  const objectApiName = getQueryObjectApiName(sourceRows);
  if (!objectApiName) {
    showToast(t('queryExplorer.importObjectUnknown'), 'warn');
    return;
  }
  const headers = unionKeysVisible(rows);
  if (!headers.length) {
    showToast(t('queryExplorer.exportEmpty'), 'warn');
    return;
  }
  const orgId = which === 'right' ? state.rightOrgId : state.leftOrgId;
  stageDataForImport({ orgId: orgId || '', objectApiName, headers, rows });

  let navigated = false;
  if (document.body.dataset.uiMode === 'v2') {
    const { navigateToWorkspaceTab } = await import('../workbench/workbenchShell.js');
    navigated = await navigateToWorkspaceTab('data-workbench', 'main', { userInitiated: true });
  }
  if (!navigated) {
    await navigateToModeAndTool('development', 'DataWorkbench', { userInitiated: true });
    const { setDataWorkbenchView } = await import('./dataWorkbenchPanel.js');
    setDataWorkbenchView();
  }
  showToast(t('queryExplorer.sentToImport', { count: rows.length }), 'success');
}

function readSavedQueries() {
  try {
    const raw = localStorage.getItem(QUERY_EXPLORER_SAVED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeSavedQueries(list) {
  try {
    localStorage.setItem(QUERY_EXPLORER_SAVED_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  } catch {
    /* ignore */
  }
}

function getQueryExplorerApiLangFromControls() {
  const apiSel = /** @type {HTMLSelectElement} */ (document.getElementById('queryExplorerApiSelect'));
  const langSel = /** @type {HTMLSelectElement} */ (document.getElementById('queryExplorerLangSelect'));
  const api = apiSel?.value === 'tooling' ? 'tooling' : 'rest';
  const lang = langSel?.value === 'sosl' ? 'sosl' : 'soql';
  return { api, lang };
}

function findSavedQueryByName(name) {
  const n = String(name || '').trim().toLocaleLowerCase();
  if (!n) return null;
  const list = readSavedQueries();
  return list.find((x) => String(x?.name || '').trim().toLocaleLowerCase() === n) || null;
}

function syncSaveQueryButtonLabels() {
  const saveBtn = document.getElementById('queryExplorerSaveNamedQueryBtn');
  const inp = /** @type {HTMLInputElement | null} */ (document.getElementById('queryExplorerQueryNameInput'));
  if (!inp) return;
  const selectedExists = !!selectedSavedQueryId
    && readSavedQueries().some((x) => x.id === selectedSavedQueryId);
  if (saveBtn) saveBtn.textContent = t(selectedExists ? 'queryExplorer.updateNamedQuery' : 'queryExplorer.saveNamedQuery');
}

function closeQueryExplorerSavedModal() {
  const modal = document.getElementById('queryExplorerSavedQueriesModal');
  if (modal) unmountSfocOverlay(modal);
}

function openQueryExplorerSavedModal() {
  const modal = document.getElementById('queryExplorerSavedQueriesModal');
  if (modal) {
    mountSfocOverlay(modal, {
      initialFocus: document.getElementById('queryExplorerQueryNameInput'),
      onEscape: closeQueryExplorerSavedModal
    });
  }
  refreshSavedQueriesListUi();
  syncSaveQueryButtonLabels();
  document.getElementById('queryExplorerQueryNameInput')?.focus();
}

function startNewSavedQuery() {
  selectedSavedQueryId = '';
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('queryExplorerQueryNameInput'));
  if (input) {
    input.value = '';
    input.focus();
  }
  syncSaveQueryButtonLabels();
  refreshSavedQueriesListUi();
}

async function selectSavedQuery(s, { focusName = false } = {}) {
  selectedSavedQueryId = s.id;
  await applySavedQueryEntry(s);
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('queryExplorerQueryNameInput'));
  if (input) {
    input.value = String(s.name || '');
    if (focusName) input.focus();
  }
  syncSaveQueryButtonLabels();
  refreshSavedQueriesListUi();
}

function uniqueSavedQueryName(baseName, queries) {
  const base = String(baseName || '').trim() || t('queryExplorer.untitledQuery');
  const used = new Set(queries.map((item) => String(item?.name || '').trim().toLocaleLowerCase()));
  if (!used.has(base.toLocaleLowerCase())) return base;
  let sequence = 2;
  while (used.has(`${base} ${sequence}`.toLocaleLowerCase())) sequence += 1;
  return `${base} ${sequence}`;
}

async function duplicateSavedQuery(s) {
  const list = readSavedQueries();
  const duplicate = {
    ...s,
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: uniqueSavedQueryName(`${String(s.name || '').trim()} ${t('queryExplorer.copySuffix')}`, list),
    updatedAt: Date.now()
  };
  list.unshift(duplicate);
  writeSavedQueries(list.slice(0, 100));
  await selectSavedQuery(duplicate, { focusName: true });
  showToast(t('queryExplorer.queryDuplicated'), 'info');
}

function refreshSavedQueriesListUi() {
  const wrap = document.getElementById('queryExplorerSavedQueriesList');
  if (!wrap) return;
  const search = String(document.getElementById('queryExplorerSavedQueriesSearch')?.value || '').trim().toLocaleLowerCase();
  const queries = readSavedQueries().filter((query) => {
    if (!search) return true;
    return [query?.name, query?.body, query?.api, query?.lang]
      .some((value) => String(value || '').toLocaleLowerCase().includes(search));
  });
  wrap.innerHTML = '';
  if (!queries.length) {
    const empty = document.createElement('p');
    empty.className = 'query-explorer-saved-empty';
    empty.textContent = t(search ? 'queryExplorer.noSavedQueryMatches' : 'queryExplorer.noSavedQueries');
    wrap.appendChild(empty);
    return;
  }
  for (const s of queries) {
    const row = document.createElement('div');
    row.className = 'anonymous-apex-script-item-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `anonymous-apex-script-item${selectedSavedQueryId === s.id ? ' active' : ''}`;
    btn.innerHTML = `<strong>${escapeHtml(s.name || t('queryExplorer.untitledQuery'))}</strong><span>${escapeHtml(`${String(s.api || 'rest').toUpperCase()} · ${String(s.lang || 'soql').toUpperCase()}`)}</span>`;
    btn.title = t('queryExplorer.loadSavedQuery');
    btn.addEventListener('click', () => void selectSavedQuery(s));
    const actions = document.createElement('div');
    actions.className = 'anonymous-apex-script-item-actions';

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'anonymous-apex-script-rename-btn';
    rename.title = t('queryExplorer.editSavedQuery');
    rename.textContent = '✎';
    rename.addEventListener('click', (event) => {
      event.stopPropagation();
      void selectSavedQuery(s, { focusName: true });
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'anonymous-apex-script-delete-btn';
    del.title = t('queryExplorer.deleteSavedQuery');
    del.textContent = 'X';
    del.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const ok = await confirmSfocToolAction(
        t('queryExplorer.confirmDeleteQuery', { name: String(s.name || '') }),
        t('modal.action.deleteQuery')
      );
      if (!ok) return;
      const list = readSavedQueries().filter((x) => x.id !== s.id);
      writeSavedQueries(list);
      if (selectedSavedQueryId === s.id) selectedSavedQueryId = '';
      syncSaveQueryButtonLabels();
      refreshSavedQueriesListUi();
    });
    const duplicate = document.createElement('button');
    duplicate.type = 'button';
    duplicate.className = 'anonymous-apex-script-rename-btn';
    duplicate.title = t('queryExplorer.duplicateSavedQuery');
    duplicate.textContent = '+';
    duplicate.addEventListener('click', (event) => {
      event.stopPropagation();
      void duplicateSavedQuery(s);
    });

    actions.appendChild(rename);
    actions.appendChild(duplicate);
    actions.appendChild(del);
    row.appendChild(btn);
    row.appendChild(actions);
    wrap.appendChild(row);
  }
}

async function applySavedQueryEntry(s) {
  const apiSel = /** @type {HTMLSelectElement | null} */ (document.getElementById('queryExplorerApiSelect'));
  const langSel = /** @type {HTMLSelectElement | null} */ (document.getElementById('queryExplorerLangSelect'));
  const api = s.api === 'tooling' || s.api === 'rest' ? s.api : 'rest';
  const lang = s.lang === 'sosl' || s.lang === 'soql' ? s.lang : 'soql';
  if (apiSel) apiSel.value = api;
  if (langSel) langSel.value = lang;
  syncToolingSoslRule();
  syncQueryExplorerEditorLanguage();
  await setQueryExplorerEditorValue(String(s.body || ''));
}

async function persistQueryWithName(name) {
  await ensureQueryExplorerEditor();
  const n = String(name || '').trim();
  const body = getQueryExplorerEditorRawText();
  if (!n) {
    showToast(t('queryExplorer.queryNameRequired'), 'warn');
    return false;
  }
  if (!body.trim()) {
    showToast(t('queryExplorer.emptyQuerySave'), 'warn');
    return false;
  }
  const { api, lang } = getQueryExplorerApiLangFromControls();
  const list = readSavedQueries();
  const selected = selectedSavedQueryId && list.find((item) => item.id === selectedSavedQueryId);
  const sameName = findSavedQueryByName(n);
  if (sameName && sameName.id !== selected?.id) {
    showToast(t('queryExplorer.queryNameDuplicate'), 'warn');
    return false;
  }
  const existing = selected || sameName;
  if (existing) {
    const ix = list.findIndex((x) => x.id === existing.id);
    if (ix >= 0) {
      list[ix] = { ...list[ix], name: n, body, api, lang, updatedAt: Date.now() };
      selectedSavedQueryId = list[ix].id;
      writeSavedQueries(list);
      refreshSavedQueriesListUi();
      showToast(t('queryExplorer.queryUpdated'), 'info');
      syncSaveQueryButtonLabels();
      return true;
    }
  }
  selectedSavedQueryId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  list.unshift({ id: selectedSavedQueryId, name: n, body, api, lang, updatedAt: Date.now() });
  writeSavedQueries(list.slice(0, 100));
  refreshSavedQueriesListUi();
  showToast(t('queryExplorer.querySaved'), 'info');
  syncSaveQueryButtonLabels();
  return true;
}

function setupQueryExplorerSavedQueriesUi() {
  const saveNamedBtn = document.getElementById('queryExplorerSaveNamedQueryBtn');
  const openModalBtn = document.getElementById('queryExplorerOpenSavedModalBtn');
  const newSavedQueryBtn = document.getElementById('queryExplorerNewSavedQueryBtn');
  const searchInput = document.getElementById('queryExplorerSavedQueriesSearch');
  const scriptNameInput = document.getElementById('queryExplorerQueryNameInput');
  const backdrop = document.querySelector('#queryExplorerSavedQueriesModal [data-query-explorer-saved-backdrop="1"]');
  const closeBtn = document.getElementById('queryExplorerSavedQueriesModalCloseBtn');
  if (saveNamedBtn) {
    saveNamedBtn.addEventListener('click', () => {
      const inp = document.getElementById('queryExplorerQueryNameInput');
      void persistQueryWithName(inp?.value || '');
    });
  }
  if (openModalBtn) openModalBtn.addEventListener('click', () => openQueryExplorerSavedModal());
  if (newSavedQueryBtn) newSavedQueryBtn.addEventListener('click', startNewSavedQuery);
  if (backdrop) backdrop.addEventListener('click', () => closeQueryExplorerSavedModal());
  if (closeBtn) closeBtn.addEventListener('click', () => closeQueryExplorerSavedModal());
  if (scriptNameInput) {
    scriptNameInput.addEventListener('input', () => {
      syncSaveQueryButtonLabels();
    });
  }
  if (searchInput) searchInput.addEventListener('input', refreshSavedQueriesListUi);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('queryExplorerSavedQueriesModal');
    if (modal && !modal.classList.contains('hidden')) {
      e.preventDefault();
      closeQueryExplorerSavedModal();
    }
  });
  refreshSavedQueriesListUi();
  syncSaveQueryButtonLabels();
}

export async function applyQueryExplorerFromUrl() {
  if (appliedQueryExplorerUrl) return;
  const parsed = parseQueryExplorerDeepLink(window.location.search);
  if (!parsed?.query) return;
  appliedQueryExplorerUrl = true;
  const apiSel = /** @type {HTMLSelectElement} */ (document.getElementById('queryExplorerApiSelect'));
  const langSel = /** @type {HTMLSelectElement} */ (document.getElementById('queryExplorerLangSelect'));
  if (apiSel) apiSel.value = parsed.api === 'tooling' ? 'tooling' : 'rest';
  if (langSel) langSel.value = parsed.lang === 'sosl' ? 'sosl' : 'soql';
  await ensureQueryExplorerEditor();
  setQueryExplorerEditorValue(parsed.query);
  syncQueryExplorerEditorLanguage();
  syncToolingSoslRule();
}

export async function refreshQueryExplorerPanel() {
  // Empieza a cargar el módulo mientras se prepara Monaco y la vista. Así la
  // primera página de Salesforce puede pintarse sin esperar otro import.
  void loadTabulator();
  const schemaKey = state.leftOrgId || state.rightOrgId || null;
  if (schemaKey !== lastQueryExplorerSchemaOrgId) {
    lastQueryExplorerSchemaOrgId = schemaKey;
    invalidateQueryExplorerSchemaCache();
  }
  void ensureQueryExplorerEditor();
  await applyQueryExplorerFromUrl();

  const toggle = /** @type {HTMLInputElement} */ (document.getElementById('queryExplorerCompareToggle'));
  if (toggle) toggle.checked = !!state.queryExplorerCompareMode;
  syncToolingSoslRule();
  syncCompareLayoutUi();
  if (state.queryExplorerCompareMode) await renderers.left?.renderLocal();
  else await renderers.single?.renderLocal();
  updateCompareTitles();

  const status = document.getElementById('queryExplorerStatus');
  if (!state.leftOrgId && status && getSelectedArtifactType() === 'QueryExplorer')
    status.textContent = t('queryExplorer.selectLeft');
}

export function setupQueryExplorerPanel() {
  renderers.single = wireSingle();
  renderers.left = wireCompareLeft();
  renderers.right = wireCompareRight();

  const runBtn = document.getElementById('queryExplorerRunBtn');
  const toggle = /** @type {HTMLInputElement} */ (document.getElementById('queryExplorerCompareToggle'));
  const apiSel = document.getElementById('queryExplorerApiSelect');
  const langSel = document.getElementById('queryExplorerLangSelect');
  const compareMatchField = /** @type {HTMLSelectElement | null} */ (document.getElementById('queryExplorerCompareMatchField'));

  runBtn?.addEventListener('click', () => void runExecute());
  setupQueryExplorerEditorResize();
  toggle?.addEventListener('change', () => {
    state.queryExplorerCompareMode = !!toggle.checked;
    applyArtifactTypeUi();
    void refreshQueryExplorerPanel();
  });
  apiSel?.addEventListener('change', syncToolingSoslRule);
  langSel?.addEventListener('change', () => {
    syncToolingSoslRule();
    syncQueryExplorerEditorLanguage();
  });
  compareMatchField?.addEventListener('change', () => {
    queryCompareMatchField = compareMatchField.value || 'auto';
    void scheduleCompareRender();
  });

  document.getElementById('queryExplorerSingleCsv')?.addEventListener('click', () => exportCsv('single'));
  document.getElementById('queryExplorerSingleJson')?.addEventListener('click', () => exportJson('single'));
  document.getElementById('queryExplorerSingleCopyCsv')?.addEventListener('click', () => void copyQueryExport('single', 'csv'));
  document.getElementById('queryExplorerSingleCopyExcel')?.addEventListener('click', () => void copyQueryExport('single', 'excel'));
  document.getElementById('queryExplorerSendToImportBtn')?.addEventListener('click', () => void sendQueryRowsToImport());
  document.getElementById('queryExplorerLeftCsv')?.addEventListener('click', () => exportCsv('left'));
  document.getElementById('queryExplorerLeftJson')?.addEventListener('click', () => exportJson('left'));
  document.getElementById('queryExplorerLeftCopyCsv')?.addEventListener('click', () => void copyQueryExport('left', 'csv'));
  document.getElementById('queryExplorerLeftCopyExcel')?.addEventListener('click', () => void copyQueryExport('left', 'excel'));
  document.getElementById('queryExplorerLeftSendToImportBtn')?.addEventListener('click', () => void sendQueryRowsToImport('left'));
  document.getElementById('queryExplorerRightCsv')?.addEventListener('click', () => exportCsv('right'));
  document.getElementById('queryExplorerRightJson')?.addEventListener('click', () => exportJson('right'));
  document.getElementById('queryExplorerRightCopyCsv')?.addEventListener('click', () => void copyQueryExport('right', 'csv'));
  document.getElementById('queryExplorerRightCopyExcel')?.addEventListener('click', () => void copyQueryExport('right', 'excel'));
  document.getElementById('queryExplorerRightSendToImportBtn')?.addEventListener('click', () => void sendQueryRowsToImport('right'));

  syncCompareLayoutUi();
  syncToolingSoslRule();

  renderers.single.renderLocal();
  renderers.left.renderLocal();
  renderers.right.renderLocal();

  setupQueryExplorerSavedQueriesUi();
  bindRunShortcut('QueryExplorer', () => void runExecute(), { allowInMonaco: true });
}
