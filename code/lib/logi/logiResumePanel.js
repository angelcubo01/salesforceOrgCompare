import { escapeHtml } from '../../../shared/htmlEscape.js';
import { logiMarkdownToPlainText, renderLogiMarkdown } from '../../../shared/logi/logiMarkdown.js';
import { getCurrentLang, t } from '../../../shared/i18n.js';
import { bg } from '../../core/bridge.js';
import {
  buildInitialLogContext,
  enrichLocalToolResult,
  fetchLogLines,
  fetchParsedSection,
  getHotspots,
  getStackAround,
  highlightLogLines,
  searchLog
} from '../../../shared/logi/apexLogAiContext.js';
import { buildLogiSessionKey } from '../../../shared/logi/logiAdvisorSession.js';
import { normalizeLogiLanguage } from '../../../shared/logi/logiLanguages.js';
import {
  clearLogiSummary,
  readLogiSummary,
  writeLogiSummary
} from '../../../shared/logi/logiSummaryCache.js';
import { hashLogiSessionKey } from '../../../shared/logi/logiAiMetrics.js';

const LOGI_RESUME_AI_ICON = `<svg class="apex-log-summary-hero-logi-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2.5l1.2 3.6 3.6 1.2-3.6 1.2L12 12l-1.2-3.5-3.6-1.2 3.6-1.2L12 2.5zm6.5 7.5l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4zM6.5 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/></svg>`;

/** @type {{ getParsed: () => object | null, getRawContent: () => string, payload: object, openAskLogi: (opts?: object) => void, switchToSummary?: () => void } | null} */
let resumeOpts = null;

/** @type {string | null} */
let activeSessionKey = null;

/** @type {string | null} */
let activeRequestId = null;

/** @type {AbortController | null} */
let localAbort = null;

/** @type {'idle' | 'loading' | 'ready' | 'error'} */
let uiState = 'idle';

/** @type {string} */
let summaryText = '';

/** @type {string} */
let errorReason = '';

/** @type {string} */
let lastSummaryLang = 'en';

/** @type {boolean} */
let logiResumeUiVisible = false;

/**
 * @param {HTMLElement | null | undefined} mount
 */
function clearResumeFromMount(mount) {
  mount?.querySelector('#logiSummaryResume')?.remove();
}

/**
 * @param {string} action
 * @param {Record<string, unknown>} [props]
 */
function trackLogiUi(action, props = {}) {
  void bg({ type: 'telemetry:logiUsage', action, ...props }).catch(() => {});
}

/**
 * @param {object} opts
 */
export function mountLogiResume(opts) {
  resumeOpts = opts;
  const btn = document.getElementById('logiResumeBtn');
  if (btn && !btn.dataset.logiResumeBound) {
    btn.dataset.logiResumeBound = '1';
    btn.addEventListener('click', () => {
      void startLogiResume({ force: false });
    });
  }
}

/**
 * Keep resume button visibility in sync with Ask Logi.
 * @param {boolean} visible
 */
export function setLogiResumeButtonVisible(visible) {
  logiResumeUiVisible = visible;
  const btn = document.getElementById('logiResumeBtn');
  if (btn) {
    btn.hidden = !visible;
    const label = t('apexLogViewer.logi.resumeButton');
    const span = btn.querySelector('span[data-i18n], span');
    if (span) span.textContent = label;
    else btn.setAttribute('aria-label', label);
  }
  if (!visible) {
    cancelActiveResume();
    clearResumeFromMount(getSummaryMount());
    return;
  }
  void bindLogiResumeMount(getSummaryMount());
}

/**
 * Rehydrate or clear the Summary mount slot when Summary is re-rendered.
 * @param {HTMLElement | null} mount
 */
