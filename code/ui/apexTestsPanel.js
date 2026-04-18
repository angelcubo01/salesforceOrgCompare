import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { t } from '../../shared/i18n.js';
import { showToast } from './toast.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { extractApexTestRunJobId } from '../../shared/extractApexTestRunJobId.js';
import { logApexTestRunUsage } from './apexTestUsageLog.js';
import {
  rememberApexTestRunJob,
  updateApexTestsHubPollingState,
  stopApexTestsHubPolling,
  initApexTestsCoverageModal,
  initApexTestsViewTestModal,
  initApexTestsViewLogModal
} from './apexTestsHubRuns.js';

/** Prefijo para valor de checkbox de clase cuando no hay Id (debe coincidir con background). */
const CLASS_OPT_NAME_PREFIX = 'n:';

/** @type {{ id: string | null, name: string }[]} */
let apexClassesCache = [];

/**
 * Valores de checkbox de clase (`classOptionValue`) marcados por el usuario.
 * Persiste aunque el filtro de búsqueda oculte la fila (antes solo existían en el DOM).
 */
const selectedClassOptionValues = new Set();

/** Métodos marcados por nombre de clase (persiste al añadir clases / recargar tabla). */
const methodSelectionsByClass = new Map();

function classOptionValue(c) {
  if (c?.id) return c.id;
  return `${CLASS_OPT_NAME_PREFIX}${c?.name || ''}`;
}

let methodsLoadToken = 0;
let classesLoadToken = 0;
let debounceMethodsTimer = 0;
/** Org para la que tiene sentido `methodSelectionsByClass` (al cambiar de org se limpia el mapa). */
let apexTestsPanelOrgId = null;
/** Valor del checkbox (`id` o `n:nombre`) de la única clase cuyos métodos se muestran en la tabla derecha. */
let activeClassForMethods = null;

let apexTestsResizeObs = null;
let apexTestsFitDebounce = 0;
let apexTestsFitRaf = 0;

function isApexTestsRunnerVisible() {
  const runner = document.getElementById('apexTestsRunnerView');
  return !!(runner && !runner.classList.contains('hidden'));
}

function teardownApexTestsScaleObserver() {
  if (apexTestsResizeObs) {
    apexTestsResizeObs.disconnect();
    apexTestsResizeObs = null;
  }
}

function setupApexTestsScaleObserver() {
  if (apexTestsResizeObs || typeof ResizeObserver === 'undefined') return;
  const vp = document.getElementById('apexTestsScaleViewport');
  if (!vp) return;
  apexTestsResizeObs = new ResizeObserver(() => scheduleApexTestsFitScale());
  apexTestsResizeObs.observe(vp);
}

/**
 * Escala el bloque completo para que quepa en ancho y alto del viewport sin scroll.
 * `minWidth = vw` al medir mantiene las dos tablas usando todo el ancho antes de calcular la escala.
 */
function apexTestsFitScale() {
  const runner = document.getElementById('apexTestsRunnerView');
  const viewport = document.getElementById('apexTestsScaleViewport');
  const sizer = document.getElementById('apexTestsScaleSizer');
  const content = document.getElementById('apexTestsScaleContent');
  if (!runner || !viewport || !sizer || !content) return;
  if (runner.classList.contains('hidden')) return;
  if (viewport.clientWidth < 8 || viewport.clientHeight < 8) return;

  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;

  content.style.position = 'static';
  content.style.transform = 'none';
  content.style.transformOrigin = '';
  content.style.width = '';
  content.style.height = '';
  content.style.top = '';
  content.style.left = '';
  content.style.minWidth = `${vw}px`;
  sizer.style.width = '';
  sizer.style.height = '';
  void viewport.offsetHeight;

  const cw = Math.max(sizer.scrollWidth, sizer.offsetWidth);
  const ch = Math.max(sizer.scrollHeight, sizer.offsetHeight);
  content.style.minWidth = '';
  if (cw < 1 || ch < 1) return;

  const s = Math.min(1, vw / cw, vh / ch);

  content.style.position = 'absolute';
  content.style.top = '0';
  content.style.left = '0';
  content.style.width = `${cw}px`;
  content.style.height = `${ch}px`;
  content.style.transformOrigin = 'top left';
  content.style.transform = `scale(${s})`;
  sizer.style.width = `${cw * s}px`;
  sizer.style.height = `${ch * s}px`;
}

