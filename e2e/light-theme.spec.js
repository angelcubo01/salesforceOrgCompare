import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  openExtensionPage,
  setLocalStorage,
  test,
  waitForCodeBoot
} from './extension.fixture.js';

const TOOL_ROUTES = [
  ['comparator', 'Comparator', 'standardComparePanel'],
  ['development', 'ApexTests', 'apexTestsPanel'],
  ['development', 'ApexCoverageCompare', 'apexCoverageComparePanel'],
  ['development', 'QuickEdit', 'quickEditPanel'],
  ['development', 'LightningQuickEdit', 'lightningQuickEditPanel'],
  ['development', 'AnonymousApex', 'anonymousApexPanel'],
  ['development', 'QueryExplorer', 'queryExplorerPanel'],
  ['development', 'RestExplorer', 'restExplorerPanel'],
  ['development', 'DebugLogBrowser', 'debugLogBrowserPanel'],
  ['development', 'EventMonitor', 'eventMonitorPanel'],
  ['analysis', 'FieldDependency', 'fieldDependencyPanel'],
  ['analysis', 'DependencyExplorer', 'dependencyExplorerPanel'],
  ['analysis', 'PermissionDiff', 'permissionDiffPanel'],
  ['analysis', 'CustomSettingsCompare', 'customSettingsComparePanel'],
  ['analysis', 'CustomMetadataCompare', 'customMetadataComparePanel'],
  ['analysis', 'RecordCompare', 'recordComparePanel'],
  ['analysis', 'ObjectDescribe', 'objectDescribePanel'],
  ['analysis', 'DataWorkbench', 'dataWorkbenchPanel'],
  ['monitoring', 'EnvironmentStatus', 'environmentStatusPanel'],
  ['monitoring', 'OrgLimits', 'orgLimitsPanel'],
  ['monitoring', 'DeployStatus', 'deployStatusPanel'],
  ['monitoring', 'BulkJobMonitor', 'bulkJobMonitorPanel'],
  ['monitoring', 'SetupAuditTrail', 'setupAuditTrailPanel'],
  ['monitoring', 'FieldHistory', 'fieldHistoryPanel'],
  ['manifests', 'GeneratePackageXml', 'generatePackageXmlPanel'],
  ['manifests', 'MetadataTypeCompare', 'metadataTypeComparePanel']
];

const seenTools = Object.fromEntries(TOOL_ROUTES.map(([, toolId]) => [toolId, true]));

function formatViolations(violations) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      failureSummary: node.failureSummary
    }))
  }));
}

async function analyze(page, selectors, rules = null) {
  let builder = new AxeBuilder({ page });
  builder = rules ? builder.withRules(rules) : builder.withTags(['wcag2a', 'wcag2aa']);
  for (const selector of selectors) builder = builder.include(selector);
  return builder.analyze();
}

async function ensureLightTheme(page) {
  if (await page.locator('html').getAttribute('data-ui-theme') !== 'light') {
    await page.locator('#workbenchThemeBtn').click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'light');
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ extensionWorker }) => {
  await setLocalStorage(extensionWorker, {
    sfocUiMode: 'v2',
    soc_language: 'es',
    soc_extension_config: { uiTheme: 'light', monacoTheme: 'sfoc-editor-light' },
    sfocFeatureControlsCache: {
      version: 1,
      rootVersionTarget: null,
      global: null,
      modes: {},
      tools: {},
      metadataTypes: {},
      actions: {}
    },
    sfocToolRecents: { recents: [], pins: [] },
    sfocOrgReadOnlyById: {},
    sfocWorkbenchPrefs: { panelExpanded: true, panelPinned: false, lastTabByWorkspace: {} },
    sfocOnboardingSeen: {
      tools: seenTools,
      helpOpened: true,
      telemetryNoticeDismissed: true,
      firstInstallWelcomeDismissed: true
    }
  });
});

test.afterEach(async ({ extensionContext, extensionWorker }) => {
  const extensionPages = extensionContext.pages().filter((page) => page.url() !== 'about:blank');
  await Promise.all(extensionPages.map((page) => page.close({ runBeforeUnload: false }).catch(() => {})));
  await setLocalStorage(extensionWorker, {
    sfocUiMode: 'v2',
    soc_extension_config: { uiTheme: 'dark', monacoTheme: 'sfoc-editor-dark' }
  });
});

test('los 26 Tool IDs conservan contraste WCAG A/AA en tema claro', async ({
  extensionContext: context,
  extensionId
}) => {
  test.setTimeout(180_000);
  const page = await openExtensionPage(context, extensionId, 'code/code.html');
  const violations = [];
  const requestedTools = new Set(String(process.env.SFOC_THEME_TOOL || '').split(',').filter(Boolean));
  const routes = requestedTools.size
    ? TOOL_ROUTES.filter(([, toolId]) => requestedTools.has(toolId))
    : TOOL_ROUTES;

  for (const [nav, op, panelId] of routes) {
    const route = new URL(page.url());
    route.search = new URLSearchParams({ nav, op }).toString();
    await page.goto(route.href, { waitUntil: 'domcontentloaded' });
    await waitForCodeBoot(page);
    await ensureLightTheme(page);
    await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'v2');
    await expect(page.locator(`#${panelId}`)).toBeVisible();
    const result = await analyze(page, ['#workbenchShell', '#workbenchContextHeader', `#${panelId}`], ['color-contrast']);
    if (result.violations.length) violations.push({ toolId: op, violations: formatViolations(result.violations) });
  }

  expect(violations).toEqual([]);
});

