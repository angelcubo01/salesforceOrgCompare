import { normalizeLogiLanguage } from './logiLanguages.js';

/**
 * @param {unknown} text
 * @returns {string | null}
 */
export function detectTextLanguage(text) {
  const s = String(text || '').trim();
  if (s.length < 8) return null;

  if (/[\u0400-\u04FF]/.test(s)) return 'ru';
  if (/[\u4e00-\u9fff]/.test(s)) return 'zh';
  if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(s)) return 'ja';
  if (/[\uac00-\ud7af]/.test(s)) return 'ko';
  if (/[\u0600-\u06FF]/.test(s)) return 'ar';
  if (/[\u0900-\u097F]/.test(s)) return 'hi';

  const lower = s.toLowerCase();
  const score = (re) => (lower.match(re) || []).length;

  const ranked = [
    { code: 'es', n: score(/\b(el|la|los|las|del|que|este|esta|error|analiza|resumen|por favor|ejecución)\b/g) },
    { code: 'en', n: score(/\b(the|and|this|that|error|analyze|summary|please|execution|what|how)\b/g) },
    { code: 'fr', n: score(/\b(le|la|les|des|que|ce|cette|erreur|analyse|résumé|merci)\b/g) },
    { code: 'de', n: score(/\b(der|die|das|und|dass|fehler|analyse|bitte|zusammenfassung)\b/g) },
    { code: 'pt', n: score(/\b(o|a|os|as|que|este|erro|análise|resumo|por favor)\b/g) },
    { code: 'it', n: score(/\b(il|la|lo|gli|che|questo|errore|analisi|riepilogo|per favore)\b/g) },
    { code: 'nl', n: score(/\b(de|het|een|en|dat|deze|fout|analyse|samenvatting|alstublieft)\b/g) },
    { code: 'pl', n: score(/\b(i|w|na|że|ten|ta|błąd|analiza|podsumowanie|proszę)\b/g) },
    { code: 'tr', n: score(/\b(bir|ve|bu|hata|analiz|özet|lütfen)\b/g) }
  ].sort((a, b) => b.n - a.n);

  if (ranked[0].n < 2) return null;
  if (ranked.length > 1 && ranked[0].n === ranked[1].n) return null;
  return ranked[0].code;
}

/**
 * @param {Array<{ role?: string, content?: string, displayText?: string }> | undefined} messages
 * @returns {string | null}
 */
export function inferLangFromPriorMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) return null;

  /** @type {string[]} */
  const chunks = [];
  for (const m of messages) {
    if (!m) continue;
    if (m.role === 'user' || m.role === 'assistant') {
      const content = String(m.content || '').trim();
      if (content.length >= 12) chunks.push(content);
      else if (m.role === 'user') {
        const display = String(m.displayText || '').trim();
        if (display.length >= 8) chunks.push(display);
      }
    }
  }

  if (!chunks.length) return null;
  return detectTextLanguage(chunks.join('\n'));
}

/**
 * Idioma efectivo para prompts de Logi: ajustes del usuario, salvo conversación previa.
 * @param {{ settingsLang?: unknown, messages?: Array<{ role?: string, content?: string, displayText?: string }> }} [opts]
 * @returns {string}
 */
export function resolveLogiPromptLang(opts = {}) {
  const settingsLang = normalizeLogiLanguage(opts.settingsLang);
  const prior = inferLangFromPriorMessages(opts.messages);
  return prior || settingsLang;
}
