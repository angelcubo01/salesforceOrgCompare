import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { t } from '../../shared/i18n.js';
import { showToast } from './toast.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { extractApexTestRunJobId } from '../../shared/extractApexTestRunJobId.js';
import { logApexTestFailureUsage, logApexTestRunUsage } from './apexTestUsageLog.js';
import { guardToolAction } from './featureControlsUi.js';
import {
  rememberApexTestRunJob,
  updateApexTestsHubPollingState,
  stopApexTestsHubPolling,
  initApexTestsCoverageModal,
  initApexTestsViewTestModal,
  initApexTestsViewLogModal,
  initApexTestsClearRunsButton,
  closeHubExpandedDetail,
  tickApexTestsHubRuns
} from './apexTestsHubRuns.js';
import { loadApexTestRunProfiles, saveApexTestRunProfiles } from './apexTestRunProfilesStorage.js';
import { mergeApexTestRunProfiles } from '../../shared/apexTestRunProfilesCore.js';

const APEX_TEST_RUNNER_SELECTION_KEY = 'apexTestRunnerSelection';

let persistSelectionTimer = 0;

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

/** Métodos conocidos por clase (se rellena al cargar la tabla de métodos de la clase activa). */
const methodsByClassCache = new Map();

function classOptionValue(c) {
  if (c?.id) return c.id;
  return `${CLASS_OPT_NAME_PREFIX}${c?.name || ''}`;
}

function classOptionValueForName(className) {
  const cn = String(className || '').trim();
  if (!cn) return null;
  const c = apexClassesCache.find((x) => x.name === cn);
  return c ? classOptionValue(c) : `${CLASS_OPT_NAME_PREFIX}${cn}`;
}

function classNameFromOptionValue(val) {
  const v = String(val || '');
  if (v.startsWith(CLASS_OPT_NAME_PREFIX)) return v.slice(CLASS_OPT_NAME_PREFIX.length);
  const c = apexClassesCache.find((x) => classOptionValue(x) === v || x.id === v);
  return c?.name || '';
}

/** Serializa selección actual para `chrome.storage.local` (por org). */
function snapshotRunnerSelection() {
  const methods = {};
  for (const [cn, set] of methodSelectionsByClass) {
    if (set?.size) methods[cn] = [...set].sort((a, b) => a.localeCompare(b));
  }
  return {
    classValues: [...selectedClassOptionValues],
    methods,
    activeClass: activeClassForMethods
  };
}

function schedulePersistRunnerSelection() {
  if (!state.leftOrgId) return;
  if (persistSelectionTimer) clearTimeout(persistSelectionTimer);
  persistSelectionTimer = window.setTimeout(() => {
    persistSelectionTimer = 0;
    void persistRunnerSelectionNow();
  }, 280);
}

async function persistRunnerSelectionNow() {
  const orgId = state.leftOrgId != null ? String(state.leftOrgId) : '';
  if (!orgId) return;
  try {
    const res = await chrome.storage.local.get(APEX_TEST_RUNNER_SELECTION_KEY);
    const all =
      res[APEX_TEST_RUNNER_SELECTION_KEY] && typeof res[APEX_TEST_RUNNER_SELECTION_KEY] === 'object'
        ? { ...res[APEX_TEST_RUNNER_SELECTION_KEY] }
        : {};
    all[orgId] = snapshotRunnerSelection();
    await chrome.storage.local.set({ [APEX_TEST_RUNNER_SELECTION_KEY]: all });
  } catch {
    /* ignore */
  }
}

