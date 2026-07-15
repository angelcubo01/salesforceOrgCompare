import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../shared/htmlEscape.js';

describe('escapeHtml', () => {
  it('escapa caracteres HTML peligrosos', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml(`"o'`)).toBe('&quot;o&#39;');
  });

  it('acepta null y undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
