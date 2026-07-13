import { escapeHtml } from '../../../shared/htmlEscape.js';
import { getCurrentLang, t } from '../../../shared/i18n.js';
import { bg } from '../../core/bridge.js';
import { bootstrapLogiAdvisor, LOGI_ADVISOR_READY_EVENT } from '../../../shared/posthogLogiAdvisorFlag.js';
import {
  buildInitialLogContext,
  fetchLogLines,
  fetchParsedSection,
  quickActionUserMessage
} from '../../../shared/apexLogAiContext.js';

const LOGI_AVATAR_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 5a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm10 0v4h4M8 13h8M8 17h5"/></svg>`;

/** @typedef {{ role: string, content?: string, tool_calls?: object[], tool_call_id?: string, name?: string }} ChatMessage */

let modalEl = null;
let btnEl = null;
/** @type {ChatMessage[]} */
let messages = [];
let iteration = 0;
let isNewChat = true;
/** @type {object | null} */
let advisorConfig = null;
let busy = false;

/**
 * @param {object} opts
 */
export async function mountLogiAdvisor(opts) {
  const { getParsed, getRawContent, payload } = opts;
  btnEl = document.getElementById('logiAdvisorBtn');
  if (!btnEl) return;

  await bootstrapLogiAdvisor({ force: true });
  await refreshConfig();

  document.addEventListener(LOGI_ADVISOR_READY_EVENT, () => {
    void refreshConfig();
  });

  btnEl.addEventListener('click', () => {
    openLogiModal({
      getParsed,
      getRawContent,
      payload: payload || {}
    });
  });
}

async function refreshConfig() {
  const res = await bg({ type: 'aiAdvisor:getConfig' });
  advisorConfig = res?.config || null;
  if (!btnEl) return;
  const show = advisorConfig?.enabled && advisorConfig?.showButton && advisorConfig?.operational;
  btnEl.hidden = !show;
  btnEl.textContent = t('apexLogViewer.logi.button');
}

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement('div');
  modalEl.className = 'logi-advisor-modal ph-no-capture';
  modalEl.hidden = true;
  modalEl.innerHTML = `
    <div class="logi-advisor-backdrop" data-close="1"></div>
    <div class="logi-advisor-dialog" role="dialog" aria-modal="true" aria-labelledby="logiAdvisorTitle">
      <header class="logi-advisor-header">
        <span class="logi-advisor-avatar">${LOGI_AVATAR_SVG}</span>
        <div class="logi-advisor-header-text">
          <h2 id="logiAdvisorTitle"></h2>
          <span class="logi-advisor-beta" id="logiAdvisorBeta"></span>
        </div>
        <button type="button" class="logi-advisor-close" data-close="1" aria-label="Close">×</button>
      </header>
      <div class="logi-advisor-quick" id="logiAdvisorQuick"></div>
      <div class="logi-advisor-messages ph-no-capture" id="logiAdvisorMessages"></div>
      <div class="logi-advisor-privacy" id="logiAdvisorPrivacy"></div>
      <footer class="logi-advisor-footer">
        <div class="logi-advisor-input-row">
          <textarea id="logiAdvisorInput" class="logi-advisor-input" rows="2"></textarea>
          <button type="button" id="logiAdvisorSend" class="logi-advisor-send"></button>
        </div>
        <span class="logi-advisor-iterations" id="logiAdvisorIterations"></span>
      </footer>
    </div>`;
  document.body.appendChild(modalEl);

  modalEl.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeLogiModal());
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl && !modalEl.hidden) closeLogiModal();
  });

  modalEl.querySelector('#logiAdvisorSend')?.addEventListener('click', () => {
    void onSendFromInput();
  });
  modalEl.querySelector('#logiAdvisorInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onSendFromInput();
    }
  });

  return modalEl;
}

export function closeLogiModal() {
  if (modalEl) modalEl.hidden = true;
}

/**
 * @param {object} ctx
 */
