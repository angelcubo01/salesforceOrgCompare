import { mountLogiResume, setLogiResumeButtonVisible } from './logiResumePanel.js';
import { escapeHtml } from '../../../shared/htmlEscape.js';
import { renderLogiMarkdown, exportChatAsMarkdown } from '../../../shared/logi/logiMarkdown.js';
import { getCurrentLang, t } from '../../../shared/i18n.js';
import { bg } from '../../core/bridge.js';
import { LOGI_ADVISOR_READY_EVENT } from '../../../shared/logi/posthogLogiAdvisorFlag.js';
import { formatLogiModelLabel } from '../../../shared/logi/logiModelLabels.js';
import { LOGI_ADVISOR_STORAGE_KEY } from '../../../shared/logi/logiAdvisorCache.js';
import {
  buildLogiSessionKey,
  LOGI_SESSION_STORAGE_KEY,
  readLogiSession,
  writeLogiSession
} from '../../../shared/logi/logiAdvisorSession.js';
import {
  buildInitialLogContext,
  enrichLocalToolResult,
  fetchLogLines,
  fetchParsedSection,
  formatOrgQueryToolResult,
  getDefaultQuickActionUserMessage,
  getHotspots,
  getStackAround,
  highlightLogLines,
  quickActionUserMessage,
  searchLog,
  truncateText
} from '../../../shared/logi/apexLogAiContext.js';
import { resolveLogiPromptLang } from '../../../shared/logi/logiPromptLang.js';
import { hashLogiSessionKey } from '../../../shared/logi/logiAiMetrics.js';
import {
  buildLogiQuickActionPromptsExport,
  createLogiCustomQuickAction,
  deleteLogiCustomQuickAction,
  getLogiCustomQuickActionsSnapshot,
  getLogiQuickActionPromptsSnapshot,
  importLogiQuickActionPromptStore,
  loadLogiQuickActionPrompts,
  applyLogiQuickActionPresets,
  LOGI_QUICK_ACTION_PROMPTS_KEY,
  saveLogiCustomQuickActionLabels,
  saveLogiQuickActionPrompt
} from '../../../shared/logi/logiQuickActionPrompts.js';
import { isLogiCustomQuickActionId } from '../../../shared/logi/apexLogAiContext.js';
import {
  ensureThinkingRotation,
  formatToolActivityLabel,
  stopThinkingRotation
} from './logiThinking.js';
import {
  editQueueItem,
  normalizeQueueItem,
  removeQueueItem,
  renderQueuePanel
} from './logiQueue.js';
import {
  applyUsageHint as applyUsageHintUi,
  updateIterationsLabel as updateIterationsLabelUi
} from './logiUsageUi.js';
import { runPendingOrgQueryFlow, showOrgQueryApproval } from './logiOrgApproval.js';
import { executeLocalToolCalls } from './logiToolRunner.js';

/**
 * @param {string} action
 * @param {Record<string, unknown>} [props]
 */
function trackLogiUi(action, props = {}) {
  void bg({ type: 'telemetry:logiUsage', action, ...props }).catch(() => {});
}

/**
 * @param {string} sessionKey
 * @param {object | null | undefined} res
 */
function rememberTurnAiMetrics(sessionKey, res) {
  if (!res?.ok || !res.aiMetrics || typeof res.aiMetrics !== 'object') return;
  getRuntime(sessionKey).lastAiMetrics = /** @type {Record<string, string | number | boolean>} */ (
    res.aiMetrics
  );
}

/**
 * One product event per visible successful chat turn.
 * @param {string} sessionKey
 * @param {object} [payload]
 */
function emitChatTurnSuccess(sessionKey, payload = {}) {
  const rt = getRuntime(sessionKey);
  const metrics = rt.lastAiMetrics || {};
  trackLogiUi('chat_turn', {
    ...metrics,
    sfoc_log_id: String(payload.logId || metrics.sfoc_log_id || '').slice(0, 64),
    sfoc_session_key: hashLogiSessionKey(sessionKey),
    ...(Number.isFinite(Number(rt.iteration)) ? { sfoc_iteration: Math.floor(Number(rt.iteration)) } : {})
  });
  rt.lastAiMetrics = null;
}

const LOGI_AVATAR_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M4 5a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm10 0v4h4M8 13h8M8 17h5"/></svg>`;

const THINKING_BUBBLE_HTML = `<div class="logi-advisor-msg logi-advisor-msg--assistant logi-advisor-msg--thinking" aria-live="polite">
  <span class="logi-advisor-msg-avatar">${LOGI_AVATAR_SVG}</span>
  <div class="logi-advisor-msg-wrap">
    <span class="logi-advisor-msg-name">Logi</span>
    <div class="logi-advisor-msg-body logi-advisor-msg-body--thinking">
      <span class="logi-advisor-thinking-spinner" aria-hidden="true"></span>
      <span class="logi-advisor-thinking-text"></span>
    </div>
  </div>
</div>`;

const QUICK_ACTIONS_COLLAPSED_KEY = 'sfocLogiQuickActionsCollapsed';
const LOGI_PANEL_LAYOUT_KEY = 'sfocLogiPanelLayout';
const LOGI_PRIVACY_ACK_KEY = 'sfocLogiPrivacyAck';
/** Tiempo máximo de un turno Logi (ms) antes de mostrar disculpa al usuario. */
const LOGI_TURN_TIMEOUT_MS = 120_000;
const LOGI_PANEL_WIDTH_DEFAULT = 480;
const LOGI_PANEL_WIDTH_MIN = 360;
const LOGI_PANEL_WIDTH_MAX = 1400;

const PENCIL_ICON_SVG = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.086 4.5l1.414 1.414 1.988-1.988a.25.25 0 0 0 0-.354l-1.061-1.06Z"/></svg>`;
const QUICK_ACTIONS_ICON_SVG = `<svg class="logi-advisor-quick-toggle-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M13 2 4.5 13.5h6L9 22l10-14h-6L13 2z"/></svg>`;

const CUSTOM_ACTION_ICON_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2.5a1.25 1.25 0 0 1 1.18.83l.55 1.54 1.54.55a1.25 1.25 0 0 1 0 2.36l-1.54.55-.55 1.54a1.25 1.25 0 0 1-2.36 0l-.55-1.54-1.54-.55a1.25 1.25 0 0 1 0-2.36l1.54-.55.55-1.54A1.25 1.25 0 0 1 12 2.5Z"/><path fill="currentColor" opacity="0.45" d="M6.5 14.5h11v7h-11z"/></svg>`;

const LADYBUG_ICON_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 3.5c-.9 0-1.65.55-1.94 1.32C8.4 4.45 7.05 4.8 5.8 5.55 4.55 6.3 3.65 7.45 3.2 8.85 2.45 9.2 1.9 9.95 1.9 10.85c0 .95.65 1.75 1.55 1.98.75 2.35 2.95 4.07 5.55 4.07h6c2.6 0 4.8-1.72 5.55-4.07.9-.23 1.55-1.03 1.55-1.98 0-.9-.55-1.65-1.3-2-.45-1.4-1.35-2.55-2.6-3.3-1.25-.75-2.6-1.1-4.26-1.27C13.65 4.05 12.9 3.5 12 3.5Z"/><path fill="currentColor" opacity="0.35" d="M12 7.5v11"/><circle cx="8.25" cy="11.25" r="1.35" fill="currentColor" opacity="0.45"/><circle cx="15.75" cy="11.25" r="1.35" fill="currentColor" opacity="0.45"/><circle cx="9.75" cy="14.75" r="1.1" fill="currentColor" opacity="0.45"/><circle cx="14.25" cy="14.75" r="1.1" fill="currentColor" opacity="0.45"/><circle cx="12" cy="17.25" r="1.1" fill="currentColor" opacity="0.45"/></svg>`;

const QUICK_ACTION_META = {
  debug_errors: {
    tone: 'rose',
    icon: LADYBUG_ICON_SVG
  },
  explain_flow: {
    tone: 'sky',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3h7z"/></svg>`
  },
  soql_dml: {
    tone: 'violet',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 3C7.58 3 4 4.79 4 7s3.58 4 8 4 8-1.79 8-4-3.58-4-8-4zM4 9v3c0 2.21 3.58 4 8 4s8-1.79 8-4V9c0 2.21-3.58 4-8 4s-8-1.79-8-4zm0 5v3c0 2.21 3.58 4 8 4s8-1.79 8-4v-3c0 2.21-3.58 4-8 4s-8-1.79-8-4z"/></svg>`
  },
  test_failure: {
    tone: 'orange',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>`
  },
  limits: {
    tone: 'amber',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>`
  },
  suggest_fix: {
    tone: 'emerald',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>`
  },
  callouts: {
    tone: 'sky',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M20.5 6h-2.2l-1-2H6.7l-1 2H3.5C2.67 6 2 6.67 2 7.5v11c0 .83.67 1.5 1.5 1.5h17c.83 0 1.5-.67 1.5-1.5v-11c0-.83-.67-1.5-1.5-1.5zM12 17.5A4.5 4.5 0 1 1 12 8.5a4.5 4.5 0 0 1 0 9zm0-7.2a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4z"/></svg>`
  },
  validations: {
    tone: 'amber',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm-1.06 14.54L7.4 13l1.41-1.41 2.12 2.12 4.24-4.24L16.6 11l-5.66 5.54z"/></svg>`
  },
  hotspots: {
    tone: 'orange',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2C8.5 6.2 7 9.2 7 12a5 5 0 0 0 10 0c0-2.8-1.5-5.8-5-10zm0 14.5A2.5 2.5 0 0 1 9.5 14c0-1.2.7-2.6 2.5-5.1 1.8 2.5 2.5 3.9 2.5 5.1A2.5 2.5 0 0 1 12 16.5z"/></svg>`
  }
};

/** @typedef {{ startLine: number, endLine: number, logId: string }} LogiLineRef */

/** @typedef {{ content: string }} LogiQuoteRef */

/** @typedef {{ id: string, text: string, quickActionId?: string, lineRef?: LogiLineRef, quoteRef?: LogiQuoteRef, displayText?: string }} QueuedMessage */

/** @typedef {{ role: string, content?: string, quickActionId?: string, lineRef?: LogiLineRef, quoteRef?: LogiQuoteRef, displayText?: string, tool_calls?: object[], tool_call_id?: string, name?: string }} ChatMessage */

let modalEl = null;
let quickActionEditModalEl = null;
let btnEl = null;

/** @type {LogiLineRef | null} */
let pendingLineAttachment = null;
/** @type {LogiQuoteRef | null} */
let pendingQuoteAttachment = null;
/** @type {ReturnType<typeof getLogiQuickActionPromptsSnapshot> | null} */
let customQuickActionPrompts = null;

/** @type {ReturnType<typeof getLogiCustomQuickActionsSnapshot>} */
let customQuickActions = [];
/** @type {ChatMessage[]} */
let messages = [];
let iteration = 0;
let isNewChat = true;
/** @type {object | null} */
let advisorConfig = null;
let processing = false;
/** @type {string} */
let thinkingStatus = '';
/** @type {QueuedMessage[]} */
let messageQueue = [];
let activeRequestId = null;
let activeTurnId = null;
let cancelRequested = false;
/** @type {string | null} */
let usageLimitReason = null;
/** @type {{ remainingToday?: number, maxToday?: number } | null} */
let usageHint = null;
/** @type {{ mode: 'docked' | 'float', width: number }} */
let panelLayout = { mode: 'docked', width: LOGI_PANEL_WIDTH_DEFAULT };

/**
 * @typedef {object} SessionRuntime
 * @property {ChatMessage[]} messages
 * @property {QueuedMessage[]} messageQueue
 * @property {number} iteration
 * @property {boolean} isNewChat
 * @property {boolean} processing
 * @property {string} thinkingStatus
 * @property {string} thinkingReason
 * @property {'default' | 'tools' | 'org'} thinkingMode
 * @property {string | null} activeRequestId
 * @property {string | null} activeTurnId
 * @property {boolean} cancelRequested
 * @property {boolean} turnTimedOut
 * @property {number | null} turnDeadline
 * @property {ReturnType<typeof setTimeout> | null} turnTimeoutTimer
 * @property {string | null} usageLimitReason
 * @property {object | null} lastCtx
 * @property {Record<string, string | number | boolean> | null} lastAiMetrics
 */

/** @type {Map<string, SessionRuntime>} */
const sessionRuntimes = new Map();
/** @type {string | null} */
let boundSessionKey = null;
/** @type {ReturnType<typeof setInterval> | null} */
let sessionPollTimer = null;
/** @type {object | null} */
let currentAdvisorPayload = null;

function getQueueDeps() {
  return {
    t,
    escapeHtml,
    getRuntime,
    bindSession,
    persistRuntime,
    getModalRuntime,
    messageQueue,
    createRequestId,
    normalizeLineRef,
    normalizeQuoteRef,
    syncBusyUi
  };
}

function getThinkingDeps() {
  return {
    t,
    getRuntime,
    getSessionKey: (modal) => modal._sessionKey || boundSessionKey,
    shouldShowThinking
  };
}

function getUsageUiDeps() {
  return {
    t,
    getIteration: () => iteration,
    getMaxIterations,
    getUsageHint: () => usageHint,
    setUsageHint: (hint) => {
      usageHint = hint;
    }
  };
}

function getOrgFlowDeps() {
  return {
    t,
    bg,
    getRuntime,
    bindSession,
    persistRuntime,
    refreshUiIfBound,
    shouldApplyTurnResult,
    finishTurnUi,
    appendAssistantMessageForSession,
    applyIterationState,
    isMaxIterationsResponse,
    hasTurnTimedOut,
    clearTurnTimeout,
    rememberTurnAiMetrics,
    processLlmResponse,
    mapErrorReason,
    buildChatMessageExtras,
    showOrgQueryApproval: (pending, orgId) =>
      showOrgQueryApproval(pending, orgId, { t, escapeHtml })
  };
}

