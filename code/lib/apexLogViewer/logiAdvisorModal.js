import { escapeHtml } from '../../../shared/htmlEscape.js';
import { renderLogiMarkdown } from '../../../shared/logiMarkdown.js';
import { getCurrentLang, t } from '../../../shared/i18n.js';
import { bg } from '../../core/bridge.js';
import { bootstrapLogiAdvisor, getCachedLogiAdvisorConfig, LOGI_ADVISOR_READY_EVENT } from '../../../shared/posthogLogiAdvisorFlag.js';
import { isLogiAdvisorOperational } from '../../../shared/apexLogAiAdvisorConfig.js';
import { LOGI_ADVISOR_STORAGE_KEY } from '../../../shared/logiAdvisorCache.js';
import {
  buildLogiSessionKey,
  LOGI_SESSION_STORAGE_KEY,
  readLogiSession,
  writeLogiSession
} from '../../../shared/logiAdvisorSession.js';
import {
  buildInitialLogContext,
  enrichLocalToolResult,
  fetchLogLines,
  fetchParsedSection,
  formatOrgQueryToolResult,
  quickActionUserMessage
} from '../../../shared/apexLogAiContext.js';

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
const THINKING_ROTATE_MS = 10_000;

/** @type {Record<'default' | 'tools' | 'org', string[]>} */
const THINKING_MESSAGE_KEYS = {
  default: [
    'apexLogViewer.logi.thinking',
    'apexLogViewer.logi.thinkingWait1',
    'apexLogViewer.logi.thinkingWait2',
    'apexLogViewer.logi.thinkingWait3',
    'apexLogViewer.logi.thinkingWait4'
  ],
  tools: [
    'apexLogViewer.logi.thinkingTools',
    'apexLogViewer.logi.thinkingToolsWait1',
    'apexLogViewer.logi.thinkingToolsWait2',
    'apexLogViewer.logi.thinkingToolsWait3'
  ],
  org: [
    'apexLogViewer.logi.thinkingOrgQuery',
    'apexLogViewer.logi.thinkingOrgWait1',
    'apexLogViewer.logi.thinkingOrgWait2',
    'apexLogViewer.logi.thinkingOrgWait3'
  ]
};

const QUICK_ACTION_META = {
  debug_errors: {
    tone: 'rose',
    icon: `<svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4.978.855a.75.75 0 0 1 .696.662l.063 1.093c.178.024.355.058.528.096l1.06-1.06a.75.75 0 1 1 1.06 1.06l-1.062 1.062c.226.218.42.47.572.746l1.185-.296a.75.75 0 0 1 .932.932l-.296 1.185a3.5 3.5 0 0 1 .746.572l1.06-1.06a.75.75 0 1 1 1.061 1.06l-1.062 1.061c.038.173.072.35.096.528l1.093.063a.75.75 0 0 1-.662.696l-1.093.063a3.5 3.5 0 0 1-.096.528l1.06 1.061a.75.75 0 0 1-1.06 1.06l-1.062-1.06a3.5 3.5 0 0 1-.746.572l.296 1.185a.75.75 0 0 1-.932.932l-1.185-.296a3.5 3.5 0 0 1-.572.746l1.061 1.06a.75.75 0 1 1-1.06 1.06l-1.061-1.062a3.5 3.5 0 0 1-.528.096l-.063 1.093a.75.75 0 0 1-1.396 0l-.063-1.093a3.5 3.5 0 0 1-.528-.096l-1.061 1.062a.75.75 0 1 1-1.06-1.06l1.062-1.061a3.5 3.5 0 0 1-.746-.572l-1.185.296a.75.75 0 0 1-.932-.932l.296-1.185a3.5 3.5 0 0 1-.572-.746L2.28 9.28a.75.75 0 0 1 1.06-1.06l1.061 1.062c.173-.038.35-.072.528-.096L4.775 8.09a.75.75 0 0 1 .696-.662ZM9 2.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm3 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-3 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm3 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg>`
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
  }
};

/** @typedef {{ id: string, text: string, quickActionId?: string }} QueuedMessage */