function openLogiModal(ctx) {
  const modal = ensureModal();
  messages = [];
  iteration = 0;
  isNewChat = true;
  busy = false;
  modal._ctx = ctx;

  const titleEl = modal.querySelector('#logiAdvisorTitle');
  const betaEl = modal.querySelector('#logiAdvisorBeta');
  const privacyEl = modal.querySelector('#logiAdvisorPrivacy');
  const sendBtn = modal.querySelector('#logiAdvisorSend');
  const inputEl = modal.querySelector('#logiAdvisorInput');
  const closeBtn = modal.querySelector('.logi-advisor-close');

  if (titleEl) titleEl.textContent = t('apexLogViewer.logi.title');
  if (betaEl) {
    betaEl.textContent = advisorConfig?.beta ? t('apexLogViewer.logi.beta') : '';
    betaEl.hidden = !advisorConfig?.beta;
  }
  if (privacyEl) privacyEl.textContent = t('apexLogViewer.logi.privacyNotice');
  if (sendBtn) sendBtn.textContent = t('apexLogViewer.logi.send');
  if (inputEl) {
    inputEl.placeholder = t('apexLogViewer.logi.inputPlaceholder');
    inputEl.value = '';
  }
  if (closeBtn) closeBtn.setAttribute('aria-label', t('apexLogViewer.logi.close'));

  renderQuickActions(modal);
  renderMessages(modal);
  updateIterationsLabel(modal);

  appendAssistantMessage(t('apexLogViewer.logi.greeting'), modal);
  modal.hidden = false;
  inputEl?.focus();
}

/**
 * @param {HTMLElement} modal
 */
function renderQuickActions(modal) {
  const mount = modal.querySelector('#logiAdvisorQuick');
  if (!mount) return;
  const actions = advisorConfig?.quickActions || [];
  const labels = {
    debug_errors: t('apexLogViewer.logi.action.debugErrors'),
    explain_flow: t('apexLogViewer.logi.action.explainFlow'),
    soql_dml: t('apexLogViewer.logi.action.soqlDml'),
    test_failure: t('apexLogViewer.logi.action.testFailure'),
    limits: t('apexLogViewer.logi.action.limits'),
    suggest_fix: t('apexLogViewer.logi.action.suggestFix')
  };
  mount.innerHTML = actions
    .map(
      (id) =>
        `<button type="button" class="logi-advisor-chip" data-action="${escapeHtml(id)}">${escapeHtml(labels[id] || id)}</button>`
    )
    .join('');
  mount.querySelectorAll('.logi-advisor-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const actionId = btn.getAttribute('data-action');
      if (!actionId || busy) return;
      const lang = getCurrentLang() === 'en' ? 'en' : 'es';
      void sendUserMessage(quickActionUserMessage(actionId, lang), modal);
    });
  });
}

/**
 * @param {HTMLElement} modal
 */
function renderMessages(modal) {
  const mount = modal.querySelector('#logiAdvisorMessages');
  if (!mount) return;
  mount.innerHTML = messages
    .map((m) => {
      if (m.role === 'user') {
        return `<div class="logi-advisor-msg logi-advisor-msg--user"><div class="logi-advisor-msg-body">${escapeHtml(m.content || '')}</div></div>`;
      }
      if (m.role === 'assistant') {
        return `<div class="logi-advisor-msg logi-advisor-msg--assistant">
          <span class="logi-advisor-msg-avatar">${LOGI_AVATAR_SVG}</span>
          <div class="logi-advisor-msg-wrap">
            <span class="logi-advisor-msg-name">Logi</span>
            <div class="logi-advisor-msg-body">${formatAssistantHtml(m.content || '')}</div>
          </div>
        </div>`;
      }
      if (m.role === 'system') {
        return `<div class="logi-advisor-msg logi-advisor-msg--system">${escapeHtml(m.content || '')}</div>`;
      }
      return '';
    })
    .join('');
  mount.scrollTop = mount.scrollHeight;
}

/**
 * @param {string} text
 */
function formatAssistantHtml(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/\n/g, '<br>');
}

/**
 * @param {string} text
 * @param {HTMLElement} modal
 */
function appendAssistantMessage(text, modal) {
  messages.push({ role: 'assistant', content: text });
  renderMessages(modal);
}

/**
 * @param {HTMLElement} modal
 */
