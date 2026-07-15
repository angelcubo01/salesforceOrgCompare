import { describe, expect, it } from 'vitest';
import {
  buildRecordEditorRows,
  buildUpdatePayloadFromRows,
  fieldOrderFromLayout
} from '../shared/recordEditorModel.js';

describe('recordEditorModel', () => {
  it('fieldOrderFromLayout extrae campos del layout', () => {
    const layout = {
      detailLayoutSections: [
        {
          layoutRows: [
            {
              layoutItems: [
                {
                  layoutComponents: [{ type: 'Field', value: 'Name' }]
                }
              ]
            }
          ]
        }
      ]
    };
    expect(fieldOrderFromLayout(layout)).toEqual(['Name']);
  });

  it('buildRecordEditorRows ordena por layout', () => {
    const describe = {
      fields: [
        { name: 'Name', label: 'Name', type: 'string', updateable: true, createable: true },
        { name: 'Industry', label: 'Industry', type: 'picklist', updateable: true, createable: true }
      ]
    };
    const layout = {
      detailLayoutSections: [
        {
          layoutRows: [
            {
              layoutItems: [
                { layoutComponents: [{ type: 'Field', value: 'Industry' }] }
              ]
            }
          ]
        }
      ]
    };
    const record = { Name: 'Acme', Industry: 'Tech' };
    const rows = buildRecordEditorRows(describe, layout, record);
    expect(rows[0].name).toBe('Industry');
    expect(rows.find((r) => r.name === 'Name')?.value).toBe('Acme');
  });

  it('buildUpdatePayloadFromRows respeta campos editables', () => {
    const rows = [
      { name: 'Name', updateable: true, createable: true, calculated: false, nillable: true },
      { name: 'Industry', updateable: false, createable: false, calculated: false, nillable: true }
    ];
    const payload = buildUpdatePayloadFromRows(rows, { Name: 'New', Industry: 'X' }, 'update');
    expect(payload).toEqual({ Name: 'New' });
  });
});
