import { isQuickLinksSalesforcePage } from '../matchers/quickLinksPages.js';
import { mountDebouncedDomObserver } from './observer.js';
import { sfInjectSend } from '../bridge.js';
import {
  buildCustomQuickLinkUrl,
  buildSfocQuickLinkUrl
} from '../../lib/quickLinkNavigation.js';
import { SFOC_QUICK_LINK_ICON_PATHS, resolveQuickLinkIcon } from '../../lib/quickLinkIcons.js';
import { recordIdFromSalesforceUrl } from '../../../shared/recordViewerCore.js';

export { buildCustomQuickLinkUrl, buildSfocQuickLinkUrl } from '../../lib/quickLinkNavigation.js';

export const INTEGRATION_ID = 'quickLinks';
const INJECT_SELECTOR = `[data-sfoc-inject="${INTEGRATION_ID}"]`;
const RECORD_QUICK_ACTION_NOTICE_KEY = 'sfoc-record-quick-action-notice';
const QUICK_LINKS_LOCATION_CHANGE_EVENT = 'sfoc:quick-links-location-change';
const INLINE_ICON_PATHS = Object.freeze({
  link: ['M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15', 'M14 11a5 5 0 0 0-7.07 0l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15'],
  'arrows-diff': ['M7 3v11', 'M7 3l-3 3', 'M7 3l3 3', 'M17 21V10', 'M17 21l-3-3', 'M17 21l3-3'],
  star: ['M12 3l2.8 5.7 6.2 .9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z'],
  home: ['M3 11.5L12 4l9 7.5', 'M5 10v10h14V10', 'M9 20v-6h6v6'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.1 2.1-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56v.08h-3v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 7.08 15a1.7 1.7 0 0 0-1.56-1.04h-.08v-3h.08A1.7 1.7 0 0 0 7.08 9.92a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.1-2.1.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.04-1.56v-.08h3v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.1 2.1-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.04h.08v3h-.08A1.7 1.7 0 0 0 19.4 15z'],
  'terminal-2': ['M4 5h16v14H4z', 'M7 9l3 3-3 3', 'M13 15h4'],
  database: ['M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z', 'M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6', 'M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6'],
  package: ['M4 7l8-4 8 4-8 4z', 'M4 7v10l8 4 8-4V7', 'M12 11v10'],
  activity: ['M3 12h4l2-7 4 14 2-7h6'],
  'shield-lock': ['M12 3l7 3v5c0 4.7-3 8-7 10-4-2-7-5.3-7-10V6z', 'M9.5 12.5a2.5 2.5 0 1 1 5 0V15h-5z', 'M12 10v1'],
  'help-circle': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9.5 9a2.5 2.5 0 1 1 4 2c-.8.6-1.5 1-1.5 2.5', 'M12 17h.01'],
  'file-code': ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 13l-2 2 2 2', 'M15 13l2 2-2 2'],
  'external-link': ['M14 5h5v5', 'M19 5l-8 8', 'M18 14v5H5V6h5'],
  rocket: ['M5 16l-2 4 4-2 2-2', 'M9 15l-3-3c2-4 5-7 10-8 1 5-4 9-7 11z', 'M14 9h.01'],
  'database-search': ['M5 5c0-1.1 3.1-2 7-2s7 .9 7 2-3.1 2-7 2-7-.9-7-2z', 'M5 5v6c0 1.1 3.1 2 7 2', 'M5 11v6c0 1.1 3.1 2 7 2', 'M18 18l3 3', 'M17 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z']
});
function validQuickLinkColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#0b5cab';
}

function humanizeToolId(value) {
  return String(value || 'SFOC')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
}

function quickLinkLabel(link) {
  const label = String(link?.label || '').trim();
  return label || humanizeToolId(link?.toolId);
}

