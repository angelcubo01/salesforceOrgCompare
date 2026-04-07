// Utilities for retrieving Salesforce Metadata (SOAP Metadata API)

// Simple rate limiter to avoid flooding the Metadata API
class MetadataRateLimiter {
  constructor(maxRequests = 5, timeWindow = 1000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = [];
  }

  async waitForSlot() {
    const now = Date.now();
    this.requests = this.requests.filter((t) => now - t < this.timeWindow);
    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return;
    }
    const oldest = Math.min(...this.requests);
    const waitTime = this.timeWindow - (now - oldest) + 10;
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    return this.waitForSlot();
  }
}

const metadataRateLimiter = new MetadataRateLimiter(5, 1000);
const DEBUG_LOGS = false;

// Low-level SOAP call helper for Metadata API
async function metadataSoapCall(instanceUrl, sid, apiVersion, bodyInnerXml) {
  await metadataRateLimiter.waitForSlot();
  const url = `${instanceUrl}/services/Soap/m/${apiVersion}`;

  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<env:Header>` +
    `<SessionHeader xmlns="http://soap.sforce.com/2006/04/metadata">` +
    `<sessionId>${sid}</sessionId>` +
    `</SessionHeader>` +
    `</env:Header>` +
    `<env:Body>${bodyInnerXml}</env:Body>` +
    `</env:Envelope>`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      SOAPAction: '""',
    },
    body: envelope,
  });

  if (!res.ok) {
    console.error('[MetadataSOAP] HTTP error', {
      url,
      status: res.status,
      statusText: res.statusText,
    });
    const err = new Error(`Metadata SOAP call failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const text = await res.text();
  return text;
}

// Minimal XML helper (no DOMParser in service worker)
function extractTagValue(xml, tagName) {
  try {
    const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const m = re.exec(xml || '');
    return m && m[1] ? m[1].trim() : '';
  } catch {
    return '';
  }
}

// Extract <fileProperties> para un tipo concreto (PermissionSet, Profile, FlexiPage, etc.)
function extractFileProps(xml, typeName, memberFullName) {
  try {
    const safeName = memberFullName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const safeType = typeName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(
      `<fileProperties>[\\s\\S]*?<fullName>${safeName}<\\/fullName>[\\s\\S]*?<type>${safeType}<\\/type>[\\s\\S]*?<\\/fileProperties>`,
      'i'
    );
    const m = re.exec(xml || '');
    if (!m || !m[0]) return null;
    const block = m[0];
    return {
      createdByName: extractTagValue(block, 'createdByName'),
      createdDate: extractTagValue(block, 'createdDate'),
      lastModifiedById: extractTagValue(block, 'lastModifiedById'),
      lastModifiedByName: extractTagValue(block, 'lastModifiedByName'),
      lastModifiedDate: extractTagValue(block, 'lastModifiedDate'),
      type: extractTagValue(block, 'type'),
      fullName: extractTagValue(block, 'fullName')
    };
  } catch {
    return null;
  }
}

