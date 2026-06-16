/**
 * Subcategorías de navegación (solo UI). No altera API names ni feature controls.
 * home, comparator y manifests no tienen grupos.
 */

/** @type {Record<string, { id: string, i18nKey: string, tools: string[] }[]>} */
export const TOOL_NAV_GROUPS = Object.freeze({
  development: Object.freeze([
    Object.freeze({
      id: 'tests',
      i18nKey: 'code.toolGroup.devTests',
      tools: Object.freeze(['ApexTests', 'ApexCoverageCompare'])
    }),
    Object.freeze({
      id: 'apexCode',
      i18nKey: 'code.toolGroup.devApexCode',
      tools: Object.freeze(['QuickEdit', 'AnonymousApex'])
    }),
    Object.freeze({
      id: 'inspect',
      i18nKey: 'code.toolGroup.devInspect',
      tools: Object.freeze(['QueryExplorer', 'DebugLogBrowser'])
    })
  ]),
  analysis: Object.freeze([
    Object.freeze({
      id: 'dependencies',
      i18nKey: 'code.toolGroup.monDependencies',
      tools: Object.freeze(['FieldDependency', 'DependencyExplorer'])
    }),
    Object.freeze({
      id: 'permissions',
      i18nKey: 'code.toolGroup.monPermissions',
      tools: Object.freeze(['PermissionDiff'])
    }),
    Object.freeze({
      id: 'dataCompare',
      i18nKey: 'code.toolGroup.monDataCompare',
      tools: Object.freeze([
        'CustomSettingsCompare',
        'CustomMetadataCompare',
        'RecordCompare'
      ])
    })
  ]),
  monitoring: Object.freeze([
    Object.freeze({
      id: 'orgHealth',
      i18nKey: 'code.toolGroup.monOrgHealth',
      tools: Object.freeze(['EnvironmentStatus', 'OrgLimits'])
    }),
    Object.freeze({
      id: 'audit',
      i18nKey: 'code.toolGroup.monAudit',
      tools: Object.freeze(['SetupAuditTrail', 'FieldHistory'])
    })
  ])
});

/**
 * @param {string} mode
 * @param {string[]} visibleTools Herramientas visibles (ya filtradas por feature controls).
 * @returns {{ id: string, i18nKey: string, tools: string[] }[] | null}
 */
export function getGroupedToolsForMode(mode, visibleTools) {
  const groups = TOOL_NAV_GROUPS[mode];
  if (!groups || !visibleTools.length) return null;

  const visibleSet = new Set(visibleTools);
  /** @type {Set<string>} */
  const assigned = new Set();
  /** @type {{ id: string, i18nKey: string, tools: string[] }[]} */
  const result = [];

  for (const group of groups) {
    const tools = group.tools.filter((tool) => visibleSet.has(tool));
    for (const tool of tools) assigned.add(tool);
    if (tools.length > 0) {
      result.push({ id: group.id, i18nKey: group.i18nKey, tools });
    }
  }

  const unassigned = visibleTools.filter((tool) => !assigned.has(tool));
  if (unassigned.length > 0) {
    result.push({ id: 'other', i18nKey: 'code.toolGroup.other', tools: unassigned });
  }

  return result.length > 0 ? result : null;
}
