import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  openExtensionPage,
  setLocalStorage,
  test,
  waitForCodeBoot
} from './extension.fixture.js';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ extensionWorker }) => {
  const seenTools = Object.fromEntries([
    'Comparator', 'ApexTests', 'ApexCoverageCompare', 'QuickEdit', 'LightningQuickEdit',
    'AnonymousApex', 'QueryExplorer', 'RestExplorer', 'ObjectDescribe', 'DataWorkbench',
    'DebugLogBrowser', 'EventMonitor', 'FieldDependency', 'DependencyExplorer',
    'CustomSettingsCompare', 'CustomMetadataCompare', 'RecordCompare', 'EnvironmentStatus',
    'OrgLimits', 'DeployStatus', 'BulkJobMonitor', 'SetupAuditTrail', 'FieldHistory',
    'GeneratePackageXml', 'MetadataTypeCompare', 'PermissionDiff'
  ].map((tool) => [tool, true]));
  await setLocalStorage(extensionWorker, {
    sfocUiMode: 'v2',
    soc_language: 'es',
    sfocToolRecents: { recents: [], pins: [] },
    sfocWorkbenchPrefs: { panelExpanded: true, panelPinned: false, lastTabByWorkspace: {} },
    sfocOnboardingSeen: {
      tools: seenTools,
      helpOpened: true,
      telemetryNoticeDismissed: true,
      firstInstallWelcomeDismissed: true
    }
  });
});

test.afterEach(async ({ extensionContext }) => {
  const extensionPages = extensionContext.pages().filter((page) => page.url() !== 'about:blank');
  await Promise.all(extensionPages.map((page) => page.close({ runBeforeUnload: false }).catch(() => {})));
});

