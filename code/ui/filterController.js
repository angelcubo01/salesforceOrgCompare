function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Mantiene separado el borrador editable de los filtros aplicados a la tabla.
 * La UI decide cómo leer/escribir controles; este módulo no dispara consultas
 * desde eventos input/change.
 */
export function createFilterController(initialFilters, opts = {}) {
  let draftFilters = clone(initialFilters);
  let appliedFilters = clone(initialFilters);
  let applying = 0;

  const notify = () => opts.onStateChange?.({
    draftFilters: clone(draftFilters),
    appliedFilters: clone(appliedFilters),
    dirty: !same(draftFilters, appliedFilters),
    valid: opts.validate ? opts.validate(draftFilters) : true,
    applying: applying > 0
  });

  return {
    get draftFilters() { return clone(draftFilters); },
    get appliedFilters() { return clone(appliedFilters); },
    get dirty() { return !same(draftFilters, appliedFilters); },
    get valid() { return opts.validate ? opts.validate(draftFilters) : true; },
    update(patch) {
      draftFilters = { ...draftFilters, ...(patch || {}) };
      notify();
    },
    reset(next = initialFilters) {
      draftFilters = clone(next);
      notify();
    },
    async apply() {
      if (opts.validate && !opts.validate(draftFilters)) {
        notify();
        return { ok: false, reason: 'INVALID_FILTERS' };
      }
      appliedFilters = clone(draftFilters);
      const generation = ++applying;
      notify();
      try {
        await opts.onApply?.(clone(appliedFilters));
        return { ok: true, filters: clone(appliedFilters) };
      } finally {
        applying = Math.max(0, applying - 1);
        if (generation) notify();
      }
    },
    async refresh() {
      if (!same(draftFilters, appliedFilters)) return this.apply();
      const generation = ++applying;
      notify();
      try {
        await opts.onRefresh?.(clone(appliedFilters));
        return { ok: true, filters: clone(appliedFilters) };
      } finally {
        applying = Math.max(0, applying - 1);
        if (generation) notify();
      }
    },
    setApplied(next) {
      appliedFilters = clone(next);
      draftFilters = clone(next);
      notify();
    }
  };
}
