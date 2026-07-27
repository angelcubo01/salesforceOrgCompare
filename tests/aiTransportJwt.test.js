import { describe, expect, it, vi, afterEach } from 'vitest';
import { mockFetch } from './setup.js';
import {
  acquireProxyJwt,
  getProxyJwt,
  resetLogiProxySessionForTests,
  buildLogiProxySessionUrl,
  LOGI_REMOTE_LEASE_MS
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
            JSON.stringify({
              ok: true,
              token: 'jwt-test-token',
              expiresAt: Date.now() + LOGI_REMOTE_LEASE_MS
            }),
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

  it('singleflight coalesces concurrent acquireProxyJwt', async () => {
    let posts = 0;
    const restore = mockFetch([
      {
        url: PROXY_SESSION,
        method: 'POST',
        response: async () => {
          posts += 1;
          await new Promise((r) => setTimeout(r, 30));
          return new Response(
            JSON.stringify({
              ok: true,
              token: 'jwt-once',
              expiresAt: Date.now() + LOGI_REMOTE_LEASE_MS
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    ]);
    const [a, b] = await Promise.all([
      acquireProxyJwt(PROXY_CHAT, INSTALL_ID),
      acquireProxyJwt(PROXY_CHAT, INSTALL_ID)
    ]);
    expect(a).toBe('jwt-once');
    expect(b).toBe('jwt-once');
    expect(posts).toBe(1);
    restore();
  });

  it('backs off locally after SESSION_RATE_LIMIT 429', async () => {
    let posts = 0;
    const restore = mockFetch([
      {
        url: PROXY_SESSION,
        method: 'POST',
        response: () => {
          posts += 1;
          return new Response(
            JSON.stringify({ error: 'Session rate limit exceeded', code: 'SESSION_RATE_LIMIT' }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    ]);
    await expect(acquireProxyJwt(PROXY_CHAT, INSTALL_ID)).rejects.toThrow(/429/);
    await expect(acquireProxyJwt(PROXY_CHAT, INSTALL_ID)).rejects.toThrow(/backoff|429/);
    expect(posts).toBe(1);
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
          new Response(
            JSON.stringify({ token: 'jwt-chat', expiresAt: Date.now() + LOGI_REMOTE_LEASE_MS }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          )
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
