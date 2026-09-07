import { describe, expect, it, vi } from 'vitest';
import { createFilterController } from '../code/ui/filterController.js';
import { createTablePagination } from '../code/ui/tablePagination.js';

describe('createFilterController', () => {
  it('no aplica el borrador hasta apply y refresca aplicándolo una vez', async () => {
    const onApply = vi.fn();
    const controller = createFilterController({ text: '' }, { onApply });
    controller.update({ text: 'Case' });
    expect(onApply).not.toHaveBeenCalled();
    await controller.refresh();
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(controller.appliedFilters).toEqual({ text: 'Case' });
  });

  it('no aplica un rango inválido', async () => {
    const onApply = vi.fn();
    const controller = createFilterController({ valid: false }, {
      validate: (filters) => filters.valid,
      onApply
    });
    await expect(controller.apply()).resolves.toMatchObject({ ok: false });
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('createTablePagination', () => {
  it('conserva visible el primer registro al cambiar de tamaño', () => {
    const pager = createTablePagination({ initialPageSize: 25 });
    pager.setPage(2, 100);
    pager.setPageSize(50, 100);
    expect(pager.page).toBe(1);
    expect(pager.getSlice(Array.from({ length: 100 }))).toMatchObject({ start: 0, end: 50, total: 100 });
  });
});
