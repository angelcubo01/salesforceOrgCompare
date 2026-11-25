import { SETUP_PALETTE_PAGES } from './setupPaletteCatalog.js';
import { isQuickLinksSalesforcePage } from './matchers/quickLinksPages.js';
import { SFOC_TOOL_MODES, buildCustomQuickLinkUrl } from '../lib/quickLinkNavigation.js';
import { setupPaletteUsersBridge, sfInjectSend } from './bridge.js';
import { openUserManagementModal } from './userManagementModal.js';
import { createUserManagementCache } from './userManagementCache.js';
import { openUserLoginMenu } from './userLoginMenu.js';
import { userManagementCopy } from './userManagementStrings.js';
import { salesforceSetupUserPath } from './userManagementUrls.js';
import { isModeVisible, isToolVisible, parseFeatureControlsPayload } from '../../shared/featureControls.js';
import {
  FEATURE_CONTROLS_STORAGE_KEY,
  readFeatureControlsCache
} from '../../shared/featureControlsCache.js';
import {
  DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT,
  filterSetupCommandPaletteEntries,
  isSetupCommandPaletteShortcut
} from './setupCommandPaletteUtils.js';

export const INTEGRATION_ID = 'setupCommandPalette';
const ROOT_ID = 'sfoc-setup-command-palette';
const MAX_RESULTS = 60;

const COPY = Object.freeze({
  es: {
    title: 'Paleta de configuración Salesforce',
    search: 'Buscar Setup, Quick links, herramientas, scripts o ficheros…',
    searchLabel: 'Buscar en la paleta de configuración Salesforce',
    hint: '↑↓ navegar · Enter abrir · Esc cerrar',
    noResults: 'No hay resultados.', loadingFiles: 'Buscando ficheros del entorno…',
    setup: 'Setup Salesforce',
    users: 'Usuarios', active: 'Activo', inactive: 'Inactivo', openUser: 'Abrir usuario', loginAs: 'Login As', viewUser: 'Ver usuario',
    loginCurrent: 'Login As en esta pestaña', loginNew: 'Login As en una nueva pestaña', loginIncognito: 'Login As en incógnito',
    summary: 'Resumen', permissionSets: 'Permission Sets', permissionGroups: 'Permission Set Groups', logs: 'Logs', close: 'Cerrar', copyId: 'Copiar ID', copied: 'Copiado.',
    name: 'Nombre', username: 'Username', email: 'Email', alias: 'Alias', federation: 'Federation Identifier', profile: 'Perfil', role: 'Rol', userType: 'Tipo de usuario', language: 'Idioma', locale: 'Configuración regional', timeZone: 'Zona horaria', lastLogin: 'Último acceso', created: 'Creado', userId: 'User ID',
    available: 'Disponibles', assigned: 'Asignados', filter: 'Filtrar', assign: 'Asignar →', remove: '← Retirar', direct: 'Directo', inherited: 'Heredado por grupo', empty: 'No hay elementos.', loading: 'Cargando…', done: 'Actualizado.', partial: 'Actualización parcial; revisa los elementos.', confirmRemove: '¿Quieres retirar las asignaciones seleccionadas?',
    debugLevel: 'Debug Level', expires: 'Expira', activate: 'Activar logs', renew: 'Renovar', changeLevel: 'Cambiar Debug Level', deactivate: 'Desactivar', openLogs: 'Abrir Debug Logs', trace_none: 'Logs no configurados', trace_active: 'Logs activos', trace_soon: 'Los logs caducan pronto', trace_expired: 'Logs caducados', unavailable: 'No disponible', error: 'No se pudo completar la operación.', incognitoAuth: 'Si Salesforce solicita autenticación en incógnito, inicia sesión como administrador y Login As continuará automáticamente.', INCOGNITO_NOT_ENABLED: 'Activa «Permitir en incógnito» en la configuración de la extensión.', USER_INACTIVE: 'Login As no está disponible para un usuario inactivo.',
    quickLinks: 'Quick links del entorno', tools: 'Herramientas SFOC', scripts: 'Scripts',
    savedScripts: 'Scripts Apex guardados', savedFiles: 'Ficheros del entorno',
    openInNewTab: 'Abrir en una nueva pestaña', anonymousApex: 'Abrir Anonymous Apex en SFOC'
  },
  en: {
    title: 'Salesforce Setup palette',
    search: 'Search Setup, Quick links, tools, scripts, or files…',
    searchLabel: 'Search Salesforce Setup palette',
    hint: '↑↓ navigate · Enter open · Esc close',
    noResults: 'No results.', loadingFiles: 'Searching environment files…',
    setup: 'Salesforce Setup',
    users: 'Users', active: 'Active', inactive: 'Inactive', openUser: 'Open user', loginAs: 'Login As', viewUser: 'View user',
    loginCurrent: 'Login As in this tab', loginNew: 'Login As in a new tab', loginIncognito: 'Login As in incognito',
    summary: 'Summary', permissionSets: 'Permission Sets', permissionGroups: 'Permission Set Groups', logs: 'Logs', close: 'Close', copyId: 'Copy ID', copied: 'Copied.',
    name: 'Name', username: 'Username', email: 'Email', alias: 'Alias', federation: 'Federation Identifier', profile: 'Profile', role: 'Role', userType: 'User type', language: 'Language', locale: 'Locale', timeZone: 'Time zone', lastLogin: 'Last login', created: 'Created', userId: 'User ID',
    available: 'Available', assigned: 'Assigned', filter: 'Filter', assign: 'Assign →', remove: '← Remove', direct: 'Direct', inherited: 'Inherited from group', empty: 'No items.', loading: 'Loading…', done: 'Updated.', partial: 'Partial update; review the items.', confirmRemove: 'Remove the selected assignments?',
    debugLevel: 'Debug Level', expires: 'Expires', activate: 'Enable logs', renew: 'Renew', changeLevel: 'Change Debug Level', deactivate: 'Disable', openLogs: 'Open Debug Logs', trace_none: 'Logs not configured', trace_active: 'Logs active', trace_soon: 'Logs expire soon', trace_expired: 'Logs expired', unavailable: 'Unavailable', error: 'The operation could not be completed.', incognitoAuth: 'If Salesforce requests authentication in incognito, sign in as an administrator and Login As will continue automatically.', INCOGNITO_NOT_ENABLED: 'Enable “Allow in incognito” in the extension settings.', USER_INACTIVE: 'Login As is unavailable for an inactive user.',
    quickLinks: 'Environment Quick links', tools: 'SFOC tools', scripts: 'Scripts',
    savedScripts: 'Saved Apex scripts', savedFiles: 'Environment files',
    openInNewTab: 'Open in a new tab', anonymousApex: 'Open Anonymous Apex in SFOC'
  }
});

