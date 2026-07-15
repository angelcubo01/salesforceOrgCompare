import { describe, it, expect } from 'vitest';
import {
  normalizeCompareText,
  buildWildcardPackageXml,
  buildSingleMemberPackageXml,
  buildRetrieveCompareCache,
  buildPathStatusMaps,
  pickPrimaryMemberComparePath,
  contentSignatureFromFiles,
  extractMemberKeyFromZipPath,
  groupZipFilesByMember,
  compareMemberZipFiles,
  mergeMemberRows,
  compareZipMembers,
  filterMemberRows,
  isRestComparableMetadataType
} from '../shared/metadataTypeCompareCore.js';

describe('metadataTypeCompareCore', () => {
  it('normalizeCompareText normalizes line endings and trims end', () => {
    expect(normalizeCompareText('a\r\nb\r\n  ')).toBe('a\nb');
  });

  it('buildWildcardPackageXml includes members star', () => {
    const xml = buildWildcardPackageXml('ApexClass', '60.0');
    expect(xml).toContain('<members>*</members>');
    expect(xml).toContain('<name>ApexClass</name>');
    expect(xml).toContain('<version>60.0</version>');
  });

  it('buildSingleMemberPackageXml includes one member', () => {
    const xml = buildSingleMemberPackageXml('NamedCredential', 'API_AAC_PRE', '60.0');
    expect(xml).toContain('<members>API_AAC_PRE</members>');
    expect(xml).toContain('<name>NamedCredential</name>');
  });

  it('pickPrimaryMemberComparePath prefers non-meta file', () => {
    const path = pickPrimaryMemberComparePath(
      [{ path: 'namedCredentials/X.namedCredential-meta.xml' }],
      [{ path: 'namedCredentials/X.namedCredential' }]
    );
    expect(path).toBe('namedCredentials/X.namedCredential');
  });

  it('buildRetrieveCompareCache maps members to paths', () => {
    const cache = buildRetrieveCompareCache(
      [{ path: 'namedCredentials/A.namedCredential', content: 'left' }],
      [{ path: 'namedCredentials/A.namedCredential', content: 'right' }],
      'NamedCredential'
    );
    expect(cache.leftByPath['namedCredentials/A.namedCredential']).toBe('left');
    expect(cache.primaryPathByMember.get('A')).toBe('namedCredentials/A.namedCredential');
  });

  it('contentSignatureFromFiles is order-independent', () => {
    const a = contentSignatureFromFiles([
      { fileName: 'b.cls', content: 'two' },
      { fileName: 'a.cls', content: 'one' }
    ]);
    const b = contentSignatureFromFiles([
      { fileName: 'a.cls', content: 'one' },
      { fileName: 'b.cls', content: 'two' }
    ]);
    expect(a).toBe(b);
  });

  it('extractMemberKeyFromZipPath handles common paths', () => {
    expect(extractMemberKeyFromZipPath('classes/MyClass.cls')).toBe('MyClass');
    expect(extractMemberKeyFromZipPath('unpackaged/triggers/T1.trigger')).toBe('T1');
    expect(extractMemberKeyFromZipPath('lwc/myCmp/myCmp.js')).toBe('myCmp');
    expect(extractMemberKeyFromZipPath('flows/MyFlow.flow-meta.xml')).toBe('MyFlow');
  });

  it('groupZipFilesByMember groups bundle files', () => {
    const grouped = groupZipFilesByMember([
      { path: 'lwc/cmp/cmp.js', content: 'js' },
      { path: 'lwc/cmp/cmp.html', content: 'html' }
    ]);
    expect(grouped.get('cmp')?.length).toBe(2);
  });

  it('compareMemberZipFiles detects diff and sides', () => {
    expect(compareMemberZipFiles([], [{ path: 'a.cls', content: 'x' }]).status).toBe('rightOnly');
    expect(compareMemberZipFiles([{ path: 'a.cls', content: 'x' }], []).status).toBe('leftOnly');
    expect(
      compareMemberZipFiles([{ path: 'a.cls', content: 'x' }], [{ path: 'a.cls', content: 'x' }]).status
    ).toBe('match');
    expect(
      compareMemberZipFiles([{ path: 'a.cls', content: 'x' }], [{ path: 'a.cls', content: 'y' }]).status
    ).toBe('diff');
  });

  it('mergeMemberRows merges names and compare results', () => {
    const rows = mergeMemberRows(['A', 'B'], ['B', 'C'], new Map([['B', { status: 'diff' }]]));
    expect(rows.find((r) => r.key === 'A')?.status).toBe('leftOnly');
    expect(rows.find((r) => r.key === 'B')?.status).toBe('diff');
    expect(rows.find((r) => r.key === 'C')?.status).toBe('rightOnly');
  });

  it('compareZipMembers compares grouped maps', () => {
    const left = new Map([['X', [{ path: 'classes/X.cls', content: '1' }]]]);
    const right = new Map([['X', [{ path: 'classes/X.cls', content: '2' }]]]);
    const rows = compareZipMembers(left, right);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('diff');
  });

  it('filterMemberRows respects diffOnly', () => {
    const rows = [
      { key: 'a', label: 'a', status: 'match' },
      { key: 'b', label: 'b', status: 'diff' }
    ];
    expect(filterMemberRows(rows, true)).toHaveLength(1);
    expect(filterMemberRows(rows, false)).toHaveLength(2);
  });

  it('isRestComparableMetadataType identifies REST types', () => {
    expect(isRestComparableMetadataType('ApexClass')).toBe(true);
    expect(isRestComparableMetadataType('Profile')).toBe(false);
  });

  it('buildPathStatusMaps assigns status to paths', () => {
    const rows = [
      { key: 'A', label: 'A', status: 'diff' },
      { key: 'B', label: 'B', status: 'match' }
    ];
    const primary = new Map([['A', 'namedCredentials/A.namedCredential']]);
    const maps = buildPathStatusMaps(
      rows,
      ['namedCredentials/A.namedCredential', 'namedCredentials/B.namedCredential'],
      'NamedCredential',
      primary
    );
    expect(maps.pathStatusByRelativePath['namedCredentials/A.namedCredential']).toBe('diff');
    expect(maps.memberStatusByKey.A).toBe('diff');
  });
});
