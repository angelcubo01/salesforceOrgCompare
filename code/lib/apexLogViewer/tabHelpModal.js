import { escapeHtml } from '../../../shared/htmlEscape.js';
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
        <button type="button" class="apex-log-help-close" data-close="1" aria-label="Close">×</button>
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
  if (modalEl) modalEl.hidden = true;
}

/**
 * @param {string} text
 */
function renderHelpBody(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (raw.includes(LIST_DELIM)) {
    const items = raw.split(LIST_DELIM).map((s) => s.trim()).filter(Boolean);
    return `<ul class="apex-log-help-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }
  return `<p class="apex-log-help-paragraph">${escapeHtml(raw)}</p>`;
}

/**
 * @param {(key: string) => string} t
 * @param {ApexLogTabId} tabId
 */
function renderDetailedTabHelp(t, tabId) {
  const tab = APEX_LOG_TABS.find((x) => x.id === tabId);
  if (!tab) return '';
  const icon = APEX_LOG_TAB_ICONS[tabId] || '';
  const sections = TAB_HELP_SECTION_ORDER.map((sectionId) => {
    const body = t(tabHelpSectionKey(tabId, sectionId));
    if (!body || body === tabHelpSectionKey(tabId, sectionId)) return '';
    const title = t(TAB_HELP_SECTION_TITLE_KEYS[sectionId]);
    return `<section class="apex-log-help-block">
      <h4 class="apex-log-help-block-title">${escapeHtml(title)}</h4>
      ${renderHelpBody(body)}
    </section>`;
  }).join('');

  return `<article class="apex-log-help-detail" id="apex-log-help-${tabId}">
    <header class="apex-log-help-item-head apex-log-help-detail-head">
      <span class="apex-log-help-item-icon" aria-hidden="true">${icon}</span>
      <h3>${escapeHtml(t(tab.i18n))}</h3>
    </header>
    ${sections}
  </article>`;
}

/**
 * @param {(key: string) => string} t
 * @param {ApexLogTabId} [focusTabId]
 */
export function openTabHelpModal(t, focusTabId) {
  const modal = ensureModal();
  const titleEl = modal.querySelector('#apexLogHelpTitle');
  const bodyEl = modal.querySelector('#apexLogHelpBody');
  if (!titleEl || !bodyEl) return;

  const closeBtn = modal.querySelector('.apex-log-help-close');
  if (closeBtn) closeBtn.setAttribute('aria-label', t('apexLogViewer.help.close'));

  if (focusTabId) {
    const tab = APEX_LOG_TABS.find((x) => x.id === focusTabId);
    titleEl.textContent = tab ? `${t(tab.i18n)} — ${t('apexLogViewer.help.panelButton')}` : t('apexLogViewer.help.modalTitle');
    bodyEl.innerHTML = renderDetailedTabHelp(t, focusTabId);
    modal.hidden = false;
    bodyEl.scrollTop = 0;
    return;
  }

  titleEl.textContent = t('apexLogViewer.help.modalTitle');
  bodyEl.innerHTML = APEX_LOG_TABS.map((tab) => {
    const icon = APEX_LOG_TAB_ICONS[tab.id] || '';
    const summaryKey = `apexLogViewer.help.${tab.id}.purpose`;
    const summary = t(summaryKey);
    const text = summary !== summaryKey ? summary : t(`apexLogViewer.help.${tab.id}`);
    return `<article class="apex-log-help-item" id="apex-log-help-${tab.id}">
      <header class="apex-log-help-item-head">
        <span class="apex-log-help-item-icon" aria-hidden="true">${icon}</span>
        <h3>${escapeHtml(t(tab.i18n))}</h3>
      </header>
      ${renderHelpBody(text)}
    </article>`;
  }).join('');
  modal.hidden = false;
}

/**
 * @param {(key: string) => string} t
 * @param {string} tabId
 * @param {string} titleKey
 */
export function openCustomTabHelp(t, tabId, titleKey) {
  const modal = ensureModal();
  const titleEl = modal.querySelector('#apexLogHelpTitle');
  const bodyEl = modal.querySelector('#apexLogHelpBody');
  if (!titleEl || !bodyEl) return;

  const closeBtn = modal.querySelector('.apex-log-help-close');
  if (closeBtn) closeBtn.setAttribute('aria-label', t('apexLogViewer.help.close'));

  titleEl.textContent = `${t(titleKey)} — ${t('apexLogViewer.help.panelButton')}`;
  const sections = TAB_HELP_SECTION_ORDER.map((sectionId) => {
    const body = t(tabHelpSectionKey(tabId, sectionId));
    if (!body || body === tabHelpSectionKey(tabId, sectionId)) return '';
    const title = t(TAB_HELP_SECTION_TITLE_KEYS[sectionId]);
    return `<section class="apex-log-help-block">
      <h4 class="apex-log-help-block-title">${escapeHtml(title)}</h4>
      ${renderHelpBody(body)}
    </section>`;
  }).join('');
  bodyEl.innerHTML = `<article class="apex-log-help-detail" id="apex-log-help-${tabId}">${sections}</article>`;
  modal.hidden = false;
  bodyEl.scrollTop = 0;
}

/**
 * @param {(key: string) => string} t
 * @param {ApexLogTabId} tabId
 */
export function openTabHelpForTab(t, tabId) {
  openTabHelpModal(t, tabId);
}