function updateIterationsLabel(modal) {
  updateIterationsLabelUi(modal, getUsageUiDeps());
}

function applyUsageHint(modal, usageRes) {
  applyUsageHintUi(modal, usageRes, getUsageUiDeps());
}

function createRuntime() {
  return {
    messages: [],
    messageQueue: [],
    iteration: 0,
    isNewChat: true,
    processing: false,
    thinkingStatus: '',
    thinkingReason: '',
    thinkingMode: 'default',
    activeRequestId: null,
    activeTurnId: null,
    cancelRequested: false,
    turnTimedOut: false,
    turnDeadline: null,
    turnTimeoutTimer: null,
    usageLimitReason: null,
    lastCtx: null,
    lastAiMetrics: null,
    resumeSummary: null
  };
}

/**
 * @param {string} sessionKey
 */
function getRuntime(sessionKey) {
  if (!sessionRuntimes.has(sessionKey)) {
    sessionRuntimes.set(sessionKey, createRuntime());
  }
  return /** @type {SessionRuntime} */ (sessionRuntimes.get(sessionKey));
}

/**
 * @param {string} sessionKey
 */
function bindSession(sessionKey) {
  boundSessionKey = sessionKey;
  const rt = getRuntime(sessionKey);
  messages = rt.messages;
  messageQueue = rt.messageQueue;
  iteration = rt.iteration;
  isNewChat = rt.isNewChat;
  processing = rt.processing;
  thinkingStatus = rt.thinkingStatus;
  activeRequestId = rt.activeRequestId;
  activeTurnId = rt.activeTurnId;
  cancelRequested = rt.cancelRequested;
  usageLimitReason = rt.usageLimitReason;
}

/**
 * @param {unknown} raw
 * @returns {LogiLineRef | null}
 */
function normalizeLineRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const startLine = Math.floor(Number(o.startLine));
  const endLine = Math.floor(Number(o.endLine));
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine) || startLine < 1 || endLine < 1) {
    return null;
  }
  const a = Math.min(startLine, endLine);
  const b = Math.max(startLine, endLine);
  return {
    startLine: a,
    endLine: b,
    logId: String(o.logId || 'log').trim().slice(0, 64) || 'log'
  };
}

/**
 * @param {LogiLineRef} ref
 */
function formatLineRefBadgeLabel(ref) {
  const logId = String(ref.logId || 'log').slice(0, 28);
  if (ref.startLine === ref.endLine) {
    return t('apexLogViewer.logi.lineBadgeSingle', { logId, line: ref.startLine });
  }
  return t('apexLogViewer.logi.lineBadgeRange', {
    logId,
    start: ref.startLine,
    end: ref.endLine
  });
}

/**
 * @param {unknown} raw
 * @returns {LogiQuoteRef | null}
 */
function normalizeQuoteRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const content = String(/** @type {Record<string, unknown>} */ (raw).content || '').trim();
  return content ? { content } : null;
}

/**
 * @param {string} content
 */
function formatQuotePreview(content) {
  const flat = String(content || '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const max = 56;
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * @param {string} content
 */
function formatQuoteBadgeLabel(content) {
  return t('apexLogViewer.logi.quoteBadge', { preview: formatQuotePreview(content) });
}

/**
 * @param {LogiQuoteRef} ref
 * @param {string} [userNote]
 */
function buildQuoteAttachmentLlmText(ref, userNote = '') {
  const note = String(userNote || '').trim();
  const quoted = String(ref.content || '').trim();
  const base = `The user quoted this previous assistant message:\n\n---\n${quoted}\n---`;
  return note ? `${base}\n\nUser follow-up: ${note}` : base;
}

/**
 * @param {string} trimmed
 * @param {LogiLineRef | null} lineRef
 * @param {LogiQuoteRef | null} quoteRef
 */
function buildQueuedMessageLlmText(trimmed, lineRef, quoteRef) {
  if (lineRef && quoteRef) {
    const linePart = buildLineAttachmentLlmText(lineRef, '');
    const quotePart = buildQuoteAttachmentLlmText(quoteRef, trimmed);
    return `${linePart}\n\n${quotePart}`;
  }
  if (lineRef) return buildLineAttachmentLlmText(lineRef, trimmed);
  if (quoteRef) return buildQuoteAttachmentLlmText(quoteRef, trimmed);
  return trimmed;
}

/**
 * @param {LogiLineRef} ref
 * @param {string} [userNote]
 */
function buildLineAttachmentLlmText(ref, userNote = '') {
  const note = String(userNote || '').trim();
  const range =
    ref.startLine === ref.endLine ? `L${ref.startLine}` : `L${ref.startLine}–L${ref.endLine}`;
  const base = `Analyze these Apex debug log lines: ${range} (log id: ${ref.logId}). Use fetch_log_lines for that range before answering.`;
  return note ? `${base}\n\nUser note: ${note}` : base;
}

/**
 * @param {HTMLElement} modal
 */
function updateInputPlaceholder(modal) {
  const inputEl = modal.querySelector('#logiAdvisorInput');
  if (!inputEl) return;
  inputEl.placeholder =
    pendingLineAttachment || pendingQuoteAttachment
      ? t('apexLogViewer.logi.inputPlaceholderWithLines')
      : t('apexLogViewer.logi.inputPlaceholder');
}

/**
 * @param {HTMLElement} modal
 */
function renderInputAttachments(modal) {
  const mount = modal.querySelector('#logiAdvisorLineAttach');
  if (!mount) return;

  /** @type {string[]} */
  const badges = [];

  if (pendingLineAttachment) {
    const label = formatLineRefBadgeLabel(pendingLineAttachment);
    const removeLabel = t('apexLogViewer.logi.lineBadgeRemove');
    badges.push(`
      <span class="logi-advisor-line-badge" title="${escapeHtml(label)}">
        <span class="logi-advisor-line-badge-label">${escapeHtml(label)}</span>
        <button type="button" class="logi-advisor-line-badge-remove" id="logiAdvisorLineAttachClear" aria-label="${escapeHtml(removeLabel)}" title="${escapeHtml(removeLabel)}">×</button>
      </span>`);
  }

  if (pendingQuoteAttachment) {
    const label = formatQuoteBadgeLabel(pendingQuoteAttachment.content);
    const removeLabel = t('apexLogViewer.logi.quoteBadgeRemove');
    badges.push(`
      <span class="logi-advisor-line-badge logi-advisor-quote-badge" title="${escapeHtml(label)}">
        <span class="logi-advisor-line-badge-label">${escapeHtml(label)}</span>
        <button type="button" class="logi-advisor-line-badge-remove" id="logiAdvisorQuoteAttachClear" aria-label="${escapeHtml(removeLabel)}" title="${escapeHtml(removeLabel)}">×</button>
      </span>`);
  }

  if (!badges.length) {
    mount.hidden = true;
    mount.innerHTML = '';
    return;
  }

  mount.hidden = false;
  mount.innerHTML = badges.join('');
  mount.querySelector('#logiAdvisorLineAttachClear')?.addEventListener('click', () => {
    pendingLineAttachment = null;
    renderInputAttachments(modal);
    updateInputPlaceholder(modal);
  });
  mount.querySelector('#logiAdvisorQuoteAttachClear')?.addEventListener('click', () => {
    pendingQuoteAttachment = null;
    renderInputAttachments(modal);
    updateInputPlaceholder(modal);
  });
}

/**
 * @param {object} ctx
 * @returns {LogiLineRef | null}
 */
function lineAttachmentFromCtx(ctx) {
  return normalizeLineRef(ctx?.lineAttachment);
}

/**
 * @param {string} sessionKey
 * @param {string} turnId
 * @param {HTMLElement} modal
 */
function finishTurnUi(sessionKey, turnId, modal) {
  const rt = getRuntime(sessionKey);
  if (rt.activeTurnId !== turnId) return;
  stopThinkingRotation();
  rt.processing = false;
  rt.thinkingStatus = '';
  rt.thinkingReason = '';
  rt.thinkingMode = 'default';
  rt.activeTurnId = null;
  rt.activeRequestId = null;
  refreshUiIfBound(modal, sessionKey);
}

/**
 * @param {string} sessionKey
 * @param {string | null} turnId
 */
function shouldApplyTurnResult(sessionKey, turnId) {
  const rt = getRuntime(sessionKey);
  return Boolean(turnId) && rt.activeTurnId === turnId && !rt.cancelRequested;
}

/**
 * @param {SessionRuntime | null | undefined} rt
 */
function shouldShowThinking(rt) {
  return Boolean(rt?.processing && !rt.cancelRequested);
}

/**
 * @param {string} sessionKey
 */
function hasTurnTimedOut(sessionKey) {
  return getRuntime(sessionKey).turnTimedOut;
}

/**
 * @param {string} sessionKey
 */
function clearTurnTimeout(sessionKey) {
  const rt = getRuntime(sessionKey);
  if (rt.turnTimeoutTimer) {
    clearTimeout(rt.turnTimeoutTimer);
    rt.turnTimeoutTimer = null;
  }
}

/**
 * @param {string} sessionKey
 * @param {string} turnId
 * @param {HTMLElement} modal
 * @param {number} timeoutMs
 */
function startTurnTimeout(sessionKey, turnId, modal, timeoutMs) {
  clearTurnTimeout(sessionKey);
  const rt = getRuntime(sessionKey);
  rt.turnTimedOut = false;
  rt.turnDeadline = Date.now() + timeoutMs;
  rt.turnTimeoutTimer = setTimeout(() => {
    handleTurnTimeout(sessionKey, turnId, modal);
  }, timeoutMs);
}

/**
 * @param {string} sessionKey
 * @param {string} turnId
 * @param {HTMLElement} modal
 */
function handleTurnTimeout(sessionKey, turnId, modal) {
  const rt = getRuntime(sessionKey);
  if (rt.activeTurnId !== turnId || rt.turnTimedOut) return;
  rt.turnTimedOut = true;
  rt.cancelRequested = true;
  const requestId = rt.activeRequestId;
  if (requestId) {
    void bg({ type: 'aiAdvisor:cancel', requestId });
  }
  appendAssistantMessageForSession(
    t('apexLogViewer.logi.error.timeout'),
    modal,
    sessionKey
  );
  finishTurnUi(sessionKey, turnId, modal);
  trackLogiUi('error', {
    sfoc_error_reason: 'TURN_TIMEOUT',
    sfoc_session_key: hashLogiSessionKey(sessionKey),
    sfoc_timeout_ms: LOGI_TURN_TIMEOUT_MS
  });
}

/**
 * @param {string} [sessionKey]
 */
function syncGlobalsToRuntime(sessionKey = boundSessionKey) {
  if (!sessionKey) return;
  const rt = getRuntime(sessionKey);
  rt.iteration = iteration;
  rt.isNewChat = isNewChat;
  rt.processing = processing;
  rt.thinkingStatus = thinkingStatus;
  rt.activeRequestId = activeRequestId;
  rt.activeTurnId = activeTurnId;
  rt.cancelRequested = cancelRequested;
  rt.usageLimitReason = usageLimitReason;
}

/**
 * @param {import('../../../shared/logi/logiAdvisorSession.js').LogiAdvisorSession | null | undefined} saved
 * @param {SessionRuntime} rt
 */
function applySavedToRuntime(saved, rt) {
  if (!saved) return;
  rt.messages = saved.messages?.length ? saved.messages.map((m) => ({ ...m })) : [];
  rt.iteration = saved.iteration || 0;
  rt.isNewChat = saved.isNewChat ?? true;
  rt.usageLimitReason = saved.usageLimitReason || null;
  if (saved.pending) {
    rt.processing = true;
    rt.thinkingStatus = saved.thinkingStatus || '';
  }
}

/**
 * @param {string} sessionKey
 */
async function loadRuntimeFromStorage(sessionKey) {
  const rt = getRuntime(sessionKey);
  if (rt.processing) return;
  const saved = await readLogiSession(sessionKey);
  applySavedToRuntime(saved, rt);
}

/**
 * @param {string} sessionKey
 */
async function persistRuntime(sessionKey) {
  if (!sessionKey) return;
  syncGlobalsToRuntime(sessionKey);
  const rt = getRuntime(sessionKey);
  await writeLogiSession(sessionKey, {
    messages: [...rt.messages],
    iteration: rt.iteration,
    isNewChat: rt.isNewChat,
    pending: rt.processing,
    thinkingStatus: rt.thinkingStatus || '',
    queuedCount: rt.messageQueue.length,
    usageLimitReason: rt.usageLimitReason || undefined,
    updatedAt: Date.now()
  });
}

/**
 * @param {HTMLElement} modal
 * @param {string} sessionKey
 */
function refreshUiIfBound(modal, sessionKey) {
  if (!modal || boundSessionKey !== sessionKey) return;
  bindSession(sessionKey);
  if (modal.hidden) return;
  renderMessages(modal);
  syncBusyUi(modal);
  updateIterationsLabel(modal);
}

/**
 * @param {HTMLElement} modal
 * @param {string} sessionKey
 */
function refreshUiForSession(modal, sessionKey) {
  if (modal._sessionKey !== sessionKey || modal.hidden) return;
  bindSession(sessionKey);
  renderMessages(modal);
  syncBusyUi(modal);
  updateIterationsLabel(modal);
}

function stopSessionPoll() {
  if (sessionPollTimer) {
    clearInterval(sessionPollTimer);
    sessionPollTimer = null;
  }
}

/**
 * @param {HTMLElement} modal
 * @param {string} sessionKey
 */
function startSessionPoll(modal, sessionKey) {
  stopSessionPoll();
  sessionPollTimer = setInterval(async () => {
    const saved = await readLogiSession(sessionKey);
    if (!saved) return;
    const rt = getRuntime(sessionKey);

    if (saved.pending) {
      rt.processing = true;
      rt.thinkingStatus = saved.thinkingStatus || rt.thinkingStatus || '';
      if (modal._sessionKey === sessionKey && !modal.hidden) {
        bindSession(sessionKey);
        renderMessages(modal);
        syncBusyUi(modal);
        updateIterationsLabel(modal);
      }
      return;
    }

    applySavedToRuntime(saved, rt);
    rt.processing = false;
    rt.thinkingStatus = '';
    stopSessionPoll();
    if (modal._sessionKey === sessionKey) {
      bindSession(sessionKey);
      renderMessages(modal);
      syncBusyUi(modal);
      updateIterationsLabel(modal);
    }
    if (modal.hidden) {
      setLogiButtonBadge(true);
    }
  }, 500);
}

/**
 * @param {boolean} show
 */
function setLogiButtonBadge(show) {
  if (!btnEl) return;
  btnEl.classList.toggle('logi-advisor-btn--badge', show);
  btnEl.title = show ? t('apexLogViewer.logi.responseReady') : '';
}

/**
 * @param {HTMLElement} modal
 * @param {string} sessionKey
 */
function onAdvisorJobFinished(modal, sessionKey) {
  if (modal.hidden || boundSessionKey !== sessionKey) {
    setLogiButtonBadge(true);
  }
  refreshUiIfBound(modal, sessionKey);
}

/**
 * @param {SessionRuntime} rt
 */
function isChatBlockedFor(rt) {
  const max = getMaxIterations();
  const atIteration = rt.iteration >= max;
  return atIteration || Boolean(rt.usageLimitReason);
}

function isBusy() {
  if (boundSessionKey) {
    return getRuntime(boundSessionKey).processing;
  }
  return processing;
}

/**
 * @param {HTMLElement} modal
 */
function getModalRuntime(modal) {
  const key = modal?._sessionKey || boundSessionKey;
  return key ? getRuntime(key) : null;
}

/**
 * @param {HTMLElement} modal
 */
function isModalBusy(modal) {
  return Boolean(getModalRuntime(modal)?.processing);
}

/**
 * @param {object} opts
 */
async function ensureLogiAdvisorConfigLoaded() {
  // SW bootstrap is authoritative (cohort gate + quotaBonus).
  const boot = await bg({ type: 'aiAdvisor:bootstrap', force: true });
  customQuickActionPrompts = await loadLogiQuickActionPrompts();
  customQuickActions = getLogiCustomQuickActionsSnapshot();
  return boot;
}

export async function mountLogiAdvisor(opts) {
  const { getParsed, getRawContent, payload, switchToSummary } = opts;
  currentAdvisorPayload = payload || null;
  btnEl = document.getElementById('logiAdvisorBtn');
  if (!btnEl) return;

  mountLogiResume({
    getParsed,
    getRawContent,
    payload: payload || {},
    switchToSummary,
    openAskLogi: (askCtx) => {
      void openLogiModal({
        getParsed,
        getRawContent,
        payload: payload || {},
        prefill: askCtx?.prefill,
        summaryText: askCtx?.summaryText
      });
    }
  });

  // Hide until force bootstrap settles — avoid flashing from a stale cache / CSS override.
  btnEl.hidden = true;
  setLogiResumeButtonVisible(false);

  try {
    await ensureLogiAdvisorConfigLoaded();
  } catch (err) {
    console.warn('[logi] bootstrap failed', err);
  } finally {
    await refreshConfig();
  }

  document.addEventListener(LOGI_ADVISOR_READY_EVENT, () => {
    void refreshConfig();
  });

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[LOGI_ADVISOR_STORAGE_KEY]) {
        void refreshConfig();
      }
      if (area === 'local' && changes[LOGI_SESSION_STORAGE_KEY]) {
        void onLogiSessionsStorageChanged(changes[LOGI_SESSION_STORAGE_KEY].newValue);
      }
      if (area === 'local' && changes[LOGI_QUICK_ACTION_PROMPTS_KEY]) {
        customQuickActionPrompts = getLogiQuickActionPromptsSnapshot();
        customQuickActions = getLogiCustomQuickActionsSnapshot();
        if (modalEl && !modalEl.hidden) renderQuickActions(modalEl);
      }
    });
  }

  btnEl.addEventListener('click', () => {
    void openLogiModal({
      getParsed,
      getRawContent,
      payload: payload || {}
    }).catch((err) => {
      console.error('[logi] open modal failed', err);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key.toLowerCase() !== 'l') return;
    if (!btnEl || btnEl.hidden) return;
    e.preventDefault();
    void openLogiModal({
      getParsed,
      getRawContent,
      payload: payload || {}
    }).catch((err) => {
      console.error('[logi] open modal failed', err);
    });
  });
}

