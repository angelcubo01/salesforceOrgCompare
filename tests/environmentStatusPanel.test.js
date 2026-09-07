import { describe, expect, it } from 'vitest';
import {
  buildTimelineIntervals,
  canExpandSessionDetail,
  escapeHtml,
  formatDuration,
  formatTrustDate,
  hasActiveSalesforceSession,
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

  it('allows Trust detail even with an expired session', () => {
    expect(canExpandSessionDetail('active')).toBe(true);
    expect(canExpandSessionDetail('expired')).toBe(true);
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

  it('identifies the active Salesforce session used by the main table', () => {
    expect(hasActiveSalesforceSession({ auth: 'active' })).toBe(true);
    expect(hasActiveSalesforceSession({ auth: 'expired' })).toBe(false);
    expect(hasActiveSalesforceSession(null)).toBe(false);
  });

  it('formats Trust dates, durations and open intervals with injected now', () => {
    expect(formatDuration(90 * 60000)).toBe('1h 30m');
    expect(formatTrustDate('2026-01-02T03:04:00Z', 'en')).toContain('02/01/2026');
    const intervals = buildTimelineIntervals(
      [{ startTime: '2026-01-01T00:00:00Z' }],
      Date.parse('2025-12-31T00:00:00Z'), Date.parse('2026-01-03T00:00:00Z'), Date.parse('2026-01-02T00:00:00Z')
    );
    expect(intervals[0].width).toBeGreaterThan(0);
  });
});