function scheduleApexTestsFitScale() {
  if (!isApexTestsRunnerVisible()) return;
  if (apexTestsFitDebounce) window.clearTimeout(apexTestsFitDebounce);
  apexTestsFitDebounce = window.setTimeout(() => {
    apexTestsFitDebounce = 0;
    if (apexTestsFitRaf) cancelAnimationFrame(apexTestsFitRaf);
    apexTestsFitRaf = requestAnimationFrame(() => {
      apexTestsFitRaf = 0;
      apexTestsFitScale();
    });
  }, 32);
}

export function resetApexTestsShellToHub() {
  const hub = document.getElementById('apexTestsHubView');
  const runner = document.getElementById('apexTestsRunnerView');
  hub?.classList.remove('hidden');
  runner?.classList.add('hidden');
  if (runner) {
    runner.setAttribute('aria-hidden', 'true');
  }
  teardownApexTestsScaleObserver();
  const content = document.getElementById('apexTestsScaleContent');
  const sizer = document.getElementById('apexTestsScaleSizer');
  if (content) {
    content.style.transform = '';
    content.style.transformOrigin = '';
    content.style.width = '';
    content.style.height = '';
    content.style.position = '';
    content.style.top = '';
    content.style.left = '';
    content.style.minWidth = '';
  }
  if (sizer) {
    sizer.style.width = '';
    sizer.style.height = '';
  }
  updateApexTestsHubPollingState();
}

function openApexTestsRunnerView() {
  const hub = document.getElementById('apexTestsHubView');
  const runner = document.getElementById('apexTestsRunnerView');
  hub?.classList.add('hidden');
  runner?.classList.remove('hidden');
  if (runner) {
    runner.setAttribute('aria-hidden', 'false');
  }
  setupApexTestsScaleObserver();
  scheduleApexTestsFitScale();
  updateApexTestsHubPollingState();
}

function syncApexTestsHubStatus() {
  const hubStatus = document.getElementById('apexTestsHubStatus');
  if (!hubStatus) return;
  if (!state.leftOrgId) {
    hubStatus.textContent = t('apexTests.hubStatusNoLeftOrg');
    return;
  }
  hubStatus.textContent = t('apexTests.orgReady');
}

function getEls() {
  return {
    status: document.getElementById('apexTestsOrgStatus'),
    filter: document.getElementById('apexTestsClassFilter'),
    classTbody: document.getElementById('apexTestsClassTbody'),
    methodTbody: document.getElementById('apexTestsMethodTbody'),
    tablesWrap: document.getElementById('apexTestsTablesWrap'),
    classLoading: document.getElementById('apexTestsClassLoading'),
    methodLoading: document.getElementById('apexTestsMethodLoading'),
    selectionTree: document.getElementById('apexTestsSelectionTree'),
    runBtn: document.getElementById('apexTestsRunBtn'),
    runStatus: document.getElementById('apexTestsRunStatus')
  };
}

function showClassLoading(show) {
  const el = getEls().classLoading;
  if (el) el.classList.toggle('hidden', !show);
}

function showMethodLoading(show) {
  const el = getEls().methodLoading;
  if (el) el.classList.toggle('hidden', !show);
}

/** Quita selección de métodos de clases que ya no están marcadas. */
function pruneMethodSelections() {
  const names = new Set(getSelectedClassNamesOrdered());
  for (const k of [...methodSelectionsByClass.keys()]) {
    if (!names.has(k)) methodSelectionsByClass.delete(k);
  }
}

