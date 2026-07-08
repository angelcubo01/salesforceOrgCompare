/**
 * Comparación masiva de todos los miembros de un tipo Metadata API entre dos orgs.
 */
import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { handleToolError, handleToolResponseFailure } from '../../shared/reportToolError.js';
import {
  filterMemberRows,
  HEAVY_METADATA_TYPES,
  isRestComparableMetadataType,
  mergeMemberRows,
  metadataTypeToArtType,
  buildFetchDescriptor,
  buildWildcardPackageXml,
  buildRetrieveCompareCache,
  buildPathStatusMaps,
  extractMemberKeyFromZipPath
} from '../../shared/metadataTypeCompareCore.js';
import { compareRetrieveZipFiles } from '../../shared/metadataTypeCompareApi.js';
import { readZipAllMetadataCompareFiles } from '../lib/zipBinary.js';
import { addBundleFiles, addSelected } from '../flows/addItems.js';
import { saveItemsToStorage } from '../core/persistence.js';
import { renderEditor } from '../editor/editorRender.js';
import { renderSavedItems, clearBundleCollapsedForKey, syncListActiveHighlight } from './listUi.js';
import { ensureModeForTool } from './appModeNav.js';
import { handleArtifactTypeSelectChange } from './searchSetup.js';
import { ensureRightOrgDistinctFromLeft } from './orgs.js';
import {
  beginMetadataTypeCompareUiSession,
  cancelMetadataTypeCompareUi,
  clearMetadataTypeCompareUiSession,
  isMetadataTypeCompareActive,
  beginRetrieveSessionForCompare,
  isRetrieveSessionActive,
  cancelRetrieveSessionForCompare
} from './metadataTypeCompareSessionUi.js';

/** @type {Array<{ xmlName: string, label: string, directoryName: string, inFolder: boolean }>} */
let describeCache = [];

/** @type {import('../../shared/metadataTypeCompareCore.js').MemberCompareRow[]} */
let mergedRows = [];

/** @type {string} */
let currentMetadataType = '';

/** Clave en state.packageRetrieveZipCache tras retrieve masivo. */
let retrieveCacheKey = null;

/** @type {Map<string, string>} */
let memberPrimaryPath = new Map();

let compareInFlight = false;
let panelWired = false;

/** Miembro seleccionado en la tabla de resultados (para abrir en comparador). */
let selectedMemberKey = '';

const REST_BATCH_SIZE = 8;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDiffOnly() {
  const el = document.getElementById('metadataTypeCompareDiffOnly');
  return el ? !!el.checked : true;
}

function setCompareChrome(inProgress) {
  const compareBtn = document.getElementById('metadataTypeCompareRunBtn');
  const cancelBtn = document.getElementById('metadataTypeCompareCancelBtn');
  const typeSelect = document.getElementById('metadataTypeCompareTypeSelect');
  const typeSearch = document.getElementById('metadataTypeCompareTypeSearch');
  if (compareBtn) compareBtn.disabled = !!inProgress;
  if (cancelBtn) cancelBtn.classList.toggle('hidden', !inProgress);
  if (typeSelect) typeSelect.disabled = !!inProgress;
  if (typeSearch) typeSearch.disabled = !!inProgress || describeCache.length === 0;
}

function clearRetrieveCompareCache() {
  if (retrieveCacheKey) {
    state.savedItems = state.savedItems.filter(
      (s) =>
        s.key !== retrieveCacheKey &&
        !(
          (s.descriptor?.source === 'retrieveZipFile' ||
            s.descriptor?.source === 'retrieveZipSummary') &&
          s.descriptor?.parentKey === retrieveCacheKey
        )
    );
    delete state.packageXmlLocalContent[retrieveCacheKey];
    delete state.packageRetrieveZipCache[retrieveCacheKey];
    if (
      state.selectedItem?.key === retrieveCacheKey ||
      state.selectedItem?.descriptor?.parentKey === retrieveCacheKey
    ) {
      state.selectedItem = null;
    }
    retrieveCacheKey = null;
  }
  memberPrimaryPath = new Map();
}

