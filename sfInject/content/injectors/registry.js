/**
 * Registro de integraciones activas en el content script.
 * Añade aquí cada integración implementada.
 */
import { debugLogOpenViewerIntegration } from './debugLogOpenViewer.js';
import { debugLogsTableOrderIntegration } from './debugLogsTableOrder.js';
import { userTraceFlagsEnhanceIntegration } from './userTraceFlagsEnhance.js';

export const SF_INJECT_CONTENT_INTEGRATIONS = [
  debugLogOpenViewerIntegration,
  debugLogsTableOrderIntegration,
  userTraceFlagsEnhanceIntegration
];
