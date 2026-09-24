import { APEX_LOG_TAB_ICONS } from './tabIcons.js';

/** @typedef {'summary'|'errors'|'timeline'|'text'|'database'|'analysis'|'network'|'platform'|'comparison'} ApexLogTabId */



/** @type {readonly { id: ApexLogTabId, i18n: string, tooltipKey: string }[]} */

export const APEX_LOG_TABS = [

  { id: 'summary', i18n: 'apexLogViewer.tab.summary', tooltipKey: 'apexLogViewer.tooltip.summary' },

  { id: 'comparison', i18n: 'apexLogViewer.tab.comparison', tooltipKey: 'apexLogViewer.tab.comparison' },

  { id: 'errors', i18n: 'apexLogViewer.tab.errors', tooltipKey: 'apexLogViewer.tooltip.errors' },

  { id: 'timeline', i18n: 'apexLogViewer.tab.timeline', tooltipKey: 'apexLogViewer.tooltip.timeline' },

  { id: 'database', i18n: 'apexLogViewer.tab.database', tooltipKey: 'apexLogViewer.tooltip.database' },

  { id: 'analysis', i18n: 'apexLogViewer.tab.analysis', tooltipKey: 'apexLogViewer.tooltip.analysis' },

  { id: 'network', i18n: 'apexLogViewer.tab.network', tooltipKey: 'apexLogViewer.tooltip.network' },

  { id: 'text', i18n: 'apexLogViewer.tab.text', tooltipKey: 'apexLogViewer.tooltip.text' },

  { id: 'platform', i18n: 'apexLogViewer.tab.platform', tooltipKey: 'apexLogViewer.tooltip.platform' }

];



/** Grupos ordenados por prioridad de uso. */

export const APEX_LOG_TAB_GROUPS = [

  { labelKey: 'apexLogViewer.tabGroup.overview', tabs: ['summary', 'comparison', 'errors'] },

  { labelKey: 'apexLogViewer.tabGroup.navigation', tabs: ['timeline', 'text'] },

  { labelKey: 'apexLogViewer.tabGroup.data', tabs: ['database', 'analysis', 'network'] },

  { labelKey: 'apexLogViewer.tabGroup.platform', tabs: ['platform'] }

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

      btn.id = `apexLogTab-${tab.id}`;

      btn.setAttribute('role', 'tab');

      btn.setAttribute('aria-selected', tab.id === DEFAULT_TAB ? 'true' : 'false');

      btn.setAttribute('aria-controls', `apexLogPanel-${tab.id}`);

      btn.tabIndex = tab.id === DEFAULT_TAB ? 0 : -1;

      btn.title = t(tab.tooltipKey);
      if (tab.id === 'comparison') btn.hidden = true;



      const icon = document.createElement('span');

      icon.className = 'apex-log-tab-icon';

      icon.innerHTML = APEX_LOG_TAB_ICONS[tab.id] || '';



      const label = document.createElement('span');

      label.className = 'apex-log-tab-label';

      label.textContent = labelFn(tab.id);



      btn.append(icon, label);

      btn.addEventListener('click', () => onSelect(tab.id));

      btn.addEventListener('keydown', (event) => {
        const tabs = [...navEl.querySelectorAll('.apex-log-tab')];
        const index = tabs.indexOf(btn);
        if (index < 0) return;
        let nextIndex = -1;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabs.length - 1;
        if (nextIndex < 0) return;
        event.preventDefault();
        tabs[nextIndex].focus();
        onSelect(tabs[nextIndex].dataset.tab);
      });

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

    el.tabIndex = on ? 0 : -1;

  });

  document.querySelectorAll('.apex-log-panel').forEach((el) => {

    const on = el.dataset.panel === activeId;

    el.classList.toggle('is-active', on);

    el.toggleAttribute('hidden', !on);

    if (on) el.setAttribute('aria-labelledby', `apexLogTab-${activeId}`);

  });

}

export function setComparisonTabVisible(visible) {
  const tab = document.getElementById('apexLogTab-comparison');
  if (tab) tab.hidden = !visible;
}

/** Indicadores discretos para dirigir el diagnóstico sin sobrecargar las pestañas. */
export function updateApexLogTabBadges(parsed) {
  const counts = {
    errors: (parsed?.issues || []).filter((item) => item.type === 'error').length,
    database: (parsed?.soql || []).length + (parsed?.dml || []).length,
    network: (parsed?.callouts || []).length + (parsed?.userDebug || []).length,
    platform: (parsed?.validations || []).length + (parsed?.workflows || []).length
  };
  for (const [tabId, count] of Object.entries(counts)) {
    const tab = document.getElementById(`apexLogTab-${tabId}`);
    if (!tab) continue;
    tab.querySelector('.apex-log-tab-badge')?.remove();
    const label = tab.querySelector('.apex-log-tab-label')?.textContent || tabId;
    tab.setAttribute('aria-label', count ? `${label}: ${count}` : label);
    if (!count) continue;
    const badge = document.createElement('span');
    badge.className = `apex-log-tab-badge${tabId === 'errors' ? ' apex-log-tab-badge--danger' : ''}`;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.setAttribute('aria-hidden', 'true');
    tab.appendChild(badge);
  }
}