function ensureMetadataTypeComparePackageInList(metadataType, apiVersion) {
  if (!retrieveCacheKey || !state.packageRetrieveZipCache[retrieveCacheKey]) return null;

  const cache = state.packageRetrieveZipCache[retrieveCacheKey];
  const diffCount = mergedRows.filter((r) => r.status !== 'match').length;
  let parentItem = state.savedItems.find((s) => s.key === retrieveCacheKey && s.type === 'PackageXml');

  if (!parentItem) {
    parentItem = {
      type: 'PackageXml',
      key: retrieveCacheKey,
      descriptor: {
        name: metadataType,
        originalFileName: `${metadataType}.xml`,
        source: 'localFile',
        metadataTypeCompareType: metadataType,
        metadataTypeCompareCache: true
      }
    };
    state.packageXmlLocalContent[retrieveCacheKey] = {
      fileName: 'package.xml',
      content: buildWildcardPackageXml(metadataType, apiVersion)
    };

    state.savedItems = state.savedItems.filter(
      (s) =>
        s.key !== retrieveCacheKey &&
        !(
          (s.descriptor?.source === 'retrieveZipFile' ||
            s.descriptor?.source === 'retrieveZipSummary') &&
          s.descriptor?.parentKey === retrieveCacheKey
        )
    );

    for (const p of cache.paths || []) {
      const member = extractMemberKeyFromZipPath(p, metadataType);
      state.savedItems.push({
        type: 'PackageXml',
        key: `${retrieveCacheKey}::${p}`,
        descriptor: {
          source: 'retrieveZipFile',
          parentKey: retrieveCacheKey,
          relativePath: p,
          ...(member ? { metadataTypeCompareMember: member } : {})
        },
        fileName: p.includes('/') ? p.split('/').pop() : p
      });
    }

    state.savedItems.unshift(parentItem);
    clearBundleCollapsedForKey(`PackageXmlRZ:${retrieveCacheKey}`);
    saveItemsToStorage();
  }

  parentItem.descriptor.name = t('metadataTypeCompare.explorerTitle', {
    type: metadataType,
    total: mergedRows.length,
    diffs: diffCount
  });
  parentItem.descriptor.originalFileName = `${metadataType}.xml`;
  return parentItem;
}

async function switchToComparatorWithItem(item) {
  if (!item) return false;
  state.selectedItem = item;
  await ensureModeForTool('Comparator');
  handleArtifactTypeSelectChange({ isUserChange: false, preserveSelection: true });
  ensureRightOrgDistinctFromLeft();
  renderSavedItems(true);
  syncListActiveHighlight();
  await renderEditor();
  return true;
}

function findRestComparableItem(artType, memberName) {
  const name = String(memberName || '').trim();
  if (!artType || !name) return null;
  if (artType === 'LWC' || artType === 'Aura') {
    const prefix = `${name}/`;
    return (
      state.savedItems.find(
        (s) => s.type === artType && typeof s.key === 'string' && s.key.startsWith(prefix)
      ) || null
    );
  }
  return state.savedItems.find((s) => s.type === artType && s.key === name) || null;
}

async function openRetrieveMemberInExplorer(memberName) {
  const metadataType = currentMetadataType;
  if (!metadataType || !memberName) return;

  const leftOrg = (state.orgsList || []).find((o) => o.id === state.leftOrgId);
  const apiVer = leftOrg?.apiVersion || '60.0';
  const parentItem = ensureMetadataTypeComparePackageInList(metadataType, apiVer);
  if (!parentItem) {
    showToast(t('metadataTypeCompare.noRetrieveCache'), 'warn');
    return;
  }

  const relativePath = memberPrimaryPath.get(memberName);
  const childKey = relativePath ? `${retrieveCacheKey}::${relativePath}` : null;
  const childItem = childKey ? state.savedItems.find((s) => s.key === childKey) : null;
  const itemToOpen = childItem || parentItem;

  if (childItem) {
    await switchToComparatorWithItem(itemToOpen);
    return;
  }

  if (relativePath) {
    showToast(t('metadataTypeCompare.memberNotInCache'), 'warn');
    return;
  }

  await switchToComparatorWithItem(itemToOpen);
}