test('Home, command palette y modales cumplen WCAG A/AA en tema claro', async ({
  extensionContext: context,
  extensionId
}) => {
  const page = await openExtensionPage(context, extensionId, 'code/code.html');
  await waitForCodeBoot(page);
  await ensureLightTheme(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const home = await analyze(page, ['#workbenchShell', '#workbenchContextHeader', '#appLandingPanel']);
  expect(formatViolations(home.violations)).toEqual([]);

  await page.keyboard.press('Control+K');
  await expect(page.locator('#quickOpenOverlay')).toHaveAttribute('aria-hidden', 'false');
  const palette = await analyze(page, ['#quickOpenOverlay']);
  expect(formatViolations(palette.violations)).toEqual([]);
  await page.keyboard.press('Escape');

  for (const variant of ['standard', 'destructive', 'production', 'permission', 'session']) {
    await page.evaluate(async (modalVariant) => {
      const { openSfocModal } = await import('./ui/sfocModal.js');
      openSfocModal({
        title: modalVariant === 'destructive' ? 'Eliminar logs' : 'Ejecutar tests',
        description: modalVariant === 'destructive'
          ? 'Esta acción elimina todos los logs de la org y no se puede deshacer.'
          : 'Se encolará una ejecución de tests Apex en Mi Sandbox.',
        confirmLabel: modalVariant === 'destructive' ? 'Eliminar logs' : 'Ejecutar tests',
        variant: modalVariant,
        ...(modalVariant === 'production' ? {
          requiredText: 'CONFIRMO',
          requiredTextLabel: 'Confirma que has revisado el destino y el alcance',
          requiredTextHint: 'No necesitas introducir el nombre de la empresa.'
        } : {})
      });
    }, variant);
    const modal = await analyze(page, ['.sfoc-modal-backdrop']);
    expect(formatViolations(modal.violations), variant).toEqual([]);
    await page.keyboard.press('Escape');
  }
});

test('la confirmacion de riesgo usa CONFIRMO y no el nombre de la empresa', async ({
  extensionContext: context,
  extensionId
}) => {
  const page = await openExtensionPage(context, extensionId, 'code/code.html');
  await waitForCodeBoot(page);
  await page.evaluate(async () => {
    const [{ confirmSfocOrgAction }, { state }] = await Promise.all([
      import('./ui/sfocModal.js'),
      import('./core/state.js')
    ]);
    state.orgsList = [{
      id: 'prod-e2e',
      alias: 'Contact Center PROD',
      isSandbox: false,
      instanceUrl: 'https://example.my.salesforce.com'
    }];
    void confirmSfocOrgAction({
      orgId: 'prod-e2e',
      title: 'Desplegar en produccion',
      description: 'Todo listo para desplegar el componente en este entorno.',
      confirmLabel: 'Desplegar',
      risk: 'write'
    });
  });

  const modal = page.locator('.sfoc-modal-panel--production');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.sfoc-modal-org-copy strong')).toHaveText('Contact Center PROD');
  await expect(modal.locator('.sfoc-modal-confirm-token')).toHaveText('CONFIRMO');

  const input = modal.locator('.sfoc-modal-confirm-field input');
  const confirm = modal.locator('.sfoc-modal-actions .sfoc-btn--danger');
  await input.fill('Contact Center PROD');
  await expect(confirm).toBeDisabled();
  await input.fill(' confirmo ');
  await expect(input).toHaveClass(/is-valid/);
  await expect(confirm).toBeEnabled();
});

test('reflow y controles táctiles no provocan scroll global accidental', async ({
  extensionContext: context,
  extensionId
}) => {
  const page = await openExtensionPage(context, extensionId, 'code/code.html');
  await waitForCodeBoot(page);
  await ensureLightTheme(page);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 760, height: 900 },
    { width: 640, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  const undersizedPrimaryControls = await page.locator([
    '.workbench-category-button',
    '.workbench-tool-button',
    '.workbench-marketing-button',
    '.workbench-marketing-search'
  ].join(',')).evaluateAll((elements) => elements
    .filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return element.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden' && (rect.width < 44 || rect.height < 44);
    })
    .map((element) => ({
      id: element.id,
      className: element.className,
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height
    })));
  expect(undersizedPrimaryControls).toEqual([]);
});

test('comparador, formulario, tabla y editor cumplen WCAG A/AA completo', async ({
  extensionContext: context,
  extensionId
}) => {
  const page = await openExtensionPage(context, extensionId, 'code/code.html');
  const representatives = [
    ['comparator', 'Comparator', 'standardComparePanel'],
    ['development', 'QueryExplorer', 'queryExplorerPanel'],
    ['analysis', 'ObjectDescribe', 'objectDescribePanel'],
    ['development', 'QuickEdit', 'quickEditPanel']
  ];

  for (const [nav, op, panelId] of representatives) {
    const route = new URL(page.url());
    route.search = new URLSearchParams({ nav, op }).toString();
    await page.goto(route.href, { waitUntil: 'domcontentloaded' });
    await waitForCodeBoot(page);
    await ensureLightTheme(page);
    await expect(page.locator(`#${panelId}`)).toBeVisible();
    const result = await analyze(page, ['#workbenchShell', '#workbenchContextHeader', `#${panelId}`]);
    expect(formatViolations(result.violations), op).toEqual([]);
  }
});
