/**
 * Captura window.error / unhandledrejection lo antes posible (primer import de cada página).
 * Los errores de carga/evaluación de módulos ES ocurren antes de init() y no llegaban a PostHog.
 */
import { reportExtensionException } from './extensionExceptionReport.js';
import { isPosthogApiConfigured } from './posthogConfigured.js';

/**
 * @param {ErrorEvent} event
 */
export function isBenignPageErrorEvent(event) {
  const message = String(event.message || '');
  if (message.includes('ResizeObserver loop')) return true;
  if (message.includes('no diff result available')) return true;

  const filename = String(event.filename || '');
  if (
    filename.includes('workerMain.js') ||
    filename.includes('vs/base/worker') ||
    filename.includes('vs/editor/editor.main') ||
    (filename.includes('monaco') && filename.includes('worker'))
  ) {
    return true;
  }

  return false;
}

/**
 * @param {PromiseRejectionEvent} event
 */
export function isBenignPageRejectionEvent(event) {
  const reason = event.reason?.toString?.() || String(event.reason || '');
  if (reason.includes('ResizeObserver loop')) return true;
  if (reason.includes('no diff result available')) return true;
  if (
    reason.includes('workerMain.js') ||
    reason.includes('vs/base/worker') ||
    reason.includes('vs/editor') ||
    (reason.includes('Monaco') && reason.includes('worker'))
  ) {
    return true;
  }
  return false;
}

/**
 * @param {ErrorEvent} event
 */
export function errorFromPageErrorEvent(event) {
  if (event.error instanceof Error) return event.error;

  const message = String(event.message || 'unknown').trim() || 'unknown';
  const err = new Error(message);
  if (/SyntaxError/i.test(message) || /\bis not defined in module\b/i.test(message)) {
    err.name = 'SyntaxError';
  } else if (/TypeError/i.test(message)) err.name = 'TypeError';
  else if (/ReferenceError/i.test(message)) err.name = 'ReferenceError';
  return err;
}

/**
 * Registra captura de errores en la página (idempotente).
 * Independiente del opt-out de telemetría de uso.
 */
export function installExtensionPageExceptionCapture() {
  if (typeof window === 'undefined' || window.__sfocPageExceptionHooked) return;
  if (!isPosthogApiConfigured()) return;
  window.__sfocPageExceptionHooked = true;

  const onError = (event) => {
    if (isBenignPageErrorEvent(event)) return;
    const err = errorFromPageErrorEvent(event);
    void reportExtensionException(err, {
      sfoc_source: 'extension',
      error_source: 'window.error',
      error_handled: 0,
      filename: String(event.filename || '').slice(0, 256),
      lineno: Number(event.lineno) || 0,
      colno: Number(event.colno) || 0
    });
  };

  const onRejection = (event) => {
    if (isBenignPageRejectionEvent(event)) return;
    const reason = event.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason || 'unhandled rejection'));
    void reportExtensionException(err, {
      sfoc_source: 'extension',
      error_source: 'unhandledrejection',
      error_handled: 0
    });
  };

  window.__sfocOnErrorHandler = onError;
  window.__sfocOnRejectionHandler = onRejection;
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);
}

installExtensionPageExceptionCapture();
