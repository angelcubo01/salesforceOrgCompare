/** Small DOM helpers: Salesforce values always use textContent. */
export function element(doc, tag, className = '', text = null) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}
const PATHS = {
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3zM8 12l3 3 5-6',
  group: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 20v-2a6 6 0 0 0-4-5',
  globe: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0zM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18z',
  logs: 'M4 4h16v16H4zM7 9l3 3-3 3M13 15h4',
  copy: 'M9 8h11v13H9zM15 8V3H4v13h5',
  open: 'M14 5h5v5M19 5l-8 8M18 14v5H5V6h5',
  key: 'M14 8a5 5 0 1 0-10 0 5 5 0 0 0 10 0zM14 8h7M18 8v4M21 8v3',
  close: 'M6 6l12 12M6 18L18 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  refresh: 'M20 7v5h-5M20 12a8 8 0 1 0-2 5',
  chevron: 'M8 5l7 7-7 7',
  clock: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0zM12 7v5l3 2',
  check: 'M5 12l4 4L19 6',
  warning: 'M12 3L2 21h20L12 3zM12 9v5M12 17v1',
  search: 'M16 10a6 6 0 1 0-12 0 6 6 0 0 0 12 0zM15 15l6 6',
  mail: 'M3 5h18v14H3zM3 5l9 8 9-8'
};
export function icon(doc, name) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('sfoc-um-icon');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[name] || PATHS.user); svg.append(path); return svg;
}
export function button(doc, text, glyph, action, { iconOnly = false, variant = '' } = {}) {
  const b = element(doc, 'button', 'sfoc-um-button' + (iconOnly ? ' sfoc-um-icon-button' : '') + (variant ? ' sfoc-um-button--' + variant : ''));
  b.type = 'button'; b.title = text; b.setAttribute('aria-label', text);
  if (glyph) b.append(icon(doc, glyph));
  if (!iconOnly) b.append(element(doc, 'span', '', text));
  b.addEventListener('click', action); return b;
}
export function link(doc, text, path, glyph = 'open') {
  const a = element(doc, 'a', 'sfoc-um-link'); a.href = path; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.title = text; a.setAttribute('aria-label', text); a.append(icon(doc, glyph)); return a;
}
export function loading(doc, copy) {
  const box = element(doc, 'div', 'sfoc-um-loading');
  box.setAttribute('role', 'status'); const spinner = element(doc, 'span', 'sfoc-setup-palette-spinner');
  spinner.setAttribute('aria-hidden', 'true'); box.append(spinner, element(doc, 'span', '', copy.loading)); return box;
}
export function errorPanel(doc, copy, reason, retry) {
  const panel = element(doc, 'div', 'sfoc-um-notice sfoc-um-notice--error');
  panel.setAttribute('role', 'alert'); panel.append(icon(doc, 'warning'), element(doc, 'span', '', copy.errors[reason] || copy.errors.API_ERROR));
  if (retry) panel.append(button(doc, copy.retry, 'refresh', retry));
  return panel;
}
export function message(doc, text, kind = 'info') {
  const node = element(doc, 'div', 'sfoc-um-notice sfoc-um-notice--' + kind);
  node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  node.append(icon(doc, kind === 'success' ? 'check' : 'warning'), element(doc, 'span', '', text)); return node;
}
export function formatUserDate(date, lang, fallback) {
  const ms = Date.parse(date || ''); return Number.isFinite(ms) ? new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(ms) : fallback;
}