function copyFor(lang) {
  return COPY[lang === 'en' ? 'en' : 'es'];
}

function humanize(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
}

function setupEntries(copy) {
  return SETUP_PALETTE_PAGES.flatMap((item) => {
    const path = String(item?.path || '');
    const label = String(item?.label || '').trim();
    if (!path || !label) return [];
    return [{
      kind: 'setup', order: 3, group: copy.setup, label, detail: path, path
    }];
  });
}

/**
 * Las herramientas de la paleta deben respetar los mismos controles remotos
 * que la navegaciÃ³n de SFOC. Mientras se hidrata la cachÃ© no se exponen
 * herramientas: asÃ­ una herramienta oculta nunca aparece fugazmente.
 *
 * @param {import('../../shared/featureControls.js').FeatureControlsConfig | null} config
 */
export function getVisibleSetupPaletteToolIds(config) {
  if (!config) return [];
  return Object.keys(SFOC_TOOL_MODES).filter((toolId) =>
    isModeVisible(config, SFOC_TOOL_MODES[toolId]) && isToolVisible(config, toolId)
  );
}

function sfocEntries(copy, featureControls) {
  return getVisibleSetupPaletteToolIds(featureControls).map((toolId) => ({
    kind: 'tool', order: 2, group: copy.tools, label: humanize(toolId), detail: toolId, toolId
  }));
}

function quickLinkEntries(copy, links) {
  return (Array.isArray(links) ? links : []).flatMap((link) => {
    if (!link || typeof link !== 'object') return [];
    if (link.type === 'sfoc') return [];
    const label = String(link.label || '').trim();
    if (!label) return [];
    const path = String(link.url || '');
    return buildCustomQuickLinkUrl(path) ? [{ kind: 'setup', order: 0, group: copy.quickLinks, label, detail: path, path }] : [];
  });
}

