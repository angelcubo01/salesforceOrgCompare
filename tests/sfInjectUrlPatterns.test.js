import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APEX_DEBUG_LOGS_HOME_RE,
  APEX_DEBUG_LOGS_SETUP_RE,
  extractApexLogId,
  isApexDebugLogsClassicFrame,
  isApexDebugLogsHomePage,
  isApexDebugLogsInjectPage,
  isApexDebugLogsSetupPage,
  normalizeApexLogId
} from '../sfInject/content/matchers/debugLogPages.js';
import {
  isSfInjectIntegrationEnabled,
  normalizeSfInjectConfig
} from '../sfInject/lib/settings.js';
import { SF_INJECT_INTEGRATION_IDS, SF_INJECT_SHIPPED } from '../sfInject/lib/registry.js';

describe('isApexDebugLogsHomePage', () => {
  it('matches Lightning Setup Debug Logs home', () => {
    expect(
      isApexDebugLogsHomePage(
        'https://myorg.lightning.force.com/lightning/setup/ApexDebugLogs/home'
      )
    ).toBe(true);
  });

  it('matches salesforce-setup.com Debug Logs home', () => {
    expect(
      isApexDebugLogsHomePage(
        'https://myorg.my.salesforce-setup.com/lightning/setup/ApexDebugLogs/home'
      )
    ).toBe(true);
  });

  it('rejects ApexDebugLogs /page (use isApexDebugLogsSetupPage)', () => {
    expect(
      isApexDebugLogsHomePage(
        'https://myorg.lightning.force.com/lightning/setup/ApexDebugLogs/page?address=%2F07L'
      )
    ).toBe(false);
  });

  it('rejects unrelated Setup pages', () => {
    expect(
      isApexDebugLogsHomePage(
        'https://myorg.lightning.force.com/lightning/setup/ApexClasses/home'
      )
    ).toBe(false);
  });

  it('rejects non-SF URLs', () => {
    expect(isApexDebugLogsHomePage('https://example.com/')).toBe(false);
  });

  it('exports stable regex', () => {
    expect(APEX_DEBUG_LOGS_HOME_RE.test('/lightning/setup/ApexDebugLogs/home')).toBe(true);
    expect(APEX_DEBUG_LOGS_HOME_RE.test('/lightning/setup/ApexDebugLogs/home/')).toBe(true);
  });
});

describe('isApexDebugLogsSetupPage', () => {
  it('matches home and filtered /page shell', () => {
    expect(
      isApexDebugLogsSetupPage(
        'https://myorg.lightning.force.com/lightning/setup/ApexDebugLogs/home'
      )
    ).toBe(true);
    expect(
      isApexDebugLogsSetupPage(
        'https://caixabankcc--devservic2.sandbox.my.salesforce-setup.com/lightning/setup/ApexDebugLogs/page?address=%2Fsetup%2Fui%2FlistApexTraces.apexp%3Ffcf%3D00B'
      )
    ).toBe(true);
    expect(APEX_DEBUG_LOGS_SETUP_RE.test('/lightning/setup/ApexDebugLogs/page')).toBe(true);
  });

  it('rejects unrelated Setup pages', () => {
    expect(
      isApexDebugLogsSetupPage(
        'https://myorg.lightning.force.com/lightning/setup/ApexClasses/home'
      )
    ).toBe(false);
  });
});

describe('isApexDebugLogsClassicFrame', () => {
  it('matches listApexTraces.apexp iframe', () => {
    expect(
      isApexDebugLogsClassicFrame(
        'https://myorg.my.salesforce-setup.com/setup/ui/listApexTraces.apexp?isdtp=p1'
      )
    ).toBe(true);
  });

  it('rejects other setup pages', () => {
    expect(
      isApexDebugLogsClassicFrame(
        'https://myorg.my.salesforce.com/setup/ui/listApexClasses.apexp'
      )
    ).toBe(false);
  });
});