function quickLinksMenuFingerprint(links, ctx) {
  const recordActions = Array.isArray(ctx?.recordQuickActions) ? ctx.recordQuickActions : [];
  const configured = (Array.isArray(links) ? links : []).map((link) => `${link?.id || ''}:${link?.label || ''}:${link?.toolId || ''}:${link?.url || ''}`);
  const actions = recordActions.map((action) => `${action?.id || ''}:${action?.name || ''}`);
  return `${ctx?.recordId || ''}|${configured.join('|')}|${actions.join('|')}`;
}

function createQuickLinkIcon(doc, iconName, color) {
  const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.classList.add('sfoc-quick-links-menu-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.style.setProperty('--quick-link-color', validQuickLinkColor(color));
  const safeIcon = String(iconName || 'link').replace(/[^a-z0-9-]/gi, '') || 'link';
  const paths = SFOC_QUICK_LINK_ICON_PATHS[safeIcon] || INLINE_ICON_PATHS[safeIcon] || INLINE_ICON_PATHS.link;
  for (const pathData of paths) {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    icon.appendChild(path);
  }
  return icon;
}

function openSfocQuickLink(link, ctx, openInNewTab) {
  return sfInjectSend({
    type: 'sfInject:openQuickLink',
    orgId: ctx.orgId,
    linkId: link.id,
    toolId: link.toolId,
    openInNewTab
  }).then((result) => {
    if (!result?.ok) ctx.onError?.('No se pudo abrir la herramienta en SFOC.');
  }).catch(() => ctx.onError?.('No se pudo abrir la herramienta en SFOC.'));
}

function appendQuickLinksSectionTitle(doc, menu, title) {
  const heading = doc.createElement('div');
  heading.className = 'sfoc-quick-links-menu-section-title';
  heading.textContent = title;
  menu.appendChild(heading);
}

function recordQuickActionSuccessMessage(name, lang) {
  return lang === 'en'
    ? `Record Quick Action “${name}” completed successfully.`
    : `La Record Quick Action “${name}” se ha ejecutado correctamente.`;
}

function queueRecordQuickActionNotice(message) {
  try {
    sessionStorage.setItem(RECORD_QUICK_ACTION_NOTICE_KEY, JSON.stringify({ message, expiresAt: Date.now() + 15000 }));
  } catch {
    // La recarga sigue siendo válida aunque el navegador bloquee sessionStorage.
  }
}

function consumeRecordQuickActionNotice(ctx) {
  try {
    const raw = sessionStorage.getItem(RECORD_QUICK_ACTION_NOTICE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(RECORD_QUICK_ACTION_NOTICE_KEY);
    const notice = JSON.parse(raw);
    if (notice?.message && Number(notice.expiresAt) > Date.now()) ctx.onSuccess?.(notice.message);
  } catch {
    // No interrumpir Quick Links por un aviso no persistible.
  }
}

function createRecordQuickActionRow(doc, action, ctx) {
  const row = doc.createElement('div');
  row.className = 'sfoc-quick-links-menu-row sfoc-quick-links-menu-row--record-action';
  const option = doc.createElement('button');
  option.type = 'button';
  option.className = 'sfoc-quick-links-menu-option sfoc-quick-links-menu-option--record-action';
  option.setAttribute('role', 'menuitem');
  option.appendChild(createQuickLinkIcon(doc, 'rocket', '#0f9d72'));
  const text = doc.createElement('span');
  text.className = 'sfoc-quick-links-menu-text';
  const label = doc.createElement('strong');
  label.textContent = action.name;
  text.appendChild(label);
  option.appendChild(text);
  option.addEventListener('click', () => {
    if (option.disabled) return;
    option.disabled = true;
    const originalLabel = label.textContent;
    label.textContent = ctx.lang === 'en' ? 'Running…' : 'Ejecutando…';
    const dismissLoading = ctx.onLoading?.(ctx.lang === 'en' ? 'Running Record Quick Action…' : 'Ejecutando Record Quick Action…') || (() => {});
    void sfInjectSend({
      type: 'sfInject:executeRecordQuickAction', orgId: ctx.orgId,
      recordId: ctx.recordId, actionId: action.id
    }).then((result) => {
      dismissLoading();
      if (!result?.ok) {
        ctx.onError?.(ctx.lang === 'en' ? 'The Record Quick Action could not be completed.' : 'No se ha podido ejecutar la Record Quick Action.');
        option.disabled = false;
        label.textContent = originalLabel;
        return;
      }
      queueRecordQuickActionNotice(recordQuickActionSuccessMessage(action.name, ctx.lang));
      window.location.reload();
    }).catch(() => {
      dismissLoading();
      ctx.onError?.(ctx.lang === 'en' ? 'The Record Quick Action could not be completed.' : 'No se ha podido ejecutar la Record Quick Action.');
      option.disabled = false;
      label.textContent = originalLabel;
    });
  });
  const configure = doc.createElement('button');
  configure.type = 'button';
  configure.className = 'sfoc-quick-links-menu-record-action-configure';
  const configureLabel = ctx.lang === 'en' ? 'Configure Record Quick Action' : 'Configurar Record Quick Action';
  configure.title = configureLabel;
  configure.setAttribute('aria-label', configureLabel);
  configure.appendChild(createQuickLinkIcon(doc, 'settings', '#0f9d72'));
  configure.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void sfInjectSend({
      type: 'sfInject:openRecordQuickActionConfig', orgId: ctx.orgId,
      recordId: ctx.recordId, actionId: action.id
    }).then((result) => {
      if (!result?.ok) ctx.onError?.(ctx.lang === 'en' ? 'The Record Quick Action configuration could not be opened.' : 'No se ha podido abrir la configuración de la Record Quick Action.');
    }).catch(() => ctx.onError?.(ctx.lang === 'en' ? 'The Record Quick Action configuration could not be opened.' : 'No se ha podido abrir la configuración de la Record Quick Action.'));
  });
  row.append(option, configure);
  return row;
}