function setProgress(done, total, phaseKey) {
  const status = document.getElementById('metadataTypeCompareStatus');
  const bar = document.getElementById('metadataTypeCompareProgressBar');
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  if (bar) {
    bar.classList.remove('hidden');
    bar.value = pct;
    bar.max = 100;
  }
  if (status) {
    status.textContent = t(`metadataTypeCompare.phase.${phaseKey}`, { done, total });
  }
}

function hideProgress() {
  document.getElementById('metadataTypeCompareProgressBar')?.classList.add('hidden');
}

function populateTypeSelect(filterText = '') {
  const select = document.getElementById('metadataTypeCompareTypeSelect');
  if (!select) return;
  const q = filterText.trim().toLowerCase();
  const prev = select.value;

  select.innerHTML = `<option value="">${t('metadataTypeCompare.selectType')}</option>`;
  for (const o of describeCache) {
    const hay = `${o.xmlName} ${o.label || ''} ${o.directoryName || ''}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    const opt = document.createElement('option');
    opt.value = o.xmlName;
    opt.textContent = o.label && o.label !== o.xmlName ? `${o.xmlName} — ${o.label}` : o.xmlName;
    select.appendChild(opt);
  }

  if (prev && [...select.options].some((o) => o.value === prev)) {
    select.value = prev;
  }
}

async function loadMetadataTypes() {
  const select = document.getElementById('metadataTypeCompareTypeSelect');
  const typeSearch = document.getElementById('metadataTypeCompareTypeSearch');
  if (!select) return;

  if (getSelectedArtifactType() !== 'MetadataTypeCompare') return;

  if (!state.leftOrgId) {
    select.innerHTML = `<option value="">${t('metadataTypeCompare.selectLeft')}</option>`;
    select.disabled = true;
    if (typeSearch) typeSearch.disabled = true;
    describeCache = [];
    return;
  }

  select.disabled = true;
  if (typeSearch) typeSearch.disabled = true;
  select.innerHTML = `<option value="">${t('metadataTypeCompare.loadingTypes')}</option>`;

  try {
    const res = await bg({ type: 'metadata:describeMetadata', orgId: state.leftOrgId });
    if (!res.ok) {
      void handleToolResponseFailure(res, { artifact_type: 'MetadataTypeCompare', phase: 'describe' });
      select.innerHTML = `<option value="">${t('metadataTypeCompare.typesError')}</option>`;
      return;
    }
    describeCache = Array.isArray(res.metadataObjects) ? res.metadataObjects : [];
    populateTypeSelect(typeSearch?.value || '');
    select.disabled = compareInFlight;
    if (typeSearch) typeSearch.disabled = describeCache.length === 0 || compareInFlight;
  } catch (e) {
    void handleToolError(e, { artifact_type: 'MetadataTypeCompare', phase: 'describe' });
    select.innerHTML = `<option value="">${t('metadataTypeCompare.typesError')}</option>`;
  }
}

function statusLabel(status) {
  return t(`metadataTypeCompare.status.${status}`);
}

function renderTable() {
  const mount = document.getElementById('metadataTypeCompareTableMount');
  if (!mount) return;

  const diffOnly = getDiffOnly();
  const filtered = filterMemberRows(mergedRows, diffOnly);

  mount.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'setup-records-compare-toolbar metadata-type-compare-results-toolbar';
  const filterInput = document.createElement('input');
  filterInput.type = 'search';
  filterInput.className = 'setup-records-compare-filter';
  filterInput.placeholder = t('metadataTypeCompare.filterRows');
  toolbar.appendChild(filterInput);

  const openComparatorBtn = document.createElement('button');
  openComparatorBtn.type = 'button';
  openComparatorBtn.className = 'setup-records-compare-secondary-btn metadata-type-compare-open-btn';
  openComparatorBtn.textContent = t('metadataTypeCompare.openComparator');
  openComparatorBtn.disabled = true;
  openComparatorBtn.addEventListener('click', () => {
    if (selectedMemberKey) void openInComparator(selectedMemberKey);
  });
  toolbar.appendChild(openComparatorBtn);
  mount.appendChild(toolbar);

  const scroll = document.createElement('div');
  scroll.className = 'setup-records-compare-table-scroll';
  const table = document.createElement('table');
  table.className = 'setup-records-compare-table';
  table.innerHTML = `<thead><tr>
    <th scope="col">${t('metadataTypeCompare.colMember')}</th>
    <th scope="col">${t('metadataTypeCompare.colStatus')}</th>
    <th scope="col">${t('metadataTypeCompare.colDetail')}</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  scroll.appendChild(table);
  mount.appendChild(scroll);

  const canOpenComparator = !!currentMetadataType;

  function syncOpenComparatorButton() {
    const selected = selectedMemberKey
      ? filtered.find((r) => r.key === selectedMemberKey)
      : null;
    const canOpen = !!(canOpenComparator && selected && selected.status !== 'match');
    openComparatorBtn.disabled = !canOpen;
  }

  function renderBody(needle) {
    tbody.innerHTML = '';
    const n = String(needle || '')
      .trim()
      .toLowerCase();
    const rows = n ? filtered.filter((r) => r.key.toLowerCase().includes(n)) : filtered;

    if (selectedMemberKey && !rows.some((r) => r.key === selectedMemberKey)) {
      selectedMemberKey = '';
    }

    for (const row of rows) {
      const tr = document.createElement('tr');
      if (row.status === 'diff') tr.classList.add('setup-records-compare-row-diff');
      if (row.status === 'leftOnly') tr.classList.add('setup-records-compare-missing-right');
      if (row.status === 'rightOnly') tr.classList.add('setup-records-compare-missing-left');
      if (row.status === 'match') tr.classList.add('setup-records-compare-row-match');
      if (row.key === selectedMemberKey) tr.classList.add('setup-records-compare-row-selected');

      const tdMember = document.createElement('td');
      tdMember.textContent = row.label;
      const tdStatus = document.createElement('td');
      tdStatus.textContent = statusLabel(row.status);
      const tdDetail = document.createElement('td');
      tdDetail.textContent = row.detail || '—';

      if (canOpenComparator && row.status !== 'match') {
        tr.classList.add('setup-records-compare-row-selectable');
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        tr.setAttribute('aria-pressed', row.key === selectedMemberKey ? 'true' : 'false');
        const selectRow = () => {
          selectedMemberKey = row.key;
          renderBody(filterInput.value);
        };
        tr.addEventListener('click', selectRow);
        tr.addEventListener('dblclick', () => {
          selectedMemberKey = row.key;
          void openInComparator(row.key);
        });
        tr.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            selectRow();
          }
        });
      }

      tr.appendChild(tdMember);
      tr.appendChild(tdStatus);
      tr.appendChild(tdDetail);
      tbody.appendChild(tr);
    }

    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.className = 'setup-records-compare-empty-cell';
      td.textContent = diffOnly ? t('metadataTypeCompare.noDiffs') : t('metadataTypeCompare.noRows');
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    syncOpenComparatorButton();
  }

  filterInput.addEventListener('input', () => renderBody(filterInput.value));
  renderBody('');
}