function getSelectedClassNamesOrdered() {
  const names = [];
  for (const v of selectedClassOptionValues) {
    if (v.startsWith(CLASS_OPT_NAME_PREFIX)) {
      names.push(v.slice(CLASS_OPT_NAME_PREFIX.length));
    } else {
      const x = apexClassesCache.find((c) => c.id === v);
      if (x?.name) names.push(x.name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b));
}

function syncMethodCheckboxToMap(cb) {
  try {
    const [cn, mn] = JSON.parse(cb.value);
    if (!cn || !mn) return;
    if (cb.checked) {
      if (!methodSelectionsByClass.has(cn)) methodSelectionsByClass.set(cn, new Set());
      methodSelectionsByClass.get(cn).add(mn);
    } else {
      const set = methodSelectionsByClass.get(cn);
      if (set) {
        set.delete(mn);
        if (set.size === 0) methodSelectionsByClass.delete(cn);
      }
    }
  } catch {
    /* ignore */
  }
}

function refreshSelectionTree() {
  const { selectionTree } = getEls();
  if (!selectionTree) return;
  selectionTree.setAttribute('aria-label', t('apexTests.treeAria'));
  selectionTree.innerHTML = '';
  const classNames = getSelectedClassNamesOrdered();
  if (!classNames.length) {
    const empty = document.createElement('p');
    empty.className = 'apex-tests-tree-empty';
    empty.textContent = t('apexTests.treeEmpty');
    selectionTree.appendChild(empty);
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'apex-tests-tree-root';
  for (const cn of classNames) {
    const li = document.createElement('li');
    li.className = 'apex-tests-tree-item';
    li.setAttribute('role', 'treeitem');
    const head = document.createElement('div');
    head.className = 'apex-tests-tree-class';
    head.textContent = cn;
    li.appendChild(head);
    const set = methodSelectionsByClass.get(cn);
    const methods = set && set.size > 0 ? [...set].sort((a, b) => a.localeCompare(b)) : [];
    if (methods.length) {
      const sub = document.createElement('ul');
      sub.className = 'apex-tests-tree-methods';
      for (const m of methods) {
        const liM = document.createElement('li');
        liM.className = 'apex-tests-tree-method';
        liM.setAttribute('role', 'treeitem');
        liM.textContent = m;
        sub.appendChild(liM);
      }
      li.appendChild(sub);
    } else {
      const whole = document.createElement('div');
      whole.className = 'apex-tests-tree-whole';
      whole.textContent = t('apexTests.treeAllMethodsInClass');
      li.appendChild(whole);
    }
    ul.appendChild(li);
  }
  selectionTree.appendChild(ul);
}

function getCheckedClassValues() {
  return [...selectedClassOptionValues];
}

function updateClassRowActiveHighlight() {
  const { classTbody } = getEls();
  if (!classTbody) return;
  classTbody.querySelectorAll('tr').forEach((tr) => {
    const cb = tr.querySelector('input.apex-tests-class-cb');
    tr.classList.toggle(
      'apex-tests-class-row-active',
      !!(cb && cb.checked && cb.value === activeClassForMethods)
    );
  });
}

function setControlsEnabled(enabled) {
  const { filter, tablesWrap, runBtn } = getEls();
  if (filter) filter.disabled = !enabled;
  if (tablesWrap) {
    tablesWrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.disabled = !enabled;
    });
  }
  if (runBtn) runBtn.disabled = !enabled;
}

function clearMethodTable() {
  const { methodTbody } = getEls();
  if (methodTbody) methodTbody.innerHTML = '';
}

function resetApexTestsUi() {
  apexClassesCache = [];
  selectedClassOptionValues.clear();
  methodSelectionsByClass.clear();
  activeClassForMethods = null;
  const { filter, classTbody, runStatus } = getEls();
  if (filter) filter.value = '';
  if (classTbody) classTbody.innerHTML = '';
  clearMethodTable();
  if (runStatus) runStatus.textContent = '';
  showClassLoading(false);
  showMethodLoading(false);
  refreshSelectionTree();
  scheduleApexTestsFitScale();
}

