/**
 * Payload de producción para `sfoc_feature_controls`: herramientas en beta con aviso
 * informativo no bloqueante (mismo patrón para todas).
 */

/** @type {import('./featureControls.js').FeatureControlMessage} */
export const BETA_TOOL_NOTICE = Object.freeze({
  es: 'Esta funcionalidad está en fase beta. Puede haber cambios o limitaciones.',
  en: 'This feature is in beta. Behavior may change and some limitations may apply.',
  severity: 'info',
  blocking: false
});

/** Herramientas visibles con aviso beta vía kill switch. */
export const BETA_TOOL_IDS = Object.freeze(['DependencyExplorer', 'RecordCompare']);

/**
 * Construye el payload de producción, preservando restricciones existentes y
 * aplicando (o actualizando) el aviso beta en cada herramienta listada.
 *
 * @param {import('./featureControls.js').FeatureControlsConfig | null | undefined} [base]
 * @returns {import('./featureControls.js').FeatureControlsConfig}
 */
export function buildProductionFeatureControlsPayload(base) {
  /** @type {import('./featureControls.js').FeatureControlsConfig} */
  const payload = {
    version: 1,
    global: base?.global ?? null,
    modes: { ...(base?.modes || {}) },
    tools: { ...(base?.tools || {}) },
    metadataTypes: { ...(base?.metadataTypes || {}) },
    actions: { ...(base?.actions || {}) }
  };
  for (const toolId of BETA_TOOL_IDS) {
    payload.tools[toolId] = {
      ...(payload.tools[toolId] || {}),
      message: { ...BETA_TOOL_NOTICE }
    };
  }
  return payload;
}
