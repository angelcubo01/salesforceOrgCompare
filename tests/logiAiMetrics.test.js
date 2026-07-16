import { describe, expect, it } from 'vitest';
import {
  buildLogiAiMetrics,
  buildLogiErrorMetrics,
  sanitizeLogiTelemetryProps
} from '../shared/logiAiMetrics.js';
import { SFOC_AI_USER_ID_PROP, buildSfocAiUserProperties } from '../shared/posthogAiUserContext.js';

describe('buildSfocAiUserProperties', () => {
  it('expone sfoc_ai_user_id con UUID', () => {
    const id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    expect(buildSfocAiUserProperties(id)).toEqual({ [SFOC_AI_USER_ID_PROP]: id });
  });
});

describe('buildLogiAiMetrics', () => {
  it('mapea modelo, tokens y tools sin contenido', () => {
    const metrics = buildLogiAiMetrics(
      {
        model: 'openrouter/free-model',
        latencyMs: 1200,
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        cost: 0.001,
        finish_reason: 'stop',
        tool_calls: [{ function: { name: 'fetch_log_lines' } }]
      },
      { model: 'configured-model', transport: 'proxy', proxyUrl: 'https://proxy.test' },
      { iteration: 2, logId: '07Lxx', sessionKey: 'org::log', isNewChat: true }
    );
    expect(metrics.sfoc_model).toBe('openrouter/free-model');
    expect(metrics.sfoc_prompt_tokens).toBe(10);
    expect(metrics.sfoc_completion_tokens).toBe(20);
    expect(metrics.sfoc_total_tokens).toBe(30);
    expect(metrics.sfoc_tool_calls_count).toBe(1);
    expect(metrics.sfoc_transport).toBe('proxy');
    expect(metrics).not.toHaveProperty('content');
  });
});

describe('buildLogiErrorMetrics', () => {
  it('parsea errores de proxy HTTP', () => {
    const err = new Error('LOGI_PROXY_HTTP_503: upstream unavailable');
    const m = buildLogiErrorMetrics(err, { transport: 'proxy', modelConfigured: 'm1' });
    expect(m.sfoc_error_source).toBe('proxy');
    expect(m.sfoc_error_code).toBe('LOGI_PROXY_HTTP_503');
    expect(m.sfoc_http_status).toBe(503);
  });

  it('clasifica límites locales', () => {
    const m = buildLogiErrorMetrics(null, { reason: 'MAX_CHATS_DAY' });
    expect(m.sfoc_error_source).toBe('limit');
    expect(m.sfoc_limit_reason).toBe('MAX_CHATS_DAY');
  });
});

describe('sanitizeLogiTelemetryProps', () => {
  it('elimina campos de contenido', () => {
    const safe = sanitizeLogiTelemetryProps({
      action: 'chat_turn',
      sfoc_model: 'm',
      content: 'secret',
      messages: [{ role: 'user' }],
      $ai_input: 'prompt'
    });
    expect(safe.sfoc_model).toBe('m');
    expect(safe).not.toHaveProperty('content');
    expect(safe).not.toHaveProperty('messages');
    expect(safe).not.toHaveProperty('$ai_input');
  });
});
