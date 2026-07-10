import {
  restDeleteSobject,
  restGetSobject,
  restPatchSobject,
  restRequestWithSid
} from './salesforceApi.js';

/** @typedef {'insert' | 'update' | 'delete' | 'upsert' | 'undelete' | 'purge'} DmlOperation */

/**
 * @param {Record<string, unknown>} describe
 * @param {Record<string, string>} formValues fieldApiName -> raw string
 */
export function parseFieldsFromForm(describe, formValues) {
  const fields = Array.isArray(describe?.fields) ? describe.fields : [];
  const byName = new Map(fields.map((f) => [String(f.name || ''), f]));
  /** @type {Record<string, unknown>} */
  const payload = {};
  for (const [name, raw] of Object.entries(formValues || {})) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) continue;
    const meta = byName.get(name);
    payload[name] = coerceFieldValue(trimmed, meta);
  }
  return payload;
}

/**
 * @param {string} raw
 * @param {Record<string, unknown> | undefined} meta
 */
function coerceFieldValue(raw, meta) {
  const type = String(meta?.type || 'string').toLowerCase();
  if (type === 'boolean') {
    const lower = raw.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'sí' || lower === 'si') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
    return raw;
  }
  if (['int', 'double', 'currency', 'percent'].includes(type)) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

/**
 * @param {Record<string, unknown>} payload
 * @param {Record<string, unknown>} [describe]
 */
export function buildRecordPayload(payload, describe) {
  if (!describe) return { ...payload };
  const formStrings = /** @type {Record<string, string>} */ (
    Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, v == null ? '' : String(v)]))
  );
  return parseFieldsFromForm(describe, formStrings);
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} sobjectApiName
 * @param {string} recordId
 */
export async function retrieveRecord(instanceUrl, sid, apiVersion, sobjectApiName, recordId) {
  return restGetSobject(instanceUrl, sid, apiVersion, sobjectApiName, recordId);
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} sobjectApiName
 * @param {string} [recordTypeId]
 */
