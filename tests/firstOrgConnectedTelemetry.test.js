import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FIRST_ORG_CONNECTED_KEY,
  maybeSendFirstOrgConnectedTelemetry
} from '../background/posthogTelemetry.js';

vi.mock('../shared/telemetryConfig.js', () => ({
  POSTHOG_API_KEY: 'phc_test',
  POSTHOG_HOST: 'https://eu.i.posthog.com',
  POSTHOG_DEBUG: false
}));

vi.mock('../shared/extensionSettings.js', () => ({
  loadExtensionSettings: vi.fn(async () => ({ telemetryEnabled: true }))
}));

vi.mock('../shared/telemetryInstallId.js', () => ({
  getOrCreateTelemetryInstallId: vi.fn(async () => 'install-id'),
  getOrCreateTelemetrySessionId: vi.fn(async () => 'session-id')
}));

vi.mock('../shared/telemetryAudienceContext.js', () => ({
  getTelemetryAudienceContext: vi.fn(async () => ({
    extension_version: '9.9.9',
    ui_language: 'es'
  })),
  buildPostHogPersonProperties: vi.fn((p) => p || {})
}));

const resolveSfUserContextForOrg = vi.fn();
vi.mock('../background/telemetryUserResolver.js', () => ({
  resolveSfUserContextForOrg: (...args) => resolveSfUserContextForOrg(...args),
  resolveTelemetryUserLabel: vi.fn(async () => ({ sfUserLabel: 'Ana López (DEV)' }))
}));

describe('maybeSendFirstOrgConnectedTelemetry', () => {
  /** @type {ReturnType<typeof vi.fn>} */
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK' }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('chrome', {
      runtime: { getManifest: () => ({ version: '9.9.9' }) },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {})
        }
      }
    });
    resolveSfUserContextForOrg.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no envía si ya se registró la primera org', async () => {
    chrome.storage.local.get.mockResolvedValue({ [FIRST_ORG_CONNECTED_KEY]: true });
    const sent = await maybeSendFirstOrgConnectedTelemetry({ id: '00Dxx' });
    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no marca enviado si no hay SF_User_Label', async () => {
    resolveSfUserContextForOrg.mockResolvedValue(null);
    const sent = await maybeSendFirstOrgConnectedTelemetry(
      { id: '00Dxx', instanceUrl: 'https://x.my.salesforce.com' }
    );
    expect(sent).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('envía first_org_connected con sf_user_label y marca una sola vez', async () => {
    resolveSfUserContextForOrg.mockResolvedValue({ sfUserLabel: 'Ana López (DEV)' });
    const sent = await maybeSendFirstOrgConnectedTelemetry({
      id: '00D000000000001',
      instanceUrl: 'https://dev.my.salesforce.com',
      displayName: 'DEV',
      isSandbox: true
    });
    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event).toBe('first_org_connected');
    expect(body.properties.sf_user_label).toBe('Ana López (DEV)');
    expect(body.properties.org_connection_source).toBe('popup');
    expect(body.properties.org_company_name).toBe('DEV');
    expect(body.properties.is_sandbox).toBe(1);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [FIRST_ORG_CONNECTED_KEY]: true
    });
  });

  it('rechaza org sin id', async () => {
    const sent = await maybeSendFirstOrgConnectedTelemetry({});
    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
