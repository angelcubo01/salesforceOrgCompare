/**
 * Clasificación central de errores para telemetría PostHog.
 * benign → descartar | operational → analytics | bug → $exception
 */

/** @typedef {'benign' | 'operational' | 'bug'} ErrorTelemetryCategory */

/** @param {unknown} error */
export function isMonacoCanceledError(error) {
  if (!error) return false;
  if (error instanceof Error) {
    return error.name === 'Canceled' || error.message === 'Canceled';
  }
  const text = String(error);
  return text === 'Canceled' || text.includes('Canceled: Canceled');
}

/** @param {unknown} error */
export function isMonacoDisposedError(error) {
  if (!error) return false;
  const text = error instanceof Error ? `${error.name}\n${error.message}` : String(error);
  return (
    text.includes('InstantiationService has been disposed') ||
    text.includes('TextModel got disposed') ||
    text.includes('DisposableStore has been disposed')
  );
}

/** @type {ReadonlySet<string>} */
export const OPERATIONAL_REASON_CODES = new Set([
  'NO_SID',
  'UNTRUSTED_SENDER',
  'NOT_FOUND',
  'cancelled',
  'INVALID_PAYLOAD',
  'UNKNOWN_MESSAGE',
  'FEATURE_CONTROL_BLOCKED',
  'NOT_FOUND',
  'MISSING_LOG_ID',
  'ORG_NOT_SAVED'
]);

const MONACO_PATH_MARKERS = [
  'workerMain.js',
  'vs/base/worker',
  'vs/editor/editor.main',
  'monaco-editor/min/vs/'
];

const BENIGN_MESSAGE_MARKERS = [
  'ResizeObserver loop',
  'no diff result available',
  'Illegal value for lineNumber',
  'InstantiationService has been disposed',
  'DisposableStore has been disposed',
  'TextModel got disposed before DiffEditorWidget',
  'Receiving end does not exist',
  'Extension context invalidated',
  'The message port closed before a response was received'
];

const OPERATIONAL_MESSAGE_MARKERS = [
  'Test already enqueued',
  'Session expired',
  'Session expired or invalid',
  'No session',
  'Authenticate and retry',
  'Request failed. Please retry',
  'package.xml vacío'
];

const SFOC_STACK_MARKERS = ['/code/', '/shared/', '/background/', '/popup/'];

/**
 * @param {unknown} error
 * @returns {Error}
 */
export function toError(error) {
  if (error instanceof Error) return error;
  return new Error(String(error ?? 'unknown'));
}

/**
 * @param {unknown} error
 * @param {Record<string, unknown>} [context]
 */
function errorText(error, context = {}) {
  const err = toError(error);
  const parts = [err.name, err.message, String(context.message || '')];
  if (typeof err.stack === 'string') parts.push(err.stack);
  return parts.join('\n');
}

/**
 * @param {string} text
 * @param {Record<string, unknown>} [context]
 */
export function isBenignErrorText(text, context = {}) {
  const hay = String(text || '');
  for (const m of BENIGN_MESSAGE_MARKERS) {
    if (hay.includes(m)) return true;
  }

  if (hay.includes('Canceled') || /\bCancellationError\b/.test(hay)) return true;
  if (/\bAbortError\b/.test(hay) || hay.includes('The user aborted a request')) return true;

  const filename = String(context.filename || '');
  if (filename) {
    for (const m of MONACO_PATH_MARKERS) {
      if (filename.includes(m)) return true;
    }
    if (filename.includes('monaco') && filename.includes('worker')) return true;
  }

  for (const m of MONACO_PATH_MARKERS) {
    if (hay.includes(m)) return true;
  }

  return false;
}

/**
 * @param {unknown} error
 * @param {Record<string, unknown>} [context]
 */
export function isOperationalError(error, context = {}) {
  const reason = String(context.reason || context.sfoc_reason_code || '').trim();
  if (reason && OPERATIONAL_REASON_CODES.has(reason)) return true;

  if (context.ok === false || context.ok === 0) {
    if (reason) return true;
    if (context.operational === true || context.operational === 1) return true;
  }

  const hay = errorText(error, context);
  for (const m of OPERATIONAL_MESSAGE_MARKERS) {
    if (hay.includes(m)) return true;
  }

  return false;
}

/**
 * @param {unknown} error
 * @param {Record<string, unknown>} [context]
 */
function hasSfocAppStack(error) {
  const err = toError(error);
  const stack = String(err.stack || '');
  if (!stack) return false;
  return SFOC_STACK_MARKERS.some((m) => stack.includes(m));
}

/**
 * @param {unknown} error
 * @param {Record<string, unknown>} [context]
 * @returns {ErrorTelemetryCategory}
 */
export function classifyError(error, context = {}) {
  if (context.force_bug) return 'bug';
  const hay = errorText(error, context);
  if (isBenignErrorText(hay, context)) return 'benign';
  if (isOperationalError(error, context)) return 'operational';

  const err = toError(error);
  const handled = context.error_handled === 1 || context.error_handled === true;

  if (handled && !hasSfocAppStack(err)) {
    const msg = String(err.message || '').trim();
    if (msg && !hay.includes('chrome-extension://')) return 'operational';
  }

  return 'bug';
}

/**
 * @param {unknown} error
 * @param {Record<string, unknown>} [context]
 */
export function shouldReportAsBug(error, context = {}) {
  return classifyError(error, context) === 'bug';
}

/**
 * @param {unknown} error
 * @param {Record<string, unknown>} [context]
 */
export function shouldDropError(error, context = {}) {
  return classifyError(error, context) === 'benign';
}

/**
 * @param {ErrorEvent} event
 */
export function isBenignPageErrorEvent(event) {
  const message = String(event.message || '');
  const filename = String(event.filename || '');
  return isBenignErrorText(`${message}\n${filename}`, { filename });
}

/**
 * @param {PromiseRejectionEvent} event
 */
export function isBenignPageRejectionEvent(event) {
  const reason = event.reason;
  if (reason instanceof Error) {
    if (reason.name === 'Canceled' || reason.name === 'AbortError') return true;
    return isBenignErrorText(errorText(reason), {});
  }
  const text = reason?.toString?.() || String(reason || '');
  return isBenignErrorText(text, {});
}

/**
 * Propiedades extra para $exception de bugs reales.
 * @param {Record<string, unknown>} context
 */
export function bugExceptionContext(context = {}) {
  /** @type {Record<string, string | number | boolean>} */
  const out = { error_category: 'bug' };
  const reason = String(context.reason || context.sfoc_reason_code || '').trim();
  if (reason) out.sfoc_reason_code = reason.slice(0, 64);
  return out;
}
