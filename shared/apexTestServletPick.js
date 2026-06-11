/** @param {unknown} extstatus */
export function servletExtstatusSuggestsFailure(extstatus) {
  const s = String(extstatus ?? '').trim().toLowerCase();
  if (!s) return false;
  if (/\bfail\w*\b/.test(s)) return true;
  if (/\bcompile\s*fail/.test(s)) return true;
  const m = s.match(/\((\d+)\s*\/\s*(\d+)\)/);
  if (m && Number(m[1]) < Number(m[2])) return true;
  return false;
}

/**
 * Varias filas del servlet pueden compartir el mismo `parentid` (una por clase de test).
 * @param {unknown[]} rows
 */
export function pickPrimaryApexTestServletRow(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const priority = (st) => {
    const s = String(st || '')
      .trim()
      .toLowerCase();
    const order = ['processing', 'preparing', 'holding', 'abortingjob', 'queued'];
    const i = order.indexOf(s);
    return i >= 0 ? i : 100;
  };
  let best = rows[0];
  let bestP = priority(best.status);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const p = priority(row.status);
    if (p < bestP) {
      best = row;
      bestP = p;
    } else if (p === bestP && p === 100) {
      const rowFail = servletExtstatusSuggestsFailure(row.extstatus);
      const bestFail = servletExtstatusSuggestsFailure(best.extstatus);
      if (rowFail && !bestFail) best = row;
      else if (rowFail === bestFail && String(row.status || '') === 'Failed') best = row;
    }
  }
  return best;
}