function applyClassFilter() {
  const { classTbody, filter } = getEls();
  if (!classTbody) return;
  const q = (filter?.value || '').trim().toLowerCase();
  classTbody.innerHTML = '';
  for (const c of apexClassesCache) {
    if (q && !String(c.name).toLowerCase().includes(q)) continue;
    const val = classOptionValue(c);
    const tr = document.createElement('tr');
    const tdCb = document.createElement('td');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'apex-tests-class-cb';
    cb.value = val;
    cb.checked = selectedClassOptionValues.has(val);
    tdCb.appendChild(cb);
    const tdName = document.createElement('td');
    tdName.className = 'apex-tests-td-name';
    tdName.textContent = c.name;
    tr.appendChild(tdCb);
    tr.appendChild(tdName);
    classTbody.appendChild(tr);
  }
  if (activeClassForMethods && !selectedClassOptionValues.has(activeClassForMethods)) {
    activeClassForMethods = getCheckedClassValues()[0] ?? null;
  }
  updateClassRowActiveHighlight();
  refreshSelectionTree();
  scheduleApexTestsFitScale();
}

function scheduleReloadMethods() {
  if (debounceMethodsTimer) clearTimeout(debounceMethodsTimer);
  debounceMethodsTimer = window.setTimeout(() => {
    debounceMethodsTimer = 0;
    void reloadMethodsForSelection();
  }, 350);
}

async function reloadMethodsForSelection() {
  const { methodTbody, runStatus } = getEls();
  if (!methodTbody) return;
  const token = ++methodsLoadToken;
  const checked = getCheckedClassValues();
  if (!checked.length) {
    activeClassForMethods = null;
    showMethodLoading(false);
    clearMethodTable();
    if (runStatus) runStatus.textContent = '';
    updateClassRowActiveHighlight();
    refreshSelectionTree();
    scheduleApexTestsFitScale();
    return;
  }
  if (!activeClassForMethods || !checked.includes(activeClassForMethods)) {
    activeClassForMethods = checked[0];
  }
  const activeAtSend = activeClassForMethods;
  const singleIds = [activeAtSend];
  pruneMethodSelections();
  showMethodLoading(true);
  clearMethodTable();
  if (runStatus) runStatus.textContent = t('apexTests.loadingMethods');
  let res;
  try {
    res = await bg({ type: 'apexTests:listTestMethods', orgId: state.leftOrgId, classIds: singleIds });
  } finally {
    if (token === methodsLoadToken) showMethodLoading(false);
  }
  if (token !== methodsLoadToken) return;
  const checkedNow = getCheckedClassValues();
  if (activeClassForMethods !== activeAtSend || !checkedNow.includes(activeAtSend)) {
    scheduleReloadMethods();
    return;
  }
  if (!res.ok) {
    const msg =
      res.reason === 'NO_SID' ? t('toast.noSession') : res.error || t('apexTests.loadMethodsError');
    if (runStatus) runStatus.textContent = msg;
    showToast(msg, 'warn');
    refreshSelectionTree();
    scheduleApexTestsFitScale();
    return;
  }
  if (!res.byClass || res.byClass.length === 0) {
    scheduleReloadMethods();
    return;
  }
  const firstClassCb = getEls().classTbody?.querySelector('input.apex-tests-class-cb');
  const cbDisabled = !!(firstClassCb && firstClassCb.disabled);
  for (const entry of res.byClass) {
    const saved = methodSelectionsByClass.get(entry.name);
    for (const m of entry.methods || []) {
      const tr = document.createElement('tr');
      const tdCb = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'apex-tests-method-cb';
      cb.value = JSON.stringify([entry.name, m]);
      cb.checked = !!(saved && saved.has(m));
      cb.disabled = cbDisabled;
      tdCb.appendChild(cb);
      const tdName = document.createElement('td');
      tdName.className = 'apex-tests-td-name';
      tdName.textContent = m;
      tdName.title = `${entry.name}.${m}`;
      tr.appendChild(tdCb);
      tr.appendChild(tdName);
      methodTbody.appendChild(tr);
    }
  }
  if (runStatus) runStatus.textContent = '';
  updateClassRowActiveHighlight();
  refreshSelectionTree();
  scheduleApexTestsFitScale();
}

