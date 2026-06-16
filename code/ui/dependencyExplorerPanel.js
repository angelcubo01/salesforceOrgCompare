import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { applyArtifactTypeUi, getSelectedArtifactType } from './artifactTypeUi.js';
import {
  DEP_EXPLORER_SEED_TYPES,
  buildSalesforceMetadataUrl,
  canOpenMetadataSource,
  categoriesToCsv,
  categoriesToSummaryText,
  compareCategories
} from '../../shared/dependencyExplorer.js';
import { randomStagingId } from '../../shared/randomId.js';
import { handleToolError, handleToolResponseFailure } from '../../shared/reportToolError.js';
import { apexViewerIdbPut } from '../lib/apexViewerIdb.js';

/** @type {{ id: string, name: string, displayName: string, type: string, seedTypeId: string } | null} */
let selectedComponent = null;
/** @type {object | null} */
let lastAnalysis = null;
let searchTimer = null;
let analyzeGeneration = 0;

/**
 * @param {{
 *   action?: string,
 *   phase?: string,
 *   rightOrgId?: string | null,
 *   rowCount?: number,
 *   typesCount?: number,
 *   success?: boolean,
 *   errorMessage?: string,
 *   descriptor?: Record<string, unknown>
 * }} meta
 */
async function logDependencyExplorerUsage(meta) {
  try {
    await bg({
      type: 'usage:log',
      entry: {
        kind: 'codeComparison',
        action: meta.action || 'dependencyExplorerAnalyze',
        artifactType: 'DependencyExplorer',
        phase: meta.phase || 'analyze',
        descriptor: meta.descriptor || {},
        leftOrgId: state.leftOrgId || '',
        rightOrgId: meta.rightOrgId != null ? String(meta.rightOrgId) : '',
        comparisonUrl: typeof window !== 'undefined' ? window.location.href : '',
        leftFilesCount: 0,
        rightFilesCount: 0,
        ...(meta.rowCount != null ? { rowCount: meta.rowCount } : {}),
        ...(meta.typesCount != null ? { typesCount: meta.typesCount } : {}),
        success: meta.success !== false,
        ...(meta.errorMessage ? { errorMessage: String(meta.errorMessage).slice(0, 500) } : {})
      }
    });
  } catch {
    /* ignorar errores de logging */
  }
}

/**
 * @param {{
 *   componentType?: string,
 *   seedTypeId?: string,
 *   section?: string,
 *   transitive?: boolean,
 *   includeReferencedBy?: boolean
 * }} opts
 */
function buildAnalyzeTelemetryDescriptor(opts) {
  return {
    name: opts.componentType || '',
    resourceType: opts.seedTypeId || '',
    section: opts.section || 'single',
    queryDirection: opts.transitive ? 'transitive' : 'direct',
    source: opts.includeReferencedBy ? 'reverse_root' : 'standard'
  };
}

function readAnalyzeOptionFlags() {
  return {
    transitive: !!document.getElementById('depExplorerTransitive')?.checked,
    includeReferencedBy: !!document.getElementById('depExplorerReferencedBy')?.checked
  };
}

function getOrgInstanceUrl(orgId) {
  const org = (state.orgsList || []).find((o) => String(o.id) === String(orgId));
  return org?.instanceUrl || '';
}

function buildDepExplorerUrlCtx(analysis) {
  return {
    fieldObjectById: analysis?.fieldObjectById || {},
    objectNameById: analysis?.objectNameById || {}
  };
}

function typeIconChar(type) {
  if (type === 'CustomField') return 'Aa';
  if (type === 'ApexClass' || type === 'ApexTrigger') return '{}';
  return '◇';
}