describe('isApexDebugLogsInjectPage', () => {
  it('accepts Lightning home, /page and Classic frame', () => {
    expect(
      isApexDebugLogsInjectPage(
        'https://myorg.lightning.force.com/lightning/setup/ApexDebugLogs/home'
      )
    ).toBe(true);
    expect(
      isApexDebugLogsInjectPage(
        'https://caixabankcc--devservic2.sandbox.my.salesforce-setup.com/lightning/setup/ApexDebugLogs/page?address=%2Fsetup%2Fui%2FlistApexTraces.apexp'
      )
    ).toBe(true);
    expect(
      isApexDebugLogsInjectPage(
        'https://myorg.sandbox.my.salesforce.com/setup/ui/listApexTraces.apexp'
      )
    ).toBe(true);
  });

  it('rejects Lightning home shell unrelated paths', () => {
    expect(
      isApexDebugLogsInjectPage('https://myorg.lightning.force.com/lightning/o/Account/list')
    ).toBe(false);
  });
});

describe('extractApexLogId', () => {
  it('extracts 15-char ApexLog id', () => {
    expect(extractApexLogId('Log 07L000000000001 available')).toBe('07L000000000001');
  });

  it('extracts 18-char id', () => {
    expect(extractApexLogId('/07L000000000001ABC/view')).toBe('07L000000000001ABC');
  });

  it('extracts id from apexLogId query param', () => {
    expect(extractApexLogId('/setup/ui/page?apexLogId=07L000000000001ABC')).toBe(
      '07L000000000001ABC'
    );
  });

  it('returns null when no id', () => {
    expect(extractApexLogId('no log here')).toBeNull();
  });

  it('normalizeApexLogId rejects garbage', () => {
    expect(normalizeApexLogId('../etc/passwd')).toBeNull();
    expect(normalizeApexLogId('07L000000000001')).toBe('07L000000000001');
  });
});

describe('sfInject registry', () => {
  it('lists only shipped integrations', () => {
    expect(SF_INJECT_INTEGRATION_IDS).toEqual(SF_INJECT_SHIPPED.map((item) => item.id));
    expect(SF_INJECT_INTEGRATION_IDS).toContain('debugLogOpenViewer');
    expect(SF_INJECT_INTEGRATION_IDS).toContain('debugLogsTableOrder');
    expect(SF_INJECT_INTEGRATION_IDS).toContain('userTraceFlagsEnhance');
  });
});

describe('sfInject settings', () => {
  it('defaults all integrations disabled (opt-in)', () => {
    const cfg = normalizeSfInjectConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.integrations.debugLogOpenViewer).toBe(false);
    expect(cfg.integrations.debugLogsTableOrder).toBe(false);
    expect(cfg.integrations.userTraceFlagsEnhance).toBe(false);
    expect(cfg.prefs.userTraceFlagsActiveOnly).toBe(false);
  });

  it('requires master toggle for integration', () => {
    const cfg = normalizeSfInjectConfig({ enabled: false, integrations: { debugLogOpenViewer: true } });
    expect(isSfInjectIntegrationEnabled(cfg, 'debugLogOpenViewer')).toBe(false);
  });

  it('allows integration when master on', () => {
    const cfg = normalizeSfInjectConfig({ enabled: true, integrations: { debugLogOpenViewer: true } });
    expect(isSfInjectIntegrationEnabled(cfg, 'debugLogOpenViewer')).toBe(true);
  });

  it('respects per-integration false', () => {
    const cfg = normalizeSfInjectConfig({
      enabled: true,
      integrations: { debugLogOpenViewer: false }
    });
    expect(isSfInjectIntegrationEnabled(cfg, 'debugLogOpenViewer')).toBe(false);
  });
});

describe('sfInject manifest privacy', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

  it('does not register content scripts on all Salesforce pages', () => {
    const matches = manifest.content_scripts?.flatMap((cs) => cs.matches || []) || [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(
          m.includes('ApexDebugLogs') ||
          m.includes('listApexTraces.apexp') ||
          m.includes('DeployStatus') ||
          m.includes('monitorDeployment.apexp') ||
          m.includes('monitorDeploymentsDetails.apexp')
      ).toBe(true);
      expect(m).not.toBe('https://*.salesforce.com/*');
      expect(m).not.toBe('https://*.lightning.force.com/*');
    }
  });

  it('does not expose web_accessible_resources to https://*/*', () => {
    const wars = manifest.web_accessible_resources || [];
    for (const war of wars) {
      expect(war.matches || []).not.toContain('https://*/*');
    }
  });
});