test('Classic y V2 comparten página y el popup aplica el cambio en la siguiente apertura', async ({ extensionContext: context, extensionId, extensionWorker }) => {
  await setLocalStorage(extensionWorker, {
    sfocUiMode: 'classic',
    sfocToolRecents: { recents: ['QueryExplorer'], pins: ['QueryExplorer'] }
  });
  const classic = await openExtensionPage(context, extensionId, 'code/code.html');
  await waitForCodeBoot(classic);
  await expect(classic.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
  await expect(classic.locator('#workbenchShell')).toHaveCount(0);
  await expect(classic.locator('.app-mode-tabs-wrap')).toBeVisible();

  const popup = await openExtensionPage(context, extensionId, 'popup/popup.html');
  const toggle = popup.locator('#popupUiModeToggle');
  await expect(toggle).not.toBeChecked();
  await toggle.focus();
  await toggle.press('Space');
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeEnabled();
  const v2Page = context.waitForEvent('page');
  await popup.locator('#openCodeBtn').click();
  const v2 = await v2Page;
  await waitForCodeBoot(v2);
  await expect(v2.locator('body')).toHaveAttribute('data-ui-mode', 'v2');
  await expect(classic.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
  await expect(classic.locator('.app-landing-tools-section--recents')).toBeVisible();
  await expect(v2.locator('.app-landing-tools-section--recents')).toHaveCount(0);
  await expect(v2.locator('#appLandingPinnedList')).toHaveCount(0);
  await expect(v2.locator('.workbench-category-button')).toHaveCount(6);
  await expect(v2.locator('#workbenchPanel, #workbenchRail, #workbenchPanelBackdrop')).toHaveCount(0);
  await expect(v2.locator('#workbenchLandingCategories')).toHaveCount(0);

  await v2.keyboard.press('Control+K');
  await expect(v2.locator('#quickOpenOverlay')).toHaveAttribute('aria-hidden', 'false');
  await expect(v2.locator('#quickOpenResults')).not.toContainText(/Ultima herramienta|Last tool|Recientes|Recent/i);
  await expect(v2.locator('#quickOpenResults')).toContainText('Favoritas');
  await v2.locator('#quickOpenInput').press('Escape');

  const sharedPrefs = await v2.evaluate(async () => chrome.storage.local.get(['sfocToolRecents', 'sfocWorkbenchPrefs']));
  expect(sharedPrefs.sfocToolRecents).toEqual({ recents: ['QueryExplorer'], pins: ['QueryExplorer'] });
  expect(sharedPrefs.sfocWorkbenchPrefs.panelExpanded).toBe(true);
});

test('barra superior, subbarra, tabs y command palette son operables por teclado', async ({ extensionContext: context, extensionId }) => {
  const page = await openExtensionPage(context, extensionId, 'code/code.html');
  await waitForCodeBoot(page);
  await expect(page.locator('#workbenchShell')).toBeVisible();
  await expect(page.locator('.workbench-category-button')).toHaveCount(6);

  const comparator = page.locator('#workbenchCategory-comparator');
  await comparator.click();
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'comparator');
  await expect(page.locator('#workbenchSubbarRegion')).toHaveAttribute('aria-hidden', 'true');
  await expect(comparator).not.toHaveAttribute('aria-expanded');
  await expect.poll(() => page.evaluate(() => Object.fromEntries(new URL(location.href).searchParams))).toMatchObject({
    nav: 'comparator', op: 'Comparator'
  });
  await page.locator('#workbenchCategory-home').click();
  await expect(page.locator('#workbenchContextTitle')).toHaveText('Inicio');

  const development = page.locator('#workbenchCategory-development');
  await development.click();
  await expect(page.locator('#workbenchSubbarRegion')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#workbenchToolSubbar .workbench-tool-button')).toHaveCount(7);
  const apexWorkspaceButton = page.getByRole('button', { name: /Calidad Apex/ });
  await apexWorkspaceButton.click();
  await expect(page.locator('#workbenchSubbarRegion')).toHaveAttribute('aria-hidden', 'true');
  const testsTab = page.locator('#workbenchTab-apex-quality-tests');
  await expect(testsTab).toHaveAttribute('aria-selected', 'true', { timeout: 500 });
  await testsTab.press('ArrowRight');
  await expect(page.locator('#workbenchTab-apex-quality-runs')).toHaveAttribute('aria-selected', 'true', { timeout: 500 });
  await expect.poll(() => page.evaluate(() => history.state?.sfocWorkbench?.tabId)).toBe('runs');

  await page.goBack();
  await expect(page.locator('#workbenchTab-apex-quality-tests')).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(page.locator('#workbenchTab-apex-quality-runs')).toHaveAttribute('aria-selected', 'true');

  await development.click();
  await page.getByRole('button', { name: /Editar código/ }).click();
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'code-studio', { timeout: 500 });
  await development.click();
  await page.getByRole('button', { name: /Calidad Apex/ }).click();
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'apex-quality', { timeout: 500 });

  await development.click();
  await development.click();
  await expect(page.locator('#workbenchSubbarRegion')).toHaveAttribute('aria-hidden', 'true');
  await development.click();
  await page.locator('#workbenchCategory-analysis').click();
  await expect(page.locator('#workbenchToolSubbar')).toContainText('Analizar permisos');
  await page.locator('#workbenchCategory-analysis').press('Escape');
  await expect(page.locator('#workbenchSubbarRegion')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#workbenchCategory-analysis')).toBeFocused();

  await development.click();
  await expect(page.locator('#workbenchSubbarRegion')).toHaveAttribute('aria-hidden', 'false');
  await page.locator('#workbenchContextHeader').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('#workbenchSubbarRegion')).toHaveAttribute('aria-hidden', 'true');

  await page.keyboard.press('Control+K');
  await expect(page.locator('#quickOpenOverlay')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#quickOpenInput')).toBeFocused();
  await page.locator('#quickOpenInput').fill('Query');
  await page.waitForTimeout(350);
  await expect(page.locator('#quickOpenResults .quick-open-item').first()).toBeVisible();
  await page.locator('#quickOpenInput').press('ArrowDown');
  await expect(page.locator('#quickOpenInput')).toHaveAttribute('aria-activedescendant', /quickOpenResult-/);
  await page.locator('#quickOpenInput').press('Escape');
  await expect(page.locator('#quickOpenOverlay')).toHaveAttribute('aria-hidden', 'true');

});

const legacyRoutes = [
  ['comparator', 'Comparator', 'comparator', 'main', 'standardComparePanel'],
  ['development', 'ApexTests', 'apex-quality', 'runs', 'apexTestsPanel'],
  ['development', 'ApexCoverageCompare', 'apex-quality', 'coverage', 'apexCoverageComparePanel'],
  ['development', 'QuickEdit', 'code-studio', 'apex-vf', 'quickEditPanel'],
  ['development', 'LightningQuickEdit', 'code-studio', 'lwc-aura', 'lightningQuickEditPanel'],
  ['development', 'AnonymousApex', 'anonymous-apex', 'main', 'anonymousApexPanel'],
  ['development', 'QueryExplorer', 'query-explorer', 'main', 'queryExplorerPanel'],
  ['development', 'RestExplorer', 'rest-explorer', 'main', 'restExplorerPanel'],
  ['development', 'DebugLogBrowser', 'diagnostics', 'logs', 'debugLogBrowserPanel'],
  ['development', 'EventMonitor', 'event-monitor', 'main', 'eventMonitorPanel'],
  ['analysis', 'FieldDependency', 'field-dependency', 'main', 'fieldDependencyPanel'],
  ['analysis', 'DependencyExplorer', 'dependencies', 'metadata', 'dependencyExplorerPanel'],
  ['analysis', 'PermissionDiff', 'security-access', 'main', 'permissionDiffPanel'],
  ['analysis', 'CustomSettingsCompare', 'data-compare', 'custom-settings', 'customSettingsComparePanel'],
  ['analysis', 'CustomMetadataCompare', 'data-compare', 'custom-metadata', 'customMetadataComparePanel'],
  ['analysis', 'RecordCompare', 'data-compare', 'records', 'recordComparePanel'],
  ['analysis', 'ObjectDescribe', 'object-describe', 'main', 'objectDescribePanel'],
  ['analysis', 'DataWorkbench', 'data-workbench', 'main', 'dataWorkbenchPanel'],
  ['monitoring', 'EnvironmentStatus', 'org-environments', 'main', 'environmentStatusPanel'],
  ['monitoring', 'OrgLimits', 'org-limits', 'main', 'orgLimitsPanel'],
  ['monitoring', 'DeployStatus', 'deploy-status', 'main', 'deployStatusPanel'],
  ['monitoring', 'BulkJobMonitor', 'bulk-job-monitor', 'main', 'bulkJobMonitorPanel'],
  ['monitoring', 'SetupAuditTrail', 'setup-audit', 'main', 'setupAuditTrailPanel'],
  ['monitoring', 'FieldHistory', 'field-history', 'main', 'fieldHistoryPanel'],
  ['manifests', 'GeneratePackageXml', 'generate-package', 'main', 'generatePackageXmlPanel'],
  ['manifests', 'MetadataTypeCompare', 'metadata-type-compare', 'main', 'metadataTypeComparePanel']
];

test('los 26 Tool IDs conservan ruta, workspace, tab, titulo y panel visible', async ({ extensionContext: context, extensionId }) => {
  test.setTimeout(120_000);
  const page = await openExtensionPage(context, extensionId, 'code/code.html');
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  for (const [nav, op, workspace, tab, panelId] of legacyRoutes) {
    const route = new URL(page.url());
    route.search = new URLSearchParams({ nav, op }).toString();
    await page.goto(route.href, { waitUntil: 'domcontentloaded' });
    await waitForCodeBoot(page);
    await expect(page.locator('body'), `${op}: workspace`).toHaveAttribute('data-workbench-workspace', workspace);
    await expect(page.locator('body'), `${op}: tab`).toHaveAttribute('data-workbench-tab', tab);
    await expect(page.locator('#typeSelect'), `${op}: Tool ID`).toHaveValue(op);
    await expect(page.locator('#workbenchContextTitle'), `${op}: titulo contextual`).not.toHaveText('');
    await expect(page.locator(`#${panelId}`), `${op}: panel`).toBeVisible();
  }
  expect(runtimeErrors).toEqual([]);
});

test('atrás/adelante y estado interno conservan el workspace', async ({ extensionContext: context, extensionId }) => {
  const page = await openExtensionPage(context, extensionId, 'code/code.html?nav=development&op=QueryExplorer');
  await waitForCodeBoot(page);
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'query-explorer');
  await page.locator('#workbenchCategory-development').click();
  await expect(page.locator('#workbenchToolSubbar')).toContainText('Editar código');
  await page.getByRole('button', { name: /Editar código/ }).click();
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'code-studio');
  await expect(page).toHaveURL(/op=QuickEdit/);
  await page.goBack();
  await expect(page).toHaveURL(/op=QueryExplorer/);
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'query-explorer');
  await page.goForward();
  await expect(page).toHaveURL(/op=QuickEdit/);
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'code-studio');
});

