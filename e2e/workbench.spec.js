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
  await expect(classic.locator('#workbenchRail')).toBeHidden();
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
  await expect(v2.locator('.workbench-favorite-button[aria-pressed="true"]').first()).toBeVisible();
  await expect(v2.locator('.workbench-tool-link[data-tool-id="QueryExplorer"]').first()).toBeVisible();
  const sharedPrefs = await v2.evaluate(async () => chrome.storage.local.get(['sfocToolRecents', 'sfocWorkbenchPrefs']));
  expect(sharedPrefs.sfocToolRecents).toEqual({ recents: ['QueryExplorer'], pins: ['QueryExplorer'] });
  expect(sharedPrefs.sfocWorkbenchPrefs.panelExpanded).toBe(true);
});

test('rail, panel, tabs y command palette son operables por teclado', async ({ extensionContext: context, extensionId }) => {
  const page = await openExtensionPage(context, extensionId, 'code/code.html');
  await waitForCodeBoot(page);
  await expect(page.locator('#workbenchRail')).toBeVisible();
  await expect(page.locator('.workbench-rail-button[data-category-id]')).toHaveCount(10);

  await page.locator('#workbenchRail-development').click();
  await expect(page.locator('#workbenchPanel')).toHaveAttribute('aria-hidden', 'false');
  await page.getByRole('button', { name: 'Apex Quality' }).click();
  const testsTab = page.locator('#workbenchTab-apex-quality-tests');
  await expect(testsTab).toHaveAttribute('aria-selected', 'true');
  await testsTab.press('ArrowRight');
  await expect(page.locator('#workbenchTab-apex-quality-runs')).toHaveAttribute('aria-selected', 'true');

  const recentRow = page.locator('.workbench-tool-row').filter({
    has: page.locator('.workbench-tool-link[data-tool-id="ApexTests"]')
  }).first();
  await expect(recentRow).toBeVisible();
  await expect(recentRow.locator('.workbench-favorite-button')).toHaveAttribute('aria-pressed', 'false');

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

  await page.locator('#workbenchPanelClose').click();
  await expect(page.locator('#workbenchRailPanelToggle')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#workbenchRailPanelToggle').click();
  await expect(page.locator('#workbenchRailPanelToggle')).toHaveAttribute('aria-expanded', 'true');
});

const legacyRoutes = [
  ['development', 'ApexCoverageCompare', 'apex-quality', 'coverage'],
  ['development', 'LightningQuickEdit', 'code-studio', 'lwc-aura'],
  ['analysis', 'ObjectDescribe', 'data-api', 'schema'],
  ['analysis', 'FieldDependency', 'dependencies', 'fields'],
  ['analysis', 'CustomMetadataCompare', 'data-compare', 'custom-metadata'],
  ['monitoring', 'OrgLimits', 'org-operations', 'limits'],
  ['manifests', 'GeneratePackageXml', 'metadata-tools', 'package-xml']
];

for (const [nav, op, workspace, tab] of legacyRoutes) {
  test(`ruta legacy ${op} abre ${workspace}/${tab}`, async ({ extensionContext: context, extensionId }) => {
    const page = await openExtensionPage(context, extensionId, `code/code.html?nav=${nav}&op=${op}`);
    await waitForCodeBoot(page);
    await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', workspace);
    await expect(page.locator('body')).toHaveAttribute('data-workbench-tab', tab);
  });
}

test('atrás/adelante y estado interno conservan el workspace', async ({ extensionContext: context, extensionId }) => {
  const page = await openExtensionPage(context, extensionId, 'code/code.html?nav=development&op=QueryExplorer');
  await waitForCodeBoot(page);
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'data-api');
  await page.locator('#workbenchRail-development').click();
  await expect(page.locator('#workbenchPanelBody')).toContainText('Code Studio');
  await page.getByRole('button', { name: 'Code Studio' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'code-studio');
  await expect(page).toHaveURL(/op=QuickEdit/);
  await page.goBack();
  await expect(page).toHaveURL(/op=QueryExplorer/);
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'data-api');
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
  await expect(page.locator('body')).toHaveAttribute('data-workbench-compact', 'true');
  await expect(page.locator('#workbenchPanelBackdrop')).toBeVisible();

  // 640 CSS px reproduce el reflow de un viewport de 1280 px con zoom al 200 %.
  await page.setViewportSize({ width: 640, height: 450 });
  await expect(page.locator('body')).toHaveAttribute('data-workbench-compact', 'true');
  await expect(page.locator('#workbenchRail')).toBeVisible();
  const shellFitsViewport = await page.locator('#workbenchShell').evaluate((shell) => (
    shell.getBoundingClientRect().right <= window.innerWidth
  ));
  expect(shellFitsViewport).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('body')).toHaveAttribute('data-workbench-compact', 'false');

  await page.evaluate(async () => chrome.storage.local.set({ soc_language: 'en' }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForCodeBoot(page);
  await expect(page.locator('#workbenchRail-development')).toHaveAttribute('aria-label', 'Development');

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
