import { escapeHtml } from '../../../shared/htmlEscape.js';
import { formatMs, formatLogSize } from '../../../shared/apexLogParser.js';
import { APEX_LOG_PREVIEW, createPreviewController, mountShowMoreFooter } from './analysisTableUtils.js';
import { panelSectionHeading, wirePanelHelpButtons } from './panelSectionHeading.js';

const LIMIT_KEYS = ['SOQL', 'SOQL_ROWS', 'DML', 'DML_ROWS', 'CPU', 'HEAP', 'CALLOUT'];

/**
 * @param {string} instanceUrl
 * @param {string} id
 * @param {string} prefix
 */
function recordUrl(instanceUrl, id, prefix) {
  if (!instanceUrl || !id) return '';
  const base = String(instanceUrl).replace(/\/$/, '');
  const paths = {
    '001': `/lightning/r/Account/${id}/view`,
    '500': `/lightning/r/Case/${id}/view`,
    '005': `/lightning/r/User/${id}/view`,
    '003': `/lightning/r/Contact/${id}/view`
  };
  const path = paths[prefix] || `/${id}`;
  return `${base}${path}`;
}

/**
 * @param {number} pct
 */
function limitTone(pct) {
  if (pct >= 80) return 'danger';
  if (pct >= 50) return 'warn';
  return 'ok';
}

/**
 * @param {object} parsed
 */
function buildSummaryContext(parsed) {
  const scopedExec = parsed.scopedExecution;
  const singleExec = (parsed.executions || []).length === 1 ? parsed.executions[0] : null;
  const entry = scopedExec
    ? scopedExec.codeUnitLabel || scopedExec.label || ''
    : singleExec
      ? singleExec.codeUnitLabel || singleExec.label || ''
      : '';
  const errors = (parsed.issues || []).filter((i) => i.type === 'error');
  const warnings = (parsed.issues || []).filter((i) => i.type === 'warning');
  const truncated = warnings.some((i) => i.summary === 'Log truncado');
  const slowest = [...(parsed.timeline || [])]
    .filter((ev) => ev.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 3);
  const limitPeak = parsed.limitPeak || {};
  const allLimits = LIMIT_KEYS.map((key) => {
    const p = limitPeak[key];
    if (!p?.max) return { key, used: 0, max: 0, pct: 0, line: 0 };
    const pct = Math.round((p.used / p.max) * 100);
    return { key, used: p.used, max: p.max, pct, line: p.line };
  });
  const limitsAtRisk = allLimits.filter((l) => l.max > 0 && l.pct >= 50).sort((a, b) => b.pct - a.pct);
  const records = parsed.records || {};
  const recordCounts = [
    { label: 'Account', ids: records.accounts, prefix: '001' },
    { label: 'Case', ids: records.cases, prefix: '500' },
    { label: 'Contact', ids: records.contacts, prefix: '003' },
    { label: 'User', ids: records.users, prefix: '005' }
  ].filter((r) => (r.ids || []).length > 0);
  return {
    entry,
    errors,
    warnings,
    truncated,
    slowest,
    allLimits,
    limitsAtRisk,
    recordCounts,
    duplicateGroups: (parsed.soqlDuplicates || []).length,
    soqlExempt: parsed.soqlGovernor?.exempt ?? 0,
    debugCount: (parsed.userDebug || []).length
  };
}

/**
 * @param {ReturnType<typeof buildSummaryContext>} ctx
 * @param {(key: string, params?: object) => string} t
 */
function renderHeroBanner(ctx, t) {
  let tone = 'ok';
  let title = t('apexLogViewer.summary.heroOk');
  let cta = '';
  if (ctx.errors.length) {
    tone = 'error';
    title = t('apexLogViewer.summary.heroErrors', { count: ctx.errors.length });
    cta = `<button type="button" class="apex-log-summary-hero-cta" data-line="${ctx.errors[0].line || 0}">${escapeHtml(t('apexLogViewer.summary.viewFirstError'))}</button>`;
  } else if (ctx.truncated) {
    tone = 'warn';
    title = t('apexLogViewer.summary.statusTruncated');
  } else if (ctx.warnings.length) {
    tone = 'warn';
    title = t('apexLogViewer.summary.statusWarnings', { count: ctx.warnings.length });
  }
  return `<div class="apex-log-summary-hero apex-log-summary-hero--${tone}">
    <span class="apex-log-summary-hero-icon" aria-hidden="true">${tone === 'error' ? '✕' : tone === 'warn' ? '!' : '✓'}</span>
    <div class="apex-log-summary-hero-body">
      <strong>${escapeHtml(title)}</strong>
      ${cta}
    </div>
  </div>`;
}

