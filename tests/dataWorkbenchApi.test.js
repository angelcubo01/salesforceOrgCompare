import { describe, expect, it } from 'vitest';
import { buildRecordPayload, parseFieldsFromForm } from '../shared/dataWorkbenchApi.js';

describe('dataWorkbenchApi', () => {
  const describeMeta = {
    fields: [
      { name: 'Name', type: 'string' },
      { name: 'Amount', type: 'currency' },
      { name: 'IsActive', type: 'boolean' }
    ]
  };

  it('coerces field types from form', () => {
    const payload = parseFieldsFromForm(describeMeta, {
      Name: 'Test',
      Amount: '12.5',
      IsActive: 'true'
    });
    expect(payload.Name).toBe('Test');
    expect(payload.Amount).toBe(12.5);
    expect(payload.IsActive).toBe(true);
  });

  it('builds record payload via describe', () => {
    const out = buildRecordPayload({ Name: 'A', Amount: '3' }, describeMeta);
    expect(out.Name).toBe('A');
    expect(out.Amount).toBe(3);
  });
});
