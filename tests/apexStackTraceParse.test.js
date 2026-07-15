import { describe, it, expect } from 'vitest';
import { parseApexStackFrameLine, parseApexStackTraceFrames } from '../shared/apexStackTraceParse.js';

describe('parseApexStackFrameLine', () => {
  it('parses class.method with column', () => {
    expect(parseApexStackFrameLine('Class.CC_MiTest.miMetodo: line 237, column 1')).toEqual({
      className: 'CC_MiTest',
      line: 237
    });
  });

  it('parses class without method segment', () => {
    expect(parseApexStackFrameLine('Class.AccountHandler: line 42')).toEqual({
      className: 'AccountHandler',
      line: 42
    });
  });

  it('parses inner / namespaced class before method', () => {
    expect(parseApexStackFrameLine('Class.MyNs.ServiceHelper.runBatch: line 10, column 1')).toEqual({
      className: 'MyNs.ServiceHelper',
      line: 10
    });
  });

  it('parses line with leading at and spaces', () => {
    expect(parseApexStackFrameLine('  at Class.Other.helper: line 12, column 1')).toEqual({
      className: 'Other',
      line: 12
    });
  });

  it('returns null for system frames', () => {
    expect(parseApexStackFrameLine('(System Code)')).toBeNull();
    expect(parseApexStackFrameLine('External entry point')).toBeNull();
  });
});

describe('parseApexStackTraceFrames', () => {
  it('returns one frame per parseable line', () => {
    const stack = `System.AssertException: Assertion Failed
Class.CC_Test.testFail: line 45, column 1
Class.CC_Service.process: line 120, column 1
Class.CC_Handler: line 8`;
    const frames = parseApexStackTraceFrames(stack);
    expect(frames).toHaveLength(3);
    expect(frames[0]).toMatchObject({ className: 'CC_Test', line: 45 });
    expect(frames[1]).toMatchObject({ className: 'CC_Service', line: 120 });
    expect(frames[2]).toMatchObject({ className: 'CC_Handler', line: 8 });
  });
});
