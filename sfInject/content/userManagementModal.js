import { createUserPermissionSelector } from './userPermissionSelector.js';
import { createUserLogsPanel } from './userLogsPanel.js';
import { createUserPublicGroupsPanel } from './userPublicGroupsPanel.js';
import { createUserManagementCache } from './userManagementCache.js';
import { userManagementCopy } from './userManagementStrings.js';
import { openUserLoginMenu } from './userLoginMenu.js';
import { element as el, button, icon, loading, errorPanel, message, formatUserDate } from './userManagementUi.js';
import { salesforcePermissionSetGroupPath, salesforcePermissionSetPath, salesforceSetupUserPath } from './userManagementUrls.js';
import { buildSfocQuickLinkUrl } from '../lib/quickLinkNavigation.js';

let sequence = 0;
const USER_PERMISSION_PRESETS_KEY = 'sfocUserPermissionPresetsV1';
const permissionPresetIds = (ids, prefix) => [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter((id) => new RegExp(`^${prefix}[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$`).test(id)))];
async function loadPermissionPresets(orgId) {
  try {
    const stored = await chrome.storage.local.get(USER_PERMISSION_PRESETS_KEY);
    const raw = stored?.[USER_PERMISSION_PRESETS_KEY]?.[String(orgId)];
    return (Array.isArray(raw) ? raw : []).map((preset) => ({
      name: String(preset?.name || '').trim().slice(0, 60),
      setIds: permissionPresetIds(preset?.setIds, '0PS'), groupIds: permissionPresetIds(preset?.groupIds, '0PG')
    })).filter((preset) => preset.name && (preset.setIds.length || preset.groupIds.length));
  } catch { return []; }
}
async function savePermissionPresets(orgId, presets) {
  try {
    const stored = await chrome.storage.local.get(USER_PERMISSION_PRESETS_KEY);
    const all = stored?.[USER_PERMISSION_PRESETS_KEY] && typeof stored[USER_PERMISSION_PRESETS_KEY] === 'object'
      ? { ...stored[USER_PERMISSION_PRESETS_KEY] } : {};
    all[String(orgId)] = presets;
    await chrome.storage.local.set({ [USER_PERMISSION_PRESETS_KEY]: all });
    return true;
  } catch { return false; }
}
export function openUserManagementModal(doc, options) {
  const { bridge, orgId, lang } = options;
  const copy = userManagementCopy(lang); const cache = options.cache || createUserManagementCache();
  const cachePrefix = orgId + ':' + options.user.id.slice(0, 15) + ':';
  let user = options.user; let activeTab = 'summary'; let closed = false; let menu = null;
  const originFocus = doc.activeElement; const uid = 'sfoc-um-' + ++sequence;
  const resources = new Map(); const views = new Map(); const generations = new Map();
  const palette = options.paletteRoot;
  const oldInert = palette?.inert; const oldHidden = palette?.getAttribute('aria-hidden');
  if (palette) { palette.inert = true; palette.setAttribute('aria-hidden', 'true'); }
  const root = el(doc, 'section', 'sfoc-user-modal-layer');
  const backdrop = el(doc, 'div', 'sfoc-user-modal-backdrop');
  const dialog = el(doc, 'div', 'sfoc-user-modal'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', uid + '-title');
  const header = el(doc, 'header', 'sfoc-um-header'); const avatar = el(doc, 'span', 'sfoc-um-avatar'); avatar.setAttribute('aria-hidden', 'true');
  const title = el(doc, 'div', 'sfoc-um-title');
  const nameRow = el(doc, 'div', 'sfoc-um-name-row'); const name = el(doc, 'h2'); name.id = uid + '-title';
  const badge = el(doc, 'span', 'sfoc-user-badge is-inactive', copy.inactive); nameRow.append(name, badge);
  const username = el(doc, 'p', 'sfoc-um-muted'); const context = el(doc, 'p', 'sfoc-um-header-context');
  title.append(nameRow, username, context);
  const actions = el(doc, 'div', 'sfoc-um-header-actions'); const noticeHost = el(doc, 'div', 'sfoc-um-messages');
  const announce = (text, kind = 'info') => { if (!closed) noticeHost.replaceChildren(message(doc, text, kind)); };
  const copyValue = async (text) => { try { await navigator.clipboard.writeText(text); announce(copy.copied, 'success'); } catch { announce(copy.errors.API_ERROR, 'error'); } };
  const copyId = button(doc, copy.copy + ' ' + copy.userId, 'copy', () => copyValue(user.id), { iconOnly: true });
  const openUser = button(doc, copy.open, 'open', () => { const path = salesforceSetupUserPath(user.id); if (path) doc.defaultView.open(path, '_blank', 'noopener,noreferrer'); }, { iconOnly: true });
  const login = button(doc, copy.loginAs, 'key', () => {
    if (menu && doc.querySelector('[data-sfoc-user-overlay="login"]')) { menu.close(); menu = null; return; }
    menu = openUserLoginMenu(doc, { trigger: login, user, orgId, bridge, copy, onMessage: announce });
  });
  login.setAttribute('aria-haspopup', 'menu'); login.setAttribute('aria-expanded', 'false');
  const closeButton = button(doc, copy.close, 'close', () => close(), { iconOnly: true });
  actions.append(copyId, openUser, login, closeButton); header.append(avatar, title, actions);
  const tabs = el(doc, 'div', 'sfoc-um-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', copy.user);
  const body = el(doc, 'div', 'sfoc-um-body'); const panels = new Map();
  const definitions = [['summary', copy.summary, 'user'], ['sets', copy.permissionSets, 'shield'], ['groups', copy.permissionGroups, 'group'], ['public', copy.publicGroups, 'globe'], ['logs', copy.logs, 'logs']];
  for (const [key, label, glyph] of definitions) {
    const tab = button(doc, label, glyph, () => selectTab(key));
    tab.className = 'sfoc-um-tab'; tab.id = uid + '-tab-' + key; tab.dataset.tab = key;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', uid + '-panel-' + key);
    const panel = el(doc, 'section', 'sfoc-um-tabpanel'); panel.id = uid + '-panel-' + key; panel.tabIndex = 0;
    panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
    tabs.append(tab); panels.set(key, panel); body.append(panel);
  }
  const loaders = {
    summary: () => bridge.details(orgId, user.id),
    sets: () => bridge.permissionSets(orgId, user.id),
    groups: () => bridge.permissionSetGroups(orgId, user.id),
    public: () => bridge.publicGroups(orgId, user.id),
    logs: () => bridge.traces(orgId, user.id)
  };
  function openUserEditDialog() {
    const dialog = el(doc, 'dialog', 'sfoc-um-edit-dialog');
    const form = el(doc, 'form', 'sfoc-um-edit-form');
    const title = el(doc, 'h3', '', copy.editUser);
    const fields = [
      ['Email', copy.email, user.email], ['Alias', copy.alias, user.alias],
      ['FederationIdentifier', copy.federation, user.federationIdentifier],
      ['LanguageLocaleKey', copy.language, user.language], ['LocaleSidKey', copy.locale, user.locale],
      ['TimeZoneSidKey', copy.timeZone, user.timeZone]
    ];
    form.appendChild(title);
    for (const [name, label, value] of fields) {
      const field = el(doc, 'label', 'sfoc-um-field', label);
      const input = el(doc, 'input', 'sfoc-um-input'); input.name = name; input.value = value || '';
      input.maxLength = name === 'Alias' ? 8 : name === 'Email' ? 80 : 512;
      field.appendChild(input); form.appendChild(field);
    }
    const actions = el(doc, 'div', 'sfoc-um-toolbar');
    const cancel = button(doc, copy.cancel, 'close', () => dialog.close());
    const save = button(doc, copy.save, 'check', () => {}, { variant: 'primary' });
    save.type = 'submit'; actions.append(cancel, save); form.append(actions); dialog.append(form); doc.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const next = Object.fromEntries(fields.map(([name]) => [name, String(form.elements[name]?.value || '').trim()]));
      const changed = Object.fromEntries(Object.entries(next).filter(([name, value]) => value !== String(user[{ Email: 'email', Alias: 'alias', FederationIdentifier: 'federationIdentifier', LanguageLocaleKey: 'language', LocaleSidKey: 'locale', TimeZoneSidKey: 'timeZone' }[name]] || '')));
      if (!Object.keys(changed).length) { dialog.close(); return; }
      save.disabled = true;
      const result = await bridge.updateUser(orgId, user.id, changed);
      if (!result?.ok) { save.disabled = false; announce(copy.errors[result?.reason] || copy.errors.API_ERROR, 'error'); return; }
      user = result.user || user; renderHeader(); resources.delete('summary'); render('summary'); dialog.close(); announce(copy.done, 'success');
    });
    dialog.showModal();
    form.querySelector('input')?.focus();
  }
  function openPasswordDialog() {
    const dialog = el(doc, 'dialog', 'sfoc-um-edit-dialog');
    const form = el(doc, 'form', 'sfoc-um-edit-form');
    const title = el(doc, 'h3', '', copy.setPassword);
    const hint = el(doc, 'p', 'sfoc-um-hint', copy.passwordHint);
    const password = el(doc, 'input', 'sfoc-um-input'); password.type = 'password'; password.name = 'password'; password.autocomplete = 'new-password'; password.minLength = 8;
    const confirmation = el(doc, 'input', 'sfoc-um-input'); confirmation.type = 'password'; confirmation.name = 'confirmation'; confirmation.autocomplete = 'new-password'; confirmation.minLength = 8;
    const passField = el(doc, 'label', 'sfoc-um-field', copy.password); passField.appendChild(password);
    const confirmField = el(doc, 'label', 'sfoc-um-field', copy.passwordConfirm); confirmField.appendChild(confirmation);
    const actions = el(doc, 'div', 'sfoc-um-toolbar'); const cancel = button(doc, copy.cancel, 'close', () => dialog.close()); const save = button(doc, copy.save, 'check', () => {}, { variant: 'danger' }); save.type = 'submit'; actions.append(cancel, save);
    form.append(title, hint, passField, confirmField, actions); dialog.append(form); doc.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (password.value.length < 8 || password.value !== confirmation.value) { announce(copy.passwordMismatch, 'error'); return; }
      save.disabled = true;
      const result = await bridge.setPassword(orgId, user.id, password.value);
      password.value = ''; confirmation.value = '';
      if (!result?.ok) { save.disabled = false; announce(copy.errors[result?.reason] || copy.errors.API_ERROR, 'error'); return; }
      dialog.close(); announce(copy.passwordChanged, 'success');
    });
    dialog.showModal(); password.focus();
  }
  function createPermissionPresetControls() {
    const card = el(doc, 'section', 'sfoc-um-card'); const title = el(doc, 'h3', 'sfoc-um-section-title'); title.append(icon(doc, 'shield'), doc.createTextNode(copy.permissionPresets));
    const select = el(doc, 'select', 'sfoc-um-input'); select.setAttribute('aria-label', copy.permissionPresets);
    const actions = el(doc, 'div', 'sfoc-um-toolbar'); const save = button(doc, copy.savePreset, 'plus', () => void saveCurrent()); const apply = button(doc, copy.applyPreset, 'check', () => void applyCurrent(), { variant: 'primary' });
    actions.append(save, apply); card.append(title, select, actions, el(doc, 'p', 'sfoc-um-hint', copy.permissionPresetsHint));
    let presets = [];
    const renderPresets = () => {
      select.replaceChildren();
      if (!presets.length) select.appendChild(el(doc, 'option', '', copy.noPermissionPresets));
      else for (const preset of presets) {
        const option = el(doc, 'option', '', `${preset.name} (${preset.setIds.length + preset.groupIds.length})`); option.value = preset.name; select.appendChild(option);
      }
      apply.disabled = !presets.length;
    };
    const refreshPresets = async () => { presets = await loadPermissionPresets(orgId); renderPresets(); };
    const saveCurrent = async () => {
      const name = String(doc.defaultView?.prompt(copy.permissionPresetName) || '').trim().slice(0, 60);
      if (!name) return;
      save.disabled = true;
      const [sets, groups] = await Promise.all([bridge.permissionSets(orgId, user.id), bridge.permissionSetGroups(orgId, user.id)]);
      save.disabled = false;
      if (!sets?.ok || !groups?.ok) { announce(copy.errors.API_ERROR, 'error'); return; }
      const preset = {
        name,
        setIds: permissionPresetIds((sets.assigned || []).filter((item) => item.direct && !item.profile).map((item) => item.id), '0PS'),
        groupIds: permissionPresetIds((groups.assigned || []).filter((item) => item.direct).map((item) => item.id), '0PG')
      };
      if (!preset.setIds.length && !preset.groupIds.length) { announce(copy.permissionPresetEmpty, 'warning'); return; }
      presets = [...presets.filter((item) => item.name !== name), preset];
      if (!await savePermissionPresets(orgId, presets)) { announce(copy.errors.API_ERROR, 'error'); return; }
      renderPresets(); select.value = name; announce(copy.permissionPresetSaved, 'success');
    };
    const applyCurrent = async () => {
      const preset = presets.find((item) => item.name === select.value); if (!preset) return;
      if (!doc.defaultView?.confirm(copy.applyPresetConfirm.replace('{name}', preset.name))) return;
      apply.disabled = true;
      const responses = await Promise.all([
        preset.setIds.length ? bridge.assignPermissionSets(orgId, user.id, preset.setIds) : { ok: true, results: [] },
        preset.groupIds.length ? bridge.assignGroups(orgId, user.id, preset.groupIds) : { ok: true, results: [] }
      ]);
      apply.disabled = false;
      for (const key of ['sets', 'groups']) { cache.invalidate(cachePrefix + key); generations.set(key, (generations.get(key) || 0) + 1); resources.delete(key); }
      if (activeTab === 'sets' || activeTab === 'groups') await load(activeTab);
      const partial = responses.some((response) => !response?.ok || response.partial);
      announce(partial ? copy.partial : copy.permissionPresetApplied, partial ? 'warning' : 'success');
    };
    void refreshPresets();
    return card;
  }
  function renderHeader() {
    avatar.textContent = (user.name || user.username || '?').slice(0, 1).toUpperCase();
    name.textContent = user.name || user.username || user.id; username.textContent = user.username || copy.unavailable;
    badge.hidden = user.isActive; login.disabled = !user.isActive; login.title = user.isActive ? copy.loginAs : copy.errors.USER_INACTIVE;
    context.replaceChildren(icon(doc, 'shield'), el(doc, 'span', '', user.profileName || copy.unavailable), icon(doc, 'group'), el(doc, 'span', '', user.roleName || copy.noRole));
  }
  function renderSummary() {
    const grid = el(doc, 'div', 'sfoc-um-summary');
    const date = (value) => formatUserDate(value, lang, copy.unavailable);
    const sections = [
      [copy.identity, 'user', [[copy.name, user.name], [copy.username, user.username, true], [copy.email, user.email, true], [copy.alias, user.alias], [copy.federation, user.federationIdentifier], [copy.userId, user.id, true]]],
      [copy.organization, 'shield', [[copy.profile, user.profileName], [copy.role, user.roleName], [copy.userType, user.userType], [copy.lastLogin, date(user.lastLoginDate)], [copy.created, date(user.createdDate)]]],
      [copy.preferences, 'globe', [[copy.language, user.language], [copy.locale, user.locale], [copy.timeZone, user.timeZone]]]
    ];
    for (const [heading, glyph, fields] of sections) {
      const card = el(doc, 'section', 'sfoc-um-card'); const h = el(doc, 'h3', 'sfoc-um-section-title'); h.append(icon(doc, glyph), doc.createTextNode(heading));
      const dl = el(doc, 'dl', 'sfoc-um-fields');
      for (const [label, value, canCopy] of fields) {
        const field = el(doc, 'div', 'sfoc-um-field'); const row = el(doc, 'dd', 'sfoc-um-value');
        row.append(el(doc, 'span', '', value || copy.unavailable));
        if (canCopy && value) row.append(button(doc, copy.copy + ': ' + label, 'copy', () => copyValue(value), { iconOnly: true }));
        field.append(el(doc, 'dt', '', label), row); dl.append(field);
      }
      card.append(h, dl); grid.append(card);
    }
    const admin = el(doc, 'section', 'sfoc-um-card'); const adminTitle = el(doc, 'h3', 'sfoc-um-section-title'); adminTitle.append(icon(doc, 'shield'), doc.createTextNode(copy.administration));
    const adminActions = el(doc, 'div', 'sfoc-um-toolbar sfoc-um-admin-actions');
    adminActions.append(
      button(doc, copy.editUser, 'user', openUserEditDialog),
      button(doc, copy.setPassword, 'key', openPasswordDialog, { variant: 'danger' }),
      button(doc, copy.analyzePermissions, 'shield', async () => {
        const result = await bridge.openPermissionAnalysis(orgId, user.id);
        if (!result?.ok) announce(copy.errors[result?.reason] || copy.errors.API_ERROR, 'error');
      }, { variant: 'primary' })
    );
    admin.append(adminTitle, adminActions, el(doc, 'p', 'sfoc-um-hint', copy.securityTokenHint)); grid.append(admin, createPermissionPresetControls());
    return grid;
  }
  async function load(key, force = false) {
    if (closed) return;
    const state = resources.get(key);
    if (!force && (state?.status === 'loading' || state?.status === 'ready')) return;
    if (force) cache.invalidate(cachePrefix + key);
    const generation = (generations.get(key) || 0) + 1; generations.set(key, generation);
    resources.set(key, { status: 'loading', data: state?.data }); render(key);
    try {
      const data = await cache.get(cachePrefix + key, async () => {
        const res = await loaders[key](); if (!res?.ok) throw Object.assign(new Error(), { reason: res?.reason || 'API_ERROR' }); return res;
      });
      if (closed || generations.get(key) !== generation) return;
      resources.set(key, { status: 'ready', data });
      if (key === 'summary') { user = data.user; renderHeader(); }
    } catch (error) {
      if (closed || generations.get(key) !== generation) return;
      resources.set(key, { status: 'error', reason: error.reason || 'API_ERROR' });
    }
    render(key);
  }
  async function permissionMutation(key, remove, ids) {
    const fn = key === 'groups' ? (remove ? bridge.removeGroups : bridge.assignGroups) : (remove ? bridge.removePermissionSets : bridge.assignPermissionSets);
    const result = await fn(orgId, user.id, ids);
    if (closed) return result;
    if (result?.ok) {
      for (const related of ['sets', 'groups']) { cache.invalidate(cachePrefix + related); generations.set(related, (generations.get(related) || 0) + 1); resources.delete(related); }
      await load(key);
      if (activeTab !== key && ['sets', 'groups'].includes(activeTab)) await load(activeTab);
    }
    return result;
  }
  async function traceMutation(fn) {
    const result = await fn();
    if (result?.ok && !closed) await load('logs', true);
    return result;
  }
  function render(key) {
    if (closed) return;
    const panel = panels.get(key); const state = resources.get(key);
    if (key === 'summary') {
      panel.replaceChildren(renderSummary());
      if (state?.status === 'error') panel.prepend(errorPanel(doc, copy, state.reason, () => load(key, true)));
      return;
    }
    if (!state || state.status === 'loading') {
      if (!views.has(key)) panel.replaceChildren(loading(doc, copy));
      return;
    }
    if (state.status === 'error') { panel.replaceChildren(errorPanel(doc, copy, state.reason, () => load(key, true))); return; }
    const data = state.data;
    if (key === 'sets' || key === 'groups') {
      if (!views.has(key)) views.set(key, createUserPermissionSelector({
        document: doc, copy, assigned: data.assigned,
        openPath: key === 'groups' ? salesforcePermissionSetGroupPath : salesforcePermissionSetPath,
        search: ({ query, cursor }) => bridge.availablePermissions(orgId, user.id, key, query, cursor),
        onRefresh: () => load(key, true),
        assign: (ids) => permissionMutation(key, false, ids), remove: (ids) => permissionMutation(key, true, ids)
      }));
      else views.get(key).update(data.assigned, data.partial);
      if (data.partial) announce(copy.partialData, 'warning');
    }
    if (key === 'public') views.set(key, createUserPublicGroupsPanel(doc, data, copy));
    if (key === 'logs') {
      if (!views.has(key)) views.set(key, createUserLogsPanel(doc, data, copy, {
        activate: (debugLevelId, minutes) => traceMutation(() => bridge.createTrace(orgId, user.id, { debugLevelId, minutes })),
        renew: (minutes) => traceMutation(() => bridge.extendTrace(orgId, user.id, resources.get('logs').data.trace.id, minutes)),
        changeLevel: (debugLevelId) => traceMutation(() => bridge.updateTrace(orgId, user.id, { traceFlagId: resources.get('logs').data.trace.id, debugLevelId })),
        remove: () => traceMutation(() => bridge.deleteTrace(orgId, user.id, resources.get('logs').data.trace.id)),
        refresh: () => load(key, true),
        openLogsPath: buildSfocQuickLinkUrl('DebugLogBrowser', orgId)
      }, lang));
      else views.get(key).update(data);
    }
    const view = views.get(key);
    if (panel.firstChild !== view.element) panel.replaceChildren(view.element);
  }
  function selectTab(key) {
    activeTab = key;
    for (const tab of tabs.children) { const selected = tab.dataset.tab === key; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; }
    for (const [name, panel] of panels) panel.hidden = name !== key;
    void load(key);
  }
  function close() {
    if (closed) return; closed = true; menu?.close(false); for (const view of views.values()) view.destroy?.();
    doc.removeEventListener('keydown', onKey, true); root.remove();
    if (palette) { palette.inert = !!oldInert; if (oldHidden == null) palette.removeAttribute('aria-hidden'); else palette.setAttribute('aria-hidden', oldHidden); }
    options.onClose?.(); if (originFocus?.isConnected) originFocus.focus();
  }
  function onKey(e) {
    if (doc.querySelector('[data-sfoc-user-overlay="login"]')) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!views.get(activeTab)?.escape?.()) close();
      return;
    }
    if (e.target.closest?.('[role="tablist"]') === tabs && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const keys = definitions.map(([key]) => key);
      const index = e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : (keys.indexOf(activeTab) + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length;
      selectTab(keys[index]); tabs.querySelector('[data-tab="' + keys[index] + '"]').focus();
    }
    if (e.key === 'Tab') {
      const nodes = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary, [tabindex="0"]')].filter((n) => !n.closest('[hidden]') && n.getClientRects().length);
      const first = nodes[0]; const last = nodes.at(-1);
      if (e.shiftKey && (doc.activeElement === first || !dialog.contains(doc.activeElement))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (doc.activeElement === last || !dialog.contains(doc.activeElement))) { e.preventDefault(); first?.focus(); }
    }
  }
  const refresh = button(doc, copy.refresh, 'refresh', () => load(activeTab, true), { iconOnly: true }); actions.insertBefore(refresh, closeButton);
  backdrop.addEventListener('click', close);
  dialog.append(header, tabs, noticeHost, body); root.append(backdrop, dialog); doc.body.append(root);
  doc.addEventListener('keydown', onKey, true);
  renderHeader(); selectTab('summary'); render('summary');
  requestAnimationFrame(() => { if (!closed) closeButton.focus(); });
  return { close };
}
