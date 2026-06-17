import { escapeHtml } from '../../../shared/htmlEscape.js';

/**
 * @param {HTMLElement | null} root
 * @param {number} line
 * @returns {boolean}
 */
export function highlightPanelRow(root, line) {
  if (!root || !line) return false;
  root.querySelectorAll('.apex-log-row-highlight').forEach((el) => {
    el.classList.remove('apex-log-row-highlight');
  });
  const row =
    root.querySelector(`tr[data-line="${line}"]`) ||
    root.querySelector(`.apex-log-gantt-row[data-log-line="${line}"]`);
  if (!row) return false;
  row.classList.add('apex-log-row-highlight');
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  window.setTimeout(() => row.classList.remove('apex-log-row-highlight'), 2500);
  return true;
}

/**
 * @param {HTMLElement[]} rows
 * @param {(line: number) => void} onJump
 */
export function bindLogTableRowNavigation(rows, onJump) {
  for (const tr of rows) {
    tr.addEventListener('click', () => onJump(Number(tr.dataset.line)));
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onJump(Number(tr.dataset.line));
      }
    });
  }
}

/**
 * @param {HTMLInputElement | null} input
 * @param {() => void} onChange
 */
export function wireSearchFilter(input, onChange) {
  input?.addEventListener('input', onChange);
}

/**
 * @param {unknown[]} rows
 * @param {string} query
 * @param {(row: unknown) => string} haystackFn
 */
export function filterRowsByQuery(rows, query, haystackFn) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => haystackFn(r).toLowerCase().includes(q));
}

/**
 * @param {number} totalMs
 * @param {number} count
 */
export function avgDurationMs(totalMs, count) {
  if (!count) return 0;
  return Math.round(totalMs / count);
}

/**
 * @param {string} op
 */
export function normalizeDmlOperation(op) {
  return String(op || '')
    .replace(/^Op:/i, '')
    .trim() || '—';
}

/**
 * @param {HTMLElement} container
 * @param {string} active
 * @param {{ id: string, label: string }[]} options
 * @param {(id: string) => void} onSelect
 */
export function mountSegmentControl(container, active, options, onSelect) {
  if (!container) return;
  container.replaceChildren();
  container.className = 'apex-log-segment';
  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'apex-log-segment-btn' + (opt.id === active ? ' is-active' : '');
    btn.textContent = opt.label;
    btn.dataset.mode = opt.id;
    btn.addEventListener('click', () => onSelect(opt.id));
    container.appendChild(btn);
  }
}

/**
 * @param {HTMLElement} el
 * @param {{ label: string, value: string }[]} chips
 */
export function renderSummaryChips(el, chips) {
  if (!el) return;
  el.innerHTML = chips
    .map((c) => `<span class="apex-log-panel-chip" title="${escapeHtml(c.label)}">${escapeHtml(c.label)}: <strong>${escapeHtml(c.value)}</strong></span>`)
    .join('');
}
