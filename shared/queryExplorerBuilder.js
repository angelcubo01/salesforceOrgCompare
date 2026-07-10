/**
 * Builder SOQL básico estilo Workbench.
 */

/**
 * @param {string} objectApiName
 * @param {string[]} fields
 * @param {string} [whereClause]
 * @param {number | string} [limit]
 */
export function buildSoqlFromBuilder(objectApiName, fields, whereClause = '', limit = '') {
  const obj = String(objectApiName || '').trim();
  if (!obj) return '';
  const fieldList = (fields || []).map((f) => String(f || '').trim()).filter(Boolean);
  const selectFields = fieldList.length ? fieldList.join(', ') : 'Id';
  let soql = `SELECT ${selectFields} FROM ${obj}`;
  const where = String(whereClause || '').trim();
  if (where) {
    const w = where.toLowerCase().startsWith('where') ? where.slice(5).trim() : where;
    if (w) soql += ` WHERE ${w}`;
  }
  const lim = String(limit ?? '').trim();
  if (lim) {
    const n = Number(lim);
    if (Number.isFinite(n) && n > 0) soql += ` LIMIT ${Math.floor(n)}`;
  }
  return soql;
}

/**
 * @param {string} text
 */
function toBase64Url(text) {
  const s = String(text || '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf8').toString('base64url');
  }
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * @param {string} encoded
 */
function fromBase64Url(encoded) {
  const enc = String(encoded || '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(enc, 'base64url').toString('utf8');
  }
  const pad = '='.repeat((4 - (enc.length % 4)) % 4);
  const b64 = enc.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * @param {string} query
 * @param {{ api?: string, lang?: string }} [meta]
 */
export function encodeQueryExplorerDeepLink(query, meta = {}) {
  const q = String(query || '').trim();
  if (!q) return '';
  const params = new URLSearchParams();
  params.set('nav', 'development');
  params.set('op', 'QueryExplorer');
  params.set('qe', toBase64Url(q));
  if (meta.api) params.set('qeApi', String(meta.api));
  if (meta.lang) params.set('qeLang', String(meta.lang));
  return `?${params.toString()}`;
}

/**
 * @param {string | URLSearchParams} search
 */
export function parseQueryExplorerDeepLink(search) {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(String(search || '').replace(/^\?/, '').trim());
  const encoded = params.get('qe');
  if (!encoded) return null;
  try {
    return {
      query: fromBase64Url(encoded),
      api: params.get('qeApi') || 'rest',
      lang: params.get('qeLang') || 'soql'
    };
  } catch {
    return null;
  }
}