/**
 * Public entry to open Ask Logi (used by resume CTA and selection).
 * @param {object} ctx
 */
export async function openLogiAdvisor(ctx) {
  return openLogiModal(ctx);
}

async function refreshConfig() {
  const res = await bg({ type: 'aiAdvisor:getConfig' });
  advisorConfig = res?.config || null;
  if (advisorConfig?.quickActionPresets?.length) {
    await applyLogiQuickActionPresets(advisorConfig.quickActionPresets);
    customQuickActionPrompts = getLogiQuickActionPromptsSnapshot();
    customQuickActions = getLogiCustomQuickActionsSnapshot();
  }

  const telemetryRequired = res?.telemetryRequired === true;
  // Require operational + enabled + showButton. Never show on stale/disabled payloads.
  const show = Boolean(
    advisorConfig?.enabled === true &&
      advisorConfig?.showButton === true &&
      advisorConfig?.operational === true &&
      !telemetryRequired
  );

  if (!btnEl) {
    btnEl = document.getElementById('logiAdvisorBtn');
  }
  if (btnEl) {
    btnEl.hidden = !show;
    btnEl.textContent = t('apexLogViewer.logi.button');
  }
  setLogiResumeButtonVisible(show);
}

function getSelectedLogiModel() {
  const sel = modalEl?.querySelector('#logiAdvisorModel');
  if (!sel || sel.hidden) return undefined;
  const v = String(sel.value || '').trim();
  return v || undefined;
}

/**
 * @param {HTMLElement} modal
 */
function updateLogiHeaderUi(modal) {
  const cfg = advisorConfig;
  const badge = modal.querySelector('#logiAdvisorModeBadge');
  const modelSel = modal.querySelector('#logiAdvisorModel');
  if (!badge || !modelSel) return;

  const mode = cfg?.requestedMode || cfg?.logiMode || 'free';
  const fallback = cfg?.modeFallback === true;
  let badgeText = t('apexLogViewer.logi.modeFree');
  if (mode === 'byok' && !fallback) badgeText = t('apexLogViewer.logi.modeByok');
  else if (fallback) badgeText = t('apexLogViewer.logi.modeFreeFallback');

  badge.textContent = badgeText;
  badge.hidden = false;
  badge.classList.toggle('logi-advisor-mode-badge--fallback', fallback);

  const pickerAllowed = cfg?.modelPickerAllowed === true;
  modelSel.hidden = !pickerAllowed;
  if (!pickerAllowed) return;

  const options = cfg?.modelPickerOptions || [];
  const current = cfg?.userSettings?.logiSelectedByokModel || '';
  modelSel.innerHTML = '';
  const autoOpt = document.createElement('option');
  autoOpt.value = '__auto__';
  autoOpt.textContent = t('apexLogViewer.logi.modelAuto');
  modelSel.appendChild(autoOpt);
  for (const id of options) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = formatLogiModelLabel(id);
    if (current === id) opt.selected = true;
    modelSel.appendChild(opt);
  }
  if (!current) modelSel.value = '__auto__';
}

function buildChatMessageExtras() {
  const selected = getSelectedLogiModel();
  return selected ? { selectedModel: selected } : {};
}

/**
 * @param {Record<string, import('../../../shared/logi/logiAdvisorSession.js').LogiAdvisorSession> | undefined} store
 */
async function onLogiSessionsStorageChanged(store) {
  if (!store || !currentAdvisorPayload || !modalEl) return;
  const sessionKey = buildLogiSessionKey(currentAdvisorPayload);
  const saved = store[sessionKey];
  if (!saved) return;

  const rt = getRuntime(sessionKey);

  if (saved.pending) {
    rt.processing = true;
    rt.thinkingStatus = saved.thinkingStatus || rt.thinkingStatus || '';
    if (modalEl._sessionKey === sessionKey && !modalEl.hidden) {
      bindSession(sessionKey);
      renderMessages(modalEl);
      syncBusyUi(modalEl);
      updateIterationsLabel(modalEl);
    }
    return;
  }

  if (!rt.processing) return;

  applySavedToRuntime(saved, rt);
  rt.processing = false;
  rt.thinkingStatus = '';
  stopSessionPoll();

  if (modalEl.hidden) {
    setLogiButtonBadge(true);
    return;
  }

  if (boundSessionKey === sessionKey) {
    bindSession(sessionKey);
    refreshUiForSession(modalEl, sessionKey);
  }
}

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement('div');
  modalEl.className = 'logi-advisor-modal ph-no-capture';
  modalEl.hidden = true;
  modalEl.innerHTML = `
    <div class="logi-advisor-backdrop" data-close="1"></div>
    <div class="logi-advisor-dialog" role="dialog" aria-modal="true" aria-labelledby="logiAdvisorTitle">
      <div class="logi-advisor-resize" id="logiAdvisorResize" aria-hidden="true"></div>
      <header class="logi-advisor-header">
        <span class="logi-advisor-avatar">${LOGI_AVATAR_SVG}</span>
        <div class="logi-advisor-header-text">
          <h2 id="logiAdvisorTitle"></h2>
          <div class="logi-advisor-header-meta">
            <span class="logi-advisor-beta" id="logiAdvisorBeta"></span>
            <span class="logi-advisor-mode-badge" id="logiAdvisorModeBadge" hidden></span>
            <select id="logiAdvisorModel" class="logi-advisor-model-select" hidden></select>
          </div>
        </div>
        <div class="logi-advisor-header-actions">
          <button type="button" class="logi-advisor-header-btn" id="logiAdvisorExportChat" hidden></button>
          <button type="button" class="logi-advisor-header-btn" id="logiAdvisorDockToggle"></button>
          <button type="button" class="logi-advisor-close" data-close="1" aria-label="Close">×</button>
        </div>
      </header>
      <div class="logi-advisor-quick-section" id="logiAdvisorQuickSection">
        <button type="button" class="logi-advisor-quick-toggle" id="logiAdvisorQuickToggle" aria-expanded="true">
          <span class="logi-advisor-quick-toggle-lead">
            ${QUICK_ACTIONS_ICON_SVG}
            <span class="logi-advisor-quick-toggle-label" id="logiAdvisorQuickToggleLabel"></span>
          </span>
          <span class="logi-advisor-quick-toggle-chevron" aria-hidden="true"></span>
        </button>
        <div class="logi-advisor-quick-panel" id="logiAdvisorQuickPanel">
          <div class="logi-advisor-quick-toolbar">
            <button type="button" class="logi-advisor-quick-io-btn" id="logiAdvisorQuickAdd" aria-label=""></button>
            <button type="button" class="logi-advisor-quick-io-btn" id="logiAdvisorQuickExport" aria-label=""></button>
            <button type="button" class="logi-advisor-quick-io-btn" id="logiAdvisorQuickImport" aria-label=""></button>
            <input type="file" id="logiAdvisorQuickImportFile" class="visually-hidden" accept=".json,application/json" />
          </div>
          <div class="logi-advisor-quick" id="logiAdvisorQuick"></div>
        </div>
      </div>
      <div class="logi-advisor-messages ph-no-capture" id="logiAdvisorMessages"></div>
      <div class="logi-advisor-privacy" id="logiAdvisorPrivacy" hidden></div>
      <footer class="logi-advisor-footer">
        <div class="logi-advisor-line-attach" id="logiAdvisorLineAttach" hidden></div>
        <div class="logi-advisor-input-row">
          <textarea id="logiAdvisorInput" class="logi-advisor-input" rows="2"></textarea>
          <button type="button" id="logiAdvisorSend" class="logi-advisor-send"></button>
          <button type="button" id="logiAdvisorStop" class="logi-advisor-stop" hidden></button>
        </div>
        <div class="logi-advisor-queue-wrap" id="logiAdvisorQueue" hidden>
          <span class="logi-advisor-queue-summary" id="logiAdvisorQueueSummary"></span>
          <ul class="logi-advisor-queue-list" id="logiAdvisorQueueList"></ul>
        </div>
        <div class="logi-advisor-footer-meta">
          <span class="logi-advisor-iterations" id="logiAdvisorIterations"></span>
          <span class="logi-advisor-chats-remaining" id="logiAdvisorChatsRemaining" hidden></span>
        </div>
      </footer>
    </div>`;
  document.body.appendChild(modalEl);

  void loadPanelLayout().then(() => applyPanelLayout(modalEl));

  modalEl.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => {
      if (panelLayout.mode === 'docked' && el.classList.contains('logi-advisor-backdrop')) {
        return;
      }
      closeLogiModal();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (quickActionEditModalEl && !quickActionEditModalEl.hidden) {
      closeQuickActionEditModal();
      return;
    }
    if (modalEl && !modalEl.hidden) closeLogiModal();
  });

  modalEl.querySelector('#logiAdvisorQuickToggle')?.addEventListener('click', () => {
    setQuickActionsCollapsed(modalEl, !readQuickActionsCollapsed());
  });

  modalEl.querySelector('#logiAdvisorQuickExport')?.addEventListener('click', () => {
    exportQuickActionPrompts();
  });

  modalEl.querySelector('#logiAdvisorQuickAdd')?.addEventListener('click', () => {
    openQuickActionCreateModal(modalEl);
  });

  modalEl.querySelector('#logiAdvisorQuickImport')?.addEventListener('click', () => {
    modalEl.querySelector('#logiAdvisorQuickImportFile')?.click();
  });

  modalEl.querySelector('#logiAdvisorQuickImportFile')?.addEventListener('change', (e) => {
    void importQuickActionPromptsFromFile(/** @type {HTMLInputElement} */ (e.target));
  });

  modalEl.querySelector('#logiAdvisorSend')?.addEventListener('click', () => {
    void onSendFromInput();
  });

  modalEl.querySelector('#logiAdvisorModel')?.addEventListener('change', (e) => {
    const value = e.target?.value === '__auto__' ? null : e.target?.value || null;
    void bg({
      type: 'aiAdvisor:saveSettings',
      logiSelectedByokModel: value
    }).then((res) => {
      if (res?.config) advisorConfig = res.config;
    });
  });
  modalEl.querySelector('#logiAdvisorStop')?.addEventListener('click', () => {
    void cancelActiveGeneration(modalEl);
  });
  modalEl.querySelector('#logiAdvisorDockToggle')?.addEventListener('click', () => {
    void togglePanelMode(modalEl);
  });
  modalEl.querySelector('#logiAdvisorExportChat')?.addEventListener('click', () => {
    exportCurrentChat(modalEl);
  });
  wirePanelResize(modalEl);
  wireMessagesDelegation(modalEl);
  modalEl.querySelector('#logiAdvisorQueue')?.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.dataset.queueId;
    if (!id) return;
    if (target.classList.contains('logi-advisor-queue-remove')) {
      removeQueueItem(modalEl, id, getQueueDeps());
    } else if (target.classList.contains('logi-advisor-queue-edit')) {
      editQueueItem(modalEl, id, getQueueDeps());
    }
  });
  modalEl.querySelector('#logiAdvisorInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      void onSendFromInput();
    }
  });

  return modalEl;
}

