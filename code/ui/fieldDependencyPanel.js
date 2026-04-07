/**
 * Field Dependency: lista CustomObject (org izquierda), retrieve en ambas orgs,
 * tabla de picklists dependientes parseando el .object de la izquierda.
 */
import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { readZipAllTextFiles, normalizeRetrieveZipPath } from '../lib/zipBinary.js';
import { t } from '../../shared/i18n.js';
const METADATA_NS = 'http://soap.sforce.com/2006/04/metadata';

/** @type {Array<{ fullName: string }>} */
let customObjectRecords = [];
let picklistWired = false;

/**
 * Tras un retrieve exitoso: XML del .object en izquierda y derecha (para comparar valueSettings).
 * @type {{ objectApiName: string, leftXml: string, rightXml: string | null, leftOrgName: string, rightOrgName: string } | null}
 * leftOrgName / rightOrgName: nombre del entorno en la extensión (label guardado).
 */
let fieldDepCache = null;

function clearFieldDepCache() {
  fieldDepCache = null;
}

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatApiVersion(v) {
  const n = Number(String(v ?? '60'));
  if (Number.isNaN(n)) return '60.0';
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

function buildCustomObjectPackageXml(apiVersion, objectFullName) {
  const v = formatApiVersion(apiVersion);
  const name = escapeXml(objectFullName);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${name}</members>
        <name>CustomObject</name>
    </types>
    <version>${escapeXml(v)}</version>
</Package>`;
}

async function getSavedOrg(orgId) {
  if (!orgId) return null;
  const res = await bg({ type: 'listSavedOrgs' });
  if (!res.ok) return null;
  return (res.orgs || []).find((o) => o.id === orgId) || null;
}

function findObjectFileInZipFiles(files, fullName) {
  const want = `${fullName}.object`.toLowerCase();
  for (const f of files) {
    const p = normalizeRetrieveZipPath(f.path);
    const base = (p.split('/').pop() || '').toLowerCase();
    if (base === want) return f;
  }
  return null;
}

function getFieldElementFromDoc(doc, fieldApiName) {
  if (!doc || !fieldApiName) return null;
  let fieldNodes = doc.getElementsByTagNameNS(METADATA_NS, 'fields');
  if (!fieldNodes.length) {
    fieldNodes = doc.getElementsByTagName('fields');
  }
  for (let i = 0; i < fieldNodes.length; i++) {
    const el = fieldNodes[i];
    const fnEl =
      el.getElementsByTagNameNS(METADATA_NS, 'fullName')[0] || el.getElementsByTagName('fullName')[0];
    if ((fnEl?.textContent || '').trim() === fieldApiName) {
      return el;
    }
  }
  return null;
}

/** Etiqueta &lt;label&gt; del campo en el documento ya parseado. */
function extractFieldLabelFromDoc(doc, fieldApiName) {
  if (!doc || !fieldApiName) return fieldApiName;
  const fieldEl = getFieldElementFromDoc(doc, fieldApiName);
  if (!fieldEl) return fieldApiName;
  const labEl =
    fieldEl.getElementsByTagNameNS(METADATA_NS, 'label')[0] ||
    fieldEl.getElementsByTagName('label')[0];
  const t = (labEl?.textContent || '').trim();
  return t || fieldApiName;
}

/**
 * Nombre del entorno tal como está guardado en la extensión (label), no el nombre de Salesforce.
 */
function savedOrgEnvLabel(org) {
  if (!org) return '—';
  const app = (org.label || '').trim();
  if (app) return app;
  return (org.displayName || '').trim() || org.instanceUrl || '—';
}

/**
 * Objeto - controlador - dependiente (cabecera comparar y `descriptor.name` en usage log).
 */
function fieldDependencyTripleDashed(objectApiName, controllingApi, dependentApi) {
  return [objectApiName, controllingApi, dependentApi]
    .map((s) => String(s ?? '').trim())
    .filter((s) => s.length > 0)
    .join(' - ');
}

/**
 * Campos con &lt;valueSet&gt;&lt;controllingField&gt;…&lt;/controllingField&gt; (picklist dependiente).
 * @returns {{ rows: Array<{ fullName: string, controllingField: string, controllingFieldLabel?: string, dependentFieldLabel?: string }>, errorMessage?: string }}
 */
function parseControllingFieldsFromCustomObjectXml(xml) {
  const empty = { rows: [] };
  if (!xml || !String(xml).trim()) {
    return { ...empty, errorMessage: t('fieldDep.emptyFile') };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) {
    return { ...empty, errorMessage: t('fieldDep.parseError') };
  }

  let fieldNodes = doc.getElementsByTagNameNS(METADATA_NS, 'fields');
  if (!fieldNodes.length) {
    fieldNodes = doc.getElementsByTagName('fields');
  }

  const rows = [];
  const seen = new Set();

  for (let i = 0; i < fieldNodes.length; i++) {
    const fieldEl = fieldNodes[i];
    const fullNameEl =
      fieldEl.getElementsByTagNameNS(METADATA_NS, 'fullName')[0] ||
      fieldEl.getElementsByTagName('fullName')[0];
    const fullName = (fullNameEl?.textContent || '').trim();

    const valueSet =
      fieldEl.getElementsByTagNameNS(METADATA_NS, 'valueSet')[0] ||
      fieldEl.getElementsByTagName('valueSet')[0];
    if (!valueSet) continue;

    const cfEl =
      valueSet.getElementsByTagNameNS(METADATA_NS, 'controllingField')[0] ||
      valueSet.getElementsByTagName('controllingField')[0];
    const controllingField = (cfEl?.textContent || '').trim();
    if (!controllingField) continue;

    const key = `${fullName}\0${controllingField}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ fullName: fullName || t('fieldDep.noFullName'), controllingField });
  }

  for (const row of rows) {
    row.controllingFieldLabel = extractFieldLabelFromDoc(doc, row.controllingField);
    row.dependentFieldLabel = extractFieldLabelFromDoc(doc, row.fullName);
  }

  rows.sort((a, b) => {
    const c = a.controllingField.localeCompare(b.controllingField);
    if (c !== 0) return c;
    return a.fullName.localeCompare(b.fullName);
  });
  return { rows };
}