function scriptEntries(copy, scripts = [], featureControls) {
  if (!getVisibleSetupPaletteToolIds(featureControls).includes('AnonymousApex')) return [];
  const saved = (Array.isArray(scripts) ? scripts : []).map((script) => ({
    kind: 'script', order: 1, group: copy.savedScripts, label: script.name || 'script', detail: 'Anonymous Apex', scriptId: script.id
  })).filter((script) => script.scriptId);
  return saved.length ? saved : [{
    kind: 'tool', order: 1, group: copy.scripts, label: copy.savedScripts,
    detail: copy.anonymousApex, toolId: 'AnonymousApex'
  }];
}

function createResultIcon(doc, entry) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('sfoc-setup-palette-result-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  const order = Number(entry.order);
  if (order === 0) path.setAttribute('d', 'M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1');
  else if (order === 1) path.setAttribute('d', 'M8 9l-3 3 3 3M16 9l3 3-3 3M14 5l-4 14');
  else if (order === 2) path.setAttribute('d', 'M14.7 6.3a5 5 0 0 0-6 6L3 18l3 3 5.7-5.7a5 5 0 0 0 6-6L14 13l-3-3z');
  else if (order === 3) path.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5');
  else if (order === 9) path.setAttribute('d', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21a7.5 7.5 0 0 1 15 0');
  else path.setAttribute('d', 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.2 2.2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3.2v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L6.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5v-3.2h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.2-2.2.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V4h3.2v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.2 2.2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.5 1z');
  svg.appendChild(path);
  return svg;
}

function resultCategory(entry) {
  const order = Number(entry.order);
  if (order === 0) return 'quick-links';
  if (order === 1) return 'saved-scripts';
  if (order === 2) return 'tools';
  if (order === 4) return 'files';
  return 'setup';
}

function createOption(doc, entry, active, onSelect, copy) {
  const row = doc.createElement('div');
  row.className = 'sfoc-setup-palette-option';
  row.classList.add(`sfoc-setup-palette-option--${resultCategory(entry)}`);
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', active ? 'true' : 'false');
  if (active) row.classList.add('is-active');
  const option = doc.createElement('button');
  option.type = 'button';
  option.className = 'sfoc-setup-palette-option-main';
  const group = doc.createElement('span');
  group.className = 'sfoc-setup-palette-option-group';
  group.textContent = entry.group;
  const label = doc.createElement('strong');
  label.textContent = entry.label;
  const content = doc.createElement('span');
  content.className = 'sfoc-setup-palette-option-content';
  content.append(group, label);
  option.append(createResultIcon(doc, entry), content);
  option.addEventListener('click', () => onSelect(entry));
  const openNewTab = doc.createElement('button');
  openNewTab.type = 'button';
  openNewTab.className = 'sfoc-setup-palette-open-new-tab';
  openNewTab.title = copy.openInNewTab;
  openNewTab.setAttribute('aria-label', `${copy.openInNewTab}: ${entry.label}`);
  openNewTab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5"/></svg>';
  openNewTab.addEventListener('click', () => onSelect(entry, true));
  row.append(option, openNewTab);
  return row;
}

function userEntry(user, copy) {
  return { kind: 'user', order: -1, group: copy.users, label: user.name || user.username, detail: `${user.username || ''} ${user.email || ''} ${user.profileName || ''} ${user.roleName || ''}`, searchLabel: user.name || user.username, user };
}

function createUserOption(doc, entry, active, handlers, copy) {
  const user = entry.user; const row = doc.createElement('div');
  row.className = `sfoc-setup-palette-option sfoc-setup-palette-user${user.isActive ? '' : ' is-inactive'}${active ? ' is-active' : ''}`;
  row.setAttribute('role', 'option'); row.setAttribute('aria-selected', active ? 'true' : 'false');
  const info = doc.createElement('div'); info.className = 'sfoc-setup-palette-user-info';
  info.append(createResultIcon(doc, { order: 9 }));
  const text = doc.createElement('span'); text.className = 'sfoc-setup-palette-option-content';
  const group = doc.createElement('span'); group.className = 'sfoc-setup-palette-option-group'; group.textContent = copy.users;
  const nameRow = doc.createElement('span'); nameRow.className = 'sfoc-setup-palette-user-name-row';
  const label = doc.createElement('strong'); label.textContent = user.name || user.username || user.id;
  nameRow.append(label);
  if (!user.isActive) {
    const status = doc.createElement('span'); status.className = 'sfoc-user-badge is-inactive'; status.textContent = copy.inactive;
    nameRow.appendChild(status);
  }
  text.append(group, nameRow); info.append(text);
  const actions = doc.createElement('div'); actions.className = 'sfoc-setup-palette-user-actions';
  const icon = (type) => {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', type === 'open' ? 'M14 5h5v5M19 5l-8 8M18 14v5H5V6h5' : type === 'login' ? 'M13 5l5 7-5 7M18 12H7M4 5v14' : 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21a7.5 7.5 0 0 1 15 0');
    svg.appendChild(path); return svg;
  };
  const button = (label, type, action) => { const b = doc.createElement('button'); b.type = 'button'; b.className = 'sfoc-setup-palette-user-action'; b.appendChild(icon(type)); b.title = `${label}: ${user.name || user.username}`; b.setAttribute('aria-label', b.title); b.addEventListener('click', (event) => { event.stopPropagation(); action(); }); return b; };
  const open = button(copy.openUser, 'open', () => handlers.open(user));
  const login = button(copy.loginAs, 'login', () => handlers.toggleLogin(user, login)); login.setAttribute('aria-haspopup', 'menu'); login.setAttribute('aria-expanded', 'false');
  const view = button(copy.viewUser, 'view', () => handlers.view(user, view));
  actions.append(open, login, view); row.append(info, actions); return row;
}

async function loadExtraEntries(ctx, copy) {
  try {
    const result = await sfInjectSend({ type: 'sfInject:getSetupCommandPaletteFiles', orgId: ctx.orgId });
    return {
      files: (Array.isArray(result?.files) ? result.files : []).map((file) => ({
      kind: 'file', order: 4, group: copy.savedFiles, label: `${file.typeLabel || file.type} > ${file.label}`,
      detail: file.type, searchLabel: file.label, type: file.type, key: file.key, bundleId: file.bundleId
      })),
      scripts: Array.isArray(result?.scripts) ? result.scripts : []
    };
  } catch {
    return { files: [], scripts: [] };
  }
}

function createPalette(doc, ctx) {
  const copy = copyFor(ctx.lang);
  const root = doc.createElement('section');
  root.id = ROOT_ID;
  root.className = 'sfoc-setup-palette';
  root.setAttribute('aria-hidden', 'true');
  const backdrop = doc.createElement('div');
  backdrop.className = 'sfoc-setup-palette-backdrop';
  const dialog = doc.createElement('div');
  dialog.className = 'sfoc-setup-palette-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', copy.title);
  const searchRow = doc.createElement('div');
  searchRow.className = 'sfoc-setup-palette-search-row';
  const appIcon = doc.createElement('img');
  appIcon.className = 'sfoc-setup-palette-app-icon';
  appIcon.src = chrome.runtime.getURL('icons/icon-512.png');
  appIcon.alt = '';
  appIcon.setAttribute('aria-hidden', 'true');
  const input = doc.createElement('input');
  input.type = 'search';
  input.className = 'sfoc-setup-palette-input';
  input.placeholder = copy.search;
  input.setAttribute('aria-label', copy.searchLabel);
  input.setAttribute('autocomplete', 'off');
  const hint = doc.createElement('p');
  hint.className = 'sfoc-setup-palette-hint';
  hint.textContent = `${copy.hint} · ${ctx.shortcut || DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT}`;
  const results = doc.createElement('div');
  results.className = 'sfoc-setup-palette-results';
  results.setAttribute('role', 'listbox');
  results.setAttribute('aria-live', 'polite');
  searchRow.append(appIcon, input);
  dialog.append(searchRow, results, hint);
  root.append(backdrop, dialog);
  doc.body.appendChild(root);

  let featureControls = null;
  let destroyed = false;
  let entries = [...quickLinkEntries(copy, ctx.quickLinks), ...scriptEntries(copy, [], featureControls), ...sfocEntries(copy, featureControls), ...setupEntries(copy)];
  let matches = [];
  let activeIndex = 0;
  let previousFocus = null;
  let open = false;
  let fileEntries = [];
  let savedScripts = [];
  let fileSearchTimer = null;
  let fileSearchGeneration = 0;
  let filesLoading = false;
  let userSearchTimer = null;
  let userSearchGeneration = 0;
  let userEntries = [];
  let usersLoading = false;
  let loginMenu = null;
  let userModal = null;
  const userCache = createUserManagementCache();

  const rebuildEntries = () => {
    entries = [
      ...quickLinkEntries(copy, ctx.quickLinks),
      ...scriptEntries(copy, savedScripts, featureControls),
      ...sfocEntries(copy, featureControls),
      ...setupEntries(copy),
      ...fileEntries
    ];
  };

  const close = () => {
    if (!open) return;
    open = false;
    root.classList.remove('is-open');
    loginMenu?.close(false); loginMenu = null;
    userModal?.close(); userModal = null;
    userCache.clear();
    ++userSearchGeneration; ++fileSearchGeneration;
    clearTimeout(userSearchTimer); clearTimeout(fileSearchTimer);
    root.setAttribute('aria-hidden', 'true');
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  };
  const select = async (entry, openInNewTab = false) => {
    if (entry.kind === 'user') {
      const path = salesforceSetupUserPath(entry.user?.id);
      if (path) window.open(path, '_blank', 'noopener,noreferrer');
      return;
    }
    close();
    if (entry.kind === 'setup') {
      const url = buildCustomQuickLinkUrl(entry.path);
      if (openInNewTab) window.open(url, '_blank', 'noopener,noreferrer');
      else location.assign(url);
      return;
    }
    try {
      await sfInjectSend({
        type: 'sfInject:openSetupCommandPaletteTarget', orgId: ctx.orgId,
        target: entry.kind, toolId: entry.toolId, itemType: entry.type, itemKey: entry.key,
        scriptId: entry.scriptId, bundleId: entry.bundleId, openInNewTab
      });
    } catch {
      ctx.onError?.(ctx.lang === 'en'
        ? 'The selected item could not be opened in SFOC.'
        : 'No se pudo abrir el elemento seleccionado en SFOC.');
    }
  };
  const render = () => {
    if (userModal) return;
    if (!input.value.trim()) {
      matches = [];
      activeIndex = 0;
      results.replaceChildren();
      return;
    }
    const generic = filterSetupCommandPaletteEntries(entries, input.value, MAX_RESULTS);
    matches = [...generic, ...userEntries].slice(0, MAX_RESULTS);
    activeIndex = Math.min(activeIndex, Math.max(0, matches.length - 1));
    results.replaceChildren();
    const appendLoading = () => {
      const loading = doc.createElement('p');
      loading.className = 'sfoc-setup-palette-loading';
      const spinner = doc.createElement('span');
      spinner.className = 'sfoc-setup-palette-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      loading.append(spinner, doc.createTextNode(copy.loadingFiles));
      results.appendChild(loading);
    };
    if (!matches.length) {
      if (filesLoading || usersLoading) {
        appendLoading();
        return;
      }
      const empty = doc.createElement('p');
      empty.className = 'sfoc-setup-palette-empty';
      empty.textContent = copy.noResults;
      results.appendChild(empty);
      return;
    }
    const userHandlers = {
      open: (user) => { const path = salesforceSetupUserPath(user.id); if (path) window.open(path, '_blank', 'noopener,noreferrer'); },
      view: (user) => {
        loginMenu?.close(false); loginMenu = null;
        if (userModal) return;
        userModal = openUserManagementModal(doc, {
          user, bridge: setupPaletteUsersBridge, orgId: ctx.orgId, lang: ctx.lang,
          cache: userCache, paletteRoot: root, onClose: () => { userModal = null; }
        });
      },
      toggleLogin: (user, trigger) => {
        loginMenu?.close(false);
        loginMenu = openUserLoginMenu(doc, {
          trigger, user, orgId: ctx.orgId, bridge: setupPaletteUsersBridge, copy: userManagementCopy(ctx.lang),
          onMessage: (text, kind) => kind === 'error' ? ctx.onError?.(text) : ctx.onSuccess?.(text)
        });
      }
    };
    matches.forEach((entry, index) => results.appendChild(entry.kind === 'user' ? createUserOption(doc, entry, index === activeIndex, userHandlers, copy) : createOption(doc, entry, index === activeIndex, select, copy)));
    if (filesLoading || usersLoading) appendLoading();
  };
  const show = () => {
    if (open) return close();
    previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    open = true;
    if (fileSearchTimer) clearTimeout(fileSearchTimer);
    if (userSearchTimer) clearTimeout(userSearchTimer);
    fileSearchGeneration++;
    userSearchGeneration++;
    userEntries = []; usersLoading = false;
    filesLoading = false;
    fileEntries = [];
    rebuildEntries();
    activeIndex = 0;
    input.value = '';
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    render();
    requestAnimationFrame(() => input.focus());
  };
  const searchFiles = () => {
    const query = input.value.trim();
    const generation = ++fileSearchGeneration;
    if (fileSearchTimer) clearTimeout(fileSearchTimer);
    if (userSearchTimer) clearTimeout(userSearchTimer);
    if (!query) {
      filesLoading = false;
      fileEntries = [];
      rebuildEntries();
      return;
    }
    filesLoading = true;
    fileSearchTimer = setTimeout(async () => {
      const result = await sfInjectSend({
        type: 'sfInject:searchSetupCommandPaletteFiles', orgId: ctx.orgId, query
      }).catch(() => null);
      if (generation !== fileSearchGeneration) return;
      filesLoading = false;
      fileEntries = (Array.isArray(result?.files) ? result.files : []).map((file) => ({
        kind: 'file', order: 4, group: copy.savedFiles, label: `${file.typeLabel || file.type} > ${file.label}`,
        detail: file.type, searchLabel: file.label, type: file.type, key: file.key, bundleId: file.bundleId
      }));
      rebuildEntries();
      if (open) render();
    }, 220);
  };
  const searchUsers = () => {
    const query = input.value.trim().slice(0, 100); const generation = ++userSearchGeneration;
    if (userSearchTimer) clearTimeout(userSearchTimer);
    userEntries = [];
    if (query.length < 2 && !/^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(query)) { usersLoading = false; return; }
    usersLoading = true;
    userSearchTimer = setTimeout(async () => {
      const result = await setupPaletteUsersBridge.search(ctx.orgId, query);
      if (generation !== userSearchGeneration || !open) return;
      usersLoading = false; userEntries = Array.isArray(result?.users) ? result.users.map((user) => userEntry(user, copy)) : [];
      render();
    }, 250);
  };
  input.addEventListener('input', () => { activeIndex = 0; searchFiles(); searchUsers(); render(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'ArrowDown' && matches.length) { event.preventDefault(); activeIndex = Math.min(activeIndex + 1, matches.length - 1); render(); }
    if (event.key === 'ArrowUp' && matches.length) { event.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); render(); }
    if (event.key === 'Enter' && matches[activeIndex]) { event.preventDefault(); void select(matches[activeIndex]); }
  });
  backdrop.addEventListener('click', close);
  const onKeyDown = (event) => {
    if (userModal || doc.querySelector('[data-sfoc-user-overlay="login"]')) return;
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
    if (!isSetupCommandPaletteShortcut(event, ctx.shortcut)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    show();
  };
  doc.addEventListener('keydown', onKeyDown, true);
  void loadExtraEntries(ctx, copy).then(({ scripts }) => {
    savedScripts = scripts;
    rebuildEntries();
    if (open) render();
  });
  void readFeatureControlsCache().then((config) => {
    if (destroyed) return;
    featureControls = config;
    rebuildEntries();
    if (open) render();
  });
  const onFeatureControlsStorageChange = (changes, areaName) => {
    if (destroyed || areaName !== 'local' || !changes[FEATURE_CONTROLS_STORAGE_KEY]) return;
    featureControls = parseFeatureControlsPayload(changes[FEATURE_CONTROLS_STORAGE_KEY].newValue);
    rebuildEntries();
    if (open) render();
  };
  chrome.storage?.onChanged?.addListener(onFeatureControlsStorageChange);
  return () => {
    close();
    destroyed = true;
    if (fileSearchTimer) clearTimeout(fileSearchTimer);
    if (userSearchTimer) clearTimeout(userSearchTimer);
    doc.removeEventListener('keydown', onKeyDown, true);
    chrome.storage?.onChanged?.removeListener(onFeatureControlsStorageChange);
    root.remove();
  };
}

function isParentPageActive() {
  try { return isQuickLinksSalesforcePage(window.top.location.href); } catch { return isQuickLinksSalesforcePage(location.href); }
}

export const setupCommandPaletteIntegration = {
  id: INTEGRATION_ID,
  isParentPageActive,
  isFrameRelevant: () => window.top === window,
  mount(doc, ctx) {
    return createPalette(doc, {
      ...ctx,
      shortcut: ctx.prefs?.setupCommandPaletteShortcut || DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT
    });
  }
};
