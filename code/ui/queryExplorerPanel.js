import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { applyArtifactTypeUi, getSelectedArtifactType } from './artifactTypeUi.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';

function showQueryExplorerErrorToast(e) {
  const msg = String(e?.message || e);
  const code = e && typeof e === 'object' && e.salesforceErrorCode ? String(e.salesforceErrorCode).trim() : '';
  showToast(msg, 'error', code ? { title: code } : {});
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

const QUERY_EXPLORER_SAVED_KEY = 'sfoc_query_explorer_saved_queries';
let selectedSavedQueryId = '';

let lastQueryExplorerSchemaOrgId = null;

/** @typedef {{ records: unknown[], totalSize?: number, nextPath: string | null }} Snapshot */

/** @param {unknown} snap */
function snapshotFromRunResponse(snap) {
  return {
    records: Array.isArray(snap?.records) ? snap.records : [],
    totalSize: typeof snap?.totalSize === 'number' ? snap.totalSize : undefined,
    nextPath: snap?.nextPath != null && snap.nextPath !== '' ? String(snap.nextPath) : null
  };
}

/** Navegación prev/next sin reconsultar páginas ya visitadas */
class ExplorerPageNav {
  constructor() {
    this.back = [];
    /** @type {Snapshot | null} */
    this.current = null;
    this.forward = [];
  }

  resetFromResponse(resp) {
    this.back = [];
    this.forward = [];
    this.current = snapshotFromRunResponse(resp);
  }

  /**
   * @param {(path: string) => Promise<{ ok?: boolean, reason?: string, error?: string, records?: unknown[], totalSize?: number, nextPath?: string | null }>} fetchPage
   */
  async loadNext(fetchPage) {
    if (this.forward.length) {
      this.back.push(this.current);
      this.current = this.forward.pop();
      return { ranFetch: false };
    }
    if (!this.current?.nextPath) return { ranFetch: false };
    const next = await fetchPage(this.current.nextPath);
    if (!next?.ok) {
      const err =
        next?.reason === 'NO_SID' ? t('queryExplorer.noSid') : next?.error || t('queryExplorer.runError');
      const ex = new Error(err);
      if (next?.errorCode) ex.salesforceErrorCode = String(next.errorCode);
      throw ex;
    }
    this.back.push(this.current);
    this.forward = [];
    this.current = snapshotFromRunResponse(next);
    return { ranFetch: true };
  }

  prev() {
    if (!this.canPrev()) return;
    this.forward.unshift(this.current);
    this.current = this.back.pop();
  }

  canPrev() {
    return this.back.length > 0;
  }

  canNext() {
    return !!(this.forward.length || this.current?.nextPath);
  }

  getRows() {
    return this.current?.records || [];
  }

  metaLine() {
    const n = this.getRows().length;
    const tot = this.current?.totalSize;
    if (typeof tot === 'number')
      return t('queryExplorer.pageMeta', { rows: String(n), total: String(tot) });
    return t('queryExplorer.pageMetaRows', { rows: String(n) });
  }

  resetAll(rows, totalSize) {
    this.back = [];
    this.forward = [];
    this.current = {
      records: Array.isArray(rows) ? rows : [],
      totalSize: typeof totalSize === 'number' ? totalSize : undefined,
      nextPath: null
    };
  }
}

/** @type {ExplorerPageNav} */
const navSingle = new ExplorerPageNav();
/** @type {ExplorerPageNav} */
const navLeft = new ExplorerPageNav();
/** @type {ExplorerPageNav} */
const navRight = new ExplorerPageNav();

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
    try {
      return JSON.stringify(deepStripAttributes(val));
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
  for (const [k, v] of Object.entries(obj)) {
    const path = `${prefix}.${k}`;
    if (isFlattenableNestedObject(v)) {
      const inner = /** @type {Record<string, unknown>} */ (deepStripAttributes(v));
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        flattenNestedInto(out, path, inner);
      } else {
        out[path] = v;
      }
    } else {
      out[path] = v;
    }
  }
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
      const inner = /** @type {Record<string, unknown>} */ (deepStripAttributes(v));
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        const nBefore = Object.keys(out).length;
        flattenNestedInto(out, k, inner);
        if (Object.keys(out).length === nBefore) out[k] = v;
        continue;
      }
    }
    out[k] = v;
  }
  return out;
}

