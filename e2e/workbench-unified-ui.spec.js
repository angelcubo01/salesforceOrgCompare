import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  expect,
  openExtensionPage,
  setLocalStorage,
  test,
  waitForCodeBoot
} from './extension.fixture.js';
import { WORKBENCH_WORKSPACES } from '../code/workbench/workspaceRegistry.js';

const seenTools = Object.fromEntries([
  'Comparator', 'ApexTests', 'ApexCoverageCompare', 'QuickEdit', 'LightningQuickEdit',
  'AnonymousApex', 'QueryExplorer', 'RestExplorer', 'ObjectDescribe', 'DataWorkbench',
  'DebugLogBrowser', 'EventMonitor', 'FieldDependency', 'DependencyExplorer',
  'CustomSettingsCompare', 'CustomMetadataCompare', 'RecordCompare', 'EnvironmentStatus',
  'OrgLimits', 'DeployStatus', 'BulkJobMonitor', 'SetupAuditTrail', 'FieldHistory',
  'GeneratePackageXml', 'MetadataTypeCompare', 'PermissionDiff'
].map((tool) => [tool, true]));

async function prepareStorage(worker) {
  await setLocalStorage(worker, {
    sfocUiMode: 'v2',
    soc_language: 'es',
    soc_extension_config: { uiTheme: 'dark', monacoTheme: 'sfoc-editor-dark' },
    sfocFeatureControlsCache: {
      version: 1,
      rootVersionTarget: null,
      global: null,
      modes: {},
      tools: {},
      metadataTypes: {},
      actions: {}
    },
    sfocAppNavPrefs: { lastMode: 'home', lastToolByMode: {} },
    sfocToolRecents: { recents: [], pins: [] },
    sfocWorkbenchPrefs: { panelExpanded: true, panelPinned: false, lastTabByWorkspace: {} },
    sfocOnboardingSeen: {
      tools: seenTools,
      helpOpened: true,
      telemetryNoticeDismissed: true,
      firstInstallWelcomeDismissed: true
    }
  });
}

async function openWorkbench(context, extensionId) {
  const page = await openExtensionPage(context, extensionId, 'code/code.html');
  await waitForCodeBoot(page);
  return page;
}

async function navigateWorkspace(page, workspaceId, tabId = 'main') {
  await page.evaluate(async ({ workspaceId: nextWorkspace, tabId: nextTab }) => {
    const { navigateToWorkspaceTab } = await import('./workbench/workbenchShell.js');
    await navigateToWorkspaceTab(nextWorkspace, nextTab);
  }, { workspaceId, tabId });
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', workspaceId);
  await expect(page.locator('body')).toHaveAttribute('data-workbench-tab', tabId);
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ extensionWorker }) => {
  await prepareStorage(extensionWorker);
});

test.afterEach(async ({ extensionContext }) => {
  await Promise.all(extensionContext.pages()
    .filter((page) => page.url() !== 'about:blank')
    .map((page) => page.close({ runBeforeUnload: false }).catch(() => {})));
});

