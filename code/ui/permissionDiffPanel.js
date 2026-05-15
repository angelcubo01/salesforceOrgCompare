import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { applyArtifactTypeUi } from './artifactTypeUi.js';
import { updateOrgDropdownLayout } from './orgs.js';
import { renderPermissionFlagsHtml } from '../lib/permissionFlagsUi.js';
import {
  buildPermissionDiffBundle,
  comparePermissionBundles,
  buildAccessByResourceBundle,
  compareAccessByResourceBundles,
  formatSetupEntityLabel,
} from '../../shared/permissionsDiffCore.js';
import {
  customPermCommitActive,
  invalidateCustomPermCommit,
  clearCustomPermResults,
  hasCustomPermResults,
  pickCustomPerm,
  searchCustomPermissions,
  loadCustomPermData,
  getCustomPermRowCount,
  renderCustomPermSummary,
  syncCustomPermTableHeader,
  renderCustomPermTable
} from './permissionDiffCustomPermUi.js';

/** @type {'container'|'resource'|'customPermission'} */
let queryDirection = 'container';
/** @type {'object'|'field'|'setup'} */
let activeSection = 'object';
/** @type {'object'|'field'} */
let resourceType = 'object';
let showDiffOnly = false;
const SEARCH_DEBOUNCE_MS = 280;
const MIN_SUGGEST_LEN = 2;

/** @type {{ containerType: string, name: string }|null} */
let committedContainer = null;
/** @type {{ resourceType: 'object'|'field', name: string }|null} */
let committedResource = null;

let searchTimer = null;

function els() {
  return {
    status: document.getElementById('permissionDiffStatus'),
    containerBlock: document.getElementById('permissionDiffContainerBlock'),
    resourceBlock: document.getElementById('permissionDiffResourceBlock'),
    sectionTabs: document.getElementById('permissionDiffSectionTabs'),
    containerType: document.getElementById('permissionDiffContainerType'),
    nameInput: document.getElementById('permissionDiffNameInput'),
    suggestions: document.getElementById('permissionDiffSuggestions'),
    resourceTypeSelect: document.getElementById('permissionDiffResourceType'),
    resourceInput: document.getElementById('permissionDiffResourceInput'),
    resourceSuggestions: document.getElementById('permissionDiffResourceSuggestions'),
    containerFilter: document.getElementById('permissionDiffContainerFilter'),
    summary: document.getElementById('permissionDiffSummary'),
    tbody: document.getElementById('permissionDiffTbody'),
    empty: document.getElementById('permissionDiffEmpty'),
    filter: document.getElementById('permissionDiffFilter'),
    diffOnly: document.getElementById('permissionDiffDiffOnly'),
    customPermBlock: document.getElementById('permissionDiffCustomPermBlock'),
    customPermInput: document.getElementById('permissionDiffCustomPermInput'),
    customPermSuggestions: document.getElementById('permissionDiffCustomPermSuggestions'),
    containerFilterCp: document.getElementById('permissionDiffContainerFilterCp')
  };
}

function isResourceMode() {
  return queryDirection === 'resource';
}

function isCustomPermMode() {
  return queryDirection === 'customPermission';
}

function getCustomPermInput() {
  return String(els().customPermInput?.value || '').trim();
}

function getContainerFilterCp() {
  const v = els().containerFilterCp?.value;
  if (v === 'Profile' || v === 'PermissionSet') return v;
  return 'all';
}

function getContainerType() {
  const v = els().containerType?.value;
  return v === 'Profile' ? 'Profile' : 'PermissionSet';
}

function getContainerName() {
  return String(els().nameInput?.value || '').trim();
}

function getResourceInput() {
  return String(els().resourceInput?.value || '').trim();
}

function getResourceType() {
  return els().resourceTypeSelect?.value === 'field' ? 'field' : 'object';
}

function getContainerFilter() {
  const v = els().containerFilter?.value;
  if (v === 'Profile' || v === 'PermissionSet') return v;
  return 'all';
}

