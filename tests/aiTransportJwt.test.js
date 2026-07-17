import { describe, expect, it, vi, afterEach } from 'vitest';
import { mockFetch } from './setup.js';
import {
  acquireProxyJwt,
  getProxyJwt,
  resetLogiProxySessionForTests,
  buildLogiProxySessionUrl
} from '../shared/logi/logiProxySession.js';
import { createChatCompletion } from '../shared/aiTransport.js';

const INSTALL_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROXY_CHAT = 'https://proxy.example/v1/chat';
const PROXY_SESSION = 'https://proxy.example/v1/session';

describe('logiProxySession', () => {
  afterEach(() => {
    resetLogiProxySessionForTests();
  });

  it('builds session URL from chat URL', () => {
    expect(buildLogiProxySessionUrl(PROXY_CHAT)).toBe(PROXY_SESSION);
  });

  it('acquires and caches JWT', async () => {
    const restore = mockFetch([
      {
        url: PROXY_SESSION,
        method: 'POST',
        response: () =>
          new Response(
            JSON.stringify({ ok: true, token: 'jwt-test-token', expiresAt: Date.now() + 3_600_000 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      }
    ]);
    const token = await acquireProxyJwt(PROXY_CHAT, INSTALL_ID);
    expect(token).toBe('jwt-test-token');
    const cached = await getProxyJwt(PROXY_CHAT, INSTALL_ID);
    expect(cached).toBe('jwt-test-token');
    restore();
  });
});

describe('aiTransport JWT proxy', () => {
  afterEach(() => {
    resetLogiProxySessionForTests();
    vi.restoreAllMocks();
  });

  it('uses session JWT for proxy chat', async () => {
    let chatAuth = '';
    const restore = mockFetch([
      {
        url: PROXY_SESSION,
        method: 'POST',
        response: () =>
          new Response(JSON.stringify({ token: 'jwt-chat', expiresAt: Date.now() + 3_600_000 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
      },
      {
        url: PROXY_CHAT,
        method: 'POST',
        response: () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
              model: 'test/free'
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          )
      }
    ]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).includes('/v1/chat')) {
        chatAuth = init?.headers?.Authorization || '';
      }
      return originalFetch(input, init);
    };

    const result = await createChatCompletion(
      {
        transport: 'proxy',
        proxyUrl: PROXY_CHAT,
        proxyAuthToken: null,
        models: ['test/free'],
        model: 'test/free'
      },
      { messages: [{ role: 'user', content: 'hi' }] },
      { installId: INSTALL_ID }
    );

    expect(chatAuth).toBe('Bearer jwt-chat');
    expect(result.content).toBe('OK');
    restore();
  });
});
