import { describe, expect, it } from 'vitest';
import {
  analyzeDependencies,
  buildDependencySoql,
  buildSalesforceMetadataUrl,
  buildSearchSoql,
  canOpenMetadataSource,
  chunkArray,
  compareCategories,
  enrichCategoriesWithReferencedBy,
  filterListMetadataForSearch,
  getListMetadataType,
  getSeedTypeById,
  groupNodesIntoCategories,
  mapListMetadataRows,
  mergeResolvedSearchIds,
  usesToolingSearch,
  mapFieldObjectRows,
  mapObjectNameRows,
  nodesToPackageSelections,
  nodeFromRefRow
} from '../shared/dependencyExplorer.js';

describe('listMetadata search', () => {
  it('only apexClass uses tooling SOQL search', () => {
    expect(usesToolingSearch(getSeedTypeById('apexClass'))).toBe(true);
    expect(usesToolingSearch(getSeedTypeById('flow'))).toBe(false);
    expect(getListMetadataType(getSeedTypeById('flow'))).toBe('Flow');
  });

  it('filters listMetadata records by query and custom object mdt', () => {
    const typeDef = getSeedTypeById('customObject');
    const records = [
      { fullName: 'Case' },
      { fullName: 'MyMdt__mdt' },
      { fullName: 'Account' }
    ];
    expect(filterListMetadataForSearch(records, typeDef, 'se').map((r) => r.fullName)).toEqual(['Case']);
    expect(filterListMetadataForSearch(records, typeDef, 'nt').map((r) => r.fullName)).toEqual(['Account']);
    expect(filterListMetadataForSearch(records, getSeedTypeById('customMetadata'), 'mdt')).toHaveLength(1);
  });

  it('maps listMetadata rows and merges tooling ids', () => {
    const typeDef = getSeedTypeById('customField');
    const items = mapListMetadataRows([{ fullName: 'Case.CC_Idioma' }], typeDef);
    expect(items[0].displayName).toBe('Case.CC_Idioma');
    const merged = mergeResolvedSearchIds(
      items,
      [{ Id: '00N1', DeveloperName: 'CC_Idioma', TableEnumOrId: 'Case' }],
      typeDef
    );
    expect(merged[0].id).toBe('00N1');
  });
});

describe('buildSearchSoql', () => {
  it('requires min chars', () => {
    expect(buildSearchSoql('apexClass', 'a')).toBeNull();
    expect(buildSearchSoql('apexClass', 'ab')).toContain('ApexClass');
  });

  it('escapes quotes in query', () => {
    const soql = buildSearchSoql('apexClass', "O'Brien");
    expect(soql).toContain("O\\'Brien");
  });
});

describe('buildDependencySoql', () => {
  it('builds outgoing dependency query', () => {
    const soql = buildDependencySoql(['01pXXX'], 'out');
    expect(soql).toContain('MetadataComponentId IN');
    expect(soql).toContain("!= 'FlexiPage'");
  });

  it('builds referenced-by query', () => {
    const soql = buildDependencySoql(['01pXXX'], 'in');
    expect(soql).toContain('RefMetadataComponentId IN');
  });
});

describe('analyzeDependencies', () => {
  const harDirect = [
    {
      MetadataComponentId: '01pSEED',
      MetadataComponentName: 'TestClass',
      MetadataComponentType: 'ApexClass',
      RefMetadataComponentName: 'CC_Lista',
      RefMetadataComponentType: 'CustomField',
      RefMetadataComponentId: '00N1',
      RefMetadataComponentNamespace: null
    },
    {
      MetadataComponentId: '01pSEED',
      MetadataComponentName: 'TestClass',
      MetadataComponentType: 'ApexClass',
      RefMetadataComponentName: 'CC_Lista_Valores',
      RefMetadataComponentType: 'CustomObject',
      RefMetadataComponentId: '01I1',
      RefMetadataComponentNamespace: null
    }
  ];

  const harLevel2 = [
    {
      MetadataComponentId: '01I1',
      MetadataComponentName: 'CC_Lista_Valores',
      MetadataComponentType: 'CustomObject',
      RefMetadataComponentName: 'SomePage',
      RefMetadataComponentType: 'FlexiPage',
      RefMetadataComponentId: '0M01',
      RefMetadataComponentNamespace: null
    }
  ];

  it('collects direct dependencies only by default', async () => {
    const queries = [];
    const result = await analyzeDependencies({
      seedId: '01pSEED',
      transitive: false,
      queryFn: async (soql) => {
        queries.push(soql);
        if (soql.includes('MetadataComponentId')) return harDirect;
        return [];
      }
    });
    expect(result.nodes).toHaveLength(2);
    expect(queries).toHaveLength(1);
  });

  it('runs BFS when transitive enabled', async () => {
    const result = await analyzeDependencies({
      seedId: '01pSEED',
      transitive: true,
      queryFn: async (soql) => {
        if (soql.includes("'01pSEED'")) return harDirect;
        if (soql.includes("'01I1'")) return harLevel2;
        return [];
      }
    });
    expect(result.nodes.length).toBeGreaterThanOrEqual(3);
    expect(result.queryCount).toBeGreaterThan(1);
  });

  it('includes referenced-by rows', async () => {
    const result = await analyzeDependencies({
      seedId: '01pSEED',
      includeReferencedBy: true,
      queryFn: async (soql) => {
        if (soql.includes('RefMetadataComponentId')) {
          return [
            {
              MetadataComponentId: '01pOTHER',
              MetadataComponentName: 'Other',
              MetadataComponentType: 'ApexClass',
              RefMetadataComponentId: '01pSEED',
              RefMetadataComponentName: 'TestClass',
              RefMetadataComponentType: 'ApexClass'
            }
          ];
        }
        if (soql.includes('MetadataComponentId')) return harDirect;
        return [];
      }
    });
    expect(result.nodes.some((n) => n.name === 'Other')).toBe(true);
  });
});