function setStatus(text, tone = '') {
  const { status } = els();
  if (!status) return;
  status.textContent = text || '';
  status.classList.remove('is-error');
  if (tone === 'error') status.classList.add('is-error');
}

function hideSuggestions() {
  const { suggestions, resourceSuggestions, customPermSuggestions } = els();
  if (suggestions) {
    suggestions.innerHTML = '';
    suggestions.hidden = true;
  }
  if (resourceSuggestions) {
    resourceSuggestions.innerHTML = '';
    resourceSuggestions.hidden = true;
  }
  if (customPermSuggestions) {
    customPermSuggestions.innerHTML = '';
    customPermSuggestions.hidden = true;
  }
}

function setResultsVisible(visible) {
  document.querySelector('.permission-diff-table-wrap')?.classList.toggle('hidden', !visible);
  document.getElementById('permissionDiffSummary')?.classList.toggle('hidden', !visible);
  document.querySelector('.permission-diff-filters-shared')?.classList.toggle('hidden', !visible);
  document
    .getElementById('permissionDiffSectionTabs')
    ?.classList.toggle('hidden', isResourceMode() || isCustomPermMode() || !visible);
}

function pickCustomPermItem(item) {
  if (els().customPermInput) els().customPermInput.value = item.name;
  pickCustomPerm(item, () => void runLoad());
}

function containerCommitActive() {
  return (
    !!committedContainer &&
    getContainerName() === committedContainer.name &&
    getContainerType() === committedContainer.containerType
  );
}

function resourceCommitActive() {
  return (
    !!committedResource &&
    getResourceInput() === committedResource.name &&
    getResourceType() === committedResource.resourceType
  );
}

function invalidateContainerCommit() {
  if (!containerCommitActive()) {
    committedContainer = null;
    clearResults();
    setResultsVisible(false);
  }
}

function invalidateResourceCommit() {
  if (!resourceCommitActive()) {
    committedResource = null;
    clearResults();
    setResultsVisible(false);
  }
}

function renderSuggestionsList(listEl, items, onPick) {
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!items?.length) {
    listEl.hidden = true;
    return;
  }
  for (const it of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'permission-diff-suggestion';
    btn.textContent = it.name || '';
    btn.addEventListener('mousedown', (ev) => ev.preventDefault());
    btn.addEventListener('click', () => onPick(it));
    listEl.appendChild(btn);
  }
  listEl.hidden = false;
}

function pickContainer(item) {
  const containerType =
    item.containerType === 'Profile' || item.type === 'Profile' ? 'Profile' : 'PermissionSet';
  if (els().containerType) els().containerType.value = containerType;
  if (els().nameInput) els().nameInput.value = item.name;
  committedContainer = { containerType, name: item.name };
  hideSuggestions();
  void runLoad();
}

function pickResource(item) {
  const rt = getResourceType();
  if (els().resourceTypeSelect) els().resourceTypeSelect.value = rt;
  resourceType = rt;
  if (els().resourceInput) els().resourceInput.value = item.name;
  committedResource = { resourceType: rt, name: item.name };
  hideSuggestions();
  void runLoad();
}

function syncDirectionUi() {
  const { containerBlock, resourceBlock, customPermBlock, diffOnly } = els();
  const resource = isResourceMode();
  const customPerm = isCustomPermMode();
  containerBlock?.classList.toggle('hidden', resource || customPerm);
  resourceBlock?.classList.toggle('hidden', !resource);
  customPermBlock?.classList.toggle('hidden', !customPerm);
  document.body.classList.toggle('permission-diff-query-resource', resource || customPerm);
  document.body.classList.toggle('permission-diff-query-custom-perm', customPerm);
  setResultsVisible(
    customPerm
      ? customPermCommitActive(getCustomPermInput()) && hasCustomPermResults()
      : isResourceMode()
        ? resourceCommitActive()
        : containerCommitActive()
  );
  if (diffOnly?.parentElement) {
    diffOnly.parentElement.classList.toggle('hidden', !state.permissionDiffCompareMode);
  }
  document.querySelectorAll('[data-perm-diff-direction]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-perm-diff-direction') === queryDirection);
  });
  syncTableHeader();
}