export function closeLogiModal() {
  if (!modalEl) return;
  closeQuickActionEditModal();
  if (boundSessionKey) {
    void persistRuntime(boundSessionKey);
  }
  modalEl.hidden = true;
}

/**
 * @returns {boolean}
 */
export function isLogiAdvisorButtonVisible() {
  return Boolean(btnEl && !btnEl.hidden);
}

async function loadPanelLayout() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const bag = await chrome.storage.local.get(LOGI_PANEL_LAYOUT_KEY);
      const raw = bag[LOGI_PANEL_LAYOUT_KEY];
      if (raw && typeof raw === 'object') {
        const mode = raw.mode === 'float' ? 'float' : 'docked';
        const width = clampPanelWidth(Number(raw.width) || LOGI_PANEL_WIDTH_DEFAULT);
        panelLayout = { mode, width };
      }
    }
  } catch {
    /* ignore */
  }
}

async function savePanelLayout() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [LOGI_PANEL_LAYOUT_KEY]: { ...panelLayout } });
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {number} width
 */
function clampPanelWidth(width) {
  const n = Number(width);
  if (!Number.isFinite(n)) return LOGI_PANEL_WIDTH_DEFAULT;
  return Math.min(LOGI_PANEL_WIDTH_MAX, Math.max(LOGI_PANEL_WIDTH_MIN, Math.round(n)));
}

/**
 * @param {HTMLElement} modal
 */
function applyPanelLayout(modal) {
  const docked = panelLayout.mode === 'docked';
  modal.classList.toggle('logi-advisor-modal--docked', docked);
  modal.style.setProperty('--logi-panel-width', `${clampPanelWidth(panelLayout.width)}px`);
  const toggle = modal.querySelector('#logiAdvisorDockToggle');
  if (toggle) {
    toggle.textContent = docked ? t('apexLogViewer.logi.float') : t('apexLogViewer.logi.dock');
    toggle.setAttribute(
      'aria-label',
      docked ? t('apexLogViewer.logi.float') : t('apexLogViewer.logi.dock')
    );
  }
  const backdrop = modal.querySelector('.logi-advisor-backdrop');
  if (backdrop) {
    if (docked) backdrop.removeAttribute('data-close');
    else backdrop.setAttribute('data-close', '1');
  }
}

/**
 * @param {HTMLElement} modal
 */
async function togglePanelMode(modal) {
  panelLayout.mode = panelLayout.mode === 'docked' ? 'float' : 'docked';
  applyPanelLayout(modal);
  await savePanelLayout();
}

/**
 * @param {HTMLElement} modal
 */
function wirePanelResize(modal) {
  const handle = modal.querySelector('#logiAdvisorResize');
  if (!handle) return;
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  const onMove = (ev) => {
    if (!dragging) return;
    const delta = startX - ev.clientX;
    const next = clampPanelWidth(startWidth + delta);
    panelLayout.width = next;
    modal.style.setProperty('--logi-panel-width', `${next}px`);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    modal.classList.remove('logi-advisor-modal--resizing');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    void savePanelLayout();
  };

  handle.addEventListener('pointerdown', (ev) => {
    if (panelLayout.mode !== 'docked') return;
    dragging = true;
    startX = ev.clientX;
    startWidth = clampPanelWidth(panelLayout.width);
    modal.classList.add('logi-advisor-modal--resizing');
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    ev.preventDefault();
  });
}

/**
 * @param {HTMLElement} modal
 */
function wireMessagesDelegation(modal) {
  const mount = modal.querySelector('#logiAdvisorMessages');
  if (!mount || mount.dataset.logiDelegated === '1') return;
  mount.dataset.logiDelegated = '1';

  mount.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const lineRef = target.closest('.logi-md-line-ref');
    if (lineRef instanceof HTMLElement) {
      dispatchLogiLineHighlight(lineRef);
      return;
    }

    const copyCode = target.closest('[data-logi-copy-code]');
    if (copyCode instanceof HTMLElement) {
      const pre = copyCode.parentElement?.querySelector('pre code');
      const text = pre?.textContent || '';
      if (text && navigator.clipboard?.writeText) void navigator.clipboard.writeText(text);
      return;
    }

    const actionBtn = target.closest('[data-logi-msg-action]');
    if (actionBtn instanceof HTMLElement) {
      const action = actionBtn.getAttribute('data-logi-msg-action');
      const idx = Number(actionBtn.getAttribute('data-msg-index'));
      void handleMessageAction(modal, action, idx);
      return;
    }

    const chip = target.closest('[data-logi-suggest-action]');
    if (chip instanceof HTMLElement) {
      const actionId = chip.getAttribute('data-logi-suggest-action');
      if (!actionId) return;
      void runQuickAction(modal, actionId);
    }
  });
}

/**
 * @param {HTMLElement} el
 */
function dispatchLogiLineHighlight(el) {
  const start =
    Number(el.getAttribute('data-start-line') || el.getAttribute('data-line')) || 0;
  const end = Number(el.getAttribute('data-end-line') || start) || start;
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
}

/**
 * @param {HTMLElement} modal
 * @param {string | null} action
 * @param {number} msgIndex
 */
async function handleMessageAction(modal, action, msgIndex) {
  const rt = getModalRuntime(modal);
  if (!rt || !Number.isFinite(msgIndex) || msgIndex < 0) return;
  const msg = rt.messages[msgIndex];
  if (!msg || msg.role !== 'assistant') return;
  const text = String(msg.content || '');

  if (action === 'copy') {
    if (text && navigator.clipboard?.writeText) void navigator.clipboard.writeText(text);
    return;
  }
  if (action === 'quote') {
    pendingQuoteAttachment = normalizeQuoteRef({ content: text });
    renderInputAttachments(modal);
    updateInputPlaceholder(modal);
    modal.querySelector('#logiAdvisorInput')?.focus();
    return;
  }
  if (action === 'regenerate') {
    let lastUserIdx = -1;
    for (let i = msgIndex - 1; i >= 0; i -= 1) {
      if (rt.messages[i]?.role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx < 0) return;
    const lastUser = rt.messages[lastUserIdx];
    if (!lastUser?.content) return;
    rt.messages = rt.messages.slice(0, lastUserIdx);
    bindSession(modal._sessionKey || boundSessionKey);
    renderMessages(modal);
    await persistSession(modal);
    if (lastUser.lineRef || lastUser.quoteRef) {
      await enqueueUserMessage(lastUser.displayText || '', modal, {
        lineRef: lastUser.lineRef,
        quoteRef: lastUser.quoteRef,
        quickActionId: lastUser.quickActionId
      });
    } else {
      await enqueueUserMessage(lastUser.content, modal, {
        quickActionId: lastUser.quickActionId
      });
    }
  }
}

/**
 * @param {object | null | undefined} parsed
 * @returns {string[]}
 */
function getEmptySuggestActionIds(parsed) {
  /** @type {string[]} */
  const ids = [];
  if (parsed?.issues?.length) ids.push('debug_errors');
  if (
    Number(parsed?.meta?.failedExecutionCount) > 0 ||
    parsed?.meta?.isTestLog === true ||
    (parsed?.executions || []).some((e) => e?.hasError)
  ) {
    ids.push('test_failure');
  }
  const highLimits = (parsed?.limits || []).some((entry) => {
    const used = Number(entry.used ?? entry.value);
    const max = Number(entry.max ?? entry.limit);
    return Number.isFinite(used) && Number.isFinite(max) && max > 0 && used / max >= 0.7;
  });
  if (highLimits) ids.push('limits');
  const soqlDmlCount = (parsed?.soql?.length || 0) + (parsed?.dml?.length || 0);
  if (soqlDmlCount >= 5) ids.push('soql_dml');
  if (!ids.length) ids.push('explain_flow');
  return [...new Set(ids)].slice(0, 4);
}

/**
 * @param {string} content
 * @param {object | null | undefined} parsed
 * @returns {string[]}
 */
function getFollowUpActionIds(content, parsed) {
  const lower = String(content || '').toLowerCase();
  /** @type {string[]} */
  const ids = [];
  if (/error|exception|fail|nullpointer|suger|fix|correcci/i.test(lower)) {
    ids.push('suggest_fix');
  }
  if (/soql|dml|query|consulta/i.test(lower) || (parsed?.soql?.length || 0) >= 3) {
    ids.push('soql_dml');
  }
  if (/limit|governor|l[ií]mite/i.test(lower)) {
    ids.push('limits');
  }
  if (!ids.includes('suggest_fix') && parsed?.issues?.length) ids.push('suggest_fix');
  if (!ids.length) ids.push('explain_flow');
  return [...new Set(ids)].slice(0, 3);
}

/**
 * @param {string} actionId
 * @param {'empty' | 'followUp'} kind
 */
function getSuggestChipLabel(actionId, kind) {
  const emptyMap = {
    debug_errors: 'apexLogViewer.logi.emptySuggestDebugErrors',
    test_failure: 'apexLogViewer.logi.emptySuggestTestFailure',
    limits: 'apexLogViewer.logi.emptySuggestLimits',
    soql_dml: 'apexLogViewer.logi.emptySuggestSoqlDml',
    explain_flow: 'apexLogViewer.logi.emptySuggestExplainFlow'
  };
  const followMap = {
    suggest_fix: 'apexLogViewer.logi.followUpSuggestFix',
    soql_dml: 'apexLogViewer.logi.followUpSoqlDml',
    limits: 'apexLogViewer.logi.followUpLimits',
    explain_flow: 'apexLogViewer.logi.followUpExplainFlow',
    debug_errors: 'apexLogViewer.logi.followUpDebugErrors'
  };
  const key = kind === 'empty' ? emptyMap[actionId] : followMap[actionId];
  if (key) return t(key);
  return getQuickActionLabels()[actionId] || actionId;
}

/**
 * @param {ChatMessage[]} sessionMessages
 */
function isGreetingOnlyChat(sessionMessages) {
  return !sessionMessages.some((m) => m.role === 'user');
}

async function readPrivacyAck() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const bag = await chrome.storage.local.get(LOGI_PRIVACY_ACK_KEY);
      return bag[LOGI_PRIVACY_ACK_KEY] === true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

async function writePrivacyAck(acked) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [LOGI_PRIVACY_ACK_KEY]: Boolean(acked) });
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {HTMLElement} modal
 */
async function renderPrivacyNotice(modal) {
  const privacyEl = modal.querySelector('#logiAdvisorPrivacy');
  if (!privacyEl) return;
  const acked = await readPrivacyAck();
  if (acked) {
    privacyEl.hidden = true;
    privacyEl.innerHTML = '';
    return;
  }
  privacyEl.hidden = false;
  privacyEl.innerHTML = `
    <div>${escapeHtml(t('apexLogViewer.logi.privacyNotice'))}</div>
    <div class="logi-advisor-privacy-actions">
      <label class="logi-advisor-privacy-ack">
        <input type="checkbox" id="logiAdvisorPrivacyAck" />
        ${escapeHtml(t('apexLogViewer.logi.privacyAck'))}
      </label>
      <button type="button" class="logi-advisor-privacy-dismiss" id="logiAdvisorPrivacyDismiss">${escapeHtml(t('apexLogViewer.logi.privacyDismiss'))}</button>
    </div>`;
  privacyEl.querySelector('#logiAdvisorPrivacyDismiss')?.addEventListener('click', () => {
    const checked = /** @type {HTMLInputElement | null} */ (
      privacyEl.querySelector('#logiAdvisorPrivacyAck')
    )?.checked;
    if (checked) void writePrivacyAck(true);
    privacyEl.hidden = true;
    privacyEl.innerHTML = '';
  });
}

/**
 * @param {HTMLElement} modal
 * @param {object} ctx
 */
async function persistSession(modal, sessionKey) {
  const key = sessionKey || boundSessionKey || modal._sessionKey;
  if (!key) return;
  await persistRuntime(key);
}

/**
 * @param {object} ctx
 */