async function restoreRunnerSelectionForOrg(orgId) {
  if (!orgId) return;
  try {
    const res = await chrome.storage.local.get(APEX_TEST_RUNNER_SELECTION_KEY);
    const all = res[APEX_TEST_RUNNER_SELECTION_KEY];
    const snap = all && typeof all === 'object' ? all[String(orgId)] : null;
    if (!snap || typeof snap !== 'object') return;
    selectedClassOptionValues.clear();
    methodSelectionsByClass.clear();
    if (Array.isArray(snap.classValues)) {
      for (const v of snap.classValues) {
        if (v != null && String(v).trim()) selectedClassOptionValues.add(String(v));
      }
    }
    if (snap.methods && typeof snap.methods === 'object') {
      for (const [cn, arr] of Object.entries(snap.methods)) {
        if (!Array.isArray(arr) || !arr.length) continue;
        methodSelectionsByClass.set(
          String(cn),
          new Set(arr.map((m) => String(m)).filter(Boolean))
        );
      }
    }
    activeClassForMethods =
      snap.activeClass != null && String(snap.activeClass).trim()
        ? String(snap.activeClass)
        : null;
    syncClassCheckboxesFromSelectionState();
  } catch {
    /* ignore */
  }
}

/** Alinea checkboxes de clase con clases seleccionadas o con métodos marcados. */
function syncClassCheckboxesFromSelectionState() {
  for (const cn of [...methodSelectionsByClass.keys()]) {
    const val = classOptionValueForName(cn);
    if (val) selectedClassOptionValues.add(val);
  }
}

function ensureClassSelectedByName(className) {
  const val = classOptionValueForName(className);
  if (!val) return;
  if (!selectedClassOptionValues.has(val)) {
    selectedClassOptionValues.add(val);
  }
  if (!activeClassForMethods) activeClassForMethods = val;
}

export function clearRunnerSelection() {
  selectedClassOptionValues.clear();
  methodSelectionsByClass.clear();
  methodsByClassCache.clear();
  activeClassForMethods = null;
  const orgId = state.leftOrgId != null ? String(state.leftOrgId) : '';
  if (orgId) {
    void (async () => {
      try {
        const res = await chrome.storage.local.get(APEX_TEST_RUNNER_SELECTION_KEY);
        const all =
          res[APEX_TEST_RUNNER_SELECTION_KEY] && typeof res[APEX_TEST_RUNNER_SELECTION_KEY] === 'object'
            ? { ...res[APEX_TEST_RUNNER_SELECTION_KEY] }
            : {};
        delete all[orgId];
        await chrome.storage.local.set({ [APEX_TEST_RUNNER_SELECTION_KEY]: all });
      } catch {
        /* ignore */
      }
    })();
  }
  applyClassFilter();
  clearMethodTable();
  renderMethodClassTabs();
  refreshSelectionTree();
  updateMethodBulkButtons();
  scheduleApexTestsFitScale();
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
 * Si todo cabe en ancho (s ≥ 1), sin transform: altura limitada al viewport y scroll en `.apex-tests-table-scroll`.
 * Si el panel es muy estrecho, escala horizontal (rama transform).
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

  const s = Math.min(1, vw / cw);

  if (s >= 1) {
    content.style.position = 'static';
    content.style.transform = 'none';
    content.style.transformOrigin = '';
    content.style.width = '';
    content.style.height = '';
    content.style.top = '';
    content.style.left = '';
    sizer.style.width = '';
    sizer.style.height = '';
    return;
  }

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
    hubStatus.classList.remove('hidden');
    hubStatus.classList.add('apex-tests-hub-status--warn');
    return;
  }
  hubStatus.textContent = '';
  hubStatus.classList.add('hidden');
  hubStatus.classList.remove('apex-tests-hub-status--warn');
}

function syncRunnerOrgStatus() {
  const { status } = getEls();
  if (!status) return;
  if (!state.leftOrgId) {
    status.textContent = t('apexTests.selectOrgAbove');
    status.classList.remove('hidden');
    return;
  }
  status.textContent = '';
  status.classList.add('hidden');
}

