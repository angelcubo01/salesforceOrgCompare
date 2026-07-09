import { escapeHtml } from '../../../shared/htmlEscape.js';

/**
 * @param {object} parsed
 * @param {string} query
 */
export function searchApexLog(parsed, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || q.length < 2) return [];
  /** @type {{ tab: string, label: string, detail: string, line: number }[]} */
  const results = [];

  const push = (tab, label, detail, line) => {
    if (!line) return;
    const hay = `${label} ${detail}`.toLowerCase();
    if (hay.includes(q)) results.push({ tab, label, detail, line });
  };

  for (const issue of parsed?.issues || []) {
    push('errors', issue.summary || 'Error', issue.description || '', issue.line);
  }
  for (const row of parsed?.soql || []) {
    push('database', 'SOQL', row.query || '', row.line);
  }
  for (const row of parsed?.dml || []) {
    push('database', 'DML', `${row.operation} ${row.object}`, row.line);
  }
  for (const row of parsed?.userDebug || []) {
    push('network', 'USER_DEBUG', row.message || '', row.line);
  }
  for (const row of parsed?.callouts || []) {
    push('network', 'Callout', row.endpoint || '', row.requestLine || row.line);
  }
  for (const row of parsed?.validations || []) {
    push('platform', 'Validation', row.name || row.kind || '', row.line);
  }

  return results.slice(0, 80);
}

/**
 * @param {HTMLElement | null} mount
 * @param {object} parsed
 * @param {(tabId: string, line: number) => void} onNavigate
 * @param {(key: string) => string} t
 */
export function mountFindBar(mount, parsed, onNavigate, t) {
  if (!mount) return;
  mount.innerHTML = `
    <div class="apex-log-find-bar">
      <input type="search" class="apex-log-find-input" id="apexLogFindInput" placeholder="${escapeHtml(t('apexLogViewer.find.placeholder'))}" />
      <div class="apex-log-find-results" id="apexLogFindResults" hidden></div>
    </div>`;

  const input = mount.querySelector('#apexLogFindInput');
  const resultsEl = mount.querySelector('#apexLogFindResults');
  if (!input || !resultsEl) return;

  let timer = 0;
  const renderResults = () => {
    const hits = searchApexLog(parsed, input.value);
    if (!hits.length) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      return;
    }
    resultsEl.hidden = false;
    resultsEl.innerHTML = hits
      .map(
        (hit) =>
          `<button type="button" class="apex-log-find-hit" data-tab="${escapeHtml(hit.tab)}" data-line="${hit.line}">
            <span class="apex-log-find-hit-label">${escapeHtml(hit.label)}</span>
            <span class="apex-log-find-hit-detail">${escapeHtml(hit.detail)}</span>
          </button>`
      )
      .join('');
    resultsEl.querySelectorAll('.apex-log-find-hit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') || 'text';
        const line = Number(btn.getAttribute('data-line'));
        onNavigate(tab, line);
        resultsEl.hidden = true;
      });
    });
  };

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(renderResults, 200);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      resultsEl.hidden = true;
      input.blur();
    }
  });
  document.addEventListener('click', (e) => {
    if (!mount.contains(e.target)) resultsEl.hidden = true;
  });
}