export async function retrieveLayout(instanceUrl, sid, apiVersion, sobjectApiName, recordTypeId) {
  const ver = String(apiVersion || '59.0').replace(/^v/i, '');
  const obj = String(sobjectApiName || '').trim();
  const rt = String(recordTypeId || '012000000000000AAA').trim();
  const path = `/services/data/v${ver}/sobjects/${encodeURIComponent(obj)}/describe/layouts/${encodeURIComponent(rt)}`;
  const res = await restRequestWithSid(instanceUrl, sid, 'GET', path);
  if (!res.ok) {
    throw new Error(`Layout fetch failed: ${res.status} ${res.text || ''}`);
  }
  return res.json;
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {DmlOperation} operation
 * @param {string} sobjectApiName
 * @param {Record<string, unknown>[]} records
 */
export async function executeDml(instanceUrl, sid, apiVersion, operation, sobjectApiName, records) {
  const obj = String(sobjectApiName || '').trim();
  const list = Array.isArray(records) ? records : [];
  if (!obj) throw new Error('Missing object API name');
  if (!list.length) throw new Error('No records to process');

  const op = String(operation || '').toLowerCase();
  if (op === 'insert') return insertRecords(instanceUrl, sid, apiVersion, obj, list);
  if (op === 'update') return updateRecords(instanceUrl, sid, apiVersion, obj, list);
  if (op === 'delete') return deleteRecords(instanceUrl, sid, apiVersion, obj, list);
  if (op === 'upsert') return upsertRecords(instanceUrl, sid, apiVersion, obj, list);
  if (op === 'undelete') return undeleteRecords(instanceUrl, sid, apiVersion, obj, list);
  if (op === 'purge') return purgeRecords(instanceUrl, sid, apiVersion, obj, list);
  throw new Error(`Unsupported DML operation: ${operation}`);
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} sobjectApiName
 * @param {Record<string, unknown>[]} records
 */
async function insertRecords(instanceUrl, sid, apiVersion, sobjectApiName, records) {
  if (records.length === 1) {
    const path = `/services/data/v${apiVersion}/sobjects/${encodeURIComponent(sobjectApiName)}/`;
    const res = await restRequestWithSid(instanceUrl, sid, 'POST', path, {
      body: JSON.stringify(records[0])
    });
    if (!res.ok) throw dmlError('insert', res);
    return { results: [res.json || { success: true, id: res.json?.id }], raw: res };
  }
  const path = `/services/data/v${apiVersion}/composite/sobjects`;
  const body = {
    allOrNone: false,
    records: records.map((r) => ({
      attributes: { type: sobjectApiName },
      ...r
    }))
  };
  const res = await restRequestWithSid(instanceUrl, sid, 'POST', path, { body: JSON.stringify(body) });
  if (!res.ok) throw dmlError('insert', res);
  return { results: Array.isArray(res.json) ? res.json : [res.json], raw: res };
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} sobjectApiName
 * @param {Record<string, unknown>[]} records
 */
async function updateRecords(instanceUrl, sid, apiVersion, sobjectApiName, records) {
  if (records.length === 1) {
    const id = String(records[0].Id || records[0].id || '').trim();
    if (!id) throw new Error('Update requires record Id');
    const { Id, id: _id, attributes, ...fields } = records[0];
    await restPatchSobject(instanceUrl, sid, apiVersion, sobjectApiName, id, fields);
    return { results: [{ id, success: true }], raw: null };
  }
  const path = `/services/data/v${apiVersion}/composite/sobjects`;
  const body = {
    allOrNone: false,
    records: records.map((r) => {
      const id = String(r.Id || r.id || '').trim();
      const { Id, id: _id, attributes, ...fields } = r;
      return { attributes: { type: sobjectApiName }, id, ...fields };
    })
  };
  const res = await restRequestWithSid(instanceUrl, sid, 'PATCH', path, { body: JSON.stringify(body) });
  if (!res.ok) throw dmlError('update', res);
  return { results: Array.isArray(res.json) ? res.json : [res.json], raw: res };
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} sobjectApiName
 * @param {Record<string, unknown>[]} records
 */
async function deleteRecords(instanceUrl, sid, apiVersion, sobjectApiName, records) {
  const ids = records
    .map((r) => (typeof r === 'string' ? r : String(r.Id || r.id || '').trim()))
    .filter(Boolean);
  if (!ids.length) throw new Error('Delete requires record Id(s)');
  if (ids.length === 1) {
    await restDeleteSobject(instanceUrl, sid, apiVersion, sobjectApiName, ids[0]);
    return { results: [{ id: ids[0], success: true }], raw: null };
  }
  const idsParam = ids.map((id) => encodeURIComponent(id)).join(',');
  const path = `/services/data/v${apiVersion}/composite/sobjects?ids=${idsParam}&allOrNone=false`;
  const res = await restRequestWithSid(instanceUrl, sid, 'DELETE', path);
  if (!res.ok) throw dmlError('delete', res);
  return { results: Array.isArray(res.json) ? res.json : [res.json], raw: res };
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} sobjectApiName
 * @param {Record<string, unknown>[]} records
 */
async function upsertRecords(instanceUrl, sid, apiVersion, sobjectApiName, records) {
  const path = `/services/data/v${apiVersion}/composite/sobjects`;
  const body = {
    allOrNone: false,
    records: records.map((r) => ({
      attributes: { type: sobjectApiName },
      ...r
    }))
  };
  const res = await restRequestWithSid(instanceUrl, sid, 'PATCH', path, { body: JSON.stringify(body) });
  if (!res.ok) throw dmlError('upsert', res);
  return { results: Array.isArray(res.json) ? res.json : [res.json], raw: res };
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} sobjectApiName
 * @param {Record<string, unknown>[]} records
 */
async function undeleteRecords(instanceUrl, sid, apiVersion, sobjectApiName, records) {
  const ids = records
    .map((r) => (typeof r === 'string' ? r : String(r.Id || r.id || '').trim()))
    .filter(Boolean);
  if (!ids.length) throw new Error('Undelete requires record Id(s)');
  const path = `/services/data/v${apiVersion}/sobjects/${encodeURIComponent(sobjectApiName)}/undelete`;
  const res = await restRequestWithSid(instanceUrl, sid, 'POST', path, {
    body: JSON.stringify({ ids })
  });
  if (!res.ok) throw dmlError('undelete', res);
  return { results: Array.isArray(res.json) ? res.json : [res.json], raw: res };
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} sobjectApiName
 * @param {Record<string, unknown>[]} records
 */
async function purgeRecords(instanceUrl, sid, apiVersion, sobjectApiName, records) {
  const ids = records
    .map((r) => (typeof r === 'string' ? r : String(r.Id || r.id || '').trim()))
    .filter(Boolean);
  if (!ids.length) throw new Error('Purge requires record Id(s)');
  if (ids.length === 1) {
    const path = `/services/data/v${apiVersion}/sobjects/${encodeURIComponent(sobjectApiName)}/${encodeURIComponent(ids[0])}?isHardDelete=true`;
    const res = await restRequestWithSid(instanceUrl, sid, 'DELETE', path);
    if (!res.ok) throw dmlError('purge', res);
    return { results: [{ id: ids[0], success: true }], raw: res };
  }
  const idsParam = ids.map((id) => encodeURIComponent(id)).join(',');
  const path = `/services/data/v${apiVersion}/composite/sobjects?ids=${idsParam}&allOrNone=false&isHardDelete=true`;
  const res = await restRequestWithSid(instanceUrl, sid, 'DELETE', path);
  if (!res.ok) throw dmlError('purge', res);
  return { results: Array.isArray(res.json) ? res.json : [res.json], raw: res };
}

/**
 * @param {string} op
 * @param {{ status?: number, text?: string, json?: unknown }} res
 */
function dmlError(op, res) {
  const detail =
    res.json && typeof res.json === 'object'
      ? JSON.stringify(res.json)
      : String(res.text || res.status || '');
  const err = new Error(`DML ${op} failed: ${res.status} ${detail}`);
  err.status = res.status;
  return err;
}