/** @param {Document} doc @param {unknown[]} links @param {{ orgId?: string, orgLabel?: string }} ctx */
function createQuickLinksMenu(doc, links, ctx) {
  const menu = doc.createElement('div');
  menu.className = 'sfoc-quick-links-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Quick Links');

  const heading = doc.createElement('div');
  heading.className = 'sfoc-quick-links-menu-heading';
  const headingTitle = doc.createElement('strong');
  headingTitle.textContent = 'Quick Links';
  const orgName = String(ctx.orgLabel || '').trim();
  const headingOrg = doc.createElement('span');
  headingOrg.className = 'sfoc-quick-links-menu-heading-org';
  headingOrg.textContent = orgName;
  const headingActions = doc.createElement('div');
  headingActions.className = 'sfoc-quick-links-menu-heading-actions';
  headingActions.appendChild(headingOrg);
  const configure = doc.createElement('button');
  configure.type = 'button';
  configure.className = 'sfoc-quick-links-menu-configure';
  configure.title = 'Configurar Quick Links';
  configure.setAttribute('aria-label', 'Configurar Quick Links');
  configure.appendChild(createQuickLinkIcon(doc, 'settings', '#0b5cab'));
  configure.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void sfInjectSend({ type: 'sfInject:openQuickLinksSettings', orgId: ctx.orgId })
      .then((result) => {
        if (!result?.ok) ctx.onError?.('No se pudo abrir la configuración de Quick Links.');
      })
      .catch(() => ctx.onError?.('No se pudo abrir la configuración de Quick Links.'));
  });
  headingActions.appendChild(configure);
  heading.append(headingTitle, headingActions);
  menu.appendChild(heading);

  const recordQuickActions = Array.isArray(ctx.recordQuickActions) ? ctx.recordQuickActions : [];
  let count = 0;
  if (recordQuickActions.length) {
    appendQuickLinksSectionTitle(doc, menu, 'Record Quick Actions');
    for (const action of recordQuickActions) {
      if (!action?.id || !action?.name) continue;
      menu.appendChild(createRecordQuickActionRow(doc, action, ctx));
      count += 1;
    }
  }
  if (links.length && count) appendQuickLinksSectionTitle(doc, menu, 'Quick Links');
  for (const link of links) {
    if (!link || typeof link !== 'object') continue;
    const href = link.type === 'sfoc' ? '#' : buildCustomQuickLinkUrl(link.url);
    if (!href) continue;
    const row = doc.createElement('div');
    row.className = 'sfoc-quick-links-menu-row';
    const option = doc.createElement('a');
    option.className = 'sfoc-quick-links-menu-option';
    option.href = href;
    if (link.type === 'sfoc') {
      option.addEventListener('click', (event) => {
        event.preventDefault();
        void openSfocQuickLink(link, ctx, false);
      });
    }
    option.setAttribute('role', 'menuitem');
    option.appendChild(createQuickLinkIcon(doc, resolveQuickLinkIcon(link), link.color));
    const text = doc.createElement('span');
    text.className = 'sfoc-quick-links-menu-text';
    const label = doc.createElement('strong');
    label.textContent = quickLinkLabel(link);
    text.appendChild(label);
    option.appendChild(text);
    const openNewTab = doc.createElement('button');
    openNewTab.type = 'button';
    openNewTab.className = 'sfoc-quick-links-menu-open-new-tab';
    openNewTab.title = 'Abrir en una nueva pestaña';
    openNewTab.setAttribute('aria-label', 'Abrir en una nueva pestaña');
    openNewTab.appendChild(createQuickLinkIcon(doc, 'external-link', '#9dceff'));
    openNewTab.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (link.type === 'sfoc') {
        void openSfocQuickLink(link, ctx, true);
      } else {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    });
    row.append(option, openNewTab);
    menu.appendChild(row);
    count += 1;
  }
  return count ? menu : null;
}

