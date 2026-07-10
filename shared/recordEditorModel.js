/**
 * Ordenación de campos según layout detail/edit y utilidades del editor de registro.
 */

/**
 * @param {Record<string, unknown>} layout
 * @param {'detailLayoutSections' | 'editLayoutSections'} sectionKey
 * @returns {string[]}
 */
export function fieldOrderFromLayout(layout, sectionKey = 'detailLayoutSections') {
  const sections = Array.isArray(layout?.[sectionKey]) ? layout[sectionKey] : [];
  /** @type {string[]} */
  const order = [];
  const seen = new Set();
  for (const section of sections) {
    const rows = Array.isArray(section?.layoutRows) ? section.layoutRows : [];
    for (const row of rows) {
      const items = Array.isArray(row?.layoutItems) ? row.layoutItems : [];
      for (const item of items) {
        const components = Array.isArray(item?.layoutComponents) ? item.layoutComponents : [];
        for (const comp of components) {
          if (comp?.type === 'Field' && comp?.value) {
            const name = String(comp.value);
            if (!seen.has(name)) {
              seen.add(name);
              order.push(name);
            }
          }
        }
      }
    }
  }
  return order;
}

/**
 * @param {Record<string, unknown>} describe
 * @param {Record<string, unknown> | null} layout
 * @param {Record<string, unknown> | null} record
 */
export function buildRecordEditorRows(describe, layout, record) {
  const fields = Array.isArray(describe?.fields) ? describe.fields : [];
  const byName = new Map(fields.map((f) => [String(f.name || ''), f]));
  const layoutOrder = layout ? fieldOrderFromLayout(layout, 'detailLayoutSections') : [];
  const editOrder = layout ? fieldOrderFromLayout(layout, 'editLayoutSections') : [];
  const orderSet = new Set([...layoutOrder, ...editOrder]);
  /** @type {string[]} */
  const names = [];
  for (const n of layoutOrder) {
    if (byName.has(n)) names.push(n);
  }
  for (const f of fields) {
    const n = String(f.name || '');
    if (!n || names.includes(n)) continue;
    names.push(n);
  }

  return names.map((name) => {
    const meta = byName.get(name) || {};
    const onLayout = orderSet.has(name);
    const value = record && name in record ? record[name] : '';
    return {
      name,
      label: String(meta.label || name),
      type: String(meta.type || 'string'),
      updateable: !!meta.updateable,
      createable: !!meta.createable,
      calculated: !!meta.calculated,
      nillable: meta.nillable !== false,
      onLayout,
      value: value == null ? '' : value
    };
  });
}

/**
 * @param {Array<{ name: string, updateable?: boolean, createable?: boolean, calculated?: boolean }>} rows
 * @param {Record<string, string>} editedValues
 * @param {'update' | 'create'} mode
 */
export function buildUpdatePayloadFromRows(rows, editedValues, mode) {
  /** @type {Record<string, unknown>} */
  const payload = {};
  for (const row of rows) {
    const name = row.name;
    if (name === 'Id') continue;
    if (mode === 'update' && !row.updateable) continue;
    if (mode === 'create' && (!row.createable || row.calculated)) continue;
    if (!(name in editedValues)) continue;
    const raw = String(editedValues[name] ?? '').trim();
    if (!raw && row.nillable !== false) continue;
    if (!raw) continue;
    payload[name] = raw;
  }
  return payload;
}

/**
 * @param {Record<string, unknown>} original
 * @param {Record<string, unknown>} updated
 */
export function diffRecordFields(original, updated) {
  /** @type {Record<string, unknown>} */
  const patch = {};
  for (const [k, v] of Object.entries(updated)) {
    if (k === 'attributes' || k === 'Id') continue;
    const orig = original[k];
    if (JSON.stringify(orig) !== JSON.stringify(v)) {
      patch[k] = v;
    }
  }
  return patch;
}