test('audita cabecera, acciones y superficie de todos los workspaces V2', async ({
  extensionContext: context,
  extensionId
}) => {
  test.setTimeout(150_000);
  const page = await openWorkbench(context, extensionId);
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const workspace of WORKBENCH_WORKSPACES) {
    for (const tab of workspace.tabs) {
      await navigateWorkspace(page, workspace.id, tab.id);
      const panel = page.locator(`#${tab.panelId}`);
      await expect(panel, `${workspace.id}/${tab.id}: panel visible`).toBeVisible();
      await expect(page.locator('#workbenchContextHeader h1:visible'), `${workspace.id}/${tab.id}: h1 Ãºnico`).toHaveCount(1);
      await expect(page.locator('#workbenchContextTitle')).not.toHaveText('');
      await expect(page.locator('#workbenchContextHeader .workbench-context-description')).toBeVisible();
      await expect(panel.locator('h1:visible'), `${workspace.id}/${tab.id}: sin h1 interno`).toHaveCount(0);
      await expect(panel.locator('.workbench-legacy-tool-heading:visible'), `${workspace.id}/${tab.id}: tÃ­tulo legacy oculto`).toHaveCount(0);
      await expect(panel.locator('.workbench-legacy-tool-description:visible'), `${workspace.id}/${tab.id}: subtÃ­tulo legacy oculto`).toHaveCount(0);
      const hiddenHeadings = panel.locator('.workbench-legacy-tool-heading');
      for (const heading of await hiddenHeadings.all()) {
        await expect(heading).toHaveAttribute('aria-hidden', 'true');
        const headingId = await heading.getAttribute('id');
        if (headingId) {
          expect(await page.locator(`[aria-labelledby~="${headingId}"]`).count(), `${workspace.id}/${tab.id}: sin referencia al tÃ­tulo oculto`).toBe(0);
        }
      }
      await expect(panel, `${workspace.id}/${tab.id}: el panel no se oculta como cabecera`).not.toHaveClass(/workbench-legacy-header-only/);

      if (workspace.id === 'comparator') {
        await expect(page.locator('#workbenchContextHeader [data-action-id]')).toHaveCount(0);
        // Los controles del comparador viven en la cabecera contextual; las
        // barras originales quedan en el DOM solo como fuente de estado.
        await expect(page.locator('.diff-toolbar')).toBeHidden();
        await expect(page.locator('.compare-context-title')).toBeHidden();
        const compareToolbar = page.locator('#workbenchContextHeader .workbench-compare-toolbar');
        await expect(compareToolbar).toBeVisible();
        await expect(compareToolbar.locator('.workbench-compare-control')).toHaveCount(8);
        await expect(compareToolbar.locator('.workbench-compare-control[hidden]:visible')).toHaveCount(0);
        continue;
      }

      const geometry = await panel.evaluate((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return {
          margin: [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft],
          border: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
          radius: style.borderRadius,
          shadow: style.boxShadow,
          maxWidth: style.maxWidth,
          minWidth: style.minWidth,
          panelOverflow: style.overflow,
          directScrollOwners: [...node.children].filter((child) => {
            const childStyle = getComputedStyle(child);
            return child.getClientRects().length > 0 && /^(auto|scroll)$/.test(childStyle.overflowY);
          }).length,
          width: rect.width,
          height: rect.height,
          parentWidth: node.parentElement?.getBoundingClientRect().width || 0,
          parentHeight: node.parentElement?.getBoundingClientRect().height || 0,
          bottomGap: (node.parentElement?.getBoundingClientRect().bottom || rect.bottom) - rect.bottom,
          bodyOverflow: getComputedStyle(document.body).overflow,
          documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });
      expect(geometry.margin, `${workspace.id}/${tab.id}: margen exterior`).toEqual(['0px', '0px', '0px', '0px']);
      expect(geometry.border, `${workspace.id}/${tab.id}: borde exterior`).toEqual(['0px', '0px', '0px', '0px']);
      expect(geometry.radius, `${workspace.id}/${tab.id}: radio exterior`).toBe('0px');
      expect(geometry.shadow, `${workspace.id}/${tab.id}: sombra exterior`).toBe('none');
      expect(geometry.maxWidth, `${workspace.id}/${tab.id}: sin max-width global`).toBe('none');
      expect(geometry.minWidth, `${workspace.id}/${tab.id}: min-width`).toBe('0px');
      expect(geometry.panelOverflow, `${workspace.id}/${tab.id}: panel exterior sin scroll`).toBe('hidden');
      expect(geometry.directScrollOwners, `${workspace.id}/${tab.id}: scroll de contenido`).toBe(workspace.id === 'code-studio' ? 0 : 1);
      expect(geometry.width, `${workspace.id}/${tab.id}: ancho completo`).toBeGreaterThanOrEqual(geometry.parentWidth - 2);
      expect(geometry.height, `${workspace.id}/${tab.id}: alto Ãºtil`).toBeGreaterThan(0);
      expect(geometry.bottomGap, `${workspace.id}/${tab.id}: ocupa el alto restante`).toBeLessThanOrEqual(2);
      expect(geometry.bodyOverflow, `${workspace.id}/${tab.id}: body no controla el scroll`).toBe('hidden');
      expect(geometry.documentOverflow, `${workspace.id}/${tab.id}: sin overflow horizontal`).toBeLessThanOrEqual(1);

      for (const action of tab.actions) {
        const source = page.locator(`#${action.handler.targetId}`);
        const headerAction = page.locator(`#workbenchContextHeader [data-action-id="${action.id}"]`);
        await expect(source, `${workspace.id}/${tab.id}: fuente ${action.id}`).toHaveCount(1);
        await expect(source, `${workspace.id}/${tab.id}: fuente ${action.id} no duplicada`).toBeHidden();
        await expect(source).toHaveClass(/is-workbench-action-source/);
        await expect(headerAction, `${workspace.id}/${tab.id}: acciÃ³n ${action.id}`).toHaveCount(1);
        await expect(headerAction.locator('.workbench-action-icon use')).toHaveAttribute('href', new RegExp(`#icon-${action.icon}$`));
        await expect(headerAction).toHaveAttribute('aria-label', /.+/);
        await expect(headerAction).toHaveAttribute('title', /.+/);
        await expect(headerAction).toHaveAttribute('aria-disabled', /^(true|false)$/);
        await expect(headerAction).toHaveAttribute('aria-busy', /^(true|false)$/);
      }
    }
  }
});

