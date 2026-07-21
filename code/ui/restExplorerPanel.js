import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { handleToolError } from '../../shared/reportToolError.js';
import { flattenJsonForTree } from '../../shared/restExplorerApi.js';
import { logToolUsage } from './toolUsageLog.js';
import { bindRunShortcut } from './runShortcut.js';

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getOrgId() {
  return document.getElementById('leftOrg')?.value || state.leftOrgId || '';
}

function renderTree(json) {
  const tbody = document.getElementById('restExplorerResponseTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (json == null) return;
  const rows = flattenJsonForTree(json).slice(0, 500);
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="rest-explorer-mono">${escapeHtml(row.path)}</td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.value)}</td>`;
    tbody.appendChild(tr);
  }
}

async function sendRequest() {
  const orgId = getOrgId();
  if (!orgId) {
    showToast(t('restExplorer.pickOrg'), 'warn');
    return;
  }
  const method = document.getElementById('restExplorerMethod')?.value || 'GET';
  const uri = document.getElementById('restExplorerUri')?.value || '';
  const headersRaw = document.getElementById('restExplorerHeaders')?.value || '';
  const body = document.getElementById('restExplorerBody')?.value || '';
  let headers = {};
  if (headersRaw.trim()) {
    try {
      headers = JSON.parse(headersRaw);
    } catch {
      showToast(t('restExplorer.badHeaders'), 'error');
      return;
    }
  }
  showToastWithSpinner(t('restExplorer.sending'));
  try {
    const res = await bg({
      type: 'restExplorer:request',
      orgId,
      method,
      uri,
      headers,
      body
    });
    if (!res?.ok) {
      if (res?.reason === 'NO_SID') throw new Error(t('restExplorer.noSid'));
      throw new Error(res?.error || t('restExplorer.failed'));
    }
    const statusEl = document.getElementById('restExplorerResponseStatus');
    if (statusEl) statusEl.textContent = `${res.status} ${res.statusText || ''}`;
    renderTree(res.json ?? (res.text ? { body: res.text } : null));
    void logToolUsage('RestExplorer', 'request', { ok: true });
  } catch (e) {
    void handleToolError(e, { artifact_type: 'RestExplorer', phase: 'request' });
    void logToolUsage('RestExplorer', 'request', { ok: false, error: String(e?.message || e) });
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

export function setupRestExplorerPanel() {
  document.getElementById('restExplorerSendBtn')?.addEventListener('click', () => void sendRequest());
  bindRunShortcut('RestExplorer', () => void sendRequest(), { allowInMonaco: true });
}

export async function refreshRestExplorerPanel() {
  if (getSelectedArtifactType() !== 'RestExplorer') return;
  const statusEl = document.getElementById('restExplorerResponseStatus');
  if (statusEl) statusEl.textContent = '';
  renderTree(null);
}