/**
 * @param {string} objectXml
 * @param {string} dependentFullName API name del campo dependiente
 * @returns {{ pairs: Array<{ controllingFieldValue: string, valueName: string }>, error: string | null }}
 */
function extractValueSettingsPairs(objectXml, dependentFullName) {
  const empty = { pairs: [], error: null };
  if (!objectXml || !String(objectXml).trim()) {
    return { ...empty, error: t('fieldDep.noXmlContent') };
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(objectXml, 'text/xml');
  if (doc.querySelector('parsererror')) {
    return { ...empty, error: t('fieldDep.invalidXml') };
  }

  let fieldNodes = doc.getElementsByTagNameNS(METADATA_NS, 'fields');
  if (!fieldNodes.length) {
    fieldNodes = doc.getElementsByTagName('fields');
  }

  let fieldEl = null;
  for (let i = 0; i < fieldNodes.length; i++) {
    const el = fieldNodes[i];
    const fnEl =
      el.getElementsByTagNameNS(METADATA_NS, 'fullName')[0] || el.getElementsByTagName('fullName')[0];
    const fn = (fnEl?.textContent || '').trim();
    if (fn === dependentFullName) {
      fieldEl = el;
      break;
    }
  }

  if (!fieldEl) {
    return { ...empty, error: t('fieldDep.fieldNotFound', { field: dependentFullName }) };
  }

  const valueSet =
    fieldEl.getElementsByTagNameNS(METADATA_NS, 'valueSet')[0] ||
    fieldEl.getElementsByTagName('valueSet')[0];
  if (!valueSet) {
    return { ...empty, error: t('fieldDep.noValueSet') };
  }

  const pairs = [];
  let settings = valueSet.getElementsByTagNameNS(METADATA_NS, 'valueSettings');
  if (!settings.length) {
    settings = valueSet.getElementsByTagName('valueSettings');
  }

  for (let i = 0; i < settings.length; i++) {
    const vs = settings[i];
    const ctrlEl =
      vs.getElementsByTagNameNS(METADATA_NS, 'controllingFieldValue')[0] ||
      vs.getElementsByTagName('controllingFieldValue')[0];
    const valEl =
      vs.getElementsByTagNameNS(METADATA_NS, 'valueName')[0] || vs.getElementsByTagName('valueName')[0];
    const controllingFieldValue = (ctrlEl?.textContent || '').trim();
    const valueName = (valEl?.textContent || '').trim();
    pairs.push({ controllingFieldValue, valueName });
  }

  pairs.sort((a, b) => {
    const c = a.controllingFieldValue.localeCompare(b.controllingFieldValue);
    if (c !== 0) return c;
    return a.valueName.localeCompare(b.valueName);
  });

  return { pairs, error: null };
}

/**
 * Etiqueta del campo en el objeto (metadata &lt;label&gt;).
 */
function extractFieldLabel(objectXml, fieldApiName) {
  if (!objectXml || !fieldApiName) return fieldApiName;
  const parser = new DOMParser();
  const doc = parser.parseFromString(objectXml, 'text/xml');
  if (doc.querySelector('parsererror')) return fieldApiName;
  return extractFieldLabelFromDoc(doc, fieldApiName);
}

/**
 * Mapa API del valor de picklist → etiqueta (valueSetDefinition / value).
 */
function extractPicklistApiToLabelMap(objectXml, fieldApiName) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!objectXml || !fieldApiName) return map;
  const parser = new DOMParser();
  const doc = parser.parseFromString(objectXml, 'text/xml');
  if (doc.querySelector('parsererror')) return map;
  const fieldEl = getFieldElementFromDoc(doc, fieldApiName);
  if (!fieldEl) return map;
  const valueSet =
    fieldEl.getElementsByTagNameNS(METADATA_NS, 'valueSet')[0] ||
    fieldEl.getElementsByTagName('valueSet')[0];
  if (!valueSet) return map;
  const vsd =
    valueSet.getElementsByTagNameNS(METADATA_NS, 'valueSetDefinition')[0] ||
    valueSet.getElementsByTagName('valueSetDefinition')[0];
  if (!vsd) return map;
  let vals = vsd.getElementsByTagNameNS(METADATA_NS, 'value');
  if (!vals.length) vals = vsd.getElementsByTagName('value');
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    const fn =
      (v.getElementsByTagNameNS(METADATA_NS, 'fullName')[0] || v.getElementsByTagName('fullName')[0])
        ?.textContent?.trim() || '';
    const lab =
      (v.getElementsByTagNameNS(METADATA_NS, 'label')[0] || v.getElementsByTagName('label')[0])
        ?.textContent?.trim() || '';
    if (fn) map.set(fn, lab || fn);
  }
  return map;
}

