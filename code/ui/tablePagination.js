const PAGE_SIZES = Object.freeze([10, 25, 50, 100]);

export { PAGE_SIZES };

export function createTablePagination(opts = {}) {
  let page = 1;
  let pageSize = PAGE_SIZES.includes(Number(opts.initialPageSize)) ? Number(opts.initialPageSize) : 25;
  let totalRows = Math.max(0, Number(opts.getTotal?.() || 0));

  const totalPagesFor = (total) => Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / pageSize));
  const clamp = (total) => {
    page = Math.min(totalPagesFor(total), Math.max(1, page));
  };

  return {
    get page() { return page; },
    get pageSize() { return pageSize; },
    get totalPages() { return totalPagesFor(totalRows); },
    getSlice(rows) {
      const all = Array.isArray(rows) ? rows : [];
      totalRows = all.length;
      clamp(all.length);
      const start = (page - 1) * pageSize;
      return { rows: all.slice(start, start + pageSize), start, end: Math.min(start + pageSize, all.length), total: all.length };
    },
    setPage(next, total = opts.getTotal?.() || 0) {
      totalRows = Math.max(0, Number(total) || 0);
      page = Math.min(totalPagesFor(totalRows), Math.max(1, Math.floor(Number(next) || 1)));
      return page;
    },
    setPageSize(next, total = opts.getTotal?.() || 0) {
      const nextSize = Number(next);
      if (!PAGE_SIZES.includes(nextSize)) return pageSize;
      totalRows = Math.max(0, Number(total) || 0);
      const firstVisible = (page - 1) * pageSize;
      pageSize = nextSize;
      page = Math.floor(firstVisible / pageSize) + 1;
      clamp(totalRows);
      return pageSize;
    },
    first(total) { return this.setPage(1, total); },
    previous(total) { return this.setPage(page - 1, total); },
    next(total) { return this.setPage(page + 1, total); },
    last(total) { return this.setPage(totalPagesFor(total), total); },
    reset() { page = 1; }
  };
}
