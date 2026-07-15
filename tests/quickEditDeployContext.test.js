import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../code/core/state.js';
import {
  saveApexDraft,
  saveLightningDraft,
  clearReturnContext,
  hasReturnContext,
  getReturnContext,
  updateReturnContextAsyncId
} from '../code/lib/quickEditDeployContext.js';

describe('quickEditDeployContext', () => {
  beforeEach(() => {
    state.quickEditDeployReturn = null;
  });

  it('saveApexDraft y clearReturnContext', () => {
    saveApexDraft({
      orgId: 'org1',
      checkOnly: true,
      item: { type: 'ApexClass', name: 'Foo', fileName: 'Foo.cls' },
      content: 'class Foo {}',
      originalContent: 'class Foo {}'
    });
    expect(hasReturnContext('QuickEdit')).toBe(true);
    expect(getReturnContext()?.draft).toMatchObject({ name: 'Foo', content: 'class Foo {}' });
    updateReturnContextAsyncId('0Afxx');
    expect(getReturnContext()?.asyncId).toBe('0Afxx');
    clearReturnContext();
    expect(hasReturnContext()).toBe(false);
  });

  it('saveLightningDraft serializa archivos del bundle', () => {
    const files = new Map([
      ['myCmp.js', { content: 'export default class {}', originalContent: 'x', language: 'javascript' }],
      ['myCmp.html', { content: '<template></template>', originalContent: 'y', language: 'html' }]
    ]);
    saveLightningDraft({
      orgId: 'org2',
      checkOnly: false,
      selectedComponentType: 'LWC',
      bundleState: {
        artifactType: 'LWC',
        metadataType: 'LightningComponentBundle',
        bundleName: 'myCmp',
        bundleId: 'bundleId',
        activeFileName: 'myCmp.js',
        files
      }
    });
    expect(hasReturnContext('LightningQuickEdit')).toBe(true);
    const draft = /** @type {import('../code/lib/quickEditDeployContext.js').LightningQuickEditDraft} */ (
      getReturnContext()?.draft
    );
    expect(draft.files).toHaveLength(2);
    expect(draft.files.map((f) => f.fileName).sort()).toEqual(['myCmp.html', 'myCmp.js']);
  });
});
