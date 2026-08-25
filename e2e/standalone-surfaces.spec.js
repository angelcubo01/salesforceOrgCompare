import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  expect,
  setLocalStorage,
  test,
  waitForCodeBoot
} from './extension.fixture.js';

const runtimeErrorsByPage = new WeakMap();

async function openExtensionPage(context, extensionId, relativeUrl) {
  const page = await context.newPage();
  const runtimeErrors = [];
  runtimeErrorsByPage.set(page, runtimeErrors);
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  await page.goto(`chrome-extension://${extensionId}/${relativeUrl}`, { waitUntil: 'domcontentloaded' });
  return page;
}

const SAMPLE_LOG = `65.0 APEX_CODE,FINEST;APEX_PROFILING,INFO;CALLOUT,INFO;DATA_ACCESS,INFO;DB,INFO;SYSTEM,DEBUG;VALIDATION,INFO;WORKFLOW,INFO
10:26:03.0 (14406125)|USER_INFO|[EXTERNAL]|005xx|Test User|GMT+01:00
10:26:03.0 (14450000)|EXECUTION_STARTED
10:26:03.0 (15000000)|CODE_UNIT_STARTED|[EXTERNAL]|01pxx|ContactCenterTest.shouldCompareRouting
10:26:03.0 (16000000)|METHOD_ENTRY|[5]|01pxx|ContactCenterService.compareRouting()
10:26:03.0 (17000000)|USER_DEBUG|[7]|DEBUG|Comparando configuración de Contact Center
10:26:03.0 (18000000)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id, Name FROM Account LIMIT 10
10:26:03.0 (25000000)|SOQL_EXECUTE_END|[10]|Rows:10
10:26:03.0 (26000000)|DML_BEGIN|[12]|Op:Update|Account|Rows:1
10:26:03.0 (30000000)|DML_END|[12]
10:26:03.0 (31000000)|CALLOUT_REQUEST|[15]|System.HttpRequest[Endpoint=callout:GenesysCloud/events, Method=POST]
10:26:03.0 (35000000)|CALLOUT_RESPONSE|[15]|System.HttpResponse[Status=OK, StatusCode=200]
10:26:03.0 (36000000)|EXCEPTION_THROWN|[18]|System.AssertException: Routing mismatch
10:26:03.0 (37000000)|FATAL_ERROR|System.AssertException: Routing mismatch
Class.ContactCenterTest.shouldCompareRouting: line 18, column 1
10:26:03.0 (40000000)|CODE_UNIT_FINISHED|ContactCenterTest.shouldCompareRouting
10:26:03.0 (41000000)|EXECUTION_FINISHED`;

const SAMPLE_APEX = `public with sharing class ContactCenterService {
  public static List<Account> compareRouting() {
    return [SELECT Id, Name FROM Account LIMIT 10];
  }
}`;

const onboarding = {
  tools: { Comparator: true },
  helpOpened: true,
  telemetryNoticeDismissed: true,
  firstInstallWelcomeDismissed: true
};

