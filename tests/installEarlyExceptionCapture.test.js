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
    expect(
      isBenignPageRejectionEvent({
        reason: 'Error: workerMain.js failed'
      })
    ).toBe(true);
  });
});