test('acciones responsivas, menÃº MÃ¡s y sincronizaciÃ³n disabled/loading', async ({
  extensionContext: context,
  extensionId
}) => {
  const page = await openWorkbench(context, extensionId);
  await page.setViewportSize({ width: 1440, height: 900 });
  await navigateWorkspace(page, 'query-explorer');
  await expect(page.locator('#workbenchContextHeader > .workbench-context-main')).toBeVisible();
  await expect(page.locator('#workbenchContextHeader .workbench-header-action')).toHaveCount(4);
  await expect(page.locator('#workbenchMoreActionsBtn')).toHaveCount(0);
  for (const action of await page.locator('#workbenchContextHeader .workbench-header-action').all()) {
    await expect(action.locator('.workbench-action-label')).toBeVisible();
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(100);
  const compactSecondaryWidth = await page.locator('[data-action-id="query-saved"] .workbench-action-label')
    .evaluate((label) => label.getBoundingClientRect().width);
  expect(compactSecondaryWidth).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-action-id="query-run"] .workbench-action-label')).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('#workbenchMoreActionsBtn')).toBeVisible();
  await expect(page.locator('[data-action-id="query-run"]')).toBeVisible();
  await expect(page.locator('#workbenchHelpBtn')).toBeVisible();
  await expect(page.locator('#workbenchThemeBtn')).toBeVisible();
  const overlap = await page.evaluate(() => {
    const identity = document.querySelector('.workbench-context-identity')?.getBoundingClientRect();
    const actions = document.querySelector('.workbench-context-actions')?.getBoundingClientRect();
    return identity && actions ? identity.right - actions.left : 0;
  });
  expect(overlap).toBeLessThanOrEqual(1);

  const more = page.locator('#workbenchMoreActionsBtn');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#workbenchMoreActionsMenu')).toBeVisible();
  await expect(page.locator('#workbenchMoreActionsMenu [role="menuitem"]')).toHaveCount(3);
  const firstItem = page.locator('#workbenchMoreActionsMenu [role="menuitem"]:not(:disabled)').first();
  await expect(firstItem).toBeFocused();
  await firstItem.press('ArrowDown');
  await expect(firstItem).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#workbenchMoreActionsMenu')).toBeHidden();
  await expect(more).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('[data-action-id="query-run"]')).toBeVisible();
  await page.evaluate(() => {
    const source = document.getElementById('queryExplorerRunBtn');
    source.disabled = false;
    source.setAttribute('aria-busy', 'false');
  });
  const runAction = page.locator('[data-action-id="query-run"]');
  await expect(runAction).toBeEnabled();
  await expect(runAction).toBeVisible();
  const stableWidth = await runAction.evaluate((button) => button.getBoundingClientRect().width);
  expect(stableWidth).toBeGreaterThan(0);
  await page.evaluate(() => document.getElementById('queryExplorerRunBtn')?.setAttribute('aria-busy', 'true'));
  await expect(runAction).toHaveAttribute('aria-busy', 'true');
  await expect(runAction).toBeDisabled();
  expect(await runAction.evaluate((button) => button.getBoundingClientRect().width)).toBe(stableWidth);
  await page.evaluate(() => document.getElementById('queryExplorerRunBtn')?.setAttribute('aria-busy', 'false'));
  await expect(runAction).toHaveAttribute('aria-busy', 'false');
});