function getEls() {
  return {
    status: document.getElementById('apexTestsOrgStatus'),
    filter: document.getElementById('apexTestsClassFilter'),
    classTbody: document.getElementById('apexTestsClassTbody'),
    methodTbody: document.getElementById('apexTestsMethodTbody'),
    methodTabs: document.getElementById('apexTestsMethodTabs'),
    selectAllMethodsBtn: document.getElementById('apexTestsSelectAllMethodsBtn'),
    unselectAllMethodsBtn: document.getElementById('apexTestsUnselectAllMethodsBtn'),
    tablesWrap: document.getElementById('apexTestsTablesWrap'),
    classLoading: document.getElementById('apexTestsClassLoading'),
    methodLoading: document.getElementById('apexTestsMethodLoading'),
    selectionTree: document.getElementById('apexTestsSelectionTree'),
    runBtn: document.getElementById('apexTestsRunBtn'),
    runStatus: document.getElementById('apexTestsRunStatus'),
    profileName: document.getElementById('apexTestsProfileName'),
    saveProfileBtn: document.getElementById('apexTestsSaveProfileBtn'),
    profilesModalBody: document.getElementById('apexTestsProfilesModalBody'),
    clearSelectionBtn: document.getElementById('apexTestsClearSelectionBtn')
  };
}

function getActiveClassName() {
  return classNameFromOptionValue(activeClassForMethods);
}

/** @returns {{ total: number, selected: number, anySelected: boolean, allSelected: boolean }} */
function getActiveClassSelectionStats() {
  const cn = getActiveClassName();
  if (!cn) return { total: 0, selected: 0, anySelected: false, allSelected: false };
  const methods = methodsByClassCache.get(cn) || [];
  const total = methods.length;
  const val = classOptionValueForName(cn);
  const methodSet = methodSelectionsByClass.get(cn);
  const wholeClass = !!(val && selectedClassOptionValues.has(val) && (!methodSet || methodSet.size === 0));
  const selected = wholeClass ? total : methodSet?.size || 0;
  const anySelected = wholeClass || selected > 0;
  const allSelected = total > 0 && selected >= total;
  return { total, selected, anySelected, allSelected };
}

function syncMethodCheckboxesFromState() {
  const { methodTbody } = getEls();
  if (!methodTbody) return;
  const cn = getActiveClassName();
  const methodSet = cn ? methodSelectionsByClass.get(cn) : null;
  const val = cn ? classOptionValueForName(cn) : null;
  const wholeClass = !!(val && selectedClassOptionValues.has(val) && (!methodSet || methodSet.size === 0));
  methodTbody.querySelectorAll('input.apex-tests-method-cb').forEach((cb) => {
    try {
      const [, mn] = JSON.parse(cb.value);
      if (wholeClass) cb.checked = true;
      else cb.checked = !!(methodSet && methodSet.has(mn));
    } catch {
      cb.checked = false;
    }
  });
}

function clearClassSelectionByCheckbox(cb) {
  if (!cb) return;
  const cn = classNameFromOptionValue(cb.value);
  selectedClassOptionValues.delete(cb.value);
  if (cn) methodSelectionsByClass.delete(cn);
  cb.checked = false;
  cb.indeterminate = false;
  syncClassCheckboxPartialClass(cb);
  if (activeClassForMethods === cb.value) {
    activeClassForMethods = getCheckedClassValues()[0] ?? null;
  }
  pruneMethodSelections();
  syncMethodCheckboxesFromState();
  updateClassRowActiveHighlight();
  renderMethodClassTabs();
  refreshSelectionTree();
  syncAllClassCheckboxVisuals();
  updateMethodBulkButtons();
  scheduleReloadMethods();
  schedulePersistRunnerSelection();
}

function selectAllMethodsForActiveClass() {
  const cn = getActiveClassName();
  const val = classOptionValueForName(cn);
  if (!cn || !val) return;
  selectedClassOptionValues.add(val);
  methodSelectionsByClass.delete(cn);
  syncMethodCheckboxesFromState();
  const rowCb = getEls().classTbody?.querySelector(
    `input.apex-tests-class-cb[value="${CSS.escape(val)}"]`
  );
  if (rowCb) syncClassCheckboxVisual(rowCb, cn);
  refreshSelectionTree();
  updateClassRowActiveHighlight();
  updateMethodBulkButtons();
  schedulePersistRunnerSelection();
}

