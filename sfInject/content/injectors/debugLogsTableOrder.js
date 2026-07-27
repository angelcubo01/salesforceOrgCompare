import { isApexDebugLogsInjectPage } from '../matchers/debugLogPages.js';
import {
  INTEGRATION_ID,
  isApexDebugLogsSetupDocument,
  isDebugLogsAboveUserTraceFlags,
  reorderDebugLogsAboveUserTraceFlags
} from './debugLogsTableOrderDom.js';

/**
 * @param {Document} doc
 */
export function applyDebugLogsTableOrder(doc) {
  if (!isApexDebugLogsSetupDocument(doc)) return;
  if (isDebugLogsAboveUserTraceFlags(doc)) return;
  const result = reorderDebugLogsAboveUserTraceFlags(doc);
  if (result.ok && doc.documentElement) {
    doc.documentElement.setAttribute('data-sfoc-inject-status', 'active');
  }
}

/**
 * Sin MutationObserver: el AJAX de las listas Visualforce provocaba
 * reordenaciones en bucle. El host reintenta con retryInject.
 * @param {Document} doc
 * @returns {() => void}
 */
export function mountDebugLogsTableOrder(doc) {
  applyDebugLogsTableOrder(doc);
  return () => {};
}

function isParentDebugLogsHomePage() {
  try {
    return isApexDebugLogsInjectPage(window.top.location.href);
  } catch {
    return isApexDebugLogsInjectPage(location.href);
  }
}

/** Integración registrada para el host genérico. */
export const debugLogsTableOrderIntegration = {
  id: INTEGRATION_ID,
  isParentPageActive: isParentDebugLogsHomePage,
  isFrameRelevant: isApexDebugLogsSetupDocument,
  mount(doc) {
    return mountDebugLogsTableOrder(doc);
  },
  retryInject(doc) {
    if (isApexDebugLogsSetupDocument(doc) && !isDebugLogsAboveUserTraceFlags(doc)) {
      applyDebugLogsTableOrder(doc);
    }
  }
};