/**
 * @param {ReturnType<typeof buildSummaryContext>} ctx
 * @param {(key: string) => string} t
 */
function renderLimitsPanel(ctx, t) {
  const limits = ctx.allLimits.filter((l) => l.max > 0);
  if (!limits.length) {
    return `<p class="apex-log-summary-muted">${escapeHtml(t('apexLogViewer.summary.noLimitsData'))}</p>`;
  }
  return limits
    .map((l) => {
      const rowTone =
        l.pct >= 80 ? ' apex-log-summary-limit-row--warn' : l.pct >= 50 ? ' apex-log-summary-limit-row--caution' : '';
      return `<div class="apex-log-summary-limit-row${rowTone}">
        <span class="apex-log-summary-limit-key">${escapeHtml(l.key)}</span>
        <div class="apex-log-summary-limit-bar"><div class="apex-log-summary-limit-fill apex-log-summary-limit-fill--${limitTone(l.pct)}" style="width:${Math.min(100, l.pct)}%"></div></div>
        <span class="apex-log-summary-limit-val">${l.used} / ${l.max}</span>
      </div>`;
    })
    .join('');
}

/**
 * @param {object} parsed
 * @param {ReturnType<typeof buildSummaryContext>} ctx
 * @param {(key: string) => string} t
 * @param {string} recordPillsHtml
 */
function renderLeadContext(parsed, ctx, t, recordPillsHtml) {
  const rows = [];
  if (parsed.user?.name) {
    rows.push(
      `<div class="apex-log-summary-lead-row"><span class="apex-log-summary-lead-k">${escapeHtml(t('apexLogViewer.summary.user'))}</span><span class="apex-log-summary-lead-v">${escapeHtml(parsed.user.name)}</span></div>`
    );
  }
  if (ctx.entry) {
    rows.push(
      `<div class="apex-log-summary-lead-row"><span class="apex-log-summary-lead-k">${escapeHtml(t('apexLogViewer.summary.entryPoint'))}</span><span class="apex-log-summary-lead-v">${escapeHtml(ctx.entry)}</span></div>`
    );
  }
  if (!rows.length && !recordPillsHtml) return '';
  return `<section class="apex-log-summary-lead">
    <div class="apex-log-summary-lead-rows">${rows.join('')}</div>
    ${recordPillsHtml ? `<div class="apex-log-summary-lead-records">${recordPillsHtml}</div>` : ''}
  </section>`;
}

/**
 * @param {ReturnType<typeof buildSummaryContext>} ctx
 * @param {(key: string, params?: object) => string} t
 */
function renderStatusPanel(ctx, t, errorCtrl) {
  const items = [];
  if (ctx.errors.length && errorCtrl) {
    const visible = errorCtrl.slice(ctx.errors);
    items.push(
      `<div class="apex-log-summary-status-heading">${escapeHtml(t('apexLogViewer.summary.statusErrors', { count: ctx.errors.length }))}</div>`
    );
    for (const err of visible) {
      const apexHint =
        err.apexClass && err.apexLine
          ? `<span class="apex-log-summary-status-apex">${escapeHtml(err.apexClass)}:${err.apexLine}</span>`
          : '';
      items.push(
        `<div class="apex-log-summary-status apex-log-summary-status--error">
          <span class="apex-log-summary-status-label">${escapeHtml(err.summary || t('apexLogViewer.errors.unknown'))}</span>
          <p class="apex-log-summary-status-detail">${escapeHtml(err.description || '—')}</p>
          ${apexHint}
          ${err.line ? `<button type="button" class="apex-log-summary-link-btn" data-line="${err.line}">${escapeHtml(t('apexLogViewer.summary.viewLine'))}</button>` : ''}
        </div>`
      );
    }
  } else {
    items.push(
      `<div class="apex-log-summary-status apex-log-summary-status--ok">
        <span class="apex-log-summary-status-label">${escapeHtml(t('apexLogViewer.summary.statusOk'))}</span>
      </div>`
    );
  }
  if (ctx.truncated) {
    items.push(
      `<div class="apex-log-summary-status apex-log-summary-status--warn">
        <span class="apex-log-summary-status-label">${escapeHtml(t('apexLogViewer.summary.statusTruncated'))}</span>
      </div>`
    );
  }
  return items.join('');
}

/**
 * @param {object} parsed
 * @param {ReturnType<typeof buildSummaryContext>} ctx
 * @param {(key: string) => string} t
 */