async function openLogiModal(ctx) {
  await refreshConfig();
  const modal = ensureModal();
  modal.removeAttribute('aria-hidden');
  closeQuickActionEditModal();
  const sessionKey = buildLogiSessionKey(ctx.payload || {});
  const rt = getRuntime(sessionKey);
  const wasProcessingInMemory = rt.processing;
  const saved = await readLogiSession(sessionKey);

  if (!wasProcessingInMemory) {
    applySavedToRuntime(saved, rt);
  } else if (saved?.pending) {
    rt.processing = true;
    rt.thinkingStatus = saved.thinkingStatus || rt.thinkingStatus || '';
  } else if (!saved?.pending) {
    rt.processing = false;
    rt.thinkingStatus = '';
  }

  bindSession(sessionKey);
  rt.lastCtx = ctx;
  modal._ctx = ctx;
  modal._sessionKey = sessionKey;
  if (ctx.summaryText && typeof ctx.summaryText === 'string' && ctx.summaryText.trim()) {
    rt.resumeSummary = ctx.summaryText.trim();
  }
  setLogiButtonBadge(false);

  if (rt.processing && !wasProcessingInMemory) {
    startSessionPoll(modal, sessionKey);
  } else {
    stopSessionPoll();
  }

  const iterRes = await bg({
    type: 'aiAdvisor:getSessionIteration',
    sessionKey
  });
  if (iterRes?.ok) {
    iteration = Math.max(iteration, iterRes.iteration || 0);
    rt.iteration = iteration;
  }

  if (isNewChat) {
    const usageRes = await bg({ type: 'aiAdvisor:checkUsageLimits' });
    applyUsageHint(modal, usageRes);
    if (!usageRes?.ok && isUsageLimitReason(usageRes?.reason)) {
      handleUsageLimit(modal, usageRes);
    }
  } else {
    const usageRes = await bg({ type: 'aiAdvisor:checkUsageLimits' });
    applyUsageHint(modal, usageRes);
  }

  await loadPanelLayout();
  applyPanelLayout(modal);

  const titleEl = modal.querySelector('#logiAdvisorTitle');
  const betaEl = modal.querySelector('#logiAdvisorBeta');
  const sendBtn = modal.querySelector('#logiAdvisorSend');
  const stopBtn = modal.querySelector('#logiAdvisorStop');
  const inputEl = modal.querySelector('#logiAdvisorInput');
  const closeBtn = modal.querySelector('.logi-advisor-close');
  const dockBtn = modal.querySelector('#logiAdvisorDockToggle');

  if (titleEl) titleEl.textContent = t('apexLogViewer.logi.title');
  if (betaEl) {
    betaEl.textContent = advisorConfig?.beta ? t('apexLogViewer.logi.beta') : '';
    betaEl.hidden = !advisorConfig?.beta;
  }
  updateLogiHeaderUi(modal);
  await renderPrivacyNotice(modal);
  if (sendBtn) sendBtn.textContent = t('apexLogViewer.logi.send');
  if (stopBtn) {
    stopBtn.textContent = t('apexLogViewer.logi.stop');
    stopBtn.setAttribute('aria-label', t('apexLogViewer.logi.stop'));
  }
  if (dockBtn) applyPanelLayout(modal);
  pendingLineAttachment = lineAttachmentFromCtx(ctx);
  pendingQuoteAttachment = null;
  renderInputAttachments(modal);
  if (inputEl) {
    updateInputPlaceholder(modal);
    // Keep free text empty when an attachment badge is shown; only use string prefill otherwise.
    inputEl.value =
      pendingLineAttachment || pendingQuoteAttachment || typeof ctx.prefill !== 'string'
        ? ''
        : ctx.prefill;
    if (pendingLineAttachment || pendingQuoteAttachment || ctx.prefill) {
      inputEl.focus();
    }
  }
  if (closeBtn) closeBtn.setAttribute('aria-label', t('apexLogViewer.logi.close'));
  const exportBtn = modal.querySelector('#logiAdvisorExportChat');
  if (exportBtn) {
    exportBtn.textContent = t('apexLogViewer.logi.exportChat');
    exportBtn.title = t('apexLogViewer.logi.exportChat');
    exportBtn.hidden = false;
  }

  customQuickActionPrompts = await loadLogiQuickActionPrompts();
  customQuickActions = getLogiCustomQuickActionsSnapshot();
  renderQuickActions(modal);
  applyQuickActionsCollapsed(modal, readQuickActionsCollapsed());
  if (stripWelcomeGreetings(rt) && sessionKey) {
    void persistRuntime(sessionKey);
  }
  bindSession(sessionKey);
  syncBusyUi(modal);
  updateIterationsLabel(modal);

  modal.hidden = false;
  // Paint after unhiding: refreshUiIfBound skips render while modal.hidden.
  renderMessages(modal);
  inputEl?.focus();
}

/**
 * Remove legacy Logi welcome bubbles from the session (no longer shown).
 * @param {SessionRuntime} rt
 * @returns {boolean} true if messages were modified
 */
function stripWelcomeGreetings(rt) {
  const before = rt.messages.length;
  rt.messages = rt.messages.filter((m) => !(m.role === 'assistant' && isLogiWelcomeGreeting(m.content || '')));
  return rt.messages.length !== before;
}

/**
 * @param {string} content
 */
function isLogiWelcomeGreeting(content) {
  const raw = stripInvisibleChars(content).trim();
  if (!raw) return false;
  if (raw === t('apexLogViewer.logi.greeting')) return true;
  // Match both UI languages so a session opened after a language switch still strips it.
  return (
    raw === 'Hola, soy Logi. Puedo ayudarte a entender errores, SOQL, límites y el flujo de este log.' ||
    raw === "Hi, I'm Logi. I can help you understand errors, SOQL, limits, and the flow of this log."
  );
}

function readQuickActionsCollapsed() {
  try {
    return localStorage.getItem(QUICK_ACTIONS_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * @param {boolean} collapsed
 */
function writeQuickActionsCollapsed(collapsed) {
  try {
    localStorage.setItem(QUICK_ACTIONS_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * @param {HTMLElement} modal
 * @param {boolean} collapsed
 */
function applyQuickActionsCollapsed(modal, collapsed) {
  const section = modal.querySelector('#logiAdvisorQuickSection');
  const toggle = modal.querySelector('#logiAdvisorQuickToggle');
  const label = modal.querySelector('#logiAdvisorQuickToggleLabel');
  if (!section || !toggle) return;

  ensureQuickToggleLead(toggle, label);
  section.classList.toggle('logi-advisor-quick-section--collapsed', collapsed);
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  toggle.setAttribute(
    'aria-label',
    collapsed ? t('apexLogViewer.logi.quickActionsExpand') : t('apexLogViewer.logi.quickActionsCollapse')
  );
  if (label) label.textContent = t('apexLogViewer.logi.quickActions');
}

/**
 * @param {Element} toggle
 * @param {Element | null} label
 */
function ensureQuickToggleLead(toggle, label) {
  if (!label || toggle.querySelector('.logi-advisor-quick-toggle-lead')) return;
  const lead = document.createElement('span');
  lead.className = 'logi-advisor-quick-toggle-lead';
  lead.innerHTML = QUICK_ACTIONS_ICON_SVG;
  label.replaceWith(lead);
  lead.appendChild(label);
}

/**
 * @param {HTMLElement} modal
 * @param {boolean} collapsed
 */
function setQuickActionsCollapsed(modal, collapsed) {
  writeQuickActionsCollapsed(collapsed);
  applyQuickActionsCollapsed(modal, collapsed);
}

/**
 * @param {HTMLElement} modal
 */
function renderQuickActions(modal) {
  const section = modal.querySelector('#logiAdvisorQuickSection');
  const mount = modal.querySelector('#logiAdvisorQuick');
  const exportBtn = modal.querySelector('#logiAdvisorQuickExport');
  const importBtn = modal.querySelector('#logiAdvisorQuickImport');
  const addBtn = modal.querySelector('#logiAdvisorQuickAdd');
  if (!mount || !section) return;
  if (addBtn) {
    addBtn.textContent = t('apexLogViewer.logi.quickActionsAdd');
    addBtn.title = t('apexLogViewer.logi.quickActionsAdd');
  }
  if (exportBtn) {
    exportBtn.textContent = t('apexLogViewer.logi.quickActionsExport');
    exportBtn.title = t('apexLogViewer.logi.quickActionsExport');
  }
  if (importBtn) {
    importBtn.textContent = t('apexLogViewer.logi.quickActionsImport');
    importBtn.title = t('apexLogViewer.logi.quickActionsImport');
  }
  const builtIn = advisorConfig?.quickActions || [];
  const customIds = customQuickActions.map((a) => a.id);
  const actions = [...builtIn, ...customIds.filter((id) => !builtIn.includes(id))];
  if (!actions.length) {
    section.hidden = true;
    mount.innerHTML = '';
    return;
  }
  section.hidden = false;
  const labels = getQuickActionLabels();
  mount.innerHTML = actions
    .map((id) => {
      const isCustom = isLogiCustomQuickActionId(id);
      const meta = isCustom
        ? { tone: 'violet', icon: CUSTOM_ACTION_ICON_SVG }
        : QUICK_ACTION_META[id] || { tone: 'sky', icon: LOGI_AVATAR_SVG };
      const label = labels[id] || id;
      const isCustomPrompt = Boolean(getCustomQuickActionPrompt(id));
      return `<div class="logi-advisor-chip-wrap logi-advisor-chip-wrap--${meta.tone}">
        <button type="button" class="logi-advisor-chip logi-advisor-chip--${meta.tone}" data-action="${escapeHtml(id)}">
          <span class="logi-advisor-chip-icon">${meta.icon}</span>
          <span class="logi-advisor-chip-label">${escapeHtml(label)}</span>
        </button>
        <button type="button" class="logi-advisor-chip-edit${isCustomPrompt || isCustom ? ' logi-advisor-chip-edit--custom' : ''}" data-edit-action="${escapeHtml(id)}" aria-label="${escapeHtml(t('apexLogViewer.logi.quickActionEdit'))}" title="${escapeHtml(t('apexLogViewer.logi.quickActionEdit'))}">${PENCIL_ICON_SVG}</button>
      </div>`;
    })
    .join('');
  mount.querySelectorAll('.logi-advisor-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const actionId = btn.getAttribute('data-action');
      if (!actionId) return;
      void runQuickAction(modal, actionId);
    });
  });
  mount.querySelectorAll('.logi-advisor-chip-edit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const actionId = btn.getAttribute('data-edit-action');
      if (!actionId) return;
      openQuickActionEditModal(actionId, modal);
    });
  });
}

function getPromptLang(messages) {
  const settingsLang = advisorConfig?.userSettings?.logiLanguage;
  const list =
    messages ??
    (boundSessionKey ? getRuntime(boundSessionKey).messages : getModalRuntime(modalEl)?.messages);
  return resolveLogiPromptLang({ settingsLang, messages: list });
}

/**
 * @param {string} actionId
 */
function getCustomQuickActionPrompt(actionId) {
  const lang = getPromptLang();
  return customQuickActionPrompts?.[lang]?.[actionId] || '';
}

/**
 * @param {string} actionId
 * @param {HTMLElement} parentModal
 */
function openQuickActionEditModal(actionId, parentModal) {
  ensureQuickActionEditModal();
  if (!quickActionEditModalEl) return;
  const lang = getPromptLang();
  const labels = getQuickActionLabels();
  const title = quickActionEditModalEl.querySelector('#logiQuickActionEditTitle');
  const labelRow = quickActionEditModalEl.querySelector('#logiQuickActionEditLabelRow');
  const labelInput = quickActionEditModalEl.querySelector('#logiQuickActionEditLabel');
  const textarea = quickActionEditModalEl.querySelector('#logiQuickActionEditText');
  const status = quickActionEditModalEl.querySelector('#logiQuickActionEditStatus');
  const resetBtn = quickActionEditModalEl.querySelector('#logiQuickActionEditReset');
  const deleteBtn = quickActionEditModalEl.querySelector('#logiQuickActionEditDelete');
  if (!textarea) return;

  const isCustom = isLogiCustomQuickActionId(actionId);
  quickActionEditModalEl.dataset.actionId = actionId;
  quickActionEditModalEl.dataset.mode = 'edit';
  if (title) {
    title.textContent = t('apexLogViewer.logi.quickActionEditTitle', {
      action: labels[actionId] || actionId
    });
  }
  if (labelRow) labelRow.hidden = !isCustom;
  if (labelInput) labelInput.value = labels[actionId] || '';
  textarea.value =
    getCustomQuickActionPrompt(actionId) || getDefaultQuickActionUserMessage(actionId, lang);
  if (status) status.textContent = '';
  if (resetBtn) resetBtn.hidden = isCustom;
  if (deleteBtn) deleteBtn.hidden = !isCustom;
  quickActionEditModalEl.hidden = false;
  parentModal.setAttribute('aria-hidden', 'true');
  (isCustom && labelInput ? labelInput : textarea).focus();
}

/**
 * @param {HTMLElement} parentModal
 */
function openQuickActionCreateModal(parentModal) {
  ensureQuickActionEditModal();
  if (!quickActionEditModalEl) return;
  const title = quickActionEditModalEl.querySelector('#logiQuickActionEditTitle');
  const labelRow = quickActionEditModalEl.querySelector('#logiQuickActionEditLabelRow');
  const labelInput = quickActionEditModalEl.querySelector('#logiQuickActionEditLabel');
  const textarea = quickActionEditModalEl.querySelector('#logiQuickActionEditText');
  const status = quickActionEditModalEl.querySelector('#logiQuickActionEditStatus');
  const resetBtn = quickActionEditModalEl.querySelector('#logiQuickActionEditReset');
  const deleteBtn = quickActionEditModalEl.querySelector('#logiQuickActionEditDelete');
  if (!textarea) return;

  delete quickActionEditModalEl.dataset.actionId;
  quickActionEditModalEl.dataset.mode = 'create';
  if (title) title.textContent = t('apexLogViewer.logi.quickActionCreateTitle');
  if (labelRow) labelRow.hidden = false;
  if (labelInput) labelInput.value = '';
  textarea.value = '';
  if (status) status.textContent = '';
  if (resetBtn) resetBtn.hidden = true;
  if (deleteBtn) deleteBtn.hidden = true;
  quickActionEditModalEl.hidden = false;
  parentModal.setAttribute('aria-hidden', 'true');
  labelInput?.focus();
}

