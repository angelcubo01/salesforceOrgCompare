import { afterEach, describe, expect, it, vi } from 'vitest';

function response() {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    text: async () => '[]'
  };
}

describe('concurrencia REST de Salesforce', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('limita por org sin introducir pausas temporales artificiales', async () => {
    const pending = [];
    const fetchMock = vi.fn(() => new Promise((resolve) => pending.push(resolve)));
    vi.stubGlobal('fetch', fetchMock);
    const { restRequestWithSid } = await import('../shared/salesforceApi.js');

    const requests = Array.from({ length: 10 }, (_, index) => restRequestWithSid(
      'https://example.my.salesforce.com',
      'session',
      'GET',
      `/services/data/v63.0/query?q=${index}`
    ));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(pending).toHaveLength(6);

    pending.splice(0, 4).forEach((resolve) => resolve(response()));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    pending.splice(0).forEach((resolve) => resolve(response()));

    const results = await Promise.all(requests);
    expect(results).toHaveLength(10);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('no bloquea una segunda org cuando la primera ocupa sus seis slots', async () => {
    const pending = [];
    const fetchMock = vi.fn((url) => new Promise((resolve) => pending.push({ url, resolve })));
    vi.stubGlobal('fetch', fetchMock);
    const { restRequestWithSid } = await import('../shared/salesforceApi.js');

    const orgA = Array.from({ length: 7 }, (_, index) => restRequestWithSid(
      'https://a.my.salesforce.com', 'sid-a', 'GET', `/services/data/v63.0/query?q=${index}`
    ));
    const orgB = restRequestWithSid(
      'https://b.my.salesforce.com', 'sid-b', 'GET', '/services/data/v63.0/limits'
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('https://b.my.salesforce.com/'))).toBe(true);

    pending.splice(0).forEach(({ resolve }) => resolve(response()));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
    pending.splice(0).forEach(({ resolve }) => resolve(response()));
    await Promise.all([...orgA, orgB]);
  });
});