function resolvePicklistValueLabel(mapLeft, mapRight, apiValue) {
  if (apiValue == null || apiValue === '') return '—';
  const s = String(apiValue);
  return mapLeft.get(s) || mapRight.get(s) || s;
}

function pairKey(p) {
  return `${p.controllingFieldValue}\x1e${p.valueName}`;
}

function pairsListsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].controllingFieldValue !== b[i].controllingFieldValue ||
      a[i].valueName !== b[i].valueName
    ) {
      return false;
    }
  }
  return true;
}

/**
 * @param {{ fullName: string, controllingField: string, controllingFieldLabel?: string, dependentFieldLabel?: string }} row
 */
function renderFieldDepCompare(row) {
  const body = document.getElementById('fieldDepCompareBody');
  if (!body) return;
  body.innerHTML = '';

  const objectName = document.getElementById('fieldDepObjectSelect')?.value?.trim() || '';

  const intro = document.createElement('p');
  intro.className = 'field-dep-compare-intro';
  intro.textContent = t('fieldDep.compareIntro');
  body.appendChild(intro);

  if (!fieldDepCache || fieldDepCache.objectApiName !== objectName) {
    const p = document.createElement('p');
    p.className = 'field-dep-compare-warn';
    p.textContent = t('fieldDep.noRecentRetrieve');
    body.appendChild(p);
    return;
  }

  if (fieldDepCache.rightXml == null) {
    const p = document.createElement('p');
    p.className = 'field-dep-compare-warn';
    p.textContent = t('fieldDep.noRightXml');
    body.appendChild(p);
    return;
  }

  const leftParsed = extractValueSettingsPairs(fieldDepCache.leftXml, row.fullName);
  const rightParsed = extractValueSettingsPairs(fieldDepCache.rightXml, row.fullName);

  if (leftParsed.error) {
    const p = document.createElement('p');
    p.className = 'field-dep-compare-warn';
    p.textContent = `${t('fieldDep.leftOrg')} (${fieldDepCache.leftOrgName}): ${leftParsed.error}`;
    body.appendChild(p);
  }
  if (rightParsed.error) {
    const p = document.createElement('p');
    p.className = 'field-dep-compare-warn';
    p.textContent = `${t('fieldDep.rightOrg')} (${fieldDepCache.rightOrgName}): ${rightParsed.error}`;
    body.appendChild(p);
  }

  if (leftParsed.error || rightParsed.error) {
    return;
  }

  const same = pairsListsEqual(leftParsed.pairs, rightParsed.pairs);
  const banner = document.createElement('div');
  banner.className = same
    ? 'field-dep-compare-banner field-dep-compare-banner-ok'
    : 'field-dep-compare-banner field-dep-compare-banner-diff';
  banner.textContent = same ? t('fieldDep.match') : t('fieldDep.differ');
  body.appendChild(banner);

  const meta = document.createElement('p');
  meta.className = 'field-dep-compare-meta';
  meta.textContent = `${fieldDepCache.leftOrgName}: ${leftParsed.pairs.length} ${t('fieldDep.values')} · ${fieldDepCache.rightOrgName}: ${rightParsed.pairs.length} ${t('fieldDep.values')}`;
  body.appendChild(meta);

  const setL = new Set(leftParsed.pairs.map(pairKey));
  const setR = new Set(rightParsed.pairs.map(pairKey));
  const unionKeys = new Set([...setL, ...setR]);
  const sortedKeys = [...unionKeys].sort();

  if (sortedKeys.length === 0) {
    const nop = document.createElement('p');
    nop.className = 'field-dep-compare-intro';
    nop.textContent = t('fieldDep.noValueSettings');
    body.appendChild(nop);
    return;
  }

  const leftColName = fieldDepCache.leftOrgName || t('fieldDep.leftOrg');
  const rightColName = fieldDepCache.rightOrgName || t('fieldDep.rightOrg');

  const mapCtrlL = extractPicklistApiToLabelMap(fieldDepCache.leftXml, row.controllingField);
  const mapCtrlR = extractPicklistApiToLabelMap(fieldDepCache.rightXml, row.controllingField);
  const mapDepL = extractPicklistApiToLabelMap(fieldDepCache.leftXml, row.fullName);
  const mapDepR = extractPicklistApiToLabelMap(fieldDepCache.rightXml, row.fullName);

  const headerCtrl = extractFieldLabel(fieldDepCache.leftXml, row.controllingField);
  const headerDep = extractFieldLabel(fieldDepCache.leftXml, row.fullName);

  const wrap = document.createElement('div');
  wrap.className = 'field-dep-compare-table-wrap';
  const table = document.createElement('table');
  table.className = 'field-dep-compare-table';
  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  const h1 = document.createElement('th');
  h1.scope = 'col';
  h1.textContent = headerCtrl;
  h1.title = row.controllingField;
  const h2 = document.createElement('th');
  h2.scope = 'col';
  h2.textContent = headerDep;
  h2.title = row.fullName;
  const h3 = document.createElement('th');
  h3.scope = 'col';
  h3.className = 'field-dep-compare-th-org';
  h3.textContent = leftColName;
  h3.title = leftColName;
  const h4 = document.createElement('th');
  h4.scope = 'col';
  h4.className = 'field-dep-compare-th-org';
  h4.textContent = rightColName;
  h4.title = rightColName;
  trHead.appendChild(h1);
  trHead.appendChild(h2);
  trHead.appendChild(h3);
  trHead.appendChild(h4);
  thead.appendChild(trHead);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  for (const key of sortedKeys) {
    const sep = key.indexOf('\x1e');
    const controllingFieldValue = sep >= 0 ? key.slice(0, sep) : key;
    const valueName = sep >= 0 ? key.slice(sep + 1) : '';
    const inL = setL.has(key);
    const inR = setR.has(key);

    const tr = document.createElement('tr');
    if (inL && !inR) tr.className = 'field-dep-row-only-left';
    else if (!inL && inR) tr.className = 'field-dep-row-only-right';

    const td1 = document.createElement('td');
    const dispCtrl = resolvePicklistValueLabel(mapCtrlL, mapCtrlR, controllingFieldValue);
    td1.textContent = dispCtrl || '—';
    if (controllingFieldValue) td1.title = `API: ${controllingFieldValue}`;
    const td2 = document.createElement('td');
    const dispDep = resolvePicklistValueLabel(mapDepL, mapDepR, valueName);
    td2.textContent = dispDep || '—';
    if (valueName) td2.title = `API: ${valueName}`;
    const td3 = document.createElement('td');
    td3.className = inL ? 'field-dep-cell-ok' : 'field-dep-cell-miss';
    td3.textContent = inL ? '✓' : '—';
    const td4 = document.createElement('td');
    td4.className = inR ? 'field-dep-cell-ok' : 'field-dep-cell-miss';
    td4.textContent = inR ? '✓' : '—';

    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrap.appendChild(table);
  body.appendChild(wrap);
}

function clearFieldDepTable() {
  const tbody = document.getElementById('fieldDepTableBody');
  if (tbody) tbody.innerHTML = '';
}

function showFieldDepTableView() {
  document.getElementById('fieldDepControls')?.classList.remove('hidden');
  document.getElementById('fieldDepTableScreen')?.classList.remove('hidden');
  document.getElementById('fieldDepCompareScreen')?.classList.add('hidden');
}

/**
 * Mismo shape que `usage:log` en editorRender (codeComparison): sin campos extra a nivel raíz;
 * el detalle va en descriptor como el resto de artefactos.
 */
async function logFieldDependencyCompareClick(row, objectApiName) {
  if (!state.leftOrgId || !state.rightOrgId) return;
  const tripleName = fieldDependencyTripleDashed(
    objectApiName,
    row.controllingField,
    row.fullName
  );
  const entry = {
    kind: 'codeComparison',
    artifactType: 'FieldDependency',
    descriptor: {
      name: tripleName,
      objectApiName: objectApiName || '',
      controllingField: row.controllingField || '',
      dependentField: row.fullName || ''
    },
    leftOrgId: state.leftOrgId,
    rightOrgId: state.rightOrgId,
    comparisonUrl: typeof window !== 'undefined' ? window.location.href : '',
    leftFilesCount: 0,
    rightFilesCount: 0
  };
  await bg({ type: 'usage:log', entry });
}

/**
 * @param {{ fullName: string, controllingField: string, controllingFieldLabel?: string, dependentFieldLabel?: string }} row
 */
function showFieldDepCompareView(row) {
  const objectName =
    document.getElementById('fieldDepObjectSelect')?.value?.trim() || '';
  void logFieldDependencyCompareClick(row, objectName);
  document.getElementById('fieldDepControls')?.classList.add('hidden');
  document.getElementById('fieldDepTableScreen')?.classList.add('hidden');
  document.getElementById('fieldDepCompareScreen')?.classList.remove('hidden');
  const title = document.getElementById('fieldDepCompareTitle');
  if (title) {
    const ctrl = row.controllingFieldLabel || row.controllingField;
    const dep = row.dependentFieldLabel || row.fullName;
    title.textContent = fieldDependencyTripleDashed(objectName || '—', ctrl, dep);
    title.title = fieldDependencyTripleDashed(objectName, row.controllingField, row.fullName);
  }
  renderFieldDepCompare(row);
}

function renderFieldDepTable(parsed) {
  const tbody = document.getElementById('fieldDepTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (parsed.errorMessage) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'field-dep-table-msg';
    td.textContent = parsed.errorMessage;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  if (!parsed.rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'field-dep-table-msg';
    td.textContent = t('fieldDep.noDependencies');
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const r of parsed.rows) {
    const tr = document.createElement('tr');
    const tdCtrl = document.createElement('td');
    tdCtrl.textContent = r.controllingFieldLabel || r.controllingField;
    tdCtrl.title = `API: ${r.controllingField}`;
    const tdDep = document.createElement('td');
    tdDep.textContent = r.dependentFieldLabel || r.fullName;
    tdDep.title = `API: ${r.fullName}`;
    const tdAct = document.createElement('td');
    tdAct.className = 'field-dep-col-action';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'field-dep-compare-btn';
    btn.textContent = t('fieldDep.compare');
    btn.addEventListener('click', () => showFieldDepCompareView(r));
    tdAct.appendChild(btn);
    tr.appendChild(tdCtrl);
    tr.appendChild(tdDep);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  }
}

function updateOrgHint() {
  const el = document.getElementById('fieldDepOrgHint');
  if (!el) return;
  const L = state.leftOrgId;
  const R = state.rightOrgId;
  if (!L && !R) {
    el.textContent = t('fieldDep.selectBothOrgs');
  } else if (L && !R) {
    el.textContent = t('fieldDep.selectRightOrg');
  } else if (!L && R) {
    el.textContent = t('fieldDep.selectLeftOrgHint');
  } else {
    el.textContent = t('fieldDep.objectsFromLeft');
  }
}

function setResultsVisible(show) {
  const box = document.getElementById('fieldDepResults');
  if (box) box.classList.toggle('hidden', !show);
}

function applyPicklistFilter() {
  const search = document.getElementById('fieldDepObjectSearch');
  const select = document.getElementById('fieldDepObjectSelect');
  if (!select) return;
  const q = (search?.value || '').trim().toLowerCase();
  const prev = select.value;
  select.innerHTML = '';
  const optEmpty = document.createElement('option');
  optEmpty.value = '';
  optEmpty.textContent = t('fieldDep.chooseObject');
  select.appendChild(optEmpty);

  const rows = !q
    ? customObjectRecords
    : customObjectRecords.filter((r) => (r.fullName || '').toLowerCase().includes(q));

  for (const r of rows) {
    const o = document.createElement('option');
    o.value = r.fullName;
    o.textContent = r.fullName;
    select.appendChild(o);
  }

  if (prev && [...select.options].some((op) => op.value === prev)) {
    select.value = prev;
  }
  updateRetrieveEnabled();
}

function updateRetrieveEnabled() {
  const select = document.getElementById('fieldDepObjectSelect');
  const btn = document.getElementById('fieldDepRetrieveBtn');
  if (!btn || !select) return;
  const ok =
    !!(state.leftOrgId && state.rightOrgId && select.value && customObjectRecords.length);
  btn.disabled = !ok;
}

export async function loadCustomObjectPicklist() {
  const select = document.getElementById('fieldDepObjectSelect');
  const search = document.getElementById('fieldDepObjectSearch');
  if (getSelectedArtifactType() !== 'FieldDependency') return;

  customObjectRecords = [];
  clearFieldDepCache();
  setResultsVisible(false);
  clearFieldDepTable();
  showFieldDepTableView();

  if (!state.leftOrgId) {
    if (select) {
      select.innerHTML = `<option value="">${t('fieldDep.selectLeftOrg')}</option>`;
      select.disabled = true;
    }
    if (search) search.disabled = true;
    updateRetrieveEnabled();
    updateOrgHint();
    return;
  }

  if (select) {
    select.innerHTML = `<option value="">${t('fieldDep.loadingCustomObject')}</option>`;
    select.disabled = true;
  }
  if (search) search.disabled = true;

  try {
    const res = await bg({
      type: 'metadata:listMetadata',
      orgId: state.leftOrgId,
      metadataType: 'CustomObject'
    });
    if (!res.ok) {
      if (res.reason === 'NO_SID') {
        showToast(t('toast.noSessionLeft'), 'warn');
      } else {
        showToast(res.error || t('toast.listCustomObjectFailed'), 'error');
      }
      if (select) {
        select.innerHTML = `<option value="">${t('genPkg.error')}</option>`;
        select.disabled = true;
      }
      updateRetrieveEnabled();
      updateOrgHint();
      return;
    }

    const records = Array.isArray(res.records) ? res.records : [];
    customObjectRecords = records
      .map((r) => ({ fullName: r.fullName || '' }))
      .filter((r) => r.fullName)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    if (search) search.disabled = false;
    if (select) select.disabled = false;
    applyPicklistFilter();

    if (customObjectRecords.length === 0) {
      showToast(t('toast.emptyCustomObjectList'), 'warn');
    }
  } catch (e) {
    showToast(String(e?.message || e), 'error');
    if (select) {
      select.innerHTML = `<option value="">${t('genPkg.error')}</option>`;
      select.disabled = true;
    }
  }

  updateRetrieveEnabled();
  updateOrgHint();
}

async function runRetrieveBoth() {
  const select = document.getElementById('fieldDepObjectSelect');
  const objectName = select?.value || '';
  if (!objectName || !state.leftOrgId || !state.rightOrgId) {
    showToast(t('toast.selectOrgAndObject'), 'warn');
    return;
  }

  const leftOrg = await getSavedOrg(state.leftOrgId);
  const rightOrg = await getSavedOrg(state.rightOrgId);
  if (!leftOrg || !rightOrg) {
    showToast(t('toast.orgDataNotFound'), 'error');
    return;
  }

  const pkg = buildCustomObjectPackageXml(leftOrg.apiVersion, objectName);

  clearFieldDepCache();
  showFieldDepTableView();
  showToastWithSpinner(t('toast.retrieveAndAnalysis'));

  try {
    const [leftRes, rightRes] = await Promise.all([
      bg({ type: 'metadata:retrievePackageXml', orgId: state.leftOrgId, packageXml: pkg }),
      bg({ type: 'metadata:retrievePackageXml', orgId: state.rightOrgId, packageXml: pkg })
    ]);

    dismissSpinnerToast();

    if (!leftRes.ok) {
      showToast(`${t('fieldDep.leftOrg')}: ${leftRes.error || leftRes.reason || 'retrieve failed'}`, 'error');
      setResultsVisible(true);
      showFieldDepTableView();
      renderFieldDepTable({
        errorMessage: t('toast.leftRetrieveFailed', { error: leftRes.error || leftRes.reason || '' })
      });
      return;
    }
    if (!rightRes.ok) {
      showToast(`${t('fieldDep.rightOrg')}: ${rightRes.error || rightRes.reason || 'retrieve failed'}`, 'error');
      setResultsVisible(true);
      showFieldDepTableView();
      renderFieldDepTable({
        errorMessage: t('toast.rightRetrieveFailed', { error: rightRes.error || rightRes.reason || '' })
      });
      return;
    }

    const leftBytes = Uint8Array.from(atob(leftRes.zipBase64), (c) => c.charCodeAt(0));
    const rightBytes = Uint8Array.from(atob(rightRes.zipBase64), (c) => c.charCodeAt(0));
    const leftFiles = await readZipAllTextFiles(leftBytes);
    const rightFiles = await readZipAllTextFiles(rightBytes);

    const leftFile = findObjectFileInZipFiles(leftFiles, objectName);
    const rightFile = findObjectFileInZipFiles(rightFiles, objectName);
    setResultsVisible(true);
    showFieldDepTableView();

    if (!leftFile) {
      renderFieldDepTable({
        errorMessage: t('toast.objectNotInZip', { object: objectName, count: leftFiles.length })
      });
      showToast(t('toast.retrieveNoObjectInZip'), 'warn');
      return;
    }

    fieldDepCache = {
      objectApiName: objectName,
      leftXml: leftFile.content,
      rightXml: rightFile ? rightFile.content : null,
      leftOrgName: savedOrgEnvLabel(leftOrg),
      rightOrgName: savedOrgEnvLabel(rightOrg)
    };

    if (!rightFile) {
      showToast(t('toast.objectLeftOnly'), 'warn');
    }

    const parsed = parseControllingFieldsFromCustomObjectXml(leftFile.content);
    renderFieldDepTable(parsed);
    showToast(t('toast.dependenciesUpdated'), 'info');
  } catch (e) {
    dismissSpinnerToast();
    showToast(String(e?.message || e), 'error');
  }
}

function wireIfNeeded() {
  if (picklistWired) return;
  picklistWired = true;

  const search = document.getElementById('fieldDepObjectSearch');
  const select = document.getElementById('fieldDepObjectSelect');
  const btn = document.getElementById('fieldDepRetrieveBtn');

  if (search) {
    search.addEventListener('input', () => applyPicklistFilter());
  }
  if (select) {
    select.addEventListener('change', () => updateRetrieveEnabled());
  }
  if (btn) {
    btn.addEventListener('click', () => runRetrieveBoth());
  }

  const back = document.getElementById('fieldDepBackBtn');
  if (back) {
    back.addEventListener('click', () => showFieldDepTableView());
  }
}

/**
 * Vuelve al estado inicial del modo Field Dependency (tabla borrada, sin resultados, sin caché de retrieve)
 * y recarga la picklist desde la org izquierda. Llamar al cambiar org izquierda o derecha.
 */
export function resetFieldDependencyToInitial() {
  wireIfNeeded();
  updateOrgHint();
  loadCustomObjectPicklist();
}

export function refreshFieldDependencyPanel() {
  resetFieldDependencyToInitial();
}

export function setupFieldDependencyPanel() {
  wireIfNeeded();
  refreshFieldDependencyPanel();
}
