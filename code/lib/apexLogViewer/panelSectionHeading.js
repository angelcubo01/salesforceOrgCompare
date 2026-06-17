import { escapeHtml } from '../../../shared/htmlEscape.js';
import { APEX_LOG_TAB_ICONS } from './tabIcons.js';

/** @typedef {import('./tabs.js').ApexLogTabId} ApexLogTabId */

/**
 * @param {ApexLogTabId} tabId
 * @param {string} title
 */
export function panelSectionHeading(tabId, title) {
  const icon = APEX_LOG_TAB_ICONS[tabId] || '';
  return `<header class="apex-log-panel-heading">
    <span class="apex-log-panel-heading-icon" aria-hidden="true">${icon}</span>
    <span class="apex-log-panel-heading-label">${escapeHtml(title)}</span>
  </header>`;
}

/**
 * @param {HTMLElement | null} panel
 * @param {ApexLogTabId} tabId
 * @param {string} title
 */
export function ensurePanelSectionHeading(panel, tabId, title) {
  if (!panel || panel.querySelector('.apex-log-panel-heading')) return;
  const heading = document.createElement('div');
  heading.innerHTML = panelSectionHeading(tabId, title);
  const el = heading.firstElementChild;
  if (el) panel.insertBefore(el, panel.firstChild);
}
