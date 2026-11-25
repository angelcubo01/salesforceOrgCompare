import {
  expect,
  openExtensionPage,
  setLocalStorage,
  test,
  waitForCodeBoot
} from './extension.fixture.js';

test.beforeEach(async ({ extensionWorker }) => {
  await setLocalStorage(extensionWorker, {
    sfocUiMode: 'v2',
    soc_language: 'en',
    soc_extension_config: { uiTheme: 'light', monacoTheme: 'sfoc-editor-light' },
    sfocFeatureControlsCache: { version: 1, rootVersionTarget: null, global: null, modes: {}, tools: {}, metadataTypes: {}, actions: {} },
    sfocOnboardingSeen: {
      tools: { PermissionAccess: true }, helpOpened: true, telemetryNoticeDismissed: true, firstInstallWelcomeDismissed: true
    }
  });
  await extensionWorker.evaluate(async () => chrome.storage.sync.set({
    savedOrgs: {
      'org-access': {
        id: 'org-access', label: 'Access sandbox', displayName: 'Access sandbox',
        instanceUrl: 'https://access--dev.sandbox.my.salesforce.com', apiVersion: '63.0', isSandbox: true
      }
    },
    savedOrgOrder: ['org-access']
  }));
});

test('object and field matrices filter targets, queue checkbox changes, and retry only failures', async ({ extensionContext, extensionId }) => {
  const page = await openExtensionPage(extensionContext, extensionId, 'code/code.html?nav=development&op=PermissionAccess');
  await waitForCodeBoot(page);
  await expect(page.locator('body')).toHaveAttribute('data-workbench-workspace', 'permission-access');
  if (await page.locator('html').getAttribute('data-ui-theme') !== 'light') {
    await page.locator('#workbenchThemeBtn').click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'light');
  await expect(page.locator('#permissionAccessPanel')).toBeVisible();
  await expect(page.locator('.org-dropdown-right')).toBeHidden();
  await expect(page.locator('#permissionAccessPanel')).toContainText('Object & Field Access');
  await expect(page.locator('#permissionAccessResourceBadge')).toHaveCount(0);
  await expect(page.locator('#permissionAccessPanel [data-i18n="permissionAccess.subtitle"], #permissionAccessPanel [data-i18n="permissionAccess.matrixHint"], #permissionAccessPanel [data-i18n="permissionAccess.queueHint"]')).toHaveCount(0);

  await page.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    window.__permissionAccessApplyCalls = [];
    window.__permissionAccessObjectQueries = [];
    chrome.runtime.sendMessage = async (message) => {
      if (!String(message?.type || '').startsWith('permissionAccess:')) return original(message);
      if (message.type === 'permissionAccess:searchTargets') return message.targetType === 'Profile'
        ? { ok: true, items: [{ type: 'Profile', id: '00e1', name: 'Agent', label: 'Agent Profile' }] }
        : { ok: true, items: [
          { type: 'PermissionSet', id: '0PS1', name: 'Agents', label: 'Agent permissions' },
          { type: 'PermissionSet', id: '0PS2', name: 'Supervisors', label: 'Supervisors' }
        ] };
      if (message.type === 'permissionAccess:searchObjects') {
        window.__permissionAccessObjectQueries.push(message.queryText);
        return { ok: true, items: [{ name: 'Case', label: 'Case' }] };
      }
      if (message.type === 'permissionAccess:describeObject') return { ok: true, object: {
        name: 'Case', label: 'Case', fields: [{ name: 'Priority', label: 'Priority', permissionable: true, required: false }]
      } };
      if (message.type === 'permissionAccess:preview') return { ok: true, results: message.operations.map((operation) => {
        const field = operation.resource.type === 'field';
        const current = field
          ? { read: false, edit: false }
          : { read: false, create: false, edit: false, delete: false, viewAllRecords: false, modifyAllRecords: false, viewAllFields: false };
        const final = { ...current };
        const changes = {};
        for (const [key, action] of Object.entries(operation.desired || {})) {
          if (action === 'keep') continue;
          final[key] = action === 'grant';
          changes[key] = { current: current[key] === true, final: final[key] };
        }
        if (field && final.edit) {
          final.read = true;
          changes.read = { current: false, final: true };
        }
        return { ...operation, current, final, changes, status: Object.keys(changes).length ? 'pending' : 'unchanged' };
      }) };
      if (message.type === 'permissionAccess:applyBatch') {
        window.__permissionAccessApplyCalls.push(message.operations.map((item) => item.operationId));
        const retry = window.__permissionAccessApplyCalls.length > 1;
        const results = message.operations.map((operation, index) => ({
          ...operation, current: { read: false }, final: { read: true },
          status: retry || index === 0 ? 'success' : 'failed', error: retry || index === 0 ? null : 'FIELD_INTEGRITY_EXCEPTION'
        }));
        return { ok: true, results, summary: {
          total: results.length,
          applied: results.filter((item) => item.status === 'success').length,
          unchanged: 0,
          failed: results.filter((item) => item.status === 'failed').length
        } };
      }
      return { ok: false, error: 'unexpected mock request' };
    };
  });

  await page.locator('#permissionAccessObjectSearch').fill('cas');
  await page.locator('#permissionAccessObjectSuggestions button').click();
  await expect(page.locator('#permissionAccessTargetsBody tr')).toHaveCount(3);
  await expect(page.locator('#permissionAccessTargetsBody .is-profile')).toHaveCount(1);
  await expect(page.locator('#permissionAccessTargetsBody .is-permission-set')).toHaveCount(2);
  await expect(page.locator('#permissionAccessTargetsBody tr small')).toHaveCount(0);
  await expect(page.locator('#permissionAccessMatrixCard .permission-access-matrix-table')).toHaveCount(1);
  const lightThemeStyles = await page.evaluate(() => {
    const card = document.querySelector('#permissionAccessMatrixCard');
    const matrixHead = document.querySelector('#permissionAccessTargetsHead');
    const input = document.querySelector('#permissionAccessTargetsSearch');
    return {
      cardBackground: getComputedStyle(card).backgroundColor,
      cardColor: getComputedStyle(card).color,
      headBackground: getComputedStyle(matrixHead).backgroundColor,
      inputBackground: getComputedStyle(input).backgroundColor
    };
  });
  expect(lightThemeStyles).toEqual({
    cardBackground: 'rgb(255, 255, 255)',
    cardColor: 'rgb(24, 24, 24)',
    headBackground: 'rgb(247, 249, 251)',
    inputBackground: 'rgb(255, 255, 255)'
  });
  const scrollStyles = await page.evaluate(() => ({
    panelY: getComputedStyle(document.querySelector('#permissionAccessPanel')).overflowY,
    flowY: getComputedStyle(document.querySelector('#permissionAccessFlowScroll')).overflowY,
    matrixX: getComputedStyle(document.querySelector('#permissionAccessMatrixGroups .permission-access-table-wrap')).overflowX,
    matrixY: getComputedStyle(document.querySelector('#permissionAccessMatrixGroups .permission-access-table-wrap')).overflowY,
    matrixMaxHeight: getComputedStyle(document.querySelector('#permissionAccessMatrixGroups .permission-access-table-wrap')).maxHeight,
    queueX: getComputedStyle(document.querySelector('#permissionAccessQueueBody').closest('.permission-access-table-wrap')).overflowX
  }));
  expect(scrollStyles).toMatchObject({ panelY: 'auto', flowY: 'visible', matrixX: 'auto', matrixY: 'auto', queueX: 'auto' });
  expect(scrollStyles.matrixMaxHeight).not.toBe('none');

  await page.locator('#permissionAccessTargetsTitle').click();
  await page.locator('#permissionAccessObjectSearch').focus();
  await expect(page.locator('#permissionAccessObjectSuggestions')).toBeVisible();
  await page.locator('#permissionAccessTargetsTitle').click();
  await expect(page.locator('#permissionAccessObjectSuggestions')).toBeHidden();

  await page.locator('#permissionAccessFieldSearch').focus();
  await expect(page.locator('#permissionAccessFieldSuggestions')).toBeVisible();
  await page.locator('#permissionAccessTargetsTitle').click();
  await expect(page.locator('#permissionAccessFieldSuggestions')).toBeHidden();

  await page.locator('#permissionAccessTargetsSearch').fill('super');
  await expect(page.locator('#permissionAccessTargetsBody tr')).toHaveCount(1);
  await page.locator('#permissionAccessTargetsSearch').fill('');

  await page.locator('#permissionAccessTargetsBody tr').filter({ hasText: 'Agent permissions' })
    .locator('input[data-permission-key="read"]').check();
  await expect(page.locator('#permissionAccessQueueBody tr')).toHaveCount(1);

  await page.locator('#permissionAccessFieldSearch').fill('missing');
  await expect(page.locator('#permissionAccessFieldSuggestions')).toContainText('No fields match');
  await page.locator('#permissionAccessFieldSearch').fill('prio');
  await page.locator('#permissionAccessFieldSuggestions button').filter({ hasText: 'Priority' }).click();
  await expect(page.locator('#permissionAccessTargetsBody tr')).toHaveCount(3);
  await expect(page.locator('#permissionAccessTargetsHead th')).toHaveCount(3);
  const profileFieldRow = page.locator('#permissionAccessTargetsBody tr').filter({ hasText: 'Agent Profile' });
  await profileFieldRow.locator('input[data-permission-key="edit"]').check();
  await expect(profileFieldRow.locator('input[data-permission-key="read"]')).toBeChecked();
  await expect(page.locator('#permissionAccessQueueBody tr')).toHaveCount(2);

  await page.locator('#workbenchContextHeader [data-action-id="permission-access-apply"]').click();
  await page.locator('.sfoc-modal-actions .sfoc-btn--danger').click();
  await expect(page.locator('#permissionAccessRetryBtn')).toBeVisible();
  await expect(page.locator('#permissionAccessQueueBody tr[data-status="success"]')).toHaveCount(1);
  await expect(page.locator('#permissionAccessQueueBody tr[data-status="failed"]')).toHaveCount(1);

  await page.locator('#permissionAccessRetryBtn').click();
  await expect(page.locator('#permissionAccessRetryBtn')).toBeHidden();
  await expect(page.locator('#permissionAccessStatus')).not.toContainText('All changes have been processed.');
  const calls = await page.evaluate(() => window.__permissionAccessApplyCalls);
  const objectQueries = await page.evaluate(() => window.__permissionAccessObjectQueries);
  expect(objectQueries).toContain('cas');
  expect(calls[0]).toHaveLength(2);
  expect(calls[1]).toHaveLength(1);
  expect(calls[1][0]).toBe(calls[0][1]);
});
