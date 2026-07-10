/**
 * Importación masiva vía SOAP Enterprise/Partner API (inspirado en Salesforce Inspector Reloaded).
 */

const SOAP_ENV = 'http://schemas.xmlsoap.org/soap/envelope/';
const SOAP_NS = 'urn:partner.soap.sforce.com';

/**
 * @param {string} s
 */
function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {Record<string, unknown>} record
 * @param {string} typeName
 */
function recordToXml(record, typeName) {
  let fields = '';
  for (const [key, val] of Object.entries(record || {})) {
    if (key === 'attributes' || val == null || val === '') continue;
    fields += `<urn:${escapeXml(key)}>${escapeXml(val)}</urn:${escapeXml(key)}>`;
  }
  return `<urn:sObjects xsi:type="urn:${escapeXml(typeName)}">${fields}</urn:sObjects>`;
}

/**
 * @param {Record<string, string>} soapHeaders
 */
function buildOptionalSoapHeaders(soapHeaders) {
  if (!soapHeaders || typeof soapHeaders !== 'object') return '';
  let xml = '';
  if (soapHeaders.AssignmentRuleHeader) {
    try {
      const h = JSON.parse(soapHeaders.AssignmentRuleHeader);
      const useDefault = h?.useDefaultRule === true ? 'true' : 'false';
      xml += `<urn:AssignmentRuleHeader><urn:useDefaultRule>${useDefault}</urn:useDefaultRule></urn:AssignmentRuleHeader>`;
    } catch {
      /* ignore */
    }
  }
  if (soapHeaders.DuplicateRuleHeader) {
    try {
      const h = JSON.parse(soapHeaders.DuplicateRuleHeader);
      const allow = h?.allowSave === true ? 'true' : 'false';
      xml += `<urn:DuplicateRuleHeader><urn:allowSave>${allow}</urn:allowSave></urn:DuplicateRuleHeader>`;
    } catch {
      /* ignore */
    }
  }
  return xml;
}

/**
 * @param {object} opts
 * @param {string} opts.instanceUrl
 * @param {string} opts.sid
 * @param {string} opts.apiVersion
 * @param {string} opts.operation
 * @param {string} opts.objectApiName
 * @param {Record<string, string>[]} opts.records
 * @param {string} [opts.externalIdField]
 * @param {Record<string, string>} [opts.soapHeaders]
 */
export async function executeSoapImportBatch(opts) {
  const operation = String(opts.operation || 'insert').toLowerCase();
  const objectApiName = String(opts.objectApiName || '').trim();
  const records = Array.isArray(opts.records) ? opts.records : [];
  if (!objectApiName) throw new Error('Missing object API name');
  if (!records.length) throw new Error('No records in batch');

  const ver = String(opts.apiVersion || '59.0').replace(/^v/i, '');
  const url = `${String(opts.instanceUrl || '').replace(/\/$/, '')}/services/Soap/u/${ver}`;

  let bodyInner = '';
  if (operation === 'delete' || operation === 'undelete') {
    const ids = records
      .map((r) => String(r.Id || r.id || '').trim())
      .filter(Boolean);
    bodyInner = `<urn:${operation}><urn:ids>${ids.map((id) => escapeXml(id)).join('</urn:ids><urn:ids>')}</urn:ids></urn:${operation}>`;
  } else if (operation === 'upsert') {
    const ext = String(opts.externalIdField || 'Id').trim();
    bodyInner = `<urn:upsert><urn:externalIDFieldName>${escapeXml(ext)}</urn:externalIDFieldName>${records.map((r) => recordToXml(r, objectApiName)).join('')}</urn:upsert>`;
  } else if (operation === 'update') {
    bodyInner = `<urn:update>${records.map((r) => recordToXml(r, objectApiName)).join('')}</urn:update>`;
  } else {
    bodyInner = `<urn:create>${records.map((r) => recordToXml(r, objectApiName)).join('')}</urn:create>`;
  }

  const headerExtras = buildOptionalSoapHeaders(opts.soapHeaders || {});
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${SOAP_ENV}" xmlns:urn="${SOAP_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<soapenv:Header>` +
    `<urn:SessionHeader><urn:sessionId>${escapeXml(opts.sid)}</urn:sessionId></urn:SessionHeader>` +
    headerExtras +
    `</soapenv:Header>` +
    `<soapenv:Body>${bodyInner}</soapenv:Body>` +
    `</soapenv:Envelope>`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      SOAPAction: '""'
    },
    body: envelope
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SOAP ${operation} failed: HTTP ${res.status}`);
  }
  if (text.includes('faultstring')) {
    const fault = text.match(/<faultstring>([^<]*)<\/faultstring>/i)?.[1] || 'SOAP fault';
    throw new Error(fault);
  }
  return parseSoapResults(text, records.length);
}

/**
 * @param {string} xml
 * @param {number} expectedCount
 */
export function parseSoapResults(xml, expectedCount) {
  /** @type {Array<{ success: boolean, id?: string, errors?: string[] }>} */
  const results = [];
  const blocks = xml.match(/<result>[\s\S]*?<\/result>/gi) || [];
  for (const block of blocks) {
    const success = /<success>true<\/success>/i.test(block);
    const id = block.match(/<id>([^<]*)<\/id>/i)?.[1];
    const errors = [...block.matchAll(/<message>([^<]*)<\/message>/gi)].map((m) => m[1]);
    results.push({ success, id, errors: errors.length ? errors : undefined });
  }
  while (results.length < expectedCount) {
    results.push({ success: false, errors: ['No SOAP result returned'] });
  }
  return results;
}
