import { describe, it, expect } from 'vitest';
import {
  buildTimelineExportRows,
  timelineToCsv,
  timelineToJson
} from '../code/lib/apexLogViewer/timelineExport.js';

describe('timelineExport', () => {
  const nodes = [
    {
      type: 'soql',
      label: 'SELECT Id FROM Account',
      startNs: 10_000_000,
      endNs: 25_000_000,
      durationMs: 15,
      rows: 10,
      line: 12,
      depth: 2,
      hasError: false
    },
    {
      type: 'method',
      label: 'MyClass.run',
      startNs: 40_000_000,
      endNs: 50_000_000,
      durationMs: 10,
      rows: 0,
      line: 20,
      depth: 1,
      hasError: true
    }
  ];

  const t = (key) => (key === 'apexLogViewer.kind.soql' ? 'SOQL' : key);

  it('filtra por ventana temporal', () => {
    const rows = buildTimelineExportRows(nodes, 0, 0, 30_000_000, t);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toContain('Account');
  });

  it('genera CSV con metadatos de ventana', () => {
    const rows = buildTimelineExportRows(nodes, 0, 0, 60_000_000, t);
    const csv = timelineToCsv(rows, { viewStartMs: 0, viewEndMs: 60, viewDurationMs: 60 });
    expect(csv).toContain('# viewStartMs,0');
    expect(csv).toContain('SOQL');
    expect(csv).toContain('SELECT Id FROM Account');
  });

  it('genera JSON con eventos y vista', () => {
    const rows = buildTimelineExportRows(nodes, 0, 0, 60_000_000, t);
    const json = JSON.parse(timelineToJson(rows, { viewStartMs: 0, viewEndMs: 60, viewDurationMs: 60 }));
    expect(json.events).toHaveLength(2);
    expect(json.view.viewDurationMs).toBe(60);
  });
});