// Implementación genérica de retrieve para un único tipo de Metadata API.
// Devuelve { zipBase64, meta } donde meta viene de <fileProperties>.
async function retrieveSingleTypeZip(instanceUrl, sid, apiVersion, typeName, memberFullName) {
  const apiVerNum = Number(apiVersion) || 60.0;
  const apiVer = apiVerNum.toFixed(1); // "60.0"

  // 1) Launch retrieve
  const retrieveBody =
    `<retrieve xmlns="http://soap.sforce.com/2006/04/metadata">` +
    `<retrieveRequest>` +
    `<apiVersion>${apiVer}</apiVersion>` +
    `<singlePackage>true</singlePackage>` +
    `<unpackaged>` +
    `<types>` +
    `<members>${memberFullName}</members>` +
    `<name>${typeName}</name>` +
    `</types>` +
    `<version>${apiVer}</version>` +
    `</unpackaged>` +
    `</retrieveRequest>` +
    `</retrieve>`;

  if (DEBUG_LOGS) console.log('[MetadataRetrieve] Launching retrieve', {
    instanceUrl,
    apiVer,
    typeName,
    memberFullName,
  });

  const retrieveResponseXml = await metadataSoapCall(instanceUrl, sid, apiVer, retrieveBody);

  const asyncId = extractTagValue(retrieveResponseXml, 'id');
  if (!asyncId) {
    console.error('[MetadataRetrieve] No async id in retrieve response', retrieveResponseXml);
    throw new Error('Metadata retrieve did not return an async id');
  }

  if (DEBUG_LOGS) console.log('[MetadataRetrieve] Retrieve launched', { asyncId });

  // 2) Poll checkRetrieveStatus until done and succeeded, with zipFile included
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusBody =
      `<checkRetrieveStatus xmlns="http://soap.sforce.com/2006/04/metadata">` +
      `<asyncProcessId>${asyncId}</asyncProcessId>` +
      `<includeZip>true</includeZip>` +
      `</checkRetrieveStatus>`;

    const statusResponseXml = await metadataSoapCall(instanceUrl, sid, apiVer, statusBody);

    const doneStr = extractTagValue(statusResponseXml, 'done');
    const state = extractTagValue(statusResponseXml, 'state');
    const msg = extractTagValue(statusResponseXml, 'message');
    const zipBase64 = extractTagValue(statusResponseXml, 'zipFile');
    const done = doneStr === 'true';

    if (DEBUG_LOGS) console.log('[MetadataRetrieve] checkRetrieveStatus', {
      attempt,
      done,
      state,
      hasZip: !!zipBase64,
      message: msg,
    });

    // If finished and we have the ZIP, also extract fileProperties del tipo solicitado
    if (done && zipBase64) {
      const meta = extractFileProps(statusResponseXml, typeName, memberFullName) || {};
      return { zipBase64, meta };
    }

    // If finished but no ZIP, treat as error and surface message/state if present
    if (done && !zipBase64) {
      console.error('[MetadataRetrieve] Finished without ZIP', {
        asyncId,
        state,
        message: msg,
      });
      throw new Error(
        `Metadata retrieve finished without ZIP. state=${state || 'unknown'} message=${msg || 'n/a'}`
      );
    }

    // Still in progress – wait and retry
    await new Promise((resolve) => setTimeout(resolve, 3500));
  }

  console.error('[MetadataRetrieve] Timed out waiting for retrieve', {
    asyncId,
    attempts: maxAttempts,
  });
  throw new Error(
    `Metadata retrieve agotó el tiempo de espera tras ${maxAttempts} intentos.`
  );
}

// Wrappers específicos por tipo (API pública)
export async function retrievePermissionSetZip(instanceUrl, sid, apiVersion, permSetName) {
  return retrieveSingleTypeZip(instanceUrl, sid, apiVersion, 'PermissionSet', permSetName);
}

export async function retrieveProfileZip(instanceUrl, sid, apiVersion, profileName) {
  return retrieveSingleTypeZip(instanceUrl, sid, apiVersion, 'Profile', profileName);
}

export async function retrieveFlexiPageZip(instanceUrl, sid, apiVersion, flexiPageName) {
  return retrieveSingleTypeZip(instanceUrl, sid, apiVersion, 'FlexiPage', flexiPageName);
}

/**
 * Extrae bloques <types> y versión de un package.xml (manifest unpackaged) para Metadata API retrieve.
 */
function parsePackageXmlForRetrieve(packageXmlString) {
  const xml = String(packageXmlString || '').trim();
  if (!xml) throw new Error('package.xml vacío');
  const typesMatches = [...xml.matchAll(/<types>\s*([\s\S]*?)\s*<\/types>/gi)];
  if (!typesMatches.length) {
    throw new Error('package.xml sin bloques <types>');
  }
  let typesXml = '';
  for (const m of typesMatches) {
    typesXml += `<types>${m[1].trim()}</types>`;
  }
  const verMatch = /<version>\s*([\d.]+)\s*<\/version>/i.exec(xml);
  const version = verMatch ? verMatch[1].trim() : '60.0';
  return { typesXml, version };
}

