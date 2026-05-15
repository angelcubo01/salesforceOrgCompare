import { UPDATE_INFO_TTL_MS, UPDATE_INFO_URL } from './config.js';

let latestUpdateInfo = null;
let latestUpdateFetchedAt = 0;

export function parseVersionString(v) {
  if (!v || typeof v !== 'string') {
    return { major: 0, minor: 0, raw: '0.0' };
  }
  const clean = v.trim();
  const parts = clean.split('.');
  const major = Number.parseInt(parts[0], 10) || 0;
  const minor = parts.length > 1 ? Number.parseInt(parts[1], 10) || 0 : 0;
  return { major, minor, raw: clean };
}

/**
 * @param {{ bypassMemoryCache?: boolean }} [options]
 * Si bypassMemoryCache es true, vuelve a pedir version.json aunque no haya caducado el TTL
 * (p. ej. para el banner de inicio tras publicar cambios en el hosting).
 */
export async function fetchRemoteUpdateInfo(options = {}) {
  const bypass = options.bypassMemoryCache === true;
  const now = Date.now();
  if (!bypass && latestUpdateInfo && now - latestUpdateFetchedAt < UPDATE_INFO_TTL_MS) {
    return latestUpdateInfo;
  }
  if (!UPDATE_INFO_URL) {
    return null;
  }
  try {
    const res = await fetch(UPDATE_INFO_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { version: String(text || '').trim() };
    }
    latestUpdateInfo = {
      version: data.version || '',
      url: data.url || '',
      url_es: data.url_es || '',
      url_en: data.url_en || '',
      notes: data.notes || '',
      notes_es: data.notes_es || '',
      notes_en: data.notes_en || '',
      homeBanner: typeof data.homeBanner === 'string' ? data.homeBanner : '',
      homeBanner_es: typeof data.homeBanner_es === 'string' ? data.homeBanner_es : '',
      homeBanner_en: typeof data.homeBanner_en === 'string' ? data.homeBanner_en : '',
      homeDiscoverBanner: typeof data.homeDiscoverBanner === 'string' ? data.homeDiscoverBanner : '',
      homeDiscoverBanner_es:
        typeof data.homeDiscoverBanner_es === 'string' ? data.homeDiscoverBanner_es : '',
      homeDiscoverBanner_en:
        typeof data.homeDiscoverBanner_en === 'string' ? data.homeDiscoverBanner_en : ''
    };
    latestUpdateFetchedAt = now;
    return latestUpdateInfo;
  } catch {
    return null;
  }
}

/**
 * @param {{ bypassMemoryCache?: boolean }} [options]
 */
export async function getUpdateStatus(options = {}) {
  const manifest = chrome.runtime.getManifest();
  const currentVersion = manifest.version || '0.0';
  const current = parseVersionString(currentVersion);
  const remote = await fetchRemoteUpdateInfo({
    bypassMemoryCache: options.bypassMemoryCache === true
  });

  if (!remote || !remote.version) {
    return {
      ok: false,
      reason: 'NO_REMOTE_INFO',
      currentVersion
    };
  }

  const remoteParsed = parseVersionString(remote.version);

  const langFields = {
    updateUrl: remote.url || '',
    updateUrl_es: remote.url_es || '',
    updateUrl_en: remote.url_en || '',
    notes: remote.notes || '',
    notes_es: remote.notes_es || '',
    notes_en: remote.notes_en || '',
    homeBanner: remote.homeBanner || '',
    homeBanner_es: remote.homeBanner_es || '',
    homeBanner_en: remote.homeBanner_en || '',
    homeDiscoverBanner: remote.homeDiscoverBanner || '',
    homeDiscoverBanner_es: remote.homeDiscoverBanner_es || '',
    homeDiscoverBanner_en: remote.homeDiscoverBanner_en || ''
  };

  if (remoteParsed.major === current.major && remoteParsed.minor === current.minor) {
    return { ok: true, status: 'upToDate', currentVersion, remoteVersion: remote.version, ...langFields };
  }

  if (remoteParsed.major > current.major) {
    return { ok: true, status: 'majorUpdateRequired', currentVersion, remoteVersion: remote.version, ...langFields };
  }

  if (remoteParsed.major === current.major && remoteParsed.minor > current.minor) {
    return { ok: true, status: 'minorUpdateAvailable', currentVersion, remoteVersion: remote.version, ...langFields };
  }

  return { ok: true, status: 'aheadOrDev', currentVersion, remoteVersion: remote.version, ...langFields };
}
