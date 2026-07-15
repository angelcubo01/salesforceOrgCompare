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
  markPopupNoticeDismissedInPrefs,
  hasSeenFirstInstallWelcome,
  markFirstInstallWelcomeDismissedInPrefs,
  shouldShowFirstInstallWelcome
} from '../shared/onboardingPrefs.js';
import {
  HELP_HOME_ID,
  HELP_TOOL_IDS,
  helpToolTitleKey,
  helpToolBodyKeys
} from '../shared/helpToolIds.js';
import { t, setLang } from '../shared/i18n.js';

describe('onboardingPrefs', () => {
  it('normaliza prefs vacías', () => {
    expect(normalizeOnboardingPrefs(null)).toEqual({
      tools: {},
      helpOpened: false,
      telemetryNoticeDismissed: false,
      popupNoticeDismissedFingerprint: null,
      firstInstallWelcomeDismissed: false
    });
    expect(normalizeOnboardingPrefs(undefined)).toEqual({
      tools: {},
      helpOpened: false,
      telemetryNoticeDismissed: false,
      popupNoticeDismissedFingerprint: null,
      firstInstallWelcomeDismissed: false
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

  it('modal de bienvenida solo la primera instalación', () => {
    let prefs = normalizeOnboardingPrefs(null);
    expect(hasSeenFirstInstallWelcome(prefs)).toBe(false);
    prefs = markFirstInstallWelcomeDismissedInPrefs(prefs);
    prefs = markFirstInstallWelcomeDismissedInPrefs(prefs);
    expect(hasSeenFirstInstallWelcome(prefs)).toBe(true);
    expect(prefs.firstInstallWelcomeDismissed).toBe(true);
  });

  it('no muestra bienvenida si ya hay entornos guardados', () => {
    const prefs = normalizeOnboardingPrefs(null);
    expect(shouldShowFirstInstallWelcome(prefs, 0)).toBe(true);
    expect(shouldShowFirstInstallWelcome(prefs, 1)).toBe(false);
    expect(shouldShowFirstInstallWelcome(prefs, 3)).toBe(false);
    const dismissed = markFirstInstallWelcomeDismissedInPrefs(prefs);
    expect(shouldShowFirstInstallWelcome(dismissed, 0)).toBe(false);
  });

  it('lista de herramientas alineada con onboarding (26)', () => {
    expect(ALL_ONBOARDING_TOOLS).toHaveLength(26);
    expect(ALL_ONBOARDING_TOOLS).toContain('Comparator');
    expect(ALL_ONBOARDING_TOOLS).toContain('FieldHistory');
    expect(ALL_ONBOARDING_TOOLS).toContain('LightningQuickEdit');
    expect(ALL_ONBOARDING_TOOLS).toContain('DeployStatus');
    expect(ALL_ONBOARDING_TOOLS).toContain('QueryExplorer');
    expect(ALL_ONBOARDING_TOOLS).toContain('DependencyExplorer');
    expect(ALL_ONBOARDING_TOOLS).toContain('MetadataTypeCompare');
    expect(ALL_ONBOARDING_TOOLS).toContain('CustomSettingsCompare');
    expect(ALL_ONBOARDING_TOOLS).toContain('CustomMetadataCompare');
    expect(ALL_ONBOARDING_TOOLS).toContain('RecordCompare');
    expect(ALL_ONBOARDING_TOOLS).toContain('DataWorkbench');
    expect(ALL_ONBOARDING_TOOLS).toContain('EventMonitor');
    expect(ALL_ONBOARDING_TOOLS).toContain('BulkJobMonitor');
    expect(ALL_ONBOARDING_TOOLS).toContain('ObjectDescribe');
    expect(ALL_ONBOARDING_TOOLS).toContain('RestExplorer');
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

    it(`claves popup.welcome.* en ${lang}`, () => {
      setLang(lang);
      expect(t('popup.welcome.title')).not.toBe('popup.welcome.title');
      expect(t('popup.welcome.subtitle')).not.toBe('popup.welcome.subtitle');
      expect(t('popup.welcome.step1.title')).not.toBe('popup.welcome.step1.title');
      expect(t('popup.welcome.step3.text')).not.toBe('popup.welcome.step3.text');
      expect(t('popup.welcome.sessionWarning.text')).not.toBe('popup.welcome.sessionWarning.text');
      expect(t('popup.welcome.cta')).not.toBe('popup.welcome.cta');
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

    it(`claves help.tool.* en ${lang}`, () => {
      setLang(lang);
      expect(t('help.open')).not.toBe('help.open');
      expect(t('help.close')).not.toBe('help.close');
      for (const toolId of HELP_TOOL_IDS) {
        const titleKey = helpToolTitleKey(toolId);
        expect(t(titleKey)).not.toBe(titleKey);
        for (const bodyKey of helpToolBodyKeys(toolId)) {
          expect(t(bodyKey)).not.toBe(bodyKey);
        }
      }
    });
  }
});

describe('helpToolIds', () => {
  it('incluye home y vistas auxiliares', () => {
    expect(HELP_TOOL_IDS).toContain(HELP_HOME_ID);
    expect(HELP_TOOL_IDS).toContain('ApexCoverageViewer');
    expect(HELP_TOOL_IDS.length).toBe(ALL_ONBOARDING_TOOLS.length + 2);
  });
});