function closeQuickActionEditModal() {
  if (!quickActionEditModalEl) return;
  quickActionEditModalEl.hidden = true;
  delete quickActionEditModalEl.dataset.actionId;
  delete quickActionEditModalEl.dataset.mode;
  if (modalEl) modalEl.removeAttribute('aria-hidden');
}

function ensureQuickActionEditModal() {
  if (quickActionEditModalEl) return quickActionEditModalEl;
  quickActionEditModalEl = document.createElement('div');
  quickActionEditModalEl.className = 'logi-advisor-edit-modal ph-no-capture';
  quickActionEditModalEl.hidden = true;
  quickActionEditModalEl.innerHTML = `
    <div class="logi-advisor-edit-backdrop" data-close-edit="1"></div>
    <div class="logi-advisor-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="logiQuickActionEditTitle">
      <header class="logi-advisor-edit-header">
        <h3 id="logiQuickActionEditTitle"></h3>
        <button type="button" class="logi-advisor-close" data-close-edit="1" aria-label="Close">×</button>
      </header>
      <p class="logi-advisor-edit-hint" id="logiQuickActionEditHint"></p>
      <label class="logi-advisor-edit-label-row" id="logiQuickActionEditLabelRow" hidden>
        <span id="logiQuickActionEditLabelCaption"></span>
        <input type="text" id="logiQuickActionEditLabel" class="logi-advisor-edit-label-input" maxlength="40" />
      </label>
      <textarea id="logiQuickActionEditText" class="logi-advisor-edit-textarea" rows="12" spellcheck="false"></textarea>
      <footer class="logi-advisor-edit-footer">
        <button type="button" class="logi-advisor-edit-secondary" id="logiQuickActionEditReset"></button>
        <button type="button" class="logi-advisor-edit-danger" id="logiQuickActionEditDelete"></button>
        <div class="logi-advisor-edit-actions">
          <button type="button" class="logi-advisor-edit-secondary" id="logiQuickActionEditCancel"></button>
          <button type="button" class="logi-advisor-edit-primary" id="logiQuickActionEditSave"></button>
        </div>
      </footer>
      <p id="logiQuickActionEditStatus" class="logi-advisor-edit-status" role="status"></p>
    </div>`;
  document.body.appendChild(quickActionEditModalEl);

  quickActionEditModalEl.querySelector('#logiQuickActionEditHint').textContent = t(
    'apexLogViewer.logi.quickActionEditHint'
  );
  quickActionEditModalEl.querySelector('#logiQuickActionEditLabelCaption').textContent = t(
    'apexLogViewer.logi.quickActionLabel'
  );
  quickActionEditModalEl.querySelector('#logiQuickActionEditLabel').placeholder = t(
    'apexLogViewer.logi.quickActionLabelPlaceholder'
  );
  quickActionEditModalEl.querySelector('#logiQuickActionEditReset').textContent = t(
    'apexLogViewer.logi.quickActionEditReset'
  );
  quickActionEditModalEl.querySelector('#logiQuickActionEditDelete').textContent = t(
    'apexLogViewer.logi.quickActionDelete'
  );
  quickActionEditModalEl.querySelector('#logiQuickActionEditCancel').textContent = t(
    'apexLogViewer.logi.quickActionEditCancel'
  );
  quickActionEditModalEl.querySelector('#logiQuickActionEditSave').textContent = t(
    'apexLogViewer.logi.quickActionEditSave'
  );

  quickActionEditModalEl.querySelectorAll('[data-close-edit]').forEach((el) => {
    el.addEventListener('click', () => closeQuickActionEditModal());
  });

  quickActionEditModalEl.querySelector('#logiQuickActionEditCancel')?.addEventListener('click', () => {
    closeQuickActionEditModal();
  });

  quickActionEditModalEl.querySelector('#logiQuickActionEditReset')?.addEventListener('click', async () => {
    const actionId = quickActionEditModalEl.dataset.actionId;
    if (!actionId || isLogiCustomQuickActionId(actionId)) return;
    const lang = getPromptLang();
    customQuickActionPrompts = await saveLogiQuickActionPrompt(actionId, lang, null);
    const textarea = quickActionEditModalEl.querySelector('#logiQuickActionEditText');
    const status = quickActionEditModalEl.querySelector('#logiQuickActionEditStatus');
    if (textarea) textarea.value = getDefaultQuickActionUserMessage(actionId, lang);
    if (status) status.textContent = t('apexLogViewer.logi.quickActionEditResetDone');
    if (modalEl) renderQuickActions(modalEl);
  });

  quickActionEditModalEl.querySelector('#logiQuickActionEditDelete')?.addEventListener('click', async () => {
    const actionId = quickActionEditModalEl.dataset.actionId;
    if (!actionId || !isLogiCustomQuickActionId(actionId)) return;
    const status = quickActionEditModalEl.querySelector('#logiQuickActionEditStatus');
    const deleteBtn = quickActionEditModalEl.querySelector('#logiQuickActionEditDelete');
    if (deleteBtn?.dataset.confirmPending === '1') {
      customQuickActionPrompts = await deleteLogiCustomQuickAction(actionId);
      customQuickActions = getLogiCustomQuickActionsSnapshot();
      if (modalEl) renderQuickActions(modalEl);
      closeQuickActionEditModal();
      return;
    }
    if (deleteBtn) {
      deleteBtn.dataset.confirmPending = '1';
      deleteBtn.textContent = t('apexLogViewer.logi.quickActionDeleteConfirmBtn');
    }
    if (status) status.textContent = t('apexLogViewer.logi.quickActionDeleteConfirm');
  });

  quickActionEditModalEl.querySelector('#logiQuickActionEditSave')?.addEventListener('click', async () => {
    const mode = quickActionEditModalEl.dataset.mode || 'edit';
    const actionId = quickActionEditModalEl.dataset.actionId;
    const labelInput = quickActionEditModalEl.querySelector('#logiQuickActionEditLabel');
    const textarea = quickActionEditModalEl.querySelector('#logiQuickActionEditText');
    const status = quickActionEditModalEl.querySelector('#logiQuickActionEditStatus');
    if (!textarea) return;
    const lang = getPromptLang();
    const text = String(textarea.value || '').trim();
    const label = String(labelInput?.value || '').trim();
    if (!text || (mode === 'create' && !label)) {
      if (status) status.textContent = t('apexLogViewer.logi.quickActionEditEmpty');
      return;
    }

    if (mode === 'create') {
      const created = await createLogiCustomQuickAction({
        labels: { es: label, en: label },
        prompt: text,
        lang
      });
      if (!created.ok) {
        if (status) {
          status.textContent =
            created.error === 'limit'
              ? t('apexLogViewer.logi.quickActionCreateLimit')
              : t('apexLogViewer.logi.quickActionEditEmpty');
        }
        return;
      }
      customQuickActionPrompts = getLogiQuickActionPromptsSnapshot();
      customQuickActions = getLogiCustomQuickActionsSnapshot();
      if (status) status.textContent = t('apexLogViewer.logi.quickActionCreateSaved');
      if (modalEl) renderQuickActions(modalEl);
      window.setTimeout(() => closeQuickActionEditModal(), 450);
      return;
    }

    if (!actionId) return;

    if (isLogiCustomQuickActionId(actionId)) {
      const current = customQuickActions.find((a) => a.id === actionId);
      const labels = {
        es: lang === 'es' ? label : current?.labels?.es || label,
        en: lang === 'en' ? label : current?.labels?.en || label
      };
      customQuickActions = await saveLogiCustomQuickActionLabels(actionId, labels);
    }

    const defaultText = getDefaultQuickActionUserMessage(actionId, lang);
    customQuickActionPrompts = await saveLogiQuickActionPrompt(
      actionId,
      lang,
      isLogiCustomQuickActionId(actionId) || text !== defaultText ? text : null
    );
    if (status) status.textContent = t('apexLogViewer.logi.quickActionEditSaved');
    if (modalEl) renderQuickActions(modalEl);
    window.setTimeout(() => closeQuickActionEditModal(), 450);
  });

  return quickActionEditModalEl;
}

function exportQuickActionPrompts() {
  const payload = buildLogiQuickActionPromptsExport();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = `sfoc-logi-quick-actions-${stamp}.json`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/**
 * @param {HTMLInputElement} input
 */
async function importQuickActionPromptsFromFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    customQuickActionPrompts = await importLogiQuickActionPromptStore(data, { replace: true });
    customQuickActions = getLogiCustomQuickActionsSnapshot();
    if (modalEl) renderQuickActions(modalEl);
  } catch {
    /* ignore invalid file */
  }
}

function getQuickActionLabels() {
  const lang = getPromptLang();
  /** @type {Record<string, string>} */
  const labels = {
    debug_errors: t('apexLogViewer.logi.action.debugErrors'),
    explain_flow: t('apexLogViewer.logi.action.explainFlow'),
    soql_dml: t('apexLogViewer.logi.action.soqlDml'),
    test_failure: t('apexLogViewer.logi.action.testFailure'),
    limits: t('apexLogViewer.logi.action.limits'),
    suggest_fix: t('apexLogViewer.logi.action.suggestFix'),
    callouts: t('apexLogViewer.logi.action.callouts'),
    validations: t('apexLogViewer.logi.action.validations'),
    hotspots: t('apexLogViewer.logi.action.hotspots')
  };
  for (const action of customQuickActions) {
    labels[action.id] = action.labels[lang] || action.labels.es || action.labels.en || action.id;
  }
  return labels;
}

/**
 * @param {ChatMessage} message
 */
function renderUserMessageHtml(message) {
  const actionId = message.quickActionId;
  if (actionId && QUICK_ACTION_META[actionId]) {
    const meta = QUICK_ACTION_META[actionId];
    const label = getQuickActionLabels()[actionId] || actionId;
    return `<div class="logi-advisor-msg logi-advisor-msg--user logi-advisor-msg--quick-action">
      <div class="logi-advisor-msg-body logi-advisor-msg-body--quick-action logi-advisor-chip--${meta.tone}">
        <em class="logi-advisor-quick-run">
          <span class="logi-advisor-quick-run-prefix">${escapeHtml(t('apexLogViewer.logi.quickActionRan'))}</span>
          <span class="logi-advisor-quick-run-icon" aria-hidden="true">${meta.icon}</span>
          <span class="logi-advisor-quick-run-label">${escapeHtml(label)}</span>
        </em>
      </div>
    </div>`;
  }

  const lineRef = normalizeLineRef(message.lineRef);
  const quoteRef = normalizeQuoteRef(message.quoteRef);
  if (lineRef || quoteRef) {
    const note = String(message.displayText || '').trim();
    const badges = [];
    if (lineRef) {
      badges.push(
        `<span class="logi-advisor-line-badge logi-advisor-line-badge--msg">${escapeHtml(formatLineRefBadgeLabel(lineRef))}</span>`
      );
    }
    if (quoteRef) {
      badges.push(
        `<span class="logi-advisor-line-badge logi-advisor-line-badge--msg logi-advisor-quote-badge">${escapeHtml(formatQuoteBadgeLabel(quoteRef.content))}</span>`
      );
    }
    return `<div class="logi-advisor-msg logi-advisor-msg--user logi-advisor-msg--line-ref">
      <div class="logi-advisor-msg-body logi-advisor-msg-body--line-ref">
        ${badges.join('')}
        ${note ? `<span class="logi-advisor-line-note">${escapeHtml(note)}</span>` : ''}
      </div>
    </div>`;
  }

  return `<div class="logi-advisor-msg logi-advisor-msg--user"><div class="logi-advisor-msg-body">${escapeHtml(message.content || '')}</div></div>`;
}

/**
 * @param {HTMLElement} modal
 */
