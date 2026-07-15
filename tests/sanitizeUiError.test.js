import { describe, it, expect } from 'vitest';
import { sanitizeUiError } from '../shared/sanitizeUiError.js';

describe('sanitizeUiError', () => {
  it('elimina etiquetas HTML', () => {
    expect(sanitizeUiError('<b>Error</b> INVALID_SESSION')).toBe('Error INVALID_SESSION');
  });

  it('trunca mensajes largos', () => {
    const long = 'x'.repeat(400);
    expect(sanitizeUiError(long, { maxLength: 50 }).length).toBe(50);
    expect(sanitizeUiError(long, { maxLength: 50 }).endsWith('…')).toBe(true);
  });

  it('colapsa espacios en blanco', () => {
    expect(sanitizeUiError('  foo   bar  ')).toBe('foo bar');
  });
});
