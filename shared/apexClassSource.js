/** Consulta una clase Apex por Id o nombre, intentando REST antes de Tooling. */
import { restQuery, toolingQuery } from './salesforceApi.js';

function escapeSoql(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * @param {{ instanceUrl: string, apiVersion: string | number }} org
 * @param {string} sid
 * @param {{ classId?: string, className?: string }} lookup
 * @returns {Promise<{ id: string, name: string, body: string } | null>}
 */
export async function fetchApexClassSource(org, sid, lookup) {
  const classId = lookup.classId ? String(lookup.classId) : '';
  const className = lookup.className ? String(lookup.className) : '';
  if (!classId && !className) return null;
  const soql = classId
    ? `SELECT Id, Name, Body FROM ApexClass WHERE Id = '${escapeSoql(classId)}' LIMIT 1`
    : `SELECT Id, Name, Body FROM ApexClass WHERE Name = '${escapeSoql(className)}' LIMIT 1`;
  let rows = [];
  try { rows = (await restQuery(org.instanceUrl, sid, org.apiVersion, soql)) || []; } catch { /* Tooling fallback */ }
  if (!rows.length) {
    try { rows = (await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql)) || []; } catch { /* not found */ }
  }
  const row = rows[0];
  const body = row?.Body != null ? String(row.Body) : '';
  if (!body) return null;
  return { id: String(row.Id || classId), name: String(row.Name || className), body };
}
