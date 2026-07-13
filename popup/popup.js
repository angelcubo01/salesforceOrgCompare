import '../shared/installEarlyExceptionCapture.js';
import { t, loadLang, getCurrentLang, setLang, getAvailableLanguages } from '../shared/i18n.js';
import { sameGroupKey, isOrgAlreadySaved } from '../shared/orgPrefs.js';
import { loadExtensionSettings, applyUiThemeToDocument } from '../shared/extensionSettings.js';
import {
  ONBOARDING_PREFS_KEY,
  normalizeOnboardingPrefs,
  markPopupNoticeDismissedInPrefs
} from '../shared/onboardingPrefs.js';
import { initPosthogClient, getPosthogClient, syncPosthogAppLanguage } from '../shared/posthogClient.js';
import { loadPopupControlsFromPosthog } from '../shared/posthogPopupControlsFlag.js';
import {
  buildNoticeFingerprint,
  isOpenAppDisabled,
  isRemoteNoticeActive,
  resolveDismissLabelText,
  resolveNoticeText,
  resolveOpenAppTooltip,
  shouldShowRemoteNotice
} from '../shared/popupControls.js';
import { setupPopupHelp, refreshPopupHelpModalContent } from './popupHelp.js';
import { setupPopupWelcome, maybeShowPopupWelcome, refreshPopupWelcomeContent } from './popupWelcome.js';