function updateIterationsLabel(modal) {
  const el = modal.querySelector('#logiAdvisorIterations');
  const max = advisorConfig?.maxIterationsPerChat || 10;
  if (el) {
    el.textContent = t('apexLogViewer.logi.iterations', { current: iteration, max });
  }
}

async function onSendFromInput() {
  const modal = modalEl;
  if (!modal || busy) return;
  const input = modal.querySelector('#logiAdvisorInput');
  const text = input?.value?.trim();
  if (!text) return;
  if (input) input.value = '';
  await sendUserMessage(text, modal);
}

/**
 * @param {string} text
 * @param {HTMLElement} modal
 */
async function sendUserMessage(text, modal) {
  if (busy) return;
  busy = true;
  messages.push({ role: 'user', content: text });
  renderMessages(modal);

  iteration += 1;
  updateIterationsLabel(modal);

  const ctx = modal._ctx || {};
  const parsed = ctx.getParsed?.();
  const raw = ctx.getRawContent?.() || '';
  const payload = ctx.payload || {};
  const lang = getCurrentLang() === 'en' ? 'en' : 'es';

  const initialContext = buildInitialLogContext(parsed, {
    orgId: payload.orgId,
    logId: payload.logId,
    instanceUrl: payload.instanceUrl
  });

  let res = await bg({
    type: 'aiAdvisor:chat',
    messages: messages.filter(
      (m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool'
    ),
    initialContext,
    orgId: payload.orgId || '',
    logId: payload.logId || '',
    lang,
    iteration,
    isNewChat
  });
  isNewChat = false;

  if (!res?.ok) {
    appendAssistantMessage(mapErrorReason(res?.reason, res?.error), modal);
    busy = false;
    return;
  }

  await processLlmResponse(res, modal, ctx, parsed, raw, payload, lang);
  busy = false;
}

/**
 * @param {object} res
 * @param {HTMLElement} modal
 * @param {object} ctx
 * @param {object} parsed
 * @param {string} raw
 * @param {object} payload
 * @param {'es'|'en'} lang
 */
async function processLlmResponse(res, modal, ctx, parsed, raw, payload, lang) {
  if (res.content) {
    messages.push({ role: 'assistant', content: res.content });
    renderMessages(modal);
  }

  const localCalls = res.localToolCalls || [];
  for (const tc of localCalls) {
    const name = tc?.function?.name;
    let args = {};
    try {
      args = JSON.parse(tc.function?.arguments || '{}');
    } catch {
      args = {};
    }

    let toolResult = '';
    if (name === 'fetch_log_lines') {
      const fetched = fetchLogLines(raw, args.start_line, args.end_line);
      toolResult = JSON.stringify(fetched);
    } else if (name === 'fetch_parsed_section') {
      toolResult = JSON.stringify(fetchParsedSection(parsed, args.section));
    } else {
      toolResult = JSON.stringify({ error: 'unknown_tool' });
    }

    messages.push({
      role: 'assistant',
      content: '',
      tool_calls: [tc]
    });
    messages.push({
      role: 'tool',
      tool_call_id: tc.id,
      name,
      content: toolResult
    });

    iteration += 1;
    updateIterationsLabel(modal);

    const followUp = await bg({
      type: 'aiAdvisor:chat',
      messages,
      initialContext: buildInitialLogContext(parsed, {
        orgId: payload.orgId,
        logId: payload.logId,
        instanceUrl: payload.instanceUrl
      }),
      orgId: payload.orgId || '',
      logId: payload.logId || '',
      lang,
      iteration,
      isNewChat: false
    });

    if (!followUp?.ok) {
      appendAssistantMessage(mapErrorReason(followUp?.reason, followUp?.error), modal);
      return;
    }
    await processLlmResponse(followUp, modal, ctx, parsed, raw, payload, lang);
    return;
  }

  if (res.pendingOrgQuery && payload.orgId) {
    const approved = await showOrgQueryApproval(res.pendingOrgQuery, payload.orgId);
    if (!approved) {
      appendAssistantMessage(t('apexLogViewer.logi.queryDenied'), modal);
      return;
    }

    const queryRes = await bg({
      type: 'aiAdvisor:runQuery',
      orgId: payload.orgId,
      variant: res.pendingOrgQuery.variant,
      queryText: res.pendingOrgQuery.queryText
    });

    const toolContent = queryRes?.ok
      ? JSON.stringify({ records: queryRes.records, totalSize: queryRes.totalSize })
      : JSON.stringify({ error: queryRes?.error || queryRes?.reason || 'query_failed' });

    messages.push({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: res.pendingOrgQuery.toolCallId,
          type: 'function',
          function: {
            name: 'org_query',
            arguments: JSON.stringify({
              variant: res.pendingOrgQuery.variant,
              query_text: res.pendingOrgQuery.queryText
            })
          }
        }
      ]
    });
    messages.push({
      role: 'tool',
      tool_call_id: res.pendingOrgQuery.toolCallId,
      name: 'org_query',
      content: toolContent
    });

    iteration += 1;
    updateIterationsLabel(modal);

    const followUp = await bg({
      type: 'aiAdvisor:chat',
      messages,
      initialContext: buildInitialLogContext(parsed, {
        orgId: payload.orgId,
        logId: payload.logId,
        instanceUrl: payload.instanceUrl
      }),
      orgId: payload.orgId,
      logId: payload.logId || '',
      lang,
      iteration,
      isNewChat: false
    });

    if (!followUp?.ok) {
      appendAssistantMessage(mapErrorReason(followUp?.reason, followUp?.error), modal);
      return;
    }
    await processLlmResponse(followUp, modal, ctx, parsed, raw, payload, lang);
  }
}

