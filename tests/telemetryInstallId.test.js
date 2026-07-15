import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TELEMETRY_INSTALL_ID_KEY,
  getOrCreateTelemetryInstallId,
  setTelemetryInstallId,
  applyTelemetryInstallIdFromBackup,
  isValidTelemetryInstallId
} from '../shared/telemetryInstallId.js';

describe('getOrCreateTelemetryInstallId', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {})
        }
      }
    });
    vi.stubGlobal('crypto', {
      randomUUID: () => 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
    });
  });

  it('persiste un UUID nuevo si no hay uno guardado', async () => {
    const id = await getOrCreateTelemetryInstallId();
    expect(id).toBe('a1b2c3d4-e5f6-4789-a012-3456789abcde');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [TELEMETRY_INSTALL_ID_KEY]: id
    });
  });

  it('reutiliza el ID guardado entre llamadas', async () => {
    chrome.storage.local.get.mockResolvedValue({
      [TELEMETRY_INSTALL_ID_KEY]: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    });
    const id = await getOrCreateTelemetryInstallId();
    expect(id).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});

describe('setTelemetryInstallId', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {})
        }
      }
    });
  });

  it('rechaza IDs inválidos', async () => {
    expect(await setTelemetryInstallId('not-a-uuid')).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('guarda un UUID válido', async () => {
    const id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    expect(await setTelemetryInstallId(id)).toBe(true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [TELEMETRY_INSTALL_ID_KEY]: id
    });
  });
});

describe('applyTelemetryInstallIdFromBackup', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {})
        }
      }
    });
  });

  it('replace siempre sobrescribe', async () => {
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    expect(await applyTelemetryInstallIdFromBackup(id, { replace: true })).toBe(true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [TELEMETRY_INSTALL_ID_KEY]: id
    });
  });

  it('merge solo si no hay ID local', async () => {
    const id = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    expect(await applyTelemetryInstallIdFromBackup(id, { replace: false })).toBe(true);
    chrome.storage.local.get.mockResolvedValue({
      [TELEMETRY_INSTALL_ID_KEY]: 'cccccccc-cccc-4ccc-8ddd-ffffffffffff'
    });
    expect(await applyTelemetryInstallIdFromBackup(id, { replace: false })).toBe(false);
  });
});

describe('isValidTelemetryInstallId', () => {
  it('acepta UUID v4', () => {
    expect(isValidTelemetryInstallId('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
  });
});
