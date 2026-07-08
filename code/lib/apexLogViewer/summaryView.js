import { escapeHtml } from '../../../shared/htmlEscape.js';
import { formatMs, formatLogSize } from '../../../shared/apexLogParser.js';
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
 * @param {object} parsed
 */
function buildSummaryContext(parsed) {
  const codeUnits = parsed.codeUnits || [];
  const entry =
    codeUnits.find((cu) => /\[EXTERNAL\]/i.test(cu.label))?.label ||
    codeUnits[0]?.label ||
    parsed.profiling?.methods?.[0]?.detail ||
    '';
  const errors = (parsed.issues || []).filter((i) => i.type === 'error');
  const warnings = (parsed.issues || []).filter((i) => i.type === 'warning');
  const truncated = warnings.some((i) => i.summary === 'Log truncado');
  const slowest = [...(parsed.timeline || [])]
    .filter((ev) => ev.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)[0];
  const limitPeak = parsed.limitPeak || {};
  const limitsAtRisk = LIMIT_KEYS.map((key) => {
    const p = limitPeak[key];
    if (!p?.max) return null;
    const pct = Math.round((p.used / p.max) * 100);
    return { key, used: p.used, max: p.max, pct, line: p.line };
  })
    .filter(Boolean)
    .filter((l) => l.pct >= 50)
    .sort((a, b) => b.pct - a.pct);
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
function renderStatusPanel(ctx, t) {
  const items = [];
  if (ctx.errors.length) {
    const first = ctx.errors[0];
    items.push(
      `<div class="apex-log-summary-status apex-log-summary-status--error">
        <span class="apex-log-summary-status-label">${escapeHtml(t('apexLogViewer.summary.statusErrors', { count: ctx.errors.length }))}</span>
        <p class="apex-log-summary-status-detail">${escapeHtml(first.summary)}${first.description ? ` — ${escapeHtml(first.description.slice(0, 120))}` : ''}</p>
        ${first.line ? `<button type="button" class="apex-log-summary-link-btn" data-line="${first.line}">${escapeHtml(t('apexLogViewer.summary.viewLine'))}</button>` : ''}
      </div>`
    );
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
  } else if (ctx.warnings.length && !ctx.errors.length) {
    items.push(
      `<div class="apex-log-summary-status apex-log-summary-status--warn">
        <span class="apex-log-summary-status-label">${escapeHtml(t('apexLogViewer.summary.statusWarnings', { count: ctx.warnings.length }))}</span>
      </div>`
    );
  }
  return items.join('');
}

/**
 * @param {ReturnType<typeof buildSummaryContext>} ctx
 * @param {(key: string, params?: object) => string} t
 */
function renderLimitsPanel(ctx, t) {
  if (!ctx.limitsAtRisk.length) {
    return `<p class="apex-log-summary-muted">${escapeHtml(t('apexLogViewer.summary.noLimitsRisk'))}</p>`;
  }
  return ctx.limitsAtRisk
    .slice(0, 4)
    .map((l) => {
      const warn = l.pct >= 80 ? ' apex-log-summary-limit-row--warn' : '';
      return `<div class="apex-log-summary-limit-row${warn}">
        <span class="apex-log-summary-limit-key">${escapeHtml(l.key)}</span>
        <div class="apex-log-summary-limit-bar"><div class="apex-log-summary-limit-fill" style="width:${Math.min(100, l.pct)}%"></div></div>
        <span class="apex-log-summary-limit-val">${l.used} / ${l.max}</span>
      </div>`;
    })
    .join('');
}

/**
 * @param {ReturnType<typeof buildSummaryContext>} ctx
 * @param {(key: string, params?: object) => string} t
 * @param {(line: number) => void} onJump
 */
function renderHighlights(ctx, t, onJump) {
  const lines = [];
  if (ctx.slowest) {
    lines.push(
      `<button type="button" class="apex-log-summary-highlight" data-line="${ctx.slowest.line}">
        <span class="apex-log-summary-highlight-kicker">${escapeHtml(t('apexLogViewer.summary.slowestOp'))}</span>
        <span class="apex-log-summary-highlight-body">${escapeHtml(formatMs(ctx.slowest.durationMs))} · ${escapeHtml(t(`apexLogViewer.kind.${ctx.slowest.type}`) || ctx.slowest.type)} · ${escapeHtml(ctx.slowest.label)}</span>
      </button>`
    );
  }
  if (ctx.duplicateGroups > 0) {
    lines.push(
      `<div class="apex-log-summary-highlight apex-log-summary-highlight--static">
        <span class="apex-log-summary-highlight-kicker">${escapeHtml(t('apexLogViewer.summary.soqlDuplicates'))}</span>
        <span class="apex-log-summary-highlight-body">${escapeHtml(t('apexLogViewer.summary.soqlDuplicatesDetail', { count: ctx.duplicateGroups }))}</span>
      </div>`
    );
  }
  if (ctx.soqlExempt > 0) {
    lines.push(
      `<div class="apex-log-summary-highlight apex-log-summary-highlight--static">
        <span class="apex-log-summary-highlight-kicker">${escapeHtml(t('apexLogViewer.summary.soqlExempt'))}</span>
        <span class="apex-log-summary-highlight-body">${escapeHtml(t('apexLogViewer.summary.soqlExemptDetail', { count: ctx.soqlExempt }))}</span>
      </div>`
    );
  }
  if (!lines.length) {
    return `<p class="apex-log-summary-muted">${escapeHtml(t('apexLogViewer.summary.noHighlights'))}</p>`;
  }
  return lines.join('');
}

/**
 * @param {object} parsed
 * @param {ReturnType<typeof buildSummaryContext>} ctx
 * @param {(key: string, params?: object) => string} t
 */
function buildQuickNav(parsed, ctx, t) {
  /** @type {{ id: string, label: string }[]} */
  const tabs = [];
  const push = (id, labelKey) => {
    tabs.push({ id, label: t(labelKey) });
  };
  if (ctx.errors.length) push('text', 'apexLogViewer.summary.navErrors');
  if ((parsed.soql || []).length) push('soql', 'apexLogViewer.tab.soql');
  if (ctx.limitsAtRisk.length || Object.keys(parsed.limitPeak || {}).length) {
    push('limits', 'apexLogViewer.tab.limits');
  }
  if ((parsed.timeline || []).length) push('timeline', 'apexLogViewer.tab.timeline');
  if ((parsed.callouts || []).length) push('callouts', 'apexLogViewer.tab.callouts');
  if ((parsed.dml || []).length) push('dml', 'apexLogViewer.tab.dml');
  if (ctx.debugCount) push('debug', 'apexLogViewer.tab.debug');
  return tabs;
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

  const contextItems = [];
  if (parsed.user?.name) {
    contextItems.push(
      `<span class="apex-log-summary-context-item"><span class="apex-log-summary-context-k">${escapeHtml(t('apexLogViewer.summary.user'))}</span>${escapeHtml(parsed.user.name)}</span>`
    );
  }
  if (ctx.entry) {
    contextItems.push(
      `<span class="apex-log-summary-context-item"><span class="apex-log-summary-context-k">${escapeHtml(t('apexLogViewer.summary.entryPoint'))}</span>${escapeHtml(ctx.entry)}</span>`
    );
  }
  if (ctx.debugCount) {
    contextItems.push(
      `<span class="apex-log-summary-context-item"><span class="apex-log-summary-context-k">${escapeHtml(t('apexLogViewer.summary.debugCount'))}</span>${ctx.debugCount}</span>`
    );
  }

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

  mount.innerHTML = `
    ${panelSectionHeading('summary', t('apexLogViewer.tab.summary'), t)}
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
    </div>
    ${
      contextItems.length || recordPills.length
        ? `<div class="apex-log-summary-context">${contextItems.join('')}<span class="apex-log-summary-context-records">${recordPills.join('')}</span></div>`
        : ''
    }
    <div class="apex-log-summary-panels">
      <section class="apex-log-summary-panel">
        <h3>${escapeHtml(t('apexLogViewer.summary.panelStatus'))}</h3>
        ${renderStatusPanel(ctx, t)}
      </section>
      <section class="apex-log-summary-panel">
        <h3>${escapeHtml(t('apexLogViewer.summary.panelLimits'))}</h3>
        ${renderLimitsPanel(ctx, t)}
      </section>
    </div>
    <section class="apex-log-summary-panel apex-log-summary-panel--full">
      <h3>${escapeHtml(t('apexLogViewer.summary.panelHighlights'))}</h3>
      <div class="apex-log-summary-highlights" id="apexLogSummaryHighlights">${renderHighlights(ctx, t, onJump)}</div>
    </section>
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

  mount.querySelectorAll('[data-line]').forEach((el) => {
    el.addEventListener('click', () => onJump(Number(el.getAttribute('data-line'))));
  });
  mount.querySelectorAll('.apex-log-summary-quicknav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId && onTabSwitch) onTabSwitch(tabId);
    });
  });
  setupRecordDropdowns(mount, opts.resolveRecords, t);
  wirePanelHelpButtons(mount, t);
}

/**
 * Convierte los pills de registros relacionados en desplegables que se abren
 * al pasar el ratón, con foco o clic, y resuelve los nombres de los registros
 * de forma diferida la primera vez que se abren.
 * @param {HTMLElement} mount
 * @param {((ids: string[]) => Promise<Record<string, { name?: string, type?: string }>>) | undefined} resolveRecords
 * @param {(key: string, params?: object) => string} t
 */
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