async function openApexLogViewerWithPayload(title, content, viewerOpts = {}) {
  const initialLine =
    viewerOpts.initialLine != null && Number.isFinite(Number(viewerOpts.initialLine))
      ? Math.max(1, Math.floor(Number(viewerOpts.initialLine)))
      : undefined;
  const downloadFileName =
    viewerOpts.downloadFileName != null && String(viewerOpts.downloadFileName).trim()
      ? String(viewerOpts.downloadFileName).trim()
      : undefined;
  const lineQs = initialLine != null ? `&line=${encodeURIComponent(String(initialLine))}` : '';
  const staged = await bg({
    type: 'apexViewer:stage',
    title,
    content,
    ...(initialLine != null ? { initialLine } : {}),
    ...(downloadFileName ? { downloadFileName } : {})
  });
  if (staged?.ok && staged.id) {
    window.open(
      chrome.runtime.getURL(`code/apex-log-viewer.html?staged=${encodeURIComponent(staged.id)}${lineQs}`),
      '_blank'
    );
    return true;
  }
  const storageKey = randomStagingId('sfoc_de_');
  try {
    await chrome.storage.local.set({
      [storageKey]: {
        title,
        content,
        ...(initialLine != null ? { initialLine } : {}),
        ...(downloadFileName ? { downloadFileName } : {})
      }
    });
    window.open(
      chrome.runtime.getURL(`code/apex-log-viewer.html?k=${encodeURIComponent(storageKey)}${lineQs}`),
      '_blank'
    );
    return true;
  } catch {
    /* storage fallback */
  }
  try {
    const idbId = randomStagingId('idb_');
    await apexViewerIdbPut(idbId, { title, content });
    window.open(
      chrome.runtime.getURL(`code/apex-log-viewer.html?idb=${encodeURIComponent(idbId)}${lineQs}`),
      '_blank'
    );
    return true;
  } catch {
    return false;
  }
}

async function openMetadataSourceInViewer(orgId, ref) {
  if (!canOpenMetadataSource(ref)) return;
  showToastWithSpinner(t('depExplorer.openingSource'));
  try {
    let title = '';
    let body = '';
    let fileName = '';
    if (ref.type === 'ApexClass') {
      const res = await bg({
        type: 'apexTests:getTestClassSource',
        orgId,
        classId: ref.id || undefined,
        className: ref.name || undefined
      });
      if (!res?.ok) {
        void handleToolResponseFailure(res, { artifact_type: 'DependencyExplorer', phase: 'open_apex_class' });
        showToast(
          res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('depExplorer.openSourceError'),
          'error'
        );
        return;
      }
      title = `${res.name || ref.name}.cls`;
      body = res.body != null ? String(res.body) : '';
      fileName = `${ref.name || res.name || 'ApexClass'}.cls`;
    } else if (ref.type === 'ApexTrigger') {
      const res = await bg({
        type: 'fetchSource',
        orgId,
        artifactType: 'ApexTrigger',
        descriptor: { name: ref.name, bundleId: ref.id }
      });
      if (!res?.ok) {
        void handleToolResponseFailure(res, { artifact_type: 'DependencyExplorer', phase: 'open_apex_trigger' });
        showToast(
          res?.reason === 'NO_SID' ? t('toast.noSession') : t('depExplorer.openSourceError'),
          'error'
        );
        return;
      }
      const main = (res.files || [])[0];
      body = main?.content != null ? String(main.content) : '';
      title = `${ref.name}.trigger`;
      fileName = `${ref.name || 'ApexTrigger'}.trigger`;
    }
    if (!body.trim()) {
      showToast(t('depExplorer.openSourceError'), 'error');
      return;
    }
    const ok = await openApexLogViewerWithPayload(title, body, { downloadFileName: fileName });
    if (!ok) showToast(t('depExplorer.openSourceError'), 'warn');
  } finally {
    dismissSpinnerToast();
  }
}

async function openInSalesforce(orgId, item, urlCtx) {
  const url = buildSalesforceMetadataUrl(getOrgInstanceUrl(orgId), item, urlCtx);
  if (!url) {
    showToast(t('depExplorer.openSfError'), 'warn');
    return;
  }
  await chrome.tabs.create({ url });
}

