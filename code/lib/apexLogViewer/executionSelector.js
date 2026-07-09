import { escapeHtml } from '../../../shared/htmlEscape.js';
import { formatMs } from '../../../shared/apexLogParser.js';

/**
 * @param {typeof options[number]} active
 * @param {string} current
 * @param {{ id: string | number, failed?: boolean }[]} options
 */
function executionStatusTone(active, current, options) {
  if (current === 'all') {
    const failed = options.some((o) => o.id !== 'all' && o.failed);
    return failed ? 'fail' : 'ok';
  }
  return active?.failed ? 'fail' : 'ok';
}

/**
 * @param {'ok' | 'fail'} tone
 */
function statusIcon(tone) {
  return tone === 'fail' ? '✕' : '✓';
}

/**
 * @param {object | null | undefined} parsedFull
 */
export function shouldShowExecutionSelector(parsedFull) {
  const executions = parsedFull?.executions || [];
  if (executions.length <= 1) return false;
  const testExecutions = executions.filter((e) => e?.isTest);
  return testExecutions.length >= 2;
}

/**
 * @param {HTMLElement | null} mount
 * @param {object} parsedFull
 * @param {string | number} selectedId
 * @param {(id: string | number) => void} onSelect
 * @param {(key: string, params?: object) => string} t
 */
export function mountExecutionSelector(mount, parsedFull, selectedId, onSelect, t) {
  if (!mount) return;
  const executions = parsedFull?.executions || [];
  if (!shouldShowExecutionSelector(parsedFull)) {
    mount.hidden = true;
    mount.innerHTML = '';
    mount.style.display = 'none';
    return;
  }

  const options = [
    {
      id: 'all',
      label: t('apexLogViewer.execution.all'),
      failed: (parsedFull.meta?.failedExecutionCount || 0) > 0,
      durationMs: parsedFull.meta?.durationMs || 0
    },
    ...executions.map((exec) => ({
      id: exec.id,
      label: exec.label || t('apexLogViewer.execution.item', { n: exec.id + 1 }),
      failed: exec.hasError,
      durationMs: exec.durationMs || 0
    }))
  ];

  const current = String(selectedId ?? 'all');
  const active =
    options.find((opt) => String(opt.id) === current) ||
    options.find((opt) => String(opt.id) === String(executions[0]?.id)) ||
    options[0];
  const tone = executionStatusTone(active, current, options);
  const statusTitle =
    tone === 'fail' ? t('apexLogViewer.execution.failed') : t('apexLogViewer.execution.passed');

  mount.hidden = false;
  mount.style.display = '';
  mount.className = 'apex-log-execution-mount';
  mount.innerHTML = `<div class="apex-log-execution-bar">
    <div class="apex-log-execution-selector">
      <label class="apex-log-execution-selector-label" for="apexLogExecutionSelect">${escapeHtml(t('apexLogViewer.execution.label'))}</label>
      <span class="apex-log-execution-status apex-log-execution-status--${tone}" title="${escapeHtml(statusTitle)}" aria-hidden="true">${statusIcon(tone)}</span>
      <select id="apexLogExecutionSelect" class="apex-log-execution-select">
        ${options
          .map(
            (opt) =>
              `<option value="${escapeHtml(String(opt.id))}" ${String(opt.id) === current ? 'selected' : ''}>${escapeHtml(opt.label)} (${escapeHtml(formatMs(opt.durationMs))})</option>`
          )
          .join('')}
      </select>
    </div>
  </div>`;

  const select = mount.querySelector('#apexLogExecutionSelect');
  select?.addEventListener('change', () => {
    const val = select.value;
    onSelect(val === 'all' ? 'all' : Number(val));
  });
}

/**
 * @param {HTMLElement | null} el
 * @param {object} parsed
 * @param {(key: string, params?: object) => string} t
 */
export function renderExecutionToolbarBadge(el, parsed, t) {
  if (!el || !shouldShowExecutionSelector(parsed)) {
    if (el) el.hidden = true;
    return;
  }
  const total = parsed.meta.executionCount || 0;
  const failed = parsed.meta.failedExecutionCount || 0;
  el.hidden = false;
  el.textContent = t('apexLogViewer.execution.badge', { total, failed });
  el.className = 'apex-log-chip apex-log-chip--execution';
}
