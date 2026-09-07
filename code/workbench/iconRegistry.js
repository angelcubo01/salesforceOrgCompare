export const WORKBENCH_ICON_VERSION = '3.46.0';
export const WORKBENCH_ICON_SPRITE_PATH = './assets/tabler-icons.svg';
export const WORKBENCH_ICON_SPRITE_ID = 'sfocWorkbenchIconSprite';

export const CATEGORY_ICONS = Object.freeze({
  home: 'home',
  favorites: 'star',
  comparator: 'arrows-diff',
  development: 'code',
  dataApi: 'database',
  diagnostics: 'stethoscope',
  analysis: 'chart-dots-3',
  operations: 'activity',
  metadata: 'package',
  security: 'shield-lock',
  advanced: 'terminal-2'
});

export const TOOL_ICONS = Object.freeze({
  Comparator: 'arrows-diff',
  ApexTests: 'test-pipe',
  ApexCoverageCompare: 'chart-donut',
  QuickEdit: 'file-code',
  LightningQuickEdit: 'components',
  AnonymousApex: 'terminal-2',
  QueryExplorer: 'database-search',
  RestExplorer: 'api',
  ObjectDescribe: 'schema',
  DataWorkbench: 'database-cog',
  DebugLogBrowser: 'file-search',
  EventMonitor: 'activity',
  FieldDependency: 'list-tree',
  DependencyExplorer: 'hierarchy-3',
  CustomSettingsCompare: 'settings',
  CustomMetadataCompare: 'brackets-contain',
  RecordCompare: 'table-options',
  EnvironmentStatus: 'heartbeat',
  OrgLimits: 'gauge',
  DeployStatus: 'rocket',
  BulkJobMonitor: 'stack-forward',
  SetupAuditTrail: 'history',
  FieldHistory: 'timeline-event',
  GeneratePackageXml: 'file-code-2',
  MetadataTypeCompare: 'package-export',
  PermissionDiff: 'shield-check',
  Apex: 'arrows-diff',
  LWC: 'arrows-diff',
  Aura: 'arrows-diff',
  VF: 'arrows-diff',
  PermissionSet: 'arrows-diff',
  Profile: 'arrows-diff',
  FlexiPage: 'arrows-diff',
  PackageXml: 'arrows-diff'
});

export const STATE_ICONS = Object.freeze({
  info: 'info-circle',
  success: 'circle-check',
  warning: 'alert-triangle',
  error: 'alert-circle',
  loading: 'loader-2',
  empty: 'inbox',
  locked: 'lock',
  permission: 'user-x',
  production: 'building-factory-2',
  sandbox: 'flask',
  unknownEnvironment: 'help-hexagon',
  readOnly: 'lock'
});

export const ACTION_ICONS = Object.freeze({
  search: 'search',
  favorite: 'star',
  pin: 'pin',
  save: 'device-floppy',
  run: 'player-play',
  cancel: 'x',
  close: 'x',
  copy: 'copy',
  export: 'file-export',
  download: 'download',
  refresh: 'refresh',
  delete: 'trash',
  help: 'help-circle',
  settings: 'settings',
  lightTheme: 'sun',
  darkTheme: 'moon',
  collapsePanel: 'layout-sidebar-left-collapse',
  expandPanel: 'layout-sidebar-left-expand',
  command: 'command',
  back: 'chevron-left',
  forward: 'chevron-right',
  more: 'dots'
});

export const USED_ICON_NAMES = Object.freeze(
  [...new Set([
    ...Object.values(CATEGORY_ICONS),
    ...Object.values(TOOL_ICONS),
    ...Object.values(STATE_ICONS),
    ...Object.values(ACTION_ICONS)
  ])].sort()
);

let iconSpritePromise = null;
let iconSpriteFailed = false;

function iconSymbolId(iconName) {
  const name = !iconSpriteFailed && USED_ICON_NAMES.includes(iconName) ? iconName : STATE_ICONS.unknownEnvironment;
  return `icon-${name}`;
}

function mountFallbackIconSprite() {
  const existing = document.getElementById(WORKBENCH_ICON_SPRITE_ID);
  if (existing) return existing;
  const mounted = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mounted.id = WORKBENCH_ICON_SPRITE_ID;
  mounted.setAttribute('aria-hidden', 'true');
  mounted.setAttribute('width', '0');
  mounted.setAttribute('height', '0');
  mounted.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
  symbol.id = iconSymbolId(STATE_ICONS.unknownEnvironment);
  symbol.setAttribute('viewBox', '0 0 24 24');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '9');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M9.5 9a2.5 2.5 0 1 1 4 2c-.8.6-1.5 1-1.5 2.5M12 17h.01');
  symbol.append(circle, path); mounted.appendChild(symbol); document.body.prepend(mounted);
  return mounted;
}

/**
 * Carga una única vez el sprite y lo convierte en símbolos internos. Chromium ya no
 * necesita resolver un recurso externo cada vez que se monta un icono.
 * @returns {Promise<SVGSVGElement | null>}
 */
export function ensureWorkbenchIconSprite() {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const existing = document.getElementById(WORKBENCH_ICON_SPRITE_ID);
  if (existing) return Promise.resolve(/** @type {SVGSVGElement} */ (existing));
  if (iconSpritePromise) return iconSpritePromise;
  iconSpritePromise = (async () => {
    const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('code/assets/tabler-icons.svg')
      : new URL('../assets/tabler-icons.svg', import.meta.url).href;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Icon sprite HTTP ${response.status}`);
    const source = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    const symbols = [...source.querySelectorAll('symbol')];
    const ids = new Set(symbols.map((symbol) => symbol.id));
    const missing = USED_ICON_NAMES.filter((name) => !ids.has(`icon-${name}`));
    if (missing.length) throw new Error(`Icon sprite missing: ${missing.join(', ')}`);
    const mounted = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mounted.id = WORKBENCH_ICON_SPRITE_ID;
    mounted.setAttribute('aria-hidden', 'true');
    mounted.setAttribute('focusable', 'false');
    mounted.setAttribute('width', '0');
    mounted.setAttribute('height', '0');
    mounted.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    for (const symbol of symbols) mounted.appendChild(document.importNode(symbol, true));
    document.body.prepend(mounted);
    return mounted;
  })().catch((error) => {
    // El fallback sigue siendo interno y estable; no se vuelve a introducir el
    // sprite externo en cada icono si el recurso no está disponible.
    console.warn('SFOC Workbench icon sprite unavailable', error);
    iconSpriteFailed = true;
    const fallback = mountFallbackIconSprite();
    document.querySelectorAll('.sfoc-icon use').forEach((use) => use.setAttribute('href', `#${iconSymbolId('')}`));
    return fallback;
  });
  return iconSpritePromise;
}

/** Actualiza un icono sin sustituir su nodo SVG. */
export function updateIcon(svg, iconName) {
  const use = svg?.querySelector?.('use');
  if (!use) return false;
  const href = `#${iconSymbolId(iconName)}`;
  if (use.getAttribute('href') !== href) use.setAttribute('href', href);
  return true;
}

/**
 * Crea iconos mediante DOM seguro con referencias a símbolos internos.
 * @param {string} iconName
 * @param {{ size?: 16|20|24, className?: string, label?: string, spritePath?: string }} [opts]
 */
export function createIcon(iconName, opts = {}) {
  const size = [16, 20, 24].includes(opts.size) ? opts.size : 20;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('sfoc-icon');
  if (opts.className) svg.classList.add(...opts.className.split(/\s+/).filter(Boolean));
  if (opts.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${iconSymbolId(iconName)}`);
  svg.appendChild(use);
  return svg;
}