async function logPermissionDiffQuery(meta) {
  try {
    await bg({
      type: 'usage:log',
      entry: {
        kind: 'codeComparison',
        action: 'permissionDiffQuery',
        artifactType: 'PermissionDiff',
        descriptor: {
          queryDirection: meta.queryDirection,
          resourceType: meta.resourceType || '',
          containerType: meta.containerType || '',
          name: meta.name || '',
          objectApiName: meta.objectApiName || '',
          fieldApiName: meta.fieldApiName || '',
          section: meta.section || '',
          rowCount: meta.rowCount ?? 0
        },
        leftOrgId: state.leftOrgId,
        rightOrgId: state.permissionDiffCompareMode ? state.rightOrgId : null,
        comparisonUrl: typeof window !== 'undefined' ? window.location.href : '',
        leftFilesCount: 0,
        rightFilesCount: 0
      }
    });
  } catch {
    /* analytics optional */
  }
}

function setupEntityTypeLabel(type) {
  const key = `permDiff.setupType.${type}`;
  const translated = t(key);
  return translated !== key ? translated : type;
}

function setupEntityDisplay(rec) {
  return formatSetupEntityLabel(rec, setupEntityTypeLabel);
}

function setupRowDisplay(row) {
  const rec = row?.left || row?.right;
  return rec ? setupEntityDisplay(rec) : row?.key || '';
}

function flagsHtml(rec, sectionOrKind) {
  if (!rec) return '<span class="perm-flags-empty">—</span>';
  if (sectionOrKind === 'setup') {
    return `<span class="perm-setup-access">${escapeHtml(t('permDiff.setupAccess'))}</span>`;
  }
  return renderPermissionFlagsHtml(rec, sectionOrKind === 'field' ? 'field' : 'object');
}

async function runSearchSuggestions() {
  if (!state.leftOrgId) {
    hideSuggestions();
    return;
  }
  if (isCustomPermMode()) {
    const q = getCustomPermInput();
    if (q.length < MIN_SUGGEST_LEN) {
      hideSuggestions();
      return;
    }
    try {
      const items = await searchCustomPermissions(state.leftOrgId, q);
      renderSuggestionsList(els().customPermSuggestions, items, pickCustomPermItem);
    } catch {
      hideSuggestions();
    }
    return;
  }

  const q = isResourceMode() ? getResourceInput() : getContainerName();
  if (q.length < MIN_SUGGEST_LEN) {
    hideSuggestions();
    return;
  }

  try {
    if (isResourceMode()) {
      const rt = getResourceType();
      const objectApiName = q.includes('.') ? q.split('.')[0] : '';
      const res = await bg({
        type: 'permissionsDiff:searchResource',
        orgId: state.leftOrgId,
        resourceType: rt,
        queryText: q,
        objectApiName
      });
      renderSuggestionsList(els().resourceSuggestions, res?.ok ? res.items : [], pickResource);
    } else {
      const res = await bg({
        type: 'permissionsDiff:search',
        orgId: state.leftOrgId,
        containerType: getContainerType(),
        queryText: q
      });
      renderSuggestionsList(els().suggestions, res?.ok ? res.items : [], pickContainer);
    }
  } catch {
    hideSuggestions();
  }
}

function sectionToBundleKey(sec) {
  if (sec === 'field') return 'fieldPermissions';
  if (sec === 'setup') return 'setupEntityAccess';
  return 'objectPermissions';
}

function statusRowClass(status) {
  if (status === 'diff') return 'perm-diff-row-diff';
  if (status === 'leftOnly') return 'perm-diff-row-left-only';
  if (status === 'rightOnly') return 'perm-diff-row-right-only';
  return 'perm-diff-row-same';
}

