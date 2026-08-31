import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  openExtensionPage,
  setLocalStorage,
  test,
  waitForCodeBoot
} from './extension.fixture.js';

async function navigate(page, nav, op, panelId) {
  const url = new URL(page.url());
  url.searchParams.set('nav', nav);
  if (op) url.searchParams.set('op', op);
  else url.searchParams.delete('op');
  await page.goto(url.toString());
  await waitForCodeBoot(page);
  if (panelId) await page.locator(`#${panelId}`).waitFor({ state: 'visible' });
}

async function openModal(page, variant) {
  await page.evaluate(async (modalVariant) => {
    const { openSfocModal } = await import('./ui/sfocModal.js');
    const destructive = modalVariant === 'destructive';
    const preset = {
      production: {
        title: 'Desplegar en producci\u00f3n',
        description: 'Destino: Contact Center PROD. Revisa el alcance antes de continuar.',
        confirmLabel: 'Desplegar'
      },
      permission: {
        title: 'Permisos insuficientes',
        description: 'Necesitas el permiso Modify All Data para completar esta operaci\u00f3n.',
        confirmLabel: 'Entendido'
      },
      session: {
        title: 'Sesi\u00f3n expirada',
        description: 'Vuelve a autenticar la org para recuperar el acceso a sus metadatos.',
        confirmLabel: 'Volver a autenticar'
      }
    }[modalVariant];
    openSfocModal({
      title: destructive ? 'Eliminar logs' : 'Ejecutar tests',
      description: destructive
        ? 'Esta acción elimina todos los logs de la org y no se puede deshacer.'
        : 'Se encolará una ejecución de tests Apex en Mi Sandbox.',
      confirmLabel: destructive ? 'Eliminar logs' : 'Ejecutar tests',
      ...(preset || {}),
      variant: modalVariant
    });
  }, variant);
}

test.skip(process.env.SFOC_UPDATE_VISUALS !== '1', 'Capturas actualizadas solo bajo solicitud explícita.');

