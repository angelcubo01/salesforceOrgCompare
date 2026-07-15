import { describe, expect, it, vi, beforeEach } from 'vitest';
import { sanitizeExceptionContext } from '../shared/sanitizeExceptionContext.js';

describe('sanitizeExceptionContext', () => {
  it('keeps allowed sfoc keys', () => {
    const out = sanitizeExceptionContext({
      sfoc_action: 'retrieve',
      sfoc_reason_code: 'TIMEOUT',
      error_handled: true
    });
    expect(out.sfoc_action).toBe('retrieve');
    expect(out.sfoc_reason_code).toBe('TIMEOUT');
    expect(out.error_handled).toBe(true);
  });

  it('drops forbidden secret-like keys', () => {
    const out = sanitizeExceptionContext({
      proxyAuthToken: 'secret',
      sid: '00D',
      sfoc_action: 'ok'
    });
    expect(out.proxyAuthToken).toBeUndefined();
    expect(out.sid).toBeUndefined();
    expect(out.sfoc_action).toBe('ok');
  });
});

describe('posthogTelemetry channels', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sendPosthogException ignores telemetryEnabled', async () => {
    vi.doMock('../shared/extensionSettings.js', () => ({
      loadExtensionSettings: async () => ({ telemetryEnabled: false })
    }));
    vi.doMock('../shared/posthogConfigured.js', () => ({
      isPosthogApiConfigured: () => true
    }));
    vi.doMock('../shared/telemetryConfig.js', () => ({
      POSTHOG_API_KEY: 'phc_test',
      POSTHOG_HOST: 'https://eu.i.posthog.com',
      POSTHOG_DEBUG: false
    }));

    let captured = null;
    vi.doMock('../shared/telemetryInstallId.js', () => ({
      getOrCreateTelemetryInstallId: async () => 'install-test',
      getOrCreateTelemetrySessionId: async () => 'session-test'
    }));

    globalThis.fetch = async (_url, init) => {
      captured = JSON.parse(String(init.body));
      return new Response('{}', { status: 200 });
    };

    const { sendPosthogException } = await import('../background/posthogTelemetry.js');
    const ok = await sendPosthogException(new Error('boom'), { sfoc_action: 'test_handler' });
    expect(ok).toBe(true);
    expect(captured?.event).toBe('$exception');
  });

  it('sendPosthogOperationalFailure respects telemetryEnabled false', async () => {
    vi.doMock('../shared/extensionSettings.js', () => ({
      loadExtensionSettings: async () => ({ telemetryEnabled: false })
    }));
    vi.doMock('../shared/posthogConfigured.js', () => ({
      isPosthogApiConfigured: () => true
    }));
    vi.doMock('../shared/telemetryConfig.js', () => ({
      POSTHOG_API_KEY: 'phc_test',
      POSTHOG_HOST: 'https://eu.i.posthog.com',
      POSTHOG_DEBUG: false
    }));

    globalThis.fetch = async () => {
      throw new Error('should not fetch');
    };

    const { sendPosthogOperationalFailure } = await import('../background/posthogTelemetry.js');
    const ok = await sendPosthogOperationalFailure({ kind: 'test' });
    expect(ok).toBe(false);
  });
});
