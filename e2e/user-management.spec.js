import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

let script, styles;
test.use({ viewport: { width: 1280, height: 900 } });
test.beforeAll(async () => {
  const built = await build({
    stdin: { contents: "import { setupCommandPaletteIntegration } from './sfInject/content/setupCommandPalette.js'; window.mountUserPalette = () => setupCommandPaletteIntegration.mount(document, {orgId:'test-org',lang:'es',prefs:{},quickLinks:[]});", resolveDir: process.cwd(), sourcefile: 'user-modal-e2e.js' },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'chrome114'
  });
  script = built.outputFiles[0].text;
  styles = await readFile(path.resolve('sfInject/content/styles.css'), 'utf8');
});
test.beforeEach(async ({ page }) => {
  await page.route('https://demo.my.salesforce.com/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Salesforce test</title></head><body style="background:#eaf3fb"><h1>Salesforce Setup · Datos simulados</h1><button id="origin">Página Salesforce</button></body></html>' }));
  await page.goto('https://demo.my.salesforce.com/lightning/setup/SetupOneHome/home');
  await page.evaluate(() => {
    const user = { id: '005000000000001', name: 'Blue Agent', username: 'blue.agent@example.test', email: 'agent@example.test', alias: 'bagent', federationIdentifier: 'EMP001', isActive: true, profileName: 'Contact Center Agent', roleName: 'Atención al cliente', userType: 'Standard', language: 'es', locale: 'es_ES', timeZone: 'Europe/Madrid', lastLoginDate: '2026-10-29T10:30:00Z', createdDate: '2025-01-01T09:00:00Z' };
    const direct = { id: '0PS000000000001', label: 'Agente base', developerName: 'Agent_Base', direct: true, assignmentIds: ['0Pa000000000001'], sources: [{ type: 'direct' }] };
    const inherited = { id: '0PS000000000002', label: 'Atención especializada', developerName: 'Specialist', direct: false, assignmentIds: [], sources: [{ type: 'group', id: '0PG000000000001', label: 'Contact Center' }] };
    const state = window.userTest = { calls: [], user, sets: [direct, inherited], groups: [], trace: null, password: null, failSets: false, failLogs: false, partial: false, incognito: false };
    const localStore = {};
    const catalog = Array.from({ length: 51 }, (_, n) => ({ id: '0PS' + String(n + 100).padStart(12, '0'), label: 'Permiso ' + String(n + 1).padStart(2, '0'), developerName: 'Permission_' + n, licenseId: n === 0 ? '0PL000000000001' : undefined, sources: [], assignmentIds: [] }));
    const levels = [{ id: '7dl000000000001', label: 'Developer Console', developerName: 'SFDC_DevConsole' }, { id: '7dl000000000002', label: 'Contact Center', developerName: 'Contact_Center' }];
    const send = async (msg) => {
      state.calls.push(msg); const type = msg.type.replace('sfInject:', '');
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (type === 'getSetupCommandPaletteFiles') return { ok: true, scripts: [] };
      if (type === 'searchSetupCommandPaletteFiles') return { ok: true, files: [] };
      if (type === 'searchSetupUsers') return { ok: true, users: [user] };
      if (type === 'getSetupUserDetails') return { ok: true, user };
      if (type === 'openUserPermissionAnalysis') return { ok: true, opened: true };
      if (type === 'setUserPassword') { state.password = msg.password; return { ok: true }; }
      if (type === 'updateSetupUser') {
        const names = { Email: 'email', Alias: 'alias', FederationIdentifier: 'federationIdentifier', LanguageLocaleKey: 'language', LocaleSidKey: 'locale', TimeZoneSidKey: 'timeZone' };
        for (const [name, value] of Object.entries(msg.fields || {})) user[names[name]] = value;
        return { ok: true, user };
      }
      if (type === 'getUserPermissionAssignments') { if (state.failSets) return { ok: false, reason: 'INSUFFICIENT_ACCESS' }; return { ok: true, assigned: state.sets }; }
      if (type === 'getUserPermissionGroupAssignments') return { ok: true, assigned: state.groups };
      if (type === 'searchUserAvailablePermissions') {
        if (msg.kind === 'groups') return { ok: true, items: [{ id: '0PG000000000001', label: 'Contact Center', developerName: 'Contact_Center', status: 'Updated', sources: [], assignmentIds: [] }, { id: '0PG000000000002', label: 'Recálculo', developerName: 'Recalc', status: 'Updating', blockedReason: 'GROUP_NOT_READY', sources: [], assignmentIds: [] }], nextCursor: null };
        const all = catalog.filter((c) => c.label.toLowerCase().includes(msg.query.toLowerCase()));
        return { ok: true, items: msg.cursor ? all.slice(50) : all.slice(0, 50), nextCursor: !msg.cursor && all.length > 50 ? { id: all[49].id, label: all[49].label } : null };
      }
      if (type.startsWith('assignUserPermission')) {
        const group = type.endsWith('Groups'); const collection = group ? state.groups : state.sets;
        const results = msg.ids.map((id, index) => {
          if (state.partial && index === 1) return { id, ok: false, reason: 'LICENSE' };
          const item = group ? { id, label: 'Contact Center', developerName: 'Contact_Center', status: 'Updated' } : catalog.find((c) => c.id === id);
          collection.push({ ...item, direct: true, assignmentIds: ['0Pa' + id.slice(3)], sources: [{ type: 'direct' }] });
          return { id, ok: true };
        });
        return { ok: true, results, partial: results.some((r) => !r.ok) };
      }
      if (type.startsWith('removeUserPermission')) {
        const key = type.endsWith('Groups') ? 'groups' : 'sets';
        state[key] = state[key].filter((c) => !c.assignmentIds.some((id) => msg.assignmentIds.includes(id)));
        return { ok: true, results: msg.assignmentIds.map((id) => ({ id, ok: true })) };
      }
      if (type === 'getUserPublicGroups') return { ok: true, groups: [{ id: '00G000000000001', label: 'Atención nacional', developerName: 'National_Support', reasons: [{ kind: 'nested', path: [{ id: user.id, type: 'User' }, { id: '00G000000000002', label: 'Oficina', type: 'Regular' }, { id: '00G000000000001', label: 'Atención nacional', type: 'Regular' }] }, { kind: 'role', path: [{ id: '00G000000000003', label: 'Rol Contact Center', type: 'Role' }, { id: '00G000000000001', label: 'Atención nacional', type: 'Regular' }] }] }] };
      if (type === 'getUserTraceConfiguration') return state.failLogs ? { ok: false, reason: 'NO_SID' } : { ok: true, trace: state.trace, debugLevels: levels, preferredDebugLevel: 'SFDC_DevConsole' };
      if (type === 'createUserTraceFlag') { state.trace = { id: '7tf000000000001', startIso: new Date().toISOString(), expirationIso: new Date(Date.now() + msg.minutes * 60000).toISOString(), debugLevelId: msg.debugLevelId }; return { ok: true }; }
      if (type === 'extendUserTraceFlag') { state.trace.expirationIso = new Date(Date.parse(state.trace.expirationIso) + msg.minutes * 60000).toISOString(); return { ok: true }; }
      if (type === 'updateUserTraceFlag') { state.trace.debugLevelId = msg.debugLevelId; return { ok: true }; }
      if (type === 'deleteUserTraceFlag') { state.trace = null; return { ok: true }; }
      if (type === 'getUserLoginAsAvailability') return { ok: true, incognito: state.incognito };
      if (type === 'openUserLoginAs') return { ok: true, opened: true, authenticationMayBeRequired: msg.target === 'incognito' };
      return { ok: false, reason: 'INVALID_REQUEST' };
    };
    window.chrome = {
      runtime: { id: 'test-extension', sendMessage: send, getURL: (path) => path === 'code/code.html' ? `chrome-extension://test-extension/${path}` : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#0176d3"/></svg>') },
      storage: { local: { get: async (key) => typeof key === 'string' ? { [key]: localStore[key] } : { ...localStore }, set: async (values) => Object.assign(localStore, values) }, onChanged: { addListener() {}, removeListener() {} } }
    };
  });
  await page.addStyleTag({ content: styles }); await page.addScriptTag({ content: script });
  await page.evaluate(() => window.mountUserPalette());
  await page.keyboard.press('Control+k');
  await page.locator('.sfoc-setup-palette-input').fill('blue');
  await expect(page.getByRole('button', { name: 'Ver usuario: Blue Agent' })).toBeVisible();
});
const modal = (page) => page.locator('.sfoc-user-modal');
async function open(page) { await page.getByRole('button', { name: 'Ver usuario: Blue Agent' }).click(); await expect(modal(page)).toBeVisible(); }
async function tab(page, name) { await modal(page).getByRole('tab', { name, exact: true }).click(); }

