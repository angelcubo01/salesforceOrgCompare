import { describe, it, expect } from 'vitest';
import {
  parseFeatureControlsPayload,
  parseFeatureControlMessage,
  isModeVisible,
  isToolVisible,
  isMetadataTypeVisible,
  isActionDisabled,
  getToolNotice,
  getGlobalNotice,
  getActionNotice,
  resolveFeatureControlMessageText,
  DEFAULT_FEATURE_CONTROLS
} from '../shared/featureControls.js';

describe('parseFeatureControlsPayload', () => {
  it('devuelve defaults si el payload es inválido', () => {
    const cfg = parseFeatureControlsPayload(null);
    expect(cfg.version).toBe(1);
    expect(cfg.global).toBeNull();
    expect(cfg.tools).toEqual({});
  });

  it('parsea payload JSON string', () => {
    const cfg = parseFeatureControlsPayload(
      JSON.stringify({ version: 1, tools: { ApexTests: { hidden: true } } })
    );
    expect(cfg.tools.ApexTests).toEqual({ hidden: true });
  });

  it('ignora entradas vacías', () => {
    const cfg = parseFeatureControlsPayload({
      tools: { ApexTests: { hidden: false } }
    });
    expect(cfg.tools).toEqual({});
  });
});

describe('visibilidad y acciones', () => {
  const cfg = parseFeatureControlsPayload({
    version: 1,
    modes: { development: { hidden: true } },
    tools: { ApexTests: { hidden: true } },
    metadataTypes: { Profile: { hidden: true } },
    actions: { deploy: { disabled: true } }
  });

  it('oculta modo development', () => {
    expect(isModeVisible(cfg, 'development')).toBe(false);
    expect(isModeVisible(cfg, 'comparator')).toBe(true);
  });

  it('oculta herramienta ApexTests', () => {
    expect(isToolVisible(cfg, 'ApexTests')).toBe(false);
    expect(isToolVisible(cfg, 'QuickEdit')).toBe(true);
  });

  it('oculta tipo Profile', () => {
    expect(isMetadataTypeVisible(cfg, 'Profile')).toBe(false);
    expect(isMetadataTypeVisible(cfg, 'ApexClass')).toBe(true);
  });

  it('deshabilita deploy', () => {
    expect(isActionDisabled(cfg, 'deploy')).toBe(true);
    expect(isActionDisabled(cfg, 'retrieve')).toBe(false);
  });
});

describe('avisos', () => {
  const cfg = parseFeatureControlsPayload({
    global: {
      message: { es: 'Aviso global', en: 'Global notice', severity: 'warn', blocking: false }
    },
    tools: {
      ApexTests: {
        message: {
          es: 'Tests off',
          en: 'Tests off EN',
          severity: 'error',
          blocking: true,
          url: 'https://example.com/status'
        }
      }
    },
    actions: {
      deploy: {
        disabled: true,
        message: { es: 'No deploy', en: 'No deploy EN', severity: 'error' }
      }
    }
  });

  it('resuelve texto por idioma', () => {
    expect(resolveFeatureControlMessageText(cfg.global.message, 'es')).toBe('Aviso global');
    expect(resolveFeatureControlMessageText(cfg.global.message, 'en')).toBe('Global notice');
  });

  it('getToolNotice respeta blocking y url', () => {
    const notice = getToolNotice(cfg, 'ApexTests', 'en');
    expect(notice?.message).toBe('Tests off EN');
    expect(notice?.blocking).toBe(true);
    expect(notice?.url).toBe('https://example.com/status');
  });

  it('getGlobalNotice', () => {
    expect(getGlobalNotice(cfg, 'es')?.message).toBe('Aviso global');
  });

  it('getActionNotice', () => {
    expect(getActionNotice(cfg, 'deploy', 'es')?.message).toBe('No deploy');
  });
});

describe('parseFeatureControlMessage', () => {
  it('rechaza mensaje sin texto', () => {
    expect(parseFeatureControlMessage({ severity: 'error' })).toBeNull();
  });

  it('usa warn por defecto', () => {
    const m = parseFeatureControlMessage({ es: 'hola' });
    expect(m?.severity).toBe('warn');
  });
});

describe('DEFAULT_FEATURE_CONTROLS', () => {
  it('todo visible por defecto', () => {
    expect(isToolVisible(DEFAULT_FEATURE_CONTROLS, 'ApexTests')).toBe(true);
    expect(isActionDisabled(DEFAULT_FEATURE_CONTROLS, 'deploy')).toBe(false);
  });
});
