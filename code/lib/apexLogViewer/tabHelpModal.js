import { activateDialogFocus, deactivateDialogFocus } from '../../../shared/dialogFocus.js';
import { APEX_LOG_TABS } from './tabs.js';
import { APEX_LOG_TAB_ICONS } from './tabIcons.js';
import {
  TAB_HELP_SECTION_ORDER,
  TAB_HELP_SECTION_TITLE_KEYS,
  tabHelpSectionKey
} from './tabHelpContent.js';

/** @typedef {import('./tabs.js').ApexLogTabId} ApexLogTabId */

const LIST_DELIM = '||';

let modalEl = null;

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement('div');
  modalEl.className = 'apex-log-help-modal';
  modalEl.hidden = true;
  modalEl.innerHTML = `
    <div class="apex-log-help-backdrop" data-close="1"></div>
    <div class="apex-log-help-dialog" role="dialog" aria-modal="true" aria-labelledby="apexLogHelpTitle">
      <header class="apex-log-help-header">
        <h2 id="apexLogHelpTitle"></h2>
        <button type="button" class="apex-log-help-close" data-close="1" aria-label="Close">&times;</button>
      </header>
      <div class="apex-log-help-body" id="apexLogHelpBody"></div>
    </div>`;
  document.body.appendChild(modalEl);
  modalEl.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeTabHelpModal());
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl && !modalEl.hidden) closeTabHelpModal();
  });
  return modalEl;
}

export function closeTabHelpModal() {
  if (modalEl) {
    modalEl.hidden = true;
    deactivateDialogFocus(modalEl);
  }
}

/** @param {string} text */
function createHelpBody(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (raw.includes(LIST_DELIM)) {
    const list = document.createElement('ul');
    list.className = 'apex-log-help-list';
    for (const item of raw.split(LIST_DELIM).map((value) => value.trim()).filter(Boolean)) {
      const listItem = document.createElement('li');
      listItem.textContent = item;
      list.appendChild(listItem);
    }
    return list;
  }
  const paragraph = document.createElement('p');
  paragraph.className = 'apex-log-help-paragraph';
  paragraph.textContent = raw;
  return paragraph;
}

/** @param {ApexLogTabId} tabId @param {string} label @param {string} className */
function createArticleHeader(tabId, label, className) {
  const header = document.createElement('header');
  header.className = className;
  const icon = document.createElement('span');
  icon.className = 'apex-log-help-item-icon';
  icon.setAttribute('aria-hidden', 'true');
  // The SVG comes from the extension's static icon registry, never from translations or data.
  icon.innerHTML = APEX_LOG_TAB_ICONS[tabId] || '';
  const heading = document.createElement('h3');
  heading.textContent = label;
  header.append(icon, heading);
  return header;
}

/** @param {(key: string) => string} t @param {ApexLogTabId} tabId */
function createDetailedTabHelp(t, tabId) {
  const tab = APEX_LOG_TABS.find((entry) => entry.id === tabId);
  if (!tab) return null;
  const article = document.createElement('article');
  article.className = 'apex-log-help-detail';
  article.id = `apex-log-help-${tabId}`;
  article.appendChild(createArticleHeader(tabId, t(tab.i18n), 'apex-log-help-item-head apex-log-help-detail-head'));
  appendHelpSections(article, t, tabId);
  return article;
}

/** @param {HTMLElement} article @param {(key: string) => string} t @param {string} tabId */
function appendHelpSections(article, t, tabId) {
  for (const sectionId of TAB_HELP_SECTION_ORDER) {
    const key = tabHelpSectionKey(tabId, sectionId);
    const body = t(key);
    if (!body || body === key) continue;
    const section = document.createElement('section');
    section.className = 'apex-log-help-block';
    const title = document.createElement('h4');
    title.className = 'apex-log-help-block-title';
    title.textContent = t(TAB_HELP_SECTION_TITLE_KEYS[sectionId]);
    section.appendChild(title);
    const content = createHelpBody(body);
    if (content) section.appendChild(content);
    article.appendChild(section);
  }
}

/** @param {(key: string) => string} t @param {ApexLogTabId} [focusTabId] */
export function openTabHelpModal(t, focusTabId) {
  const modal = ensureModal();
  const titleEl = modal.querySelector('#apexLogHelpTitle');
  const bodyEl = modal.querySelector('#apexLogHelpBody');
  if (!titleEl || !bodyEl) return;
  const closeBtn = modal.querySelector('.apex-log-help-close');
  if (closeBtn) closeBtn.setAttribute('aria-label', t('apexLogViewer.help.close'));

  if (focusTabId) {
    const tab = APEX_LOG_TABS.find((entry) => entry.id === focusTabId);
    titleEl.textContent = tab ? `${t(tab.i18n)} — ${t('apexLogViewer.help.panelButton')}` : t('apexLogViewer.help.modalTitle');
    const detail = createDetailedTabHelp(t, focusTabId);
    bodyEl.replaceChildren(...(detail ? [detail] : []));
    modal.hidden = false;
    bodyEl.scrollTop = 0;
    activateDialogFocus(modal, { initialFocus: closeBtn });
    return;
  }

  titleEl.textContent = t('apexLogViewer.help.modalTitle');
  const articles = APEX_LOG_TABS.map((tab) => {
    const article = document.createElement('article');
    article.className = 'apex-log-help-item';
    article.id = `apex-log-help-${tab.id}`;
    article.appendChild(createArticleHeader(tab.id, t(tab.i18n), 'apex-log-help-item-head'));
    const summaryKey = `apexLogViewer.help.${tab.id}.purpose`;
    const summary = t(summaryKey);
    const content = createHelpBody(summary !== summaryKey ? summary : t(`apexLogViewer.help.${tab.id}`));
    if (content) article.appendChild(content);
    return article;
  });
  bodyEl.replaceChildren(...articles);
  modal.hidden = false;
  activateDialogFocus(modal, { initialFocus: closeBtn });
}

/** @param {(key: string) => string} t @param {string} tabId @param {string} titleKey */
export function openCustomTabHelp(t, tabId, titleKey) {
  const modal = ensureModal();
  const titleEl = modal.querySelector('#apexLogHelpTitle');
  const bodyEl = modal.querySelector('#apexLogHelpBody');
  if (!titleEl || !bodyEl) return;
  const closeBtn = modal.querySelector('.apex-log-help-close');
  if (closeBtn) closeBtn.setAttribute('aria-label', t('apexLogViewer.help.close'));
  titleEl.textContent = `${t(titleKey)} — ${t('apexLogViewer.help.panelButton')}`;
  const article = document.createElement('article');
  article.className = 'apex-log-help-detail';
  article.id = `apex-log-help-${tabId}`;
  appendHelpSections(article, t, tabId);
  bodyEl.replaceChildren(article);
  modal.hidden = false;
  bodyEl.scrollTop = 0;
  activateDialogFocus(modal, { initialFocus: closeBtn });
}

/** @param {(key: string) => string} t @param {ApexLogTabId} tabId */
export function openTabHelpForTab(t, tabId) {
  openTabHelpModal(t, tabId);
}
