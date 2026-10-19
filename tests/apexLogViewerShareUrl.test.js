import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { bgMock } = vi.hoisted(() => ({ bgMock: vi.fn() }));

vi.mock('../code/core/bridge.js', () => ({ bg: bgMock }));

let originalWindow;
let originalGetUrl;

describe('URL compartible del Apex Log Viewer', () => {
  beforeEach(() => {
    bgMock.mockReset();
    originalWindow = globalThis.window;
    originalGetUrl = chrome.runtime.getURL;
    globalThis.window = { open: vi.fn() };
    chrome.runtime.getURL = (path) => `chrome-extension://test/${path}`;
  });

  afterEach(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    chrome.runtime.getURL = originalGetUrl;
  });

  it('incluye entorno, log y línea junto al transporte temporal', async () => {
    bgMock.mockResolvedValue({ ok: true, id: 'viewer-id' });
    const { openApexLogViewerWithPayload } = await import('../code/lib/openApexLogViewer.js');

    await openApexLogViewerWithPayload('Log Apex', 'contenido', {
      orgId: '00Dxx0000000001', logId: '07Lxx0000000001', initialLine: 12
    });

    expect(window.open).toHaveBeenCalledWith(
      'chrome-extension://test/code/apex-log-viewer.html?staged=viewer-id&orgId=00Dxx0000000001&logId=07Lxx0000000001&line=12',
      '_blank'
    );
  });
});