/** @param {{ quickLinks?: unknown }} ctx */
export function hasConfiguredQuickLinks(ctx) {
  return Array.isArray(ctx?.quickLinks) && ctx.quickLinks.length > 0;
}

/** @param {Document} doc */
export function findQuickLinksActionsHost(doc) {
  const favoriteButton = doc.querySelector(
    'button.slds-global-actions__favorites-action, button.branding-favorites-star-button'
  );
  return favoriteButton?.closest('ul.slds-global-actions') || doc.querySelector('ul.slds-global-actions');
}

/** @param {Document} doc */
function removeQuickLinksTestButton(doc) {
  doc.querySelectorAll(INJECT_SELECTOR).forEach((node) => node.remove());
}

/** @param {Document} doc */
export function injectQuickLinksTestButton(doc, ctx = {}) {
  const existing = doc.querySelector(INJECT_SELECTOR);
  if (existing) {
    const links = Array.isArray(ctx.quickLinks) ? ctx.quickLinks : [];
    const fingerprint = quickLinksMenuFingerprint(links, ctx);
    if (existing.dataset.sfocQuickLinksFingerprint === fingerprint) return;
    const nextMenu = createQuickLinksMenu(doc, links, ctx);
    const currentMenu = existing.querySelector('.sfoc-quick-links-menu');
    if (nextMenu) {
      if (currentMenu) currentMenu.replaceWith(nextMenu);
      else existing.append(nextMenu);
      existing.querySelector('.sfoc-quick-links-button')?.setAttribute('aria-haspopup', 'menu');
    } else if (currentMenu) {
      currentMenu.remove();
      existing.querySelector('.sfoc-quick-links-button')?.removeAttribute('aria-haspopup');
    }
    existing.dataset.sfocQuickLinksFingerprint = fingerprint;
    return;
  }

  const actionsHost = findQuickLinksActionsHost(doc);
  if (!actionsHost) return;

  const item = doc.createElement('li');
  item.className = 'slds-global-actions__item sfoc-quick-links-test-item';
  item.setAttribute('data-sfoc-inject', INTEGRATION_ID);
  item.dataset.sfocQuickLinksFingerprint = quickLinksMenuFingerprint(Array.isArray(ctx.quickLinks) ? ctx.quickLinks : [], ctx);

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'slds-button sfoc-quick-links-button';
  button.setAttribute('aria-label', 'Quick Links');

  const logo = doc.createElement('img');
  logo.className = 'sfoc-quick-links-button-logo';
  logo.src = chrome.runtime.getURL('icons/icon-32.png');
  logo.alt = '';
  logo.setAttribute('aria-hidden', 'true');

  const label = doc.createElement('span');
  label.className = 'sfoc-quick-links-button-label';
  label.textContent = 'Quick Links';

  button.append(logo, label);
  const menu = createQuickLinksMenu(doc, Array.isArray(ctx.quickLinks) ? ctx.quickLinks : [], ctx);
  if (menu) {
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    const setMenuOpen = (open) => {
      item.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
    };
    item.addEventListener('pointerenter', () => setMenuOpen(true));
    item.addEventListener('pointerleave', () => setMenuOpen(false));
    item.addEventListener('focusin', () => setMenuOpen(true));
    item.addEventListener('focusout', (event) => {
      if (!item.contains(event.relatedTarget)) setMenuOpen(false);
    });
    button.addEventListener('click', () => setMenuOpen(!item.classList.contains('is-open')));
    item.append(button, menu);
  } else {
    item.appendChild(button);
  }
  // Primer elemento de acciones: a la derecha del buscador y antes de todos
  // los iconos de cabecera (favoritos, ayuda, notificaciones, perfil, etc.).
  const firstAction = actionsHost.querySelector(':scope > li.slds-global-actions__item');
  if (firstAction) actionsHost.insertBefore(item, firstAction);
  else actionsHost.appendChild(item);
}