function restoreResultsUiIfAny() {
  if (!mergedRows.length) return;
  const status = document.getElementById('metadataTypeCompareStatus');
  const diffCount = mergedRows.filter((r) => r.status !== 'match').length;
  if (status) {
    status.textContent = t('metadataTypeCompare.doneSummary', {
      total: mergedRows.length,
      diffs: diffCount
    });
  }
  const typeSel = document.getElementById('metadataTypeCompareTypeSelect');
  if (typeSel && currentMetadataType) {
    typeSel.value = currentMetadataType;
  }
  renderTable();
}

async function openInComparator(memberName) {
  const metadataType = currentMetadataType;
  if (!metadataType || !memberName) return;
  if (!state.leftOrgId || !state.rightOrgId) {
    showToast(t('metadataTypeCompare.selectRight'), 'warn');
    return;
  }

  const artType = metadataTypeToArtType(metadataType);
  const useRest = artType && isRestComparableMetadataType(metadataType);

  if (useRest) {
    if (artType === 'LWC' || artType === 'Aura') {
      await addBundleFiles(artType, { developerName: memberName, id: memberName });
    } else {
      addSelected({
        type: artType,
        key: memberName,
        descriptor: buildFetchDescriptor(artType, memberName)
      });
    }
    const item = findRestComparableItem(artType, memberName);
    if (!item) {
      showToast(t('toast.fetchFailed'), 'warn');
      return;
    }
    await switchToComparatorWithItem(item);
    return;
  }

  if (!retrieveCacheKey || !state.packageRetrieveZipCache[retrieveCacheKey]) {
    showToast(t('metadataTypeCompare.noRetrieveCache'), 'warn');
    return;
  }

  await openRetrieveMemberInExplorer(memberName);
}

