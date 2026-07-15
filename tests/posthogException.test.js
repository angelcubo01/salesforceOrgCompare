import { describe, it, expect } from 'vitest';
import {
  buildPosthogExceptionFingerprint,
  buildPosthogExceptionList,
  parseJavascriptStackFrames
} from '../shared/posthogException.js';

describe('buildPosthogExceptionList', () => {
  it('genera $exception_list con type, value y stacktrace', () => {
    const err = new TypeError('boom');
    err.stack = 'TypeError: boom\n    at foo (file.js:10:5)';
    const list = buildPosthogExceptionList(err);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('TypeError');
    expect(list[0].value).toBe('boom');
    expect(list[0].mechanism.handled).toBe(false);
    expect(list[0].stacktrace.type).toBe('raw');
    expect(list[0].stacktrace.frames.length).toBeGreaterThan(0);
  });
});

describe('buildPosthogExceptionFingerprint', () => {
  it('incluye tipo, mensaje y ubicación del primer frame', () => {
    const err = new Error('fail');
    err.name = 'TypeError';
    err.stack = 'TypeError: fail\n    at fn (mod.js:9:1)';
    const fp = buildPosthogExceptionFingerprint(err);
    expect(fp).toContain('TypeError');
    expect(fp).toContain('fail');
    expect(fp).toContain('mod.js:9');
  });
});

describe('parseJavascriptStackFrames', () => {
  it('parsea líneas at function (file:line:col)', () => {
    const frames = parseJavascriptStackFrames('Error: x\n    at myFn (app.js:42:7)');
    expect(frames[0].function).toBe('myFn');
    expect(frames[0].filename).toBe('app.js');
    expect(frames[0].lineno).toBe(42);
    expect(frames[0].colno).toBe(7);
  });
});