test('genera comparación visual Classic y Workbench V2', async ({ extensionContext, extensionId, extensionWorker }) => {
  const phase = process.env.SFOC_VISUAL_PHASE;
  const visualLanguage = process.env.SFOC_VISUAL_LANGUAGE === 'en' ? 'en' : 'es';
  const output = process.env.SFOC_VISUAL_OUTPUT
    ? path.resolve(process.env.SFOC_VISUAL_OUTPUT)
    : path.resolve(
      import.meta.dirname,
      phase ? `../docs/visuals/application/${phase}` : '../docs/visuals'
    );
  await mkdir(output, { recursive: true });
  const onboarding = {
    tools: Object.fromEntries([
      'Comparator', 'QueryExplorer', 'DataWorkbench', 'ApexTests', 'QuickEdit'
    ].map((tool) => [tool, true])),
    helpOpened: true,
    telemetryNoticeDismissed: true,
    firstInstallWelcomeDismissed: true
  };
  await setLocalStorage(extensionWorker, {
    soc_language: visualLanguage,
    sfocFeatureControlsCache: {
      version: 1,
      rootVersionTarget: null,
      global: null,
      modes: {},
      tools: {},
      metadataTypes: {},
      actions: {}
    },
    sfocOnboardingSeen: onboarding,
    sfocWorkbenchPrefs: { panelExpanded: true, panelPinned: false, lastTabByWorkspace: {} },
    sfocToolRecents: { recents: ['QueryExplorer', 'ApexTests'], pins: ['QueryExplorer'] }
  });

  if (process.env.SFOC_V2_ONLY !== '1') {
    await setLocalStorage(extensionWorker, { sfocUiMode: 'classic' });
    const classic = await openExtensionPage(extensionContext, extensionId, 'code/code.html');
    await waitForCodeBoot(classic);
    await classic.setViewportSize({ width: 1280, height: 900 });
    await classic.screenshot({ path: path.join(output, 'classic-home-dark-1280.png') });
    await classic.close();
  }

  await setLocalStorage(extensionWorker, { sfocUiMode: 'v2' });
  const v2 = await openExtensionPage(extensionContext, extensionId, 'code/code.html');
  await waitForCodeBoot(v2);
  await v2.setViewportSize({ width: 1280, height: 900 });

  if (process.env.SFOC_LIGHT_ONLY !== '1') {
    await v2.screenshot({ path: path.join(output, 'v2-home-dark-1280.png') });
    await v2.locator('#workbenchCategory-development').click();
    await v2.waitForTimeout(200);
    await v2.screenshot({ path: path.join(output, 'v2-navigation-development-dark-1280.png') });
    await v2.locator('#workbenchCategory-development').click();
    await v2.keyboard.press('Control+K');
    await v2.locator('#quickOpenResults .quick-open-item').first().waitFor({ state: 'visible' });
    await v2.screenshot({ path: path.join(output, 'v2-command-palette-dark-1280.png') });
    await v2.keyboard.press('Escape');

    await openModal(v2, 'standard');
    await v2.screenshot({ path: path.join(output, 'v2-modal-standard-dark-1280.png') });
    await v2.keyboard.press('Escape');
    await openModal(v2, 'destructive');
    await v2.screenshot({ path: path.join(output, 'v2-modal-destructive-dark-1280.png') });
    await v2.keyboard.press('Escape');
    for (const variant of ['production', 'permission', 'session']) {
      await openModal(v2, variant);
      await v2.screenshot({ path: path.join(output, `v2-modal-${variant}-dark-1280.png`) });
      await v2.keyboard.press('Escape');
    }
  }

  if (await v2.evaluate(() => document.documentElement.dataset.uiTheme !== 'light')) {
    await v2.locator('#workbenchThemeBtn').click();
  }
  await v2.waitForTimeout(50);
  await v2.screenshot({ path: path.join(output, 'v2-home-light-1280.png') });

  await v2.setViewportSize({ width: 1440, height: 900 });
  await v2.screenshot({ path: path.join(output, 'v2-home-light-1440.png'), fullPage: true });
  await v2.locator('#workbenchCategory-development').click();
  await v2.waitForTimeout(100);
  await v2.screenshot({ path: path.join(output, 'v2-navigation-development-light-1440.png') });

  await navigate(v2, 'comparator', 'Comparator', 'standardComparePanel');
  await v2.waitForFunction(() => Boolean(window.monaco?.editor?.createDiffEditor));
  await v2.evaluate((language) => {
    const english = language === 'en';
    const leftLabel = document.querySelector('.org-dropdown-left .org-cd-label');
    const rightLabel = document.querySelector('.org-dropdown-right .org-cd-label');
    if (leftLabel) leftLabel.textContent = english ? 'QA Sandbox · active session' : 'Sandbox QA · sesión activa';
    if (rightLabel) rightLabel.textContent = english ? 'Production · active session' : 'Producción · sesión activa';
    document.querySelector('.org-dropdown-left .org-cd-trigger')?.classList.add('auth-active');
    document.querySelector('.org-dropdown-right .org-cd-trigger')?.classList.add('auth-active');

    document.querySelector('#compareListToolbar')?.classList.remove('hidden');
    const list = document.querySelector('#leftList');
    if (list) {
      list.replaceChildren();
      const rows = [
        ['A', 'AccountService.cls', 'selected'],
        ['T', 'AccountTrigger.trigger', ''],
        ['L', 'accountSummary.js', ''],
        ['X', 'Admin.permissionset-meta.xml', '']
      ];
      for (const [iconText, name, stateClass] of rows) {
        const row = document.createElement('li');
        row.className = `tree-depth-0 ${stateClass}`.trim();
        const spacer = document.createElement('span');
        spacer.className = 'bundle-chevron bundle-chevron--spacer';
        const icon = document.createElement('span');
        icon.className = 'list-tree-icon list-tree-icon--file';
        icon.textContent = iconText;
        const label = document.createElement('span');
        label.className = 'list-item-name';
        label.textContent = name;
        row.append(spacer, icon, label);
        list.append(row);
      }
    }
    const status = document.querySelector('#diffStatus');
    if (status) status.textContent = english ? '3 differences · AccountService.cls' : '3 diferencias · AccountService.cls';
    const leftMeta = document.querySelector('#leftFileMeta');
    const rightMeta = document.querySelector('#rightFileMeta');
    if (leftMeta) leftMeta.textContent = english ? 'QA Sandbox · API 63.0' : 'Sandbox QA · API 63.0';
    if (rightMeta) rightMeta.textContent = english ? 'Production · API 63.0' : 'Producción · API 63.0';

    const mount = document.querySelector('#monacoContainer');
    if (!mount) return;
    mount.replaceChildren();
    const originalText = [
      'public with sharing class AccountService {',
      '    public static List<Account> findActive() {',
      "        return [SELECT Id, Name FROM Account WHERE Active__c = true];",
      '    }',
      '}'
    ].join('\n');
    const modifiedText = [
      'public with sharing class AccountService {',
      '    public static List<Account> findActive() {',
      "        return [SELECT Id, Name, Industry FROM Account",
      "                WHERE Active__c = true WITH USER_MODE];",
      '    }',
      '}'
    ].join('\n');
    const monaco = window.monaco;
    monaco.editor.setTheme('sfoc-editor-light');
    const editor = monaco.editor.createDiffEditor(mount, {
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbersMinChars: 2,
      scrollBeyondLastLine: false
    });
    const original = monaco.editor.createModel(originalText, 'apex');
    const modified = monaco.editor.createModel(modifiedText, 'apex');
    editor.setModel({ original, modified });
    window.__sfocVisualDiff = { editor, original, modified };
  }, visualLanguage);
  await v2.waitForTimeout(250);
  await v2.screenshot({ path: path.join(output, 'v2-comparator-light-1440.png') });

  await navigate(v2, 'development', 'QueryExplorer', 'queryExplorerPanel');
  const builderToggle = v2.locator('#queryBuilderToggleBtn');
  if (await builderToggle.isVisible()) await builderToggle.click();
  await v2.screenshot({ path: path.join(output, 'v2-form-query-explorer-light-1440.png') });

  await navigate(v2, 'analysis', 'ObjectDescribe', 'objectDescribePanel');
  const tourClose = v2.locator('.driver-popover-close-btn');
  if (await tourClose.isVisible()) await tourClose.click();
  await v2.evaluate((language) => {
    const english = language === 'en';
    const body = document.querySelector('#objectDescribeFieldsTbody');
    if (!body) return;
    const rows = english
      ? [
        ['Id', 'Record identifier', 'Id', 'Yes', 'No', '—'],
        ['Name', 'Account name', 'String', 'No', 'No', '—'],
        ['Industry', 'Industry', 'Picklist', 'No', 'No', '—'],
        ['LastModifiedDate', 'Last modified', 'Datetime', 'Yes', 'No', '—']
      ]
      : [
        ['Id', 'Identificador de registro', 'Id', 'Sí', 'No', '—'],
        ['Name', 'Nombre de cuenta', 'String', 'No', 'No', '—'],
        ['Industry', 'Sector', 'Picklist', 'No', 'No', '—'],
        ['LastModifiedDate', 'Última modificación', 'Datetime', 'Sí', 'No', '—']
      ];
    body.replaceChildren(...rows.map((cells) => {
      const row = document.createElement('tr');
      row.append(...cells.map((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        return cell;
      }));
      return row;
    }));
    const summary = document.querySelector('#objectDescribeFieldsSummary');
    if (summary) summary.textContent = english ? '4 visible fields' : '4 campos visibles';
  }, visualLanguage);
  await v2.screenshot({ path: path.join(output, 'v2-table-object-describe-light-1440.png') });

  await navigate(v2, 'development', 'QuickEdit', 'quickEditPanel');
  await v2.waitForTimeout(250);
  await v2.screenshot({ path: path.join(output, 'v2-editor-quick-edit-light-1440.png') });

  await v2.keyboard.press('Control+K');
  await v2.locator('#quickOpenResults .quick-open-item').first().waitFor({ state: 'visible' });
  await v2.screenshot({ path: path.join(output, 'v2-command-palette-light-1440.png') });
  await v2.keyboard.press('Escape');

  await openModal(v2, 'standard');
  await v2.screenshot({ path: path.join(output, 'v2-modal-standard-light-1440.png') });
  await v2.keyboard.press('Escape');
  await openModal(v2, 'destructive');
  await v2.screenshot({ path: path.join(output, 'v2-modal-destructive-light-1440.png') });
  await v2.keyboard.press('Escape');
  for (const variant of ['production', 'permission', 'session']) {
    await openModal(v2, variant);
    await v2.screenshot({ path: path.join(output, `v2-modal-${variant}-light-1440.png`) });
    await v2.keyboard.press('Escape');
  }

  await navigate(v2, 'home', '', 'appLandingPanel');
  await v2.evaluate(async (language) => {
    const english = language === 'en';
    const { renderSfocState } = await import('./ui/sfocStates.js');
    const host = document.querySelector('#appLandingPanel .app-landing-inner');
    if (!host) return;
    host.replaceChildren();
    const header = document.createElement('header');
    header.className = 'workbench-marketing-section-header';
    const title = document.createElement('h2');
    title.textContent = english ? 'System states' : 'Estados del sistema';
    header.append(title);
    const grid = document.createElement('div');
    grid.className = 'workbench-capability-grid';
    const states = english
      ? [
        ['loading', 'Loading metadata', 'Fetching components from the org.'],
        ['empty', 'No results', 'Try another filter or select a different category.'],
        ['error', 'Unable to complete', 'Check the session and try again.']
      ]
      : [
        ['loading', 'Cargando metadatos', 'Consultando componentes de la org.'],
        ['empty', 'Sin resultados', 'Prueba otro filtro o selecciona otra categoría.'],
        ['error', 'No se pudo completar', 'Revisa la sesión y vuelve a intentarlo.']
      ];
    for (const [kind, stateTitle, description] of states) {
      const card = document.createElement('section');
      card.className = 'workbench-capability-card is-third';
      grid.append(card);
      renderSfocState(card, { kind, title: stateTitle, description });
    }
    host.append(header, grid);
  }, visualLanguage);
  await v2.screenshot({ path: path.join(output, 'v2-states-loading-empty-error-light-1440.png') });
  await v2.close();
});