async function listMembersForOrg(orgId, metadataType, folderHint, gen) {
  const payload = {
    type: 'metadataTypeCompare:listMembers',
    orgId,
    metadataType,
    compareGeneration: gen
  };
  if (folderHint) payload.folder = folderHint;
  return bg(payload);
}

async function runComparison() {
  const typeSel = document.getElementById('metadataTypeCompareTypeSelect');
  const metadataType = typeSel?.value?.trim() || '';
  const status = document.getElementById('metadataTypeCompareStatus');

  if (!state.leftOrgId) {
    if (status) status.textContent = t('metadataTypeCompare.selectLeft');
    showToast(t('metadataTypeCompare.selectLeft'), 'warn');
    return;
  }
  if (!state.rightOrgId) {
    if (status) status.textContent = t('metadataTypeCompare.selectRight');
    showToast(t('metadataTypeCompare.selectRight'), 'warn');
    return;
  }
  if (!metadataType) {
    if (status) status.textContent = t('metadataTypeCompare.selectType');
    showToast(t('metadataTypeCompare.selectType'), 'warn');
    return;
  }
  if (compareInFlight) return;

  if (HEAVY_METADATA_TYPES.includes(metadataType)) {
    showToast(t('metadataTypeCompare.heavyTypeWarning'), 'warn');
  }

  compareInFlight = true;
  mergedRows = [];
  currentMetadataType = metadataType;
  selectedMemberKey = '';
  clearRetrieveCompareCache();
  setCompareChrome(true);
  document.getElementById('metadataTypeCompareTableMount').innerHTML = '';

  const gen = await beginMetadataTypeCompareUiSession();
  showToastWithSpinner(t('metadataTypeCompare.comparing'), {
    onCancel: () => {
      void cancelMetadataTypeCompareUi();
      compareInFlight = false;
      setCompareChrome(false);
      hideProgress();
      mergedRows = [];
      selectedMemberKey = '';
      if (status) status.textContent = t('metadataTypeCompare.cancelled');
    }
  });

  const metaObj = describeCache.find((o) => o.xmlName === metadataType);
  const folderHint = metaObj?.directoryName?.trim() || undefined;

  try {
    setProgress(0, 1, 'listing');
    const [leftRes, rightRes] = await Promise.all([
      listMembersForOrg(state.leftOrgId, metadataType, folderHint, gen),
      listMembersForOrg(state.rightOrgId, metadataType, folderHint, gen)
    ]);

    if (!isMetadataTypeCompareActive(gen)) return;

    if (!leftRes?.ok) {
      const msg =
        leftRes?.reason === 'NO_SID'
          ? t('toast.noSession')
          : leftRes?.reason === 'CANCELLED'
            ? t('metadataTypeCompare.cancelled')
            : leftRes?.error || t('metadataTypeCompare.listError');
      void handleToolResponseFailure(leftRes, { artifact_type: 'MetadataTypeCompare', phase: 'list' });
      if (status) status.textContent = msg;
      showToast(msg, 'error');
      return;
    }
    if (!rightRes?.ok) {
      const msg =
        rightRes?.reason === 'NO_SID'
          ? t('toast.noSession')
          : rightRes?.reason === 'CANCELLED'
            ? t('metadataTypeCompare.cancelled')
            : rightRes?.error || t('metadataTypeCompare.listError');
      void handleToolResponseFailure(rightRes, { artifact_type: 'MetadataTypeCompare', phase: 'list' });
      if (status) status.textContent = msg;
      showToast(msg, 'error');
      return;
    }

    const leftNames = leftRes.members || [];
    const rightNames = rightRes.members || [];
    const unionNames = [...new Set([...leftNames, ...rightNames])].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

    if (!unionNames.length) {
      if (status) status.textContent = t('metadataTypeCompare.noMembers');
      showToast(t('metadataTypeCompare.noMembers'), 'info');
      return;
    }

    if (!isRestComparableMetadataType(metadataType) && unionNames.length > 500) {
      showToast(t('metadataTypeCompare.largeRetrieveWarning', { count: unionNames.length }), 'warn');
    }

    /** @type {Map<string, { status: string, detail?: string }>} */
    const compareResults = new Map();

    if (isRestComparableMetadataType(metadataType)) {
      let done = 0;
      const total = unionNames.length;
      setProgress(done, total, 'comparing');

      for (let i = 0; i < unionNames.length; i += REST_BATCH_SIZE) {
        if (!isMetadataTypeCompareActive(gen)) return;
        const chunk = unionNames.slice(i, i + REST_BATCH_SIZE);
        const batchRes = await bg({
          type: 'metadataTypeCompare:compareRestBatch',
          leftOrgId: state.leftOrgId,
          rightOrgId: state.rightOrgId,
          metadataType,
          memberNames: chunk,
          compareGeneration: gen
        });

        if (!isMetadataTypeCompareActive(gen) || batchRes?.reason === 'CANCELLED') return;

        if (!batchRes?.ok) {
          const msg = batchRes?.error || t('metadataTypeCompare.compareError');
          void handleToolResponseFailure(batchRes, {
            artifact_type: 'MetadataTypeCompare',
            phase: 'compare_batch'
          });
          if (status) status.textContent = msg;
          showToast(msg, 'error');
          return;
        }

        for (const row of batchRes.rows || []) {
          compareResults.set(row.key, { status: row.status, detail: row.detail });
        }
        done = Math.min(total, i + chunk.length);
        setProgress(done, total, 'comparing');
      }

      mergedRows = mergeMemberRows(leftNames, rightNames, compareResults);
    } else {
      const retrieveGen = await beginRetrieveSessionForCompare();
      setProgress(0, 2, 'retrieving');

      const leftOrg = (state.orgsList || []).find((o) => o.id === state.leftOrgId);
      const leftVer = leftOrg?.apiVersion || '60.0';
      const pkg = buildWildcardPackageXml(metadataType, leftVer);

      const [leftZipRes, rightZipRes] = await Promise.all([
        bg({
          type: 'metadata:retrievePackageXml',
          orgId: state.leftOrgId,
          packageXml: pkg,
          retrieveGeneration: retrieveGen
        }),
        bg({
          type: 'metadata:retrievePackageXml',
          orgId: state.rightOrgId,
          packageXml: pkg,
          retrieveGeneration: retrieveGen
        })
      ]);

      dismissSpinnerToast();

      if (!isMetadataTypeCompareActive(gen) || !isRetrieveSessionActive(retrieveGen)) return;

      if (!leftZipRes?.ok) {
        const msg = leftZipRes?.error || leftZipRes?.reason || t('metadataTypeCompare.retrieveError');
        if (status) status.textContent = msg;
        showToast(msg, 'error');
        return;
      }
      if (!rightZipRes?.ok) {
        const msg = rightZipRes?.error || rightZipRes?.reason || t('metadataTypeCompare.retrieveError');
        if (status) status.textContent = msg;
        showToast(msg, 'error');
        return;
      }

      setProgress(1, 2, 'retrieving');

      const leftBytes = Uint8Array.from(atob(leftZipRes.zipBase64), (c) => c.charCodeAt(0));
      const rightBytes = Uint8Array.from(atob(rightZipRes.zipBase64), (c) => c.charCodeAt(0));
      const leftFiles = await readZipAllMetadataCompareFiles(leftBytes);
      const rightFiles = await readZipAllMetadataCompareFiles(rightBytes);

      if (!isMetadataTypeCompareActive(gen)) return;

      const cache = buildRetrieveCompareCache(leftFiles, rightFiles, metadataType);
      retrieveCacheKey = `mtc-${metadataType}-${Date.now()}`;
      memberPrimaryPath = cache.primaryPathByMember;

      mergedRows = compareRetrieveZipFiles(leftFiles, rightFiles, metadataType);
      for (const row of mergedRows) {
        compareResults.set(row.key, { status: row.status, detail: row.detail });
      }
      mergedRows = mergeMemberRows(leftNames, rightNames, compareResults);

      const { memberStatusByKey, pathStatusByRelativePath } = buildPathStatusMaps(
        mergedRows,
        cache.paths,
        metadataType,
        cache.primaryPathByMember
      );
      state.packageRetrieveZipCache[retrieveCacheKey] = {
        leftByPath: cache.leftByPath,
        rightByPath: cache.rightByPath,
        paths: cache.paths,
        metadataTypeCompare: true,
        metadataType,
        memberStatusByKey,
        pathStatusByRelativePath
      };
      setProgress(2, 2, 'retrieving');
    }

    if (!isMetadataTypeCompareActive(gen)) return;

    dismissSpinnerToast();
    hideProgress();

    const diffCount = mergedRows.filter((r) => r.status !== 'match').length;
    if (status) {
      status.textContent = t('metadataTypeCompare.doneSummary', {
        total: mergedRows.length,
        diffs: diffCount
      });
    }

    renderTable();
    showToast(t('metadataTypeCompare.doneToast', { diffs: diffCount }), 'info');
  } catch (e) {
    void handleToolError(e, { artifact_type: 'MetadataTypeCompare', phase: 'compare' });
    dismissSpinnerToast();
    hideProgress();
    if (status) status.textContent = String(e?.message || e);
    showToast(String(e?.message || e), 'error');
  } finally {
    compareInFlight = false;
    setCompareChrome(false);
    clearMetadataTypeCompareUiSession(gen);
    await cancelRetrieveSessionForCompare({ silent: true, showToast: false });
  }
}