async function loadApexClasses() {
  const { status, runBtn, classTbody } = getEls();
  if (!state.leftOrgId) return;
  if (apexTestsPanelOrgId !== state.leftOrgId) {
    selectedClassOptionValues.clear();
    methodSelectionsByClass.clear();
    activeClassForMethods = null;
    apexTestsPanelOrgId = state.leftOrgId;
  }
  if (runBtn) runBtn.disabled = true;
  const cToken = ++classesLoadToken;
  showClassLoading(true);
  if (status) status.textContent = t('apexTests.loadingClasses');
  let res;
  try {
    res = await bg({ type: 'apexTests:listClasses', orgId: state.leftOrgId });
  } finally {
    if (cToken === classesLoadToken) showClassLoading(false);
  }
  if (cToken !== classesLoadToken) return;
  if (runBtn) runBtn.disabled = false;
  if (!res.ok) {
    apexClassesCache = [];
    selectedClassOptionValues.clear();
    methodSelectionsByClass.clear();
    activeClassForMethods = null;
    if (classTbody) classTbody.innerHTML = '';
    clearMethodTable();
    const detail = [res.error, res.reason === 'UNKNOWN_MESSAGE' ? null : res.reason].filter(Boolean).join(' — ');
    const msg =
      res.reason === 'NO_SID'
        ? t('toast.noSession')
        : detail || t('apexTests.loadClassesError');
    if (status) {
      status.textContent =
        res.reason === 'NO_SID' ? msg : `${msg} ${t('apexTests.swNetworkHint')}`;
    }
    showToast(msg, 'error');
    refreshSelectionTree();
    scheduleApexTestsFitScale();
    return;
  }
  apexClassesCache = res.classes || [];
  const validVals = new Set(apexClassesCache.map((c) => classOptionValue(c)));
  let prunedSelection = false;
  for (const v of [...selectedClassOptionValues]) {
    if (!validVals.has(v)) {
      selectedClassOptionValues.delete(v);
      prunedSelection = true;
    }
  }
  const prevActive = activeClassForMethods;
  if (activeClassForMethods && !selectedClassOptionValues.has(activeClassForMethods)) {
    activeClassForMethods = getCheckedClassValues()[0] ?? null;
  }
  pruneMethodSelections();
  if (prunedSelection || prevActive !== activeClassForMethods) {
    scheduleReloadMethods();
  }
  applyClassFilter();
  if (status) status.textContent = t('apexTests.orgReady');
  scheduleApexTestsFitScale();
}

function buildRunBody() {
  const { classTbody } = getEls();
  if (!classTbody) return { testLevel: 'RunLocalTests', skipCodeCoverage: false };

  const classNames = getSelectedClassNamesOrdered();
  if (!classNames.length) return { testLevel: 'RunLocalTests', skipCodeCoverage: false };

  /** Mismo cuerpo que Developer Console (HAR): classId + testMethods, skipCodeCoverage. */
  const tests = [];
  for (const cn of classNames) {
    const c = apexClassesCache.find((x) => x.name === cn);
    const set = methodSelectionsByClass.get(cn);
    const methods =
      set && set.size > 0 ? [...set].sort((a, b) => a.localeCompare(b)) : null;
    if (c?.id) {
      /** `className` es solo para UI / hub; la API usa `classId` (se elimina en background). */
      if (methods?.length) tests.push({ classId: c.id, className: cn, testMethods: methods });
      else tests.push({ classId: c.id, className: cn });
    } else if (methods?.length) {
      tests.push({ className: cn, testMethods: methods });
    } else {
      tests.push({ className: cn });
    }
  }
  return { tests, testLevel: 'RunSpecifiedTests', skipCodeCoverage: false };
}

async function rememberQueuedApexRun(orgId, jobId, runBody, traceFlagId) {
  const org = state.orgsList.find((o) => String(o.id) === String(orgId));
  let envLabel = '';
  try {
    const extras = await chrome.storage.sync.get(['orgAliases', 'orgGroups']);
    envLabel = org
      ? buildOrgPicklistLabel(org, {
          aliases: extras.orgAliases || {},
          groups: extras.orgGroups || {}
        })
      : '';
  } catch {
    envLabel = org ? org.displayName || org.label || '' : '';
  }
  await rememberApexTestRunJob(orgId, jobId, envLabel, runBody, traceFlagId);
}