function buildQuickNav(parsed, ctx, t) {
  const tabs = [];
  const push = (id, labelKey) => tabs.push({ id, label: t(labelKey) });
  if (ctx.errors.length) push('errors', 'apexLogViewer.summary.navErrors');
  if ((parsed.soql || []).length || (parsed.dml || []).length) push('database', 'apexLogViewer.tab.database');
  if (ctx.allLimits.some((l) => l.max > 0)) push('database', 'apexLogViewer.tab.limits');
  if ((parsed.timeline || []).length) push('timeline', 'apexLogViewer.tab.timeline');
  if ((parsed.callouts || []).length || ctx.debugCount) push('network', 'apexLogViewer.tab.network');
  const seen = new Set();
  return tabs.filter((tab) => {
    if (seen.has(tab.id)) return false;
    seen.add(tab.id);
    return true;
  });
}

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string, params?: object) => string} t
 * @param {{ instanceUrl?: string, onTabSwitch?: (tabId: string) => void }} [opts]
 */
export function renderSummaryView(mount, parsed, onJump, t, opts = {}) {
  if (!mount || !parsed) return;
  const instanceUrl = opts.instanceUrl || '';
  const onTabSwitch = opts.onTabSwitch;
  const ctx = buildSummaryContext(parsed);

  const limitPeak = parsed.limitPeak || {};
  const soqlPeak = limitPeak.SOQL;
  const calloutPeak = limitPeak.CALLOUT;
  const soqlGovernor = parsed.soqlGovernor || {};
  const soqlCounted =
    soqlGovernor.counted ??
    (parsed.soql || []).filter((s) => s.countsTowardSoqlLimit !== false).length;
  const soqlLimitDisplay = soqlPeak?.used ?? soqlCounted;

  const recordPills = [];
  for (const { label, ids, prefix } of ctx.recordCounts) {
    const count = ids.length;
    const countBadge = count > 1 ? `<span class="apex-log-summary-record-count">${count}</span>` : '';
    const items = ids
      .map((id) => {
        const url = recordUrl(instanceUrl, id, prefix);
        const idText = escapeHtml(id);
        const inner = `<span class="apex-log-summary-record-item-name" data-role="name">${idText}</span><span class="apex-log-summary-record-item-id">${idText}</span>`;
        return url
          ? `<a class="apex-log-summary-record-item" role="menuitem" href="${escapeHtml(url)}" target="_blank" rel="noopener" data-record-id="${idText}">${inner}</a>`
          : `<span class="apex-log-summary-record-item" role="menuitem" data-record-id="${idText}">${inner}</span>`;
      })
      .join('');
    recordPills.push(
      `<div class="apex-log-summary-record-dd" data-prefix="${escapeHtml(prefix)}">
        <button type="button" class="apex-log-summary-record-pill" aria-haspopup="true" aria-expanded="false">${escapeHtml(label)}${countBadge}<span class="apex-log-summary-record-caret" aria-hidden="true">▾</span></button>
        <div class="apex-log-summary-record-menu" role="menu" hidden>${items}</div>
      </div>`
    );
  }

  const quickNav = buildQuickNav(parsed, ctx, t);
  const errorCtrl = createPreviewController(APEX_LOG_PREVIEW.summaryErrors);
  const recordPillsHtml = recordPills.join('');
  const leadContext = renderLeadContext(parsed, ctx, t, recordPillsHtml);

  mount.innerHTML = `
    ${panelSectionHeading('summary', t('apexLogViewer.tab.summary'), t)}
    ${renderHeroBanner(ctx, t)}
    ${leadContext}
    <div class="apex-log-summary-grid">
      <div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.meta.duration'))}</span>
        <strong>${escapeHtml(formatMs(parsed.meta?.durationMs || 0))}</strong>
      </div>
      <div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.meta.size'))}</span>
        <strong>${escapeHtml(formatLogSize(parsed.meta?.sizeBytes || 0))}</strong>
      </div>
      <div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.summary.soqlCount'))}</span>
        <strong>${soqlLimitDisplay}${soqlPeak ? ` / ${soqlPeak.max}` : ''}</strong>
      </div>
      <div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.summary.dmlCount'))}</span>
        <strong>${(parsed.dml || []).length}</strong>
      </div>
      <div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.summary.calloutCount'))}</span>
        <strong>${(parsed.callouts || []).length}${calloutPeak ? ` / ${calloutPeak.max}` : ''}</strong>
      </div>
      <div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.summary.errors'))}</span>
        <strong class="${ctx.errors.length ? 'apex-log-text--error' : ''}">${ctx.errors.length}</strong>
      </div>
      ${
        ctx.debugCount
          ? `<div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.summary.debugCount'))}</span>
        <strong>${ctx.debugCount}</strong>
      </div>`
          : ''
      }
    </div>
    <div class="apex-log-summary-panels">
      <section class="apex-log-summary-panel" id="apexLogSummaryStatusPanel">
        <h3>${escapeHtml(t('apexLogViewer.summary.panelStatus'))}</h3>
      </section>
      <section class="apex-log-summary-panel" id="apexLogSummaryLimitsPanel">
        <h3>${escapeHtml(t('apexLogViewer.summary.panelLimits'))}</h3>
        <div id="apexLogSummaryLimitsBody">${renderLimitsPanel(ctx, t)}</div>
      </section>
    </div>
    ${
      quickNav.length
        ? `<div class="apex-log-summary-quicknav">
        <span class="apex-log-summary-quicknav-label">${escapeHtml(t('apexLogViewer.summary.quickNav'))}</span>
        <div class="apex-log-summary-quicknav-btns">
          ${quickNav.map((tab) => `<button type="button" class="apex-log-summary-quicknav-btn" data-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`).join('')}
        </div>
      </div>`
        : ''
    }`;

  const statusPanel = mount.querySelector('#apexLogSummaryStatusPanel');

  const wireStatusPanel = () => {
    if (!statusPanel) return;
    const heading = statusPanel.querySelector('h3');
    statusPanel.innerHTML = '';
    if (heading) statusPanel.appendChild(heading);
    const body = document.createElement('div');
    body.innerHTML = renderStatusPanel(ctx, t, errorCtrl);
    statusPanel.appendChild(body);
    statusPanel.querySelectorAll('[data-line]').forEach((el) => {
      el.addEventListener('click', () => onJump(Number(el.getAttribute('data-line'))));
    });
    mountShowMoreFooter(
      statusPanel,
      errorCtrl,
      ctx.errors.length,
      APEX_LOG_PREVIEW.summaryErrors,
      t,
      wireStatusPanel
    );
  };

  wireStatusPanel();

  mount.querySelectorAll('[data-line]').forEach((el) => {
    el.addEventListener('click', () => onJump(Number(el.getAttribute('data-line'))));
  });
  mount.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId && onTabSwitch) onTabSwitch(tabId);
    });
  });
  setupRecordDropdowns(mount, opts.resolveRecords, t);
  wirePanelHelpButtons(mount, t);
}