export function invalidateMetadataTypeComparePanel() {
  if (compareInFlight) {
    void cancelMetadataTypeCompareUi({ silent: true });
  }
  mergedRows = [];
  selectedMemberKey = '';
  clearRetrieveCompareCache();
  compareInFlight = false;
  setCompareChrome(false);
  hideProgress();
  document.getElementById('metadataTypeCompareTableMount').innerHTML = '';
  const status = document.getElementById('metadataTypeCompareStatus');
  if (status) status.textContent = t('metadataTypeCompare.pickTypeAndCompare');
}

export async function refreshMetadataTypeComparePanel() {
  if (getSelectedArtifactType() !== 'MetadataTypeCompare') {
    if (compareInFlight) invalidateMetadataTypeComparePanel();
    return;
  }
  await loadMetadataTypes();
  restoreResultsUiIfAny();
  if (!compareInFlight) {
    const status = document.getElementById('metadataTypeCompareStatus');
    if (status && !mergedRows.length) {
      status.textContent = t('metadataTypeCompare.pickTypeAndCompare');
    }
  }
}

export function setupMetadataTypeComparePanel() {
  if (panelWired) return;
  panelWired = true;

  document.getElementById('metadataTypeCompareTypeSearch')?.addEventListener('input', (ev) => {
    populateTypeSelect(ev.target?.value || '');
  });

  document.getElementById('metadataTypeCompareDiffOnly')?.addEventListener('change', () => {
    if (mergedRows.length) renderTable();
  });

  document.getElementById('metadataTypeCompareRunBtn')?.addEventListener('click', () => {
    void runComparison();
  });

  document.getElementById('metadataTypeCompareCancelBtn')?.addEventListener('click', () => {
    void cancelMetadataTypeCompareUi();
    compareInFlight = false;
    setCompareChrome(false);
    hideProgress();
    mergedRows = [];
    selectedMemberKey = '';
    clearRetrieveCompareCache();
    const status = document.getElementById('metadataTypeCompareStatus');
    if (status) status.textContent = t('metadataTypeCompare.cancelled');
  });
}
