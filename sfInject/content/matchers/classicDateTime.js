/**
 * Fechas renderizadas por Setup Classic ("16/7/2026, 16:39" / "7/16/2026, 4:39 PM").
 * Se interpretan en hora local, igual que las pinta la página.
 */

const DATE_TIME_RE =
  /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?/i;

const DATE_TIME_RE_24H =
  /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/;

/**
 * Detecta si la página usa día/mes o mes/día a partir de muestras de la tabla.
 * @param {Iterable<string>} samples
 * @returns {'dmy' | 'mdy'}
 */
export function detectClassicDateOrder(samples) {
  for (const text of samples) {
    const raw = String(text || '').trim();
    const m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) return 'dmy';
    if (b > 12 && a <= 12) return 'mdy';
  }
  // Orgs EU/ES (CaixaBank): día primero.
  return 'dmy';
}

/**
 * @param {number} a
 * @param {number} b
 * @param {'dmy' | 'mdy'} order
 * @returns {{ day: number, month: number }}
 */
function resolveDayMonth(a, b, order) {
  if (a > 12 && b <= 12) return { day: a, month: b };
  if (b > 12 && a <= 12) return { day: b, month: a };
  return order === 'mdy' ? { day: b, month: a } : { day: a, month: b };
}

/**
 * @param {string} text
 * @param {'dmy' | 'mdy' | 'es' | 'en' | string} [orderOrLang]
 * @returns {number} epoch ms o NaN
 */
export function parseClassicDateTimeMs(text, orderOrLang = 'dmy') {
  const raw = String(text || '').trim();
  if (!raw) return NaN;

  const order =
    orderOrLang === 'mdy' || orderOrLang === 'en'
      ? 'mdy'
      : orderOrLang === 'dmy' || orderOrLang === 'es'
        ? 'dmy'
        : 'dmy';

  const ampm = raw.match(DATE_TIME_RE);
  const m = ampm || raw.match(DATE_TIME_RE_24H);
  if (!m) return NaN;

  const { day, month } = resolveDayMonth(Number(m[1]), Number(m[2]), order);
  let year = Number(m[3]);
  if (year < 100) year += 2000;

  let hours = Number(m[4]);
  const minutes = Number(m[5]);
  const seconds = m[6] ? Number(m[6]) : 0;

  if (ampm) {
    const meridiem = String(m[7] || '').toLowerCase();
    if (meridiem === 'p' && hours < 12) hours += 12;
    if (meridiem === 'a' && hours === 12) hours = 0;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59) return NaN;

  const ms = new Date(year, month - 1, day, hours, minutes, seconds, 0).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * @param {string} iso
 * @param {'dmy' | 'mdy' | 'es' | 'en' | string} [orderOrLang]
 * @returns {string}
 */
export function formatClassicDateTime(iso, orderOrLang = 'dmy') {
  const ms = Date.parse(String(iso || ''));
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const mdy = orderOrLang === 'mdy' || orderOrLang === 'en';
  if (mdy) {
    return `${month}/${day}/${year}, ${hh}:${mm}`;
  }
  return `${day}/${month}/${year}, ${hh}:${mm}`;
}
