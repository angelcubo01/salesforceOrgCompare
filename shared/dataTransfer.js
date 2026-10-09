/**
 * Traspaso efímero de resultados entre herramientas del mismo workbench.
 * No se persiste: puede contener datos de negocio y desaparece al cerrar la página.
 */
let stagedImport = null;

/**
 * @param {{ orgId: string, objectApiName: string, headers: string[], rows: Array<Record<string, unknown>> }} payload
 */
export function stageDataForImport(payload) {
  const headers = Array.isArray(payload?.headers)
    ? payload.headers.map((header) => String(header || '').trim()).filter(Boolean)
    : [];
  const rows = Array.isArray(payload?.rows)
    ? payload.rows.map((row) => ({ ...(row || {}) }))
    : [];
  stagedImport = {
    orgId: String(payload?.orgId || ''),
    objectApiName: String(payload?.objectApiName || ''),
    headers,
    rows
  };
}

export function consumeStagedImportData() {
  const payload = stagedImport;
  stagedImport = null;
  return payload;
}

export function hasStagedImportData() {
  return !!stagedImport?.rows?.length;
}