function appendReferencedByBlock(parent, item, orgId, urlCtx) {
  const refs = item.referencedBy || [];
  if (!refs.length) return;

  const row = document.createElement('div');
  row.className = 'dep-explorer-item-refs';
  const label = document.createElement('span');
  label.className = 'dep-explorer-item-refs-label';
  label.textContent = t('depExplorer.referencedByLabel');
  row.appendChild(label);

  const list = document.createElement('span');
  list.className = 'dep-explorer-item-refs-list';
  refs.forEach((ref, idx) => {
    if (idx > 0) list.appendChild(document.createTextNode(', '));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dep-explorer-ref-link';
    btn.textContent = `${ref.type} "${ref.name}"`;
    btn.title = ref.id || ref.name;
    btn.addEventListener('click', () => {
      if (canOpenMetadataSource(ref)) void openMetadataSourceInViewer(orgId, ref);
      else void openInSalesforce(orgId, ref, urlCtx);
    });
    list.appendChild(btn);
  });
  row.appendChild(list);

  const extra = (item.referencedByTotal || 0) - refs.length;
  if (extra > 0) {
    const more = document.createElement('span');
    more.className = 'dep-explorer-item-refs-more';
    more.textContent = t('depExplorer.referencedByMore', { count: extra });
    row.appendChild(more);
  }

  parent.appendChild(row);
}

function resolveItemMetadataType(item, categoryType) {
  return String(item?.type || categoryType || 'Unknown').trim() || 'Unknown';
}

function renderDepExplorerItemCard(item, orgId, urlCtx, categoryType) {
  const metadataType = resolveItemMetadataType(item, categoryType);
  const itemForActions = { ...item, type: metadataType };

  const card = document.createElement('article');
  card.className = 'dep-explorer-item-card';

  const head = document.createElement('div');
  head.className = 'dep-explorer-item-card-head';
  const icon = document.createElement('span');
  icon.className = 'dep-explorer-item-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = typeIconChar(metadataType);
  const name = document.createElement('span');
  name.className = 'dep-explorer-item-name';
  name.textContent = item.displayName || item.name;
  head.appendChild(icon);
  head.appendChild(name);
  card.appendChild(head);

  const typeLine = document.createElement('div');
  typeLine.className = 'dep-explorer-item-type';
  typeLine.textContent = t('depExplorer.typeLabel', { metadataType });
  card.appendChild(typeLine);

  appendReferencedByBlock(card, itemForActions, orgId, urlCtx);

  const actions = document.createElement('div');
  actions.className = 'dep-explorer-item-actions';

  if (canOpenMetadataSource(itemForActions)) {
    const srcBtn = document.createElement('button');
    srcBtn.type = 'button';
    srcBtn.className = 'dep-explorer-sf-link';
    const srcIcon = document.createElement('span');
    srcIcon.className = 'dep-explorer-sf-link-icon';
    srcIcon.setAttribute('aria-hidden', 'true');
    srcIcon.textContent = '{}';
    srcBtn.appendChild(srcIcon);
    srcBtn.appendChild(document.createTextNode(t('depExplorer.openSource')));
    srcBtn.addEventListener('click', () => void openMetadataSourceInViewer(orgId, itemForActions));
    actions.appendChild(srcBtn);
  } else {
    const sfLink = document.createElement('button');
    sfLink.type = 'button';
    sfLink.className = 'dep-explorer-sf-link';
    const sfIcon = document.createElement('span');
    sfIcon.className = 'dep-explorer-sf-link-icon';
    sfIcon.setAttribute('aria-hidden', 'true');
    sfIcon.textContent = '🔗';
    sfLink.appendChild(sfIcon);
    sfLink.appendChild(document.createTextNode(t('depExplorer.openInSalesforce')));
    sfLink.addEventListener('click', () => void openInSalesforce(orgId, itemForActions, urlCtx));
    actions.appendChild(sfLink);
  }

  card.appendChild(actions);
  return card;
}

