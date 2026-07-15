import { describe, expect, it } from 'vitest';
import {
  sanitizeRunTestsBodyForApi,
  validateRunTestsBodyForApi
} from '../shared/apexTestRunBodyApi.js';

describe('apexTestRunBodyApi', () => {
  it('elimina className solo cuando hay classId', () => {
    const body = {
      tests: [
        { classId: '01pXX', className: 'Foo', testMethods: ['bar'] },
        { className: 'Bar', testMethods: ['baz'] }
      ],
      testLevel: 'RunSpecifiedTests'
    };
    const out = sanitizeRunTestsBodyForApi(body);
    expect(out.tests[0]).toEqual({ classId: '01pXX', testMethods: ['bar'] });
    expect(out.tests[1]).toEqual({ className: 'Bar', testMethods: ['baz'] });
  });

  it('rechaza entradas sin classId ni className tras sanitizar', () => {
    const body = sanitizeRunTestsBodyForApi({
      tests: [{ testMethods: ['onlyMethod'] }]
    });
    expect(validateRunTestsBodyForApi(body)).toMatch(/classId or className/);
  });

  it('acepta className sin classId', () => {
    const body = sanitizeRunTestsBodyForApi({
      tests: [{ className: 'MyTest', testMethods: ['t1'] }]
    });
    expect(validateRunTestsBodyForApi(body)).toBeNull();
    expect(body.tests[0].className).toBe('MyTest');
  });
});
