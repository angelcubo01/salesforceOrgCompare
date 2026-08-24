import { t } from '../../shared/i18n.js';
import { getToolOnboardingTour } from './toolOnboardingTours.js';

const TARGET_WAIT_MS = 4000;
const TARGET_POLL_MS = 40;

let activeSession = null;
let sessionSequence = 0;
let driverFactory = null;

async function resolveDriverFactory() {
  if (driverFactory) return driverFactory;
  const module = await import('../../vendor/driver.js/driver.js.mjs');
  driverFactory = module.driver;
  return driverFactory;
}

function isV2() {
  return typeof document !== 'undefined' && document.body?.dataset.uiMode === 'v2';
}

function isElementVisible(element) {
  if (!(element instanceof Element) || !element.isConnected) return false;
  if (element.closest('[hidden], .hidden, [aria-hidden="true"]')) return false;
  const style = globalThis.getComputedStyle?.(element);
  if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  return element.getClientRects().length > 0;
}

function findVisibleElement(selector) {
  const element = document.querySelector(selector);
  return isElementVisible(element) ? element : undefined;
}

async function waitForRouteReady(definition) {
  const route = definition.route;
  if (!route) return false;
  const deadline = Date.now() + TARGET_WAIT_MS;
  while (Date.now() <= deadline) {
    const workspaceReady = document.body.dataset.workbenchWorkspace === route.workspaceId;
    const tabReady = document.body.dataset.workbenchTab === route.tabId;
    const panelReady = !!findVisibleElement(`#${route.panelId}`);
    if (workspaceReady && tabReady && panelReady) return true;
    await new Promise((resolve) => setTimeout(resolve, TARGET_POLL_MS));
  }
  return false;
}

function tagAnchors(definition) {
  const previous = new Map();
  for (const item of definition.steps) {
    const element = document.querySelector(item.anchor);
    if (!element || previous.has(element)) continue;
    previous.set(element, element.getAttribute('data-onboarding-anchor'));
    element.setAttribute('data-onboarding-anchor', `${definition.toolId}.${item.id}`);
  }
  return () => {
    for (const [element, value] of previous) {
      if (!element.isConnected) continue;
      if (value == null) element.removeAttribute('data-onboarding-anchor');
      else element.setAttribute('data-onboarding-anchor', value);
    }
  };
}

async function activateCanonicalTab(session) {
  const { definition } = session;
  if (!definition.canonicalTabId || !definition.route) return true;
  const { workspaceId } = definition.route;
  const deadline = Date.now() + TARGET_WAIT_MS;
  while (Date.now() <= deadline && activeSession === session) {
    if (document.body.dataset.workbenchWorkspace === workspaceId
      && document.body.dataset.workbenchTab === definition.canonicalTabId) return true;
    const target = document.getElementById(`workbenchTab-${workspaceId}-${definition.canonicalTabId}`);
    if (target && !target.disabled) target.click();
    await new Promise((resolve) => setTimeout(resolve, TARGET_POLL_MS));
  }
  return false;
}

function restoreManualTab(session) {
  if (!session.manual || !session.previousTab?.workspaceId || !session.previousTab.tabId) return;
  const { workspaceId, tabId } = session.previousTab;
  if (document.body.dataset.workbenchWorkspace !== workspaceId) return;
  if (document.body.dataset.workbenchTab === tabId) return;
  const target = document.getElementById(`workbenchTab-${workspaceId}-${tabId}`);
  if (target && !target.disabled) target.click();
}

function restoreFocus(session) {
  requestAnimationFrame(() => {
    const preferred = session.focusOrigin?.isConnected && !session.focusOrigin.hidden
      ? session.focusOrigin
      : document.getElementById('workbenchHelpBtn') || document.getElementById('appHelpBtn');
    preferred?.focus?.({ preventScroll: true });
  });
}

function cleanupSession(session) {
  session.restoreAnchors?.();
  session.restoreAnchors = null;
  restoreManualTab(session);
  restoreFocus(session);
  if (activeSession === session) activeSession = null;
}

async function finalizeSession(session, outcome, { alreadyDestroyed = false } = {}) {
  if (!session || session.finalized) return;
  session.finalized = true;
  const shouldMarkSeen = session.started && (outcome === 'completed' || outcome === 'skipped');
  const persist = shouldMarkSeen
    ? Promise.resolve().then(() => session.onSeen?.(session.toolId)).catch(() => {})
    : Promise.resolve();
  try {
    if (!alreadyDestroyed && session.driverObj?.isActive?.()) {
      session.driverObj.destroy();
    }
  } catch {
    // La limpieza y la persistencia no deben depender del estado interno de Driver.js.
  } finally {
    cleanupSession(session);
  }
  await persist;
}

function renderCustomPopover(popover, session) {
  popover.closeButton.setAttribute('aria-label', t('onboarding.common.skip'));
  popover.closeButton.title = t('onboarding.common.skip');
  popover.progress.setAttribute('aria-live', 'polite');

  if (popover.footer.querySelector('.sfoc-driver-skip')) return;
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'driver-popover-footer-btn sfoc-driver-skip';
  skip.textContent = t('onboarding.common.skip');
  skip.addEventListener('click', () => {
    void finalizeSession(session, 'skipped');
  });
  popover.footer.insertBefore(skip, popover.footerButtons);
}