test('reiniciar el service worker conserva modo, preferencias y ruta', async ({ extensionContext: context, extensionId }) => {
  const page = await openExtensionPage(context, extensionId, 'code/code.html?nav=analysis&op=PermissionDiff');
  await waitForCodeBoot(page);
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'security-access');
  const session = await context.newCDPSession(page);
  await session.send('ServiceWorker.enable');
  await session.send('ServiceWorker.stopAllWorkers');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForCodeBoot(page);
  const response = await page.evaluate(async () => chrome.runtime.sendMessage({ type: 'listSavedOrgs' }));
  expect(response?.ok).not.toBe(false);
  const activeWorkers = context.serviceWorkers();
  expect(activeWorkers.length).toBeGreaterThan(0);
  await expect(activeWorkers.at(-1).evaluate(() => 'running')).resolves.toBe('running');
  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'v2');
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'security-access');
  const stored = await page.evaluate(async () => chrome.storage.local.get(['sfocUiMode', 'sfocWorkbenchPrefs']));
  expect(stored.sfocUiMode).toBe('v2');
  expect(stored.sfocWorkbenchPrefs.panelExpanded).toBe(true);
});

test('reflow, tema y WCAG A/AA del shell', async ({ extensionContext: context, extensionId }) => {
  const page = await openExtensionPage(context, extensionId, 'code/code.html');
  await waitForCodeBoot(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('#workbenchShell')).toBeVisible();
  await expect(page.locator('#workbenchOpenCommandPalette')).toHaveCount(0);

  // 640 CSS px reproduce el reflow de un viewport de 1280 px con zoom al 200 %.
  await page.setViewportSize({ width: 640, height: 450 });
  const shellFitsViewport = await page.locator('#workbenchShell').evaluate((shell) => (
    shell.getBoundingClientRect().right <= window.innerWidth
  ));
  expect(shellFitsViewport).toBe(true);
  const categoryBarScrolls = await page.locator('#workbenchCategoryNav').evaluate((nav) => nav.scrollWidth > nav.clientWidth);
  expect(categoryBarScrolls).toBe(true);
  await page.locator('#workbenchCategory-development').click();
  const toolBarScrolls = await page.locator('.workbench-subbar-overflow').evaluate((nav) => nav.scrollWidth > nav.clientWidth);
  expect(toolBarScrolls).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  const categoryCenterOffset = await page.locator('#workbenchCategoryNav').evaluate((nav) => {
    const buttons = [...nav.querySelectorAll('.workbench-category-button')];
    const first = buttons[0].getBoundingClientRect();
    const last = buttons.at(-1).getBoundingClientRect();
    return Math.abs(((first.left + last.right) / 2) - (window.innerWidth / 2));
  });
  expect(categoryCenterOffset).toBeLessThan(2);
  const subbarCenterOffset = await page.locator('#workbenchToolSubbar').evaluate((nav) => {
    const buttons = [...nav.querySelectorAll('.workbench-tool-button')];
    const first = buttons[0].getBoundingClientRect();
    const last = buttons.at(-1).getBoundingClientRect();
    return Math.abs(((first.left + last.right) / 2) - (window.innerWidth / 2));
  });
  expect(subbarCenterOffset).toBeLessThan(2);

  await page.evaluate(async () => chrome.storage.local.set({ soc_language: 'en' }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForCodeBoot(page);
  await expect(page.locator('#workbenchCategory-development')).toContainText('Development');

  await page.locator('#workbenchThemeBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'light');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .include('#workbenchShell')
    .include('#workbenchContextHeader')
    .analyze();
  expect(results.violations).toEqual([]);
});

test('la UI no solicita scripts, estilos, fuentes ni iconos remotos', async ({ extensionContext: context, extensionId }) => {
  const page = await context.newPage();
  const remoteUiRequests = [];
  page.on('request', (request) => {
    if (!['script', 'stylesheet', 'font', 'image'].includes(request.resourceType())) return;
    if (!request.url().startsWith(`chrome-extension://${extensionId}/`) && !request.url().startsWith('data:')) {
      remoteUiRequests.push(request.url());
    }
  });
  await page.goto(`chrome-extension://${extensionId}/code/code.html`);
  await waitForCodeBoot(page);
  expect(remoteUiRequests).toEqual([]);
});