test('ninguna cabecera se solapa o sale del viewport a 1024, 1280 y 1440 px', async ({
  extensionContext: context,
  extensionId
}) => {
  test.setTimeout(150_000);
  const page = await openWorkbench(context, extensionId);
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: width === 1024 ? 768 : 900 });
    for (const workspace of WORKBENCH_WORKSPACES.filter(({ id }) => id !== 'comparator')) {
      const tab = workspace.tabs[0];
      await navigateWorkspace(page, workspace.id, tab.id);
      await expect(page.locator('#workbenchHelpBtn'), `${workspace.id}@${width}: ayuda`).toBeVisible();
      await expect(page.locator('#workbenchThemeBtn'), `${workspace.id}@${width}: tema`).toBeVisible();
      const metrics = await page.evaluate(() => {
        const header = document.getElementById('workbenchContextHeader')?.getBoundingClientRect();
        const identity = document.querySelector('.workbench-context-identity')?.getBoundingClientRect();
        const actionsNode = document.querySelector('.workbench-context-actions');
        const actions = actionsNode?.getBoundingClientRect();
        const actionRects = [...(actionsNode?.children || [])]
          .filter((node) => getComputedStyle(node).display !== 'none')
          .map((node) => node.getBoundingClientRect());
        return {
          headerLeft: header?.left || 0,
          headerRight: header?.right || 0,
          actionsRight: actions?.right || 0,
          childRight: Math.max(0, ...actionRects.map(({ right }) => right)),
          actionsOverflow: actionsNode ? actionsNode.scrollWidth - actionsNode.clientWidth : 0,
          overlap: identity && actions ? identity.right - actions.left : 0,
          documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      });
      expect(metrics.headerLeft, `${workspace.id}@${width}: inicio de cabecera`).toBeGreaterThanOrEqual(0);
      expect(metrics.headerRight, `${workspace.id}@${width}: fin de cabecera`).toBeLessThanOrEqual(width + 1);
      expect(metrics.actionsRight, `${workspace.id}@${width}: acciones dentro del viewport`).toBeLessThanOrEqual(width - 8);
      expect(metrics.childRight, `${workspace.id}@${width}: cada acciÃ³n dentro del viewport`).toBeLessThanOrEqual(width - 8);
      expect(metrics.actionsOverflow, `${workspace.id}@${width}: acciones sin overflow interno`).toBeLessThanOrEqual(1);
      expect(metrics.overlap, `${workspace.id}@${width}: tÃ­tulo y acciones no se solapan`).toBeLessThanOrEqual(1);
      expect(metrics.documentOverflow, `${workspace.id}@${width}: documento sin scroll horizontal`).toBeLessThanOrEqual(1);
    }
  }
});

