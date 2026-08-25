import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dismissDriverOnboardingForNavigation,
  getActiveDriverOnboardingTool,
  setDriverFactoryForTests,
  startDriverToolOnboarding,
  stopDriverToolOnboarding
} from '../code/ui/driverOnboarding.js';
import { getToolOnboardingTour } from '../code/ui/toolOnboardingTours.js';

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.isConnected = true;
    this.attributes = new Map();
  }

  closest() { return null; }
  getClientRects() { return [{}]; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() {}
  click() {}
}

function installFakeDom(toolIds) {
  const selectors = new Map();
  for (const toolId of toolIds) {
    for (const item of getToolOnboardingTour(toolId).steps) {
      if (!selectors.has(item.anchor)) selectors.set(item.anchor, new FakeElement(item.anchor));
    }
  }
  const body = new FakeElement('body');
  body.dataset.uiMode = 'v2';
  body.dataset.workbenchWorkspace = getToolOnboardingTour(toolIds[0]).route.workspaceId;
  body.dataset.workbenchTab = getToolOnboardingTour(toolIds[0]).route.tabId;
  globalThis.Element = FakeElement;
  globalThis.document = {
    body,
    querySelector: (selector) => selectors.get(selector) || null,
    getElementById: () => null
  };
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
  globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };
  globalThis.matchMedia = () => ({ matches: false });
}

function installFakeDriver() {
  const sessions = [];
  setDriverFactoryForTests((config) => {
    let active = false;
    const instance = {
      config,
      drive: () => { active = true; },
      isActive: () => active,
      destroy: () => {
        if (!active) return;
        active = false;
        config.onDestroyed?.();
      }
    };
    sessions.push(instance);
    return instance;
  });
  return sessions;
}

describe('driverOnboarding lifecycle', () => {
  beforeEach(() => {
    installFakeDom(['QueryExplorer', 'RestExplorer']);
  });

  afterEach(async () => {
    await stopDriverToolOnboarding('cancelled');
    setDriverFactoryForTests(null);
    delete globalThis.document;
    delete globalThis.Element;
    delete globalThis.getComputedStyle;
    delete globalThis.requestAnimationFrame;
    delete globalThis.matchMedia;
  });

  it('marca como visto al finalizar y destruye la única instancia activa', async () => {
    const sessions = installFakeDriver();
    const seen = [];
    expect(await startDriverToolOnboarding('QueryExplorer', { onSeen: (tool) => seen.push(tool) })).toBe(true);
    expect(getActiveDriverOnboardingTool()).toBe('QueryExplorer');
    sessions[0].config.onDoneClick();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual(['QueryExplorer']);
    expect(getActiveDriverOnboardingTool()).toBe(null);
  });

  it('trata cierre y destrucción externa como salto', async () => {
    const sessions = installFakeDriver();
    const seen = [];
    await startDriverToolOnboarding('QueryExplorer', { onSeen: (tool) => seen.push(tool) });
    sessions[0].config.onCloseClick();
    await Promise.resolve();
    expect(seen).toEqual(['QueryExplorer']);

    await startDriverToolOnboarding('QueryExplorer', { onSeen: (tool) => seen.push(tool) });
    sessions[1].config.onDestroyed();
    await Promise.resolve();
    expect(seen).toEqual(['QueryExplorer', 'QueryExplorer']);
  });

  it('marca Escape o backdrop aunque Driver destruya durante la animacion inicial', async () => {
    const sessions = installFakeDriver();
    const seen = [];
    await startDriverToolOnboarding('QueryExplorer', { onSeen: (tool) => seen.push(tool) });
    sessions[0].config.onDestroyStarted();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual(['QueryExplorer']);
    expect(getActiveDriverOnboardingTool()).toBe(null);
  });

  it('marca el tour anterior al navegar a otra herramienta', async () => {
    installFakeDriver();
    const seen = [];
    await startDriverToolOnboarding('QueryExplorer', { onSeen: (tool) => seen.push(tool) });
    await dismissDriverOnboardingForNavigation('RestExplorer');
    expect(seen).toEqual(['QueryExplorer']);
    expect(getActiveDriverOnboardingTool()).toBe(null);
  });

  it('no intenta cambiar de vista en una herramienta de pantalla única', async () => {
    installFakeDom(['ApexTests']);
    document.body.dataset.workbenchTab = 'main';
    const sessions = installFakeDriver();

    await startDriverToolOnboarding('ApexTests', { manual: true });
    expect(document.body.dataset.workbenchTab).toBe('main');
    sessions[0].config.onDoneClick();
    await Promise.resolve();
    expect(document.body.dataset.workbenchTab).toBe('main');
  });

  it('no marca como visto si Driver.js falla antes de mostrarse', async () => {
    const seen = [];
    setDriverFactoryForTests(() => { throw new Error('driver init failed'); });
    expect(await startDriverToolOnboarding('QueryExplorer', { onSeen: (tool) => seen.push(tool) })).toBe(false);
    expect(seen).toEqual([]);
    expect(getActiveDriverOnboardingTool()).toBe(null);
  });
});
