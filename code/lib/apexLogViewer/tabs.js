import { APEX_LOG_TAB_ICONS } from './tabIcons.js';
/** @typedef {'summary'|'timeline'|'text'|'tree'|'debug'|'soql'|'dml'|'limits'|'callouts'|'profiling'|'validations'|'workflow'} ApexLogTabId */

/** @type {readonly { id: ApexLogTabId, i18n: string, tooltipKey: string }[]} */
export const APEX_LOG_TABS = [
  { id: 'summary', i18n: 'apexLogViewer.tab.summary', tooltipKey: 'apexLogViewer.tooltip.summary' },
  { id: 'timeline', i18n: 'apexLogViewer.tab.timeline', tooltipKey: 'apexLogViewer.tooltip.timeline' },
  { id: 'text', i18n: 'apexLogViewer.tab.text', tooltipKey: 'apexLogViewer.tooltip.text' },
  { id: 'soql', i18n: 'apexLogViewer.tab.soql', tooltipKey: 'apexLogViewer.tooltip.soql' },
  { id: 'debug', i18n: 'apexLogViewer.tab.debug', tooltipKey: 'apexLogViewer.tooltip.debug' },
  { id: 'limits', i18n: 'apexLogViewer.tab.limits', tooltipKey: 'apexLogViewer.tooltip.limits' },
  { id: 'callouts', i18n: 'apexLogViewer.tab.callouts', tooltipKey: 'apexLogViewer.tooltip.callouts' },
  { id: 'profiling', i18n: 'apexLogViewer.tab.profiling', tooltipKey: 'apexLogViewer.tooltip.profiling' },
  { id: 'tree', i18n: 'apexLogViewer.tab.tree', tooltipKey: 'apexLogViewer.tooltip.tree' },
  { id: 'dml', i18n: 'apexLogViewer.tab.dml', tooltipKey: 'apexLogViewer.tooltip.dml' },
  { id: 'validations', i18n: 'apexLogViewer.tab.validations', tooltipKey: 'apexLogViewer.tooltip.validations' },
  { id: 'workflow', i18n: 'apexLogViewer.tab.workflow', tooltipKey: 'apexLogViewer.tooltip.workflow' }
];

/** Grupos ordenados por prioridad de uso. */
export const APEX_LOG_TAB_GROUPS = [
  { labelKey: 'apexLogViewer.tabGroup.overview', tabs: ['summary'] },
  { labelKey: 'apexLogViewer.tabGroup.navigation', tabs: ['timeline', 'text', 'tree'] },
  { labelKey: 'apexLogViewer.tabGroup.data', tabs: ['soql', 'dml', 'callouts', 'debug'] },
  { labelKey: 'apexLogViewer.tabGroup.performance', tabs: ['limits', 'profiling'] },
  { labelKey: 'apexLogViewer.tabGroup.platform', tabs: ['validations', 'workflow'] }
];

const DEFAULT_TAB = 'summary';

/**
 * @param {HTMLElement} navEl
 * @param {(id: ApexLogTabId) => string} labelFn
 * @param {(id: ApexLogTabId) => void} onSelect
 * @param {(key: string) => string} t
 */
export function mountApexLogTabs(navEl, labelFn, onSelect, t) {
  if (!navEl) return;
  navEl.replaceChildren();
  navEl.className = 'apex-log-tabs';

  const inner = document.createElement('div');
  inner.className = 'apex-log-tabs-scroll';

  for (let gi = 0; gi < APEX_LOG_TAB_GROUPS.length; gi++) {
    const group = APEX_LOG_TAB_GROUPS[gi];
    if (gi > 0) {
      const sep = document.createElement('span');
      sep.className = 'apex-log-tab-sep';
      sep.setAttribute('aria-hidden', 'true');
      inner.appendChild(sep);
    }

    const groupEl = document.createElement('div');
    groupEl.className = 'apex-log-tab-group';
    groupEl.setAttribute('role', 'presentation');

    for (const tabId of group.tabs) {
      const tab = APEX_LOG_TABS.find((x) => x.id === tabId);
      if (!tab) continue;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'apex-log-tab';
      btn.dataset.tab = tab.id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', tab.id === DEFAULT_TAB ? 'true' : 'false');
      btn.title = t(tab.tooltipKey);

      const icon = document.createElement('span');
      icon.className = 'apex-log-tab-icon';
      icon.innerHTML = APEX_LOG_TAB_ICONS[tab.id] || '';

      const label = document.createElement('span');
      label.className = 'apex-log-tab-label';
      label.textContent = labelFn(tab.id);

      btn.append(icon, label);
      btn.addEventListener('click', () => onSelect(tab.id));
      groupEl.appendChild(btn);
    }
    inner.appendChild(groupEl);
  }

  navEl.appendChild(inner);
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
    el.toggleAttribute('hidden', !on);
  });
}
