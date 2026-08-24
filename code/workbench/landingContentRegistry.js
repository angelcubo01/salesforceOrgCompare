/**
 * Contenido de la Home comercial exclusivo de UI v2.
 *
 * `toolIds` permite que la presentación se adapte a sfoc_feature_controls sin
 * acoplar el copy o el layout a la implementación de cada panel.
 */
export const MARKETING_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: 'comparison',
    icon: 'arrows-diff',
    tone: 'blue',
    size: 'wide',
    labelKey: 'workbench.marketing.capability.comparison.label',
    titleKey: 'workbench.marketing.capability.comparison.title',
    descriptionKey: 'workbench.marketing.capability.comparison.description',
    toolIds: Object.freeze([
      'Comparator', 'CustomSettingsCompare', 'CustomMetadataCompare',
      'RecordCompare', 'MetadataTypeCompare'
    ])
  }),
  Object.freeze({
    id: 'apex',
    icon: 'test-pipe',
    tone: 'violet',
    size: 'compact',
    labelKey: 'workbench.marketing.capability.apex.label',
    titleKey: 'workbench.marketing.capability.apex.title',
    descriptionKey: 'workbench.marketing.capability.apex.description',
    toolIds: Object.freeze(['ApexTests', 'ApexCoverageCompare', 'AnonymousApex'])
  }),
  Object.freeze({
    id: 'development',
    icon: 'code',
    tone: 'cyan',
    size: 'third',
    labelKey: 'workbench.marketing.capability.development.label',
    titleKey: 'workbench.marketing.capability.development.title',
    descriptionKey: 'workbench.marketing.capability.development.description',
    toolIds: Object.freeze(['QuickEdit', 'LightningQuickEdit', 'QueryExplorer', 'RestExplorer'])
  }),
  Object.freeze({
    id: 'access',
    icon: 'shield-check',
    tone: 'green',
    size: 'third',
    labelKey: 'workbench.marketing.capability.access.label',
    titleKey: 'workbench.marketing.capability.access.title',
    descriptionKey: 'workbench.marketing.capability.access.description',
    toolIds: Object.freeze(['PermissionDiff', 'FieldDependency', 'DependencyExplorer', 'ObjectDescribe'])
  }),
  Object.freeze({
    id: 'operations',
    icon: 'activity',
    tone: 'amber',
    size: 'third',
    labelKey: 'workbench.marketing.capability.operations.label',
    titleKey: 'workbench.marketing.capability.operations.title',
    descriptionKey: 'workbench.marketing.capability.operations.description',
    toolIds: Object.freeze([
      'DebugLogBrowser', 'EventMonitor', 'EnvironmentStatus', 'OrgLimits',
      'DeployStatus', 'BulkJobMonitor', 'SetupAuditTrail', 'FieldHistory', 'DataWorkbench'
    ])
  }),
  Object.freeze({
    id: 'manifests',
    icon: 'file-code-2',
    tone: 'indigo',
    size: 'full',
    labelKey: 'workbench.marketing.capability.manifests.label',
    titleKey: 'workbench.marketing.capability.manifests.title',
    descriptionKey: 'workbench.marketing.capability.manifests.description',
    toolIds: Object.freeze(['GeneratePackageXml', 'MetadataTypeCompare'])
  })
]);

export const MARKETING_STEPS = Object.freeze([
  Object.freeze({
    id: 'connect', icon: 'building-factory-2',
    titleKey: 'workbench.marketing.step.connect.title',
    descriptionKey: 'workbench.marketing.step.connect.description'
  }),
  Object.freeze({
    id: 'inspect', icon: 'search',
    titleKey: 'workbench.marketing.step.inspect.title',
    descriptionKey: 'workbench.marketing.step.inspect.description'
  }),
  Object.freeze({
    id: 'act', icon: 'circle-check',
    titleKey: 'workbench.marketing.step.act.title',
    descriptionKey: 'workbench.marketing.step.act.description'
  })
]);

export const MARKETING_TRUST_ITEMS = Object.freeze([
  Object.freeze({ id: 'production', icon: 'building-factory-2', tone: 'production', labelKey: 'workbench.marketing.trust.production' }),
  Object.freeze({ id: 'sandbox', icon: 'flask', tone: 'sandbox', labelKey: 'workbench.marketing.trust.sandbox' }),
  Object.freeze({ id: 'read-only', icon: 'lock', tone: 'readonly', labelKey: 'workbench.marketing.trust.readOnly' }),
  Object.freeze({ id: 'risk', icon: 'alert-triangle', tone: 'risk', labelKey: 'workbench.marketing.trust.risk' })
]);