function populateTypeSelect() {
  const select = document.getElementById('depExplorerTypeSelect');
  if (!select) return;
  select.innerHTML = '';
  for (const typeDef of DEP_EXPLORER_SEED_TYPES) {
    const opt = document.createElement('option');
    opt.value = typeDef.id;
    opt.textContent = t(typeDef.labelKey);
    select.appendChild(opt);
  }
}

function setControlsEnabled(enabled) {
  const search = document.getElementById('depExplorerSearchInput');
  const typeSelect = document.getElementById('depExplorerTypeSelect');
  const analyzeBtn = document.getElementById('depExplorerAnalyzeBtn');
  if (search) search.disabled = !enabled;
  if (typeSelect) typeSelect.disabled = !enabled;
  if (analyzeBtn) analyzeBtn.disabled = !enabled || !selectedComponent;
}

function ensureSearchResultsPortal(panel) {
  if (panel && panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
}

function positionSearchResults() {
  const input = document.getElementById('depExplorerSearchInput');
  const panel = document.getElementById('depExplorerSearchResults');
  if (!input || !panel || panel.classList.contains('hidden')) return;

  const rect = input.getBoundingClientRect();
  const gap = 4;
  const viewportPad = 8;
  const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPad;
  const maxH = Math.min(280, Math.max(120, spaceBelow));

  panel.style.top = `${rect.bottom + gap}px`;
  panel.style.left = `${rect.left}px`;
  panel.style.width = `${rect.width}px`;
  panel.style.maxHeight = `${maxH}px`;
}

function hideSearchResults() {
  const panel = document.getElementById('depExplorerSearchResults');
  if (panel) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
  }
}

function showSearchLoading() {
  const panel = document.getElementById('depExplorerSearchResults');
  if (!panel) return;
  panel.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'item dep-explorer-search-loading';
  row.setAttribute('role', 'status');
  row.textContent = t('depExplorer.searchingList');
  panel.appendChild(row);
  ensureSearchResultsPortal(panel);
  panel.classList.remove('hidden');
  positionSearchResults();
}

function renderSearchResults(items) {
  const panel = document.getElementById('depExplorerSearchResults');
  if (!panel) return;
  panel.innerHTML = '';
  if (!items?.length) {
    panel.classList.add('hidden');
    return;
  }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'item';
    row.setAttribute('role', 'option');
    row.textContent = item.displayName || item.name;
    row.title = item.id || '';
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectComponent(item);
    });
    panel.appendChild(row);
  }
  ensureSearchResultsPortal(panel);
  panel.classList.remove('hidden');
  positionSearchResults();
}

/**
 * @param {object} item
 */
function selectComponent(item) {
  const seedTypeId = document.getElementById('depExplorerTypeSelect')?.value || '';
  selectedComponent = {
    id: item.id,
    name: item.name,
    displayName: item.displayName || item.name,
    type: item.type,
    seedTypeId
  };
  const input = document.getElementById('depExplorerSearchInput');
  if (input) input.value = selectedComponent.displayName;
  hideSearchResults();
  const analyzeBtn = document.getElementById('depExplorerAnalyzeBtn');
  if (analyzeBtn) analyzeBtn.disabled = false;
}

async function runSearch(query) {
  if (getSelectedArtifactType() !== 'DependencyExplorer') return;
  if (!state.leftOrgId) return;
  const seedType = document.getElementById('depExplorerTypeSelect')?.value;
  if (!seedType || String(query || '').trim().length < 2) {
    hideSearchResults();
    return;
  }
  showSearchLoading();
  const res = await bg({
    type: 'dependencyExplorer:search',
    orgId: state.leftOrgId,
    seedType,
    query: String(query).trim()
  });
  if (!res?.ok) {
    if (res?.reason === 'NO_SID') showToast(t('toast.noSessionRetry'), 'warn');
    else showToast(res?.error || t('depExplorer.searchError'), 'error');
    hideSearchResults();
    return;
  }
  renderSearchResults(res.items || []);
}

