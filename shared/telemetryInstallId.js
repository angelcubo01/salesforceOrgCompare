/** @type {string} */
export const TELEMETRY_INSTALL_ID_KEY = 'sfoc_telemetry_install_id';

const INSTALL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newInstallId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * ID pseudónimo por instalación/navegador (no PII). Persistido en chrome.storage.local.
 * @returns {Promise<string>}
 */
export async function getOrCreateTelemetryInstallId() {
  try {
    const r = await chrome.storage.local.get(TELEMETRY_INSTALL_ID_KEY);
    const existing = r[TELEMETRY_INSTALL_ID_KEY];
    if (typeof existing === 'string' && INSTALL_ID_RE.test(existing)) {
      return existing;
    }
  } catch {
    // fall through to create
  }
  const id = newInstallId();
  try {
    await chrome.storage.local.set({ [TELEMETRY_INSTALL_ID_KEY]: id });
  } catch {
    // still return ephemeral id for this session
  }
  return id;
}

/** Crea el ID en install/arranque del SW para poder correlacionar sesiones desde el primer evento. */
export function ensureTelemetryInstallId() {
  void getOrCreateTelemetryInstallId();
}

const SESSION_KEY = 'sfoc_telemetry_ga4_session';

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * session_id numérico para GA4 MP (rotación diaria, estilo sesión web).
 * @returns {Promise<string>}
 */
export async function getOrCreateTelemetrySessionId() {
  const day = todayUtc();
  try {
    const r = await chrome.storage.local.get(SESSION_KEY);
    const row = r[SESSION_KEY];
    if (row && typeof row === 'object' && row.day === day && row.id) {
      return String(row.id);
    }
  } catch {
    /* ignore */
  }
  const id = String(Math.floor(Date.now() / 1000));
  try {
    await chrome.storage.local.set({ [SESSION_KEY]: { day, id } });
  } catch {
    /* ignore */
  }
  return id;
}