function buildDriverSteps(definition) {
  return definition.steps.map((item) => ({
    element: () => findVisibleElement(item.anchor),
    disableActiveInteraction: item.interaction !== 'safe',
    advanceOnClick: item.advanceOnClick === true,
    skipMissingElement: true,
    waitForElement: TARGET_WAIT_MS,
    data: { toolId: definition.toolId, stepId: item.id, interaction: item.interaction },
    popover: {
      title: t(item.titleKey),
      description: t(item.descriptionKey),
      side: item.side || 'bottom',
      align: item.align || 'start'
    }
  }));
}

/**
 * Inicia el tour V2 de una herramienta.
 * @param {string} toolId
 * @param {{ manual?: boolean, focusOrigin?: HTMLElement | null, onSeen?: (toolId: string) => Promise<void> | void }} [options]
 */
export async function startDriverToolOnboarding(toolId, options = {}) {
  if (!isV2()) return false;
  const definition = getToolOnboardingTour(toolId);
  if (!definition?.route || !definition.steps.length) return false;
  if (activeSession?.toolId === toolId) return true;
  if (activeSession) await finalizeSession(activeSession, activeSession.started ? 'skipped' : 'cancelled');

  const session = {
    id: ++sessionSequence,
    toolId,
    definition,
    manual: options.manual === true,
    focusOrigin: options.focusOrigin || null,
    onSeen: options.onSeen,
    previousTab: {
      workspaceId: document.body.dataset.workbenchWorkspace || '',
      tabId: document.body.dataset.workbenchTab || ''
    },
    driverObj: null,
    restoreAnchors: null,
    started: false,
    finalized: false
  };
  activeSession = session;

  try {
    if (!await activateCanonicalTab(session) || activeSession !== session || session.finalized) {
      await finalizeSession(session, 'cancelled', { alreadyDestroyed: true });
      return false;
    }
    if (!await waitForRouteReady(definition)) {
      await finalizeSession(session, 'cancelled', { alreadyDestroyed: true });
      return false;
    }

    const hasVisibleStep = definition.steps.some((item) => findVisibleElement(item.anchor));
    if (!hasVisibleStep) {
      await finalizeSession(session, 'cancelled', { alreadyDestroyed: true });
      return false;
    }

    session.restoreAnchors = tagAnchors(definition);
    const steps = buildDriverSteps(definition);
    if (!steps.length) {
      await finalizeSession(session, 'cancelled', { alreadyDestroyed: true });
      return false;
    }

    const prefersReducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    const createDriver = await resolveDriverFactory();
    if (activeSession !== session || session.finalized) return false;
    session.driverObj = createDriver({
      steps,
      animate: !prefersReducedMotion,
      duration: prefersReducedMotion ? 0 : 220,
      allowClose: true,
      allowKeyboardControl: true,
      allowScroll: true,
      smoothScroll: !prefersReducedMotion,
      overlayClickBehavior: 'close',
      overlayColor: '#020617',
      overlayOpacity: 0.66,
      stagePadding: 8,
      stageRadius: 10,
      popoverOffset: 12,
      popoverClass: 'sfoc-driver-popover',
      showButtons: ['previous', 'next', 'close'],
      showProgress: true,
      progressText: t('onboarding.common.progress'),
      prevBtnText: t('onboarding.common.previous'),
      nextBtnText: t('onboarding.common.next'),
      doneBtnText: t('onboarding.common.finish'),
      skipMissingElement: true,
      waitForElement: TARGET_WAIT_MS,
      onPopoverRender: (popover) => renderCustomPopover(popover, session),
      onCloseClick: () => void finalizeSession(session, 'skipped'),
      onDoneClick: () => void finalizeSession(session, 'completed'),
      onDestroyStarted: () => void finalizeSession(session, 'skipped'),
      onDestroyed: () => {
        if (!session.finalized) void finalizeSession(session, 'skipped', { alreadyDestroyed: true });
      }
    });
    session.driverObj.drive();
    session.started = true;
    return true;
  } catch {
    await finalizeSession(session, 'cancelled', { alreadyDestroyed: true });
    return false;
  }
}

export async function dismissDriverOnboardingForNavigation(nextToolId = '') {
  if (!activeSession || activeSession.toolId === nextToolId) return;
  await finalizeSession(activeSession, activeSession.started ? 'skipped' : 'cancelled');
}

export async function stopDriverToolOnboarding(outcome = 'skipped') {
  if (!activeSession) return;
  await finalizeSession(activeSession, outcome);
}

export function getActiveDriverOnboardingTool() {
  return activeSession?.toolId || null;
}

/** Inyección acotada para tests unitarios; no se usa en runtime. */
export function setDriverFactoryForTests(factory) {
  driverFactory = typeof factory === 'function' ? factory : null;
}
