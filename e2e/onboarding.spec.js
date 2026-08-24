import { ALL_ONBOARDING_TOOLS } from '../shared/helpToolIds.js';
import {
  expect,
  openExtensionPage,
  setLocalStorage,
  test,
  waitForCodeBoot
} from './extension.fixture.js';

test.describe.configure({ mode: 'serial' });

async function configureOnboarding(worker, unseenTools, lang = 'es', uiMode = 'v2') {
  const unseen = new Set(unseenTools);
  const tools = Object.fromEntries(ALL_ONBOARDING_TOOLS
    .filter((toolId) => !unseen.has(toolId))
    .map((toolId) => [toolId, true]));
  await setLocalStorage(worker, {
    sfocUiMode: uiMode,
    soc_language: lang,
    sfocToolRecents: { recents: [], pins: [] },
    sfocWorkbenchPrefs: { panelExpanded: false, panelPinned: false, lastTabByWorkspace: {} },
    sfocOnboardingSeen: {
      tools,
      helpOpened: true,
      telemetryNoticeDismissed: true,
      firstInstallWelcomeDismissed: true
    }
  });
}

test.afterEach(async ({ extensionContext }) => {
  const pages = extensionContext.pages().filter((page) => page.url() !== 'about:blank');
  await Promise.all(pages.map((page) => page.close({ runBeforeUnload: false }).catch(() => {})));
});

test('Query Explorer se muestra una vez, se puede repetir desde Ayuda y respeta ES/EN', async ({
  extensionContext: context,
  extensionId,
  extensionWorker
}) => {
  await configureOnboarding(extensionWorker, ['QueryExplorer']);
  const page = await openExtensionPage(context, extensionId, 'code/code.html?nav=development&op=QueryExplorer');
  await waitForCodeBoot(page);

  await expect(page.locator('.driver-popover')).toBeVisible();
  await expect(page.locator('.driver-popover-title')).toContainText('Explorador de consultas');
  await expect(page.locator('.driver-active-element')).toHaveAttribute('data-onboarding-anchor', 'QueryExplorer.overview');
  await page.locator('.sfoc-driver-skip').click();
  await expect(page.locator('.driver-popover')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (
    await chrome.storage.local.get('sfocOnboardingSeen')
  ).sfocOnboardingSeen?.tools?.QueryExplorer)).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForCodeBoot(page);
  await expect(page.locator('.driver-popover')).toHaveCount(0);
  await page.locator('#workbenchHelpBtn').click();
  await expect(page.locator('#appHelpModal')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#appHelpModalTourBtn')).toHaveText('Repetir tour');
  await page.locator('#appHelpModalTourBtn').click();
  await expect(page.locator('.driver-popover')).toBeVisible();
  await page.locator('.sfoc-driver-skip').click();

  await page.evaluate(async () => chrome.storage.local.set({ soc_language: 'en' }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForCodeBoot(page);
  await page.locator('#workbenchHelpBtn').click();
  await expect(page.locator('#appHelpModalTourBtn')).toHaveText('Repeat tour');
  await page.locator('#appHelpModalTourBtn').click();
  await expect(page.locator('.driver-popover-title')).toContainText('Query Explorer');
  await expect(page.locator('.sfoc-driver-skip')).toHaveText('Skip tour');
  await page.keyboard.press('Escape');
  await expect(page.locator('.driver-popover')).toHaveCount(0);
});

test('Calidad Apex usa un tour por Tool ID y comienza ApexTests en Tests', async ({
  extensionContext: context,
  extensionId,
  extensionWorker
}) => {
  await configureOnboarding(extensionWorker, ['ApexTests', 'ApexCoverageCompare']);
  const page = await openExtensionPage(context, extensionId, 'code/code.html?nav=development&op=ApexTests');
  await waitForCodeBoot(page);

  await expect(page.locator('body')).toHaveAttribute('data-workbench-tab', 'tests');
  await expect(page.locator('.driver-popover-title')).toContainText('Hub de tests Apex');
  await page.locator('.sfoc-driver-skip').click();
  await expect.poll(() => page.evaluate(async () => (
    await chrome.storage.local.get('sfocOnboardingSeen')
  ).sfocOnboardingSeen?.tools?.ApexTests)).toBe(true);
  expect(await page.evaluate(async () => (
    await chrome.storage.local.get('sfocOnboardingSeen')
  ).sfocOnboardingSeen?.tools?.ApexCoverageCompare || false)).toBe(false);

  await page.locator('#workbenchTab-apex-quality-coverage').click();
  await expect(page.locator('.driver-popover-title')).toContainText('Comparar cobertura Apex');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(async () => (
    await chrome.storage.local.get('sfocOnboardingSeen')
  ).sfocOnboardingSeen?.tools?.ApexCoverageCompare)).toBe(true);
});

test('el tour manual respeta tema claro, movimiento reducido, teclado y viewport compacto', async ({
  extensionContext: context,
  extensionId,
  extensionWorker
}) => {
  await configureOnboarding(extensionWorker, ['QueryExplorer']);
  const page = await openExtensionPage(context, extensionId, 'code/code.html?nav=development&op=QueryExplorer');
  await waitForCodeBoot(page);
  await page.locator('.sfoc-driver-skip').click();

  await page.setViewportSize({ width: 390, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#workbenchThemeBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'light');
  await page.locator('#workbenchHelpBtn').click();
  await page.locator('#appHelpModalTourBtn').click();

  await expect(page.locator('body')).toHaveClass(/driver-simple/);
  await expect(page.locator('.driver-popover')).toBeVisible();
  const bounds = await page.locator('.driver-popover').boundingBox();
  expect(bounds).toBeTruthy();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  const buttonHeights = await page.locator('.driver-popover button').evaluateAll((buttons) => (
    buttons.map((button) => button.getBoundingClientRect().height)
  ));
  expect(buttonHeights.every((height) => height >= 42)).toBe(true);

  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.driver-popover'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.driver-popover')).toHaveCount(0);
});

test('Classic conserva el modal de onboarding y no carga un recorrido Driver', async ({
  extensionContext: context,
  extensionId,
  extensionWorker
}) => {
  await configureOnboarding(extensionWorker, ['QueryExplorer'], 'es', 'classic');
  const page = await openExtensionPage(context, extensionId, 'code/code.html?nav=development&op=QueryExplorer');
  await waitForCodeBoot(page);

  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
  await expect(page.locator('#appHelpModal')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#appHelpModalPrimaryBtn')).toHaveText('Entendido');
  await expect(page.locator('#appHelpModalTourBtn')).toBeHidden();
  await expect(page.locator('.driver-popover')).toHaveCount(0);
  expect(await page.evaluate(() => performance.getEntriesByType('resource')
    .some(({ name }) => name.endsWith('/vendor/driver.js/driver.js.mjs')))).toBe(false);
  await page.locator('#appHelpModalPrimaryBtn').click();
  await expect.poll(() => page.evaluate(async () => (
    await chrome.storage.local.get('sfocOnboardingSeen')
  ).sfocOnboardingSeen?.tools?.QueryExplorer)).toBe(true);
});
