/**
 * Extrae JSON de mensajes USER_DEBUG de Salesforce.
 * @param {string} message
 * @returns {{ json: string | null, prefix: string, methodTag: string | null }}
 */
export function parseDebugMessage(message) {
  const raw = String(message || '');
  const methodM = raw.match(/\(([^)]+)\)/);
  const methodTag = methodM ? methodM[1] : null;

  const jsonMarkers = [
    /Response:\s*(\{[\s\S]*)$/i,
    /mapAccountFields:\s*(\{[\s\S]*)$/i,
    /Body:\s*(\{[\s\S]*)$/i,
    /(\{[\s\S]*\})\s*$/
  ];

  for (const re of jsonMarkers) {
    const m = raw.match(re);
    if (!m) continue;
    const candidate = m[1].trim();
    try {
      JSON.parse(candidate);
      const prefix = raw.slice(0, m.index).trim();
      return { json: candidate, prefix, methodTag };
    } catch {
      /* try next */
    }
  }

  return { json: null, prefix: raw, methodTag };
}

/**
 * @param {string} json
 * @returns {string}
 */
export function formatJsonPretty(json) {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}