async function bg(message) {
  return await chrome.runtime.sendMessage(message);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

let __authStatuses = {};
let __orgAliases = {};
let __orgGroups = {};
/** @type {HTMLElement | null} */
let __dragRowEl = null;

function encodeGroupAttr(groupName) {
  return groupName ? encodeURIComponent(groupName) : '';
}

async function loadOrgExtras() {
  try {
    const res = await chrome.storage.sync.get(['orgAliases', 'orgGroups']);
    __orgAliases = res.orgAliases || {};
    __orgGroups = res.orgGroups || {};
  } catch {}
}

async function saveAlias(orgId, alias) {
  __orgAliases[orgId] = alias || '';
  if (!alias) delete __orgAliases[orgId];
  await chrome.storage.sync.set({ orgAliases: __orgAliases });
}

async function saveGroup(orgId, group) {
  __orgGroups[orgId] = group || '';
  if (!group) delete __orgGroups[orgId];
  await chrome.storage.sync.set({ orgGroups: __orgGroups });
}

function getOrgDisplayName(org) {
  if (__orgAliases[org.id]) return __orgAliases[org.id];
  return org.label || deriveLabelFromHost(new URL(org.instanceUrl).hostname);
}

function getAllGroups() {
  const set = new Set(Object.values(__orgGroups).filter(Boolean));
  return [...set].sort();
}

function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((elem) => {
    elem.textContent = t(elem.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((elem) => {
    elem.title = t(elem.getAttribute('data-i18n-title'));
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((elem) => {
    elem.setAttribute('aria-label', t(elem.getAttribute('data-i18n-aria-label')));
  });
}

function setupPopupLanguageSelect() {
  const sel = document.getElementById('popupLangSelect');
  if (!sel) return;
  sel.innerHTML = '';
  for (const { code, label } of getAvailableLanguages()) {
    const o = document.createElement('option');
    o.value = code;
    o.textContent = label;
    sel.appendChild(o);
  }
  sel.value = getCurrentLang();
  sel.addEventListener('change', () => {
    void applyPopupLangChange(sel.value);
  });
}

async function applyPopupLangChange(lang) {
  setLang(lang);
  document.documentElement.lang = lang === 'en' ? 'en' : 'es';
  syncPosthogAppLanguage();
  applyStaticTranslations();
  refreshPopupWelcomeContent();
  refreshPopupHelpModalContent();
  const sel = document.getElementById('popupLangSelect');
  if (sel) sel.value = getCurrentLang();
  await refresh();
  await setupPopupControls();
}

function rowGroupKey(li) {
  return li.getAttribute('data-group-key') || '';
}

/** Última fila `li[data-org-id]` del mismo grupo (mismo data-group-key), en orden DOM. */
function lastRowInSameSection(ul, groupKey) {
  const rows = [...ul.querySelectorAll('li[data-org-id]')];
  let last = null;
  for (const row of rows) {
    if (sameGroupKey(rowGroupKey(row), groupKey)) last = row;
  }
  return last;
}

function wireSavedListDragReorder(ul) {
  ul.querySelectorAll('.drag-handle').forEach((handle) => {
    const li = handle.closest('li[data-org-id]');
    if (!li) return;

    handle.addEventListener('dragstart', (e) => {
      __dragRowEl = li;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', li.dataset.orgId || '');
      li.classList.add('dragging');
    });

    handle.addEventListener('dragend', async () => {
      li.classList.remove('dragging');
      __dragRowEl = null;
      const ids = [...ul.querySelectorAll('li[data-org-id]')].map((row) => row.dataset.orgId).filter(Boolean);
      if (ids.length) {
        await bg({ type: 'reorderSavedOrgs', orgIds: ids });
      }
    });
  });

  ul.querySelectorAll('li[data-org-id]').forEach((li) => {
    li.addEventListener('dragover', (e) => {
      if (!__dragRowEl || __dragRowEl === li) return;
      if (!sameGroupKey(rowGroupKey(__dragRowEl), rowGroupKey(li))) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = li.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        ul.insertBefore(__dragRowEl, li);
      } else {
        ul.insertBefore(__dragRowEl, li.nextSibling);
      }
    });
    li.addEventListener('drop', (e) => e.preventDefault());
  });

  ul.addEventListener('dragover', (e) => {
    if (!__dragRowEl) return;
    const gk = rowGroupKey(__dragRowEl);
    const last = lastRowInSameSection(ul, gk);
    if (!last) return;
    const rect = last.getBoundingClientRect();
    if (e.clientY > rect.bottom) {
      if (!sameGroupKey(rowGroupKey(last), gk)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      ul.insertBefore(__dragRowEl, last.nextSibling);
    }
  });
}

function buildOrgRow(o) {
  const li = el('li', 'row row-saved');
  li.dataset.orgId = o.id;
  const gName = (__orgGroups[o.id] || '').trim();
  li.setAttribute('data-group-key', encodeGroupAttr(gName));

  const handle = el('span', 'drag-handle', '⋮⋮');
  handle.setAttribute('draggable', 'true');
  handle.title = t('popup.dragToSort');

  const main = el('div', 'row-main');
  const left = el('div');

  const nameRow = el('div', 'org-name-row');

  const displayName = getOrgDisplayName(o);
  const orgNameEl = el('span', 'org-name', displayName);
  const status = __authStatuses[o.id] || 'expired';
  orgNameEl.setAttribute('data-auth-status', status);
  orgNameEl.classList.add('org-name--in-row');
  nameRow.appendChild(orgNameEl);

  if (gName) {
    nameRow.appendChild(el('span', 'org-group-tag', gName));
  }

  const editBtn = el('button', 'alias-edit-btn', '✎');
  editBtn.type = 'button';
  editBtn.title = t('popup.editAlias');
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAliasEditor(li, o);
  });
  nameRow.appendChild(editBtn);
  left.appendChild(nameRow);

  left.appendChild(el('div', 'org-meta', o.instanceUrl));
  main.appendChild(left);

  const wrap = el('div', 'org-actions-wrap');
  const trigger = el('button', 'org-actions-trigger', '⋯');
  trigger.type = 'button';
  trigger.title = t('popup.orgActionsMenu');
  trigger.setAttribute('aria-haspopup', 'true');

  const menu = el('div', 'org-actions-menu');
  menu.setAttribute('role', 'menu');

  if (status === 'expired') {
    const reauthBtn = el('button', 'org-actions-item', t('popup.reauth'));
    reauthBtn.type = 'button';
    reauthBtn.setAttribute('role', 'menuitem');
    reauthBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await bg({ type: 'auth:reauth', orgId: o.id });
    });
    menu.appendChild(reauthBtn);
  }

  const rmBtn = el('button', 'org-actions-item org-actions-item-danger', t('popup.remove'));
  rmBtn.type = 'button';
  rmBtn.setAttribute('role', 'menuitem');
  rmBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await bg({ type: 'removeOrg', orgId: o.id });
    await refresh();
  });
  menu.appendChild(rmBtn);

  const readOnlyBtn = el('button', 'org-actions-item', t('popup.readOnlyOrg'));
  readOnlyBtn.type = 'button';
  readOnlyBtn.setAttribute('role', 'menuitem');
  readOnlyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const mapRes = await bg({ type: 'orgWrite:getReadOnlyMap' });
    const map = mapRes?.ok ? mapRes.map || {} : {};
    const next = !map[o.id];
    await bg({ type: 'orgWrite:setReadOnly', orgId: o.id, readOnly: next });
    readOnlyBtn.textContent = next ? `✓ ${t('popup.readOnlyOrg')}` : t('popup.readOnlyOrg');
  });
  menu.appendChild(readOnlyBtn);

  wrap.appendChild(trigger);
  wrap.appendChild(menu);

  li.appendChild(handle);
  li.appendChild(main);
  li.appendChild(wrap);
  return li;
}