/** @typedef {{ role: string, content?: string, quickActionId?: string, tool_calls?: object[], tool_call_id?: string, name?: string }} ChatMessage */

let modalEl = null;
let btnEl = null;
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

/**
 * @typedef {object} SessionRuntime
 * @property {ChatMessage[]} messages
 * @property {QueuedMessage[]} messageQueue
 * @property {number} iteration
 * @property {boolean} isNewChat
 * @property {boolean} processing
 * @property {string} thinkingStatus
 * @property {'default' | 'tools' | 'org'} thinkingMode
 * @property {string | null} activeRequestId
 * @property {string | null} activeTurnId
 * @property {boolean} cancelRequested
 * @property {string | null} usageLimitReason
 * @property {object | null} lastCtx
 */

/** @type {Map<string, SessionRuntime>} */
const sessionRuntimes = new Map();
/** @type {string | null} */
let boundSessionKey = null;
/** @type {ReturnType<typeof setInterval> | null} */
let sessionPollTimer = null;
/** @type {ReturnType<typeof setInterval> | null} */
let thinkingRotateTimer = null;
/** @type {string | null} */
let thinkingRotateSessionKey = null;
/** @type {'default' | 'tools' | 'org' | null} */
let thinkingRotateMode = null;
let thinkingRotateIndex = 0;
/** @type {object | null} */
let currentAdvisorPayload = null;

