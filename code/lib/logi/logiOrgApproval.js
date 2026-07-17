import { buildInitialLogContext, formatOrgQueryToolResult, truncateText } from '../../../shared/logi/apexLogAiContext.js';

/**
 * @param {object} pending
 * @param {string} orgId
 * @param {{ t: (key: string) => string, escapeHtml: (s: string) => string }} deps
 */
export function showOrgQueryApproval(pending, orgId, deps) {
  const { t, escapeHtml } = deps;
  return new Promise((resolve) => {
    const toolName = pending.toolName || 'org_query';
    const titleKey =
      toolName === 'get_apex_source'
        ? 'apexLogViewer.logi.sourceApprovalTitle'
        : toolName === 'get_flow_metadata'
          ? 'apexLogViewer.logi.flowApprovalTitle'
          : toolName === 'describe_sobject_fields'
            ? 'apexLogViewer.logi.describeApprovalTitle'
            : 'apexLogViewer.logi.queryApprovalTitle';
    const displayQuery =
      toolName === 'describe_sobject_fields'
        ? `DESCRIBE ${pending.sobject || pending.queryText}`
        : pending.queryText;
    const variantLabel =
      toolName === 'describe_sobject_fields' ? 'describe' : pending.variant || 'rest-soql';

    const overlay = document.createElement('div');
    overlay.className = 'logi-advisor-approval ph-no-capture';
    overlay.innerHTML = `
      <div class="logi-advisor-approval-panel" role="alertdialog" aria-modal="true">
        <h3>${escapeHtml(t(titleKey))}</h3>
        <p class="logi-advisor-approval-reason">${escapeHtml(pending.reason || '')}</p>
        <dl class="logi-advisor-approval-meta">
          <dt>${escapeHtml(t('apexLogViewer.logi.queryOrg'))}</dt><dd>${escapeHtml(orgId)}</dd>
          <dt>${escapeHtml(t('apexLogViewer.logi.queryVariant'))}</dt><dd>${escapeHtml(variantLabel)}</dd>
        </dl>
        <pre class="logi-advisor-approval-query">${escapeHtml(displayQuery)}</pre>
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
 * @typedef {object} LogiOrgFlowDeps
 * @property {(key: string) => string} t
 * @property {(msg: object) => Promise<object>} bg
 * @property {(sessionKey: string) => object} getRuntime
 * @property {(sessionKey: string) => void} bindSession
 * @property {(sessionKey: string) => Promise<void>} persistRuntime
 * @property {(modal: HTMLElement, sessionKey: string) => void} refreshUiIfBound
 * @property {(sessionKey: string, turnId: string | null) => boolean} shouldApplyTurnResult
 * @property {(sessionKey: string, turnId: string, modal: HTMLElement) => void} finishTurnUi
 * @property {(text: string, modal: HTMLElement, sessionKey: string) => void} appendAssistantMessageForSession
 * @property {(modal: HTMLElement, res?: object) => void} applyIterationState
 * @property {(modal: HTMLElement, res: object) => boolean} isMaxIterationsResponse
 * @property {(sessionKey: string) => boolean} hasTurnTimedOut
 * @property {(sessionKey: string, res: object) => void} rememberTurnAiMetrics
 * @property {(res: object, modal: HTMLElement, sessionKey: string, ctx: object, parsed: object, raw: string, payload: object, lang: 'es'|'en', requestId: string, turnId: string) => Promise<void>} processLlmResponse
 * @property {(reason?: string, error?: string) => string} mapErrorReason
 * @property {() => Record<string, unknown>} buildChatMessageExtras
 * @property {(pending: object, orgId: string) => Promise<boolean>} showOrgQueryApproval
 */

/**
 * @param {HTMLElement} modal
 * @param {string} sessionKey
 * @param {object} ctx
 * @param {object} parsed
 * @param {string} raw
 * @param {object} payload
 * @param {'es'|'en'} lang
 * @param {string} requestId
 * @param {object} pending
 * @param {string} turnId
 * @param {LogiOrgFlowDeps} deps
 */
export async function runPendingOrgQueryFlow(
  modal,
  sessionKey,
  ctx,
  parsed,
  raw,
  payload,
  lang,
  requestId,
  pending,
  turnId,
  deps
) {
  if (!deps.shouldApplyTurnResult(sessionKey, turnId)) return;

  const rt = deps.getRuntime(sessionKey);

  if (!payload.orgId) {
    deps.appendAssistantMessageForSession(deps.t('apexLogViewer.logi.queryNoOrg'), modal, sessionKey);
    deps.finishTurnUi(sessionKey, turnId, modal);
    return;
  }

  const approved = await deps.showOrgQueryApproval(pending, payload.orgId);
  if (!deps.shouldApplyTurnResult(sessionKey, turnId)) return;

  const toolName = pending.toolName || 'org_query';

  /** @type {string} */
  let toolContent;
  if (!approved) {
    toolContent = JSON.stringify(
      formatOrgQueryToolResult(
        {
          ok: false,
          error: 'user_denied',
          reason: 'The user denied running this org query.'
        },
        lang
      )
    );
  } else if (toolName === 'describe_sobject_fields') {
    const describeRes = await deps.bg({
      type: 'queryExplorer:describeSobject',
      orgId: payload.orgId,
      objectApiName: pending.sobject || pending.queryText
    });
    if (describeRes?.ok && describeRes.describe) {
      const fields = (describeRes.describe.fields || []).slice(0, 80).map((f) => ({
        name: f.name,
        type: f.type,
        label: f.label,
        nillable: f.nillable,
        custom: f.custom
      }));
      toolContent = JSON.stringify({
        ok: true,
        sobject: pending.sobject || pending.queryText,
        fieldCount: (describeRes.describe.fields || []).length,
        fields,
        truncated: (describeRes.describe.fields || []).length > 80
      });
    } else {
      toolContent = JSON.stringify(
        formatOrgQueryToolResult(
          { ok: false, error: describeRes?.error || describeRes?.reason || 'DESCRIBE_FAILED' },
          lang
        )
      );
    }
  } else {
    const queryRes = await deps.bg({
      type: 'aiAdvisor:runQuery',
      orgId: payload.orgId,
      variant: pending.variant,
      queryText: pending.queryText
    });
    toolContent = JSON.stringify(formatOrgQueryToolResult(queryRes, lang));
  }

  /** @type {Record<string, unknown>} */
  const toolArgs =
    toolName === 'get_apex_source'
      ? { name: pending.apexName, type: pending.apexType, reason: pending.reason }
      : toolName === 'get_flow_metadata'
        ? { name: pending.flowName, reason: pending.reason }
        : toolName === 'describe_sobject_fields'
          ? { sobject: pending.sobject || pending.queryText, reason: pending.reason }
          : { variant: pending.variant, query_text: pending.queryText, reason: pending.reason };

  rt.messages.push({
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: pending.toolCallId,
        type: 'function',
        function: {
          name: toolName,
          arguments: JSON.stringify(toolArgs)
        }
      }
    ]
  });
  rt.messages.push({
    role: 'tool',
    tool_call_id: pending.toolCallId,
    name: toolName,
    content: toolContent
  });

  rt.thinkingMode = 'org';
  rt.thinkingStatus = deps.t('apexLogViewer.logi.thinkingOrgQuery');
  rt.thinkingReason = truncateText(String(pending.reason || ''), 80);
  await deps.persistRuntime(sessionKey);
  deps.refreshUiIfBound(modal, sessionKey);

  if (!deps.shouldApplyTurnResult(sessionKey, turnId)) return;

  const followUp = await deps.bg({
    type: 'aiAdvisor:chat',
    requestId,
    sessionKey,
    messages: rt.messages,
    initialContext: buildInitialLogContext(parsed, {
      orgId: payload.orgId,
      logId: payload.logId,
      instanceUrl: payload.instanceUrl
    }),
    orgId: payload.orgId,
    logId: payload.logId || '',
    lang,
    isNewChat: false,
    skipIterationReserve: true,
    ...deps.buildChatMessageExtras()
  });
  if (Number.isFinite(Number(followUp?.iteration))) {
    rt.iteration = Math.max(rt.iteration, Math.floor(Number(followUp.iteration)));
  }
  deps.bindSession(sessionKey);
  deps.applyIterationState(modal, followUp);
  await deps.persistRuntime(sessionKey);
  deps.refreshUiIfBound(modal, sessionKey);

  if (!deps.shouldApplyTurnResult(sessionKey, turnId)) return;
  if (deps.isMaxIterationsResponse(modal, followUp)) return;

  if (!followUp?.ok) {
    if (followUp?.reason === 'CANCELLED' || !deps.shouldApplyTurnResult(sessionKey, turnId)) return;
    if (deps.hasTurnTimedOut(sessionKey)) return;
    if (followUp?.reason === 'LLM_TIMEOUT') {
      rt.turnTimedOut = true;
      deps.clearTurnTimeout?.(sessionKey);
    }
    deps.appendAssistantMessageForSession(
      deps.mapErrorReason(followUp?.reason, followUp?.error),
      modal,
      sessionKey
    );
    deps.finishTurnUi(sessionKey, turnId, modal);
    return;
  }
  deps.rememberTurnAiMetrics(sessionKey, followUp);
  await deps.processLlmResponse(
    followUp,
    modal,
    sessionKey,
    ctx,
    parsed,
    raw,
    payload,
    lang,
    requestId,
    turnId
  );
}
