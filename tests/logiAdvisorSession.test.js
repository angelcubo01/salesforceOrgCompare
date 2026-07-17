import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLogiSessionKey,
  clearLogiSession,
  LOGI_SESSION_STORAGE_KEY,
  readLogiSession,
  resetLogiSessionsForTests,
  writeLogiSession
} from '../shared/logi/logiAdvisorSession.js';

const storage = /** @type {Record<string, unknown>} */ ({});

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key) => {
        const k = Array.isArray(key) ? key[0] : key;
        return { [k]: storage[k] };
      }),
      set: vi.fn(async (obj) => {
        Object.assign(storage, obj);
      }),
      remove: vi.fn(async (key) => {
        const k = Array.isArray(key) ? key[0] : key;
        delete storage[k];
      })
    }
  }
});

afterEach(async () => {
  await resetLogiSessionsForTests();
  for (const k of Object.keys(storage)) delete storage[k];
});

describe('buildLogiSessionKey', () => {
  it('uses orgId and logId when present', () => {
    expect(buildLogiSessionKey({ orgId: '00D', logId: '07L' })).toBe('00D::07L');
  });

  it('falls back to local hash for title/instance without logId', () => {
    const a = buildLogiSessionKey({ orgId: '00D', title: 'My Log', instanceUrl: 'https://x.salesforce.com' });
    const b = buildLogiSessionKey({ orgId: '00D', title: 'My Log', instanceUrl: 'https://x.salesforce.com' });
    expect(a).toMatch(/^00D::local::/);
    expect(a).toBe(b);
  });

  it('uses anonymous key when nothing else', () => {
    expect(buildLogiSessionKey({})).toBe('_::__anonymous__');
  });
});

describe('writeLogiSession / readLogiSession', () => {
  it('persists and normalizes messages with lineRef and quoteRef', async () => {
    const key = 'org::log1';
    await writeLogiSession(key, {
      messages: [
        {
          role: 'user',
          content: 'hi',
          lineRef: { startLine: 5, endLine: 3, logId: 'log' },
          quoteRef: { content: 'quote text' }
        }
      ],
      iteration: 2,
      isNewChat: false,
      updatedAt: Date.now(),
      pending: true,
      thinkingStatus: 'thinking',
      queuedCount: 1
    });

    const session = await readLogiSession(key);
    expect(session?.messages[0].lineRef).toEqual({ startLine: 3, endLine: 5, logId: 'log' });
    expect(session?.messages[0].quoteRef).toEqual({ content: 'quote text' });
    expect(session?.iteration).toBe(2);
    expect(session?.pending).toBe(true);
    expect(session?.thinkingStatus).toBe('thinking');
    expect(session?.queuedCount).toBe(1);
  });

  it('prunes to max 40 sessions LRU', async () => {
    for (let i = 0; i < 45; i += 1) {
      await writeLogiSession(`k${i}`, {
        messages: [],
        iteration: 0,
        isNewChat: true,
        updatedAt: i * 1000
      });
    }
    const bag = storage[LOGI_SESSION_STORAGE_KEY];
    expect(Object.keys(bag).length).toBe(40);
    expect(bag.k0).toBeUndefined();
    expect(bag.k44).toBeDefined();
  });

  it('clearLogiSession removes one entry', async () => {
    await writeLogiSession('a', { messages: [], iteration: 0, isNewChat: true, updatedAt: 1 });
    await writeLogiSession('b', { messages: [], iteration: 0, isNewChat: true, updatedAt: 2 });
    await clearLogiSession('a');
    expect(await readLogiSession('a')).toBeNull();
    expect(await readLogiSession('b')).toBeTruthy();
  });
});