function unselectAllMethodsForActiveClass() {
  const cn = getActiveClassName();
  const val = classOptionValueForName(cn);
  if (!cn || !val) return;
  selectedClassOptionValues.delete(val);
  methodSelectionsByClass.delete(cn);
  syncMethodCheckboxesFromState();
  const rowCb = getEls().classTbody?.querySelector(
    `input.apex-tests-class-cb[value="${CSS.escape(val)}"]`
  );
  if (rowCb) syncClassCheckboxVisual(rowCb, cn);
  if (activeClassForMethods === val) {
    activeClassForMethods = getCheckedClassValues()[0] ?? null;
  }
  pruneMethodSelections();
  updateClassRowActiveHighlight();
  renderMethodClassTabs();
  refreshSelectionTree();
  syncAllClassCheckboxVisuals();
  updateMethodBulkButtons();
  scheduleReloadMethods();
  schedulePersistRunnerSelection();
}

function updateMethodBulkButtons() {
  const { selectAllMethodsBtn, unselectAllMethodsBtn, methodTbody } = getEls();
  const stats = getActiveClassSelectionStats();
  const hasMethodRows = !!(methodTbody && methodTbody.querySelector('input.apex-tests-method-cb'));
  const controlsOn = !getEls().filter?.disabled;
  if (selectAllMethodsBtn) {
    selectAllMethodsBtn.disabled =
      !controlsOn || !hasMethodRows || !stats.total || stats.allSelected;
  }
  if (unselectAllMethodsBtn) {
    unselectAllMethodsBtn.disabled = !controlsOn || !hasMethodRows || !stats.anySelected;
  }
}

function summarizeProfileRunBody(runBody) {
  if (!runBody || typeof runBody !== 'object') return t('apexTests.profilesSummaryAllLocal');
  const tl = String(/** @type {{ testLevel?: unknown }} */ (runBody).testLevel || '');
  if (tl === 'RunLocalTests') return t('apexTests.profilesSummaryAllLocal');
  const tests = Array.isArray(/** @type {{ tests?: unknown[] }} */ (runBody).tests)
    ? /** @type {{ tests: unknown[] }} */ (runBody).tests
    : [];
  let methods = 0;
  for (const row of tests) {
    const tm = row && typeof row === 'object' ? /** @type {{ testMethods?: unknown[] }} */ (row).testMethods : null;
    if (Array.isArray(tm)) methods += tm.length;
  }
  return t('apexTests.profilesSummary', { classes: String(tests.length), methods: String(methods) });
}

