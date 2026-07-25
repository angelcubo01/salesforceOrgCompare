/**
 * Utilidades DOM genéricas para inyección SFOC en páginas Salesforce.
 */

/**
 * @param {ParentNode} root
 * @param {string} integrationId
 * @param {string} [subKey]
 */
export function hasSfocInject(root, integrationId, subKey = '') {
  const sel = subKey
    ? `[data-sfoc-inject="${integrationId}"][data-sfoc-key="${subKey}"]`
    : `[data-sfoc-inject="${integrationId}"]`;
  return !!root.querySelector(sel);
}

/**
 * @param {ParentNode} root
 * @param {string} integrationId
 */
export function countSfocInject(root, integrationId) {
  return root.querySelectorAll(`[data-sfoc-inject="${integrationId}"]`).length;
}

/**
 * @param {Document | Element} doc
 * @param {string} integrationId
 * @param {string} subKey
 * @param {string} logId
 */
export function findInjectedForLog(doc, integrationId, subKey, logId) {
  return doc.querySelector(
    `[data-sfoc-inject="${integrationId}"][data-sfoc-key="${subKey}"][data-sfoc-log-id="${logId}"]`
  );
}

/**
 * @param {object} opts
 * @param {Document} opts.ownerDoc
 * @param {string} opts.label
 * @param {string} opts.ariaLabel
 * @param {() => void} opts.onClick
 * @param {string} opts.integrationId
 * @param {string} opts.subKey
 * @param {string} opts.logId
 * @param {Element} [opts.templateLink]
 * @returns {HTMLAnchorElement}
 */
export function createSfocActionLink(opts) {
  const doc = opts.ownerDoc || document;
  const a = doc.createElement('a');
  a.href = '#';
  const templateClass = opts.templateLink?.className?.trim();
  a.className = templateClass
    ? `${templateClass} sfoc-inject-link`
    : 'link-button slds-text-link sfoc-inject-link';
  a.setAttribute('data-sfoc-inject', opts.integrationId);
  a.setAttribute('data-sfoc-key', opts.subKey);
  a.setAttribute('data-sfoc-log-id', opts.logId);
  a.setAttribute('aria-label', opts.ariaLabel);
  a.title = opts.ariaLabel;
  a.textContent = opts.label;

  a.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    opts.onClick();
  });
  return a;
}
