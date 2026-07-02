import { escapeHtml } from '../../../shared/htmlEscape.js';
import { openTabHelpForTab } from './tabHelpModal.js';

/** @typedef {import('./tabs.js').ApexLogTabId} ApexLogTabId */

const HELP_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`;

/**
 * @param {ApexLogTabId} tabId
 * @param {string} title
 * @param {(key: string) => string} [t]
 */
export function panelSectionHeading(tabId, title, t) {
  const helpBtn =
    typeof t === 'function'
      ? `<button type="button" class="apex-log-panel-help" data-tab-help="${tabId}" title="${escapeHtml(t('apexLogViewer.help.panelButton'))}" aria-label="${escapeHtml(t('apexLogViewer.help.panelButton'))}">${HELP_SVG}</button>`
      : '';
  return `<header class="apex-log-panel-heading">
    <span class="apex-log-panel-heading-label">${escapeHtml(title)}</span>
    ${helpBtn}
  </header>`;
}

/**
 * @param {HTMLElement} root
 * @param {(key: string) => string} t
 */
export function wirePanelHelpButtons(root, t) {
  if (!root) return;
  root.querySelectorAll('[data-tab-help]:not([data-help-wired])').forEach((btn) => {
    btn.dataset.helpWired = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = btn.getAttribute('data-tab-help');
      if (tabId) openTabHelpForTab(t, tabId);
    });
  });
}

/**
 * @param {HTMLElement | null} panel
 * @param {ApexLogTabId} tabId
 * @param {string} title
 * @param {(key: string) => string} [t]
 */
export function ensurePanelSectionHeading(panel, tabId, title, t) {
  if (!panel || panel.querySelector('.apex-log-panel-heading')) return;
  const heading = document.createElement('div');
  heading.innerHTML = panelSectionHeading(tabId, title, t);
  const el = heading.firstElementChild;
  if (el) panel.insertBefore(el, panel.firstChild);
  if (t) wirePanelHelpButtons(panel);
}
