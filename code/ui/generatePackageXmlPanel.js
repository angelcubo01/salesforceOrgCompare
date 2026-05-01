import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { showToast } from './toast.js';
import { addSelected } from '../flows/addItems.js';
import { retrieveAndLoadFromZip } from '../flows/retrieveFlow.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { applyArtifactTypeUi } from './artifactTypeUi.js';
import { t } from '../../shared/i18n.js';
/** @type {Array<{ xmlName: string, label: string, directoryName: string, inFolder: boolean }>} */
let describeCache = [];
/** Últimos registros listMetadata del tipo actual (para depurar / futuro). */
let lastMemberRecords = [];
/** Versión API de la org usada en describe/list (p. ej. "65.0"). */
let packageApiVersion = '60.0';
/** Tipo de metadata cuyos checkboxes se muestran ahora. */
let currentListType = '';
/** Selección global: tipo → nombres completos de miembro, o `*` = comodín para todo el tipo. */
const selectedByType = new Map();

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Líneas `<members>…</members>` para un bloque `<types>` (comodín `*` excluye el resto). */
function memberLinesForSet(set) {
  if (!set || set.size === 0) return [];
  if (set.has('*')) {
    return ['        <members>*</members>'];
  }
  return Array.from(set)
    .sort((a, b) => a.localeCompare(b))
    .map((m) => `        <members>${escapeXml(m)}</members>`);
}

function buildPackageXml() {
  const ver = packageApiVersion || '60.0';
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<Package xmlns="http://soap.sforce.com/2006/04/metadata">');

  const types = Array.from(selectedByType.keys()).sort((a, b) => a.localeCompare(b));
  for (const typeName of types) {
    const set = selectedByType.get(typeName);
    const memberLines = memberLinesForSet(set);
    if (!memberLines.length) continue;
    lines.push('    <types>');
    for (const ml of memberLines) {
      lines.push(ml);
    }
    lines.push(`        <name>${escapeXml(typeName)}</name>`);
    lines.push('    </types>');
  }

  lines.push(`    <version>${escapeXml(ver)}</version>`);
  lines.push('</Package>');
  return lines.join('\n');
}

function updateXmlOutput() {
  const ta = document.getElementById('generatePkgXmlOutput');
  if (ta) ta.value = buildPackageXml();
}

function getSetForType(typeName) {
  if (!selectedByType.has(typeName)) selectedByType.set(typeName, new Set());
  return selectedByType.get(typeName);
}

/**
 * Repinta el &lt;select&gt; de tipos según `describeCache` y el texto de búsqueda.
 */