function toggleAliasEditor(li, org) {
  const existing = li.querySelector('.alias-editor');
  if (existing) { existing.remove(); return; }

  const editor = el('div', 'alias-editor');

  const aliasInput = document.createElement('input');
  aliasInput.type = 'text';
  aliasInput.className = 'alias-input';
  aliasInput.placeholder = t('popup.aliasPlaceholder');
  aliasInput.value = __orgAliases[org.id] || '';
  aliasInput.maxLength = 20;

  const groupInput = document.createElement('input');
  groupInput.type = 'text';
  groupInput.className = 'alias-input';
  groupInput.placeholder = t('popup.groupPlaceholder');
  groupInput.value = __orgGroups[org.id] || '';
  groupInput.maxLength = 30;
  const datalist = document.createElement('datalist');
  const dlId = `groupSuggestions-${org.id}`;
  datalist.id = dlId;
  groupInput.setAttribute('list', dlId);
  for (const g of getAllGroups()) {
    const opt = document.createElement('option');
    opt.value = g;
    datalist.appendChild(opt);
  }

  const save = async () => {
    await saveAlias(org.id, aliasInput.value.trim());
    await saveGroup(org.id, groupInput.value.trim());
    renderSaved(window.__lastOrgs || []);
  };

  aliasInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  groupInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  aliasInput.addEventListener('blur', () => { setTimeout(() => { if (!editor.contains(document.activeElement)) save(); }, 150); });
  groupInput.addEventListener('blur', () => { setTimeout(() => { if (!editor.contains(document.activeElement)) save(); }, 150); });

  editor.appendChild(aliasInput);
  editor.appendChild(datalist);
  editor.appendChild(groupInput);

  const main = li.querySelector('.row-main');
  if (main) main.appendChild(editor);
  aliasInput.focus();
}

function renderSaved(orgs) {
  window.__lastOrgs = orgs;
  const ul = document.getElementById('savedList');
  ul.innerHTML = '';
  if (!orgs.length) {
    const li = el('li', 'row muted', t('popup.noSavedOrgs'));
    ul.appendChild(li);
    return;
  }

  const groups = new Map();
  const ungrouped = [];
  for (const o of orgs) {
    const g = __orgGroups[o.id];
    if (g) {
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(o);
    } else {
      ungrouped.push(o);
    }
  }

  const hasAnyGroups = groups.size > 0;

  for (const [groupName, groupOrgs] of groups) {
    const header = el('li', 'group-header', groupName);
    ul.appendChild(header);
    for (const o of groupOrgs) ul.appendChild(buildOrgRow(o));
  }

  if (ungrouped.length) {
    if (hasAnyGroups) {
      const header = el('li', 'group-header', t('popup.ungrouped'));
      ul.appendChild(header);
    }
    for (const o of ungrouped) ul.appendChild(buildOrgRow(o));
  }

  wireSavedListDragReorder(ul);
}

