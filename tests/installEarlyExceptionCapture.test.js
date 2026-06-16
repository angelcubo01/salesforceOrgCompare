import { describe, expect, it } from 'vitest';
import {
  errorFromPageErrorEvent,
  isBenignPageErrorEvent,
  isBenignPageRejectionEvent
} from '../shared/installEarlyExceptionCapture.js';

describe('installEarlyExceptionCapture', () => {
  it('ignora ruido de ResizeObserver y workers Monaco', () => {
    expect(
      isBenignPageErrorEvent({
        message: 'ResizeObserver loop limit exceeded',
        filename: 'code/code.js'
      })
    ).toBe(true);
    expect(
      isBenignPageErrorEvent({
        message: 'fail',
        filename: 'chrome-extension://id/vendor/monaco-editor/min/vs/base/worker/workerMain.js'
      })
    ).toBe(true);
  });

  it('convierte SyntaxError de módulo sin event.error', () => {
    const err = errorFromPageErrorEvent({
      message: "Export 'advanceDiffIndex' is not defined in module",
      filename: 'chrome-extension://id/code/editor/diffUtils.js',
      lineno: 7,
      colno: 0
    });
    expect(err.name).toBe('SyntaxError');
    expect(err.message).toContain('advanceDiffIndex');
  });

  it('ignora rechazos benignos de Monaco', () => {
    const canceled = new Error('Canceled');
    canceled.name = 'Canceled';
    expect(isBenignPageRejectionEvent({ reason: canceled })).toBe(true);
    expect(
      isBenignPageRejectionEvent({
        reason: 'Error: workerMain.js failed'
      })
    ).toBe(true);
    expect(
      isBenignPageRejectionEvent({
        reason: 'Error: no diff result available'
      })
    ).toBe(true);
  });

  it('ignora errores benignos de diff Monaco', () => {
    expect(
      isBenignPageErrorEvent({
        message: 'no diff result available',
        filename: 'chrome-extension://id/vendor/monaco-editor/min/vs/editor/editor.main.js'
      })
    ).toBe(true);
  });
});