function populateTypeSelect(filterText = '') {
  const select = document.getElementById('generatePkgMetadataType');
  if (!select) return;
  const q = filterText.trim().toLowerCase();
  const prev = select.value;

  select.innerHTML = `<option value="">${t('genPkg.chooseType')}</option>`;
  for (const o of describeCache) {
    const hay = `${o.xmlName} ${o.label || ''} ${o.directoryName || ''}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    const opt = document.createElement('option');
    opt.value = o.xmlName;
    opt.textContent = o.label && o.label !== o.xmlName ? `${o.xmlName} — ${o.label}` : o.xmlName;
    opt.title = [o.directoryName, o.xmlName].filter(Boolean).join(' · ');
    select.appendChild(opt);
  }

  if (prev && [...select.options].some((o) => o.value === prev)) {
    select.value = prev;
  } else if (prev && q) {
    select.value = '';
  }
}

function applyMemberFilter() {
  const input = document.getElementById('generatePkgMemberSearch');
  const q = (input?.value || '').trim().toLowerCase();
  const listEl = document.getElementById('generatePkgMembersList');
  if (!listEl) return;
  const rows = listEl.querySelectorAll('.generate-pkg-member-row');
  rows.forEach((row) => {
    const text = (row.textContent || '').toLowerCase();
    row.style.display = !q || text.includes(q) ? '' : 'none';
  });
}

/**
 * Rellena la picklist con describeMetadata (API = la de la org guardada).
 */
async function loadMetadataTypesIntoPicklist() {
  const select = document.getElementById('generatePkgMetadataType');
  const typeSearch = document.getElementById('generatePkgTypeSearch');
  if (!select) return;

  if (getSelectedArtifactType() !== 'GeneratePackageXml') return;

  const orgId = state.leftOrgId;
  if (!orgId) {
    select.innerHTML = `<option value="">${t('genPkg.selectOrgFirst')}</option>`;
    select.disabled = true;
    if (typeSearch) {
      typeSearch.value = '';
      typeSearch.disabled = true;
    }
    describeCache = [];
    clearMembersUi();
    updateXmlOutput();
    return;
  }

  select.disabled = true;
  if (typeSearch) typeSearch.disabled = true;
  select.innerHTML = `<option value="">${t('genPkg.loadingDescribe')}</option>`;

  try {
    const res = await bg({ type: 'metadata:describeMetadata', orgId });
    if (!res.ok) {
      if (res.reason === 'NO_SID') {
        showToast(t('toast.noSessionRetry'), 'warn');
      } else {
        showToast(res.error || t('toast.describeMetadataFailed'), 'error');
      }
      select.innerHTML = `<option value="">${t('genPkg.error')}</option>`;
      select.disabled = false;
      describeCache = [];
      return;
    }

    describeCache = Array.isArray(res.metadataObjects) ? res.metadataObjects : [];
    packageApiVersion = String(res.apiVersionUsed || '60.0');

    populateTypeSelect(typeSearch?.value || '');
    select.disabled = false;
    if (typeSearch) {
      typeSearch.disabled = describeCache.length === 0;
    }

    clearMembersUi();
    updateXmlOutput();
  } catch (e) {
    showToast(String(e?.message || e), 'error');
    select.innerHTML = `<option value="">${t('genPkg.error')}</option>`;
    select.disabled = false;
    describeCache = [];
  }
}

function clearMembersUi() {
  currentListType = '';
  lastMemberRecords = [];
  const list = document.getElementById('generatePkgMembersList');
  const loading = document.getElementById('generatePkgMembersLoading');
  const memberSearch = document.getElementById('generatePkgMemberSearch');
  if (list) list.innerHTML = '';
  if (loading) loading.textContent = '';
  if (memberSearch) {
    memberSearch.value = '';
    memberSearch.disabled = true;
  }
}

async function loadMembersForType(typeName) {
  const listEl = document.getElementById('generatePkgMembersList');
  const loading = document.getElementById('generatePkgMembersLoading');
  const memberSearch = document.getElementById('generatePkgMemberSearch');
  if (!listEl || !typeName) {
    clearMembersUi();
    return;
  }

  const orgId = state.leftOrgId;
  if (!orgId) return;

  currentListType = typeName;
  listEl.innerHTML = '';
  if (memberSearch) {
    memberSearch.value = '';
    memberSearch.disabled = true;
  }
  if (loading) loading.textContent = t('genPkg.loadingList');

  const metaObj = describeCache.find((o) => o.xmlName === typeName);
  const folderHint = metaObj?.directoryName?.trim() || undefined;

  try {
    const payload = { type: 'metadata:listMetadata', orgId, metadataType: typeName };
    if (folderHint) payload.folder = folderHint;
    const res = await bg(payload);

    if (!res.ok) {
      if (res.reason === 'NO_SID') {
        showToast(t('toast.noSession'), 'warn');
      } else {
        showToast(res.error || t('toast.listMetadataFailed'), 'error');
      }
      if (loading) loading.textContent = '';
      return;
    }

    const records = Array.isArray(res.records) ? res.records : [];
    lastMemberRecords = records;
    if (loading) loading.textContent = '';

    const selected = getSetForType(typeName);

    const frag = document.createDocumentFragment();
    for (const r of records) {
      const id = `gpm_${typeName}_${encodeURIComponent(r.fullName)}`.replace(/%/g, '_');
      const label = document.createElement('label');
      label.className = 'generate-pkg-member-row';
      label.htmlFor = id;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.dataset.fullname = r.fullName;
      cb.checked = !selected.has('*') && selected.has(r.fullName);
      cb.addEventListener('change', () => {
        const fn = cb.dataset.fullname || '';
        if (cb.checked) {
          selected.delete('*');
          selected.add(fn);
        } else {
          selected.delete(fn);
        }
        updateXmlOutput();
      });

      const span = document.createElement('span');
      span.className = 'generate-pkg-member-name';
      span.textContent = r.fullName;

      label.appendChild(cb);
      label.appendChild(span);
      frag.appendChild(label);
    }
    listEl.appendChild(frag);

    if (selected.has('*')) {
      listEl.querySelectorAll('.generate-pkg-member-row input').forEach((cb) => {
        cb.checked = false;
      });
    }

    if (memberSearch) memberSearch.disabled = false;
    applyMemberFilter();
  } catch (e) {
    showToast(String(e?.message || e), 'error');
    if (loading) loading.textContent = '';
  }
}

function wireMembersToolbar() {
  const selAll = document.getElementById('generatePkgSelectAllMembers');
  const clearType = document.getElementById('generatePkgClearTypeMembers');
  if (selAll) {
    selAll.addEventListener('click', () => {
      if (!currentListType) return;
      const listEl = document.getElementById('generatePkgMembersList');
      if (!listEl) return;
      const set = getSetForType(currentListType);
      set.clear();
      set.add('*');
      listEl.querySelectorAll('.generate-pkg-member-row input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
      });
      applyMemberFilter();
      updateXmlOutput();
    });
  }
  if (clearType) {
    clearType.addEventListener('click', () => {
      if (!currentListType) return;
      // No borrar la entrada del Map: los checkboxes guardan referencia al Set original;
      // si usáramos delete(), las nuevas marcas irían a un Set huérfano y no al manifiesto.
      getSetForType(currentListType).clear();
      const listEl = document.getElementById('generatePkgMembersList');
      if (listEl) {
        listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          cb.checked = false;
        });
      }
      updateXmlOutput();
    });
  }
}

function wireSearchInputs() {
  const typeSearch = document.getElementById('generatePkgTypeSearch');
  if (typeSearch) {
    typeSearch.addEventListener('input', () => {
      const prev = document.getElementById('generatePkgMetadataType')?.value;
      populateTypeSelect(typeSearch.value);
      const sel = document.getElementById('generatePkgMetadataType');
      if (sel && prev && sel.value !== prev) {
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  const memberSearch = document.getElementById('generatePkgMemberSearch');
  if (memberSearch) {
    memberSearch.addEventListener('input', () => applyMemberFilter());
  }
}

function syncCompareButtonVisibility() {
  const btn = document.getElementById('generatePkgCompareOpenBtn');
  if (!btn) return;
  btn.classList.toggle('hidden', !state.generatePackageXmlCompareMode);
}

/** Llamar tras cambiar a modo generar o al cambiar la org izquierda. */
export function refreshGeneratePackageXmlTypes() {
  const toggle = document.getElementById('generatePkgCompareToggle');
  if (toggle) toggle.checked = !!state.generatePackageXmlCompareMode;
  syncCompareButtonVisibility();
  selectedByType.clear();
  return loadMetadataTypesIntoPicklist();
}

export function setupGeneratePackageXmlPanel() {
  const typeSelect = document.getElementById('generatePkgMetadataType');
  const compareToggle = document.getElementById('generatePkgCompareToggle');
  const compareOpenBtn = document.getElementById('generatePkgCompareOpenBtn');

  wireSearchInputs();

  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      const v = typeSelect.value;
      if (!v) {
        clearMembersUi();
        updateXmlOutput();
        return;
      }
      loadMembersForType(v);
      updateXmlOutput();
    });
  }

  wireMembersToolbar();

  if (compareToggle) {
    compareToggle.checked = !!state.generatePackageXmlCompareMode;
    compareToggle.addEventListener('change', () => {
      state.generatePackageXmlCompareMode = !!compareToggle.checked;
      syncCompareButtonVisibility();
      applyArtifactTypeUi();
    });
  }
  if (compareOpenBtn) {
    compareOpenBtn.addEventListener('click', () => {
      const ta = document.getElementById('generatePkgXmlOutput');
      const xml = ta ? String(ta.value || '') : '';
      if (!xml.trim()) {
        showToast(t('toast.noPackageXml'), 'warn');
        return;
      }
      const key = `local-${Date.now()}-package`;
      state.packageXmlLocalContent[key] = { fileName: 'package.xml', content: xml };
      addSelected({
        type: 'PackageXml',
        key,
        descriptor: {
          name: 'package.xml',
          originalFileName: 'package.xml',
          source: 'localFile'
        }
      });
      const op = document.getElementById('typeSelect');
      if (!op) return;
      op.value = 'PackageXml';
      op.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => {
        const current = state.selectedItem;
        if (current?.type === 'PackageXml' && current?.descriptor?.source === 'localFile') {
          void retrieveAndLoadFromZip(current);
        }
      }, 0);
    });
  }

  const downloadBtn = document.getElementById('generatePkgDownloadXml');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      const ta = document.getElementById('generatePkgXmlOutput');
      const text = ta ? ta.value : '';
      const blob = new Blob([text], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'package.xml';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const typesWithMembers = [...selectedByType.entries()].filter(
        ([, set]) => set && set.size > 0
      );
      const entry = {
        kind: 'codeComparison',
        artifactType: 'PackageXml',
        descriptor: {
          name: 'Generate package.xml'
        },
        phase: 'packageXml',
        leftOrgId: state.leftOrgId || '',
        rightOrgId: state.leftOrgId || '',
        comparisonUrl: typeof window !== 'undefined' ? window.location.href : '',
        typesCount: typesWithMembers.length,
        xmlChars: text.length
      };
      await bg({ type: 'usage:log', entry });
    });
  }

  updateXmlOutput();
  syncCompareButtonVisibility();
}