async function analyzeOrg(orgId) {
  if (!selectedComponent?.id) return null;
  const transitive = !!document.getElementById('depExplorerTransitive')?.checked;
  const includeReferencedBy = !!document.getElementById('depExplorerReferencedBy')?.checked;
  const res = await bg({
    type: 'dependencyExplorer:analyze',
    orgId,
    seedId: selectedComponent.id,
    transitive,
    includeReferencedBy
  });
  if (!res?.ok) {
    throw new Error(res?.error || t('depExplorer.analyzeError'));
  }
  return res;
}

function renderCategoriesSingle(categories, truncated, orgId, urlCtx) {
  const wrap = document.getElementById('depExplorerCategories');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!categories?.length) {
    const empty = document.createElement('p');
    empty.className = 'dep-explorer-status';
    empty.textContent = t('depExplorer.noDependencies');
    wrap.appendChild(empty);
    return;
  }
  for (const cat of categories) {
    const details = document.createElement('details');
    details.className = 'dep-explorer-category';
    const summary = document.createElement('summary');
    const count = document.createElement('span');
    count.className = 'dep-explorer-category-count';
    count.textContent = String(cat.count);
    summary.appendChild(document.createTextNode(cat.label));
    summary.appendChild(count);
    details.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'dep-explorer-category-body';
    const list = document.createElement('div');
    list.className = 'dep-explorer-item-cards';
    for (const it of cat.items) {
      list.appendChild(renderDepExplorerItemCard(it, orgId, urlCtx, cat.type));
    }
    body.appendChild(list);
    details.appendChild(body);
    wrap.appendChild(details);
  }
  if (truncated) {
    const warn = document.createElement('p');
    warn.className = 'dep-explorer-status';
    warn.textContent = t('depExplorer.truncated');
    wrap.appendChild(warn);
  }
}

