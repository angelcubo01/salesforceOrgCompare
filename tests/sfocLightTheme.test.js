import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('light theme CSS contract', () => {
  let css = '';

  beforeEach(() => {
    css = readFileSync(join(root, 'code', 'code-theme-light.css'), 'utf8');
  });

  it('remaps semantic --sfoc-* tokens on html[data-ui-theme=light]', () => {
    expect(css).toMatch(/html\[data-ui-theme="light"\][\s\S]*--sfoc-bg-panel:/);
    expect(css).toMatch(/--sfoc-accent:\s*#2563eb/);
    expect(css).toMatch(/--sfoc-light-text-muted:\s*#334155/);
    expect(css).toMatch(/--sfoc-text:\s*var\(--sfoc-light-text\)/);
    expect(css).toMatch(/--sfoc-input-bg:/);
    expect(css).toMatch(/--sfoc-link:/);
  });

  it('styles shared sfoc components for light mode', () => {
    expect(css).toMatch(/html\[data-ui-theme="light"\] \.sfoc-btn--primary/);
    expect(css).toMatch(/html\[data-ui-theme="light"\] \.sfoc-modal-panel/);
    expect(css).toMatch(/html\[data-ui-theme="light"\] \.sfoc-tool-panel__header/);
  });

  it('covers analysis and data tool tables', () => {
    expect(css).toMatch(/html\[data-ui-theme="light"\] \.object-describe-table th/);
    expect(css).toMatch(/html\[data-ui-theme="light"\] \.rest-explorer-table td/);
    expect(css).toMatch(/html\[data-ui-theme="light"\] \.data-workbench-panel/);
  });

  it('covers record compare inputs and status tones', () => {
    expect(css).toMatch(/html\[data-ui-theme="light"\] \.record-compare-id-input/);
    expect(css).toMatch(/html\[data-ui-theme="light"\] \.record-compare-status-match/);
  });

  it('uses accessible muted text token for secondary copy', () => {
    expect(css).toMatch(/--sfoc-light-text-placeholder:\s*#64748b/);
    expect(css).toMatch(/html\[data-ui-theme="light"\] \.query-explorer-field-label/);
  });
});