function renderMessages(modal) {
  const mount = modal.querySelector('#logiAdvisorMessages');
  if (!mount) return;
  const rt = getModalRuntime(modal);
  const sessionMessages = rt?.messages ?? messages;
  const showThinking = shouldShowThinking(rt);
  const parsed = modal._ctx?.getParsed?.() || null;
  const greetingOnly = isGreetingOnlyChat(sessionMessages);
  const copyLabel = t('apexLogViewer.logi.copy');
  const regenerateLabel = t('apexLogViewer.logi.regenerate');
  const quoteLabel = t('apexLogViewer.logi.quote');

  /** @type {number} */
  let lastVisibleAssistantIndex = -1;
  sessionMessages.forEach((m, idx) => {
    if (
      m.role === 'assistant' &&
      !isLogiWelcomeGreeting(m.content || '') &&
      isVisibleAssistantContent(m.content || '')
    ) {
      lastVisibleAssistantIndex = idx;
    }
  });

  mount.innerHTML = sessionMessages
    .map((m, idx) => {
      if (m.role === 'user') {
        return renderUserMessageHtml(m);
      }
      if (m.role === 'assistant') {
        if (isLogiWelcomeGreeting(m.content || '')) return '';
        const bodyHtml = formatAssistantHtml(m.content || '', modal);
        if (!isVisibleAssistantContent(m.content || '') || !bodyHtml.trim()) return '';
        const actions = `<div class="logi-advisor-msg-actions">
          <button type="button" class="logi-advisor-msg-action" data-logi-msg-action="copy" data-msg-index="${idx}">${escapeHtml(copyLabel)}</button>
          <button type="button" class="logi-advisor-msg-action" data-logi-msg-action="regenerate" data-msg-index="${idx}">${escapeHtml(regenerateLabel)}</button>
          <button type="button" class="logi-advisor-msg-action" data-logi-msg-action="quote" data-msg-index="${idx}">${escapeHtml(quoteLabel)}</button>
        </div>`;
        let followUps = '';
        if (!showThinking && idx === lastVisibleAssistantIndex && !greetingOnly) {
          const ids = getFollowUpActionIds(m.content || '', parsed);
          if (ids.length) {
            followUps = `<div class="logi-advisor-followup-chips">
              <span class="logi-advisor-suggest-label">${escapeHtml(t('apexLogViewer.logi.followUpTitle'))}</span>
              ${ids
                .map(
                  (id) =>
                    `<button type="button" class="logi-advisor-suggest-chip" data-logi-suggest-action="${escapeHtml(id)}">${escapeHtml(getSuggestChipLabel(id, 'followUp'))}</button>`
                )
                .join('')}
            </div>`;
          }
        }
        return `<div class="logi-advisor-msg logi-advisor-msg--assistant">
          <span class="logi-advisor-msg-avatar">${LOGI_AVATAR_SVG}</span>
          <div class="logi-advisor-msg-wrap">
            <span class="logi-advisor-msg-name">Logi</span>
            <div class="logi-advisor-msg-body logi-advisor-msg-body--md">${bodyHtml}</div>
            ${actions}
            ${followUps}
          </div>
        </div>`;
      }
      if (m.role === 'system') {
        return `<div class="logi-advisor-msg logi-advisor-msg--system">${escapeHtml(m.content || '')}</div>`;
      }
      return '';
    })
    .join('');

  if (greetingOnly && !showThinking) {
    const ids = getEmptySuggestActionIds(parsed);
    if (ids.length) {
      mount.insertAdjacentHTML(
        'beforeend',
        `<div class="logi-advisor-suggest-chips" id="logiAdvisorEmptySuggest">
          <span class="logi-advisor-suggest-label">${escapeHtml(t('apexLogViewer.logi.emptySuggestTitle'))}</span>
          ${ids
            .map(
              (id) =>
                `<button type="button" class="logi-advisor-suggest-chip" data-logi-suggest-action="${escapeHtml(id)}">${escapeHtml(getSuggestChipLabel(id, 'empty'))}</button>`
            )
            .join('')}
        </div>`
      );
    }
  }

  mount.querySelectorAll('.logi-md-pre-copy').forEach((btn) => {
    btn.textContent = copyLabel;
    btn.setAttribute('aria-label', copyLabel);
  });

  if (showThinking) {
    mount.insertAdjacentHTML('beforeend', THINKING_BUBBLE_HTML);
    ensureThinkingRotation(modal, getThinkingDeps());
  } else {
    stopThinkingRotation();
  }
  mount.scrollTop = mount.scrollHeight;
}

/**
 * @param {HTMLElement} modal
 */
function syncBusyUi(modal) {
  const sendBtn = modal.querySelector('#logiAdvisorSend');
  const stopBtn = modal.querySelector('#logiAdvisorStop');
  const input = modal.querySelector('#logiAdvisorInput');
  const mount = modal.querySelector('#logiAdvisorMessages');
  const rt = getModalRuntime(modal);
  const busy = isModalBusy(modal);
  const blocked = isChatBlocked();

  if (sendBtn) {
    sendBtn.hidden = busy;
    sendBtn.disabled = blocked;
  }
  if (stopBtn) stopBtn.hidden = !busy;
  if (input) input.disabled = blocked;
  modal.querySelectorAll('.logi-advisor-chip').forEach((btn) => {
    btn.disabled = blocked;
  });
  if (mount) mount.setAttribute('aria-busy', busy ? 'true' : 'false');

  renderQueuePanel(modal, getQueueDeps());
}

/**
 * @param {string} text
 */
function formatAssistantHtml(text, modal) {
  const instanceUrl = modal?._ctx?.payload?.instanceUrl || '';
  return renderLogiMarkdown(text, { instanceUrl });
}

/**
 * @param {string} text
 */
