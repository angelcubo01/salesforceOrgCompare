import { describe, expect, it } from 'vitest';
import {
  classifyError,
  isBenignErrorText,
  isBenignPageErrorEvent,
  isBenignPageRejectionEvent,
  isMonacoCanceledError,
  isMonacoDisposedError,
  isOperationalError,
  isSalesforceOrNetworkOperationalText,
  shouldReportAsBug
} from '../shared/errorTelemetryPolicy.js';

describe('errorTelemetryPolicy', () => {
  it('clasifica ruido Monaco como benign', () => {
    expect(classifyError(new Error('Canceled'))).toBe('benign');
    expect(classifyError(new Error('no diff result available'))).toBe('benign');
    expect(classifyError(new Error('Illegal value for lineNumber'))).toBe('benign');
    expect(
      classifyError(new Error('fail'), {
        filename: 'chrome-extension://id/vendor/monaco-editor/min/vs/editor/editor.main.js'
      })
    ).toBe('benign');
  });

  it('isMonacoCanceledError detecta rechazos de cancelación de Monaco', () => {
    const err = new Error('Canceled');
    err.name = 'Canceled';
    expect(isMonacoCanceledError(err)).toBe(true);
    expect(isMonacoCanceledError('Canceled: Canceled')).toBe(true);
    expect(isMonacoCanceledError(new Error('unexpected'))).toBe(false);
  });

  it('isMonacoDisposedError detecta avisos de ciclo de vida de Monaco', () => {
    expect(isMonacoDisposedError(new Error('InstantiationService has been disposed'))).toBe(true);
    expect(isMonacoDisposedError('TextModel got disposed before DiffEditorWidget model')).toBe(true);
    expect(isMonacoDisposedError(new Error('unexpected'))).toBe(false);
  });

  it('clasifica rechazos de página benignos', () => {
    const canceled = new Error('Canceled');
    canceled.name = 'Canceled';
    expect(isBenignPageRejectionEvent({ reason: canceled })).toBe(true);
    expect(
      isBenignPageRejectionEvent({ reason: 'Error: no diff result available' })
    ).toBe(true);
    expect(
      isBenignPageErrorEvent({
        message: 'ResizeObserver loop limit exceeded',
        filename: 'code/code.js'
      })
    ).toBe(true);
  });

  it('clasifica operacionales por reason y mensaje', () => {
    expect(classifyError(new Error('No session'), { reason: 'NO_SID' })).toBe('operational');
    expect(classifyError(new Error('Test already enqueued 01pXXX'))).toBe('operational');
    expect(isOperationalError(new Error('x'), { ok: false, reason: 'NOT_FOUND' })).toBe(true);
  });

  it('clasifica bugs con stack en código SFOC', () => {
    const err = new Error('unexpected');
    err.stack = 'Error: unexpected\n    at foo (chrome-extension://id/code/ui/panel.js:10:5)';
    expect(classifyError(err, { error_handled: 1 })).toBe('bug');
    expect(shouldReportAsBug(err)).toBe(true);
  });

  it('errores manejados sin stack de app van a operational', () => {
    const err = new Error('Session expired or invalid');
    expect(classifyError(err, { error_handled: 1 })).toBe('operational');
  });

  it('isBenignErrorText cubre extension invalidated', () => {
    expect(isBenignErrorText('Extension context invalidated')).toBe(true);
  });

  it('isBenignErrorText cubre dockview appendChild/parentElement', () => {
    expect(isBenignErrorText("Failed to execute 'appendChild' on 'Node'")).toBe(true);
    expect(isBenignErrorText('Cannot read properties of null (reading \'parentElement\')')).toBe(true);
    expect(
      classifyError(new Error('appendChild'), {
        filename: 'chrome-extension://id/vendor/dockview-core/dist/dockview.js'
      })
    ).toBe('benign');
  });

  it('isSalesforceOrNetworkOperationalText cubre patrones de auditoría PostHog', () => {
    expect(isSalesforceOrNetworkOperationalText('TypeError: Failed to fetch')).toBe(true);
    expect(isSalesforceOrNetworkOperationalText('Metadata retrieve finished without ZIP')).toBe(true);
    expect(isSalesforceOrNetworkOperationalText('package.xml sin bloques <types>')).toBe(true);
    expect(isSalesforceOrNetworkOperationalText("sObject type 'ApexClass' is not supported")).toBe(true);
    expect(classifyError(new Error('ApexTestQueueServlet STATUS: HTTP 500'))).toBe('operational');
    expect(isSalesforceOrNetworkOperationalText('Bulk job failed: 400 InvalidUrl unknown version')).toBe(true);
    expect(isSalesforceOrNetworkOperationalText('Trace is not active')).toBe(true);
    expect(isSalesforceOrNetworkOperationalText('Access from current IP address is not allowed')).toBe(true);
    expect(classifyError(new Error('Failed to fetch'))).toBe('operational');
    expect(classifyError(new Error('An unknown exception occurred'))).toBe('operational');
    expect(shouldReportAsBug(new Error('Failed to fetch'))).toBe(false);
  });
});
