/**
 * Clave estable para comparar IDs Salesforce de 15 y 18 caracteres.
 * Conserva el valor original para llamadas API y usa esta clave solo en mapas.
 */
export function normalizeSalesforceIdKey(value) {
  const id = String(value || '').replace(/[^a-zA-Z0-9]/g, '');
  return id.length >= 15 ? id.slice(0, 15).toLowerCase() : id.toLowerCase();
}