export async function bindLogiResumeMount(mount) {
  if (!mount) return;
  if (!logiResumeUiVisible) {
    clearResumeFromMount(mount);
    return;
  }
  const key = currentSessionKey();
  activeSessionKey = key;

  if (uiState === 'loading' && key) {
    renderResumeInto(mount, { state: 'loading' });
    return;
  }

  if (key) {
    const cached = await readLogiSummary(key);
    if (cached?.status === 'ready' && cached.text) {
      uiState = 'ready';
      summaryText = cached.text;
      errorReason = '';
      renderResumeInto(mount, { state: 'ready', text: cached.text });
      return;
    }
    if (cached?.status === 'error') {
      uiState = 'error';
      summaryText = '';
      errorReason = cached.errorReason || 'UNKNOWN';
      renderResumeInto(mount, { state: 'error', reason: errorReason });
      return;
    }
  }

  if (uiState === 'ready' && summaryText && key === activeSessionKey) {
    renderResumeInto(mount, { state: 'ready', text: summaryText });
    return;
  }

  uiState = 'idle';
  summaryText = '';
  errorReason = '';
  const el = mount.querySelector('#logiSummaryResume');
  if (el) el.remove();
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function startLogiResume(opts = {}) {
  if (!resumeOpts || !logiResumeUiVisible) return;
  const force = opts.force === true;
  const key = currentSessionKey();
  activeSessionKey = key;

  if (!force && key) {
    const cached = await readLogiSummary(key);
    if (cached?.status === 'ready' && cached.text) {
      uiState = 'ready';
      summaryText = cached.text;
      ensureSummaryTab();
      paintCurrentMount({ state: 'ready', text: cached.text });
      return;
    }
  }

  if (force && key) await clearLogiSummary(key);

  cancelActiveResume();
  uiState = 'loading';
  summaryText = '';
  errorReason = '';
  ensureSummaryTab();
  paintCurrentMount({ state: 'loading' });

  const requestId = `logi-sum-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  activeRequestId = requestId;
  localAbort = new AbortController();

  try {
    const result = await runSummaryLoop(requestId);
    if (localAbort?.signal.aborted || activeRequestId !== requestId) return;
    const text = result.text;
    uiState = 'ready';
    summaryText = text;
    errorReason = '';
    if (key) {
      await writeLogiSummary(key, { text, status: 'ready', updatedAt: Date.now() });
    }
    paintCurrentMount({ state: 'ready', text });
    trackLogiUi('summarize', {
      ...(result.aiMetrics || {}),
      sfoc_summary: true,
      sfoc_log_id: String(resumeOpts?.payload?.logId || '').slice(0, 64),
      sfoc_session_key: hashLogiSessionKey(key || '')
    });
  } catch (err) {
    if (localAbort?.signal.aborted || activeRequestId !== requestId) return;
    const reason = err?.reason || err?.message || 'UNKNOWN';
    uiState = 'error';
    summaryText = '';
    errorReason = String(reason);
    if (key) {
      await writeLogiSummary(key, {
        text: '',
        status: 'error',
        errorReason: errorReason,
        updatedAt: Date.now()
      });
    }
    paintCurrentMount({ state: 'error', reason: errorReason });
  } finally {
    if (activeRequestId === requestId) {
      activeRequestId = null;
      localAbort = null;
    }
  }
}

export function cancelActiveResume() {
  if (activeRequestId) {
    void bg({ type: 'aiAdvisor:cancel', requestId: activeRequestId }).catch(() => {});
  }
  localAbort?.abort();
  localAbort = null;
  activeRequestId = null;
}

/**
 * Open Ask Logi from the summary CTA (summary arrives as an input badge).
 * @returns {{ summaryText?: string }}
 */
export function getLogiResumeAskContext() {
  if (!summaryText) return {};
  const plain = logiMarkdownToPlainText(summaryText) || summaryText;
  return { summaryText: plain };
}

function currentSessionKey() {
  const payload = resumeOpts?.payload || {};
  return buildLogiSessionKey(payload);
}

function ensureSummaryTab() {
  resumeOpts?.switchToSummary?.();
}

function getSummaryMount() {
  return document.getElementById('apexLogSummaryMount');
}

/**
 * @param {{ state: string, text?: string, reason?: string }} view
 */
function paintCurrentMount(view) {
  if (!logiResumeUiVisible) return;
  const mount = getSummaryMount();
  if (!mount) return;
  renderResumeInto(mount, view);
}

/**
 * @param {HTMLElement} mount
 * @param {{ state: string, text?: string, reason?: string }} view
 */
function renderResumeInto(mount, view) {
  let el = mount.querySelector('#logiSummaryResume');
  if (!el) {
    el = document.createElement('div');
    el.id = 'logiSummaryResume';
    el.className = 'apex-log-summary-hero apex-log-summary-hero--logi ph-no-capture';
    const hero = mount.querySelector('.apex-log-summary-hero:not(.apex-log-summary-hero--logi)');
    if (hero?.nextSibling) {
      hero.parentNode.insertBefore(el, hero.nextSibling);
    } else if (hero) {
      hero.after(el);
    } else {
      const heading = mount.querySelector('.apex-log-panel-section-heading, h2, h3');
      if (heading?.nextSibling) heading.parentNode.insertBefore(el, heading.nextSibling);
      else mount.prepend(el);
    }
  }

  const title = t('apexLogViewer.logi.resumeTitle');
  const beta = t('apexLogViewer.logi.beta');
  const titleRow = `<div class="apex-log-summary-logi-title-row">
      <strong>${escapeHtml(title)}</strong>
      <span class="apex-log-summary-logi-beta">${escapeHtml(beta)}</span>
    </div>`;

  if (view.state === 'loading') {
    el.innerHTML = `
      <span class="apex-log-summary-hero-icon apex-log-summary-hero-icon--logi" aria-hidden="true">${LOGI_RESUME_AI_ICON}</span>
      <div class="apex-log-summary-hero-body">
        ${titleRow}
        <div class="apex-log-summary-logi-loading">
          <span class="apex-log-viewer-loading-spinner apex-log-summary-logi-spinner" aria-hidden="true"></span>
          <span>${escapeHtml(t('apexLogViewer.logi.resumeGenerating'))}</span>
        </div>
      </div>`;
    return;
  }

  if (view.state === 'error') {
    const msg = mapResumeError(view.reason);
    el.innerHTML = `
      <span class="apex-log-summary-hero-icon apex-log-summary-hero-icon--logi" aria-hidden="true">${LOGI_RESUME_AI_ICON}</span>
      <div class="apex-log-summary-hero-body">
        ${titleRow}
        <p class="apex-log-summary-logi-error">${escapeHtml(msg)}</p>
        <div class="apex-log-summary-logi-actions">
          <button type="button" class="apex-log-summary-hero-cta" data-logi-resume-action="retry">${escapeHtml(t('apexLogViewer.logi.resumeRetry'))}</button>
          <button type="button" class="apex-log-summary-hero-cta apex-log-summary-hero-cta--secondary" data-logi-resume-action="ask">${escapeHtml(t('apexLogViewer.logi.resumeAskCta'))}</button>
        </div>
      </div>`;
    wireResumeActions(el);
    return;
  }

  const bodyHtml = renderLogiMarkdown(view.text || '');
  el.innerHTML = `
    <span class="apex-log-summary-hero-icon apex-log-summary-hero-icon--logi" aria-hidden="true">${LOGI_RESUME_AI_ICON}</span>
    <div class="apex-log-summary-hero-body">
      ${titleRow}
      <div class="apex-log-summary-logi-md logi-advisor-msg-body--md">${bodyHtml}</div>
      <div class="apex-log-summary-logi-actions">
        <button type="button" class="apex-log-summary-hero-cta" data-logi-resume-action="ask">${escapeHtml(t('apexLogViewer.logi.resumeAskCta'))}</button>
        <button type="button" class="apex-log-summary-hero-cta apex-log-summary-hero-cta--secondary" data-logi-resume-action="copy">${escapeHtml(t('apexLogViewer.logi.resumeCopy'))}</button>
        <button type="button" class="apex-log-summary-hero-cta apex-log-summary-hero-cta--secondary" data-logi-resume-action="retry">${escapeHtml(t('apexLogViewer.logi.resumeRegenerate'))}</button>
      </div>
    </div>`;
  wireResumeActions(el);
  wireResumeLineRefs(el);
}

/**
 * @param {HTMLElement} el
 */
function wireResumeActions(el) {
  el.querySelectorAll('[data-logi-resume-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-logi-resume-action');
      if (action === 'retry') {
        void startLogiResume({ force: true });
      } else if (action === 'ask') {
        const ctx = getLogiResumeAskContext();
        resumeOpts?.openAskLogi?.(ctx);
      } else if (action === 'copy') {
        const plain = logiMarkdownToPlainText(summaryText || '');
        if (plain && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(plain);
        }
      }
    });
  });
}

/**
 * @param {HTMLElement} el
 */
function wireResumeLineRefs(el) {
  el.querySelectorAll('.logi-md-line-ref').forEach((btn) => {
    btn.addEventListener('click', () => {
      const start =
        Number(btn.getAttribute('data-start-line') || btn.getAttribute('data-line')) || 0;
      const end = Number(btn.getAttribute('data-end-line') || start) || start;
      if (!Number.isFinite(start) || start < 1) return;
      try {
        window.dispatchEvent(
          new CustomEvent('sfoc-logi-highlight-lines', {
            detail: { startLine: start, endLine: end > 0 ? end : start }
          })
        );
      } catch {
        /* ignore */
      }
    });
  });
}

/**
 * @param {string} [reason]
 */
function mapResumeError(reason) {
  const r = String(reason || '');
  const map = {
    LOGI_DISABLED: 'apexLogViewer.logi.error.disabled',
    TELEMETRY_REQUIRED: 'apexLogViewer.logi.error.telemetry',
    MAX_CHATS_DAY: 'apexLogViewer.logi.error.maxChatsDay',
    MAX_CHATS_MONTH: 'apexLogViewer.logi.error.maxChatsMonth',
    MAX_CHATS_USER: 'apexLogViewer.logi.error.maxChatsUser',
    MAX_ITERATIONS: 'apexLogViewer.logi.error.maxIterations',
    CANCELLED: 'apexLogViewer.logi.resumeCancelled',
    TIMEOUT: 'apexLogViewer.logi.error.timeout',
    NETWORK: 'apexLogViewer.logi.error.network'
  };
  const key = map[r];
  if (key) return t(key);
  return t('apexLogViewer.logi.resumeError');
}

/**
 * Summarize always follows Logi Settings language (not prior chat inference).
 * @returns {Promise<string | null>} null → background loads language from storage
 */
async function resolveSummaryLang() {
  try {
    const configRes = await bg({ type: 'aiAdvisor:getConfig' });
    const raw = configRes?.config?.userSettings?.logiLanguage;
    if (raw != null && String(raw).trim() !== '') {
      return normalizeLogiLanguage(raw);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string} requestId
 * @returns {Promise<{ text: string, aiMetrics: Record<string, string | number | boolean> | null }>}
 */
async function runSummaryLoop(requestId) {
  const parsed = resumeOpts?.getParsed?.() || null;
  const raw = resumeOpts?.getRawContent?.() || '';
  const payload = resumeOpts?.payload || {};
  const sessionKey =
    typeof activeSessionKey === 'string' && activeSessionKey.trim()
      ? activeSessionKey.trim()
      : buildLogiSessionKey(payload);
  const lang = await resolveSummaryLang();
  lastSummaryLang = lang || normalizeLogiLanguage(undefined);
  const initialContext = buildInitialLogContext(parsed, {
    orgId: payload.orgId,
    logId: payload.logId,
    instanceUrl: payload.instanceUrl
  });

  /** @type {object[]} */
  let messages = [];
  let skipIterationReserve = false;
  /** @type {Record<string, string | number | boolean> | null} */
  let lastAiMetrics = null;
  const maxRounds = 6;

  for (let round = 0; round < maxRounds; round += 1) {
    if (localAbort?.signal.aborted) {
      const err = new Error('CANCELLED');
      err.reason = 'CANCELLED';
      throw err;
    }

    const res = await bg({
      type: 'aiAdvisor:summarize',
      requestId,
      sessionKey: activeSessionKey,
      orgId: payload.orgId,
      logId: payload.logId,
      title: payload.title,
      instanceUrl: payload.instanceUrl,
      ...(lang ? { logiLanguage: lang } : {}),
      initialContext,
      messages,
      skipIterationReserve
    });

    if (!res?.ok) {
      const err = new Error(res?.error || res?.reason || 'UNKNOWN');
      err.reason = res?.reason || 'UNKNOWN';
      throw err;
    }

    if (res.aiMetrics && typeof res.aiMetrics === 'object') {
      lastAiMetrics = /** @type {Record<string, string | number | boolean>} */ (res.aiMetrics);
    }

    const localCalls = res.localToolCalls || [];
    if (!localCalls.length) {
      const content = String(res.content || '').trim();
      if (!content) {
        const err = new Error('EMPTY');
        err.reason = 'EMPTY';
        throw err;
      }
      return { text: content, aiMetrics: lastAiMetrics };
    }

    const assistantMsg = {
      role: 'assistant',
      content: res.content || '',
      tool_calls: localCalls
    };
    messages = [...messages, assistantMsg];

    for (const tc of localCalls) {
      const name = tc?.function?.name;
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments || '{}');
      } catch {
        args = {};
      }
      let toolResult;
      if (name === 'fetch_log_lines') {
        const fetched = fetchLogLines(raw, args.start_line, args.end_line);
        toolResult = JSON.stringify(enrichLocalToolResult(name, fetched, lang));
      } else if (name === 'fetch_parsed_section') {
        toolResult = JSON.stringify(
          enrichLocalToolResult(name, fetchParsedSection(parsed, args.section), lang)
        );
      } else if (name === 'search_log') {
        toolResult = JSON.stringify(
          enrichLocalToolResult(
            name,
            searchLog(raw, args.query, {
              maxResults: args.max_results,
              caseSensitive: args.case_sensitive
            }),
            lang
          )
        );
      } else if (name === 'get_stack_around') {
        toolResult = JSON.stringify(
          enrichLocalToolResult(
            name,
            getStackAround(raw, parsed, args.line, { radius: args.radius, reason: args.reason }),
            lang
          )
        );
      } else if (name === 'get_hotspots') {
        toolResult = JSON.stringify(
          enrichLocalToolResult(name, getHotspots(parsed, { reason: args.reason }), lang)
        );
      } else if (name === 'highlight_log_lines') {
        const highlighted = highlightLogLines(args.start_line, args.end_line, args.reason);
        try {
          window.dispatchEvent(
            new CustomEvent('sfoc-logi-highlight-lines', {
              detail: {
                startLine: highlighted.start_line,
                endLine: highlighted.end_line
              }
            })
          );
        } catch {
          /* ignore */
        }
        toolResult = JSON.stringify(enrichLocalToolResult(name, highlighted, lang));
      } else {
        toolResult = JSON.stringify({ error: true, message: `Unknown tool: ${name}` });
      }
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name,
        content: toolResult
      });
    }
    skipIterationReserve = true;
  }

  const err = new Error('MAX_ROUNDS');
  err.reason = 'MAX_ROUNDS';
  throw err;
}
