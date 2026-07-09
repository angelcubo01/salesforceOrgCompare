import { renderSoqlView } from './soqlAnalysisView.js';
import { renderLimitsView } from './limitsView.js';
import { renderDmlView } from './dmlAnalysisView.js';
import { mountSegmentControl } from './analysisTableUtils.js';
import { panelSectionHeading, wirePanelHelpButtons } from './panelSectionHeading.js';
import { escapeHtml } from '../../../shared/htmlEscape.js';

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string) => string} t
 */
export function renderDatabaseView(mount, parsed, onJump, t) {
  if (!mount) return;
  mount.innerHTML = `
    ${panelSectionHeading('database', t('apexLogViewer.tab.database'), t)}
    <div class="apex-log-database-segments" id="apexLogDatabaseSegments"></div>
    <div id="apexLogDatabaseContent"></div>`;

  const content = mount.querySelector('#apexLogDatabaseContent');
  const segmentsEl = mount.querySelector('#apexLogDatabaseSegments');
  if (!content || !segmentsEl) return;

  const sections = [
    { id: 'soql', label: t('apexLogViewer.tab.soql') },
    { id: 'dml', label: t('apexLogViewer.tab.dml') },
    { id: 'limits', label: t('apexLogViewer.tab.limits') }
  ];

  let active = 'soql';
  const renderSection = () => {
    if (!content) return;
    content.innerHTML = `<div class="apex-log-database-section" id="apexLogDatabaseSectionMount"></div>`;
    const sectionMount = content.querySelector('#apexLogDatabaseSectionMount');
    if (!sectionMount) return;
    if (active === 'soql') renderSoqlView(sectionMount, parsed, onJump, t);
    else if (active === 'dml') renderDmlView(sectionMount, parsed, onJump, t);
    else renderLimitsView(sectionMount, parsed, onJump, t);
    wirePanelHelpButtons(sectionMount, t);
  };

  mountSegmentControl(segmentsEl, active, sections, (id) => {
    active = id;
    renderSection();
  });
  renderSection();
  wirePanelHelpButtons(mount, t);
}
