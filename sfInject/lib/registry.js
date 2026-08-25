/**
 * Registro de integraciones UI en Salesforce.
 * Añade aquí cada integración implementada (settings + content script).
 */

/** @typedef {{ id: string, settingsLabelKey: string, settingsHintKey: string }} SfInjectShippedIntegration */

/** Integraciones actualmente disponibles en la extensión. */
export const SF_INJECT_SHIPPED = /** @type {const} */ ([
  {
    id: 'debugLogOpenViewer',
    settingsLabelKey: 'settings.sfInjectDebugLogOpenViewer',
    settingsHintKey: 'settings.sfInjectDebugLogOpenViewerHint'
  },
  {
    id: 'debugLogsTableOrder',
    settingsLabelKey: 'settings.sfInjectDebugLogsTableOrder',
    settingsHintKey: 'settings.sfInjectDebugLogsTableOrderHint'
  },
  {
    id: 'userTraceFlagsEnhance',
    settingsLabelKey: 'settings.sfInjectUserTraceFlagsEnhance',
    settingsHintKey: 'settings.sfInjectUserTraceFlagsEnhanceHint'
  },
  {
    id: 'deployStatusInlineDetails',
    settingsLabelKey: 'settings.sfInjectDeployStatusInlineDetails',
    settingsHintKey: 'settings.sfInjectDeployStatusInlineDetailsHint'
  },
  {
    id: 'deployStatusDetailSourceLinks',
    settingsLabelKey: 'settings.sfInjectDeployStatusDetailSourceLinks',
    settingsHintKey: 'settings.sfInjectDeployStatusDetailSourceLinksHint'
  }
]);

/** IDs de integraciones implementadas (derivado del registro). */
export const SF_INJECT_INTEGRATION_IDS = SF_INJECT_SHIPPED.map((item) => item.id);

/**
 * @param {string} id
 * @returns {SfInjectShippedIntegration | undefined}
 */
export function getSfInjectShippedIntegration(id) {
  return SF_INJECT_SHIPPED.find((item) => item.id === id);
}
