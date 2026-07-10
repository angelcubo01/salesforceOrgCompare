/**
 * Utilidades para acciones sobre Ids de Salesforce.
 */

/**
 * Detecta IDs Salesforce de 15 o 18 caracteres alfanuméricos.
 * @param {string} text
 */
export function extractSalesforceId(text) {
  const m = String(text || '').match(/\b([a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})\b/);
  return m ? m[1] : '';
}

/**
 * @param {string} instanceUrl
 * @param {string} recordId
 */
export function buildRecordViewUrl(instanceUrl, recordId) {
  const base = String(instanceUrl || '').replace(/\/$/, '');
  const id = String(recordId || '').trim();
  if (!base || !id) return '';
  return `${base}/${id}`;
}