function setupRecordDropdowns(mount, resolveRecords, t) {
  const dropdowns = mount.querySelectorAll('.apex-log-summary-record-dd');
  dropdowns.forEach((dd) => {
    const pill = dd.querySelector('.apex-log-summary-record-pill');
    const menu = dd.querySelector('.apex-log-summary-record-menu');
    if (!pill || !menu) return;
    let closeTimer = 0;
    let namesLoaded = false;

    const loadNames = async () => {
      if (namesLoaded || typeof resolveRecords !== 'function') return;
      namesLoaded = true;
      const items = [...menu.querySelectorAll('.apex-log-summary-record-item')];
      const ids = items.map((el) => el.getAttribute('data-record-id')).filter(Boolean);
      if (!ids.length) return;
      for (const el of items) {
        const nameEl = el.querySelector('[data-role="name"]');
        if (nameEl) nameEl.textContent = t('apexLogViewer.summary.recordLoading');
      }
      let recordsById = {};
      try {
        recordsById = (await resolveRecords(ids)) || {};
      } catch {
        recordsById = {};
      }
      for (const el of items) {
        const id = el.getAttribute('data-record-id') || '';
        const nameEl = el.querySelector('[data-role="name"]');
        if (!nameEl) continue;
        const info = recordsById[id];
        nameEl.textContent = info && info.name ? info.name : id;
      }
    };

    const open = () => {
      window.clearTimeout(closeTimer);
      for (const other of dropdowns) {
        if (other !== dd) closeDropdown(other);
      }
      menu.hidden = false;
      pill.setAttribute('aria-expanded', 'true');
      void loadNames();
    };
    const close = () => {
      menu.hidden = true;
      pill.setAttribute('aria-expanded', 'false');
    };

    dd.addEventListener('mouseenter', open);
    dd.addEventListener('mouseleave', () => {
      closeTimer = window.setTimeout(close, 150);
    });
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      if (menu.hidden) open();
      else close();
    });
    pill.addEventListener('focus', open);
    dd.addEventListener('focusout', (e) => {
      if (!dd.contains(e.relatedTarget)) close();
    });
    dd.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        close();
        pill.focus();
      }
    });
  });
}

function closeDropdown(dd) {
  const pill = dd.querySelector('.apex-log-summary-record-pill');
  const menu = dd.querySelector('.apex-log-summary-record-menu');
  if (menu) menu.hidden = true;
  if (pill) pill.setAttribute('aria-expanded', 'false');
}
