import { isApexDebugLogsInjectPage } from '../matchers/debugLogPages.js';
import {
  INTEGRATION_ID,
  isApexDebugLogsSetupDocument,
  isDebugLogsAboveUserTraceFlags,
  reorderDebugLogsAboveUserTraceFlags
} from './debugLogsTableOrderDom.js';
import { mountDebouncedDomObserver } from './observer.js';

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
 * @param {Document} doc
 * @returns {() => void}
 */
export function mountDebugLogsTableOrder(doc) {
  return mountDebouncedDomObserver(doc, () => applyDebugLogsTableOrder(doc), { debounceMs: 250 });
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
