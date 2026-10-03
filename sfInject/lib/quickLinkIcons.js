/** Iconos SFOC que deben prevalecer sobre el icono persistido en cada enlace. */
const SFOC_TOOL_ICONS = Object.freeze({
  Comparator: 'arrows-diff', ApexTests: 'test-pipe', ApexCoverageCompare: 'chart-donut', QuickEdit: 'file-code', LightningQuickEdit: 'components', AnonymousApex: 'terminal-2', QueryExplorer: 'database-search', RestExplorer: 'api', ObjectDescribe: 'schema', DataWorkbench: 'database-cog', DebugLogBrowser: 'file-search', EventMonitor: 'activity', FieldDependency: 'list-tree', DependencyExplorer: 'hierarchy-3', CustomSettingsCompare: 'settings', CustomMetadataCompare: 'brackets-contain', RecordCompare: 'table-options', EnvironmentStatus: 'heartbeat', OrgLimits: 'gauge', DeployStatus: 'rocket', BulkJobMonitor: 'stack-forward', SetupAuditTrail: 'history', FieldHistory: 'timeline-event', GeneratePackageXml: 'file-code-2', MetadataTypeCompare: 'package-export', PermissionDiff: 'shield-check', Apex: 'arrows-diff', LWC: 'arrows-diff', Aura: 'arrows-diff', VF: 'arrows-diff', PermissionSet: 'arrows-diff', Profile: 'arrows-diff', FlexiPage: 'arrows-diff', PackageXml: 'arrows-diff'
});

/** Trazados que no formaban parte del pequeño catálogo SVG original del content script. */
export const SFOC_QUICK_LINK_ICON_PATHS = Object.freeze({
  'test-pipe': ['M20 8.04l-12.122 12.124a2.857 2.857 0 1 1 -4.041 -4.04l12.122 -12.124', 'M7 13h8', 'M19 15l1.5 1.6a2 2 0 1 1 -3 0l1.5 -1.6', 'M15 3l6 6'],
  'chart-donut': ['M10 3.2a9 9 0 1 0 10.8 10.8a1 1 0 0 0 -1 -1h-3.8a4.1 4.1 0 1 1 -5 -5v-4a.9 .9 0 0 0 -1 -.8', 'M15 3.5a9 9 0 0 1 5.5 5.5h-4.5a9 9 0 0 0 -1 -1v-4.5'],
  components: ['M3 12l3 3l3 -3l-3 -3l-3 3', 'M15 12l3 3l3 -3l-3 -3l-3 3', 'M9 6l3 3l3 -3l-3 -3l-3 3', 'M9 18l3 3l3 -3l-3 -3l-3 3'],
  api: ['M4 13h5', 'M12 16v-8h3a2 2 0 0 1 2 2v1a2 2 0 0 1 -2 2h-3', 'M20 8v8', 'M9 16v-5.5a2.5 2.5 0 0 0 -5 0v5.5'],
  schema: ['M5 2h5v4h-5l0 -4', 'M15 10h5v4h-5l0 -4', 'M5 18h5v4h-5l0 -4', 'M5 10h5v4h-5l0 -4', 'M10 12h5', 'M7.5 6v4', 'M7.5 14v4'],
  'database-cog': ['M4 6c0 1.657 3.582 3 8 3s8 -1.343 8 -3s-3.582 -3 -8 -3s-8 1.343 -8 3', 'M4 6v6c0 1.657 3.582 3 8 3c.21 0 .42 -.003 .626 -.01', 'M20 11.5v-5.5', 'M4 12v6c0 1.657 3.582 3 8 3', 'M17.001 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M19.001 15.5v1.5', 'M19.001 21v1.5', 'M22.032 17.25l-1.299 .75', 'M17.27 20l-1.3 .75', 'M15.97 17.25l1.3 .75', 'M20.733 20l1.3 .75'],
  'file-search': ['M14 3v4a1 1 0 0 0 1 1h4', 'M12 21h-5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v4.5', 'M14 17.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0', 'M18.5 19.5l2.5 2.5'],
  'list-tree': ['M9 6h11', 'M12 12h8', 'M15 18h5', 'M5 6v.01', 'M8 12v.01', 'M11 18v.01'],
  'hierarchy-3': ['M10 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M6 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M10 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M18 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M2 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M14 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M5 17l2 -3', 'M9 10l2 -3', 'M13 7l2 3', 'M17 14l2 3', 'M15 14l-2 3', 'M9 14l2 3'],
  'brackets-contain': ['M7 4h-4v16h4', 'M17 4h4v16h-4', 'M8 16h.01', 'M12 16h.01', 'M16 16h.01'],
  'table-options': ['M12 21h-7a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v7', 'M3 10h18', 'M10 3v18', 'M17.001 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M19.001 15.5v1.5', 'M19.001 21v1.5', 'M22.032 17.25l-1.299 .75', 'M17.27 20l-1.3 .75', 'M15.97 17.25l1.3 .75', 'M20.733 20l1.3 .75'],
  heartbeat: ['M19.5 13.572l-7.5 7.428l-2.896 -2.868m-6.117 -8.104a5 5 0 0 1 9.013 -3.022a5 5 0 1 1 7.5 6.572', 'M3 13h2l2 3l2 -6l1 3h3'], gauge: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M11 12a1 1 0 1 0 2 0a1 1 0 0 0 -2 0', 'M13.41 10.59l2.59 -2.59', 'M7 12a5 5 0 0 1 5 -5'],
  'stack-forward': ['M12 5l-8 4l8 4l8 -4l-8 -4', 'M10 12l-6 3l8 4l8 -4l-6 -3'], history: ['M12 8l0 4l2 2', 'M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5'],
  'timeline-event': ['M10 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M10 20h-6', 'M14 20h6', 'M12 15l-2 -2h-3a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1h10a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-3l-2 2'],
  'file-code-2': ['M10 12h-1v5h1', 'M14 12h1v5h-1', 'M14 3v4a1 1 0 0 0 1 1h4', 'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2'],
  'package-export': ['M12 21l-8 -4.5v-9l8 -4.5l8 4.5v4.5', 'M12 12l8 -4.5', 'M12 12v9', 'M12 12l-8 -4.5', 'M15 18h7', 'M19 15l3 3l-3 3'],
  'shield-check': ['M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06', 'M15 19l2 2l4 -4']
});

/** @param {{ type?: unknown, toolId?: unknown, icon?: unknown }} link */
export function resolveQuickLinkIcon(link) {
  return link?.type === 'sfoc'
    ? SFOC_TOOL_ICONS[String(link.toolId || '')] || 'link'
    : String(link?.icon || 'link');
}
