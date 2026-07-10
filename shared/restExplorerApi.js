/** Métodos REST que modifican datos en la org. */
export const REST_WRITE_METHODS = Object.freeze(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * @param {string} method
 */
export function isRestWriteMethod(method) {
  return REST_WRITE_METHODS.includes(String(method || 'GET').toUpperCase());
}

/**
 * @param {string} raw
 * @returns {{ ok: true, headers: Record<string, string> } | { ok: false, error: string }}
 */
export function parseRestExplorerHeaders(raw) {
  const text = String(raw || '').trim();
  if (!text) return { ok: true, headers: {} };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Headers must be a JSON object' };
    }
    /** @type {Record<string, string>} */
    const headers = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value == null) continue;
      headers[String(key)] = String(value);
    }
    return { ok: true, headers };
  } catch {
    return { ok: false, error: 'Invalid JSON in headers' };
  }
}

/**
 * Aplana JSON en filas para tabla árbol (path, valor, tipo).
 * @param {unknown} value
 * @param {string} [path]
 * @returns {Array<{ path: string, value: string, type: string, depth: number }>}
 */
export function flattenJsonForTree(value, path = '') {
  /** @type {Array<{ path: string, value: string, type: string, depth: number }>} */
  const rows = [];
  const depth = path ? path.split('.').length - (path.startsWith('[') ? 0 : 1) : 0;

  if (value === null || value === undefined) {
    rows.push({ path: path || '(root)', value: String(value), type: 'null', depth: Math.max(0, depth) });
    return rows;
  }

  if (Array.isArray(value)) {
    if (!path) rows.push({ path: '(root)', value: `[${value.length}]`, type: 'array', depth: 0 });
    value.forEach((item, i) => {
      const childPath = path ? `${path}[${i}]` : `[${i}]`;
      rows.push(...flattenJsonForTree(item, childPath));
    });
    return rows;
  }

  if (typeof value === 'object') {
    if (!path) rows.push({ path: '(root)', value: '{…}', type: 'object', depth: 0 });
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (child !== null && typeof child === 'object') {
        rows.push(...flattenJsonForTree(child, childPath));
      } else {
        const type = child === null ? 'null' : typeof child;
        rows.push({
          path: childPath,
          value: type === 'string' ? String(child) : JSON.stringify(child),
          type,
          depth: childPath.split(/\.|\[/).length - 1
        });
      }
    }
    return rows;
  }

  rows.push({
    path: path || '(root)',
    value: typeof value === 'string' ? value : JSON.stringify(value),
    type: typeof value,
    depth: Math.max(0, depth)
  });
  return rows;
}

/** @deprecated Alias for {@link flattenJsonForTree}. */
export const buildJsonTreeNodes = flattenJsonForTree;

/**
 * Normaliza URI REST (relativa o absoluta contra instanceUrl).
 * @param {string} raw
 * @param {string} [instanceUrl]
 * @param {string} [apiVersion]
 */
export function normalizeRestExplorerPath(raw, instanceUrl = '', apiVersion = '59.0') {
  const text = String(raw || '').trim();
  if (!text) return '/services/data/v' + apiVersion + '/';
  if (text.startsWith('http://') || text.startsWith('https://')) {
    try {
      const u = new URL(text);
      const base = String(instanceUrl || '').replace(/\/$/, '');
      if (base && text.startsWith(base)) return u.pathname + u.search;
      return u.pathname + u.search;
    } catch {
      return text;
    }
  }
  return text.startsWith('/') ? text : `/${text}`;
}
