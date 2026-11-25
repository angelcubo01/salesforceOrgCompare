import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('permission access panel', () => {
  it('incluye una matriz unificada, scroll general, cola y reintento exclusivo', async () => {
    const [html, source, css, lightThemeCss] = await Promise.all([
      readFile(new URL('../code/code.html', import.meta.url), 'utf8'),
      readFile(new URL('../code/ui/permissionAccessPanel.js', import.meta.url), 'utf8'),
      readFile(new URL('../code/code.css', import.meta.url), 'utf8'),
      readFile(new URL('../code/code-theme-light.css', import.meta.url), 'utf8')
    ]);
    for (const id of [
      'permissionAccessObjectSearch', 'permissionAccessFieldSearch', 'permissionAccessFieldSuggestions',
      'permissionAccessFlowScroll', 'permissionAccessTargetsSearch',
      'permissionAccessTargetsHead', 'permissionAccessTargetsBody',
      'permissionAccessQueueBody', 'permissionAccessApplyBtn', 'permissionAccessRetryBtn'
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(source).toContain("targetType: 'Profile'");
    expect(source).toContain("targetType: 'PermissionSet'");
    expect(source).toContain("checkbox.addEventListener('change'");
    expect(source).toContain('function searchFields()');
    expect(source).toContain('function invalidateObjectSelectionForSearch');
    expect(source).toContain('function invalidateFieldSelectionForSearch');
    expect(source).toContain("emptyLabel: t('permissionAccess.noFieldsMatch')");
    expect(source).toContain("`${field.label} (${selectedObject?.name}.${field.name})`");
    expect(source).toContain("addEventListener('input', renderTargets)");
    expect(source).toContain("document.addEventListener('pointerdown', closeSuggestionsOnOutsidePointer)");
    expect(source).toContain('function closeSuggestionsOnOutsidePointer');
    expect(source).not.toContain('function renderTargetGroup');
    expect(source).toContain("filter((item) => item.status === 'failed')");
    expect(source).not.toContain("t('permissionAccess.completed')");
    expect(source).not.toContain('function renderResourceBadge');
    expect(source).not.toContain('const apiName = document.createElement');
    expect(source).toContain('confirmSfocOrgAction');
    expect(source).toContain("guardToolAction('deploy')");
    expect(html).not.toContain('id="permissionAccessAddBtn"');
    expect(html).not.toContain('id="permissionAccessTargetSearch"');
    expect(html).not.toContain('id="permissionAccessProfilesBody"');
    expect(html).not.toContain('id="permissionAccessPermissionSetsBody"');
    expect(html).not.toContain('id="permissionAccessResourceBadge"');
    expect(html).not.toContain('data-i18n="permissionAccess.subtitle"');
    expect(html).not.toContain('data-i18n="permissionAccess.matrixHint"');
    expect(html).not.toContain('data-i18n="permissionAccess.queueHint"');
    expect(css).toMatch(/\.sfoc-tool-panel\.permission-access-panel\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.permission-access-flow-scroll\s*\{[^}]*overflow:\s*visible/);
    expect(css).toMatch(/\.permission-access-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.permission-access-matrix-table-wrap\s*\{[^}]*max-height:\s*min\(54vh,\s*36rem\)[^}]*overflow:\s*auto/);
    expect(lightThemeCss).toContain('body[data-ui-mode="v2"] .permission-access-panel');
    expect(lightThemeCss).toContain('.permission-access-target-group-head');
    expect(lightThemeCss).toContain('.permission-access-matrix-table tr.is-modified td');
  });

  it('no envía contexto de comparación al background', async () => {
    const source = await readFile(new URL('../code/ui/permissionAccessPanel.js', import.meta.url), 'utf8');
    expect(source).not.toContain('rightOrgId:');
    expect(source).not.toContain('comparisonMode: true');
  });
});