describe('groupNodesIntoCategories', () => {
  it('groups custom fields by object', () => {
    const nodes = [
      { id: '00N1', name: 'CC_Lista', type: 'CustomField' },
      { id: '01p1', name: 'MyClass', type: 'ApexClass' }
    ];
    const cats = groupNodesIntoCategories(nodes, { '00N1': 'Case' }, {});
    const fieldCat = cats.find((c) => c.categoryKey.startsWith('CustomField:'));
    expect(fieldCat?.label).toBe('Custom Fields on Case');
    expect(fieldCat?.count).toBe(1);
  });

  it('resolves custom object id to developer name', () => {
    const nodes = [{ id: '00N2', name: 'Fld', type: 'CustomField' }];
    const cats = groupNodesIntoCategories(
      nodes,
      { '00N2': '01IABC123456789' },
      { '01IABC123456789': 'CC_MCC' }
    );
    expect(cats[0].label).toBe('Custom Fields on CC_MCC');
  });
});

describe('compareCategories', () => {
  it('detects left-only and right-only items', () => {
    const left = groupNodesIntoCategories([{ id: '1', name: 'A', type: 'ApexClass' }]);
    const right = groupNodesIntoCategories([{ id: '2', name: 'B', type: 'ApexClass' }]);
    const cmp = compareCategories(left, right);
    const apex = cmp.find((c) => c.type === 'ApexClass');
    expect(apex?.hasDiff).toBe(true);
    expect(apex?.rows.find((r) => r.name === 'A')?.status).toBe('leftOnly');
    expect(apex?.rows.find((r) => r.name === 'B')?.status).toBe('rightOnly');
  });
});

describe('nodesToPackageSelections', () => {
  it('maps types to package xml members', () => {
    const map = nodesToPackageSelections([
      { name: 'Foo', type: 'ApexClass', namespace: null },
      { name: 'Bar', type: 'CustomField', namespace: 'ns' }
    ]);
    expect(map.get('ApexClass')?.has('Foo')).toBe(true);
    expect(map.get('CustomField')?.has('ns__Bar')).toBe(true);
  });
});

describe('chunkArray', () => {
  it('splits into chunks', () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
});

describe('nodeFromRefRow', () => {
  it('builds stable key with namespace', () => {
    const n = nodeFromRefRow({
      RefMetadataComponentId: 'x',
      RefMetadataComponentName: 'Cls',
      RefMetadataComponentType: 'ApexClass',
      RefMetadataComponentNamespace: 'copado'
    });
    expect(n.key).toBe('ApexClass:copado__Cls');
  });
});

describe('field/object row mappers', () => {
  it('maps field and object rows', () => {
    expect(mapFieldObjectRows([{ Id: '00N1', TableEnumOrId: 'Account' }])).toEqual({
      '00N1': 'Account'
    });
    expect(mapObjectNameRows([{ Id: '01I1', DeveloperName: 'CC_Obj' }])).toEqual({
      '01I1': 'CC_Obj'
    });
  });
});

describe('enrichCategoriesWithReferencedBy', () => {
  it('attaches referenced-by lists to category items', () => {
    const cats = groupNodesIntoCategories(
      [{ id: '00N1', name: 'CC_Idioma', type: 'CustomField' }],
      { '00N1': 'Case' },
      {}
    );
    const map = new Map([
      [
        '00N1',
        [
          { id: '01pA', name: 'AAC_Utils', type: 'ApexClass', namespace: null },
          { id: '01pB', name: 'AAC_TestDataFactory', type: 'ApexClass', namespace: null }
        ]
      ]
    ]);
    const catsNoType = cats.map((c) => ({
      ...c,
      items: c.items.map(({ type, ...rest }) => rest)
    }));
    const enriched = enrichCategoriesWithReferencedBy(catsNoType, map);
    expect(enriched[0].items[0].displayName).toBe('Case.CC_Idioma');
    expect(enriched[0].items[0].type).toBe('CustomField');
    expect(enriched[0].items[0].referencedBy).toHaveLength(2);
    expect(enriched[0].items[0].referencedByTotal).toBe(2);
  });
});

describe('buildSalesforceMetadataUrl', () => {
  it('builds custom field setup url', () => {
    const url = buildSalesforceMetadataUrl(
      'https://example.my.salesforce.com',
      { id: '00N123', type: 'CustomField', objectApiName: 'Case' }
    );
    expect(url).toContain('lightning/setup/ObjectManager/Case/FieldsAndRelationships/00N123/view');
  });

  it('builds apex class setup url', () => {
    const url = buildSalesforceMetadataUrl('https://example.my.salesforce.com', {
      id: '01pABC',
      type: 'ApexClass'
    });
    expect(url).toContain('lightning/setup/ApexClasses/page');
    expect(url).toContain('01pABC');
  });
});

describe('canOpenMetadataSource', () => {
  it('allows apex class and trigger only', () => {
    expect(canOpenMetadataSource({ type: 'ApexClass' })).toBe(true);
    expect(canOpenMetadataSource({ type: 'ApexTrigger' })).toBe(true);
    expect(canOpenMetadataSource({ type: 'CustomField' })).toBe(false);
  });
});