/** @param {Record<string, unknown> | null | undefined} r */
function maybeFlattenRow(r) {
  if (!r || typeof r !== 'object') return /** @type {Record<string, unknown>} */ ({});
  return flattenQueryExplorerRow(r);
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
    Object.keys(flattenQueryExplorerRow(/** @type {Record<string, unknown>} */ (r))).forEach((k) => set.add(k));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
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
  if (L.length === 1 && R.length === 1) {
    return {
      left: [L[0] && typeof L[0] === 'object' ? /** @type {Record<string, unknown>} */ (L[0]) : null],
      right: [R[0] && typeof R[0] === 'object' ? /** @type {Record<string, unknown>} */ (R[0]) : null]
    };
  }
  const leftHasId = L.some((r) => r && typeof r === 'object' && r.Id != null);
  const rightHasId = R.some((r) => r && typeof r === 'object' && r.Id != null);
  if (leftHasId && rightHasId) {
    /** @type Map<string, Record<string, unknown>> */
    const lm = new Map();
    for (const r of L) {
      if (r && typeof r === 'object' && r.Id != null) lm.set(String(r.Id), /** @type {Record<string, unknown>} */ (r));
    }
    /** @type Map<string, Record<string, unknown>> */
    const rm = new Map();
    for (const r of R) {
      if (r && typeof r === 'object' && r.Id != null) rm.set(String(r.Id), /** @type {Record<string, unknown>} */ (r));
    }
    const ids = [...new Set([...lm.keys(), ...rm.keys()])].sort((a, b) => a.localeCompare(b));
    return {
      left: ids.map((id) => lm.get(id) ?? null),
      right: ids.map((id) => rm.get(id) ?? null)
    };
  }
  const n = Math.max(L.length, R.length);
  return {
    left: Array.from({ length: n }, (_, i) => (L[i] && typeof L[i] === 'object' ? /** @type {Record<string, unknown>} */ (L[i]) : null)),
    right: Array.from({ length: n }, (_, i) =>
      R[i] && typeof R[i] === 'object' ? /** @type {Record<string, unknown>} */ (R[i]) : null
    )
  };
}

/**
 * Solo columnas cuyo valor difiere en al menos un par de filas alineadas (o falta en un lado).
 * @param {(Record<string, unknown> | null)[]} leftAligned
 * @param {(Record<string, unknown> | null)[]} rightAligned
 * @returns {string[]}
 */
function computeDiffColumnKeys(leftAligned, rightAligned) {
  const diff = new Set();
  const n = Math.max(leftAligned.length, rightAligned.length);
  for (let i = 0; i < n; i++) {
    const l = leftAligned[i];
    const r = rightAligned[i];
    const lf = l && typeof l === 'object' ? flattenQueryExplorerRow(/** @type {Record<string, unknown>} */ (l)) : null;
    const rf = r && typeof r === 'object' ? flattenQueryExplorerRow(/** @type {Record<string, unknown>} */ (r)) : null;
    const keySet = new Set();
    if (lf) Object.keys(lf).forEach((k) => k !== 'attributes' && keySet.add(k));
    if (rf) Object.keys(rf).forEach((k) => k !== 'attributes' && keySet.add(k));
    for (const k of keySet) {
      const a = flatFieldValue(lf, k);
      const b = flatFieldValue(rf, k);
      if (cellCompareSignature(a) !== cellCompareSignature(b)) diff.add(k);
    }
  }
  const list = [...diff];
  list.sort((a, b) => {
    if (a === 'Id') return -1;
    if (b === 'Id') return 1;
    return a.localeCompare(b);
  });
  return list;
}

/**
 * @param {HTMLElement | null} mount
 * @param {unknown[] | null} rows filas puede incluir null (solo en comparación alineada)
 * @param {string[] | null} columnKeys si null, se deduce de las filas
 * @param {{ allowEmptyKeySet?: boolean, emptyColumnsMessage?: string }} [opts]
 */
