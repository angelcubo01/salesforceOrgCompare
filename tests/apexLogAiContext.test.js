import { describe, expect, it } from 'vitest';
import {
  buildInitialLogContext,
  buildLogiToolDefinitions,
  fetchLogLines,
  fetchParsedSection,
  quickActionUserMessage,
  redactPii,
  truncateText
} from '../shared/logi/apexLogAiContext.js';
import { isReadOnlySalesforceQuery } from '../background/logi/apexLogAiAdvisor.js';

describe('apexLogAiContext', () => {
  it('truncates long text', () => {
    expect(truncateText('hello world', 8)).toBe('hello w…');
  });

  it('redacts emails', () => {
    expect(redactPii('Contact user@example.com')).toBe('Contact [email]');
  });

  it('builds compact initial context', () => {
    const parsed = {
      meta: { sizeBytes: 1000, durationMs: 50, issueCount: 1, isTestLog: false },
      issues: [{ line: 10, type: 'EXCEPTION', message: 'NullPointer' }],
      soql: [{ line: 5, text: 'SELECT Id FROM Account', rows: 1 }],
      dml: [],
      limits: [],
      executions: [],
      callouts: [],
      validations: [],
      userDebug: [],
      soqlDuplicates: []
    };
    const ctx = buildInitialLogContext(parsed, { orgId: '00Dxx', logId: '07Lxx' });
    expect(ctx.issues).toHaveLength(1);
    expect(ctx.soql).toHaveLength(1);
    expect(ctx.context.orgId).toBe('00Dxx');
  });

  it('fetches log lines with cap', () => {
    const raw = 'line1\nline2\nline3\nline4';
    const result = fetchLogLines(raw, 2, 4, 2);
    expect(result.lines).toHaveLength(2);
    expect(result.startLine).toBe(2);
  });

  it('fetches parsed sections', () => {
    const parsed = { issues: [{ line: 1, message: 'err' }] };
    const section = fetchParsedSection(parsed, 'issues');
    expect(section.section).toBe('issues');
    expect(section.items).toHaveLength(1);
  });

  it('includes org_query tool when allowed', () => {
    const tools = buildLogiToolDefinitions({ allowOrgQuery: true });
    expect(tools.some((t) => t.function.name === 'org_query')).toBe(true);
  });

  it('quick action messages exist in es and en', () => {
    expect(quickActionUserMessage('debug_errors', 'es')).toMatch(/errores/i);
    expect(quickActionUserMessage('debug_errors', 'en')).toMatch(/error/i);
  });
});

describe('isReadOnlySalesforceQuery', () => {
  it('allows SELECT', () => {
    expect(isReadOnlySalesforceQuery('SELECT Id FROM Account LIMIT 1')).toBe(true);
  });

  it('rejects DML', () => {
    expect(isReadOnlySalesforceQuery('DELETE FROM Account')).toBe(false);
    expect(isReadOnlySalesforceQuery('SELECT Id FROM Account; DELETE FROM Account')).toBe(false);
  });
});