/**
 * @param {Document} doc
 * @param {{ quickLinks?: unknown }} ctx
 * @returns {() => void}
 */
export function mountQuickLinksTestButton(doc, ctx) {
  let stopped = false;
  let recordQuickActions = [];
  let actionsLoaded = false;
  let recordId = '';
  const inject = () => {
    if (!actionsLoaded || stopped) return;
    const menuContext = { ...ctx, recordId, recordQuickActions };
    if (!hasConfiguredQuickLinks(menuContext) && !recordQuickActions.length) {
      removeQuickLinksTestButton(doc);
      return;
    }
    injectQuickLinksTestButton(doc, menuContext);
  };
  const refreshRecordQuickActions = () => {
    recordId = recordIdFromSalesforceUrl(location.href);
    recordQuickActions = [];
    actionsLoaded = false;
    if (!recordId) {
      actionsLoaded = true;
      inject();
      return;
    }
    void sfInjectSend({ type: 'sfInject:listRecordQuickActions', orgId: ctx.orgId, recordId })
      .then((result) => { if (result?.ok) recordQuickActions = Array.isArray(result.actions) ? result.actions : []; })
      .catch(() => {})
      .finally(() => { actionsLoaded = true; inject(); });
  };
  consumeRecordQuickActionNotice(ctx);
  refreshRecordQuickActions();
  window.addEventListener(QUICK_LINKS_LOCATION_CHANGE_EVENT, refreshRecordQuickActions);
  const stopObserver = mountDebouncedDomObserver(doc, inject, { debounceMs: 200, cooldownMs: 30 });
  return () => {
    stopped = true;
    window.removeEventListener(QUICK_LINKS_LOCATION_CHANGE_EVENT, refreshRecordQuickActions);
    stopObserver();
    removeQuickLinksTestButton(doc);
  };
}

function isParentQuickLinksPage() {
  try {
    return isQuickLinksSalesforcePage(window.top.location.href);
  } catch {
    return isQuickLinksSalesforcePage(location.href);
  }
}

export const quickLinksIntegration = {
  id: INTEGRATION_ID,
  requiresQuickLinks: false,
  isParentPageActive: isParentQuickLinksPage,
  isFrameRelevant: () => window.top === window,
  mount(doc, ctx) {
    return mountQuickLinksTestButton(doc, ctx);
  },
  retryInject(doc, ctx) {
    if (!doc.querySelector(INJECT_SELECTOR) && hasConfiguredQuickLinks(ctx)) injectQuickLinksTestButton(doc, ctx);
  }
};