test('resumen centrado, foco, accesibilidad y restauración de la paleta', async ({ page }, info) => {
  const row = page.locator('.sfoc-setup-palette-user');
  await expect(row.locator('button')).toHaveCount(3); await expect(row.getByText('Activo', { exact: true })).toHaveCount(0);
  await page.evaluate(() => document.querySelector('.sfoc-setup-palette-results').scrollTop = 12);
  const scroll = await page.locator('.sfoc-setup-palette-results').evaluate((e) => e.scrollTop);
  await open(page);
  await expect(modal(page).getByRole('heading', { name: 'Identidad' })).toBeVisible();
  await expect(modal(page).getByRole('button', { name: 'Abrir en Salesforce', exact: true })).toBeVisible();
  await modal(page).getByRole('button', { name: 'Copiar User ID', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(modal(page).getByRole('button', { name: 'Guardar asignaciones como plantilla', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(modal(page).getByRole('button', { name: 'Copiar User ID', exact: true })).toBeFocused();
  const rect = await modal(page).boundingBox(); expect(Math.abs(rect.x + rect.width / 2 - 640)).toBeLessThan(3); expect(Math.abs(rect.y + rect.height / 2 - 450)).toBeLessThan(3);
  const a11y = await new AxeBuilder({ page }).include('.sfoc-user-modal').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('users-summary-desktop.png') });
  await modal(page).getByRole('tab', { name: 'Resumen', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(modal(page).getByRole('tab', { name: 'Permission Sets', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(modal(page)).toHaveCount(0); await expect(page.locator('.sfoc-setup-palette-input')).toHaveValue('blue');
  await expect(page.getByRole('button', { name: 'Ver usuario: Blue Agent' })).toBeFocused();
  expect(await page.locator('.sfoc-setup-palette-results').evaluate((e) => e.scrollTop)).toBe(scroll);
});

test('administración: edita usuario, cambia contraseña, abre análisis y aplica una plantilla', async ({ page }) => {
  await open(page);
  await expect(modal(page).getByRole('heading', { name: 'Administración' })).toBeVisible();
  await expect(modal(page).locator('.sfoc-um-admin-actions').getByRole('button')).toHaveCount(3);
  await expect(modal(page).getByRole('button', { name: 'Ver permisos efectivos' })).toBeVisible();
  await modal(page).getByRole('button', { name: 'Ver permisos efectivos' }).click();
  await expect.poll(() => page.evaluate(() => window.userTest.calls.some((call) => call.type === 'sfInject:openUserPermissionAnalysis'))).toBe(true);
  await modal(page).getByRole('button', { name: 'Editar usuario' }).click();
  const edit = page.locator('.sfoc-um-edit-dialog');
  await edit.getByRole('textbox', { name: 'Alias' }).fill('blue2');
  await edit.getByRole('button', { name: 'Guardar' }).click();
  await expect(modal(page).getByText('blue2', { exact: true })).toBeVisible();
  await modal(page).getByRole('button', { name: 'Establecer contraseña' }).click();
  const passwordDialog = page.locator('.sfoc-um-edit-dialog');
  await passwordDialog.getByLabel('Contraseña nueva').fill('S3gura!Pass');
  await passwordDialog.getByLabel('Confirmar contraseña').fill('S3gura!Pass');
  await passwordDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => page.evaluate(() => window.userTest.password)).toBe('S3gura!Pass');
  page.once('dialog', (dialog) => dialog.accept('Base Contact Center'));
  await modal(page).getByRole('button', { name: 'Guardar asignaciones como plantilla' }).click();
  await expect(modal(page).getByRole('combobox', { name: 'Plantillas de permisos' })).toHaveValue('Base Contact Center');
  page.once('dialog', (dialog) => dialog.accept());
  await modal(page).getByRole('button', { name: 'Aplicar plantilla' }).click();
  await expect(modal(page).getByRole('status')).toContainText('Plantilla de permisos aplicada');
});

test('permisos: carga inicial, búsqueda, paginación, resultado parcial y retirada', async ({ page }, info) => {
  await open(page); await tab(page, 'Permission Sets');
  await expect(modal(page).getByText('Agente base', { exact: true })).toBeVisible();
  await expect(modal(page).getByText('Agent_Base', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.userTest.calls.filter((c) => c.type === 'sfInject:searchUserAvailablePermissions').length)).toBe(0);
  await expect(modal(page).getByRole('checkbox', { name: 'Retirar: Atención especializada' })).toBeDisabled();
  await modal(page).getByRole('button', { name: 'Añadir', exact: true }).click();
  const search = modal(page).getByRole('searchbox', { name: 'Disponibles: Buscar por nombre o API Name' });
  await expect(search).toBeFocused(); await search.pressSequentially('Permiso');
  await expect(search).toBeFocused(); await expect(search).toHaveValue('Permiso');
  await expect(modal(page).getByRole('checkbox', { name: 'Asignar: Permiso 01' })).toBeVisible();
  await expect(modal(page).getByText('Permission_0', { exact: true })).toHaveCount(0);
  await expect(modal(page).getByText('Licencia: 0PL000000000001', { exact: true })).toHaveCount(0);
  await modal(page).getByRole('button', { name: 'Cargar más' }).click();
  await expect(modal(page).getByRole('checkbox', { name: 'Asignar: Permiso 51' })).toHaveCount(1);
  await page.evaluate(() => window.userTest.partial = true);
  await modal(page).getByRole('checkbox', { name: 'Asignar: Permiso 01', exact: true }).check();
  await modal(page).getByRole('checkbox', { name: 'Asignar: Permiso 02', exact: true }).check();
  await modal(page).getByRole('button', { name: 'Asignar 2', exact: true }).click();
  await expect(modal(page).getByText(/Algunos elementos/)).toBeVisible();
  await expect(modal(page).getByRole('button', { name: 'Asignar 1', exact: true })).toBeEnabled();
  await expect(modal(page).getByRole('checkbox', { name: 'Asignar: Permiso 02', exact: true })).toBeChecked();
  await page.screenshot({ path: info.outputPath('users-permissions-desktop.png') });
  await page.keyboard.press('Escape'); await expect(modal(page)).toBeVisible(); await expect(search).toBeHidden();
  await modal(page).getByRole('checkbox', { name: 'Retirar: Agente base' }).check();
  await modal(page).getByRole('button', { name: 'Retirar 1', exact: true }).first().click();
  await expect(modal(page).getByText('¿Retirar las asignaciones directas seleccionadas?')).toBeVisible();
  await modal(page).getByRole('button', { name: 'Retirar 1', exact: true }).last().click();
  await expect(modal(page).getByText('Agente base', { exact: true })).toHaveCount(0);
});

test('PS Groups y grupos públicos muestran estado y motivos', async ({ page }) => {
  await open(page); await tab(page, 'Permission Set Groups');
  await expect(modal(page).getByText('No hay asignaciones.', { exact: true })).toBeVisible();
  await modal(page).getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(modal(page).getByRole('checkbox', { name: 'Asignar: Recálculo' })).toBeDisabled();
  await modal(page).getByRole('checkbox', { name: 'Asignar: Contact Center' }).check();
  await modal(page).getByRole('button', { name: 'Asignar 1', exact: true }).click();
  await expect(modal(page).getByRole('checkbox', { name: 'Retirar: Contact Center' })).toBeVisible();
  await page.keyboard.press('Escape');
  await tab(page, 'Grupos públicos');
  await modal(page).getByText('Atención nacional', { exact: true }).click();
  await expect(modal(page).getByText('Usuario → Oficina → Atención nacional', { exact: true })).toBeVisible();
  await expect(modal(page).getByText('Rol Contact Center → Atención nacional', { exact: true })).toBeVisible();
});

test('errores de carga tienen reintento y se cachean las pestañas correctas', async ({ page }) => {
  await page.evaluate(() => window.userTest.failSets = true);
  await open(page); await tab(page, 'Permission Sets');
  await expect(modal(page).getByRole('alert')).toContainText('permisos administrativos');
  await page.evaluate(() => window.userTest.failSets = false);
  await modal(page).getByRole('button', { name: 'Reintentar' }).click();
  await expect(modal(page).getByText('Agente base', { exact: true })).toBeVisible();
  const n = await page.evaluate(() => window.userTest.calls.filter((c) => c.type === 'sfInject:getUserPermissionAssignments').length);
  await tab(page, 'Resumen'); await tab(page, 'Permission Sets');
  expect(await page.evaluate(() => window.userTest.calls.filter((c) => c.type === 'sfInject:getUserPermissionAssignments').length)).toBe(n);
});

test('logs: activar, renovar, cambiar nivel, desactivar y contraste', async ({ page }, info) => {
  await open(page); await tab(page, 'Logs');
  await expect(modal(page).getByText('Logs no configurados', { exact: true })).toBeVisible();
  await expect(modal(page).getByRole('link', { name: 'Abrir Debug Logs' })).toHaveAttribute('href', 'chrome-extension://test-extension/code/code.html?nav=development&op=DebugLogBrowser&left=test-org');
  await modal(page).getByRole('combobox', { name: 'Duración', exact: true }).selectOption('60');
  await modal(page).getByRole('button', { name: 'Activar logs', exact: true }).click();
  await expect(modal(page).getByText('Logs activos', { exact: true })).toBeVisible();
  await modal(page).getByRole('combobox', { name: 'Debug Level', exact: true }).selectOption('7dl000000000002');
  await modal(page).getByRole('button', { name: 'Guardar Debug Level' }).click();
  await expect.poll(() => page.evaluate(() => window.userTest.trace.debugLevelId)).toBe('7dl000000000002');
  await modal(page).getByRole('button', { name: 'Renovar', exact: true }).click();
  await expect(modal(page).getByRole('button', { name: 'Renovar', exact: true })).toBeEnabled();
  expect((await new AxeBuilder({ page }).include('.sfoc-user-modal').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('users-logs-desktop.png') });
  await modal(page).getByRole('button', { name: 'Desactivar', exact: true }).click();
  await modal(page).getByRole('button', { name: 'Desactivar', exact: true }).last().click();
  await expect(modal(page).getByText('Logs no configurados', { exact: true })).toBeVisible();
});

test('Login As accesible y móvil sin desbordamiento', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await modal(page).getByRole('button', { name: 'Login As', exact: true }).click();
  const loginButtonBox = await modal(page).getByRole('button', { name: 'Login As', exact: true }).boundingBox();
  const loginMenuBox = await page.getByRole('menu', { name: 'Login As', exact: true }).boundingBox();
  expect(loginMenuBox.y).toBeGreaterThanOrEqual(loginButtonBox.y + loginButtonBox.height);
  await expect(page.getByRole('menuitem', { name: 'En incógnito', exact: true })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: 'En incógnito', exact: true })).toHaveAttribute('title', /Permitir en incógnito/);
  await page.keyboard.press('Escape'); await expect(modal(page)).toBeVisible();
  await modal(page).getByRole('button', { name: 'Login As', exact: true }).click();
  await page.getByRole('menuitem', { name: 'En nueva pestaña', exact: true }).click();
  await expect(modal(page).getByRole('status')).toContainText('Salesforce comprobará');
  await page.evaluate(() => { window.userTest.incognito = true; });
  await modal(page).getByRole('button', { name: 'Login As', exact: true }).click();
  await page.getByRole('menuitem', { name: 'En incógnito', exact: true }).click();
  await expect(modal(page).getByRole('status')).toContainText('continuará automáticamente');
  await expect(modal(page).getByText('Activo', { exact: true })).toHaveCount(0);
  expect(await modal(page).evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('users-summary-mobile.png') });
  const a11y = await new AxeBuilder({ page }).include('.sfoc-user-modal').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
});