function renderTableInto(mount, rows, columnKeys = null, opts = {}) {
  if (!mount) return;
  mount.innerHTML = '';
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'query-explorer-table-empty';
    p.setAttribute('data-i18n', 'queryExplorer.empty');
    p.textContent = t('queryExplorer.empty');
    mount.appendChild(p);
    return;
  }
  let keys = columnKeys != null ? [...columnKeys] : unionKeysVisible(list.filter(Boolean));
  if (!keys.length && opts.allowEmptyKeySet && opts.emptyColumnsMessage) {
    const p = document.createElement('p');
    p.className = 'query-explorer-table-empty';
    p.textContent = opts.emptyColumnsMessage;
    mount.appendChild(p);
    return;
  }
  if (!keys.length) keys = unionKeysVisible(list.filter(Boolean));
  if (!keys.length) {
    const p = document.createElement('p');
    p.className = 'query-explorer-table-empty';
    p.textContent = t('queryExplorer.empty');
    mount.appendChild(p);
    return;
  }
  const table = document.createElement('table');
  table.className = 'query-explorer-data-table';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const k of keys) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = k;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  const tbody = document.createElement('tbody');
  const missingLabel = t('queryExplorer.rowMissingInOtherOrg');
  for (const rec of list) {
    const tr = document.createElement('tr');
    const isMissing = rec == null;
    const row = isMissing ? {} : maybeFlattenRow(rec && typeof rec === 'object' ? /** @type {Record<string, unknown>} */ (rec) : null);
    for (const k of keys) {
      const td = document.createElement('td');
      td.textContent = isMissing ? missingLabel : formatCell(row[k]);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(thead);
  table.appendChild(tbody);
  mount.appendChild(table);
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

async function fetchPage(orgId, variant, queryText, pagePath) {
  return bg({
    type: 'queryExplorer:run',
    orgId,
    variant,
    queryText,
    pagePath: pagePath || undefined
  });
}

function renderCompareTables() {
  if (!state.queryExplorerCompareMode) return;
  const mL = document.getElementById('queryExplorerLeftTableMount');
  const mR = document.getElementById('queryExplorerRightTableMount');
  const rawL = navLeft.getRows();
  const rawR = navRight.getRows();
  const { left: alignL, right: alignR } = alignRowsForCompare(rawL, rawR);
  const keys = computeDiffColumnKeys(alignL, alignR);
  const noDiffMsg = keys.length ? '' : t('queryExplorer.compareNoDiffColumns');
  renderTableInto(mL, alignL, keys, {
    allowEmptyKeySet: true,
    emptyColumnsMessage: noDiffMsg
  });
  renderTableInto(mR, alignR, keys, {
    allowEmptyKeySet: true,
    emptyColumnsMessage: noDiffMsg
  });

  const metaL = document.getElementById('queryExplorerLeftMeta');
  const metaR = document.getElementById('queryExplorerRightMeta');
  if (metaL) metaL.textContent = navLeft.metaLine();
  if (metaR) metaR.textContent = navRight.metaLine();
  const prevL = document.getElementById('queryExplorerLeftPrev');
  const nextL = document.getElementById('queryExplorerLeftNext');
  const prevR = document.getElementById('queryExplorerRightPrev');
  const nextR = document.getElementById('queryExplorerRightNext');
  if (prevL) prevL.disabled = !navLeft.canPrev();
  if (nextL) nextL.disabled = !navLeft.canNext();
  if (prevR) prevR.disabled = !navRight.canPrev();
  if (nextR) nextR.disabled = !navRight.canNext();
}

/**
 * @returns {{ keys: string[], rows: (Record<string, unknown>|null)[] }}
 */
function getCompareExportSlice(which) {
  const { left: alignL, right: alignR } = alignRowsForCompare(navLeft.getRows(), navRight.getRows());
  const keys = computeDiffColumnKeys(alignL, alignR);
  const rows = which === 'right' ? alignR : alignL;
  return { keys, rows };
}

function bindPagination(nav, handlers) {
  const { prevBtn, nextBtn, metaEl, mount, variantGetter, orgIdGetter, customRender } = handlers;
  const renderLocal = () => {
    if (typeof customRender === 'function') customRender();
    else {
      renderTableInto(mount, nav.getRows());
      if (metaEl) metaEl.textContent = nav.metaLine();
      if (prevBtn) prevBtn.disabled = !nav.canPrev();
      if (nextBtn) nextBtn.disabled = !nav.canNext();
    }
  };

  prevBtn?.addEventListener('click', () => {
    nav.prev();
    renderLocal();
  });

  nextBtn?.addEventListener('click', async () => {
    const orgId = orgIdGetter();
    const variant = variantGetter();
    await ensureQueryExplorerEditor();
    const q = getQueryExplorerQueryText();
    if (!orgId || !variant) return;
    showToastWithSpinner(t('queryExplorer.loading'));
    try {
      await nav.loadNext((path) => fetchPage(orgId, variant, q, path));
      renderLocal();
    } catch (e) {
      showQueryExplorerErrorToast(e);
    } finally {
      dismissSpinnerToast();
    }
  });

  return { renderLocal };
}

function wireSingle() {
  const prev = document.getElementById('queryExplorerSinglePrev');
  const next = document.getElementById('queryExplorerSingleNext');
  const meta = document.getElementById('queryExplorerSingleMeta');
  const mount = document.getElementById('queryExplorerSingleTableMount');
  return bindPagination(navSingle, {
    prevBtn: prev,
    nextBtn: next,
    metaEl: meta,
    mount,
    variantGetter: variantFromControls,
    orgIdGetter: () => state.leftOrgId || ''
  });
}

function wireCompareLeft() {
  return bindPagination(navLeft, {
    prevBtn: document.getElementById('queryExplorerLeftPrev'),
    nextBtn: document.getElementById('queryExplorerLeftNext'),
    metaEl: document.getElementById('queryExplorerLeftMeta'),
    mount: document.getElementById('queryExplorerLeftTableMount'),
    variantGetter: variantFromControls,
    orgIdGetter: () => state.leftOrgId || '',
    customRender: () => renderCompareTables()
  });
}

function wireCompareRight() {
  return bindPagination(navRight, {
    prevBtn: document.getElementById('queryExplorerRightPrev'),
    nextBtn: document.getElementById('queryExplorerRightNext'),
    metaEl: document.getElementById('queryExplorerRightMeta'),
    mount: document.getElementById('queryExplorerRightTableMount'),
    variantGetter: variantFromControls,
    orgIdGetter: () => state.rightOrgId || '',
    customRender: () => renderCompareTables()
  });
}

let renderers = { single: null, left: null, right: null };

async function runQueryForOrg(orgId, variant, queryText) {
  const res = await fetchPage(orgId, variant, queryText, undefined);
  if (!res?.ok) {
    const err = res?.reason === 'NO_SID' ? t('queryExplorer.noSid') : res?.error || t('queryExplorer.runError');
    const ex = new Error(err);
    if (res?.errorCode) ex.salesforceErrorCode = String(res.errorCode);
    throw ex;
  }
  return res;
}

async function runExecute() {
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

  showToastWithSpinner(t('queryExplorer.running'));
  if (status) status.textContent = '';
  try {
    if (state.queryExplorerCompareMode) {
      const [lr, rr] = await Promise.all([
        runQueryForOrg(state.leftOrgId, variant, q),
        runQueryForOrg(state.rightOrgId, variant, q)
      ]);
      navLeft.resetFromResponse(lr);
      navRight.resetFromResponse(rr);
      renderers.left?.renderLocal();
      renderers.right?.renderLocal();
    } else {
      const lr = await runQueryForOrg(state.leftOrgId, variant, q);
      navSingle.resetFromResponse(lr);
      renderers.single?.renderLocal();
    }
  } catch (e) {
    if (status) status.textContent = String(e?.message || e);
    showQueryExplorerErrorToast(e);
  } finally {
    dismissSpinnerToast();
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
  if (compare) updateCompareTitles();
}

/** @returns {ExplorerPageNav} */
function activeExportNav(which) {
  if (which === 'right') return navRight;
  if (which === 'single') return navSingle;
  return navLeft;
}

function exportCsv(which) {
  const nav = activeExportNav(which);
  let rows = nav.getRows();
  let keys = /** @type {string[] | null} */ (null);
  if (state.queryExplorerCompareMode) {
    const side = which === 'right' ? 'right' : 'left';
    const pack = getCompareExportSlice(side);
    rows = pack.rows;
    keys = pack.keys;
    if (rows.length && keys.length === 0) {
      showToast(t('queryExplorer.compareExportNoDiff'), 'warn');
      return;
    }
  }
  if (!rows.length) {
    showToast(t('queryExplorer.exportEmpty'), 'warn');
    return;
  }
  const blob = rowsToCsvBlob(rows, keys);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
  downloadBlob(blob, `query-explorer-${stamp}.csv`);
}

function exportJson(which) {
  const nav = activeExportNav(which);
  let rows = nav.getRows();
  let keys = /** @type {string[] | null} */ (null);
  if (state.queryExplorerCompareMode) {
    const side = which === 'right' ? 'right' : 'left';
    const pack = getCompareExportSlice(side);
    rows = pack.rows;
    keys = pack.keys;
    if (rows.length && keys.length === 0) {
      showToast(t('queryExplorer.compareExportNoDiff'), 'warn');
      return;
    }
  }
  if (!rows.length) {
    showToast(t('queryExplorer.exportEmpty'), 'warn');
    return;
  }
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
  const quickBtn = document.getElementById('queryExplorerQuickSaveBtn');
  const inp = /** @type {HTMLInputElement | null} */ (document.getElementById('queryExplorerQueryNameInput'));
  if (!inp) return;
  const hasExisting = !!findSavedQueryByName(inp.value);
  const quickHasTarget =
    !!selectedSavedQueryId && readSavedQueries().some((x) => x.id === selectedSavedQueryId);
  const keyModal = hasExisting ? 'queryExplorer.updateNamedQuery' : 'queryExplorer.saveNamedQuery';
  const keyQuick = quickHasTarget ? 'queryExplorer.updateNamedQuery' : 'queryExplorer.saveNamedQuery';
  if (saveBtn) saveBtn.textContent = t(keyModal);
  if (quickBtn) quickBtn.textContent = t(keyQuick);
}

function closeQueryExplorerSavedModal() {
  const modal = document.getElementById('queryExplorerSavedQueriesModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function openQueryExplorerSavedModal() {
  const modal = document.getElementById('queryExplorerSavedQueriesModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
  refreshSavedQueriesListUi();
  syncSaveQueryButtonLabels();
  document.getElementById('queryExplorerQueryNameInput')?.focus();
}

function refreshSavedQueriesListUi() {
  const wrap = document.getElementById('queryExplorerSavedQueriesList');
  if (!wrap) return;
  const queries = readSavedQueries();
  wrap.innerHTML = '';
  for (const s of queries) {
    const row = document.createElement('div');
    row.className = 'anonymous-apex-script-item-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `anonymous-apex-script-item${selectedSavedQueryId === s.id ? ' active' : ''}`;
    btn.textContent = s.name || 'query';
    btn.addEventListener('click', () => {
      selectedSavedQueryId = s.id;
      void applySavedQueryEntry(s);
      const inp = document.getElementById('queryExplorerQueryNameInput');
      if (inp) inp.value = String(s.name || '');
      syncSaveQueryButtonLabels();
      refreshSavedQueriesListUi();
    });
    const actions = document.createElement('div');
    actions.className = 'anonymous-apex-script-item-actions';

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'anonymous-apex-script-rename-btn';
    rename.title = t('queryExplorer.renameQuery');
    rename.textContent = '✎';
    rename.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const nextNameRaw = window.prompt(t('queryExplorer.renameQueryPrompt'), String(s.name || ''));
      if (nextNameRaw == null) return;
      const nextName = String(nextNameRaw).trim();
      if (!nextName) {
        showToast(t('queryExplorer.queryNameRequired'), 'warn');
        return;
      }
      const currentLower = String(s.name || '').trim().toLocaleLowerCase();
      const nextLower = nextName.toLocaleLowerCase();
      if (currentLower !== nextLower) {
        const duplicated = readSavedQueries().some(
          (x) =>
            x.id !== s.id && String(x?.name || '').trim().toLocaleLowerCase() === nextLower
        );
        if (duplicated) {
          showToast(t('queryExplorer.queryNameDuplicate'), 'warn');
          return;
        }
      }
      const list = readSavedQueries();
      const ix = list.findIndex((x) => x.id === s.id);
      if (ix < 0) return;
      list[ix] = { ...list[ix], name: nextName, updatedAt: Date.now() };
      writeSavedQueries(list);
      if (selectedSavedQueryId === s.id) {
        const inp = document.getElementById('queryExplorerQueryNameInput');
        if (inp) inp.value = nextName;
      }
      syncSaveQueryButtonLabels();
      refreshSavedQueriesListUi();
      showToast(t('queryExplorer.queryUpdated'), 'info');
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'anonymous-apex-script-delete-btn';
    del.title = t('queryExplorer.deleteSavedQuery');
    del.textContent = 'X';
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const ok = window.confirm(t('queryExplorer.confirmDeleteQuery', { name: String(s.name || '') }));
      if (!ok) return;
      const list = readSavedQueries().filter((x) => x.id !== s.id);
      writeSavedQueries(list);
      if (selectedSavedQueryId === s.id) selectedSavedQueryId = '';
      syncSaveQueryButtonLabels();
      refreshSavedQueriesListUi();
    });
    actions.appendChild(rename);
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
  const existing = findSavedQueryByName(n);
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

async function quickSaveCurrentQuery() {
  await ensureQueryExplorerEditor();
  const body = getQueryExplorerEditorRawText();
  if (!body.trim()) {
    showToast(t('queryExplorer.emptyQuerySave'), 'warn');
    return;
  }
  const list = readSavedQueries();
  const byId = selectedSavedQueryId && list.find((x) => x.id === selectedSavedQueryId);
  if (byId) {
    const ix = list.findIndex((x) => x.id === byId.id);
    if (ix >= 0) {
      const { api, lang } = getQueryExplorerApiLangFromControls();
      list[ix] = { ...list[ix], body, api, lang, updatedAt: Date.now() };
      writeSavedQueries(list);
      refreshSavedQueriesListUi();
      showToast(t('queryExplorer.queryUpdated'), 'info');
      syncSaveQueryButtonLabels();
      return;
    }
  }
  const nameRaw = window.prompt(t('queryExplorer.quickSaveQueryNamePrompt'), '');
  if (nameRaw == null) return;
  const name = String(nameRaw).trim();
  if (!name) {
    showToast(t('queryExplorer.queryNameRequired'), 'warn');
    return;
  }
  const ok = await persistQueryWithName(name);
  if (ok) {
    const inp = document.getElementById('queryExplorerQueryNameInput');
    if (inp) inp.value = name;
  }
}

function setupQueryExplorerSavedQueriesUi() {
  const saveNamedBtn = document.getElementById('queryExplorerSaveNamedQueryBtn');
  const openModalBtn = document.getElementById('queryExplorerOpenSavedModalBtn');
  const quickSaveBtn = document.getElementById('queryExplorerQuickSaveBtn');
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
  if (quickSaveBtn) quickSaveBtn.addEventListener('click', () => void quickSaveCurrentQuery());
  if (backdrop) backdrop.addEventListener('click', () => closeQueryExplorerSavedModal());
  if (closeBtn) closeBtn.addEventListener('click', () => closeQueryExplorerSavedModal());
  if (scriptNameInput) {
    scriptNameInput.addEventListener('input', () => {
      syncSaveQueryButtonLabels();
    });
  }
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

export async function refreshQueryExplorerPanel() {
  const schemaKey = state.leftOrgId || state.rightOrgId || null;
  if (schemaKey !== lastQueryExplorerSchemaOrgId) {
    lastQueryExplorerSchemaOrgId = schemaKey;
    invalidateQueryExplorerSchemaCache();
  }
  void ensureQueryExplorerEditor();

  const toggle = /** @type {HTMLInputElement} */ (document.getElementById('queryExplorerCompareToggle'));
  if (toggle) toggle.checked = !!state.queryExplorerCompareMode;
  syncToolingSoslRule();
  syncCompareLayoutUi();
  renderers.single?.renderLocal();
  renderers.left?.renderLocal();
  renderers.right?.renderLocal();
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

  document.getElementById('queryExplorerSingleCsv')?.addEventListener('click', () => exportCsv('single'));
  document.getElementById('queryExplorerSingleJson')?.addEventListener('click', () => exportJson('single'));
  document.getElementById('queryExplorerLeftCsv')?.addEventListener('click', () => exportCsv('left'));
  document.getElementById('queryExplorerLeftJson')?.addEventListener('click', () => exportJson('left'));
  document.getElementById('queryExplorerRightCsv')?.addEventListener('click', () => exportCsv('right'));
  document.getElementById('queryExplorerRightJson')?.addEventListener('click', () => exportJson('right'));

  syncCompareLayoutUi();
  syncToolingSoslRule();

  renderers.single.renderLocal();
  renderers.left.renderLocal();
  renderers.right.renderLocal();

  setupQueryExplorerSavedQueriesUi();
}
