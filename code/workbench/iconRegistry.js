export const WORKBENCH_ICON_VERSION = '3.46.0';
export const WORKBENCH_ICON_SPRITE_PATH = './assets/tabler-icons.svg';

export const CATEGORY_ICONS = Object.freeze({
  home: 'home',
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

/**
 * Crea iconos mediante DOM seguro. El SVG externo local solo se referencia con `<use>`.
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
  use.setAttribute('href', `${opts.spritePath || WORKBENCH_ICON_SPRITE_PATH}#icon-${iconName}`);
  svg.appendChild(use);
  return svg;
}
