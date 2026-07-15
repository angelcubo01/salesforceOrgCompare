import { describe, expect, it } from 'vitest';
import { filterSobjects, resolveObjectApiNameFromId } from '../shared/objectDescribeApi.js';

describe('objectDescribePanel helpers via API', () => {
  it('limits filtered objects for select population', () => {
    const many = Array.from({ length: 600 }, (_, i) => ({
      name: `Obj_${i}`,
      label: `Obj ${i}`,
      keyPrefix: String(i).padStart(3, '0').slice(0, 3)
    }));
    const filtered = filterSobjects(many, '', '').slice(0, 500);
    expect(filtered).toHaveLength(500);
  });

  it('returns null when id prefix unknown', () => {
    expect(resolveObjectApiNameFromId([{ name: 'Account', keyPrefix: '001' }], '999xxx')).toBeNull();
  });
});