async function setTheme(worker, theme) {
  await setLocalStorage(worker, {
    soc_language: 'es',
    sfocOnboardingSeen: onboarding
  });
  await worker.evaluate(async ({ nextTheme, monacoTheme }) => {
    // El service worker normaliza la configuraciÃ³n durante su arranque. Reaplicar
    // despuÃ©s de ese ciclo evita que una escritura de inicializaciÃ³n pise el tema E2E.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const stored = await chrome.storage.local.get('soc_extension_config');
      await chrome.storage.local.set({
        soc_extension_config: {
          ...(stored.soc_extension_config || {}),
          uiTheme: nextTheme,
          monacoTheme
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
  }, {
    nextTheme: theme,
    monacoTheme: theme === 'light' ? 'sfoc-editor-light' : 'vs-dark'
  });
}

async function stageViewer(worker, key, payload) {
  await setLocalStorage(worker, { [key]: payload });
}

async function openLogViewer(context, extensionId, worker, theme = 'dark') {
  await setTheme(worker, theme);
  const key = `sfoc_e2e_log_${theme}_${Date.now()}`;
  await stageViewer(worker, key, {
    title: 'ContactCenterTest.shouldCompareRouting',
    content: SAMPLE_LOG,
    downloadFileName: 'contact-center.log',
    defaultTab: 'summary'
  });
  const page = await openExtensionPage(context, extensionId, `code/apex-log-viewer.html?k=${encodeURIComponent(key)}`);
  await expect(page.locator('#apexLogViewerTitle')).toContainText('ContactCenterTest');
  await expect(page.locator('.apex-log-tab[data-tab="summary"]')).toBeVisible();
  await expect(page.locator('#apexLogSummaryMount > *').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#apexLogViewerLoading')).toBeHidden();
  return page;
}

async function openSourceViewer(context, extensionId, worker, theme = 'dark') {
  await setTheme(worker, theme);
  const key = `sfoc_e2e_source_${theme}_${Date.now()}`;
  await stageViewer(worker, key, {
    title: 'ContactCenterService.cls',
    content: SAMPLE_APEX,
    downloadFileName: 'ContactCenterService.cls',
    initialLine: 3
  });
  const page = await openExtensionPage(context, extensionId, `code/apex-source-viewer.html?k=${encodeURIComponent(key)}`);
  await expect(page.locator('#apexSrcViewerTitle')).toHaveText('ContactCenterService.cls');
  await expect(page.locator('.monaco-editor')).toBeVisible();
  return page;
}

async function openCoverageViewer(context, extensionId, worker, theme = 'dark') {
  await setTheme(worker, theme);
  const key = `sfoc_e2e_coverage_${theme}_${Date.now()}`;
  await stageViewer(worker, key, {
    title: 'ContactCenterService.cls · 75 %',
    body: SAMPLE_APEX,
    coveredLines: [1, 2, 4, 5],
    uncoveredLines: [3]
  });
  const page = await openExtensionPage(context, extensionId, `code/apex-coverage-viewer.html?k=${encodeURIComponent(key)}`);
  await expect(page.locator('#apexCovViewerTitle')).toContainText('75 %');
  await expect(page.locator('.monaco-editor')).toBeVisible();
  return page;
}

function formatViolations(result) {
  return result.violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    targets: nodes.map((node) => node.target)
  }));
}

async function assertAxe(page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(formatViolations(result)).toEqual([]);
}

async function assertNoGlobalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe.configure({ mode: 'serial' });

test.afterEach(async ({ extensionContext }) => {
  const pages = extensionContext.pages().filter((page) => page.url() !== 'about:blank');
  const runtimeErrors = pages.flatMap((page) => runtimeErrorsByPage.get(page) || []);
  await Promise.all(pages.map((page) => page.close({ runBeforeUnload: false }).catch(() => {})));
  expect(runtimeErrors).toEqual([]);
});

test('popup: ancho real fijo de 640 px, teclado, foco contenido y WCAG A/AA', async ({
  extensionContext: context,
  extensionId,
  extensionWorker
}) => {
  await setTheme(extensionWorker, 'light');
  const page = await openExtensionPage(context, extensionId, 'popup/popup.html');
  await expect(page.locator('#savedListLoading')).toBeHidden();
  await expect(page.locator('.popup-brand-logo')).toBeVisible();
  expect(await page.evaluate(() => ({
    width: document.documentElement.getBoundingClientRect().width,
    minWidth: getComputedStyle(document.documentElement).minWidth
  }))).toEqual({ width: 640, minWidth: '640px' });
  await page.setViewportSize({ width: 640, height: 760 });
  await assertNoGlobalOverflow(page);

  await page.locator('#openPopupHelpBtn').click();
  await expect(page.locator('#popupHelpModal')).toHaveAttribute('aria-hidden', 'false');
  await page.keyboard.press('Tab');
  await expect(page.locator('#popupHelpModal')).toContainText(/./);
  await page.keyboard.press('Escape');
  await expect(page.locator('#openPopupHelpBtn')).toBeFocused();
  await assertAxe(page);

  await setTheme(extensionWorker, 'dark');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');
  await assertAxe(page);
});

test('ajustes: formulario, temas, responsive y WCAG A/AA', async ({
  extensionContext: context,
  extensionId,
  extensionWorker
}) => {
  await setTheme(extensionWorker, 'light');
  const page = await openExtensionPage(context, extensionId, 'popup/settings.html');
  await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'light');
  await page.waitForTimeout(250);
  await expect(page.locator('#settings-general-heading')).toBeVisible();
  await expect(page.locator('.settings-brand-logo')).toBeVisible();
  expect(await page.locator('#settingsLang, #settingsUiTheme, #settingsMonacoTheme').evaluateAll((controls) => controls.map((control) => ({
    disabled: control.disabled,
    backgroundColor: getComputedStyle(control).backgroundColor
  })))).toEqual([
    { disabled: false, backgroundColor: 'rgb(255, 255, 255)' },
    { disabled: false, backgroundColor: 'rgb(255, 255, 255)' },
    { disabled: false, backgroundColor: 'rgb(255, 255, 255)' }
  ]);
  for (const width of [1024, 760, 640, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await assertNoGlobalOverflow(page);
  }
  await assertAxe(page);

  await setTheme(extensionWorker, 'dark');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');
  await assertAxe(page);
});

test('viewers: log realista, fuente y cobertura conservan densidad, reflow y WCAG A/AA', async ({
  extensionContext: context,
  extensionId,
  extensionWorker
}) => {
  test.setTimeout(120_000);
  const pages = [];
  for (const theme of ['light', 'dark']) {
    pages.push(
      await openLogViewer(context, extensionId, extensionWorker, theme),
      await openSourceViewer(context, extensionId, extensionWorker, theme),
      await openCoverageViewer(context, extensionId, extensionWorker, theme)
    );
  }

  for (const page of pages) {
    await expect(page.locator('.sfoc-viewer-brand-logo')).toBeVisible();
    for (const viewport of [{ width: 1280, height: 800 }, { width: 640, height: 760 }]) {
      await page.setViewportSize(viewport);
      await assertNoGlobalOverflow(page);
    }
    await assertAxe(page);
  }

  const coverage = pages[2];
  await coverage.locator('#apexCovViewerHelp').click();
  await expect(coverage.locator('.apex-log-help-dialog')).toBeVisible();
  await coverage.keyboard.press('Escape');
  await expect(coverage.locator('#apexCovViewerHelp')).toBeFocused();
});

test('Classic/v1 no recibe tokens ni overrides del sistema visual ampliado', async ({
  extensionContext: context,
  extensionId,
  extensionWorker
}) => {
  await setLocalStorage(extensionWorker, {
    sfocUiMode: 'classic',
    soc_language: 'es',
    sfocOnboardingSeen: onboarding
  });
  const page = await openExtensionPage(context, extensionId, 'code/code.html');
  await waitForCodeBoot(page);
  await expect(page.locator('body')).toHaveAttribute('data-ui-mode', 'classic');
  await expect(page.locator('#workbenchShell')).toHaveCount(0);
  await expect(page.locator('.app-mode-tabs-wrap')).toBeVisible();
  if (await page.locator('#appHelpModal').getAttribute('aria-hidden') === 'false') {
    await page.locator('#appHelpModalPrimaryBtn').click();
  }
  expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--sfoc-color-canvas').trim())).toBe('');
  await page.locator('#appModeTabComparator').click();
  await expect(page.locator('#appModeTabComparator')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#typeSelect')).toHaveValue('Comparator');
});

test('genera capturas ampliadas antes/después', async ({
  extensionContext: context,
  extensionId,
  extensionWorker
}) => {
  test.skip(process.env.SFOC_UPDATE_STANDALONE_VISUALS !== '1', 'Capturas solo bajo solicitud explícita.');
  test.setTimeout(120_000);
  const phase = process.env.SFOC_VISUAL_PHASE === 'before' ? 'before' : 'after';
  const output = path.resolve(import.meta.dirname, `../docs/visuals/standalone/${phase}`);
  await mkdir(output, { recursive: true });

  for (const theme of ['dark', 'light']) {
    await setTheme(extensionWorker, theme);
    const popup = await openExtensionPage(context, extensionId, 'popup/popup.html');
    await expect(popup.locator('#savedListLoading')).toBeHidden();
    await popup.setViewportSize({ width: 640, height: 720 });
    await popup.screenshot({ path: path.join(output, `popup-empty-${theme}-640.png`), fullPage: true });
    await popup.evaluate(() => {
      const list = document.getElementById('savedList');
      if (!list) return;
      const row = (name, environment, status) => {
        const item = document.createElement('li');
        item.className = 'row row-saved';
        item.innerHTML = `<span class="drag-handle" aria-hidden="true">⋮⋮</span><div class="row-main"><div class="org-name-row"><strong class="org-name org-name--in-row" data-auth-status="${status}">${name}</strong><span class="org-group-tag">${environment}</span></div><span class="org-meta">usuario@caixabank.com</span></div><button class="small" type="button">Abrir</button>`;
        return item;
      };
      list.replaceChildren(
        row('Contact Center PROD', 'PROD', 'active'),
        row('Contact Center UAT', 'SANDBOX', 'active'),
        row('Integración expirada', 'SANDBOX', 'expired')
      );
    });
    await popup.screenshot({ path: path.join(output, `popup-orgs-${theme}-640.png`), fullPage: true });
    await popup.locator('#openPopupHelpBtn').click();
    await popup.screenshot({ path: path.join(output, `popup-help-${theme}-640.png`), fullPage: true });
    await popup.close();

    const settings = await openExtensionPage(context, extensionId, 'popup/settings.html');
    await expect(settings.locator('#settingsLang')).toBeEnabled();
    await expect(settings.locator('html')).toHaveAttribute('data-ui-theme', theme);
    await settings.waitForTimeout(250);
    await settings.setViewportSize({ width: 760, height: 900 });
    await settings.screenshot({ path: path.join(output, `settings-${theme}-760.png`), fullPage: true });
    await settings.close();

    const log = await openLogViewer(context, extensionId, extensionWorker, theme);
    await log.setViewportSize({ width: 1280, height: 800 });
    await log.screenshot({ path: path.join(output, `apex-log-summary-${theme}-1280.png`), fullPage: true });
    const find = log.locator('#apexLogFindInput');
    if (await find.count()) {
      await find.fill('Routing mismatch');
      await log.waitForTimeout(100);
      await log.screenshot({ path: path.join(output, `apex-log-search-${theme}-1280.png`), fullPage: true });
      await log.keyboard.press('Escape');
    }
    await log.locator('.apex-log-tab[data-tab="errors"]').click();
    await log.screenshot({ path: path.join(output, `apex-log-error-${theme}-1280.png`), fullPage: true });
    await log.locator('.apex-log-tab[data-tab="timeline"]').click();
    await log.screenshot({ path: path.join(output, `apex-log-timeline-${theme}-1280.png`), fullPage: true });
    await log.setViewportSize({ width: 640, height: 760 });
    await log.screenshot({ path: path.join(output, `apex-log-narrow-${theme}-640.png`), fullPage: true });
    await log.close();

    const source = await openSourceViewer(context, extensionId, extensionWorker, theme);
    await source.setViewportSize({ width: 900, height: 700 });
    await source.screenshot({ path: path.join(output, `apex-source-${theme}-900.png`), fullPage: true });
    await source.close();

    const coverage = await openCoverageViewer(context, extensionId, extensionWorker, theme);
    await coverage.setViewportSize({ width: 900, height: 700 });
    await coverage.screenshot({ path: path.join(output, `apex-coverage-${theme}-900.png`), fullPage: true });
    await coverage.close();
  }
});
