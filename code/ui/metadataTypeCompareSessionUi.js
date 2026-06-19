import { bg } from '../core/bridge.js';
import { dismissSpinnerToast } from './toast.js';
import { showToast } from './toast.js';
import { t } from '../../shared/i18n.js';
import {
  beginCompareRetrieveSession,
  cancelCompareRetrieve,
  isCompareRetrieveActive
} from '../flows/retrieveSessionUi.js';

/** @type {{ generation: number, cancelledLocally: boolean } | null} */
let activeSession = null;

export function getActiveMetadataTypeCompareGeneration() {
  return activeSession?.generation ?? null;
}

export function isMetadataTypeCompareActive(generation) {
  return (
    activeSession != null &&
    activeSession.generation === generation &&
    !activeSession.cancelledLocally
  );
}

export async function beginMetadataTypeCompareUiSession() {
  if (activeSession) {
    await cancelMetadataTypeCompareUi({ silent: true });
  }
  const res = await bg({ type: 'metadataTypeCompare:begin' });
  const generation = res?.ok && res.generation != null ? Number(res.generation) : 0;
  activeSession = { generation, cancelledLocally: false };
  return generation;
}

/**
 * @param {{ silent?: boolean, showToast?: boolean }} [opts]
 */
export async function cancelMetadataTypeCompareUi(opts = {}) {
  const session = activeSession;
  if (!session) return;
  session.cancelledLocally = true;
  activeSession = null;
  dismissSpinnerToast();
  try {
    await bg({ type: 'metadataTypeCompare:cancel' });
    await cancelCompareRetrieve({ silent: true, showToast: false });
  } catch {
    /* ignore */
  }
  if (!opts.silent && opts.showToast !== false) {
    showToast(t('metadataTypeCompare.cancelled'), 'info', { bypassCooldown: true });
  }
}

export function clearMetadataTypeCompareUiSession(generation) {
  if (activeSession?.generation === generation) {
    activeSession = null;
  }
}

export async function beginRetrieveSessionForCompare() {
  return beginCompareRetrieveSession();
}

export function isRetrieveSessionActive(generation) {
  return isCompareRetrieveActive(generation);
}

export async function cancelRetrieveSessionForCompare(opts = {}) {
  return cancelCompareRetrieve(opts);
}
