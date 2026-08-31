import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '../shared/htmlEntities.js';

describe('decodeHtmlEntities', () => {
  it('convierte entidades XML/HTML literales y dobles antes de renderizarlas', () => {
    expect(decodeHtmlEntities('An object &apos;Task.AV_OrigenApp__c&apos; &amp; &quot;other&quot;'))
      .toBe('An object \'Task.AV_OrigenApp__c\' & "other"');
    expect(decodeHtmlEntities('&amp;apos;')).toBe("'");
    expect(decodeHtmlEntities('&#x41;&#66;')).toBe('AB');
  });
});
