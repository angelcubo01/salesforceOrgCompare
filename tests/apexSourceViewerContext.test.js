import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { bgMock } = vi.hoisted(() => ({ bgMock: vi.fn() }));

vi.mock('../code/core/bridge.js', () => ({ bg: bgMock }));

let originalWindow;
let originalGetUrl;

describe('openApexSourceViewerWithPayload', () => {
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

  it('conserva el contexto de organización para resolver Ctrl/Cmd+clic en el visor', async () => {
    bgMock.mockResolvedValue({ ok: true, id: 'viewer-id' });
    const { openApexSourceViewerWithPayload } = await import('../code/lib/openApexSourceViewer.js');

    await openApexSourceViewerWithPayload('Servicio.cls', 'public class Servicio {}', {
      orgId: '00Dxx0000000001', orgLabel: 'Sandbox Contact Center', instanceUrl: 'https://example.my.salesforce.com'
    });

    expect(bgMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'apexViewer:stage',
      orgId: '00Dxx0000000001',
      orgLabel: 'Sandbox Contact Center',
      instanceUrl: 'https://example.my.salesforce.com'
    }));
    expect(window.open).toHaveBeenCalledWith(
      'chrome-extension://test/code/apex-source-viewer.html?staged=viewer-id',
      '_blank'
    );
  });
});
