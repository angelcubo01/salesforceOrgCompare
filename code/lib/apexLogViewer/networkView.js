import { renderCalloutView } from './calloutAnalysisView.js';
import { renderDebugView } from './apexDebugView.js';
import { mountSegmentControl } from './analysisTableUtils.js';
import { panelSectionHeading, wirePanelHelpButtons } from './panelSectionHeading.js';

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string) => string} t
 */
export function renderNetworkView(mount, parsed, onJump, t) {
  if (!mount) return;
  mount.innerHTML = `
    ${panelSectionHeading('network', t('apexLogViewer.tab.network'), t)}
    <div class="apex-log-network-segments" id="apexLogNetworkSegments"></div>
    <div id="apexLogNetworkContent"></div>`;

  const content = mount.querySelector('#apexLogNetworkContent');
  const segmentsEl = mount.querySelector('#apexLogNetworkSegments');
  if (!content || !segmentsEl) return;

  const sections = [
    { id: 'callouts', label: t('apexLogViewer.tab.callouts') },
    { id: 'debug', label: t('apexLogViewer.tab.debug') }
  ];

  let active = (parsed?.callouts || []).length ? 'callouts' : 'debug';
  const renderSection = () => {
    if (!content) return;
    content.innerHTML = `<div id="apexLogNetworkSectionMount"></div>`;
    const sectionMount = content.querySelector('#apexLogNetworkSectionMount');
    if (!sectionMount) return;
    if (active === 'callouts') renderCalloutView(sectionMount, parsed, onJump, t);
    else renderDebugView(sectionMount, parsed, onJump, t);
    wirePanelHelpButtons(sectionMount, t);
  };

  mountSegmentControl(segmentsEl, active, sections, (id) => {
    active = id;
    renderSection();
  });
  renderSection();
  wirePanelHelpButtons(mount, t);
}