async function renderProfilesModalList() {
  const { profilesModalBody } = getEls();
  if (!profilesModalBody) return;
  const profiles = await loadApexTestRunProfiles();
  profilesModalBody.replaceChildren();
  if (!profiles.length) {
    const empty = document.createElement('p');
    empty.className = 'apex-tests-profiles-empty';
    empty.textContent = t('apexTests.profilesModalEmpty');
    profilesModalBody.appendChild(empty);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'apex-tests-profiles-list';
  for (const p of profiles) {
    const li = document.createElement('li');
    li.className = 'apex-tests-profiles-item';
    const meta = document.createElement('div');
    meta.className = 'apex-tests-profiles-item-meta';
    const nameEl = document.createElement('span');
    nameEl.className = 'apex-tests-profiles-item-name';
    nameEl.textContent = p.name || p.id;
    const sumEl = document.createElement('span');
    sumEl.className = 'apex-tests-profiles-item-summary';
    sumEl.textContent = summarizeProfileRunBody(p.runBody);
    meta.appendChild(nameEl);
    meta.appendChild(sumEl);
    const actions = document.createElement('div');
    actions.className = 'apex-tests-profiles-item-actions';
    const btnRun = document.createElement('button');
    btnRun.type = 'button';
    btnRun.className = 'apex-tests-toolbar-btn';
    btnRun.textContent = t('apexTests.runProfileRun');
    btnRun.addEventListener('click', async () => {
      closeApexTestsProfilesModal();
      await runApexTestsWithBody(p.runBody);
    });
    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.className = 'apex-tests-toolbar-btn apex-tests-profiles-delete-btn';
    btnDel.textContent = t('apexTests.profilesDelete');
    btnDel.addEventListener('click', async () => {
      const label = p.name || p.id;
      if (!window.confirm(t('apexTests.profilesDeleteConfirm', { name: label }))) return;
      const all = await loadApexTestRunProfiles();
      const next = all.filter((x) => (x.id || x.name) !== (p.id || p.name));
      await saveApexTestRunProfiles(next);
      showToast(t('apexTests.profilesDeleted'), 'info');
      void renderProfilesModalList();
    });
    actions.appendChild(btnRun);
    actions.appendChild(btnDel);
    li.appendChild(meta);
    li.appendChild(actions);
    list.appendChild(li);
  }
  profilesModalBody.appendChild(list);
}

function closeApexTestsProfilesModal() {
  const modal = document.getElementById('apexTestsProfilesModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function openApexTestsProfilesModal() {
  const modal = document.getElementById('apexTestsProfilesModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  void renderProfilesModalList();
}

let profilesModalInitialized = false;

function initApexTestsProfilesModal() {
  if (profilesModalInitialized) return;
  profilesModalInitialized = true;
  const modal = document.getElementById('apexTestsProfilesModal');
  if (!modal) return;
  modal.querySelector('[data-apex-profiles-close]')?.addEventListener('click', closeApexTestsProfilesModal);
  document.getElementById('apexTestsProfilesModalClose')?.addEventListener('click', closeApexTestsProfilesModal);
}

function renderMethodClassTabs() {
  const { methodTabs } = getEls();
  if (!methodTabs) return;
  const names = getSelectedClassNamesOrdered();
  methodTabs.replaceChildren();
  if (names.length < 2) {
    methodTabs.classList.add('hidden');
    return;
  }
  methodTabs.classList.remove('hidden');
  for (const cn of names) {
    const c = apexClassesCache.find((x) => x.name === cn);
    const val = c ? classOptionValue(c) : `${CLASS_OPT_NAME_PREFIX}${cn}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'apex-tests-method-tab';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', val === activeClassForMethods ? 'true' : 'false');
    btn.textContent = cn;
    btn.dataset.classValue = val;
    if (val === activeClassForMethods) btn.classList.add('is-active');
    btn.addEventListener('click', () => {
      if (activeClassForMethods === val) return;
      activeClassForMethods = val;
      renderMethodClassTabs();
      void reloadMethodsForSelection();
    });
    methodTabs.appendChild(btn);
  }
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
  const names = new Set();
  for (const v of selectedClassOptionValues) {
    const n = classNameFromOptionValue(v);
    if (n) names.add(n);
  }
  for (const cn of methodSelectionsByClass.keys()) {
    const set = methodSelectionsByClass.get(cn);
    if (set?.size) names.add(cn);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function syncClassCheckboxPartialClass(cb) {
  cb.classList.toggle('apex-tests-cb--partial', !!cb.indeterminate);
}

function syncClassCheckboxVisual(cb, className) {
  if (!cb) return;
  const cn = className || classNameFromOptionValue(cb.value);
  const valInSet = selectedClassOptionValues.has(cb.value);
  const methodSet = methodSelectionsByClass.get(cn);

  cb.indeterminate = false;

  if (!valInSet && (!methodSet || methodSet.size === 0)) {
    cb.checked = false;
    syncClassCheckboxPartialClass(cb);
    return;
  }

  if (valInSet && (!methodSet || methodSet.size === 0)) {
    cb.checked = true;
    syncClassCheckboxPartialClass(cb);
    return;
  }

  const allMethods = methodsByClassCache.get(cn);
  if (allMethods && allMethods.length > 0 && methodSet) {
    const allSelected =
      allMethods.length === methodSet.size && allMethods.every((m) => methodSet.has(m));
    if (allSelected) {
      cb.checked = true;
      syncClassCheckboxPartialClass(cb);
      return;
    }
    if (methodSet.size > 0) {
      cb.checked = false;
      cb.indeterminate = true;
      syncClassCheckboxPartialClass(cb);
      return;
    }
  }

  if (methodSet && methodSet.size > 0) {
    cb.checked = false;
    cb.indeterminate = true;
    syncClassCheckboxPartialClass(cb);
    return;
  }

  cb.checked = valInSet;
  syncClassCheckboxPartialClass(cb);
}

function syncAllClassCheckboxVisuals() {
  const { classTbody } = getEls();
  if (!classTbody) return;
  classTbody.querySelectorAll('input.apex-tests-class-cb').forEach((cb) => {
    syncClassCheckboxVisual(cb);
  });
}

function syncMethodCheckboxToMap(cb) {
  try {
    const [cn, mn] = JSON.parse(cb.value);
    if (!cn || !mn) return;
    if (cb.checked) {
      ensureClassSelectedByName(cn);
      if (!methodSelectionsByClass.has(cn)) methodSelectionsByClass.set(cn, new Set());
      methodSelectionsByClass.get(cn).add(mn);
      const val = classOptionValueForName(cn);
      if (val) {
        const rowCb = getEls().classTbody?.querySelector(
          `input.apex-tests-class-cb[value="${CSS.escape(val)}"]`
        );
        if (rowCb) syncClassCheckboxVisual(rowCb, cn);
      }
    } else {
      const set = methodSelectionsByClass.get(cn);
      if (set) {
        set.delete(mn);
        if (set.size === 0) methodSelectionsByClass.delete(cn);
      }
      const val = classOptionValueForName(cn);
      if (val) {
        const rowCb = getEls().classTbody?.querySelector(
          `input.apex-tests-class-cb[value="${CSS.escape(val)}"]`
        );
        if (rowCb) syncClassCheckboxVisual(rowCb, cn);
      }
    }
    schedulePersistRunnerSelection();
  } catch {
    /* ignore */
  }
  updateMethodBulkButtons();
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
      !!(
        cb &&
        (cb.checked || cb.indeterminate) &&
        cb.value === activeClassForMethods
      )
    );
  });
}

function setControlsEnabled(enabled) {
  const { filter, tablesWrap, runBtn, clearSelectionBtn, selectAllMethodsBtn, unselectAllMethodsBtn } =
    getEls();
  if (filter) filter.disabled = !enabled;
  if (tablesWrap) {
    tablesWrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.disabled = !enabled;
    });
  }
  if (runBtn) runBtn.disabled = !enabled;
  if (clearSelectionBtn) clearSelectionBtn.disabled = !enabled;
  if (!enabled) {
    if (selectAllMethodsBtn) selectAllMethodsBtn.disabled = true;
    if (unselectAllMethodsBtn) unselectAllMethodsBtn.disabled = true;
  } else {
    updateMethodBulkButtons();
  }
}

function clearMethodTable() {
  const { methodTbody } = getEls();
  if (methodTbody) methodTbody.innerHTML = '';
}

function resetApexTestsUi() {
  apexClassesCache = [];
  clearRunnerSelection();
  const { filter, classTbody, runStatus } = getEls();
  if (filter) filter.value = '';
  if (classTbody) classTbody.innerHTML = '';
  clearMethodTable();
  if (runStatus) runStatus.textContent = '';
  showClassLoading(false);
  showMethodLoading(false);
  renderMethodClassTabs();
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
    syncClassCheckboxVisual(cb, c.name);
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
  renderMethodClassTabs();
  refreshSelectionTree();
  syncAllClassCheckboxVisuals();
  updateMethodBulkButtons();
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
    renderMethodClassTabs();
    if (runStatus) runStatus.textContent = '';
    updateClassRowActiveHighlight();
    refreshSelectionTree();
    updateMethodBulkButtons();
    scheduleApexTestsFitScale();
    return;
  }
  renderMethodClassTabs();
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
    void logApexTestFailureUsage(state.leftOrgId, 'load_methods', {
      reason: res.reason || '',
      error: msg
    });
    if (runStatus) runStatus.textContent = msg;
    showToast(msg, 'warn');
    refreshSelectionTree();
    updateMethodBulkButtons();
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
    methodsByClassCache.set(entry.name, [...(entry.methods || [])]);
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
  renderMethodClassTabs();
  refreshSelectionTree();
  syncAllClassCheckboxVisuals();
  updateMethodBulkButtons();
  scheduleApexTestsFitScale();
}

async function loadApexClasses() {
  const { status, runBtn, classTbody } = getEls();
  if (!state.leftOrgId) return;
  if (apexTestsPanelOrgId !== state.leftOrgId) {
    selectedClassOptionValues.clear();
    methodSelectionsByClass.clear();
    methodsByClassCache.clear();
    activeClassForMethods = null;
    apexTestsPanelOrgId = state.leftOrgId;
    await restoreRunnerSelectionForOrg(state.leftOrgId);
  } else {
    await restoreRunnerSelectionForOrg(state.leftOrgId);
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
    void logApexTestFailureUsage(state.leftOrgId, 'load_classes', {
      reason: res.reason || '',
      error: msg
    });
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
  syncClassCheckboxesFromSelectionState();
  const validVals = new Set(apexClassesCache.map((c) => classOptionValue(c)));
  let prunedSelection = false;
  for (const v of [...selectedClassOptionValues]) {
    if (!validVals.has(v)) {
      selectedClassOptionValues.delete(v);
      prunedSelection = true;
    }
  }
  for (const cn of [...methodSelectionsByClass.keys()]) {
    const val = classOptionValueForName(cn);
    if (val && validVals.has(val)) selectedClassOptionValues.add(val);
  }
  const prevActive = activeClassForMethods;
  if (activeClassForMethods && !selectedClassOptionValues.has(activeClassForMethods)) {
    activeClassForMethods = getCheckedClassValues()[0] ?? null;
  }
  if (!activeClassForMethods && getCheckedClassValues().length) {
    activeClassForMethods = getCheckedClassValues()[0];
  }
  pruneMethodSelections();
  applyClassFilter();
  if (getCheckedClassValues().length) {
    scheduleReloadMethods();
  } else if (prunedSelection || prevActive !== activeClassForMethods) {
    scheduleReloadMethods();
  }
  syncRunnerOrgStatus();
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

async function runApexTestsWithBody(body) {
  if (guardToolAction('apex_test_run')) return;
  if (!state.leftOrgId) return;
  const { runBtn, runStatus } = getEls();
  if (runBtn) runBtn.disabled = true;
  if (runStatus) runStatus.textContent = t('apexTests.running');
  const res = await bg({ type: 'apexTests:run', orgId: state.leftOrgId, runBody: body });
  if (runBtn) runBtn.disabled = false;
  if (!res.ok) {
    const msg =
      res.reason === 'NO_SID' ? t('toast.noSession') : res.error || t('apexTests.runError');
    void logApexTestFailureUsage(state.leftOrgId, 'run', {
      reason: res.reason || '',
      error: msg
    });
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
  await persistRunnerSelectionNow();
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

async function runApexTests() {
  if (!state.leftOrgId) return;
  const body = buildRunBody();
  if (body.testLevel === 'RunLocalTests') {
    if (!window.confirm(t('apexTests.confirmRunAllLocal'))) return;
  }
  await runApexTestsWithBody(body);
}

export async function refreshApexTestsPanel() {
  if (getSelectedArtifactType() !== 'ApexTests') {
    stopApexTestsHubPolling();
    return;
  }
  syncApexTestsHubStatus();
  syncRunnerOrgStatus();
  updateApexTestsHubPollingState();
  if (!state.leftOrgId) {
    apexTestsPanelOrgId = null;
    setControlsEnabled(false);
    resetApexTestsUi();
    return;
  }
  if (!isApexTestsRunnerVisible()) {
    return;
  }
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

  const { filter, tablesWrap, runBtn, classTbody, selectAllMethodsBtn, unselectAllMethodsBtn } = getEls();
  if (filter) filter.addEventListener('input', () => applyClassFilter());
  classTbody?.addEventListener(
    'click',
    (e) => {
      const cb = e.target.closest('input.apex-tests-class-cb');
      if (cb?.indeterminate) {
        e.preventDefault();
        clearClassSelectionByCheckbox(cb);
      }
    },
    true
  );
  classTbody?.addEventListener('click', (e) => {
    if (e.target.closest('input.apex-tests-class-cb')) return;
    const tr = e.target.closest('tr');
    if (!tr || !classTbody.contains(tr)) return;
    const cb = tr.querySelector('input.apex-tests-class-cb');
    if (!cb || (!cb.checked && !cb.indeterminate)) return;
    if (activeClassForMethods === cb.value) return;
    activeClassForMethods = cb.value;
    updateClassRowActiveHighlight();
    void reloadMethodsForSelection();
  });
  tablesWrap?.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el?.classList.contains('apex-tests-class-cb')) {
      const cn = classNameFromOptionValue(el.value);
      if (el.checked) {
        selectedClassOptionValues.add(el.value);
        if (cn) methodSelectionsByClass.delete(cn);
        el.indeterminate = false;
        syncClassCheckboxPartialClass(el);
        activeClassForMethods = el.value;
      } else {
        selectedClassOptionValues.delete(el.value);
        if (cn) methodSelectionsByClass.delete(cn);
        el.indeterminate = false;
        syncClassCheckboxPartialClass(el);
        if (activeClassForMethods === el.value) {
          activeClassForMethods = getCheckedClassValues()[0] ?? null;
        }
      }
      pruneMethodSelections();
      updateClassRowActiveHighlight();
      scheduleReloadMethods();
      schedulePersistRunnerSelection();
      updateMethodBulkButtons();
    } else if (el?.classList.contains('apex-tests-method-cb')) {
      syncMethodCheckboxToMap(el);
      refreshSelectionTree();
      updateClassRowActiveHighlight();
      syncAllClassCheckboxVisuals();
      updateMethodBulkButtons();
    }
  });
  selectAllMethodsBtn?.addEventListener('click', () => selectAllMethodsForActiveClass());
  unselectAllMethodsBtn?.addEventListener('click', () => unselectAllMethodsForActiveClass());
  if (runBtn) runBtn.addEventListener('click', () => void runApexTests());
  const { clearSelectionBtn } = getEls();
  clearSelectionBtn?.addEventListener('click', () => {
    clearRunnerSelection();
    showToast(t('apexTests.clearSelectionDone'), 'info');
  });
  document.getElementById('apexTestsProfilesBtn')?.addEventListener('click', () => {
    openApexTestsProfilesModal();
  });
  const { saveProfileBtn, profileName } = getEls();
  saveProfileBtn?.addEventListener('click', async () => {
    const body = buildRunBody();
    if (body.testLevel === 'RunLocalTests') {
      showToast(t('apexTests.runProfileEmpty'), 'warn');
      return;
    }
    const name = (profileName?.value || '').trim();
    if (!name) {
      showToast(t('apexTests.runProfileNamePh'), 'warn');
      return;
    }
    const profiles = await loadApexTestRunProfiles();
    const id = `p_${Date.now()}`;
    const next = mergeApexTestRunProfiles(profiles, [
      { id, name: name.slice(0, 80), runBody: JSON.parse(JSON.stringify(body)) }
    ]);
    await saveApexTestRunProfiles(next);
    showToast(t('apexTests.runProfileSaved'), 'success');
    if (profileName) profileName.value = '';
    void renderProfilesModalList();
  });
  document.addEventListener('keydown', (e) => {
    if (getSelectedArtifactType() !== 'ApexTests') return;
    if (e.key === 'Escape') {
      closeApexTestsProfilesModal();
      closeHubExpandedDetail();
      return;
    }
    if (e.key === 'F5' && !isApexTestsRunnerVisible()) {
      e.preventDefault();
      void tickApexTestsHubRuns();
      return;
    }
    if (isApexTestsRunnerVisible() && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void runApexTests();
    }
  });
  initApexTestsCoverageModal();
  initApexTestsViewTestModal();
  initApexTestsViewLogModal();
  initApexTestsProfilesModal();
  initApexTestsClearRunsButton();
  void refreshApexTestsPanel();
}
