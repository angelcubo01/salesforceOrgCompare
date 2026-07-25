/** Cadenas mínimas para content scripts (ES/EN). */

/** @type {Record<'es' | 'en', Record<string, string>>} */
const STRINGS = {
  es: {
    'sfInject.debugLogOpenViewer.button': 'Abrir en SFOC',
    'sfInject.debugLogOpenViewer.ariaOpen': 'Abrir log de depuración en Salesforce Org Compare',
    'sfInject.debugLogOpenViewer.errorNoSession': 'Sesión no disponible. Inicia sesión en Salesforce.',
    'sfInject.debugLogOpenViewer.errorOpen': 'No se pudo abrir el log en SFOC.',
    'sfInject.debugLogOpenViewer.errorOrgNotSaved': 'Entorno no guardado en SFOC.'
  },
  en: {
    'sfInject.debugLogOpenViewer.button': 'Open in SFOC',
    'sfInject.debugLogOpenViewer.ariaOpen': 'Open debug log in Salesforce Org Compare',
    'sfInject.debugLogOpenViewer.errorNoSession': 'Session unavailable. Sign in to Salesforce.',
    'sfInject.debugLogOpenViewer.errorOpen': 'Could not open log in SFOC.',
    'sfInject.debugLogOpenViewer.errorOrgNotSaved': 'Org not saved in SFOC.'
  }
};

/** @param {'es' | 'en' | string | undefined} lang @param {string} key */
export function sfInjectT(lang, key) {
  const l = lang === 'en' ? 'en' : 'es';
  return STRINGS[l][key] || STRINGS.es[key] || key;
}