/**
 * @param {object} pending
 * @param {string} orgId
 */
function showOrgQueryApproval(pending, orgId) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'logi-advisor-approval ph-no-capture';
    overlay.innerHTML = `
      <div class="logi-advisor-approval-panel" role="alertdialog" aria-modal="true">
        <h3>${escapeHtml(t('apexLogViewer.logi.queryApprovalTitle'))}</h3>
        <p class="logi-advisor-approval-reason">${escapeHtml(pending.reason || '')}</p>
        <dl class="logi-advisor-approval-meta">
          <dt>${escapeHtml(t('apexLogViewer.logi.queryOrg'))}</dt><dd>${escapeHtml(orgId)}</dd>
          <dt>${escapeHtml(t('apexLogViewer.logi.queryVariant'))}</dt><dd>${escapeHtml(pending.variant)}</dd>
        </dl>
        <pre class="logi-advisor-approval-query">${escapeHtml(pending.queryText)}</pre>
        <div class="logi-advisor-approval-actions">
          <button type="button" class="logi-advisor-approval-deny">${escapeHtml(t('apexLogViewer.logi.queryDeny'))}</button>
          <button type="button" class="logi-advisor-approval-approve">${escapeHtml(t('apexLogViewer.logi.queryApprove'))}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = (ok) => {
      overlay.remove();
      resolve(ok);
    };
    overlay.querySelector('.logi-advisor-approval-deny')?.addEventListener('click', () => cleanup(false));
    overlay.querySelector('.logi-advisor-approval-approve')?.addEventListener('click', () => cleanup(true));
  });
}

/**
 * @param {string} [reason]
 * @param {string} [error]
 */
function mapErrorReason(reason, error) {
  const map = {
    LOGI_DISABLED: 'apexLogViewer.logi.error.disabled',
    TELEMETRY_REQUIRED: 'apexLogViewer.logi.error.telemetry',
    MAX_ITERATIONS: 'apexLogViewer.logi.error.maxIterations',
    MAX_CHATS_USER: 'apexLogViewer.logi.error.maxChatsUser',
    MAX_CHATS_DAY: 'apexLogViewer.logi.error.maxChatsDay',
    MAX_CHATS_MONTH: 'apexLogViewer.logi.error.maxChatsMonth',
    LLM_ERROR: 'apexLogViewer.logi.error.llm'
  };
  const key = map[reason] || 'apexLogViewer.logi.error.generic';
  const base = t(key);
  if (reason === 'LLM_ERROR' && error) {
    return `${base} (${error})`;
  }
  return base;
}
