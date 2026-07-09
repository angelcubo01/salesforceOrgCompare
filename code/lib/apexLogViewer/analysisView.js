import { renderTreeView, layoutTreeEditor } from './rawTreeView.js';
import { renderProfilingView } from './profilingView.js';
import { mountSegmentControl } from './analysisTableUtils.js';
import { panelSectionHeading, wirePanelHelpButtons } from './panelSectionHeading.js';
import { escapeHtml } from '../../../shared/htmlEscape.js';
import { formatMs } from '../../../shared/apexLogParser.js';

/**
 * @param {object[]} methods
 */
function buildAggregatedMethods(methods) {
  const map = new Map();
  for (const row of methods || []) {
    const key = row.location || row.detail || 'unknown';
    const prev = map.get(key) || { location: key, executions: 0, totalMs: 0, apexLine: row.apexLine || 0, line: row.line || 0 };
    prev.executions += row.executions || 1;
    prev.totalMs += row.totalMs || 0;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.totalMs - a.totalMs);
}

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string) => string} t
 * @param {import('monaco-editor') | null} monaco
 * @param {boolean} lightTheme
 * @param {HTMLElement | null} treeToolbar
 */
export function renderAnalysisView(mount, parsed, onJump, t, monaco, lightTheme, treeToolbar) {
  if (!mount) return;
  mount.innerHTML = `
    ${panelSectionHeading('analysis', t('apexLogViewer.tab.analysis'), t)}
    <div class="apex-log-analysis-segments" id="apexLogAnalysisSegments"></div>
    <div id="apexLogAnalysisContent"></div>`;

  const content = mount.querySelector('#apexLogAnalysisContent');
  const segmentsEl = mount.querySelector('#apexLogAnalysisSegments');
  if (!content || !segmentsEl) return;

  const sections = [
    { id: 'tree', label: t('apexLogViewer.analysis.tree') },
    { id: 'profiling', label: t('apexLogViewer.tab.profiling') },
    { id: 'aggregated', label: t('apexLogViewer.analysis.aggregated') }
  ];

  let active = 'tree';
  const renderSection = () => {
    if (!content) return;
    content.innerHTML = `<div id="apexLogAnalysisSectionMount"></div>`;
    const sectionMount = content.querySelector('#apexLogAnalysisSectionMount');
    if (!sectionMount) return;
    if (active === 'tree') {
      sectionMount.innerHTML = `<div id="apexLogAnalysisTreeToolbar" class="apex-log-panel-toolbar"></div><div id="apexLogAnalysisTreeMount" class="apex-log-viewer-editor apex-log-viewer-editor--nested"></div>`;
      renderTreeView(
        monaco,
        sectionMount.querySelector('#apexLogAnalysisTreeMount'),
        parsed,
        lightTheme,
        t,
        sectionMount.querySelector('#apexLogAnalysisTreeToolbar')
      );
    } else if (active === 'profiling') {
      renderProfilingView(sectionMount, parsed, onJump, t);
    } else {
      const methods = buildAggregatedMethods(parsed?.profiling?.methods || []);
      if (!methods.length) {
        sectionMount.innerHTML = `<p class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.profilingMethods'))}</p>`;
      } else {
        sectionMount.innerHTML = `<div class="apex-log-table-wrap"><table class="apex-log-data-table"><thead><tr>
          <th>${escapeHtml(t('apexLogViewer.col.location'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.executions'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.duration'))}</th>
        </tr></thead><tbody>${methods
          .slice(0, 100)
          .map(
            (r) => `<tr><td>${escapeHtml(r.location)}</td><td>${r.executions}</td><td>${escapeHtml(formatMs(r.totalMs))}</td></tr>`
          )
          .join('')}</tbody></table></div>`;
      }
    }
    wirePanelHelpButtons(sectionMount, t);
  };

  mountSegmentControl(segmentsEl, active, sections, (id) => {
    active = id;
    renderSection();
    if (active === 'tree') requestAnimationFrame(() => layoutTreeEditor());
  });
  renderSection();
  wirePanelHelpButtons(mount, t);
}

export function layoutAnalysisTreeEditor() {
  layoutTreeEditor();
}
