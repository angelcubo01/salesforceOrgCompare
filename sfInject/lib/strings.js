/** Cadenas mínimas para content scripts (ES/EN). */

/** @type {Record<'es' | 'en', Record<string, string>>} */
const STRINGS = {
  es: {
    'sfInject.debugLogOpenViewer.button': 'Abrir en SFOC',
    'sfInject.debugLogOpenViewer.ariaOpen': 'Abrir log de depuración en Salesforce Org Compare',
    'sfInject.debugLogOpenViewer.errorNoSession': 'Sesión no disponible. Inicia sesión en Salesforce.',
    'sfInject.debugLogOpenViewer.errorOpen': 'No se pudo abrir el log en SFOC.',
    'sfInject.debugLogOpenViewer.errorOrgNotSaved': 'Entorno no guardado en SFOC.',
    'sfInject.userTraceFlags.filterLabel':
      'Solo trazas activas o caducadas hace menos de 30 min',
    'sfInject.userTraceFlags.badgeExpired': 'Caducada',
    'sfInject.userTraceFlags.extend': 'Ampliar 15 min',
    'sfInject.userTraceFlags.reactivate': 'Reactivar 15 min',
    'sfInject.userTraceFlags.ariaExtend': 'Ampliar la traza 15 minutos',
    'sfInject.userTraceFlags.ariaReactivate': 'Reactivar la traza 15 minutos',
    'sfInject.userTraceFlags.extending': 'Ampliando traza…',
    'sfInject.userTraceFlags.extendOk': 'Traza ampliada 15 minutos.',
    'sfInject.userTraceFlags.reactivateOk': 'Traza reactivada 15 minutos.',
    'sfInject.userTraceFlags.extendError': 'No se pudo ampliar la traza.',
    'sfInject.userTraceFlags.extendMaxWindow': 'La traza ya alcanza el máximo de 24 horas.',
    'sfInject.userTraceFlags.errorNoSession': 'Sesión no disponible. Inicia sesión en Salesforce.',
    'sfInject.userTraceFlags.errorOrgNotSaved': 'Entorno no guardado en SFOC.',
    'sfInject.userTraceFlags.emptyFiltered': 'No hay trazas que cumplan el filtro.'
  },
  en: {
    'sfInject.debugLogOpenViewer.button': 'Open in SFOC',
    'sfInject.debugLogOpenViewer.ariaOpen': 'Open debug log in Salesforce Org Compare',
    'sfInject.debugLogOpenViewer.errorNoSession': 'Session unavailable. Sign in to Salesforce.',
    'sfInject.debugLogOpenViewer.errorOpen': 'Could not open log in SFOC.',
    'sfInject.debugLogOpenViewer.errorOrgNotSaved': 'Org not saved in SFOC.',
    'sfInject.userTraceFlags.filterLabel': 'Only active or expired within the last 30 min',
    'sfInject.userTraceFlags.badgeExpired': 'Expired',
    'sfInject.userTraceFlags.extend': 'Extend 15 min',
    'sfInject.userTraceFlags.reactivate': 'Reactivate 15 min',
    'sfInject.userTraceFlags.ariaExtend': 'Extend the trace by 15 minutes',
    'sfInject.userTraceFlags.ariaReactivate': 'Reactivate the trace for 15 minutes',
    'sfInject.userTraceFlags.extending': 'Extending trace…',
    'sfInject.userTraceFlags.extendOk': 'Trace extended by 15 minutes.',
    'sfInject.userTraceFlags.reactivateOk': 'Trace reactivated for 15 minutes.',
    'sfInject.userTraceFlags.extendError': 'Could not extend the trace.',
    'sfInject.userTraceFlags.extendMaxWindow': 'The trace already reaches the 24-hour maximum.',
    'sfInject.userTraceFlags.errorNoSession': 'Session unavailable. Sign in to Salesforce.',
    'sfInject.userTraceFlags.errorOrgNotSaved': 'Org not saved in SFOC.',
    'sfInject.userTraceFlags.emptyFiltered': 'No traces match the current filter.'
  }
};

/** @param {'es' | 'en' | string | undefined} lang @param {string} key */
export function sfInjectT(lang, key) {
  const l = lang === 'en' ? 'en' : 'es';
  return STRINGS[l][key] || STRINGS.es[key] || key;
}