function createRuntime() {
  return {
    messages: [],
    messageQueue: [],
    iteration: 0,
    isNewChat: true,
    processing: false,
    thinkingStatus: '',
    thinkingMode: 'default',
    activeRequestId: null,
    activeTurnId: null,
    cancelRequested: false,
    usageLimitReason: null,
    lastCtx: null
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
 * @param {unknown} item
 * @returns {QueuedMessage | null}
 */
function normalizeQueueItem(item) {
  if (typeof item === 'string') {
    const text = item.trim();
    return text ? { id: createRequestId(), text } : null;
  }
  if (!item || typeof item !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (item);
  const text = String(o.text || '').trim();
  if (!text) return null;
  /** @type {QueuedMessage} */
  const out = { id: String(o.id || createRequestId()), text };
  if (o.quickActionId && typeof o.quickActionId === 'string') {
    out.quickActionId = o.quickActionId;
  }
  return out;
}

/**
 * @param {SessionRuntime} rt
 * @returns {QueuedMessage[]}
 */
function getQueueItems(rt) {
  return (rt.messageQueue || [])
    .map((item) => normalizeQueueItem(item))
    .filter(Boolean);
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

function stopThinkingRotation() {
  if (thinkingRotateTimer) {
    clearInterval(thinkingRotateTimer);
    thinkingRotateTimer = null;
  }
  thinkingRotateSessionKey = null;
  thinkingRotateMode = null;
  thinkingRotateIndex = 0;
}

/**
 * @param {HTMLElement} modal
 */
function ensureThinkingRotation(modal) {
  const sessionKey = modal._sessionKey || boundSessionKey;
  if (!sessionKey) return;
  const rt = getRuntime(sessionKey);
  if (!shouldShowThinking(rt)) {
    stopThinkingRotation();
    return;
  }

  const mode = rt.thinkingMode || 'default';
  if (
    thinkingRotateTimer &&
    thinkingRotateSessionKey === sessionKey &&
    thinkingRotateMode === mode
  ) {
    const keys = THINKING_MESSAGE_KEYS[mode] || THINKING_MESSAGE_KEYS.default;
    const key = keys[thinkingRotateIndex % keys.length] || keys[0];
    const el = modal.querySelector('.logi-advisor-thinking-text');
    if (el) el.textContent = t(key);
    return;
  }

  stopThinkingRotation();
  thinkingRotateSessionKey = sessionKey;
  thinkingRotateMode = mode;
  thinkingRotateIndex = 0;

  const tick = () => {
    if (!modal.isConnected) {
      stopThinkingRotation();
      return;
    }
    const rtNow = getRuntime(sessionKey);
    if (!shouldShowThinking(rtNow)) {
      stopThinkingRotation();
      return;
    }
    const currentMode = rtNow.thinkingMode || 'default';
    if (currentMode !== thinkingRotateMode) {
      ensureThinkingRotation(modal);
      return;
    }
    const keys = THINKING_MESSAGE_KEYS[currentMode] || THINKING_MESSAGE_KEYS.default;
    const key = keys[thinkingRotateIndex % keys.length];
    const el = modal.querySelector('.logi-advisor-thinking-text');
    if (el) {
      el.textContent = t(key);
    }
    thinkingRotateIndex += 1;
  };

  tick();
  thinkingRotateTimer = setInterval(tick, THINKING_ROTATE_MS);
}

/**
 * @param {HTMLElement} modal
 */
function renderQueuePanel(modal) {
  const wrap = modal.querySelector('#logiAdvisorQueue');
  const summaryEl = modal.querySelector('#logiAdvisorQueueSummary');
  const listEl = modal.querySelector('#logiAdvisorQueueList');
  if (!wrap || !listEl) return;

  const rt = getModalRuntime(modal);
  const items = getQueueItems(rt || /** @type {SessionRuntime} */ ({ messageQueue }));

  if (!items.length) {
    wrap.hidden = true;
    if (summaryEl) summaryEl.textContent = '';
    listEl.innerHTML = '';
    return;
  }

  wrap.hidden = false;
  if (summaryEl) {
    summaryEl.textContent = t('apexLogViewer.logi.queue', { count: items.length });
  }

  listEl.innerHTML = items
    .map((item) => {
      const preview = item.text.length > 96 ? `${item.text.slice(0, 96)}…` : item.text;
      const editLabel = t('apexLogViewer.logi.queueEdit');
      const removeLabel = t('apexLogViewer.logi.queueRemove');
      return `<li class="logi-advisor-queue-item">
        <span class="logi-advisor-queue-item-text" title="${escapeHtml(item.text)}">${escapeHtml(preview)}</span>
        <span class="logi-advisor-queue-item-actions">
          <button type="button" class="logi-advisor-queue-edit" data-queue-id="${escapeHtml(item.id)}" title="${escapeHtml(editLabel)}">${escapeHtml(editLabel)}</button>
          <button type="button" class="logi-advisor-queue-remove" data-queue-id="${escapeHtml(item.id)}" title="${escapeHtml(removeLabel)}">${escapeHtml(removeLabel)}</button>
        </span>
      </li>`;
    })
    .join('');
}

/**
 * @param {HTMLElement} modal
 * @param {string} itemId
 */
function removeQueueItem(modal, itemId) {
  const sessionKey = modal._sessionKey || boundSessionKey;
  if (!sessionKey) return;
  const rt = getRuntime(sessionKey);
  const idx = rt.messageQueue.findIndex((q) => normalizeQueueItem(q)?.id === itemId);
  if (idx < 0) return;
  rt.messageQueue.splice(idx, 1);
  bindSession(sessionKey);
  renderQueuePanel(modal);
  syncBusyUi(modal);
  void persistRuntime(sessionKey);
}

/**
 * @param {HTMLElement} modal
 * @param {string} itemId
 */
function editQueueItem(modal, itemId) {
  const sessionKey = modal._sessionKey || boundSessionKey;
  if (!sessionKey) return;
  const rt = getRuntime(sessionKey);
  const idx = rt.messageQueue.findIndex((q) => normalizeQueueItem(q)?.id === itemId);
  if (idx < 0) return;
  const current = normalizeQueueItem(rt.messageQueue[idx]);
  if (!current) return;

  const edited = window.prompt(t('apexLogViewer.logi.queueEditPrompt'), current.text);
  if (edited === null) return;
  const trimmed = edited.trim();
  if (!trimmed) {
    removeQueueItem(modal, itemId);
    return;
  }
  current.text = trimmed;
  rt.messageQueue[idx] = current;
  bindSession(sessionKey);
  renderQueuePanel(modal);
  void persistRuntime(sessionKey);
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
 * @param {import('../../../shared/logiAdvisorSession.js').LogiAdvisorSession | null | undefined} saved
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
export async function mountLogiAdvisor(opts) {
  const { getParsed, getRawContent, payload } = opts;
  currentAdvisorPayload = payload || null;
  btnEl = document.getElementById('logiAdvisorBtn');
  if (!btnEl) return;

  await bootstrapLogiAdvisor({ force: true });
  await refreshConfig();

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
    });
  }

  btnEl.addEventListener('click', () => {
    void openLogiModal({
      getParsed,
      getRawContent,
      payload: payload || {}
    });
  });
}

async function refreshConfig() {
  const fromPage = getCachedLogiAdvisorConfig();
  const res = await bg({ type: 'aiAdvisor:getConfig' });
  advisorConfig = res?.config || null;

  const pageShow =
    fromPage.enabled && fromPage.showButton && isLogiAdvisorOperational(fromPage) && !res?.telemetryRequired;
  const swShow =
    advisorConfig?.enabled && advisorConfig?.showButton && advisorConfig?.operational && !res?.telemetryRequired;

  if (!btnEl) return;
  btnEl.hidden = !(pageShow || swShow);
  btnEl.textContent = t('apexLogViewer.logi.button');
}

/**
 * @param {Record<string, import('../../../shared/logiAdvisorSession.js').LogiAdvisorSession> | undefined} store
 */
async function onLogiSessionsStorageChanged(store) {
  if (!store || !currentAdvisorPayload || !modalEl) return;
  const sessionKey = buildLogiSessionKey(currentAdvisorPayload);
  const saved = store[sessionKey];
  if (!saved || saved.pending) return;

  const rt = getRuntime(sessionKey);
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
      <header class="logi-advisor-header">
        <span class="logi-advisor-avatar">${LOGI_AVATAR_SVG}</span>
        <div class="logi-advisor-header-text">
          <h2 id="logiAdvisorTitle"></h2>
          <span class="logi-advisor-beta" id="logiAdvisorBeta"></span>
        </div>
        <button type="button" class="logi-advisor-close" data-close="1" aria-label="Close">×</button>
      </header>
      <div class="logi-advisor-quick-section" id="logiAdvisorQuickSection">
        <button type="button" class="logi-advisor-quick-toggle" id="logiAdvisorQuickToggle" aria-expanded="true">
          <span class="logi-advisor-quick-toggle-label" id="logiAdvisorQuickToggleLabel"></span>
          <span class="logi-advisor-quick-toggle-chevron" aria-hidden="true"></span>
        </button>
        <div class="logi-advisor-quick" id="logiAdvisorQuick"></div>
      </div>
      <div class="logi-advisor-messages ph-no-capture" id="logiAdvisorMessages"></div>
      <div class="logi-advisor-privacy" id="logiAdvisorPrivacy"></div>
      <footer class="logi-advisor-footer">
        <div class="logi-advisor-input-row">
          <textarea id="logiAdvisorInput" class="logi-advisor-input" rows="2"></textarea>
          <button type="button" id="logiAdvisorSend" class="logi-advisor-send"></button>
          <button type="button" id="logiAdvisorStop" class="logi-advisor-stop" hidden></button>
        </div>
        <div class="logi-advisor-queue-wrap" id="logiAdvisorQueue" hidden>
          <span class="logi-advisor-queue-summary" id="logiAdvisorQueueSummary"></span>
          <ul class="logi-advisor-queue-list" id="logiAdvisorQueueList"></ul>
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

  modalEl.querySelector('#logiAdvisorQuickToggle')?.addEventListener('click', () => {
    setQuickActionsCollapsed(modalEl, !readQuickActionsCollapsed());
  });

  modalEl.querySelector('#logiAdvisorSend')?.addEventListener('click', () => {
    void onSendFromInput();
  });
  modalEl.querySelector('#logiAdvisorStop')?.addEventListener('click', () => {
    void cancelActiveGeneration(modalEl);
  });
  modalEl.querySelector('#logiAdvisorQueue')?.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.dataset.queueId;
    if (!id) return;
    if (target.classList.contains('logi-advisor-queue-remove')) {
      removeQueueItem(modalEl, id);
    } else if (target.classList.contains('logi-advisor-queue-edit')) {
      editQueueItem(modalEl, id);
    }
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
  if (!modalEl) return;
  if (boundSessionKey) {
    void persistRuntime(boundSessionKey);
  }
  modalEl.hidden = true;
}

/**
 * @param {HTMLElement} modal
 * @param {string} [sessionKey]
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
  const modal = ensureModal();
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
    if (!usageRes?.ok && isUsageLimitReason(usageRes.reason)) {
      handleUsageLimit(modal, usageRes);
    }
  }

  const titleEl = modal.querySelector('#logiAdvisorTitle');
  const betaEl = modal.querySelector('#logiAdvisorBeta');
  const privacyEl = modal.querySelector('#logiAdvisorPrivacy');
  const sendBtn = modal.querySelector('#logiAdvisorSend');
  const stopBtn = modal.querySelector('#logiAdvisorStop');
  const inputEl = modal.querySelector('#logiAdvisorInput');
  const closeBtn = modal.querySelector('.logi-advisor-close');

  if (titleEl) titleEl.textContent = t('apexLogViewer.logi.title');
  if (betaEl) {
    betaEl.textContent = advisorConfig?.beta ? t('apexLogViewer.logi.beta') : '';
    betaEl.hidden = !advisorConfig?.beta;
  }
  if (privacyEl) privacyEl.textContent = t('apexLogViewer.logi.privacyNotice');
  if (sendBtn) sendBtn.textContent = t('apexLogViewer.logi.send');
  if (stopBtn) {
    stopBtn.textContent = t('apexLogViewer.logi.stop');
    stopBtn.setAttribute('aria-label', t('apexLogViewer.logi.stop'));
  }
  if (inputEl) {
    inputEl.placeholder = t('apexLogViewer.logi.inputPlaceholder');
    inputEl.value = '';
  }
  if (closeBtn) closeBtn.setAttribute('aria-label', t('apexLogViewer.logi.close'));

  renderQuickActions(modal);
  applyQuickActionsCollapsed(modal, readQuickActionsCollapsed());
  syncBusyUi(modal);
  renderMessages(modal);
  updateIterationsLabel(modal);

  if (!messages.length) {
    appendAssistantMessage(t('apexLogViewer.logi.greeting'), modal, { skipPersist: true });
    isNewChat = true;
    rt.isNewChat = true;
    await persistRuntime(sessionKey);
  }

  modal.hidden = false;
  inputEl?.focus();
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

  section.classList.toggle('logi-advisor-quick-section--collapsed', collapsed);
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  toggle.setAttribute(
    'aria-label',
    collapsed ? t('apexLogViewer.logi.quickActionsExpand') : t('apexLogViewer.logi.quickActionsCollapse')
  );
  if (label) label.textContent = t('apexLogViewer.logi.quickActions');
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
  if (!mount || !section) return;
  const actions = advisorConfig?.quickActions || [];
  if (!actions.length) {
    section.hidden = true;
    mount.innerHTML = '';
    return;
  }
  section.hidden = false;
  const labels = getQuickActionLabels();
  mount.innerHTML = actions
    .map((id) => {
      const meta = QUICK_ACTION_META[id] || { tone: 'sky', icon: LOGI_AVATAR_SVG };
      const label = labels[id] || id;
      return `<button type="button" class="logi-advisor-chip logi-advisor-chip--${meta.tone}" data-action="${escapeHtml(id)}">
        <span class="logi-advisor-chip-icon">${meta.icon}</span>
        <span class="logi-advisor-chip-label">${escapeHtml(label)}</span>
      </button>`;
    })
    .join('');
  mount.querySelectorAll('.logi-advisor-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const actionId = btn.getAttribute('data-action');
      if (!actionId) return;
      const lang = getCurrentLang() === 'en' ? 'en' : 'es';
      void enqueueUserMessage(quickActionUserMessage(actionId, lang), modal, { quickActionId: actionId });
    });
  });
}

function getQuickActionLabels() {
  return {
    debug_errors: t('apexLogViewer.logi.action.debugErrors'),
    explain_flow: t('apexLogViewer.logi.action.explainFlow'),
    soql_dml: t('apexLogViewer.logi.action.soqlDml'),
    test_failure: t('apexLogViewer.logi.action.testFailure'),
    limits: t('apexLogViewer.logi.action.limits'),
    suggest_fix: t('apexLogViewer.logi.action.suggestFix')
  };
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

  mount.innerHTML = sessionMessages
    .map((m) => {
      if (m.role === 'user') {
        return renderUserMessageHtml(m);
      }
      if (m.role === 'assistant') {
        const bodyHtml = formatAssistantHtml(m.content || '');
        if (!isVisibleAssistantContent(m.content || '') || !bodyHtml.trim()) return '';
        return `<div class="logi-advisor-msg logi-advisor-msg--assistant">
          <span class="logi-advisor-msg-avatar">${LOGI_AVATAR_SVG}</span>
          <div class="logi-advisor-msg-wrap">
            <span class="logi-advisor-msg-name">Logi</span>
            <div class="logi-advisor-msg-body logi-advisor-msg-body--md">${bodyHtml}</div>
          </div>
        </div>`;
      }
      if (m.role === 'system') {
        return `<div class="logi-advisor-msg logi-advisor-msg--system">${escapeHtml(m.content || '')}</div>`;
      }
      return '';
    })
    .join('');
  if (showThinking) {
    mount.insertAdjacentHTML('beforeend', THINKING_BUBBLE_HTML);
    ensureThinkingRotation(modal);
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

  renderQueuePanel(modal);
}

/**
 * @param {string} text
 */
function formatAssistantHtml(text) {
  return renderLogiMarkdown(text);
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
  const html = formatAssistantHtml(raw);
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
 * @param {{ quickActionId?: string }} [opts]
 */
async function enqueueUserMessage(text, modal, opts = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return;

  if (isChatBlocked()) {
    if (usageLimitReason) {
      handleUsageLimit(modal, { reason: usageLimitReason });
    } else {
      handleMaxIterations(modal);
    }
    return;
  }

  /** @type {QueuedMessage} */
  const queueItem = { id: createRequestId(), text: trimmed };
  if (opts.quickActionId) {
    queueItem.quickActionId = opts.quickActionId;
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

  const next = normalizeQueueItem(rt.messageQueue[0]);
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
  rt.messageQueue.shift();

  /** @type {ChatMessage} */
  const userMessage = { role: 'user', content: next.text };
  if (next.quickActionId) {
    userMessage.quickActionId = next.quickActionId;
  }
  rt.messages.push(userMessage);

  bindSession(sessionKey);
  await persistRuntime(sessionKey);
  syncBusyUi(modal);
  renderMessages(modal);

  const requestId = rt.activeRequestId;

  try {
    await runChatTurn(modal, sessionKey, requestId, turnId);
  } finally {
    if (rt.activeTurnId === turnId) {
      stopThinkingRotation();
      rt.processing = false;
      rt.thinkingStatus = '';
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

/**
 * @param {HTMLElement} modal
 */
function updateIterationsLabel(modal) {
  const el = modal.querySelector('#logiAdvisorIterations');
  const max = getMaxIterations();
  if (el) {
    el.textContent = t('apexLogViewer.logi.iterations', {
      current: Math.min(iteration, max),
      max
    });
  }
}

async function onSendFromInput() {
  const modal = modalEl;
  if (!modal) return;
  const input = modal.querySelector('#logiAdvisorInput');
  const text = input?.value?.trim();
  if (!text) return;
  if (input) input.value = '';
  await enqueueUserMessage(text, modal);
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
  const lang = getCurrentLang() === 'en' ? 'en' : 'es';

  const initialContext = buildInitialLogContext(parsed, {
    orgId: payload.orgId,
    logId: payload.logId,
    instanceUrl: payload.instanceUrl
  });

  const res = await bg({
    type: 'aiAdvisor:chat',
    requestId,
    sessionKey,
    messages: rt.messages.filter(
      (m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool'
    ),
    initialContext,
    orgId: payload.orgId || '',
    logId: payload.logId || '',
    lang,
    isNewChat: rt.isNewChat
  });
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
    if (res?.reason === 'CANCELLED') return;
    appendAssistantMessageForSession(
      mapErrorReason(res?.reason || inferBridgeFailureReason(res), res?.error),
      modal,
      sessionKey
    );
    finishTurnUi(sessionKey, turnId, modal);
    return;
  }

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
      toolResult = JSON.stringify(enrichLocalToolResult(name, fetched, lang));
    } else if (name === 'fetch_parsed_section') {
      toolResult = JSON.stringify(
        enrichLocalToolResult(name, fetchParsedSection(parsed, args.section), lang)
      );
    } else {
      toolResult = JSON.stringify(
        enrichLocalToolResult(name, { error: 'unknown_tool', retryable: false }, lang)
      );
    }

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
    await persistRuntime(sessionKey);
    refreshUiIfBound(modal, sessionKey);

    if (!shouldApplyTurnResult(sessionKey, turnId)) return;

    const followUp = await bg({
      type: 'aiAdvisor:chat',
      requestId,
      sessionKey,
      messages: rt.messages,
      initialContext: buildInitialLogContext(parsed, {
        orgId: payload.orgId,
        logId: payload.logId,
        instanceUrl: payload.instanceUrl
      }),
      orgId: payload.orgId || '',
      logId: payload.logId || '',
      lang,
      isNewChat: false,
      skipIterationReserve: true
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
      appendAssistantMessageForSession(
        mapErrorReason(followUp?.reason, followUp?.error),
        modal,
        sessionKey
      );
      finishTurnUi(sessionKey, turnId, modal);
      return;
    }
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
      turnId
    );
    return;
  }

  finishTurnUi(sessionKey, turnId, modal);
}

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
 */
async function runPendingOrgQueryFlow(
  modal,
  sessionKey,
  ctx,
  parsed,
  raw,
  payload,
  lang,
  requestId,
  pending,
  turnId
) {
  if (!shouldApplyTurnResult(sessionKey, turnId)) return;

  const rt = getRuntime(sessionKey);

  if (!payload.orgId) {
    appendAssistantMessageForSession(t('apexLogViewer.logi.queryNoOrg'), modal, sessionKey);
    finishTurnUi(sessionKey, turnId, modal);
    return;
  }

  const approved = await showOrgQueryApproval(pending, payload.orgId);
  if (!shouldApplyTurnResult(sessionKey, turnId)) return;

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
  } else {
    const queryRes = await bg({
      type: 'aiAdvisor:runQuery',
      orgId: payload.orgId,
      variant: pending.variant,
      queryText: pending.queryText
    });
    toolContent = JSON.stringify(formatOrgQueryToolResult(queryRes, lang));
  }

  rt.messages.push({
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: pending.toolCallId,
        type: 'function',
        function: {
          name: 'org_query',
          arguments: JSON.stringify({
            variant: pending.variant,
            query_text: pending.queryText
          })
        }
      }
    ]
  });
  rt.messages.push({
    role: 'tool',
    tool_call_id: pending.toolCallId,
    name: 'org_query',
    content: toolContent
  });

  rt.thinkingMode = 'org';
  rt.thinkingStatus = t('apexLogViewer.logi.thinkingOrgQuery');
  await persistRuntime(sessionKey);
  refreshUiIfBound(modal, sessionKey);

  if (!shouldApplyTurnResult(sessionKey, turnId)) return;

  const followUp = await bg({
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
    skipIterationReserve: true
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
    appendAssistantMessageForSession(
      mapErrorReason(followUp?.reason, followUp?.error),
      modal,
      sessionKey
    );
    finishTurnUi(sessionKey, turnId, modal);
    return;
  }
  await processLlmResponse(followUp, modal, sessionKey, ctx, parsed, raw, payload, lang, requestId, turnId);
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
  const base = t(key);
  if ((reason === 'LLM_ERROR' || reason === 'LLM_NETWORK') && error) {
    return `${base} (${error})`;
  }
  return base;
}