async function refreshSaved() {
  const [res, auth] = await Promise.all([
    bg({ type: 'listSavedOrgs' }),
    bg({ type: 'auth:getStatuses' }),
    loadOrgExtras()
  ]);
  __authStatuses = auth.ok ? (auth.statuses || {}) : {};
  const orgs = res.ok ? (res.orgs || []) : [];
  renderSaved(orgs);
  window.__savedOrgIds = new Set(orgs.map((o) => o.id));
  window.__savedOrgs = orgs;
  return orgs;
}

async function refreshDetected(savedOrgs) {
  const row = document.getElementById('detectedRow');
  row.innerHTML = '';
  const res = await bg({ type: 'discoverActiveOrg' });
  if (!res.ok || !res.org) {
    row.classList.add('muted');
    row.textContent = t('popup.noDetectedTab');
    return;
  }
  const list = savedOrgs ?? window.__savedOrgs ?? [];
  if (isOrgAlreadySaved(res.org, list)) {
    row.classList.add('muted');
    row.textContent = t('popup.alreadyAdded');
  } else {
    row.classList.remove('muted');
    const left = el('div');
    const nameRow = el('div', 'org-name-row');
    const label = res.org.label || deriveLabelFromHost(new URL(res.org.instanceUrl).hostname);
    const orgNameEl = el('span', 'org-name', label);
    const status = res.sid ? 'active' : 'expired';
    orgNameEl.setAttribute('data-auth-status', status);
    nameRow.appendChild(orgNameEl);
    left.appendChild(nameRow);
    left.appendChild(el('div', 'org-meta', res.org.instanceUrl));
    const add = el('button', 'small', t('popup.add'));
    add.addEventListener('click', async () => {
      await bg({ type: 'addOrg', org: res.org });
      await refresh();
    });
    row.appendChild(left);
    row.appendChild(add);
  }
}

async function refresh() {
  const savedOrgs = await refreshSaved();
  await refreshDetected(savedOrgs);
}

async function loadOnboardingPrefs() {
  try {
    const r = await chrome.storage.local.get(ONBOARDING_PREFS_KEY);
    return normalizeOnboardingPrefs(r[ONBOARDING_PREFS_KEY]);
  } catch {
    return normalizeOnboardingPrefs(null);
  }
}

async function saveOnboardingPrefs(prefs) {
  try {
    await chrome.storage.local.set({ [ONBOARDING_PREFS_KEY]: prefs });
  } catch {
    /* ignore */
  }
}

function applyNoticeSeverity(banner, severity) {
  banner.classList.remove(
    'popup-telemetry-notice--info',
    'popup-telemetry-notice--warn',
    'popup-telemetry-notice--error'
  );
  const sev = severity === 'error' || severity === 'warn' ? severity : 'info';
  banner.classList.add(`popup-telemetry-notice--${sev}`);
}

/**
 * @param {HTMLElement} textEl
 * @param {string} text
 * @param {string} [url]
 */
function renderNoticeText(textEl, text, url) {
  textEl.textContent = text;
  const existingLink = textEl.parentElement?.querySelector('.popup-telemetry-notice-link');
  existingLink?.remove();
  if (!url || !textEl.parentElement) return;
  const link = document.createElement('a');
  link.className = 'popup-telemetry-notice-link';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = url;
  textEl.parentElement.appendChild(link);
}

