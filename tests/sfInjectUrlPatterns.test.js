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
  SF_INJECT_GLOBAL_QUICK_LINKS_KEY,
  isSfInjectIntegrationEnabled,
  normalizeSfInjectConfig
} from '../sfInject/lib/settings.js';
import { SF_INJECT_INTEGRATION_IDS, SF_INJECT_SHIPPED } from '../sfInject/lib/registry.js';
import {
  QUICK_LINKS_SALESFORCE_HOST_SUFFIXES,
  isQuickLinksSalesforcePage
} from '../sfInject/content/matchers/quickLinksPages.js';
import {
  buildCustomQuickLinkUrl,
  buildSfocQuickLinkUrl,
  hasConfiguredQuickLinks
} from '../sfInject/content/injectors/quickLinksTestButton.js';
import { SFOC_QUICK_LINK_ICON_PATHS, resolveQuickLinkIcon } from '../sfInject/lib/quickLinkIcons.js';

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
    expect(SF_INJECT_INTEGRATION_IDS).toContain('quickLinks');
  });
});

describe('Quick links Salesforce matcher', () => {
  it('matches every Salesforce UI URL, not only Custom Settings', () => {
    expect(
      isQuickLinksSalesforcePage(
        'https://caixabankcc--intservic2.sandbox.my.salesforce-setup.com/lightning/setup/CustomSettings/home'
      )
    ).toBe(true);
    expect(
      isQuickLinksSalesforcePage('https://myorg.lightning.force.com/lightning/o/Account/list')
    ).toBe(true);
    expect(isQuickLinksSalesforcePage('https://myorg.my.salesforce.com/lightning/page/home')).toBe(true);
    expect(QUICK_LINKS_SALESFORCE_HOST_SUFFIXES).toContain('.lightning.force.com');
  });

  it('rejects non-Salesforce hosts', () => {
    expect(isQuickLinksSalesforcePage('https://example.com/lightning/o/Account/list')).toBe(false);
  });
});

describe('Quick links injection guard', () => {
  it('only permits the header button when the active org has links', () => {
    expect(hasConfiguredQuickLinks({ quickLinks: [] })).toBe(false);
    expect(hasConfiguredQuickLinks({})).toBe(false);
    expect(hasConfiguredQuickLinks({ quickLinks: [{ id: 'support' }] })).toBe(true);
  });

  it('opens custom routes in the active Salesforce domain only', () => {
    expect(buildCustomQuickLinkUrl('/lightning/o/Account/list', 'https://prod.lightning.force.com'))
      .toBe('https://prod.lightning.force.com/lightning/o/Account/list');
    expect(buildCustomQuickLinkUrl('https://example.com', 'https://prod.lightning.force.com')).toBe('');
  });

  it('builds SFOC tool links with the active org preselected', () => {
    const originalChrome = globalThis.chrome;
    globalThis.chrome = { runtime: { getURL: (path) => `chrome-extension://test/${path}` } };
    try {
      expect(buildSfocQuickLinkUrl('DeployStatus', '00D000000000001')).toBe(
        'chrome-extension://test/code/code.html?nav=monitoring&op=DeployStatus&left=00D000000000001'
      );
    } finally {
      if (originalChrome === undefined) delete globalThis.chrome;
      else globalThis.chrome = originalChrome;
    }
  });

  it('uses the SFOC tool icon in the Salesforce menu, including legacy links', () => {
    for (const [toolId, expectedIcon] of Object.entries({
      DeployStatus: 'rocket', DebugLogBrowser: 'file-search', AnonymousApex: 'terminal-2'
    })) {
      const icon = resolveQuickLinkIcon({ type: 'sfoc', toolId, icon: 'link' });
      expect(icon).toBe(expectedIcon);
    }
    expect(SFOC_QUICK_LINK_ICON_PATHS['file-search']).toBeTruthy();
  });
});

describe('sfInject settings', () => {
  it('defaults all integrations disabled (opt-in)', () => {
    const cfg = normalizeSfInjectConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.integrations.debugLogOpenViewer).toBe(false);
    expect(cfg.integrations.debugLogsTableOrder).toBe(false);
    expect(cfg.integrations.userTraceFlagsEnhance).toBe(false);
    expect(cfg.integrations.quickLinks).toBe(false);
    expect(cfg.quickLinks).toEqual({});
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

  it('preserves relative quick links grouped by org and normalizes their display fields', () => {
    const cfg = normalizeSfInjectConfig({
      quickLinks: {
        '00D000000000001': [{
          id: 'support', type: 'custom', label: 'Soporte', url: '/lightning/page/support',
          icon: 'bookmark', color: '#F9B642'
        }]
      }
    });
    expect(cfg.quickLinks['00D000000000001']).toEqual([{
      id: 'support', type: 'custom', label: 'Soporte', toolId: '',
      url: '/lightning/page/support', icon: 'bookmark', color: '#f9b642'
    }]);
  });

  it('keeps the global template separate and rejects absolute custom URLs', () => {
    const cfg = normalizeSfInjectConfig({
      quickLinks: {
        [SF_INJECT_GLOBAL_QUICK_LINKS_KEY]: [
          { id: 'home', type: 'custom', label: 'Inicio', url: '/lightning/page/home' }
        ],
        '00D000000000001': [
          { id: 'invalid', type: 'custom', label: 'Externo', url: 'https://example.test' }
        ]
      }
    });
    expect(cfg.quickLinks[SF_INJECT_GLOBAL_QUICK_LINKS_KEY].map((link) => link.id)).toEqual(['home']);
    expect(cfg.quickLinks['00D000000000001'][0].url).toBe('');
  });

  it('keeps a single SFOC tool per environment', () => {
    const cfg = normalizeSfInjectConfig({
      quickLinks: {
        '00D000000000001': [
          { id: 'comparator-1', type: 'sfoc', toolId: 'comparator' },
          { id: 'comparator-2', type: 'sfoc', toolId: 'comparator' },
          { id: 'deployments', type: 'sfoc', toolId: 'deployments' }
        ]
      }
    });
    expect(cfg.quickLinks['00D000000000001'].map((link) => link.id)).toEqual([
      'comparator-1', 'deployments'
    ]);
  });
});

describe('sfInject manifest scope', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

  it('registers content scripts globally, but only on Salesforce domains', () => {
    const matches = manifest.content_scripts?.flatMap((cs) => cs.matches || []) || [];
    expect(matches.length).toBeGreaterThan(0);
    expect(matches).toContain('https://*.lightning.force.com/*');
    for (const m of matches) {
      expect(m).toMatch(/^https:\/\/\*\.(?:salesforce|my\.salesforce|force|lightning\.force|visual\.force|vf\.force|visualforce|cloudforce|salesforce-setup|my\.salesforce-setup)\.com\/\*$/);
    }
  });

  it('does not expose web_accessible_resources to https://*/*', () => {
    const wars = manifest.web_accessible_resources || [];
    for (const war of wars) {
      expect(war.matches || []).not.toContain('https://*/*');
    }
  });
});
