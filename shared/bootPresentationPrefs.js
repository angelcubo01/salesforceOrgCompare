/** Preferencias mínimas para pintar correctamente las pantallas de arranque. */
export const BOOT_PRESENTATION_PREFS_KEY = 'sfoc_boot_presentation';

function getStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readBootPresentationPrefs() {
  try {
    const raw = getStorage()?.getItem(BOOT_PRESENTATION_PREFS_KEY);
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/** @param {{ lang?: string, theme?: string }} partial */
export function saveBootPresentationPrefs(partial) {
  const storage = getStorage();
  if (!storage) return;
  const current = readBootPresentationPrefs();
  const next = { ...current };
  if (partial?.lang === 'en' || partial?.lang === 'es') next.lang = partial.lang;
  if (partial?.theme === 'light' || partial?.theme === 'dark') next.theme = partial.theme;
  try {
    storage.setItem(BOOT_PRESENTATION_PREFS_KEY, JSON.stringify(next));
  } catch {
    // Un fallo de almacenamiento no debe impedir abrir la aplicación.
  }
}
