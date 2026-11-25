import {
  expect,
  openExtensionPage,
  setLocalStorage,
  test,
  waitForCodeBoot
} from './extension.fixture.js';

test.describe.configure({ mode: 'serial' });

const SEEN_TOOLS = Object.fromEntries(
  ['Comparator', 'ApexTests', 'AnonymousApex', 'QueryExplorer', 'OrgLimits'].map((tool) => [tool, true])
);

test.beforeEach(async ({ extensionWorker }) => {
  await setLocalStorage(extensionWorker, {
    sfocUiMode: 'v2',
    soc_language: 'es',
    sfocAppNavPrefs: { lastMode: 'home', lastToolByMode: {} },
    sfocOnboardingSeen: {
      tools: SEEN_TOOLS,
      helpOpened: true,
      telemetryNoticeDismissed: true,
      firstInstallWelcomeDismissed: true
    }
  });
  await extensionWorker.evaluate(async () => chrome.storage.sync.set({
    savedOrgs: {
      'org-single-a': {
        id: 'org-single-a', label: 'A', displayName: 'Entorno A',
        instanceUrl: 'https://a.example.my.salesforce.com', apiVersion: '63.0', isSandbox: true
      },
      'org-single-b': {
        id: 'org-single-b', label: 'B', displayName: 'Entorno B',
        instanceUrl: 'https://b.example.my.salesforce.com', apiVersion: '63.0', isSandbox: true
      }
    },
    savedOrderOrgs: ['org-single-a', 'org-single-b'],
    savedOrgOrder: ['org-single-a', 'org-single-b']
  }));
});

test.afterEach(async ({ extensionContext }) => {
  const pages = extensionContext.pages().filter((page) => page.url() !== 'about:blank');
  await Promise.all(pages.map((page) => page.close({ runBeforeUnload: false }).catch(() => {})));
});

async function openComparator(context, extensionId) {
  const page = await openExtensionPage(
    context,
    extensionId,
    'code/code.html?nav=comparator&op=Comparator&left=org-single-a&right=org-single-b'
  );
  await waitForCodeBoot(page);
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'comparator');
  return page;
}

test('Vista única está desactivada por defecto y el comparador sigue en modo dual', async ({
  extensionContext: context,
  extensionId
}) => {
  const page = await openComparator(context, extensionId);

  const toggle = page.locator('.workbench-tool-comparison-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText('Vista única');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('body')).not.toHaveClass(/artifact-comparator-single-view/);
  await expect(page.locator('.org-dropdown-right')).toBeVisible();
  await expect(page.locator('#rightOrg')).toHaveValue('org-single-b');
});

test('activar Vista única oculta la org derecha y los controles de diff; desactivar los restaura', async ({
  extensionContext: context,
  extensionId
}) => {
  const page = await openComparator(context, extensionId);
  const toggle = page.locator('.workbench-tool-comparison-toggle');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveClass(/artifact-comparator-single-view/);
  await expect(page.locator('.org-dropdown-right')).toBeHidden();
  await expect(page.locator('#swapOrgsBtn')).toBeHidden();
  await expect(page.locator('#rightOrg')).toHaveValue('');
  await expect(page.locator('#leftOrg')).toHaveValue('org-single-a');
  for (const id of ['prevDiffBtn', 'nextDiffBtn', 'toggleWhitespaceBtn', 'copyUnifiedDiffBtn', 'exportDiffHtmlBtn']) {
    await expect(page.locator(`#${id}`)).toHaveClass(/hidden/);
  }
  // El estado de diff tampoco aplica sin comparación.
  await expect(page.locator('.workbench-compare-status')).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('body')).not.toHaveClass(/artifact-comparator-single-view/);
  await expect(page.locator('.org-dropdown-right')).toBeVisible();
  // La org derecha aparcada vuelve al desactivar.
  await expect(page.locator('#rightOrg')).toHaveValue('org-single-b');
  await expect(page.locator('#prevDiffBtn')).not.toHaveClass(/hidden/);
});

test('Vista única no aparece en otras herramientas ni arrastra su estado', async ({
  extensionContext: context,
  extensionId
}) => {
  const page = await openComparator(context, extensionId);
  await page.locator('.workbench-tool-comparison-toggle').click();
  await expect(page.locator('body')).toHaveClass(/artifact-comparator-single-view/);

  await page.evaluate(async () => {
    const { navigateToWorkspaceTab } = await import('./workbench/workbenchShell.js');
    await navigateToWorkspaceTab('apex-quality', 'main', { userInitiated: true });
  });
  // Otra herramienta: sin la clase de vista única y sin el toggle del comparador.
  await expect(page.locator('body')).not.toHaveClass(/artifact-comparator-single-view/);
  await expect(page.locator('.workbench-tool-comparison-toggle')).toHaveCount(0);
});
