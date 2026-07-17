import { truncateText } from '../../../shared/logi/apexLogAiContext.js';

export const THINKING_ROTATE_MS = 10_000;

/** @type {Record<'default' | 'tools' | 'org', string[]>} */
export const THINKING_MESSAGE_KEYS = {
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

/** @type {ReturnType<typeof setInterval> | null} */
let thinkingRotateTimer = null;
/** @type {string | null} */
let thinkingRotateSessionKey = null;
/** @type {'default' | 'tools' | 'org' | null} */
let thinkingRotateMode = null;
let thinkingRotateIndex = 0;

export function stopThinkingRotation() {
  if (thinkingRotateTimer) {
    clearInterval(thinkingRotateTimer);
    thinkingRotateTimer = null;
  }
  thinkingRotateSessionKey = null;
  thinkingRotateMode = null;
  thinkingRotateIndex = 0;
}

/**
 * @param {string} base
 * @param {string} [reason]
 */
export function formatThinkingLabel(base, reason) {
  const r = truncateText(String(reason || '').trim(), 72);
  if (!r) return base;
  return `${base} · ${r}`;
}

/**
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 * @param {(key: string, vars?: Record<string, unknown>) => string} t
 */
export function formatToolActivityLabel(toolName, args, t) {
  const name = String(toolName || '').trim();
  if (!name) return '';

  const reason = truncateText(String(args?.reason || '').trim(), 80);
  if (reason) return reason;

  const key = `apexLogViewer.logi.tool.${name}`;
  const vars = { ...args };
  const label = t(key, vars);
  if (label && label !== key) return truncateText(label, 80);

  // Never surface raw tool ids (org_query, fetch_log_lines, …) to the user.
  return truncateText(t('apexLogViewer.logi.thinkingTools'), 80);
}

/**
 * @typedef {object} LogiThinkingDeps
 * @property {(key: string, vars?: Record<string, unknown>) => string} t
 * @property {(sessionKey: string) => { processing?: boolean, cancelRequested?: boolean, thinkingMode?: string, thinkingReason?: string }} getRuntime
 * @property {(modal: HTMLElement) => string | null | undefined} getSessionKey
 * @property {(rt: object | null | undefined) => boolean} shouldShowThinking
 */

/**
 * @param {HTMLElement} modal
 * @param {LogiThinkingDeps} deps
 */
export function ensureThinkingRotation(modal, deps) {
  const sessionKey = deps.getSessionKey(modal);
  if (!sessionKey) return;
  const rt = deps.getRuntime(sessionKey);
  if (!deps.shouldShowThinking(rt)) {
    stopThinkingRotation();
    return;
  }

  const mode = /** @type {'default' | 'tools' | 'org'} */ (rt.thinkingMode || 'default');
  if (
    thinkingRotateTimer &&
    thinkingRotateSessionKey === sessionKey &&
    thinkingRotateMode === mode
  ) {
    const keys = THINKING_MESSAGE_KEYS[mode] || THINKING_MESSAGE_KEYS.default;
    const key = keys[thinkingRotateIndex % keys.length] || keys[0];
    const el = modal.querySelector('.logi-advisor-thinking-text');
    if (el) el.textContent = formatThinkingLabel(deps.t(key), rt.thinkingReason);
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
    const rtNow = deps.getRuntime(sessionKey);
    if (!deps.shouldShowThinking(rtNow)) {
      stopThinkingRotation();
      return;
    }
    const currentMode = /** @type {'default' | 'tools' | 'org'} */ (rtNow.thinkingMode || 'default');
    if (currentMode !== thinkingRotateMode) {
      ensureThinkingRotation(modal, deps);
      return;
    }
    const keys = THINKING_MESSAGE_KEYS[currentMode] || THINKING_MESSAGE_KEYS.default;
    const key = keys[thinkingRotateIndex % keys.length];
    const el = modal.querySelector('.logi-advisor-thinking-text');
    if (el) {
      el.textContent = formatThinkingLabel(deps.t(key), rtNow.thinkingReason);
    }
    thinkingRotateIndex += 1;
  };

  tick();
  thinkingRotateTimer = setInterval(tick, THINKING_ROTATE_MS);
}
