import { EXTENSION_DISPLAY_NAME, UPDATE_PAGE_URL } from '../code/core/constants.js';
import { t, loadLang, getCurrentLang } from '../shared/i18n.js';
import { sameGroupKey } from '../shared/orgPrefs.js';
import { loadExtensionSettings, applyUiThemeToDocument } from '../shared/extensionSettings.js';

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
  window.__savedOrgIds = new Set(orgs.map(o => o.id));
}

async function refreshDetected() {
  const row = document.getElementById('detectedRow');
  row.innerHTML = '';
  const res = await bg({ type: 'discoverActiveOrg' });
  if (!res.ok || !res.org) {
    row.classList.add('muted');
    row.textContent = t('popup.noDetectedTab');
    return;
  }
  if (window.__savedOrgIds && window.__savedOrgIds.has(res.org.id)) {
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
  await Promise.all([refreshSaved(), refreshDetected()]);
}

async function checkForExtensionUpdates() {
  try {
    const res = await bg({ type: 'version:getUpdateInfo' });
    if (!res || !res.ok) return;

    const banner = document.getElementById('updateBanner');
    const bannerText = document.getElementById('updateBannerText');
    const bannerBtn = document.getElementById('updateBannerButton');
    const blocker = document.getElementById('updateBlocker');
    const blockerText = document.getElementById('updateBlockerText');
    const blockerBtn = document.getElementById('updateBlockerButton');

    const lang = getCurrentLang();
    const targetUrl = res[`updateUrl_${lang}`] || res.updateUrl || UPDATE_PAGE_URL;
    const notes = res[`notes_${lang}`] || res.notes || '';
    const goToUpdatePage = () => {
      if (!targetUrl || !String(targetUrl).startsWith('https://')) return;
      chrome.tabs.create({ url: targetUrl });
    };

    if (res.status === 'majorUpdateRequired') {
      if (blocker && blockerText && blockerBtn) {
        blocker.classList.remove('hidden');

        const baseText = t('popup.majorUpdate', {
          remoteVersion: res.remoteVersion,
          extensionName: EXTENSION_DISPLAY_NAME,
          currentVersion: res.currentVersion
        });

        if (notes && typeof notes === 'string' && notes.trim()) {
          const notesSafe = notes
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          blockerText.innerHTML =
            `${baseText}<br><br><strong>${t('popup.changes')}</strong><br>${notesSafe}`;
        } else {
          blockerText.textContent = baseText;
        }

        blockerBtn.addEventListener('click', goToUpdatePage);
      }
      return;
    }

    if (res.status === 'minorUpdateAvailable') {
      if (banner && bannerText && bannerBtn) {
        banner.classList.remove('hidden');

        const baseText = t('popup.minorUpdate', {
          remoteVersion: res.remoteVersion,
          currentVersion: res.currentVersion
        });

        if (notes && typeof notes === 'string' && notes.trim()) {
          const notesSafe = notes
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          bannerText.innerHTML =
            `${baseText}<br><strong>${t('popup.changes')}</strong> ${notesSafe}`;
        } else {
          bannerText.textContent = baseText;
        }

        bannerBtn.addEventListener('click', goToUpdatePage);
      }
      return;
    }
  } catch {
    // Silenciar errores de red/parseo de actualización
  }
}

document.getElementById('openCodeBtn').addEventListener('click', async () => {
  const url = chrome.runtime.getURL('code/code.html');
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
  applyStaticTranslations();

  checkForExtensionUpdates();
  refresh();
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
