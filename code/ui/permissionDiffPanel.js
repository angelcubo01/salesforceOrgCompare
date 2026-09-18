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
  resolveFieldResourceSuggestPhase,
  minFieldResourceSuggestLength
} from '../../shared/permissionsDiffCore.js';
import { handleToolError } from '../../shared/reportToolError.js';
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
/** @type {'object'|'field'} */
let resourceType = 'object';
let showDiffOnly = false;
const SEARCH_DEBOUNCE_MS = 280;
const MIN_SUGGEST_LEN = 2;

/** @type {{ containerType: 'Profile'|'PermissionSet', name: string, id?: string }|null} */
let committedContainer = null;
/** @type {{ resourceType: 'object'|'field', name: string }|null} */
let committedResource = null;

let searchTimer = null;
let suggestGeneration = 0;

function getActiveSuggestionsEl() {
  if (isCustomPermMode()) return els().customPermSuggestions;
  if (isResourceMode()) return els().resourceSuggestions;
  return els().suggestions;
}

function renderSuggestionsLoading(listEl) {
  if (!listEl) return;
  listEl.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'permission-diff-suggestion is-status permission-diff-suggestion-loading';
  row.setAttribute('role', 'status');
  row.setAttribute('aria-live', 'polite');
  const spinner = document.createElement('span');
  spinner.className = 'sidebar-search-loading-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  row.append(spinner, document.createTextNode(t('permDiff.suggestSearching')));
  listEl.appendChild(row);
  listEl.hidden = false;
}

function els() {
  return {
    status: document.getElementById('permissionDiffStatus'),
    containerBlock: document.getElementById('permissionDiffContainerBlock'),
    resourceBlock: document.getElementById('permissionDiffResourceBlock'),
    nameInput: document.getElementById('permissionDiffNameInput'),
    suggestions: document.getElementById('permissionDiffSuggestions'),
    resourceInput: document.getElementById('permissionDiffResourceInput'),
    resourceSuggestions: document.getElementById('permissionDiffResourceSuggestions'),
    summary: document.getElementById('permissionDiffSummary'),
    tbody: document.getElementById('permissionDiffTbody'),
    empty: document.getElementById('permissionDiffEmpty'),
    filter: document.getElementById('permissionDiffFilter'),
    diffOnly: document.getElementById('permissionDiffDiffOnly'),
    customPermBlock: document.getElementById('permissionDiffCustomPermBlock'),
    customPermInput: document.getElementById('permissionDiffCustomPermInput'),
    customPermSuggestions: document.getElementById('permissionDiffCustomPermSuggestions'),
    genericResults: document.getElementById('permissionDiffGenericResults')
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
  return 'all';
}

function getContainerName() {
  return String(els().nameInput?.value || '').trim();
}

function getResourceInput() {
  return String(els().resourceInput?.value || '').trim();
}

function getResourceType() {
  // Un punto identifica un campo cualificado (p. ej. Account.Name).
  // Sin punto se busca un objeto y, al escogerlo, se puede continuar con "Account.".
  return getResourceInput().includes('.') ? 'field' : 'object';
}

function getContainerFilter() {
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
  const { genericResults, summary } = els();
  genericResults?.classList.toggle('hidden', !visible);
  summary?.classList.toggle('hidden', !visible);
  document.querySelector('.permission-diff-filters-shared')?.classList.toggle('hidden', !visible);
}

function pickCustomPermItem(item) {
  queryDirection = 'customPermission';
  if (els().customPermInput) els().customPermInput.value = item.name;
  pickCustomPerm(item, () => void runLoad());
}

function containerCommitActive() {
  return (
    !!committedContainer &&
    getContainerName() === committedContainer.name
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
    const containerType = it.containerType === 'Profile'
      ? 'Profile'
      : it.containerType === 'PermissionSet'
        ? 'PermissionSet'
        : '';
    // El tipo no se infiere del texto: un Profile usa una relación SOQL distinta.
    btn.dataset.containerType = containerType;
    btn.dataset.containerName = String(it.name || '');
    if (it.id) btn.dataset.containerId = String(it.id);
    const kind = containerType === 'Profile'
      ? t('permDiff.typeProfile')
      : containerType === 'PermissionSet'
        ? t('permDiff.typePermissionSet')
        : '';
    const row = document.createElement('span');
    row.className = 'permission-diff-suggestion-row';
    const name = document.createElement('span');
    name.className = 'permission-diff-suggestion-text';
    name.textContent = it.name || '';
    row.appendChild(name);
    if (kind) {
      const badge = document.createElement('span');
      badge.className = 'permission-diff-suggestion-kind';
      badge.textContent = kind;
      row.appendChild(badge);
    }
    btn.appendChild(row);
    btn.addEventListener('mousedown', (ev) => ev.preventDefault());
    btn.addEventListener('click', () => {
      const selectedType = btn.dataset.containerType;
      if (selectedType === 'Profile' || selectedType === 'PermissionSet') {
        onPick({
          name: btn.dataset.containerName || '',
          containerType: selectedType,
          id: btn.dataset.containerId || ''
        });
        return;
      }
      // Objetos, campos y permisos personalizados no son contenedores.
      // Conservan su elemento original para que su selector pueda procesarlos.
      onPick(it);
    });
    listEl.appendChild(btn);
  }
  listEl.hidden = false;
}

function pickContainer(item) {
  queryDirection = 'container';
  const containerType = item.containerType;
  if (containerType !== 'Profile' && containerType !== 'PermissionSet') {
    committedContainer = null;
    setStatus(t('permDiff.pickFromList'), 'error');
    return;
  }
  if (els().nameInput) els().nameInput.value = item.name;
  committedContainer = { containerType, name: item.name, id: item.id || undefined };
  hideSuggestions();
  void runLoad();
}

function pickResource(item) {
  queryDirection = 'resource';
  const rt = getResourceType();
  resourceType = rt;
  const name = String(item?.name || '').trim();
  if (rt === 'field' && name && !name.includes('.')) {
    if (els().resourceInput) els().resourceInput.value = `${name}.`;
    hideSuggestions();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void runSearchSuggestions(), 0);
    return;
  }
  if (els().resourceInput) els().resourceInput.value = name;
  committedResource = { resourceType: rt, name };
  hideSuggestions();
  void runLoad();
}