test('la cabecera del comparador aloja estado y controles sin desbordar', async ({
  extensionContext: context,
  extensionId
}) => {
  test.setTimeout(120_000);
  const page = await openWorkbench(context, extensionId);
  await navigateWorkspace(page, 'comparator', 'main');
  // Estado representativo: contexto, diff largo y retrieve disponible.
  await page.evaluate(() => {
    const status = document.getElementById('diffStatus');
    status.dataset.compact = '1/21 · 108 líneas';
    status.dataset.compactFor = 'Diferencia 1 de 21 • 108 línea(s) cambiadas';
    status.textContent = 'Diferencia 1 de 21 • 108 línea(s) cambiadas';
    const context = document.getElementById('compareContextTitle');
    context.textContent = 'APEX CLASS';
    context.classList.remove('hidden');
    const retrieve = document.getElementById('retrieveAllBtn');
    retrieve.classList.remove('hidden');
    retrieve.disabled = false;
  });

  const pill = page.locator('.workbench-compare-status');
  await expect(pill).toHaveText('1/21 · 108 líneas');
  await expect(pill).toHaveAttribute('title', 'Diferencia 1 de 21 • 108 línea(s) cambiadas');

  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: width === 1024 ? 768 : 900 });
    await expect(page.locator('#workbenchHelpBtn'), `comparator@${width}: ayuda`).toBeVisible();
    await expect(page.locator('#workbenchThemeBtn'), `comparator@${width}: tema`).toBeVisible();
    const metrics = await page.evaluate(() => {
      const identity = document.querySelector('.workbench-context-identity').getBoundingClientRect();
      const actionsNode = document.querySelector('.workbench-context-actions');
      const actions = actionsNode.getBoundingClientRect();
      const rects = [...actionsNode.querySelectorAll('*')]
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => node.getBoundingClientRect());
      return {
        headerHeight: document.getElementById('workbenchContextHeader').getBoundingClientRect().height,
        childRight: Math.max(...rects.map(({ right }) => right)),
        overlap: identity.right - actions.left,
        actionsOverflow: actionsNode.scrollWidth - actionsNode.clientWidth,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(metrics.childRight, `comparator@${width}: controles dentro del viewport`).toBeLessThanOrEqual(width - 8);
    expect(metrics.overlap, `comparator@${width}: título y acciones no se solapan`).toBeLessThanOrEqual(1);
    expect(metrics.actionsOverflow, `comparator@${width}: acciones sin overflow interno`).toBeLessThanOrEqual(1);
    expect(metrics.documentOverflow, `comparator@${width}: documento sin scroll horizontal`).toBeLessThanOrEqual(1);
    // La cabecera no crece por absorber las barras del comparador.
    expect(metrics.headerHeight, `comparator@${width}: altura de cabecera estable`).toBeLessThanOrEqual(80);
  }

  // Los clones conservan el comportamiento del control original.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.workbench-compare-control[data-source-id="retrieveAllBtn"]')).toBeVisible();
  await page.locator('.workbench-compare-control[data-source-id="toggleSidebarBtn"]').click();
  await expect(page.locator('body')).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator('.workbench-compare-control[data-source-id="toggleSidebarBtn"]')).toHaveClass(/is-active/);
});

test('Apex Quality alterna una sola acciÃ³n principal entre hub y runner', async ({
  extensionContext: context,
  extensionId
}) => {
  const page = await openWorkbench(context, extensionId);
  await page.setViewportSize({ width: 1440, height: 900 });
  await navigateWorkspace(page, 'apex-quality');
  const selectRun = page.locator('[data-action-id="apex-select-run"]');
  const run = page.locator('[data-action-id="apex-run"]');
  await expect(selectRun).toBeVisible();
  await expect(run).toBeHidden();
  await expect(page.locator('#apexTestsOpenRunnerBtn')).toBeHidden();
  await selectRun.click();
  await expect(page.locator('#apexTestsRunnerView')).toBeVisible();
  await expect(run).toBeVisible();
  await expect(selectRun).toBeHidden();
  await expect(page.locator('.apex-tests-runner-toolbar .is-workbench-action-source:visible')).toHaveCount(0);
  await expect(page.locator('#apexTestsBackToHubBtn')).toBeVisible();
  await page.locator('#apexTestsBackToHubBtn').click();
  await expect(page.locator('#apexTestsHubView')).toBeVisible();
  await expect(selectRun).toBeVisible();
  await expect(run).toBeHidden();
});

