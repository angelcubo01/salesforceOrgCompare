import { describe, expect, it } from 'vitest';
import '../tests/setup.js';
import { captureLogiUsage } from '../background/posthogLogiTelemetry.js';
import { LOGI_USAGE_EVENT } from '../shared/logiTelemetryConstants.js';

describe('captureLogiUsage', () => {
  it('envía logi_usage chat_turn al endpoint PostHog', async () => {
    await chrome.storage.local.set({ soc_extension_config: { telemetryEnabled: true } });
    /** @type {{ url: string, body: Record<string, unknown> } | null} */
    let captured = null;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      captured = {
        url: String(url),
        body: JSON.parse(String(opts?.body || '{}'))
      };
      return new Response(JSON.stringify({ status: 'Ok' }), { status: 200 });
    };

    try {
      const ok = await captureLogiUsage({
        action: 'chat_turn',
        sfoc_log_id: 'test-log-id',
        sfoc_model: 'test-model'
      });
      expect(ok).toBe(true);
      expect(captured?.url).toContain('/capture/');
      expect(captured?.body.event).toBe(LOGI_USAGE_EVENT);
      expect(captured?.body.properties).toMatchObject({
        action: 'chat_turn',
        sfoc_log_id: 'test-log-id'
      });
      expect(captured?.body.properties).not.toHaveProperty('type');
      const setProps = /** @type {Record<string, unknown>} */ (captured?.body.properties)?.$set;
      expect(setProps).toMatchObject({
        sfoc_ai_last_model: 'test-model'
      });
      expect(setProps).toHaveProperty('sfoc_ai_last_used_at');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('actualiza person properties también en summarize', async () => {
    await chrome.storage.local.set({ soc_extension_config: { telemetryEnabled: true } });
    /** @type {{ url: string, body: Record<string, unknown> } | null} */
    let captured = null;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      captured = {
        url: String(url),
        body: JSON.parse(String(opts?.body || '{}'))
      };
      return new Response(JSON.stringify({ status: 'Ok' }), { status: 200 });
    };

    try {
      const ok = await captureLogiUsage({
        action: 'summarize',
        sfoc_summary: true,
        sfoc_model: 'summary-model'
      });
      expect(ok).toBe(true);
      const setProps = /** @type {Record<string, unknown>} */ (captured?.body.properties)?.$set;
      expect(setProps).toMatchObject({
        sfoc_ai_last_model: 'summary-model'
      });
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
