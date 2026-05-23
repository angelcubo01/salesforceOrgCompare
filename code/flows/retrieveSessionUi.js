import { bg } from '../core/bridge.js';
import { dismissSpinnerToast } from '../ui/toast.js';
import { endFileViewerLoading } from '../ui/viewerChrome.js';
import { showToast } from '../ui/toast.js';
import { t } from '../../shared/i18n.js';

/** @type {{ generation: number, cancelledLocally: boolean } | null} */
let activeCompareRetrieve = null;

export function getActiveCompareRetrieveGeneration() {
  return activeCompareRetrieve?.generation ?? null;
}

export function isCompareRetrieveActive(generation) {
  return (
    activeCompareRetrieve != null &&
    activeCompareRetrieve.generation === generation &&
    !activeCompareRetrieve.cancelledLocally
  );
}

/** Inicia sesión de retrieve; cancela la anterior si existía. */
export async function beginCompareRetrieveSession() {
  if (activeCompareRetrieve) {
    await cancelCompareRetrieve({ silent: true });
  }
  const res = await bg({ type: 'retrieve:begin' });
  const generation = res?.ok && res.generation != null ? Number(res.generation) : 0;
  activeCompareRetrieve = { generation, cancelledLocally: false };
  return generation;
}

/**
 * Cancela el retrieve en curso (UI + generación en background).
 * @param {{ silent?: boolean, showToast?: boolean }} [opts]
 */
export async function cancelCompareRetrieve(opts = {}) {
  const session = activeCompareRetrieve;
  if (!session) return;
  session.cancelledLocally = true;
  activeCompareRetrieve = null;
  dismissSpinnerToast();
  endFileViewerLoading();
  try {
    await bg({ type: 'retrieve:cancel' });
  } catch {
    /* ignore */
  }
  if (!opts.silent && opts.showToast !== false) {
    showToast(t('toast.retrieveCancelled'), 'info', { bypassCooldown: true });
  }
}

export function clearCompareRetrieveSession(generation) {
  if (activeCompareRetrieve?.generation === generation) {
    activeCompareRetrieve = null;
  }
}