test('portal global cubre la navegaciÃ³n, contiene el foco y apila Apex Traces', async ({
  extensionContext: context,
  extensionId
}) => {
  const page = await openWorkbench(context, extensionId);
  await page.setViewportSize({ width: 1024, height: 768 });
  await navigateWorkspace(page, 'query-explorer');
  await page.evaluate(() => {
    const source = document.getElementById('queryExplorerRunBtn');
    if (source) source.disabled = false;
  });
  await expect(page.locator('[data-action-id="query-run"]')).toBeEnabled();
  await page.locator('#workbenchCategory-development').click();
  const invoker = page.locator('[data-action-id="query-run"]');
  await invoker.focus();
  await page.evaluate(async () => {
    const { openSfocModal } = await import('./ui/sfocModal.js');
    openSfocModal({
      id: 'workbenchPortalTestModal',
      title: 'Confirmar operaci\u00f3n',
      description: 'El portal debe cubrir todo el Workbench.',
      confirmLabel: 'Continuar'
    });
  });
  await expect(page.locator('#workbenchSubbarRegion')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#sfocOverlayRoot > [data-sfoc-modal-backdrop]')).toBeVisible();
  await expect(page.locator('#sfocOverlayRoot > [data-sfoc-modal-backdrop] > [role="dialog"]')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-sfoc-modal-open', 'true');

  const overlayMetrics = await page.evaluate(() => {
    const overlay = document.querySelector('#sfocOverlayRoot > [data-sfoc-modal-backdrop]');
    const style = getComputedStyle(overlay);
    const nav = document.getElementById('workbenchCategoryNav')?.getBoundingClientRect();
    const hit = nav ? document.elementFromPoint(nav.left + 10, nav.top + 10) : null;
    return {
      parent: overlay?.parentElement?.id,
      position: style.position,
      inset: [style.top, style.right, style.bottom, style.left],
      hitInOverlay: !!hit?.closest('#sfocOverlayRoot'),
      backgroundInert: [...document.body.children]
        .filter((node) => node.id !== 'sfocOverlayRoot' && node.id !== 'toastContainer')
        .every((node) => node.inert),
      bodyOverflow: document.body.style.overflow
    };
  });
  expect(overlayMetrics).toEqual({
    parent: 'sfocOverlayRoot',
    position: 'fixed',
    inset: ['0px', '0px', '0px', '0px'],
    hitInOverlay: true,
    backgroundInert: true,
    bodyOverflow: 'hidden'
  });
  await page.keyboard.press('Control+K');
  await expect(page.locator('#quickOpenOverlay')).toHaveAttribute('aria-hidden', 'true');
  await page.evaluate(async () => {
    const { showToast } = await import('./ui/toast.js');
    showToast('Toast visible sobre el modal', 'info', { bypassCooldown: true });
  });
  const toast = page.locator('#toastContainer .toast').last();
  await expect(toast).toBeVisible();
  expect(await page.evaluate(() => (
    Number(getComputedStyle(document.getElementById('toastContainer')).zIndex)
      > Number(getComputedStyle(document.getElementById('sfocOverlayRoot')).zIndex)
  ))).toBe(true);

  const cancel = page.locator('#workbenchPortalTestModal .sfoc-btn--secondary');
  const confirm = page.locator('#workbenchPortalTestModal .sfoc-btn--primary');
  await expect(confirm).toBeFocused();
  await confirm.press('Tab');
  await expect(cancel).toBeFocused();
  await cancel.press('Shift+Tab');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#workbenchPortalTestModal')).toHaveCount(0);
  await expect(invoker).toBeFocused();
  await expect(page.locator('body')).not.toHaveAttribute('data-sfoc-modal-open', 'true');

  await page.locator('#workbenchMoreActionsBtn').click();
  await expect(page.locator('#workbenchMoreActionsMenu')).toBeVisible();
  await invoker.focus();
  await page.evaluate(async () => {
    const { openSfocModal } = await import('./ui/sfocModal.js');
    openSfocModal({
      id: 'workbenchMoreMenuModal',
      title: 'Cerrar M\u00e1s acciones',
      description: 'El men\u00fa contextual debe cerrarse antes del di\u00e1logo.',
      confirmLabel: 'Continuar'
    });
  });
  await expect(page.locator('#workbenchMoreActionsMenu')).toBeHidden();
  await expect(page.locator('#workbenchMoreActionsBtn')).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1280, height: 900 });
  await navigateWorkspace(page, 'diagnostics');
  await page.evaluate(() => {
    const source = document.getElementById('debugLogBrowserViewTracesBtn');
    if (source) source.disabled = false;
  });
  const tracesInvoker = page.locator('[data-action-id="logs-view-traces"]');
  await tracesInvoker.focus();
  await page.evaluate(async () => {
    const { mountSfocOverlay, unmountSfocOverlay } = await import('./ui/sfocModal.js');
    const parent = document.getElementById('debugLogViewTracesModal');
    const child = document.getElementById('debugLogEditTraceModal');
    const parentClose = document.getElementById('debugLogViewTracesCloseBtn');
    const childOrigin = document.getElementById('debugLogViewTracesAddTraceBtn');
    window.__sfocCloseTraceParent = () => unmountSfocOverlay(parent);
    window.__sfocCloseTraceChild = () => unmountSfocOverlay(child);
    mountSfocOverlay(parent, {
      initialFocus: parentClose,
      onEscape: window.__sfocCloseTraceParent
    });
    childOrigin?.focus();
    mountSfocOverlay(child, {
      initialFocus: document.getElementById('debugLogEditTraceCancelBtn'),
      restoreFocus: childOrigin,
      onEscape: window.__sfocCloseTraceChild
    });
  });
  const parentTrace = page.locator('#debugLogViewTracesModal');
  const childTrace = page.locator('#debugLogEditTraceModal');
  await expect(parentTrace).toHaveAttribute('data-overlay-depth', '1');
  await expect(parentTrace).toHaveAttribute('aria-hidden', 'true');
  await expect(childTrace).toHaveAttribute('data-overlay-depth', '2');
  await expect(childTrace).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#debugLogEditTraceCancelBtn')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(childTrace).toBeHidden();
  await expect(parentTrace).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#debugLogViewTracesAddTraceBtn')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(parentTrace).toBeHidden();
  await expect(tracesInvoker).toBeFocused();
  expect(await parentTrace.evaluate((node) => node.parentElement?.id)).toBe('debugLogBrowserPanel');
});

