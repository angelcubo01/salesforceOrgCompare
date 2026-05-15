/**
 * Parseo de cuerpos de error REST/Tooling de Salesforce (anti-hijacking, mensajes anidados).
 */

export function normalizeSalesforceRestErrorBodyText(raw) {
  let t = String(raw || '').trim();
  if (!t) return '';
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1).trim();
  if (t.startsWith(")]}'")) {
    const nl = t.indexOf('\n');
    t = (nl >= 0 ? t.slice(nl + 1) : t.slice(4)).trim();
  }
  if (t.startsWith('while(1);')) t = t.slice('while(1);'.length).trim();
  return t;
}

/** @param {unknown} parsed @param {string[]} msgs */
export function collectSalesforceRestErrorMessages(parsed, msgs) {
  const pushMsg = (m) => {
    if (m == null) return;
    const s = String(m).trim();
    if (s) msgs.push(s);
  };

  function walk(node) {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== 'object') return;
    const o = /** @type {Record<string, unknown>} */ (node);
    const top =
      o.message != null
        ? o.message
        : o.Message != null
          ? o.Message
          : o.error && typeof o.error === 'object' && /** @type {Record<string, unknown>} */ (o.error).message != null
            ? /** @type {Record<string, unknown>} */ (o.error).message
            : null;
    if (top != null) pushMsg(top);
    if (Array.isArray(o.errors)) {
      for (const item of o.errors) walk(item);
    }
  }

  walk(parsed);
}

/** @param {string} t @param {string[]} msgs */
export function salesforceRestErrorMessagesRegexFallback(t, msgs) {
  const re = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    try {
      msgs.push(JSON.parse(`"${m[1]}"`));
    } catch {
      msgs.push(m[1]);
    }
  }
}

export function salesforceRestErrorMessagesOnly(text) {
  const original = String(text || '').trim();
  if (!original) return '';
  const t = normalizeSalesforceRestErrorBodyText(original);

  /** @type {string[]} */
  const msgs = [];

  function parsePayload(s) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  let parsed = parsePayload(t);
  if (typeof parsed === 'string') {
    const inner = parsed.trim();
    if (inner.startsWith('[') || inner.startsWith('{')) {
      const again = parsePayload(inner);
      if (again != null) parsed = again;
    }
  }

  if (parsed != null) {
    collectSalesforceRestErrorMessages(parsed, msgs);
    if (msgs.length) return msgs.join('\n');
  }

  salesforceRestErrorMessagesRegexFallback(t, msgs);
  if (msgs.length) return msgs.join('\n');

  return t || original;
}

export function salesforceRestErrorStructuredFromText(raw) {
  const normalized = normalizeSalesforceRestErrorBodyText(String(raw || ''));
  /** @type {{ message: string, errorCode: string }} */
  const out = { message: '', errorCode: '' };
  if (!normalized) return out;

  function fromParsed(parsed) {
    /** @type {{ message: string, code: string }[]} */
    const items = [];
    const pushItem = (msg, code) => {
      const m = String(msg || '').trim();
      if (!m) return;
      items.push({ message: m, code: code != null ? String(code) : '' });
    };
    if (Array.isArray(parsed)) {
      for (const it of parsed) {
        if (it && typeof it === 'object') {
          const o = /** @type {Record<string, unknown>} */ (it);
          if (o.message != null) pushItem(o.message, o.errorCode ?? o.ErrorCode);
        }
      }
    } else if (parsed && typeof parsed === 'object') {
      const o = /** @type {Record<string, unknown>} */ (parsed);
      if (o.message != null) pushItem(o.message, o.errorCode ?? o.ErrorCode);
      const errors = o.errors;
      if (Array.isArray(errors)) {
        for (const it of errors) {
          if (it && typeof it === 'object') {
            const eo = /** @type {Record<string, unknown>} */ (it);
            if (eo.message != null) pushItem(eo.message, eo.errorCode ?? eo.ErrorCode);
          }
        }
      }
    }
    if (!items.length) return;
    out.message = items.map((i) => i.message).join('\n\n');
    out.errorCode = items[0].code || '';
  }

  let parsed = null;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    out.message = normalized;
    return out;
  }
  fromParsed(parsed);
  if (!out.message) out.message = normalized;
  return out;
}