function hasActiveResults() {
  if (isCustomPermMode()) {
    return customPermCommitActive(getCustomPermInput()) && hasCustomPermResults();
  }
  if (isResourceMode()) {
    return resourceCommitActive() && !!(lastAccessCompare || lastAccessSingle);
  }
  return containerCommitActive() && !!(lastCompare || lastSingle);
}

function syncDirectionUi() {
  const { containerBlock, resourceBlock, customPermBlock, diffOnly } = els();
  const resource = isResourceMode();
  const customPerm = isCustomPermMode();
  containerBlock?.classList.toggle('is-active', !resource && !customPerm);
  resourceBlock?.classList.toggle('is-active', resource);
  customPermBlock?.classList.toggle('is-active', customPerm);
  document.body.classList.toggle('permission-diff-query-resource', resource || customPerm);
  document.body.classList.toggle('permission-diff-query-custom-perm', customPerm);
  setResultsVisible(hasActiveResults());
  if (diffOnly?.parentElement) {
    diffOnly.parentElement.classList.toggle('hidden', !state.permissionDiffCompareMode);
  }
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
    const gen = ++suggestGeneration;
    renderSuggestionsLoading(els().customPermSuggestions);
    try {
      const items = await searchCustomPermissions(state.leftOrgId, q);
      if (gen !== suggestGeneration) return;
      renderSuggestionsList(els().customPermSuggestions, items, pickCustomPermItem);
    } catch {
      if (gen !== suggestGeneration) return;
      hideSuggestions();
    }
    return;
  }

  const q = isResourceMode() ? getResourceInput() : getContainerName();
  const rt = isResourceMode() ? getResourceType() : null;
  const minLen =
    isResourceMode() && rt === 'field' ? minFieldResourceSuggestLength(q) : MIN_SUGGEST_LEN;
  if (q.length < minLen) {
    hideSuggestions();
    return;
  }

  const listEl = getActiveSuggestionsEl();
  const gen = ++suggestGeneration;
  renderSuggestionsLoading(listEl);

  try {
    if (isResourceMode()) {
      const res = await bg({
        type: 'permissionsDiff:searchResource',
        orgId: state.leftOrgId,
        resourceType: rt,
        queryText: q,
        objectApiName:
          rt === 'field' && q.includes('.')
            ? resolveFieldResourceSuggestPhase(q).objectTerm
            : ''
      });
      if (gen !== suggestGeneration) return;
      renderSuggestionsList(els().resourceSuggestions, res?.ok ? res.items : [], pickResource);
    } else {
      const [permissionSets, profiles] = await Promise.all([
        bg({
          type: 'permissionsDiff:search',
          orgId: state.leftOrgId,
          containerType: 'PermissionSet',
          queryText: q
        }),
        bg({
          type: 'permissionsDiff:search',
          orgId: state.leftOrgId,
          containerType: 'Profile',
          queryText: q
        })
      ]);
      if (gen !== suggestGeneration) return;
      const items = [
        ...(permissionSets?.ok ? permissionSets.items || [] : []).map((item) => ({
          ...item,
          containerType: 'PermissionSet'
        })),
        ...(profiles?.ok ? profiles.items || [] : []).map((item) => ({
          ...item,
          containerType: 'Profile'
        }))
      ];
      renderSuggestionsList(els().suggestions, items, pickContainer);
    }
  } catch {
    if (gen !== suggestGeneration) return;
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
  const compare = !!state.permissionDiffCompareMode;
  if (isResourceMode()) {
    const thead = document.getElementById('permissionDiffThead');
    const table = document.getElementById('permissionDiffTable');
    if (!thead) return;
    table?.classList.remove('is-cp-apex-only');
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

  const thead = document.getElementById('permissionDiffThead');
  const table = document.getElementById('permissionDiffTable');
  if (!thead) return;
  table?.classList.remove('is-resource', 'is-cp-apex-only');
  if (compare) {
    thead.innerHTML = `
      <tr>
        <th scope="col">${t('permDiff.colCategory')}</th>
        <th scope="col">${t('permDiff.colKey')}</th>
        <th scope="col">${t('permDiff.colStatus')}</th>
        <th scope="col">${t('permDiff.colLeft')}</th>
        <th scope="col">${t('permDiff.colRight')}</th>
      </tr>`;
  } else {
    thead.innerHTML = `
      <tr>
        <th scope="col">${t('permDiff.colCategory')}</th>
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
  if (isCustomPermMode()) {
    if (!summary) return;
    renderCustomPermSummary(summary, getCustomPermInput());
    return;
  }
  if (isResourceMode()) {
    if (!summary) return;
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
    return;
  }

  if (!summary) return;
  if (state.permissionDiffCompareMode && lastCompare) {
    const total = ['object', 'field', 'setup'].reduce((sum, section) => {
      const current = lastCompare?.[sectionToBundleKey(section)]?.summary;
      return {
        same: sum.same + (current?.same ?? 0),
        diff: sum.diff + (current?.diff ?? 0),
        leftOnly: sum.leftOnly + (current?.leftOnly ?? 0),
        rightOnly: sum.rightOnly + (current?.rightOnly ?? 0),
        total: sum.total + (current?.total ?? 0)
      };
    }, { same: 0, diff: 0, leftOnly: 0, rightOnly: 0, total: 0 });
    summary.textContent = t('permDiff.summaryCompare', total);
    return;
  }
  const count = ['object', 'field', 'setup'].reduce(
    (total, section) => total + (lastSingle?.[sectionToBundleKey(section)]?.length ?? 0),
    0
  );
  summary.textContent = lastSingle ? t('permDiff.summarySingle', { count }) : '';
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

function sectionLabel(section) {
  const keys = {
    object: 'permDiff.tabObject',
    field: 'permDiff.tabField',
    setup: 'permDiff.tabSetup'
  };
  return t(keys[section] || 'permDiff.colCategory');
}

function renderContainerTable() {
  const { tbody, empty, filter: filterEl } = els();
  if (!tbody || !empty) return;
  const filter = String(filterEl?.value || '').trim();
  tbody.innerHTML = '';
  const compare = !!state.permissionDiffCompareMode && !!lastCompare;
  let count = 0;

  if (compare && lastCompare) {
    for (const section of ['object', 'field', 'setup']) {
      const bundle = lastCompare[sectionToBundleKey(section)];
      for (const row of bundle?.rows || []) {
        if (showDiffOnly && row.status === 'same') continue;
        if (section === 'setup' ? !setupMatchesFilter(row, filter) : !matchesFilter(row.key, filter)) continue;
        const tr = document.createElement('tr');
        tr.className = statusRowClass(row.status);
        const keyCell = section === 'setup' ? escapeHtml(setupRowDisplay(row)) : escapeHtml(row.key);
        tr.innerHTML = `
          <td class="perm-diff-col-category">${escapeHtml(sectionLabel(section))}</td>
          <td class="perm-diff-col-key">${keyCell}</td>
          <td>${statusLabel(row.status)}</td>
          <td class="perm-diff-flags-cell">${formatRowValue(row.left, section)}</td>
          <td class="perm-diff-flags-cell">${formatRowValue(row.right, section)}</td>
        `;
        tbody.appendChild(tr);
        count += 1;
      }
    }
  } else {
    for (const section of ['object', 'field', 'setup']) {
      const key = sectionToBundleKey(section);
      for (const row of lastSingle?.[key] || []) {
        if (section === 'setup' ? !setupMatchesFilter(row, filter) : !matchesFilter(row.key, filter)) continue;
        const tr = document.createElement('tr');
        const keyCell = section === 'setup' ? escapeHtml(setupEntityDisplay(row)) : escapeHtml(row.key);
        tr.innerHTML = `
          <td class="perm-diff-col-category">${escapeHtml(sectionLabel(section))}</td>
          <td class="perm-diff-col-key">${keyCell}</td>
          <td class="perm-diff-flags-cell">${formatRowValue(row, section)}</td>
        `;
        tbody.appendChild(tr);
        count += 1;
      }
    }
  }
  empty.hidden = count > 0;
  if (!count) empty.textContent = t('permDiff.empty');
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
      void handleToolError(e, { artifact_type: 'PermissionDiff', phase: 'query' });
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
      void handleToolError(e, { artifact_type: 'PermissionDiff', phase: 'resource_query' });
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
    const rowCount = state.permissionDiffCompareMode
      ? ['object', 'field', 'setup'].reduce(
          (total, section) => total + (lastCompare?.[sectionToBundleKey(section)]?.summary?.total ?? 0),
          0
        )
      : ['object', 'field', 'setup'].reduce(
          (total, section) => total + (lastSingle?.[sectionToBundleKey(section)]?.length ?? 0),
          0
        );
    void logPermissionDiffQuery({
      queryDirection: 'container',
      containerType,
      name: containerName,
      section: 'all',
      rowCount
    });
    setResultsVisible(true);
    repaint();
  } catch (e) {
    committedContainer = null;
    void handleToolError(e, { artifact_type: 'PermissionDiff', phase: 'container_query' });
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
    nameInput,
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

  nameInput?.addEventListener('input', () => {
    queryDirection = 'container';
    syncDirectionUi();
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
  });

  resourceInput?.addEventListener('input', () => {
    queryDirection = 'resource';
    syncDirectionUi();
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
    queryDirection = 'customPermission';
    syncDirectionUi();
    invalidateCustomPermCommit();
    clearResults();
    setResultsVisible(false);
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

  filter?.addEventListener('input', () => repaint());

  diffOnly?.addEventListener('change', () => {
    showDiffOnly = !!diffOnly.checked;
    repaint();
  });

  syncDirectionUi();
}