async function setupPopupControls() {
  const banner = document.getElementById('popupTelemetryNotice');
  const dismissBtn = document.getElementById('popupTelemetryNoticeDismissBtn');
  const textEl = document.getElementById('popupTelemetryNoticeText');
  const openCodeBtn = document.getElementById('openCodeBtn');
  if (!banner || !dismissBtn || !textEl) return;

  const lang = getCurrentLang();
  const prefs = await loadOnboardingPrefs();
  const config = await loadPopupControlsFromPosthog(getPosthogClient());

  if (openCodeBtn) {
    const disabled = isOpenAppDisabled(config);
    openCodeBtn.disabled = disabled;
    if (disabled) {
      const tip = resolveOpenAppTooltip(config.openApp, lang);
      openCodeBtn.title = tip || t('popup.openAppDisabled');
    } else {
      openCodeBtn.title = t('popup.openCode');
    }
  }

  const prefsState = {
    dismissedFingerprint: prefs.popupNoticeDismissedFingerprint
  };

  /** @type {{ text: string, dismissLabel: string, severity: string, dismissible: boolean, url?: string, onDismiss: () => Promise<void> } | null} */
  let noticeSpec = null;

  if (isRemoteNoticeActive(config) && shouldShowRemoteNotice(config, prefsState)) {
    const notice = config.notice;
    if (notice) {
      const fingerprint = buildNoticeFingerprint(notice);
      noticeSpec = {
        text: resolveNoticeText(notice, lang),
        dismissLabel: resolveDismissLabelText(notice, lang) || t('popup.telemetryNotice.dismiss'),
        severity: notice.severity,
        dismissible: notice.dismissible,
        ...(notice.url ? { url: notice.url } : {}),
        onDismiss: async () => {
          if (notice.frequency === 'once') {
            const updated = markPopupNoticeDismissedInPrefs(await loadOnboardingPrefs(), fingerprint);
            await saveOnboardingPrefs(updated);
          }
        }
      };
    }
  }

  if (!noticeSpec?.text) return;

  renderNoticeText(textEl, noticeSpec.text, noticeSpec.url);
  applyNoticeSeverity(banner, noticeSpec.severity);
  banner.classList.remove('hidden');

  if (noticeSpec.dismissible) {
    dismissBtn.textContent = noticeSpec.dismissLabel;
    dismissBtn.setAttribute('aria-label', noticeSpec.dismissLabel);
    dismissBtn.classList.remove('hidden');
    dismissBtn.onclick = async () => {
      banner.classList.add('hidden');
      await noticeSpec.onDismiss();
    };
  } else {
    dismissBtn.classList.add('hidden');
    dismissBtn.onclick = null;
  }
}

function showOpenAppOverlay() {
  const overlay = document.getElementById('popupOpenOverlay');
  const text = document.getElementById('popupOpenOverlayText');
  if (!overlay) return;
  if (text) text.textContent = t('popup.openingApp');
  overlay.classList.remove('hidden');
  document.body.classList.add('popup-opening-app');
}

document.getElementById('openCodeBtn').addEventListener('click', async (e) => {
  const btn = /** @type {HTMLButtonElement | null} */ (e.currentTarget);
  if (btn?.disabled) {
    e.preventDefault();
    return;
  }
  showOpenAppOverlay();
  const lang = getCurrentLang();
  const url = chrome.runtime.getURL(`code/code.html?lang=${encodeURIComponent(lang)}`);
  await chrome.tabs.create({ url });
});

document.getElementById('openSettingsBtn')?.addEventListener('click', async () => {
  const url = chrome.runtime.getURL('popup/settings.html');
  await chrome.tabs.create({ url });
});

// Initialize
(async () => {
  await loadExtensionSettings();
  applyUiThemeToDocument(document);
  await loadLang();
  document.documentElement.lang = getCurrentLang() === 'en' ? 'en' : 'es';
  setupPopupLanguageSelect();
  applyStaticTranslations();
  setupPopupHelp();
  setupPopupWelcome();
  await initPosthogClient();
  await setupPopupControls();
  await refresh();
  await maybeShowPopupWelcome((window.__savedOrgs || []).length);
})();

function deriveLabelFromHost(host) {
  try {
    const sub = String(host || '').split('.')[0] || '';
    if (sub.includes('--')) {
      const sandbox = sub.split('--')[1] || '';
      const clean = sandbox.split('-')[0];
      return (clean || sandbox).toUpperCase();
    }
    return 'PROD';
  } catch {
    return 'ORG';
  }
}
