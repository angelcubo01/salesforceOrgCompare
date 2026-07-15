import { describe, expect, it } from 'vitest';
import {
  canExpandSessionDetail,
  escapeHtml,
  renderSessionDetailGridHtml,
  toggleExpandedOrg
} from '../code/ui/environmentStatusPanelHelpers.js';

describe('environmentStatusPanelHelpers', () => {
  it('toggles expanded org set', () => {
    let expanded = new Set(['a']);
    expanded = toggleExpandedOrg('b', expanded);
    expect([...expanded]).toEqual(['a', 'b']);
    expanded = toggleExpandedOrg('a', expanded);
    expect([...expanded]).toEqual(['b']);
  });

  it('allows expand only for active auth', () => {
    expect(canExpandSessionDetail('active')).toBe(true);
    expect(canExpandSessionDetail('expired')).toBe(false);
  });

  it('escapes html in detail grid', () => {
    const html = renderSessionDetailGridHtml([{ label: '<x>', value: 'a&b' }]);
    expect(html).toContain('&lt;x&gt;');
    expect(html).toContain('a&amp;b');
    expect(html).toContain('env-status-detail-grid');
  });

  it('escapeHtml handles quotes', () => {
    expect(escapeHtml(`"'`)).toBe('&quot;&#39;');
  });
});