test('Apex Tests, Anonymous, Query, Deploy y Logs usan el mismo portal', async ({
  extensionContext: context,
  extensionId
}) => {
  const page = await openWorkbench(context, extensionId);
  await page.setViewportSize({ width: 1440, height: 900 });

  await navigateWorkspace(page, 'apex-quality');
  await page.locator('[data-action-id="apex-select-run"]').click();
  await page.locator('[data-action-id="apex-profiles"]').click();
  await expect(page.locator('#sfocOverlayRoot > #apexTestsProfilesModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#apexTestsProfilesModal')).toBeHidden();

  await navigateWorkspace(page, 'anonymous-apex');
  await page.locator('[data-action-id="anonymous-scripts"]').click();
  await expect(page.locator('#sfocOverlayRoot > #anonymousApexScriptsModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#anonymousApexScriptsModal')).toBeHidden();

  await navigateWorkspace(page, 'query-explorer');
  await page.locator('[data-action-id="query-saved"]').click();
  await expect(page.locator('#sfocOverlayRoot > #queryExplorerSavedQueriesModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#queryExplorerSavedQueriesModal')).toBeHidden();

  await navigateWorkspace(page, 'diagnostics');
  await page.locator('[data-action-id="logs-analyze-local"]').click();
  await expect(page.locator('#sfocOverlayRoot > #debugLogLocalAnalyzeModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#debugLogLocalAnalyzeModal')).toBeHidden();

  await navigateWorkspace(page, 'deploy-status');
  await page.evaluate(async () => {
    const { mountSfocOverlay, unmountSfocOverlay } = await import('./ui/sfocModal.js');
    const modal = document.getElementById('deployStatusCoverageModal');
    window.__sfocCloseDeployCoverage = () => unmountSfocOverlay(modal);
    mountSfocOverlay(modal, {
      initialFocus: document.getElementById('deployStatusCoverageModalClose'),
      onEscape: window.__sfocCloseDeployCoverage
    });
  });
  await expect(page.locator('#sfocOverlayRoot > #deployStatusCoverageModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#deployStatusCoverageModal')).toBeHidden();

  await page.evaluate(async () => {
    const { openSfocModal } = await import('./ui/sfocModal.js');
    openSfocModal({
      id: 'destructivePortalModal',
      title: 'Eliminar elementos',
      description: 'Confirmaci\u00f3n destructiva com\u00fan.',
      confirmLabel: 'Eliminar',
      variant: 'destructive'
    });
  });
  await expect(page.locator('#sfocOverlayRoot > [data-sfoc-modal-backdrop] [role="alertdialog"]')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('genera capturas representativas de la unificaciÃ³n V2', async ({
  extensionContext: context,
  extensionId
}) => {
  test.setTimeout(120_000);
  const output = path.resolve(import.meta.dirname, '../artifacts/workbench-v2-unified');
  await mkdir(output, { recursive: true });
  const page = await openWorkbench(context, extensionId);

  await page.setViewportSize({ width: 1280, height: 900 });
  await navigateWorkspace(page, 'apex-quality');
  await page.screenshot({ path: path.join(output, 'apex-quality-runs-dark-1280.png') });
  await page.locator('[data-action-id="apex-select-run"]').click();
  await page.screenshot({ path: path.join(output, 'apex-quality-tests-dark-1280.png') });

  await navigateWorkspace(page, 'diagnostics');
  await page.screenshot({ path: path.join(output, 'diagnostics-logs-dark-1280.png') });

  await page.setViewportSize({ width: 1024, height: 768 });
  await navigateWorkspace(page, 'query-explorer');
  await page.screenshot({ path: path.join(output, 'query-explorer-dark-1024.png') });
  await navigateWorkspace(page, 'data-workbench');
  await page.screenshot({ path: path.join(output, 'data-workbench-dark-1024.png') });

  await page.setViewportSize({ width: 1440, height: 900 });
  await navigateWorkspace(page, 'data-compare', 'custom-metadata');
  await page.screenshot({ path: path.join(output, 'custom-metadata-compare-dark-1440.png') });

  await page.locator('#workbenchThemeBtn').click();
  await navigateWorkspace(page, 'query-explorer');
  await page.screenshot({ path: path.join(output, 'query-explorer-light-1440.png') });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.locator('#workbenchCategory-development').click();
  await page.evaluate(async () => {
    const { openSfocModal } = await import('./ui/sfocModal.js');
    openSfocModal({
      id: 'visualPortalModal',
      title: 'Modal sobre navegaci\u00f3n',
      description: 'El submen\u00fa y M\u00e1s acciones se han cerrado al abrir este di\u00e1logo.',
      confirmLabel: 'Continuar'
    });
  });
  await page.screenshot({ path: path.join(output, 'modal-over-navigation-light-1024.png') });
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1280, height: 900 });
  await navigateWorkspace(page, 'diagnostics');
  await page.evaluate(async () => {
    const { mountSfocOverlay } = await import('./ui/sfocModal.js');
    const parent = document.getElementById('debugLogViewTracesModal');
    const tbody = document.getElementById('debugLogViewTracesTbody');
    if (tbody) tbody.innerHTML = '<tr><td>Agente Contact Center</td><td>SFDC_DevConsole</td><td>25/08/2026 12:00</td><td>25/08/2026 12:30</td><td><span class="debug-log-view-traces-status debug-log-view-traces-status--active">Activa</span></td><td>Editar</td></tr>';
    mountSfocOverlay(parent, { initialFocus: document.getElementById('debugLogViewTracesCloseBtn') });
  });
  await page.screenshot({ path: path.join(output, 'diagnostics-traces-light-1280.png') });
  await page.evaluate(async () => {
    const { mountSfocOverlay } = await import('./ui/sfocModal.js');
    const child = document.getElementById('debugLogEditTraceModal');
    mountSfocOverlay(child, { initialFocus: document.getElementById('debugLogEditTraceCancelBtn') });
  });
  await page.screenshot({ path: path.join(output, 'apex-traces-nested-modal-light-1280.png') });
});