function stripInvisibleChars(text) {
  return String(text || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
}

/**
 * @param {string} content
 */
function isVisibleAssistantContent(content) {
  const raw = stripInvisibleChars(content).trim();
  if (!raw) return false;
  const html = formatAssistantHtml(raw, null);
  if (!html.trim()) return false;
  const text = stripInvisibleChars(html.replace(/<[^>]+>/g, '')).trim();
  return text.length > 0 || /<(?:pre|hr|h[1-4]|ul|ol|table)\b/i.test(html);
}

/**
 * @param {string} content
 */
function getVisibleAssistantContent(content) {
  const raw = stripInvisibleChars(content).trim();
  return isVisibleAssistantContent(raw) ? raw : '';
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `logi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getMaxIterations() {
  return advisorConfig?.maxIterationsPerChat || 10;
}

function isAtIterationLimit() {
  return iteration >= getMaxIterations();
}

/**
 * @param {string} [reason]
 */
function isUsageLimitReason(reason) {
  return (
    reason === 'MAX_CHATS_USER' || reason === 'MAX_CHATS_DAY' || reason === 'MAX_CHATS_MONTH'
  );
}

function isChatBlocked() {
  return isAtIterationLimit() || Boolean(usageLimitReason);
}

/**
 * @param {HTMLElement} modal
 * @param {object} [res]
 */
function applyIterationState(modal, res) {
  if (res && Number.isFinite(Number(res.iteration))) {
    iteration = Math.max(iteration, Math.floor(Number(res.iteration)));
    if (boundSessionKey) {
      getRuntime(boundSessionKey).iteration = iteration;
    }
  }
  updateIterationsLabel(modal);
}

/**
 * @param {HTMLElement} modal
 * @param {object} [res]
 */
function handleMaxIterations(modal, res) {
  applyIterationState(modal, res);
  messageQueue.length = 0;
  if (boundSessionKey) {
    getRuntime(boundSessionKey).messageQueue.length = 0;
  }
  syncBusyUi(modal);
  appendAssistantMessage(t('apexLogViewer.logi.error.maxIterations'), modal);
}

/**
 * @param {HTMLElement} modal
 * @param {object} [res]
 */
function handleUsageLimit(modal, res) {
  const reason = res?.reason || usageLimitReason || 'MAX_CHATS_DAY';
  const wasBlocked = Boolean(usageLimitReason);
  usageLimitReason = reason;
  if (boundSessionKey) {
    getRuntime(boundSessionKey).usageLimitReason = reason;
  }
  messageQueue.length = 0;
  if (boundSessionKey) {
    getRuntime(boundSessionKey).messageQueue.length = 0;
  }
  syncBusyUi(modal);
  if (!wasBlocked) {
    appendAssistantMessage(mapErrorReason(reason), modal);
  }
}

/**
 * @param {HTMLElement} modal
 * @param {object} res
 * @returns {boolean}
 */
function isUsageLimitResponse(modal, res) {
  if (!res || res.ok) return false;
  if (isUsageLimitReason(res.reason)) {
    handleUsageLimit(modal, res);
    return true;
  }
  return false;
}

/**
 * @param {HTMLElement} modal
 * @param {object} res
 * @returns {boolean}
 */
function isMaxIterationsResponse(modal, res) {
  if (!res || res.ok) return false;
  if (res.reason === 'MAX_ITERATIONS') {
    handleMaxIterations(modal, res);
    return true;
  }
  return false;
}

/**
 * @param {string} text
 * @param {HTMLElement} modal
 * @param {{ quickActionId?: string, lineRef?: LogiLineRef, quoteRef?: LogiQuoteRef, displayText?: string }} [opts]
 */
async function enqueueUserMessage(text, modal, opts = {}) {
  const trimmed = String(text || '').trim();
  const lineRef = normalizeLineRef(opts.lineRef);
  const quoteRef = normalizeQuoteRef(opts.quoteRef);
  if (!trimmed && !lineRef && !quoteRef) return;

  if (isChatBlocked()) {
    if (usageLimitReason) {
      handleUsageLimit(modal, { reason: usageLimitReason });
    } else {
      handleMaxIterations(modal);
    }
    return;
  }

  /** @type {QueuedMessage} */
  const queueItem = {
    id: createRequestId(),
    text: buildQueuedMessageLlmText(trimmed, lineRef, quoteRef)
  };
  if (opts.quickActionId) {
    queueItem.quickActionId = opts.quickActionId;
  }
  if (lineRef) {
    queueItem.lineRef = lineRef;
  }
  if (quoteRef) {
    queueItem.quoteRef = quoteRef;
  }
  if (trimmed && (lineRef || quoteRef)) {
    queueItem.displayText = trimmed;
  }
  messageQueue.push(queueItem);
  syncBusyUi(modal);
  await persistSession(modal);
  void drainQueue(modal);
}

/**
 * @param {HTMLElement} modal
 */
async function drainQueue(modal) {
  const sessionKey = modal._sessionKey;
  if (!sessionKey) return;
  const rt = getRuntime(sessionKey);

  if (rt.processing || !rt.messageQueue.length) return;
  if (isChatBlockedFor(rt)) {
    rt.messageQueue.length = 0;
    bindSession(sessionKey);
    if (rt.usageLimitReason) {
      handleUsageLimit(modal, { reason: rt.usageLimitReason });
    } else {
      handleMaxIterations(modal);
    }
    return;
  }

  const next = normalizeQueueItem(rt.messageQueue[0], getQueueDeps());
  if (!next) {
    rt.messageQueue.shift();
    void drainQueue(modal);
    return;
  }

  const turnId = createRequestId();
  rt.processing = true;
  rt.thinkingStatus = '';
  rt.thinkingMode = 'default';
  rt.cancelRequested = false;
  rt.activeTurnId = turnId;
  rt.activeRequestId = createRequestId();
  rt.lastCtx = modal._ctx;
  rt.lastAiMetrics = null;
  rt.messageQueue.shift();

  /** @type {ChatMessage} */
  const userMessage = { role: 'user', content: next.text };
  if (next.quickActionId) {
    userMessage.quickActionId = next.quickActionId;
  }
  if (next.lineRef) {
    userMessage.lineRef = next.lineRef;
  }
  if (next.quoteRef) {
    userMessage.quoteRef = next.quoteRef;
  }
  if (next.displayText) {
    userMessage.displayText = next.displayText;
  }
  rt.messages.push(userMessage);

  bindSession(sessionKey);
  await persistRuntime(sessionKey);
  syncBusyUi(modal);
  renderMessages(modal);

  const requestId = rt.activeRequestId;

  startTurnTimeout(sessionKey, turnId, modal, LOGI_TURN_TIMEOUT_MS);

  try {
    await runChatTurn(modal, sessionKey, requestId, turnId);
  } finally {
    clearTurnTimeout(sessionKey);
    const rtAfter = getRuntime(sessionKey);
    rtAfter.turnDeadline = null;
    rtAfter.turnTimedOut = false;
    if (rt.activeTurnId === turnId) {
      stopThinkingRotation();
      rt.processing = false;
      rt.thinkingStatus = '';
      rt.thinkingReason = '';
      rt.thinkingMode = 'default';
      rt.activeTurnId = null;
      rt.activeRequestId = null;
    }
    rt.cancelRequested = false;
    await persistRuntime(sessionKey);
    onAdvisorJobFinished(modal, sessionKey);
    if (rt.messageQueue.length) {
      void drainQueueForSession(modal, sessionKey);
    }
  }
}

/**
 * @param {HTMLElement} modal
 * @param {string} sessionKey
 */
async function drainQueueForSession(modal, sessionKey) {
  const prevKey = modal._sessionKey;
  const prevCtx = modal._ctx;
  modal._sessionKey = sessionKey;
  const rt = getRuntime(sessionKey);
  if (rt.lastCtx) {
    modal._ctx = rt.lastCtx;
  }
  await drainQueue(modal);
  modal._sessionKey = prevKey;
  modal._ctx = prevCtx;
  if (prevKey) {
    bindSession(prevKey);
  }
}

/**
 * @param {HTMLElement} modal
 * @param {{ silent?: boolean }} [opts]
 */
async function cancelActiveGeneration(modal, opts = {}) {
  const sessionKey = boundSessionKey || modal._sessionKey;
  if (!sessionKey) return;
  const rt = getRuntime(sessionKey);
  if (!rt.processing) return;

  rt.cancelRequested = true;
  const requestId = rt.activeRequestId;

  stopThinkingRotation();
  rt.processing = false;
  rt.thinkingStatus = '';
  rt.thinkingReason = '';
  rt.thinkingMode = 'default';
  rt.activeTurnId = null;
  rt.activeRequestId = null;

  bindSession(sessionKey);
  renderMessages(modal);
  syncBusyUi(modal);

  if (requestId) {
    void bg({ type: 'aiAdvisor:cancel', requestId });
  }
  if (!opts.silent) {
    appendAssistantMessage(t('apexLogViewer.logi.cancelled'), modal, { skipPersist: false });
  }
  await persistRuntime(sessionKey);
}

/**
 * @param {string} sessionKey
 */
function wasCancelled(sessionKey) {
  return getRuntime(sessionKey).cancelRequested;
}

/**
 * @param {string} text
 * @param {HTMLElement} modal
 * @param {{ skipPersist?: boolean }} [opts]
 */
function appendAssistantMessage(text, modal, opts = {}) {
  const sessionKey = boundSessionKey || modal._sessionKey;
  if (!sessionKey) return;
  appendAssistantMessageForSession(text, modal, sessionKey, opts);
}

/**
 * @param {string} text
 * @param {HTMLElement} modal
 * @param {string} sessionKey
 * @param {{ skipPersist?: boolean }} [opts]
 */
function appendAssistantMessageForSession(text, modal, sessionKey, opts = {}) {
  const visible = getVisibleAssistantContent(text);
  if (!visible) return;
  const rt = getRuntime(sessionKey);
  rt.messages.push({ role: 'assistant', content: visible });
  refreshUiIfBound(modal, sessionKey);
  if (!opts.skipPersist) {
    void persistRuntime(sessionKey);
  }
}

async function onSendFromInput() {
  const modal = modalEl;
  if (!modal) return;
  const input = modal.querySelector('#logiAdvisorInput');
  const text = input?.value?.trim() || '';
  const lineRef = pendingLineAttachment;
  const quoteRef = pendingQuoteAttachment;
  if (!text && !lineRef && !quoteRef) return;
  if (input) input.value = '';
  pendingLineAttachment = null;
  pendingQuoteAttachment = null;
  renderInputAttachments(modal);
  updateInputPlaceholder(modal);
  await enqueueUserMessage(text, modal, {
    ...(lineRef ? { lineRef } : {}),
    ...(quoteRef ? { quoteRef } : {})
  });
}

/**
 * Chat via streaming port when available; falls back to one-shot bg message.
 * @param {object} payload
 * @param {{ onDelta?: (text: string) => void }} [hooks]
 */
function requestLogiChat(payload, hooks = {}) {
  const onDelta = typeof hooks.onDelta === 'function' ? hooks.onDelta : null;
  if (!onDelta || typeof chrome === 'undefined' || !chrome.runtime?.connect) {
    return bg({ type: 'aiAdvisor:chat', ...payload });
  }

  return new Promise((resolve) => {
    let settled = false;
    /** @type {chrome.runtime.Port | null} */
    let port = null;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      try {
        port?.disconnect();
      } catch {
        /* ignore */
      }
      resolve(res);
    };

    try {
      port = chrome.runtime.connect({ name: 'logi-chat-stream' });
    } catch {
      void bg({ type: 'aiAdvisor:chat', ...payload }).then(finish);
      return;
    }

    port.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'delta' && typeof msg.text === 'string') {
        onDelta(msg.text);
        return;
      }
      if (msg.type === 'done') {
        finish(msg.result || { ok: false, reason: 'LLM_ERROR' });
        return;
      }
      if (msg.type === 'error') {
        finish({
          ok: false,
          reason: msg.reason || 'LLM_ERROR',
          error: msg.error || 'LLM_ERROR'
        });
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      // Port died mid-stream — fall back to non-streaming chat.
      void bg({ type: 'aiAdvisor:chat', ...payload }).then(finish);
    });

    try {
      port.postMessage({ type: 'aiAdvisor:chatStream', payload });
    } catch {
      void bg({ type: 'aiAdvisor:chat', ...payload }).then(finish);
    }
  });
}

/**
 * @param {HTMLElement} modal
 * @param {string} sessionKey
 * @param {string} delta
 */
function appendStreamDelta(modal, sessionKey, delta) {
  if (!delta || !modal || modal.hidden) return;
  if (boundSessionKey !== sessionKey) return;
  const mount = modal.querySelector('#logiAdvisorMessages');
  if (!mount) return;

  let bubble = mount.querySelector('.logi-advisor-msg--streaming');
  if (!bubble) {
    // Hide thinking bubble while streaming text.
    mount.querySelector('.logi-advisor-msg--thinking')?.remove();
    stopThinkingRotation();
    bubble = document.createElement('div');
    bubble.className = 'logi-advisor-msg logi-advisor-msg--assistant logi-advisor-msg--streaming';
    bubble.innerHTML = `
      <span class="logi-advisor-msg-avatar">${LOGI_AVATAR_SVG}</span>
      <div class="logi-advisor-msg-wrap">
        <span class="logi-advisor-msg-name">Logi</span>
        <div class="logi-advisor-msg-body logi-advisor-msg-body--md" data-stream-body="1"></div>
      </div>`;
    mount.appendChild(bubble);
  }

  const body = bubble.querySelector('[data-stream-body]');
  if (!body) return;
  const prev = body.dataset.raw || '';
  const next = prev + delta;
  body.dataset.raw = next;
  body.innerHTML = formatAssistantHtml(next, modal);
  mount.scrollTop = mount.scrollHeight;
}

/**
 * @param {HTMLElement} modal
 */
function clearStreamBubble(modal) {
  modal?.querySelector('.logi-advisor-msg--streaming')?.remove();
}

/**
 * @param {HTMLElement} modal
 * @param {string} sessionKey
 * @param {string} requestId
 * @param {string} turnId
 */
async function runChatTurn(modal, sessionKey, requestId, turnId) {
  const rt = getRuntime(sessionKey);
  const ctx =
    sessionKey === modal._sessionKey ? modal._ctx || {} : rt.lastCtx || modal._ctx || {};
  const parsed = ctx.getParsed?.();
  const raw = ctx.getRawContent?.() || '';
  const payload = ctx.payload || {};
  const lang = getPromptLang(rt.messages);

  const initialContext = buildLogContextForModal(modal, parsed, payload, sessionKey);

  const chatPayload = {
    requestId,
    sessionKey,
    messages: rt.messages.filter(
      (m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool'
    ),
    initialContext,
    orgId: payload.orgId || '',
    logId: payload.logId || '',
    logiLanguage: lang,
    isNewChat: rt.isNewChat,
    ...buildChatMessageExtras()
  };

  const res = await requestLogiChat(chatPayload, {
    onDelta: (text) => {
      if (!shouldApplyTurnResult(sessionKey, turnId)) return;
      appendStreamDelta(modal, sessionKey, text);
    }
  });
  clearStreamBubble(modal);
  if (!shouldApplyTurnResult(sessionKey, turnId)) return;

  if (res?.ok) {
    rt.isNewChat = false;
  }
  if (Number.isFinite(Number(res?.iteration))) {
    rt.iteration = Math.max(rt.iteration, Math.floor(Number(res.iteration)));
  }
  bindSession(sessionKey);
  applyIterationState(modal, res);
  await persistRuntime(sessionKey);
  refreshUiIfBound(modal, sessionKey);

  if (!shouldApplyTurnResult(sessionKey, turnId)) return;

  if (isUsageLimitResponse(modal, res)) return;
  if (isMaxIterationsResponse(modal, res)) return;

  if (!shouldApplyTurnResult(sessionKey, turnId)) return;

  if (!res?.ok) {
    if (res?.reason === 'CANCELLED' || hasTurnTimedOut(sessionKey)) return;
    const reason = res?.reason || inferBridgeFailureReason(res);
    if (reason === 'LLM_TIMEOUT') {
      rt.turnTimedOut = true;
      clearTurnTimeout(sessionKey);
    }
    appendAssistantMessageForSession(
      mapErrorReason(reason, res?.error),
      modal,
      sessionKey
    );
    finishTurnUi(sessionKey, turnId, modal);
    return;
  }

  rememberTurnAiMetrics(sessionKey, res);
  await processLlmResponse(res, modal, sessionKey, ctx, parsed, raw, payload, lang, requestId, turnId);
  if (shouldApplyTurnResult(sessionKey, turnId)) {
    await persistRuntime(sessionKey);
    refreshUiIfBound(modal, sessionKey);
  }
}

/**
 * @param {object} res
 * @param {HTMLElement} modal
 * @param {string} sessionKey
 * @param {object} ctx
 * @param {object} parsed
 * @param {string} raw
 * @param {object} payload
 * @param {'es'|'en'} lang
 * @param {string} requestId
 * @param {string} turnId
 */
async function processLlmResponse(res, modal, sessionKey, ctx, parsed, raw, payload, lang, requestId, turnId) {
  if (!shouldApplyTurnResult(sessionKey, turnId)) return;

  const rt = getRuntime(sessionKey);

  const visibleContent = getVisibleAssistantContent(res.content || '');
  if (visibleContent) {
    rt.messages.push({ role: 'assistant', content: visibleContent });
    await persistRuntime(sessionKey);
    refreshUiIfBound(modal, sessionKey);
  }

  if (!shouldApplyTurnResult(sessionKey, turnId)) return;

  const localCalls = res.localToolCalls || [];
  for (const { tc, name, args, toolResult } of executeLocalToolCalls(localCalls, {
    raw,
    parsed,
    lang
  })) {
    rt.messages.push({
      role: 'assistant',
      content: '',
      tool_calls: [tc]
    });
    rt.messages.push({
      role: 'tool',
      tool_call_id: tc.id,
      name,
      content: toolResult
    });

    rt.thinkingMode = 'tools';
    rt.thinkingStatus = t('apexLogViewer.logi.thinkingTools');
    rt.thinkingReason = formatToolActivityLabel(name, args, t);
    await persistRuntime(sessionKey);
    refreshUiIfBound(modal, sessionKey);

    if (!shouldApplyTurnResult(sessionKey, turnId)) return;

    const followUp = await bg({
      type: 'aiAdvisor:chat',
      requestId,
      sessionKey,
      messages: rt.messages,
    initialContext: buildLogContextForModal(modal, parsed, payload, sessionKey),
      orgId: payload.orgId || '',
      logId: payload.logId || '',
      lang,
      isNewChat: false,
      skipIterationReserve: true,
      ...buildChatMessageExtras()
    });
    if (Number.isFinite(Number(followUp?.iteration))) {
      rt.iteration = Math.max(rt.iteration, Math.floor(Number(followUp.iteration)));
    }
    bindSession(sessionKey);
    applyIterationState(modal, followUp);
    await persistRuntime(sessionKey);
    refreshUiIfBound(modal, sessionKey);

    if (!shouldApplyTurnResult(sessionKey, turnId)) return;
    if (isMaxIterationsResponse(modal, followUp)) return;

    if (!followUp?.ok) {
      if (followUp?.reason === 'CANCELLED' || !shouldApplyTurnResult(sessionKey, turnId)) return;
      if (hasTurnTimedOut(sessionKey)) return;
      if (followUp?.reason === 'LLM_TIMEOUT') {
        rt.turnTimedOut = true;
        clearTurnTimeout(sessionKey);
      }
      appendAssistantMessageForSession(
        mapErrorReason(followUp?.reason, followUp?.error),
        modal,
        sessionKey
      );
      finishTurnUi(sessionKey, turnId, modal);
      return;
    }
    rememberTurnAiMetrics(sessionKey, followUp);
    await processLlmResponse(followUp, modal, sessionKey, ctx, parsed, raw, payload, lang, requestId, turnId);
    if (!shouldApplyTurnResult(sessionKey, turnId)) return;
    if (!res.pendingOrgQuery) return;
  }

  if (res.pendingOrgQuery) {
    await runPendingOrgQueryFlow(
      modal,
      sessionKey,
      ctx,
      parsed,
      raw,
      payload,
      lang,
      requestId,
      res.pendingOrgQuery,
      turnId,
      getOrgFlowDeps()
    );
    return;
  }

  emitChatTurnSuccess(sessionKey, payload);
  finishTurnUi(sessionKey, turnId, modal);
}

/**
 * @param {object} [res]
 */
function inferBridgeFailureReason(res) {
  const err = String(res?.error || '');
  if (/noBackgroundResponse|Receiving end does not exist|Extension context invalidated/i.test(err)) {
    return 'LLM_NETWORK';
  }
  if (/timeout|timed out/i.test(err)) {
    return 'LLM_TIMEOUT';
  }
  return 'LLM_ERROR';
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
    LLM_PROXY_BLOCKED: 'apexLogViewer.logi.error.proxyBlocked',
    LLM_TIMEOUT: 'apexLogViewer.logi.error.timeout',
    LLM_NETWORK: 'apexLogViewer.logi.error.network',
    CANCELLED: 'apexLogViewer.logi.cancelled',
    LLM_ERROR: 'apexLogViewer.logi.error.llm'
  };
  const key = map[reason] || 'apexLogViewer.logi.error.generic';
  let base = t(key);
  if ((reason === 'TELEMETRY_REQUIRED' || reason === 'LLM_PROXY_BLOCKED') && typeof chrome !== 'undefined') {
    const settingsUrl = getLogiSettingsUrl();
    const linkLabel = t('apexLogViewer.logi.error.openSettings');
    base = `${base} [${linkLabel}](${settingsUrl})`;
  }
  if ((reason === 'LLM_ERROR' || reason === 'LLM_NETWORK') && error) {
    return `${base} (${error})`;
  }
  return base;
}

function getLogiSettingsUrl() {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL('popup/settings.html#settingsLogi');
    }
  } catch {
    /* ignore */
  }
  return 'popup/settings.html#settingsLogi';
}

/**
 * @param {HTMLElement} modal
 * @param {object | null | undefined} parsed
 * @param {object} payload
 * @param {string} sessionKey
 */
function buildLogContextForModal(modal, parsed, payload, sessionKey) {
  const base = buildInitialLogContext(parsed, {
    orgId: payload.orgId,
    logId: payload.logId,
    instanceUrl: payload.instanceUrl
  });
  const rt = getRuntime(sessionKey);
  const summary = typeof rt.resumeSummary === 'string' ? rt.resumeSummary.trim() : '';
  if (!summary || !rt.isNewChat) return base;
  const lang = getPromptLang(rt.messages);
  const header =
    lang === 'en' ? 'Prior Logi summary (user opened chat from resume):' : 'Resumen previo de Logi (el usuario abrió el chat desde el resumen):';
  return `${base}\n\n---\n${header}\n${summary}`;
}

/**
 * @param {HTMLElement} modal
 * @param {string} actionId
 */
async function runQuickAction(modal, actionId) {
  const lang = getPromptLang();
  const prompt = quickActionUserMessage(actionId, lang, customQuickActionPrompts);
  await enqueueUserMessage(prompt, modal, { quickActionId: actionId });
}

/**
 * @param {HTMLElement} modal
 */
function exportCurrentChat(modal) {
  const rt = getModalRuntime(modal);
  if (!rt?.messages?.length) return;
  const md = exportChatAsMarkdown(rt.messages);
  if (md && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(md);
  }
}
