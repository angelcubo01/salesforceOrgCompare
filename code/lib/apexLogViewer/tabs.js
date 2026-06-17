import { APEX_LOG_TAB_ICONS } from './tabIcons.js';

/** @typedef {'text'|'tree'|'debug'|'timeline'|'soql'|'dml'} ApexLogTabId */

/** @type {readonly { id: ApexLogTabId, i18n: string }[]} */
export const APEX_LOG_TABS = [
  { id: 'text', i18n: 'apexLogViewer.tab.text' },
  { id: 'tree', i18n: 'apexLogViewer.tab.tree' },
  { id: 'debug', i18n: 'apexLogViewer.tab.debug' },
  { id: 'timeline', i18n: 'apexLogViewer.tab.timeline' },
  { id: 'soql', i18n: 'apexLogViewer.tab.soql' },
  { id: 'dml', i18n: 'apexLogViewer.tab.dml' }
];

/**
 * @param {HTMLElement} navEl
 * @param {(id: ApexLogTabId) => string} labelFn
 * @param {(id: ApexLogTabId) => void} onSelect
 */
export function mountApexLogTabs(navEl, labelFn, onSelect) {
  if (!navEl) return;
  navEl.replaceChildren();
  for (const tab of APEX_LOG_TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'apex-log-tab';
    btn.dataset.tab = tab.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', tab.id === 'text' ? 'true' : 'false');

    const icon = document.createElement('span');
    icon.className = 'apex-log-tab-icon';
    icon.innerHTML = APEX_LOG_TAB_ICONS[tab.id] || '';

    const label = document.createElement('span');
    label.className = 'apex-log-tab-label';
    label.textContent = labelFn(tab.id);

    btn.append(icon, label);
    btn.addEventListener('click', () => onSelect(tab.id));
    navEl.appendChild(btn);
  }
}

/**
 * @param {ApexLogTabId} activeId
 */
export function setActiveApexLogTab(activeId) {
  document.querySelectorAll('.apex-log-tab').forEach((el) => {
    const on = el.dataset.tab === activeId;
    el.classList.toggle('is-active', on);
    el.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.apex-log-panel').forEach((el) => {
    const on = el.dataset.panel === activeId;
    el.classList.toggle('is-active', on);
    el.hidden = !on;
  });
}
