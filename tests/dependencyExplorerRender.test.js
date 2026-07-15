import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../shared/htmlEscape.js';

describe('dependencyExplorer render safety', () => {
  it('escapeHtml neutralizes script in metadata name', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const safe = escapeHtml(malicious);
    expect(safe).not.toContain('<img');
    expect(safe).toContain('&lt;img');
  });
});
