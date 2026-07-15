import { describe, it, expect } from 'vitest';
import {
  normalizeSalesforceRestErrorBodyText,
  salesforceRestErrorMessagesOnly,
  salesforceRestErrorStructuredFromText,
  collectSalesforceRestErrorMessages
} from '../shared/salesforceRestErrors.js';

describe('normalizeSalesforceRestErrorBodyText', () => {
  it('quita BOM UTF-8', () => {
    expect(normalizeSalesforceRestErrorBodyText('\uFEFF{"a":1}')).toBe('{"a":1}');
  });

  it('quita prefijo )]}\'', () => {
    const raw = ")]}'\n[{\"message\":\"bad\"}]";
    expect(normalizeSalesforceRestErrorBodyText(raw)).toBe('[{"message":"bad"}]');
  });

  it('quita while(1);', () => {
    expect(normalizeSalesforceRestErrorBodyText('while(1);{"message":"x"}')).toBe('{"message":"x"}');
  });
});

describe('salesforceRestErrorMessagesOnly', () => {
  it('extrae message de array JSON', () => {
    const body = '[{"message":"Invalid field","errorCode":"INVALID_FIELD"}]';
    expect(salesforceRestErrorMessagesOnly(body)).toBe('Invalid field');
  });

  it('extrae varios mensajes anidados', () => {
    const body = '{"errors":[{"message":"A"},{"message":"B"}]}';
    expect(salesforceRestErrorMessagesOnly(body)).toBe('A\nB');
  });

  it('devuelve texto normalizado si no hay JSON', () => {
    expect(salesforceRestErrorMessagesOnly('plain error')).toBe('plain error');
  });
});

describe('salesforceRestErrorStructuredFromText', () => {
  it('devuelve message y errorCode', () => {
    const body = '[{"message":"No access","errorCode":"INSUFFICIENT_ACCESS"}]';
    const r = salesforceRestErrorStructuredFromText(body);
    expect(r.message).toBe('No access');
    expect(r.errorCode).toBe('INSUFFICIENT_ACCESS');
  });

  it('une varios mensajes con doble salto', () => {
    const body = '[{"message":"One"},{"message":"Two"}]';
    expect(salesforceRestErrorStructuredFromText(body).message).toBe('One\n\nTwo');
  });
});

describe('collectSalesforceRestErrorMessages', () => {
  it('recorre arrays anidados', () => {
    const msgs = [];
    collectSalesforceRestErrorMessages([{ message: 'x' }, { errors: [{ message: 'y' }] }], msgs);
    expect(msgs).toEqual(['x', 'y']);
  });
});