/**
 * Retrieve unpackaged según el contenido de un package.xml (todos los <types> del manifiesto).
 */
export async function retrievePackageXmlZip(instanceUrl, sid, apiVersion, packageXmlString) {
  const { typesXml, version } = parsePackageXmlForRetrieve(packageXmlString);
  const apiVerNum = Number(version) || Number(apiVersion) || 60.0;
  const apiVer = apiVerNum.toFixed(1);

  const retrieveBody =
    `<retrieve xmlns="http://soap.sforce.com/2006/04/metadata">` +
    `<retrieveRequest>` +
    `<apiVersion>${apiVer}</apiVersion>` +
    `<singlePackage>false</singlePackage>` +
    `<unpackaged>` +
    typesXml +
    `<version>${apiVer}</version>` +
    `</unpackaged>` +
    `</retrieveRequest>` +
    `</retrieve>`;

  if (DEBUG_LOGS) {
    console.log('[MetadataRetrieve] Launching retrieve from package.xml', { apiVer });
  }

  const retrieveResponseXml = await metadataSoapCall(instanceUrl, sid, apiVer, retrieveBody);

  const asyncId = extractTagValue(retrieveResponseXml, 'id');
  if (!asyncId) {
    console.error('[MetadataRetrieve] No async id in retrieve response (package.xml)', retrieveResponseXml);
    throw new Error('Metadata retrieve did not return an async id');
  }

  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusBody =
      `<checkRetrieveStatus xmlns="http://soap.sforce.com/2006/04/metadata">` +
      `<asyncProcessId>${asyncId}</asyncProcessId>` +
      `<includeZip>true</includeZip>` +
      `</checkRetrieveStatus>`;

    const statusResponseXml = await metadataSoapCall(instanceUrl, sid, apiVer, statusBody);

    const doneStr = extractTagValue(statusResponseXml, 'done');
    const stateVal = extractTagValue(statusResponseXml, 'state');
    const msg = extractTagValue(statusResponseXml, 'message');
    const zipBase64 = extractTagValue(statusResponseXml, 'zipFile');
    const done = doneStr === 'true';

    if (done && zipBase64) {
      return { zipBase64, meta: {} };
    }

    if (done && !zipBase64) {
      console.error('[MetadataRetrieve] Finished without ZIP (package.xml)', {
        asyncId,
        state: stateVal,
        message: msg,
      });
      throw new Error(
        `Metadata retrieve finished without ZIP. state=${stateVal || 'unknown'} message=${msg || 'n/a'}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 3500));
  }

  throw new Error(
    `Metadata retrieve agotó el tiempo de espera tras ${maxAttempts} intentos (package.xml).`
  );
}

/**
 * Escapa texto para insertarlo de forma segura dentro de un elemento XML.
 */
function escapeXmlText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Lista de objetos metadata devueltos por describeMetadata (xmlName, label, …).
 */
function parseDescribeMetadataObjects(xml) {
  const objects = [];
  const re = /<metadataObjects[^>]*>([\s\S]*?)<\/metadataObjects>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const xmlName = extractTagValue(block, 'xmlName');
    if (!xmlName) continue;
    const label = extractTagValue(block, 'label') || xmlName;
    const directoryName = extractTagValue(block, 'directoryName') || '';
    const inFolderRaw = (extractTagValue(block, 'inFolder') || '').toLowerCase() === 'true';
    objects.push({ xmlName, label, directoryName, inFolder: inFolderRaw });
  }
  return objects.sort((a, b) => a.xmlName.localeCompare(b.xmlName));
}

/**
 * Metadata API describeMetadata: tipos de metadata disponibles para la versión de API indicada.
 * Usa la misma sesión que el resto de llamadas SOAP (sessionId en SessionHeader).
 *
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string|number} apiVersion ej. 65 o "65.0"
 * @returns {Promise<Array<{ xmlName: string, label: string, directoryName: string }>>}
 */
export async function describeMetadata(instanceUrl, sid, apiVersion) {
  const apiVerNum = Number(apiVersion) || 60.0;
  const apiVer = apiVerNum.toFixed(1);

  const body =
    `<describeMetadata xmlns="http://soap.sforce.com/2006/04/metadata">` +
    `<apiVersion>${escapeXmlText(apiVer)}</apiVersion>` +
    `</describeMetadata>`;

  const responseXml = await metadataSoapCall(instanceUrl, sid, apiVer, body);

  if (/<faultcode/i.test(responseXml) || /<soapenv:Fault/i.test(responseXml) || /<Fault[\s>]/i.test(responseXml)) {
    const msg = extractTagValue(responseXml, 'faultstring') || 'describeMetadata SOAP fault';
    const err = new Error(msg);
    err.responseXml = responseXml;
    throw err;
  }

  return parseDescribeMetadataObjects(responseXml);
}

/**
 * Lista de registros devueltos por listMetadata.
 * La respuesta SOAP repite un bloque &lt;result&gt; por cada elemento (con fullName, type, fileName, …),
 * no un único bloque &lt;records&gt; (eso es más típico de retrieve).
 */
function parseListMetadataRecords(xml) {
  const records = [];
  const seen = new Set();

  function addFromBlock(block) {
    const fullName = extractTagValue(block, 'fullName');
    if (!fullName || seen.has(fullName)) return;
    seen.add(fullName);
    const id = extractTagValue(block, 'id');
    records.push({ fullName, ...(id ? { id } : {}) });
  }

  // Forma habitual: <listMetadataResponse><result>...</result><result>...</result>
  const resultRe = /<result[^>]*>([\s\S]*?)<\/result>/gi;
  let m;
  while ((m = resultRe.exec(xml))) {
    addFromBlock(m[1]);
  }

  // Por si alguna respuesta usara <records> (retrieve-like)
  if (records.length === 0) {
    const recordsRe = /<records[^>]*>([\s\S]*?)<\/records>/gi;
    while ((m = recordsRe.exec(xml))) {
      addFromBlock(m[1]);
    }
  }

  return records.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/**
 * Metadata API listMetadata: miembros de un tipo de metadata.
 * @param {string} [folder] — opcional; p. ej. carpetas para informes, o "triggers" según tipo.
 */
export async function listMetadata(instanceUrl, sid, apiVersion, typeName, folder) {
  const apiVerNum = Number(apiVersion) || 60.0;
  const apiVer = apiVerNum.toFixed(1);
  const typeSafe = escapeXmlText(typeName);
  let folderXml = '';
  if (folder != null && String(folder).trim() !== '') {
    folderXml = `<folder>${escapeXmlText(String(folder).trim())}</folder>`;
  }

  const body =
    `<listMetadata xmlns="http://soap.sforce.com/2006/04/metadata">` +
    `<queries>` +
    `<type>${typeSafe}</type>` +
    folderXml +
    `</queries>` +
    `<asOfVersion>${escapeXmlText(apiVer)}</asOfVersion>` +
    `</listMetadata>`;

  const responseXml = await metadataSoapCall(instanceUrl, sid, apiVer, body);

  if (/<faultcode/i.test(responseXml) || /<soapenv:Fault/i.test(responseXml) || /<Fault[\s>]/i.test(responseXml)) {
    const msg = extractTagValue(responseXml, 'faultstring') || 'listMetadata SOAP fault';
    const err = new Error(msg);
    err.responseXml = responseXml;
    throw err;
  }

  return parseListMetadataRecords(responseXml);
}

/**
 * listMetadata con reintento: si falla o no hay registros y hay carpeta candidata (describeMetadata), reintenta con &lt;folder&gt;.
 */
export async function listMetadataWithFolderFallback(
  instanceUrl,
  sid,
  apiVersion,
  typeName,
  folderCandidate
) {
  let rows = [];
  try {
    rows = await listMetadata(instanceUrl, sid, apiVersion, typeName, undefined);
  } catch (e) {
    if (!folderCandidate || !String(folderCandidate).trim()) throw e;
  }
  if (rows.length) return rows;
  if (folderCandidate && String(folderCandidate).trim()) {
    return listMetadata(instanceUrl, sid, apiVersion, typeName, folderCandidate);
  }
  return rows;
}