function matchesFilter(key, filter, extraText = '') {
  if (!filter) return true;
  const hay = `${key} ${extraText}`.toLowerCase();
  return hay.includes(filter.toLowerCase());
}

function setupMatchesFilter(rowOrRec, filter) {
  const rec = rowOrRec?.left || rowOrRec?.right || rowOrRec;
  const label = rec?.SetupEntityType || rec?.SetupEntityId
    ? setupEntityDisplay(rec)
    : String(rowOrRec?.key || '');
  return matchesFilter(label, filter, rec?.SetupEntityName || '');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function statusLabel(status) {
  const map = {
    same: t('permDiff.statusSame'),
    diff: t('permDiff.statusDiff'),
    leftOnly: t('permDiff.statusLeftOnly'),
    rightOnly: t('permDiff.statusRightOnly')
  };
  return map[status] || status;
}

function formatContainerTypeLabel(type) {
  return type === 'Profile' ? t('permDiff.typeProfile') : t('permDiff.typePermissionSet');
}

function formatAccessGrant(rec, rt) {
  return renderPermissionFlagsHtml(rec, rt === 'field' ? 'field' : 'object');
}

function formatRowValue(rec, section) {
  if (!rec) return '<span class="perm-flags-empty">—</span>';
  return flagsHtml(rec, section);
}

function syncTableHeader() {
  if (isCustomPermMode()) {
    syncCustomPermTableHeader();
    return;
  }
  const thead = document.getElementById('permissionDiffThead');
  const table = document.getElementById('permissionDiffTable');
  if (!thead) return;
  const compare = !!state.permissionDiffCompareMode;
  table?.classList.remove('is-cp-apex-only');
  if (isResourceMode()) {
    if (compare) {
      thead.innerHTML = `
        <tr>
          <th scope="col">${t('permDiff.colContainer')}</th>
          <th scope="col">${t('permDiff.colContainerType')}</th>
          <th scope="col">${t('permDiff.colStatus')}</th>
          <th scope="col">${t('permDiff.colLeft')}</th>
          <th scope="col">${t('permDiff.colRight')}</th>
        </tr>`;
    } else {
      thead.innerHTML = `
        <tr>
          <th scope="col">${t('permDiff.colContainer')}</th>
          <th scope="col">${t('permDiff.colContainerType')}</th>
          <th scope="col">${t('permDiff.colPermissions')}</th>
        </tr>`;
    }
    table?.classList.toggle('is-compare', compare);
    table?.classList.add('is-resource');
    return;
  }
  table?.classList.remove('is-resource');
  if (compare) {
    thead.innerHTML = `
      <tr>
        <th scope="col">${t('permDiff.colKey')}</th>
        <th scope="col">${t('permDiff.colStatus')}</th>
        <th scope="col">${t('permDiff.colLeft')}</th>
        <th scope="col">${t('permDiff.colRight')}</th>
      </tr>`;
  } else {
    thead.innerHTML = `
      <tr>
        <th scope="col">${t('permDiff.colKey')}</th>
        <th scope="col">${t('permDiff.colValue')}</th>
      </tr>`;
  }
  table?.classList.toggle('is-compare', compare);
}

/** @type {ReturnType<typeof comparePermissionBundles>|null} */
let lastCompare = null;
/** @type {ReturnType<typeof buildPermissionDiffBundle>|null} */
let lastSingle = null;
/** @type {ReturnType<typeof compareAccessByResourceBundles>|null} */
let lastAccessCompare = null;
/** @type {ReturnType<typeof buildAccessByResourceBundle>|null} */
let lastAccessSingle = null;

function renderSummary() {
  const { summary } = els();
  if (!summary) return;
  if (isCustomPermMode()) {
    renderCustomPermSummary(summary, getCustomPermInput());
    return;
  }
  if (isResourceMode()) {
    if (state.permissionDiffCompareMode && lastAccessCompare) {
      const s = lastAccessCompare.summary;
      summary.textContent = t('permDiff.summaryAccessCompare', {
        same: s?.same ?? 0,
        diff: s?.diff ?? 0,
        leftOnly: s?.leftOnly ?? 0,
        rightOnly: s?.rightOnly ?? 0,
        total: s?.total ?? 0
      });
      return;
    }
    if (!state.permissionDiffCompareMode && lastAccessSingle) {
      summary.textContent = t('permDiff.summaryAccessSingle', {
        count: lastAccessSingle.grants?.length ?? 0,
        resource: getResourceInput()
      });
      return;
    }
  } else {
    if (state.permissionDiffCompareMode && lastCompare) {
      const s = lastCompare[sectionToBundleKey(activeSection)]?.summary;
      summary.textContent = t('permDiff.summaryCompare', {
        same: s?.same ?? 0,
        diff: s?.diff ?? 0,
        leftOnly: s?.leftOnly ?? 0,
        rightOnly: s?.rightOnly ?? 0,
        total: s?.total ?? 0
      });
      return;
    }
    if (!state.permissionDiffCompareMode && lastSingle) {
      const count = lastSingle[sectionToBundleKey(activeSection)]?.length ?? 0;
      summary.textContent = t('permDiff.summarySingle', { count });
      return;
    }
  }
  summary.textContent = '';
}

function renderResourceTable() {
  const { tbody, empty, filter: filterEl } = els();
  if (!tbody || !empty) return;
  const filter = String(filterEl?.value || '').trim();
  const rt = getResourceType();
  tbody.innerHTML = '';
  const compare = !!state.permissionDiffCompareMode && !!lastAccessCompare;

  if (compare && lastAccessCompare) {
    const rows = lastAccessCompare.rows.filter((r) => {
      if (showDiffOnly && r.status === 'same') return false;
      return matchesFilter(r.key, filter) || matchesFilter(r.left?.containerName || '', filter);
    });
    if (!rows.length) {
      empty.hidden = false;
      empty.textContent = t('permDiff.empty');
      return;
    }
    empty.hidden = true;
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.className = statusRowClass(row.status);
      const name = row.left?.containerName || row.right?.containerName || row.key;
      const type = row.left?.containerType || row.right?.containerType || '';
      tr.innerHTML = `
        <td class="perm-diff-col-key">${escapeHtml(name)}</td>
        <td>${escapeHtml(formatContainerTypeLabel(type))}</td>
        <td>${statusLabel(row.status)}</td>
        <td class="perm-diff-flags-cell">${formatAccessGrant(row.left, rt)}</td>
        <td class="perm-diff-flags-cell">${formatAccessGrant(row.right, rt)}</td>
      `;
      tbody.appendChild(tr);
    }
    return;
  }

  const grants = (lastAccessSingle?.grants || []).filter(
    (r) => matchesFilter(r.key, filter) || matchesFilter(r.containerName, filter)
  );
  if (!grants.length) {
    empty.hidden = false;
    empty.textContent = t('permDiff.empty');
    return;
  }
  empty.hidden = true;
  for (const grant of grants) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="perm-diff-col-key">${escapeHtml(grant.containerName)}</td>
      <td>${escapeHtml(formatContainerTypeLabel(grant.containerType))}</td>
      <td class="perm-diff-flags-cell">${formatAccessGrant(grant, rt)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderContainerTable() {
  const { tbody, empty, filter: filterEl } = els();
  if (!tbody || !empty) return;
  const filter = String(filterEl?.value || '').trim();
  tbody.innerHTML = '';
  const compare = !!state.permissionDiffCompareMode && !!lastCompare;

  if (compare && lastCompare) {
    const section = lastCompare[sectionToBundleKey(activeSection)];
    const rows = (section?.rows || []).filter((r) => {
      if (showDiffOnly && r.status === 'same') return false;
      if (activeSection === 'setup') return setupMatchesFilter(r, filter);
      return matchesFilter(r.key, filter);
    });
    if (!rows.length) {
      empty.hidden = false;
      empty.textContent = t('permDiff.empty');
      return;
    }
    empty.hidden = true;
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.className = statusRowClass(row.status);
      const keyCell =
        activeSection === 'setup' ? escapeHtml(setupRowDisplay(row)) : escapeHtml(row.key);
      tr.innerHTML = `
        <td class="perm-diff-col-key">${keyCell}</td>
        <td>${statusLabel(row.status)}</td>
        <td class="perm-diff-flags-cell">${formatRowValue(row.left, activeSection)}</td>
        <td class="perm-diff-flags-cell">${formatRowValue(row.right, activeSection)}</td>
      `;
      tbody.appendChild(tr);
    }
    return;
  }

  const key = sectionToBundleKey(activeSection);
  const rows = (lastSingle?.[key] || []).filter((r) =>
    activeSection === 'setup' ? setupMatchesFilter(r, filter) : matchesFilter(r.key, filter)
  );
  if (!rows.length) {
    empty.hidden = false;
    empty.textContent = t('permDiff.empty');
    return;
  }
  empty.hidden = true;
  for (const row of rows) {
    const tr = document.createElement('tr');
    const keyCell =
      activeSection === 'setup' ? escapeHtml(setupEntityDisplay(row)) : escapeHtml(row.key);
    tr.innerHTML = `
      <td class="perm-diff-col-key">${keyCell}</td>
      <td class="perm-diff-flags-cell">${formatRowValue(row, activeSection)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function repaint() {
  syncTableHeader();
  renderSummary();
  if (isCustomPermMode()) {
    const { tbody, empty, filter } = els();
    renderCustomPermTable(tbody, empty, String(filter?.value || '').trim(), showDiffOnly);
    return;
  }
  if (isResourceMode()) renderResourceTable();
  else renderContainerTable();
}

async function fetchBundle(orgId, containerType, containerName) {
  const res = await bg({
    type: 'permissionsDiff:fetch',
    orgId,
    containerType,
    containerName
  });
  if (!res?.ok) {
    const msg = res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('permDiff.fetchError');
    throw new Error(msg);
  }
  return buildPermissionDiffBundle(res);
}

async function fetchAccessBundle(orgId, rt, resourceInput, containerFilter) {
  const res = await bg({
    type: 'permissionsDiff:fetchByResource',
    orgId,
    resourceType: rt,
    resourceInput,
    containerFilter
  });
  if (!res?.ok) {
    const msg = res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('permDiff.fetchError');
    throw new Error(msg);
  }
  return buildAccessByResourceBundle({ grants: res.grants || [] });
}

function clearResults() {
  lastCompare = null;
  lastSingle = null;
  lastAccessCompare = null;
  lastAccessSingle = null;
  clearCustomPermResults();
}

async function runLoad() {
  if (!state.leftOrgId) {
    setStatus(t('permDiff.selectOrg'), 'error');
    return;
  }
  if (state.permissionDiffCompareMode && !state.rightOrgId) {
    setStatus(t('permDiff.selectRightOrg'), 'error');
    return;
  }

  if (isCustomPermMode()) {
    if (!customPermCommitActive(getCustomPermInput())) {
      return;
    }
    hideSuggestions();
    showToastWithSpinner(t('permDiff.loading'));
    setStatus(t('permDiff.loading'));
    clearResults();
    try {
      await loadCustomPermData(
        state.leftOrgId,
        state.permissionDiffCompareMode ? state.rightOrgId : null,
        !!state.permissionDiffCompareMode,
        getContainerFilterCp()
      );
      setStatus('');
      showToast(t('permDiff.loaded'), 'success');
      void logPermissionDiffQuery({
        queryDirection: 'customPermission',
        name: getCustomPermInput(),
        section: 'assignments',
        rowCount: getCustomPermRowCount()
      });
      setResultsVisible(true);
      repaint();
    } catch (e) {
      invalidateCustomPermCommit();
      setResultsVisible(false);
      setStatus(String(e?.message || e), 'error');
      showToast(String(e?.message || e), 'error');
      repaint();
    } finally {
      dismissSpinnerToast();
    }
    return;
  }

  if (isResourceMode()) {
    if (!resourceCommitActive() || !committedResource) {
      return;
    }
    const resourceInput = committedResource.name;
    const rt = committedResource.resourceType;
    resourceType = rt;
    hideSuggestions();
    showToastWithSpinner(t('permDiff.loading'));
    setStatus(t('permDiff.loading'));
    clearResults();
    try {
      const containerFilter = getContainerFilter();
      if (state.permissionDiffCompareMode) {
        const [left, right] = await Promise.all([
          fetchAccessBundle(state.leftOrgId, rt, resourceInput, containerFilter),
          fetchAccessBundle(state.rightOrgId, rt, resourceInput, containerFilter)
        ]);
        lastAccessCompare = compareAccessByResourceBundles(left, right, rt);
      } else {
        lastAccessSingle = await fetchAccessBundle(state.leftOrgId, rt, resourceInput, containerFilter);
      }
      setStatus('');
      showToast(t('permDiff.loaded'), 'success');
      const rowCount = state.permissionDiffCompareMode
        ? lastAccessCompare?.summary?.total ?? 0
        : lastAccessSingle?.grants?.length ?? 0;
      void logPermissionDiffQuery({
        queryDirection: 'resource',
        resourceType: rt,
        name: resourceInput,
        objectApiName: resourceInput.includes('.') ? resourceInput.split('.')[0] : resourceInput,
        fieldApiName: rt === 'field' ? resourceInput : '',
        section: rt,
        rowCount
      });
      setResultsVisible(true);
      repaint();
    } catch (e) {
      committedResource = null;
      setResultsVisible(false);
      setStatus(String(e?.message || e), 'error');
      showToast(String(e?.message || e), 'error');
      repaint();
    } finally {
      dismissSpinnerToast();
    }
    return;
  }

  if (!containerCommitActive() || !committedContainer) {
    return;
  }

  const { containerType, name: containerName } = committedContainer;

  hideSuggestions();
  showToastWithSpinner(t('permDiff.loading'));
  setStatus(t('permDiff.loading'));
  clearResults();

  try {
    if (state.permissionDiffCompareMode) {
      const [leftBundle, rightBundle] = await Promise.all([
        fetchBundle(state.leftOrgId, containerType, containerName),
        fetchBundle(state.rightOrgId, containerType, containerName)
      ]);
      lastCompare = comparePermissionBundles(leftBundle, rightBundle);
    } else {
      lastSingle = await fetchBundle(state.leftOrgId, containerType, containerName);
    }
    setStatus('');
    showToast(t('permDiff.loaded'), 'success');
    const section = sectionToBundleKey(activeSection);
    const rowCount = state.permissionDiffCompareMode
      ? lastCompare?.[section]?.summary?.total ?? 0
      : lastSingle?.[section]?.length ?? 0;
    void logPermissionDiffQuery({
      queryDirection: 'container',
      containerType,
      name: containerName,
      objectApiName: activeSection === 'object' ? '' : '',
      section: activeSection,
      rowCount
    });
    setResultsVisible(true);
    repaint();
  } catch (e) {
    committedContainer = null;
    setResultsVisible(false);
    setStatus(String(e?.message || e), 'error');
    showToast(String(e?.message || e), 'error');
    repaint();
  } finally {
    dismissSpinnerToast();
  }
}

export async function refreshPermissionDiffPanel() {
  const toggle = document.getElementById('permissionDiffCompareToggle');
  if (toggle) toggle.checked = !!state.permissionDiffCompareMode;
  updateOrgDropdownLayout();
  syncDirectionUi();
  if (!state.leftOrgId) {
    setStatus(t('permDiff.selectOrg'));
    return;
  }
  if (isCustomPermMode()) {
    if (!getCustomPermInput()) setStatus('');
  } else if (isResourceMode() ? !getResourceInput() : !getContainerName()) {
    setStatus('');
  }
}

export function setupPermissionDiffPanel() {
  const toggle = document.getElementById('permissionDiffCompareToggle');
  const {
    containerType,
    nameInput,
    resourceTypeSelect,
    resourceInput,
    filter,
    diffOnly
  } = els();

  if (toggle) {
    toggle.checked = !!state.permissionDiffCompareMode;
    toggle.addEventListener('change', () => {
      state.permissionDiffCompareMode = !!toggle.checked;
      clearResults();
      applyArtifactTypeUi();
      updateOrgDropdownLayout();
      syncDirectionUi();
      repaint();
    });
  }

  document.querySelectorAll('[data-perm-diff-direction]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = btn.getAttribute('data-perm-diff-direction');
      if (dir !== 'container' && dir !== 'resource' && dir !== 'customPermission') return;
      queryDirection = dir;
      committedContainer = null;
      committedResource = null;
      invalidateCustomPermCommit();
      clearResults();
      hideSuggestions();
      setResultsVisible(false);
      syncDirectionUi();
      repaint();
    });
  });

  containerType?.addEventListener('change', () => {
    hideSuggestions();
    invalidateContainerCommit();
    const q = getContainerName();
    if (!isResourceMode() && q.length >= MIN_SUGGEST_LEN) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => void runSearchSuggestions(), SEARCH_DEBOUNCE_MS);
    }
    if (q.length && !containerCommitActive()) {
      setStatus(t('permDiff.pickFromList'));
    }
  });

  resourceTypeSelect?.addEventListener('change', () => {
    resourceType = getResourceType();
    hideSuggestions();
    invalidateResourceCommit();
    repaint();
  });

  nameInput?.addEventListener('input', () => {
    if (!isResourceMode()) {
      invalidateContainerCommit();
      const q = getContainerName();
      if (!q.length) {
        hideSuggestions();
        setStatus('');
        return;
      }
      setStatus(t('permDiff.pickFromList'));
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => void runSearchSuggestions(), SEARCH_DEBOUNCE_MS);
    }
  });

  resourceInput?.addEventListener('input', () => {
    if (isResourceMode()) {
      invalidateResourceCommit();
      const q = getResourceInput();
      if (!q.length) {
        hideSuggestions();
        setStatus('');
        return;
      }
      setStatus(t('permDiff.pickResourceFromList'));
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => void runSearchSuggestions(), SEARCH_DEBOUNCE_MS);
    }
  });

  const bindSearchInput = (input) => {
    input?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') hideSuggestions();
    });
    input?.addEventListener('blur', () => {
      setTimeout(() => hideSuggestions(), 150);
    });
  };
  bindSearchInput(nameInput);
  bindSearchInput(resourceInput);
  bindSearchInput(els().customPermInput);

  els().customPermInput?.addEventListener('input', () => {
    if (!isCustomPermMode()) return;
    invalidateCustomPermCommit();
    const q = getCustomPermInput();
    if (!q.length) {
      hideSuggestions();
      setStatus('');
      return;
    }
    setStatus(t('permDiff.pickCustomPermFromList'));
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void runSearchSuggestions(), SEARCH_DEBOUNCE_MS);
  });

  els().containerFilterCp?.addEventListener('change', () => {
    if (customPermCommitActive(getCustomPermInput())) void runLoad();
  });

  filter?.addEventListener('input', () => repaint());

  diffOnly?.addEventListener('change', () => {
    showDiffOnly = !!diffOnly.checked;
    repaint();
  });

  document.querySelectorAll('[data-perm-diff-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sec = btn.getAttribute('data-perm-diff-section');
      if (sec !== 'object' && sec !== 'field' && sec !== 'setup') return;
      activeSection = sec;
      document.querySelectorAll('[data-perm-diff-section]').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      if (containerCommitActive()) {
        void runLoad();
      } else {
        repaint();
      }
    });
  });

  syncDirectionUi();
}
