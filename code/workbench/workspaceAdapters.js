import { t } from '../../shared/i18n.js';

let activeAdapter = null;

function ensureApexResultsHint() {
  const runs = document.querySelector('#apexTestsHubView .apex-tests-hub-runs');
  if (!runs) return null;
  let hint = document.getElementById('workbenchApexResultsHint');
  if (!hint) {
    hint = document.createElement('p');
    hint.id = 'workbenchApexResultsHint';
    hint.className = 'workbench-inline-banner hidden';
    hint.textContent = t('workbench.apex.resultsHint');
    runs.parentElement?.insertBefore(hint, runs);
  }
  return hint;
}

async function activateApexQuality(tabId) {
  const hint = ensureApexResultsHint();
  hint?.classList.toggle('hidden', tabId !== 'results');
  if (tabId === 'tests') document.getElementById('apexTestsOpenRunnerBtn')?.click();
  if (tabId === 'runs' || tabId === 'results') document.getElementById('apexTestsBackToHubBtn')?.click();
}

async function activateDiagnostics(tabId) {
  const { deactivateDebugLogViewTracesInline, openDebugLogViewTracesInline } = await import('../ui/debugLogViewTracesModal.js');
  if (tabId === 'trace-flags') await openDebugLogViewTracesInline();
  else deactivateDebugLogViewTracesInline();
}

async function activateDependencies(tabId) {
  const { setDependencyExplorerGraphVisible } = await import('../ui/dependencyExplorerPanel.js');
  setDependencyExplorerGraphVisible(tabId === 'graph');
}

const genericAdapter = Object.freeze({
  async activate() {},
  async deactivate() {},
  getHeaderActions() { return []; },
  refreshContext() {}
});

const adapters = new Map([
  ['apex-quality', { ...genericAdapter, activate: ({ tabId }) => activateApexQuality(tabId) }],
  ['diagnostics', {
    ...genericAdapter,
    activate: ({ tabId }) => activateDiagnostics(tabId),
    deactivate: () => activateDiagnostics('logs')
  }],
  ['dependencies', {
    ...genericAdapter,
    activate: ({ tabId }) => activateDependencies(tabId),
    deactivate: () => activateDependencies('metadata')
  }]
]);

export function getWorkspaceAdapter(workspaceId) {
  return adapters.get(workspaceId) || genericAdapter;
}

export async function activateWorkspaceAdapter(workspaceId, tabId) {
  const next = getWorkspaceAdapter(workspaceId);
  if (activeAdapter && activeAdapter !== next) await activeAdapter.deactivate({ preserve: true });
  activeAdapter = next;
  await next.activate({ tabId, restore: true });
}
