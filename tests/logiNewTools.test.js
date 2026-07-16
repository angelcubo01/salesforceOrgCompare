import { describe, expect, it } from 'vitest';
import {
  buildLogiToolDefinitions,
  enrichLocalToolResult,
  getHotspots,
  getStackAround,
  highlightLogLines,
  quickActionUserMessage,
  searchLog
} from '../shared/apexLogAiContext.js';
import { LOGI_QUICK_ACTION_IDS } from '../shared/apexLogAiAdvisorConfig.js';

const RAW = [
  '00:00:00.0 (1)|USER_DEBUG|[1]|DEBUG|hello world',
  '00:00:00.1 (2)|SOQL_EXECUTE_BEGIN|[2]|Aggregations:0|SELECT Id FROM Account',
  '00:00:00.2 (3)|EXCEPTION_THROWN|[10]|System.NullPointerException: Attempt to de-reference a null object',
  '00:00:00.3 (4)|FATAL_ERROR|System.NullPointerException',
  '00:00:00.4 (5)|CODE_UNIT_FINISHED|MyClass.doWork'
].join('\n');

const PARSED = {
  issues: [
    {
      line: 3,
      type: 'EXCEPTION',
      message: 'System.NullPointerException: Attempt to de-reference a null object',
      severity: 'error'
    }
  ],
  executions: [
    {
      id: 0,
      label: 'MyClass.doWork',
      hasError: true,
      durationMs: 12,
      startLine: 1,
      endLine: 5
    }
  ],
  soql: [
    { line: 2, text: 'SELECT Id FROM Account', rows: 50, durationMs: 5 },
    { line: 8, text: 'SELECT Name FROM Contact', rows: 200, durationMs: 20 }
  ],
  dml: [{ line: 9, type: 'Insert', object: 'Account', rows: 3, durationMs: 2 }],
  profiling: {
    soql: [{ location: 'MyClass', apexLine: 10, detail: 'query', executions: 2, totalMs: 40 }],
    dml: [],
    methods: [{ location: 'MyClass.doWork', apexLine: 1, detail: 'doWork', executions: 1, totalMs: 100 }]
  },
  soqlDuplicates: [{ count: 4, query: 'SELECT Id FROM Account' }]
};

describe('searchLog', () => {
  it('finds matching lines and redacts/truncates text', () => {
    const result = searchLog(RAW, 'NullPointer');
    expect(result.truncated).toBe(false);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.matches[0].line).toBe(3);
    expect(result.matches[0].text).toMatch(/NullPointerException/);
  });

  it('respects max_results and case_sensitive', () => {
    const many = searchLog('A\nb\nA\nA\nA', 'A', { maxResults: 2 });
    expect(many.matches).toHaveLength(2);
    expect(many.truncated).toBe(true);

    const cs = searchLog(RAW, 'nullpointer', { caseSensitive: true });
    expect(cs.matches).toHaveLength(0);
  });

  it('enrichLocalToolResult marks empty search as insufficient', () => {
    const enriched = enrichLocalToolResult('search_log', searchLog(RAW, 'zzz-not-found'), 'es');
    expect(enriched.ok).toBe(true);
    expect(enriched.insufficient).toBe(true);
    expect(enriched.retry_hint).toBeTruthy();
  });
});

describe('getHotspots', () => {
  it('returns top SOQL/DML/profiling/duplicates', () => {
    const hot = getHotspots(PARSED, { reason: 'perf' });
    expect(hot.soql[0].rows).toBe(200);
    expect(hot.dml).toHaveLength(1);
    expect(hot.profiling[0].totalMs).toBe(100);
    expect(hot.soqlDuplicates[0].count).toBe(4);
  });

  it('handles empty parsed', () => {
    const hot = getHotspots(null);
    expect(hot.empty).toBe(true);
    const enriched = enrichLocalToolResult('get_hotspots', hot, 'en');
    expect(enriched.insufficient).toBe(true);
  });
});

describe('getStackAround', () => {
  it('returns nearby raw lines plus overlapping issues/executions', () => {
    const stack = getStackAround(RAW, PARSED, 3, { radius: 2, reason: 'npe' });
    expect(stack.center_line).toBe(3);
    expect(stack.lines.length).toBeGreaterThanOrEqual(3);
    expect(stack.nearby_issues.some((i) => i.line === 3)).toBe(true);
    expect(stack.nearby_executions.some((e) => e.label === 'MyClass.doWork')).toBe(true);
  });
});

describe('highlightLogLines + tool defs + quick actions', () => {
  it('returns UI bridge payload', () => {
    expect(highlightLogLines(10, 12, 'show')).toEqual({
      ok: true,
      start_line: 10,
      end_line: 12,
      action: 'highlight'
    });
  });

  it('includes new local and org tools', () => {
    const names = buildLogiToolDefinitions({ allowOrgQuery: true }).map((t) => t.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'search_log',
        'get_stack_around',
        'get_hotspots',
        'highlight_log_lines',
        'get_apex_source',
        'describe_sobject_fields',
        'org_query'
      ])
    );
    const noOrg = buildLogiToolDefinitions({ allowOrgQuery: false }).map((t) => t.function.name);
    expect(noOrg).not.toContain('get_apex_source');
    expect(noOrg).toContain('search_log');
  });

  it('has callouts/validations/hotspots quick actions', () => {
    expect(LOGI_QUICK_ACTION_IDS).toEqual(
      expect.arrayContaining(['callouts', 'validations', 'hotspots'])
    );
    expect(quickActionUserMessage('hotspots', 'es')).toMatch(/get_hotspots/i);
    expect(quickActionUserMessage('callouts', 'en')).toMatch(/callouts/i);
    expect(quickActionUserMessage('validations', 'es')).toMatch(/validations/i);
  });
});
