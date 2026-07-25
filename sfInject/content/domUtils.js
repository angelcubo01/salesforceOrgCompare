/**
 * Utilidades DOM para content scripts (Shadow DOM, iframes).
 */

/**
 * querySelectorAll + shadow roots abiertos.
 * Antes recorría cada hijo llamando querySelectorAll → O(n²) en tablas grandes.
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {Element[]}
 */
export function queryAllDeep(root, selector) {
  /** @type {Element[]} */
  const out = [];
  /** @type {Set<Element>} */
  const seen = new Set();

  /**
   * @param {ParentNode | null | undefined} node
   */
  function walk(node) {
    if (!node || typeof node.querySelectorAll !== 'function') return;

    try {
      for (const el of node.querySelectorAll(selector)) {
        if (seen.has(el)) continue;
        seen.add(el);
        out.push(el);
      }
    } catch {
      /* ignore */
    }

    // Un solo pase para localizar shadow roots (no re-query por cada hijo).
    try {
      if (node instanceof Element && node.shadowRoot) walk(node.shadowRoot);
      for (const el of node.querySelectorAll('*')) {
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    } catch {
      /* ignore */
    }
  }

  walk(root);
  return out;
}

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {Element | null}
 */
export function queryDeep(root, selector) {
  const all = queryAllDeep(root, selector);
  return all[0] || null;
}