async function runApexTests() {
  if (!state.leftOrgId) return;
  const body = buildRunBody();
  const { runBtn, runStatus } = getEls();
  if (runBtn) runBtn.disabled = true;
  if (runStatus) runStatus.textContent = t('apexTests.running');
  const res = await bg({ type: 'apexTests:run', orgId: state.leftOrgId, runBody: body });
  if (runBtn) runBtn.disabled = false;
  if (!res.ok) {
    const msg =
      res.reason === 'NO_SID' ? t('toast.noSession') : res.error || t('apexTests.runError');
    if (runStatus) runStatus.textContent = msg;
    showToast(msg, 'error');
    scheduleApexTestsFitScale();
    return;
  }
  const id = extractApexTestRunJobId(res.result);
  void logApexTestRunUsage(state.leftOrgId, body, getSelectedClassNamesOrdered());
  if (id) {
    await rememberQueuedApexRun(state.leftOrgId, id, body, res.traceFlagId);
  }
  if (runStatus) {
    runStatus.textContent = id ? t('apexTests.runStarted', { id }) : t('apexTests.runOk');
  }
  if (id) {
    showToast(t('apexTests.runStarted', { id }), 'success');
  } else {
    showToast(t('apexTests.runOkNoId'), 'warn');
  }
  scheduleApexTestsFitScale();
  /* Siempre al hub tras encolar: polling cada 4 s y varias ejecuciones concurrentes en la tabla. La selección no se borra. */
  resetApexTestsShellToHub();
  syncApexTestsHubStatus();
}

export async function refreshApexTestsPanel() {
  if (getSelectedArtifactType() !== 'ApexTests') {
    stopApexTestsHubPolling();
    return;
  }
  syncApexTestsHubStatus();
  updateApexTestsHubPollingState();
  const { status } = getEls();
  if (!state.leftOrgId) {
    apexTestsPanelOrgId = null;
    if (status) status.textContent = t('apexTests.selectOrgAbove');
    setControlsEnabled(false);
    resetApexTestsUi();
    return;
  }
  if (!isApexTestsRunnerVisible()) {
    if (status) status.textContent = t('apexTests.orgReady');
    return;
  }
  if (status) status.textContent = t('apexTests.orgReady');
  setControlsEnabled(true);
  await loadApexClasses();
  scheduleApexTestsFitScale();
}

export function setupApexTestsPanel() {
  if (getSelectedArtifactType() === 'ApexTests') {
    resetApexTestsShellToHub();
  }

  const openRunner = document.getElementById('apexTestsOpenRunnerBtn');
  openRunner?.addEventListener('click', () => {
    openApexTestsRunnerView();
    void refreshApexTestsPanel();
  });
  const backHub = document.getElementById('apexTestsBackToHubBtn');
  backHub?.addEventListener('click', () => {
    resetApexTestsShellToHub();
    resetApexTestsUi();
    syncApexTestsHubStatus();
  });

  const { filter, tablesWrap, runBtn, classTbody } = getEls();
  if (filter) filter.addEventListener('input', () => applyClassFilter());
  classTbody?.addEventListener('click', (e) => {
    if (e.target.closest('input.apex-tests-class-cb')) return;
    const tr = e.target.closest('tr');
    if (!tr || !classTbody.contains(tr)) return;
    const cb = tr.querySelector('input.apex-tests-class-cb');
    if (!cb || !cb.checked) return;
    if (activeClassForMethods === cb.value) return;
    activeClassForMethods = cb.value;
    updateClassRowActiveHighlight();
    void reloadMethodsForSelection();
  });
  tablesWrap?.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el?.classList.contains('apex-tests-class-cb')) {
      if (el.checked) {
        selectedClassOptionValues.add(el.value);
        activeClassForMethods = el.value;
      } else {
        selectedClassOptionValues.delete(el.value);
        if (activeClassForMethods === el.value) {
          activeClassForMethods = getCheckedClassValues()[0] ?? null;
        }
      }
      pruneMethodSelections();
      updateClassRowActiveHighlight();
      scheduleReloadMethods();
    } else if (el?.classList.contains('apex-tests-method-cb')) {
      syncMethodCheckboxToMap(el);
      refreshSelectionTree();
    }
  });
  if (runBtn) runBtn.addEventListener('click', () => void runApexTests());
  initApexTestsCoverageModal();
  initApexTestsViewTestModal();
  initApexTestsViewLogModal();
  void refreshApexTestsPanel();
}
