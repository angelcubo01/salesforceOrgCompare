import { renderValidationsView } from './validationsView.js';
import { renderWorkflowView } from './workflowView.js';
import { mountSegmentControl } from './analysisTableUtils.js';
import { panelSectionHeading, wirePanelHelpButtons } from './panelSectionHeading.js';

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string) => string} t
 */
export function renderPlatformView(mount, parsed, onJump, t) {
  if (!mount) return;
  mount.innerHTML = `
    ${panelSectionHeading('platform', t('apexLogViewer.tab.platform'), t)}
    <div class="apex-log-platform-segments" id="apexLogPlatformSegments"></div>
    <div id="apexLogPlatformContent"></div>`;

  const content = mount.querySelector('#apexLogPlatformContent');
  const segmentsEl = mount.querySelector('#apexLogPlatformSegments');
  if (!content || !segmentsEl) return;

  const sections = [
    { id: 'validations', label: t('apexLogViewer.tab.validations') },
    { id: 'workflow', label: t('apexLogViewer.tab.workflow') }
  ];

  let active = 'validations';
  const renderSection = () => {
    if (!content) return;
    content.innerHTML = `<div id="apexLogPlatformSectionMount"></div>`;
    const sectionMount = content.querySelector('#apexLogPlatformSectionMount');
    if (!sectionMount) return;
    if (active === 'validations') renderValidationsView(sectionMount, parsed, onJump, t);
    else renderWorkflowView(sectionMount, parsed, onJump, t);
    wirePanelHelpButtons(sectionMount, t);
  };

  mountSegmentControl(segmentsEl, active, sections, (id) => {
    active = id;
    renderSection();
  });
  renderSection();
  wirePanelHelpButtons(mount, t);
}
