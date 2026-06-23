import { describe, it, expect } from 'vitest';
import {
  parsePopupControlsPayload,
  buildNoticeFingerprint,
  resolveNoticeText,
  resolveDismissLabelText,
  resolveOpenAppTooltip,
  isRemoteNoticeActive,
  isOpenAppDisabled,
  shouldShowRemoteNotice,
  shouldShowLegacyTelemetryNotice
} from '../shared/popupControls.js';

describe('parsePopupControlsPayload', () => {
  it('devuelve defaults sin payload', () => {
    const cfg = parsePopupControlsPayload(null);
    expect(cfg.flagActive).toBe(false);
    expect(cfg.notice).toBeNull();
    expect(cfg.openApp.disabled).toBe(false);
  });

  it('parsea aviso remoto activo', () => {
    const cfg = parsePopupControlsPayload(
      {
        version: 1,
        notice: {
          enabled: true,
          es: 'Aviso ES',
          en: 'Notice EN',
          severity: 'warn',
          frequency: 'always',
          dismissible: false
        },
        openApp: { disabled: true, message: { es: 'No', en: 'No' } }
      },
      { flagActive: true }
    );
    expect(cfg.flagActive).toBe(true);
    expect(cfg.notice?.severity).toBe('warn');
    expect(cfg.notice?.frequency).toBe('always');
    expect(cfg.notice?.dismissible).toBe(false);
    expect(cfg.openApp.disabled).toBe(true);
  });

  it('ignora notice si enabled es false', () => {
    const cfg = parsePopupControlsPayload(
      { notice: { enabled: false, es: 'x', en: 'y' } },
      { flagActive: true }
    );
    expect(cfg.notice).toBeNull();
  });
});

describe('popup notice helpers', () => {
  const notice = {
    enabled: true,
    es: 'Hola',
    en: 'Hello',
    severity: 'info',
    frequency: 'once',
    dismissible: true,
    dismissLabel: { es: 'Ok', en: 'Ok' }
  };

  it('resuelve texto por idioma', () => {
    expect(resolveNoticeText(notice, 'es')).toBe('Hola');
    expect(resolveNoticeText(notice, 'en')).toBe('Hello');
    expect(resolveDismissLabelText(notice, 'es')).toBe('Ok');
  });

  it('fingerprint cambia si cambia el texto', () => {
    const a = buildNoticeFingerprint(notice);
    const b = buildNoticeFingerprint({ ...notice, es: 'Otro' });
    expect(a).not.toBe(b);
  });

  it('shouldShowRemoteNotice respeta frequency once', () => {
    const cfg = parsePopupControlsPayload(
      { notice: { enabled: true, es: 'a', en: 'b', severity: 'info' } },
      { flagActive: true }
    );
    const fp = buildNoticeFingerprint(cfg.notice);
    expect(shouldShowRemoteNotice(cfg, { dismissedFingerprint: null })).toBe(true);
    expect(shouldShowRemoteNotice(cfg, { dismissedFingerprint: fp })).toBe(false);
  });

  it('shouldShowRemoteNotice siempre con frequency always', () => {
    const cfg = parsePopupControlsPayload(
      {
        notice: { enabled: true, es: 'a', en: 'b', severity: 'info', frequency: 'always' }
      },
      { flagActive: true }
    );
    const fp = buildNoticeFingerprint(cfg.notice);
    expect(shouldShowRemoteNotice(cfg, { dismissedFingerprint: fp })).toBe(true);
  });

  it('no muestra aviso legacy si el flag remoto está apagado', () => {
    const off = parsePopupControlsPayload(null);
    expect(shouldShowLegacyTelemetryNotice(off, { legacyTelemetryDismissed: false })).toBe(false);
    expect(shouldShowLegacyTelemetryNotice(off, { legacyTelemetryDismissed: true })).toBe(false);
    const onDisabled = parsePopupControlsPayload(
      { notice: { enabled: false } },
      { flagActive: true }
    );
    expect(shouldShowLegacyTelemetryNotice(onDisabled, { legacyTelemetryDismissed: false })).toBe(
      false
    );
  });

  it('openApp disabled solo con flag activo', () => {
    expect(isOpenAppDisabled(parsePopupControlsPayload({ openApp: { disabled: true } }))).toBe(false);
    expect(
      isOpenAppDisabled(
        parsePopupControlsPayload({ openApp: { disabled: true } }, { flagActive: true })
      )
    ).toBe(true);
  });

  it('resolveOpenAppTooltip', () => {
    const cfg = parsePopupControlsPayload(
      { openApp: { disabled: true, message: { es: 'Fuera', en: 'Down' } } },
      { flagActive: true }
    );
    expect(resolveOpenAppTooltip(cfg.openApp, 'es')).toBe('Fuera');
    expect(isRemoteNoticeActive(cfg)).toBe(false);
  });
});

describe('segmentación por versión de extensión', () => {
  it('aviso solo desde minVersion', () => {
    const cfg = parsePopupControlsPayload(
      {
        notice: {
          enabled: true,
          es: 'Nuevo aviso',
          en: 'New notice',
          severity: 'info',
          minVersion: '2.14'
        }
      },
      { flagActive: true }
    );
    expect(isRemoteNoticeActive(cfg, '2.13')).toBe(false);
    expect(isRemoteNoticeActive(cfg, '2.14')).toBe(true);
    expect(shouldShowRemoteNotice(cfg, { dismissedFingerprint: null }, '2.14')).toBe(true);
  });

  it('openApp disabled solo en versiones indicadas', () => {
    const cfg = parsePopupControlsPayload(
      {
        openApp: {
          disabled: true,
          excludeVersions: ['2.13'],
          message: { es: 'No', en: 'No' }
        }
      },
      { flagActive: true }
    );
    expect(isOpenAppDisabled(cfg, '2.13')).toBe(false);
    expect(isOpenAppDisabled(cfg, '2.14')).toBe(true);
  });

  it('payload raíz fuera de rango no aplica controles', () => {
    const cfg = parsePopupControlsPayload(
      {
        maxVersion: '2.12',
        openApp: { disabled: true }
      },
      { flagActive: true }
    );
    expect(isOpenAppDisabled(cfg, '2.13')).toBe(false);
    expect(isOpenAppDisabled(cfg, '2.12')).toBe(true);
  });
});
