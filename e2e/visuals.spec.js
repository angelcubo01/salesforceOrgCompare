import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  openExtensionPage,
  setLocalStorage,
  test,
  waitForCodeBoot
} from './extension.fixture.js';

test.skip(process.env.SFOC_UPDATE_VISUALS !== '1', 'Capturas actualizadas solo bajo solicitud explícita.');

test('genera comparación visual Classic y Workbench V2', async ({ extensionContext, extensionId, extensionWorker }) => {
  const output = path.resolve(import.meta.dirname, '../docs/visuals');
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
    soc_language: 'es',
    sfocOnboardingSeen: onboarding,
    sfocWorkbenchPrefs: { panelExpanded: true, panelPinned: false, lastTabByWorkspace: {} },
    sfocToolRecents: { recents: ['QueryExplorer', 'ApexTests'], pins: ['QueryExplorer'] }
  });

  await setLocalStorage(extensionWorker, { sfocUiMode: 'classic' });
  const classic = await openExtensionPage(extensionContext, extensionId, 'code/code.html');
  await waitForCodeBoot(classic);
  await classic.setViewportSize({ width: 1280, height: 900 });
  await classic.screenshot({ path: path.join(output, 'classic-home-dark-1280.png') });
  await classic.close();

  await setLocalStorage(extensionWorker, { sfocUiMode: 'v2' });
  const v2 = await openExtensionPage(extensionContext, extensionId, 'code/code.html');
  await waitForCodeBoot(v2);
  await v2.setViewportSize({ width: 1280, height: 900 });
  await v2.screenshot({ path: path.join(output, 'v2-home-dark-1280.png') });
  await v2.locator('#workbenchCategory-development').click();
  await v2.waitForTimeout(200);
  await v2.screenshot({ path: path.join(output, 'v2-navigation-development-dark-1280.png') });
  await v2.locator('#workbenchCategory-development').click();
  await v2.keyboard.press('Control+K');
  await v2.locator('#quickOpenResults .quick-open-item').first().waitFor({ state: 'visible' });
  await v2.screenshot({ path: path.join(output, 'v2-command-palette-dark-1280.png') });
  await v2.keyboard.press('Escape');

  await v2.evaluate(async () => {
    const { openSfocModal } = await import('./ui/sfocModal.js');
    openSfocModal({
      title: 'Ejecutar tests',
      description: 'Se encolará una ejecución de tests Apex en Mi Sandbox.',
      confirmLabel: 'Ejecutar tests',
      variant: 'standard'
    });
  });
  await v2.screenshot({ path: path.join(output, 'v2-modal-standard-dark-1280.png') });
  await v2.keyboard.press('Escape');
  await v2.evaluate(async () => {
    const { openSfocModal } = await import('./ui/sfocModal.js');
    openSfocModal({
      title: 'Eliminar logs',
      description: 'Esta acción elimina todos los logs de la org y no se puede deshacer.',
      confirmLabel: 'Eliminar logs',
      variant: 'destructive'
    });
  });
  await v2.screenshot({ path: path.join(output, 'v2-modal-destructive-dark-1280.png') });
  await v2.keyboard.press('Escape');
  await v2.locator('#workbenchThemeBtn').click();
  await v2.waitForTimeout(50);
  await v2.screenshot({ path: path.join(output, 'v2-home-light-1280.png') });
  await v2.close();
});
