import { describe, expect, it } from 'vitest';
import { compositeDocumentId, MonacoWorkbench } from '../code/editor/monacoWorkbench.js';

describe('monacoWorkbench', () => {
  it('compositeDocumentId une bundle y archivo', () => {
    expect(compositeDocumentId('tab-1', 'lwc.js')).toBe('tab-1::lwc.js');
    expect(compositeDocumentId('tab-1', 'foo/bar.html')).toBe('tab-1::foo/bar.html');
  });

  it('makeUri genera path sin :: en la authority', () => {
    const wb = new MonacoWorkbench({ uriScheme: 'sfoc-lightning' });
    wb.monaco = {
      Uri: {
        parse: (uri) => ({ toString: () => uri })
      }
    };
    const uri = wb.makeUri('bundle_1::cc_operativa_oficina.js');
    expect(String(uri)).toBe(
      'sfoc-lightning://file/bundle_1/cc_operativa_oficina.js'
    );
  });
});