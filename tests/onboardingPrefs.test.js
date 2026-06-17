import { describe, it, expect } from 'vitest';
import {
  ALL_ONBOARDING_TOOLS,
  normalizeOnboardingPrefs,
  hasSeenTool,
  markToolSeenInPrefs,
  markHelpOpenedInPrefs,
  hasSeenTelemetryNotice,
  markTelemetryNoticeDismissedInPrefs,
  hasDismissedPopupNotice,
  markPopupNoticeDismissedInPrefs
} from '../shared/onboardingPrefs.js';
import { t, setLang } from '../shared/i18n.js';

const HELP_MODES = ['home', 'comparator', 'development', 'analysis', 'monitoring', 'manifests'];

describe('onboardingPrefs', () => {
  it('normaliza prefs vacías', () => {
    expect(normalizeOnboardingPrefs(null)).toEqual({
      tools: {},
      helpOpened: false,
      telemetryNoticeDismissed: false,
      popupNoticeDismissedFingerprint: null
    });
    expect(normalizeOnboardingPrefs(undefined)).toEqual({
      tools: {},
      helpOpened: false,
      telemetryNoticeDismissed: false,
      popupNoticeDismissedFingerprint: null
    });
  });

  it('conserva herramientas vistas y helpOpened', () => {
    const raw = { tools: { QueryExplorer: true, bad: 'x' }, helpOpened: true };
    const p = normalizeOnboardingPrefs(raw);
    expect(p.tools.QueryExplorer).toBe(true);
    expect(p.tools.bad).toBe(true);
    expect(p.helpOpened).toBe(true);
  });

  it('hasSeenTool ignora herramienta vacía o desconocida', () => {
    const prefs = normalizeOnboardingPrefs({ tools: {} });
    expect(hasSeenTool(prefs, '')).toBe(true);
    expect(hasSeenTool(prefs, 'UnknownTool')).toBe(true);
  });

  it('markToolSeenInPrefs es idempotente', () => {
    let prefs = normalizeOnboardingPrefs(null);
    expect(hasSeenTool(prefs, 'PermissionDiff')).toBe(false);
    prefs = markToolSeenInPrefs(prefs, 'PermissionDiff');
    prefs = markToolSeenInPrefs(prefs, 'PermissionDiff');
    expect(hasSeenTool(prefs, 'PermissionDiff')).toBe(true);
    expect(prefs.tools.PermissionDiff).toBe(true);
  });

  it('markHelpOpenedInPrefs', () => {
    const prefs = markHelpOpenedInPrefs(normalizeOnboardingPrefs(null));
    expect(prefs.helpOpened).toBe(true);
  });

  it('aviso de telemetría del popup solo la primera vez', () => {
    let prefs = normalizeOnboardingPrefs(null);
    expect(hasSeenTelemetryNotice(prefs)).toBe(false);
    prefs = markTelemetryNoticeDismissedInPrefs(prefs);
    prefs = markTelemetryNoticeDismissedInPrefs(prefs);
    expect(hasSeenTelemetryNotice(prefs)).toBe(true);
    expect(prefs.telemetryNoticeDismissed).toBe(true);
  });

  it('dismiss de aviso remoto por fingerprint', () => {
    let prefs = normalizeOnboardingPrefs(null);
    expect(hasDismissedPopupNotice(prefs, 'pn_abc')).toBe(false);
    prefs = markPopupNoticeDismissedInPrefs(prefs, 'pn_abc');
    expect(hasDismissedPopupNotice(prefs, 'pn_abc')).toBe(true);
    expect(hasDismissedPopupNotice(prefs, 'pn_other')).toBe(false);
  });

  it('lista de herramientas alineada con onboarding (17)', () => {
    expect(ALL_ONBOARDING_TOOLS).toHaveLength(17);
    expect(ALL_ONBOARDING_TOOLS).toContain('Comparator');
    expect(ALL_ONBOARDING_TOOLS).toContain('FieldHistory');
    expect(ALL_ONBOARDING_TOOLS).toContain('LightningQuickEdit');
    expect(ALL_ONBOARDING_TOOLS).toContain('DeployStatus');
    expect(ALL_ONBOARDING_TOOLS).toContain('QueryExplorer');
    expect(ALL_ONBOARDING_TOOLS).toContain('DependencyExplorer');
  });
});

describe('popup help i18n keys', () => {
  for (const lang of ['es', 'en']) {
    it(`claves popup.help.* en ${lang}`, () => {
      setLang(lang);
      expect(t('popup.help.title')).not.toBe('popup.help.title');
      expect(t('popup.help.body1')).not.toBe('popup.help.body1');
      expect(t('popup.help.body6')).not.toBe('popup.help.body6');
    });

    it(`claves popup.telemetryNotice.* en ${lang}`, () => {
      setLang(lang);
      expect(t('popup.telemetryNotice.text')).not.toBe('popup.telemetryNotice.text');
      expect(t('popup.telemetryNotice.dismiss')).not.toBe('popup.telemetryNotice.dismiss');
    });
  }
});

describe('onboarding i18n keys', () => {
  for (const lang of ['es', 'en']) {
    it(`claves onboarding.tool.* en ${lang}`, () => {
      setLang(lang);
      for (const tool of ALL_ONBOARDING_TOOLS) {
        const prefix = `onboarding.tool.${tool}`;
        expect(t(`${prefix}.title`)).not.toBe(`${prefix}.title`);
        expect(t(`${prefix}.lead`)).not.toBe(`${prefix}.lead`);
        expect(t(`${prefix}.step1`)).not.toBe(`${prefix}.step1`);
      }
      expect(t('onboarding.gotIt')).not.toBe('onboarding.gotIt');
    });

    it(`claves help.mode.* en ${lang}`, () => {
      setLang(lang);
      expect(t('help.open')).not.toBe('help.open');
      expect(t('help.close')).not.toBe('help.close');
      for (const mode of HELP_MODES) {
        const titleKey = `help.mode.${mode}.title`;
        expect(t(titleKey)).not.toBe(titleKey);
        expect(t(`help.mode.${mode}.body1`)).not.toBe(`help.mode.${mode}.body1`);
      }
    });
  }
});