function renderCategoriesCompare(compared) {
  const wrap = document.getElementById('depExplorerCategories');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const cat of compared) {
    const details = document.createElement('details');
    details.className = 'dep-explorer-category';
    const summary = document.createElement('summary');
    const count = document.createElement('span');
    count.className = 'dep-explorer-category-count' + (cat.hasDiff ? ' diff' : '');
    count.textContent = `${cat.leftCount} / ${cat.rightCount}`;
    summary.appendChild(document.createTextNode(cat.label));
    summary.appendChild(count);
    details.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'dep-explorer-category-body';
    const table = document.createElement('table');
    table.className = 'dep-explorer-compare-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr><th>${t('depExplorer.colName')}</th><th>${t('depExplorer.colStatus')}</th></tr>`;
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const row of cat.rows) {
      const tr = document.createElement('tr');
      const statusLabel =
        row.status === 'both'
          ? '='
          : row.status === 'leftOnly'
            ? t('depExplorer.onlyLeft')
            : t('depExplorer.onlyRight');
      const statusClass =
        row.status === 'leftOnly' ? 'left-only' : row.status === 'rightOnly' ? 'right-only' : '';
      tr.innerHTML = `<td>${row.name}</td><td><span class="dep-explorer-item-status ${statusClass}">${statusLabel}</span></td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);
    details.appendChild(body);
    wrap.appendChild(details);
  }
}

function updateResultsHead(totalCount, hasDiff = false) {
  const head = document.getElementById('depExplorerResultsHead');
  const title = document.getElementById('depExplorerResultsTitle');
  const badge = document.getElementById('depExplorerResultsBadge');
  if (!selectedComponent) return;
  head?.classList.remove('hidden');
  if (title) {
    title.textContent = t('depExplorer.resultsTitle', {
      name: selectedComponent.displayName,
      type: selectedComponent.type
    });
  }
  if (badge) {
    badge.textContent = t('depExplorer.dependsOnBadge', { count: totalCount });
    badge.classList.toggle('has-diff', hasDiff);
  }
}

async function runAnalyze() {
  if (!state.leftOrgId) {
    showToast(t('depExplorer.selectOrg'), 'warn');
    return;
  }
  if (!selectedComponent?.id) return;
  if (state.dependencyExplorerCompareMode && !state.rightOrgId) {
    showToast(t('depExplorer.selectRightOrg'), 'warn');
    return;
  }

  const gen = ++analyzeGeneration;
  const status = document.getElementById('depExplorerStatus');
  const moreBtn = document.getElementById('depExplorerMoreBtn');
  const optionFlags = readAnalyzeOptionFlags();
  const telemetryBase = buildAnalyzeTelemetryDescriptor({
    componentType: selectedComponent?.type,
    seedTypeId: selectedComponent?.seedTypeId,
    ...optionFlags
  });

  showToastWithSpinner(t('depExplorer.analyzing'));
  if (status) status.textContent = t('depExplorer.analyzing');

  try {
    const left = await analyzeOrg(state.leftOrgId);
    if (gen !== analyzeGeneration) return;

    let right = null;
    if (state.dependencyExplorerCompareMode && state.rightOrgId) {
      try {
        right = await analyzeOrg(state.rightOrgId);
      } catch (e) {
        void handleToolError(e, { artifact_type: 'DependencyExplorer', phase: 'analyze_right' });
        showToast(String(e?.message || e), 'warn');
      }
    }
    if (gen !== analyzeGeneration) return;

    lastAnalysis = {
      left,
      right,
      selectedComponent: { ...selectedComponent },
      orgId: state.leftOrgId
    };
    if (moreBtn) moreBtn.disabled = false;

    if (right?.categories) {
      const compared = compareCategories(left.categories, right.categories);
      const hasDiff = compared.some((c) => c.hasDiff);
      updateResultsHead(left.totalCount || 0, hasDiff);
      renderCategoriesCompare(compared);
      lastAnalysis.compared = compared;
      if (status) {
        status.textContent = hasDiff ? t('depExplorer.compareDiff') : t('depExplorer.compareMatch');
      }
      void logDependencyExplorerUsage({
        phase: 'compare',
        rightOrgId: state.rightOrgId,
        rowCount: left.totalCount || 0,
        typesCount: (left.categories || []).length,
        descriptor: {
          ...telemetryBase,
          section: hasDiff ? 'compare_diff' : 'compare_match'
        }
      });
    } else {
      updateResultsHead(left.totalCount || 0);
      renderCategoriesSingle(
        left.categories,
        left.truncated,
        state.leftOrgId,
        buildDepExplorerUrlCtx(left)
      );
      if (status) {
        status.textContent = left.truncated ? t('depExplorer.truncated') : '';
      }
      void logDependencyExplorerUsage({
        phase: 'analyze',
        rowCount: left.totalCount || 0,
        typesCount: (left.categories || []).length,
        descriptor: {
          ...telemetryBase,
          section: left.truncated ? 'single_truncated' : 'single'
        }
      });
    }
  } catch (e) {
    void handleToolError(e, { artifact_type: 'DependencyExplorer', phase: 'analyze' });
    if (gen === analyzeGeneration) {
      if (status) status.textContent = '';
      showToast(String(e?.message || e), 'error');
      void logDependencyExplorerUsage({
        success: false,
        errorMessage: String(e?.message || e),
        descriptor: telemetryBase
      });
    }
  } finally {
    dismissSpinnerToast();
  }
}

function downloadText(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function handleMoreAction(action) {
  if (!lastAnalysis?.left) return;
  const menu = document.getElementById('depExplorerMoreMenu');
  menu?.classList.add('hidden');

  if (action === 'copy') {
    const text =
      lastAnalysis.compared
        ? lastAnalysis.compared
            .map(
              (c) =>
                `${c.label} (${c.leftCount}/${c.rightCount})\n` +
                c.rows.map((r) => `  ${r.name} [${r.status}]`).join('\n')
            )
            .join('\n\n')
        : categoriesToSummaryText(lastAnalysis.left.categories);
    void navigator.clipboard.writeText(text).then(() => showToast(t('depExplorer.copied'), 'info'));
    void logDependencyExplorerUsage({
      action: 'dependencyExplorerExport',
      phase: 'copy',
      rowCount: lastAnalysis.left?.totalCount,
      typesCount: (lastAnalysis.left?.categories || []).length,
      descriptor: { section: lastAnalysis.compared ? 'compare' : 'single', source: 'copy' }
    });
    return;
  }

  if (action === 'csv') {
    const csv = categoriesToCsv(lastAnalysis.left.categories);
    downloadText('dependencies.csv', csv, 'text/csv');
    void logDependencyExplorerUsage({
      action: 'dependencyExplorerExport',
      phase: 'csv',
      rowCount: lastAnalysis.left?.totalCount,
      typesCount: (lastAnalysis.left?.categories || []).length,
      descriptor: { section: lastAnalysis.compared ? 'compare' : 'single', source: 'csv' }
    });
  }
}

export function resetDependencyExplorerPanel() {
  selectedComponent = null;
  lastAnalysis = null;
  analyzeGeneration += 1;
  const input = document.getElementById('depExplorerSearchInput');
  if (input) input.value = '';
  hideSearchResults();
  document.getElementById('depExplorerCategories')?.replaceChildren();
  document.getElementById('depExplorerResultsHead')?.classList.add('hidden');
  const status = document.getElementById('depExplorerStatus');
  if (status) status.textContent = '';
  const moreBtn = document.getElementById('depExplorerMoreBtn');
  if (moreBtn) moreBtn.disabled = true;
}

export function refreshDependencyExplorerPanel() {
  if (getSelectedArtifactType() !== 'DependencyExplorer') return;
  populateTypeSelect();
  const toggle = document.getElementById('depExplorerCompareToggle');
  if (toggle) toggle.checked = !!state.dependencyExplorerCompareMode;
  if (!state.leftOrgId) {
    setControlsEnabled(false);
    const status = document.getElementById('depExplorerStatus');
    if (status) status.textContent = t('depExplorer.selectOrg');
    resetDependencyExplorerPanel();
    return;
  }
  setControlsEnabled(true);
  const status = document.getElementById('depExplorerStatus');
  if (status && !lastAnalysis) status.textContent = '';
}

export function setupDependencyExplorerPanel() {
  populateTypeSelect();

  const typeSelect = document.getElementById('depExplorerTypeSelect');
  const searchInput = document.getElementById('depExplorerSearchInput');
  const analyzeBtn = document.getElementById('depExplorerAnalyzeBtn');
  const compareToggle = document.getElementById('depExplorerCompareToggle');
  const moreBtn = document.getElementById('depExplorerMoreBtn');
  const moreMenu = document.getElementById('depExplorerMoreMenu');

  typeSelect?.addEventListener('change', () => {
    selectedComponent = null;
    if (searchInput) searchInput.value = '';
    hideSearchResults();
    if (analyzeBtn) analyzeBtn.disabled = true;
  });

  searchInput?.addEventListener('input', () => {
    selectedComponent = null;
    if (analyzeBtn) analyzeBtn.disabled = true;
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length < 2) {
      hideSearchResults();
      return;
    }
    searchTimer = setTimeout(() => void runSearch(q), 280);
  });

  searchInput?.addEventListener('blur', () => {
    setTimeout(hideSearchResults, 150);
  });

  window.addEventListener('resize', () => positionSearchResults());
  document.querySelector('.dep-explorer-panel-inner')?.addEventListener(
    'scroll',
    () => positionSearchResults(),
    { passive: true }
  );

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && selectedComponent) {
      e.preventDefault();
      void runAnalyze();
    }
  });

  analyzeBtn?.addEventListener('click', () => void runAnalyze());

  compareToggle?.addEventListener('change', () => {
    state.dependencyExplorerCompareMode = !!compareToggle.checked;
    applyArtifactTypeUi();
    refreshDependencyExplorerPanel();
  });

  moreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    moreMenu?.classList.toggle('hidden');
  });

  moreMenu?.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleMoreAction(btn.getAttribute('data-action')));
  });

  document.addEventListener('click', () => moreMenu?.classList.add('hidden'));

  refreshDependencyExplorerPanel();
}
