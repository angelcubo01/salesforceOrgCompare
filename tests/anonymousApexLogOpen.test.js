import { describe, expect, it, vi } from 'vitest';
import {
  anonymousApexLogDownloadFileName,
  anonymousApexLogFromExecution,
  resolveAnonymousApexLogContent
} from '../code/ui/anonymousApexPanel.js';

describe('Anonymous Apex log opening', () => {
  it('makes inline logs available for success and runtime exceptions', () => {
    expect(anonymousApexLogFromExecution('left', {
      ok: true,
      result: { compiled: true, success: true, logs: 'success log' }
    }, 'Left')).toMatchObject({ orgId: 'left', inlineLogs: 'success log' });
    expect(anonymousApexLogFromExecution('right', {
      ok: true,
      result: { compiled: true, success: false, logs: 'runtime log' }
    }, 'Right')).toMatchObject({ orgId: 'right', inlineLogs: 'runtime log' });
  });

  it('does not expose a log entry for compilation failures', () => {
    expect(anonymousApexLogFromExecution('left', {
      ok: true,
      result: { compiled: false, success: false, logs: 'compile response' }
    }, 'Left')).toBeNull();
  });

  it('prefers an already persisted ApexLog body', async () => {
    const fetchBody = vi.fn().mockResolvedValue({ ok: true, body: 'persisted log' });
    await expect(
      resolveAnonymousApexLogContent(
        { orgId: 'org', logId: '07L000000000001', inlineLogs: 'inline log' },
        fetchBody
      )
    ).resolves.toBe('persisted log');
    expect(fetchBody).toHaveBeenCalledWith('org', '07L000000000001');
  });

  it('falls back to the exact inline log when persisted retrieval fails', async () => {
    const fetchBody = vi.fn().mockRejectedValue(new Error('not indexed yet'));
    await expect(
      resolveAnonymousApexLogContent(
        { orgId: 'org', logId: '07L000000000001', inlineLogs: 'inline log' },
        fetchBody
      )
    ).resolves.toBe('inline log');
  });

  it('opens inline-only runtime logs without requesting an ApexLog', async () => {
    const fetchBody = vi.fn();
    await expect(
      resolveAnonymousApexLogContent({ orgId: 'org', inlineLogs: 'runtime exception log' }, fetchBody)
    ).resolves.toBe('runtime exception log');
    expect(fetchBody).not.toHaveBeenCalled();
  });

  it('names the downloaded file after the ApexLog id when available', () => {
    expect(anonymousApexLogDownloadFileName({ logId: '07L000000000001', label: 'Left' })).toBe(
      '07L000000000001.log'
    );
  });

  it('falls back to a sanitized org-based name for inline-only logs', () => {
    expect(anonymousApexLogDownloadFileName({ label: 'Prod/Sandbox: QA' })).toBe(
      'anonymous-apex-Prod-Sandbox- QA.log'
    );
    expect(anonymousApexLogDownloadFileName({})).toBe('anonymous-apex-org.log');
  });
});
