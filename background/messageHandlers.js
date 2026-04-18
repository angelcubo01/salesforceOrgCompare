import { getSidForCookieDomain } from '../shared/orgDiscovery.js';
import {
  searchIndex as apiSearchIndex,
  fetchSource as apiFetchSource,
  fetchSourceListOnly as apiFetchSourceListOnly,
  fetchSourceVersionSignature as apiFetchSourceVersionSignature,
  sourceSignatureFromFiles,
  restQuery,
  restQueryAll,
  restPatchSobject,
  toolingPatchSobject,
  getOrganizationInfo,
  toolingQuery,
  toolingQueryAll,
  parseApexTestMethodNames,
  runTestsAsynchronous,
  fetchApexTestQueueServletStatus,
  fetchApexLogBody,
  queryApexLogsInWindow,
  enableUserDebugTraceForSessionUser,
  deleteTraceFlagById
} from '../shared/salesforceApi.js';
import { extractApexTestRunJobId } from '../shared/extractApexTestRunJobId.js';
import { scheduleTerminalJobsTraceCleanup, scheduleNoJobTraceCleanup } from './apexTestTraceAlarms.js';
import {
  retrievePermissionSetZip,
  retrieveProfileZip,
  retrieveFlexiPageZip,
  retrievePackageXmlZip,
  describeMetadata,
  listMetadataWithFolderFallback
} from '../shared/metadataRetrieve.js';
import { indexCache, sourceCache, versionCache, authStatusCache } from './caches.js';
import { DEBUG_LOGS } from './config.js';
import { appendUsageLog, escapeSoqlLiteral } from './usageLog.js';
import {
  loadExtensionSettings,
  getApexTestsClassNameLikePatterns,
  getApexTestsTraceDebugLevel,
  getApexTestsCoverageMinPercent,
} from '../shared/extensionSettings.js';
import { stageApexViewerPayload, takeApexViewerPayload } from './apexViewerStaging.js';
import { isTestSetupApexTestResult } from '../shared/apexTestMakeDataMethod.js';

function buildApexClassNameLikeWhere(patterns) {
  const list = patterns && patterns.length ? patterns : ['%test%'];
  const parts = list.map((p) => `Name LIKE '${escapeSoqlLiteral(p)}'`);
  return `( ${parts.join(' OR ')} )`;
}

/**
 * Resta del total Pass los resultados de métodos `@TestSetup` (`IsTestSetup = true`).
 * Si la org no expone `IsTestSetup`, la consulta falla y se devuelve `outcomeCounts` sin cambiar.
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} jobIdForResults
 * @param {Record<string, number>} outcomeCounts
 */
async function adjustOutcomeCountsExcludingTestSetup(
  instanceUrl,
  sid,
  apiVersion,
  jobIdForResults,
  outcomeCounts
) {
  if (!outcomeCounts || outcomeCounts.Pass == null || Number(outcomeCounts.Pass) < 1) {
    return outcomeCounts;
  }
  let setupPassCount = 0;
  try {
    const soql = `SELECT COUNT(Id) FROM ApexTestResult WHERE AsyncApexJobId = '${escapeSoqlLiteral(
      jobIdForResults
    )}' AND Outcome = 'Pass' AND IsTestSetup = true`;
    const rows = await toolingQuery(instanceUrl, sid, apiVersion, soql);
    const row = rows && rows[0];
    if (row) {
      for (const [key, val] of Object.entries(row)) {
        if (key === 'attributes') continue;
        if (typeof val === 'number') {
          setupPassCount = val;
          break;
        }
      }
    }
  } catch {
    return outcomeCounts;
  }
  if (!setupPassCount) return outcomeCounts;
  const next = { ...outcomeCounts };
  next.Pass = Math.max(0, Number(next.Pass || 0) - setupPassCount);
  return next;
}

/**
 * Varias filas del servlet pueden compartir el mismo `parentid` (una por clase de test).
 * Elige la que mejor representa el estado global: si hay alguna en Processing, prevalece sobre Queued.
 */
function pickPrimaryApexTestServletRow(rows) {
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
    }
  }
  return best;
}

/** Campos extra del panel (p. ej. `className` junto a `classId`) no forman parte del contrato de `runTestsAsynchronous`. */
function sanitizeRunTestsBodyForApi(body) {
  if (!body || typeof body !== 'object') return body;
  const tests = body.tests;
  if (!Array.isArray(tests)) return body;
  return {
    ...body,
    tests: tests.map((te) => {
      if (!te || typeof te !== 'object') return te;
      const { className: _omit, ...rest } = te;
      return rest;
    })
  };
}

function mergeApexCoverageJsonField(raw, coveredSet, uncoveredSet) {
  let c = raw;
  if (c == null) return;
  if (typeof c === 'string') {
    try {
      c = JSON.parse(c);
    } catch {
      return;
    }
  }
  if (typeof c !== 'object' || c === null) return;
  const cov = c.coveredLines ?? c.CoveredLines;
  const unc = c.uncoveredLines ?? c.UncoveredLines;
  if (Array.isArray(cov)) {
    for (const n of cov) {
      const x = Number(n);
      if (Number.isFinite(x) && x >= 1) coveredSet.add(x);
    }
  }
  if (Array.isArray(unc)) {
    for (const n of unc) {
      const x = Number(n);
      if (Number.isFinite(x) && x >= 1) uncoveredSet.add(x);
    }
  }
}
import { getUpdateStatus } from './versionUpdate.js';
import {
  buildOrgFromActiveTab,
  checkOrgAuthStatus,
  inferEnvLabelFromHostname,
  ensureVersion,
  gatherSidCandidatesForHostname,
  getSidForOrgId,
  getOrderedSavedOrgs,
  loadSavedOrgOrder,
  loadSavedOrgs,
  makeIndexKey,
  makeSourceKey,
  saveSavedOrgOrder,
  saveSavedOrgs,
  syncOrgOrderAfterAdd,
  syncOrgOrderAfterRemove
} from './orgHelpers.js';

const ORG_CONFIG_EXPORT_KEYS = [
  'id',
  'displayName',
  'label',
  'instanceUrl',
  'cookieDomain',
  'apiVersion',
  'isSandbox'
];

function sanitizeOrgForConfigExport(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  const o = { id };
  for (const k of ORG_CONFIG_EXPORT_KEYS) {
    if (k === 'id') continue;
    const v = raw[k];
    if (v === undefined || v === null) continue;
    if (k === 'isSandbox') o[k] = !!v;
    else o[k] = typeof v === 'string' ? v.slice(0, 2048) : String(v);
  }
  if (!o.instanceUrl || !o.cookieDomain) return null;
  return o;
}

function sanitizeOrgForConfigImport(raw, idKey) {
  return sanitizeOrgForConfigExport({ ...raw, id: raw?.id || idKey });
}

export function installMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        switch (message?.type) {
          case 'version:getUpdateInfo': {
            const status = await getUpdateStatus();
            sendResponse(status);
            break;
          }
          case 'index:listApex': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });
            try {
              const classes = (await apiSearchIndex(org.instanceUrl, sid, org.apiVersion, 'ApexClass', '')) || [];
              const triggers = (await apiSearchIndex(org.instanceUrl, sid, org.apiVersion, 'ApexTrigger', '')) || [];
              sendResponse({ ok: true, apex: { classes, triggers } });
            } catch (e) {
              sendResponse({ ok: false, error: String(e) });
            }
            break;
          }
          case 'index:listLwc': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });
            try {
              const bundles = (await apiSearchIndex(org.instanceUrl, sid, org.apiVersion, 'LWC', '')) || [];
              sendResponse({ ok: true, bundles });
            } catch (e) {
              sendResponse({ ok: false, error: String(e) });
            }
            break;
          }
          case 'env:add': {
            const host = String(message.host || '')
              .replace(/^https?:\/\//, '')
              .replace(/\/$/, '');
            if (!host) return sendResponse({ ok: false, error: 'Missing host' });
            const candidates = await gatherSidCandidatesForHostname(host);
            for (const c of candidates) {
              try {
                let instanceUrl;
                if (host.includes('lightning.force')) {
                  instanceUrl = `https://${host.replace('lightning.force.com', 'my.salesforce.com')}`;
                } else if (host.includes('salesforce-setup')) {
                  const sub = host.replace('.salesforce-setup.com', '');
                  if (sub.endsWith('.my')) {
                    instanceUrl = `https://${sub}.salesforce.com`;
                  } else {
                    instanceUrl = `https://${sub}.my.salesforce.com`;
                  }
                } else {
                  instanceUrl = `https://${host}`;
                }
                const apiVersion = await ensureVersion(instanceUrl, c.value);
                const org = await getOrganizationInfo(instanceUrl, c.value, apiVersion);
                const environment = {
                  id: org.id,
                  displayName: org.name,
                  label: inferEnvLabelFromHostname(host),
                  instanceUrl,
                  cookieDomain: host,
                  apiVersion,
                  isSandbox: org.isSandbox
                };
                const saved = await loadSavedOrgs();
                saved[environment.id] = environment;
                await saveSavedOrgs(saved);
                await syncOrgOrderAfterAdd(environment.id);
                return sendResponse({ ok: true, environment });
              } catch {}
            }
            return sendResponse({ ok: false, error: 'Not logged in or SID not found for host' });
          }
          case 'discoverActiveOrg': {
            const res = await buildOrgFromActiveTab();
            sendResponse(res);
            break;
          }
          case 'addOrg': {
            const saved = await loadSavedOrgs();
            const org = message.org;
            if (!org || !org.id) throw new Error('Invalid org');
            saved[org.id] = org;
            await saveSavedOrgs(saved);
            await syncOrgOrderAfterAdd(org.id);
            sendResponse({ ok: true });
            break;
          }
          case 'reorderSavedOrgs': {
            const saved = await loadSavedOrgs();
            const incoming = (message.orgIds || []).filter((id) => typeof id === 'string' && saved[id]);
            const seen = new Set(incoming);
            for (const id of Object.keys(saved)) {
              if (!seen.has(id)) incoming.push(id);
            }
            await saveSavedOrgOrder(incoming);
            sendResponse({ ok: true });
            break;
          }
          case 'listSavedOrgs': {
            const orgs = await getOrderedSavedOrgs();
            sendResponse({ ok: true, orgs });
            break;
          }
          case 'auth:getStatuses': {
            const saved = await loadSavedOrgs();
            const orgs = Object.values(saved);
            const force = !!message.force;
            const entries = await Promise.all(orgs.map(async (org) => [org.id, await checkOrgAuthStatus(org, force)]));
            const statuses = Object.fromEntries(entries);
            sendResponse({ ok: true, statuses });
            break;
          }
          case 'auth:reauth': {
            const saved = await loadSavedOrgs();
            const orgId = message.orgId;
            const org = saved[orgId];
            if (!org) return sendResponse({ ok: false, error: 'Org not found' });
            const url = `${String(org.instanceUrl).replace(/\/$/, '')}/?login=true`;
            try {
              await chrome.tabs.create({ url });
              authStatusCache.del(`auth:${org.id}`);
              sendResponse({ ok: true });
            } catch (e) {
              sendResponse({ ok: false, error: String(e) });
            }
            break;
          }
          case 'removeOrg': {
            const saved = await loadSavedOrgs();
            delete saved[message.orgId];
            await saveSavedOrgs(saved);
            await syncOrgOrderAfterRemove(message.orgId);
            sendResponse({ ok: true });
            break;
          }
          case 'orgs:exportConfig': {
            const saved = await loadSavedOrgs();
            const order = (await loadSavedOrgOrder()) || Object.keys(saved);
            const extras = await chrome.storage.sync.get(['orgAliases', 'orgGroups']);
            const orgs = {};
            for (const [id, row] of Object.entries(saved)) {
              const clean = sanitizeOrgForConfigExport(row);
              if (clean) orgs[id] = clean;
            }
            sendResponse({
              ok: true,
              payload: {
                formatVersion: 1,
                exportedAt: new Date().toISOString(),
                orgs,
                order: Array.isArray(order) ? order.filter((x) => orgs[x]) : Object.keys(orgs),
                orgAliases: extras.orgAliases && typeof extras.orgAliases === 'object' ? extras.orgAliases : {},
                orgGroups: extras.orgGroups && typeof extras.orgGroups === 'object' ? extras.orgGroups : {}
              }
            });
            break;
          }
          case 'orgs:importConfig': {
            const data = message.data;
            const replace = !!message.replace;
            if (!data || typeof data !== 'object' || !data.orgs || typeof data.orgs !== 'object') {
              sendResponse({ ok: false, error: 'INVALID_PAYLOAD' });
              break;
            }
            const next = replace ? {} : await loadSavedOrgs();
            for (const [idKey, row] of Object.entries(data.orgs)) {
              const clean = sanitizeOrgForConfigImport(row, idKey);
              if (clean) next[clean.id] = clean;
            }
            await saveSavedOrgs(next);
            let order = Array.isArray(data.order) ? data.order.filter((x) => typeof x === 'string' && next[x]) : [];
            if (replace) {
              if (!order.length) order = Object.keys(next);
            } else if (order.length) {
              const seen = new Set(order);
              for (const id of Object.keys(next)) {
                if (!seen.has(id)) order.push(id);
              }
            } else {
              order = Object.keys(next);
            }
            await saveSavedOrgOrder(order);
            const cur = await chrome.storage.sync.get(['orgAliases', 'orgGroups']);
            const mergeAliases = data.orgAliases && typeof data.orgAliases === 'object' ? data.orgAliases : {};
            const mergeGroups = data.orgGroups && typeof data.orgGroups === 'object' ? data.orgGroups : {};
            await chrome.storage.sync.set({
              orgAliases: replace ? mergeAliases : { ...(cur.orgAliases || {}), ...mergeAliases },
              orgGroups: replace ? mergeGroups : { ...(cur.orgGroups || {}), ...mergeGroups }
            });
            authStatusCache.clear();
            sendResponse({ ok: true, count: Object.keys(next).length });
            break;
          }
          case 'searchIndex': {
            const { orgId, artifactType, prefix } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });

            const key = makeIndexKey(orgId, artifactType, prefix);
            const cached = indexCache.get(key);
            if (cached) return sendResponse({ ok: true, items: cached, cached: true });

            try {
              const items = await apiSearchIndex(org.instanceUrl, sid, org.apiVersion, artifactType, prefix || '');
              indexCache.set(key, items);
              sendResponse({ ok: true, items });
            } catch (e) {
              if (e && (e.status === 401 || e.status === 403)) {
                indexCache.clear();
                sourceCache.clear();
              }
              sendResponse({ ok: false, error: 'Request failed. Please retry or re-authenticate.' });
            }
            break;
          }
          case 'fetchSource': {
            const { orgId, artifactType, descriptor, listOnly } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });

            if (listOnly) {
              try {
                const files = await apiFetchSourceListOnly(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  artifactType,
                  descriptor
                );
                sendResponse({ ok: true, files });
              } catch (e) {
                if (e && (e.status === 401 || e.status === 403)) {
                  indexCache.clear();
                  sourceCache.clear();
                }
                sendResponse({ ok: false, error: 'Request failed. Please retry or re-authenticate.' });
              }
              break;
            }

            const key = makeSourceKey(orgId, artifactType, descriptor);
            const rawCached = sourceCache.get(key);
            const normalizedCached =
              rawCached && Array.isArray(rawCached)
                ? { files: rawCached, versionSignature: sourceSignatureFromFiles(rawCached) }
                : rawCached && Array.isArray(rawCached.files)
                  ? {
                      files: rawCached.files,
                      versionSignature:
                        rawCached.versionSignature || sourceSignatureFromFiles(rawCached.files)
                    }
                  : null;

            if (normalizedCached) {
              try {
                const liveSig = await apiFetchSourceVersionSignature(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  artifactType,
                  descriptor
                );
                if (liveSig === normalizedCached.versionSignature) {
                  sendResponse({ ok: true, files: normalizedCached.files, cached: true });
                  break;
                }
              } catch {
                // si falla la comprobación de versión, seguimos con fetch completo
              }
            }

            try {
              const files = await apiFetchSource(org.instanceUrl, sid, org.apiVersion, artifactType, descriptor);
              sourceCache.set(key, {
                files,
                versionSignature: sourceSignatureFromFiles(files)
              });
              sendResponse({ ok: true, files });
            } catch (e) {
              if (e && (e.status === 401 || e.status === 403)) {
                indexCache.clear();
                sourceCache.clear();
              }
              sendResponse({ ok: false, error: 'Request failed. Please retry or re-authenticate.' });
            }
            break;
          }
          case 'usage:log': {
            const entry = message.entry || {};
            const { leftOrgId, rightOrgId } = entry;
            const saved = await loadSavedOrgs();

            const leftOrg = leftOrgId ? saved[leftOrgId] : null;
            const rightOrg = rightOrgId ? saved[rightOrgId] : null;

            try {
              if (DEBUG_LOGS)
                console.log('[usage:log] received', {
                  kind: entry.kind,
                  artifactType: entry.artifactType,
                  leftOrgId,
                  rightOrgId,
                  viaRetrieveZip: !!entry.viaRetrieveZip,
                  phase: entry.phase
                });
            } catch {}

            await appendUsageLog({
              ...entry,
              leftInstanceUrl: leftOrg ? leftOrg.instanceUrl : '',
              rightInstanceUrl: rightOrg ? rightOrg.instanceUrl : '',
              leftOrgName: leftOrg ? leftOrg.displayName : '',
              rightOrgName: rightOrg ? rightOrg.displayName : ''
            });
            sendResponse({ ok: true });
            break;
          }
          case 'apexViewer:stage': {
            try {
              const il = message.initialLine;
              const id = stageApexViewerPayload(message.title, message.content, {
                initialLine: il != null ? Number(il) : undefined,
                downloadFileName: message.downloadFileName
              });
              sendResponse({ ok: true, id });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'apexViewer:take': {
            const v = takeApexViewerPayload(message.id);
            if (!v) {
              sendResponse({ ok: false, error: 'NOT_FOUND' });
              break;
            }
            sendResponse({
              ok: true,
              title: v.title,
              content: v.content,
              ...(v.initialLine != null ? { initialLine: v.initialLine } : {}),
              ...(v.downloadFileName ? { downloadFileName: v.downloadFileName } : {})
            });
            break;
          }
          case 'metadata:retrievePermissionSet': {
            const { orgId, permSetName } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });

            try {
              let memberFullName = String(permSetName || '').trim();
              if (memberFullName && !memberFullName.includes('__')) {
                try {
                  const rows = await restQuery(
                    org.instanceUrl,
                    sid,
                    org.apiVersion,
                    `SELECT Name, NamespacePrefix FROM PermissionSet WHERE Name = '${escapeSoqlLiteral(memberFullName)}' LIMIT 1`
                  );
                  const row = rows && rows[0] ? rows[0] : null;
                  const ns = row && row.NamespacePrefix ? String(row.NamespacePrefix).trim() : '';
                  const name = row && row.Name ? String(row.Name).trim() : memberFullName;
                  if (ns) memberFullName = `${ns}__${name}`;
                } catch {}
              }

              const { zipBase64, meta } = await retrievePermissionSetZip(
                org.instanceUrl,
                sid,
                org.apiVersion,
                memberFullName
              );
              sendResponse({
                ok: true,
                zipBase64,
                fileName: `${memberFullName}_permissionset.zip`,
                lastModifiedByName: meta?.lastModifiedByName || '',
                lastModifiedByUsername: meta?.lastModifiedByUsername || '',
                lastModifiedDate: meta?.lastModifiedDate || ''
              });
            } catch (e) {
              sendResponse({ ok: false, error: String(e) });
            }
            break;
          }
          case 'metadata:retrieveProfile': {
            const { orgId, profileName } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });

            try {
              const { zipBase64, meta } = await retrieveProfileZip(
                org.instanceUrl,
                sid,
                org.apiVersion,
                profileName
              );
              sendResponse({
                ok: true,
                zipBase64,
                fileName: `${profileName}_profile.zip`,
                lastModifiedByName: meta?.lastModifiedByName || '',
                lastModifiedByUsername: meta?.lastModifiedByUsername || '',
                lastModifiedDate: meta?.lastModifiedDate || ''
              });
            } catch (e) {
              sendResponse({ ok: false, error: String(e) });
            }
            break;
          }
          case 'metadata:retrieveFlexiPage': {
            const { orgId, flexiPageName } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });

            try {
              const { zipBase64, meta } = await retrieveFlexiPageZip(
                org.instanceUrl,
                sid,
                org.apiVersion,
                flexiPageName
              );
              sendResponse({
                ok: true,
                zipBase64,
                fileName: `${flexiPageName}_flexipage.zip`,
                lastModifiedByName: meta?.lastModifiedByName || '',
                lastModifiedByUsername: meta?.lastModifiedByUsername || '',
                lastModifiedDate: meta?.lastModifiedDate || ''
              });
            } catch (e) {
              sendResponse({ ok: false, error: String(e) });
            }
            break;
          }
          case 'metadata:retrievePackageXml': {
            const { orgId, packageXml } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });

            const raw = String(packageXml || '').trim();
            if (!raw) {
              return sendResponse({ ok: false, error: 'package.xml vacío' });
            }

            try {
              const { zipBase64, meta } = await retrievePackageXmlZip(
                org.instanceUrl,
                sid,
                org.apiVersion,
                raw
              );
              sendResponse({
                ok: true,
                zipBase64,
                fileName: 'package_retrieve.zip',
                lastModifiedByName: meta?.lastModifiedByName || '',
                lastModifiedByUsername: meta?.lastModifiedByUsername || '',
                lastModifiedDate: meta?.lastModifiedDate || ''
              });
            } catch (e) {
              sendResponse({ ok: false, error: String(e) });
            }
            break;
          }
          case 'metadata:describeMetadata': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });
            const ver = org.apiVersion;
            try {
              const metadataObjects = await describeMetadata(org.instanceUrl, sid, ver);
              sendResponse({ ok: true, metadataObjects, apiVersionUsed: String(ver) });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'metadata:listMetadata': {
            const { orgId, metadataType, folder } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });
            const ver = org.apiVersion;
            try {
              const records = await listMetadataWithFolderFallback(
                org.instanceUrl,
                sid,
                ver,
                String(metadataType || ''),
                folder != null && folder !== '' ? String(folder) : undefined
              );
              sendResponse({ ok: true, records, apiVersionUsed: String(ver) });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'apexTests:listClasses': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });
            try {
              /** LIKE en servidor: evita paginar miles de ApexClass (muchas llamadas con restQueryAll). */
              await loadExtensionSettings();
              const nameWhere = buildApexClassNameLikeWhere(getApexTestsClassNameLikePatterns());
              let rows;
              try {
                rows = await restQueryAll(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  `SELECT Id, Name FROM ApexClass WHERE Status = 'Active' AND ${nameWhere} ORDER BY Name`
                );
              } catch {
                rows = await restQueryAll(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  `SELECT Id, Name FROM ApexClass WHERE ${nameWhere} ORDER BY Name`
                );
              }
              const isApexClassId = (id) => typeof id === 'string' && id.length >= 3 && id.slice(0, 3) === '01p';
              const classes = (rows || [])
                .filter((r) => isApexClassId(r.Id))
                .map((r) => ({
                  id: r.Id || null,
                  name: r.Name
                }));
              classes.sort((a, b) => String(a.name).localeCompare(String(b.name)));
              sendResponse({ ok: true, classes });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'apexTests:listTestMethods': {
            const { orgId, classIds } = message;
            const raw = Array.isArray(classIds)
              ? classIds.filter((x) => typeof x === 'string' && x.length > 0)
              : [];
            const CLASS_NAME_VAL_PREFIX = 'n:';
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });
            if (!raw.length) {
              sendResponse({ ok: true, byClass: [] });
              break;
            }
            try {
              const ids = [];
              const namesToResolve = [];
              for (const x of raw) {
                if (x.startsWith(CLASS_NAME_VAL_PREFIX)) {
                  const n = x.slice(CLASS_NAME_VAL_PREFIX.length);
                  if (n) namesToResolve.push(n);
                } else {
                  ids.push(x);
                }
              }
              const nameChunkSize = 80;
              for (let i = 0; i < namesToResolve.length; i += nameChunkSize) {
                const chunk = namesToResolve.slice(i, i + nameChunkSize);
                const inList = chunk.map((n) => `'${escapeSoqlLiteral(n)}'`).join(',');
                const soql = `SELECT Id, Name FROM ApexClass WHERE Name IN (${inList})`;
                try {
                  const qrows = await restQuery(org.instanceUrl, sid, org.apiVersion, soql);
                  const byName = new Map((qrows || []).map((row) => [row.Name, row.Id]));
                  for (const n of chunk) {
                    const id = byName.get(n);
                    if (id) ids.push(id);
                  }
                } catch {
                  /* sin Id no añadimos esa clase a byClass */
                }
              }
              const uniqueIds = [...new Set(ids)];
              if (!uniqueIds.length) {
                sendResponse({ ok: true, byClass: [] });
                break;
              }
              const byClass = [];
              const chunkSize = 50;
              const idKey = (x) => {
                const s = String(x || '');
                return s.length >= 18 ? s.slice(0, 15) : s;
              };
              for (let i = 0; i < uniqueIds.length; i += chunkSize) {
                const chunk = uniqueIds.slice(i, i + chunkSize);
                const inList = chunk.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
                const soql = `SELECT Id, Name, SymbolTable FROM ApexClass WHERE Id IN (${inList})`;
                const rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql);
                for (const r of rows || []) {
                  const methods = parseApexTestMethodNames(r.SymbolTable);
                  byClass.push({ id: r.Id, name: r.Name, methods });
                }
              }
              const gotKeys = new Set(byClass.map((b) => idKey(b.id)));
              for (const id of uniqueIds) {
                if (gotKeys.has(idKey(id))) continue;
                try {
                  const soql = `SELECT Id, Name, SymbolTable FROM ApexClass WHERE Id = '${escapeSoqlLiteral(id)}' LIMIT 1`;
                  const rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql);
                  const r = rows && rows[0];
                  if (r) {
                    const methods = parseApexTestMethodNames(r.SymbolTable);
                    byClass.push({ id: r.Id, name: r.Name, methods });
                    gotKeys.add(idKey(r.Id));
                  }
                } catch {
                  /* clase omitida por Tooling */
                }
              }
              sendResponse({ ok: true, byClass });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'apexTests:run': {
            const { orgId, runBody } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) return sendResponse({ ok: false, reason: 'NO_SID' });
            const body = sanitizeRunTestsBodyForApi(
              runBody && typeof runBody === 'object' ? runBody : {}
            );
            await loadExtensionSettings();
            const traceDebugLevel = getApexTestsTraceDebugLevel();
            let traceFlagId = null;
            try {
              traceFlagId = await enableUserDebugTraceForSessionUser(
                org.instanceUrl,
                sid,
                org.apiVersion,
                traceDebugLevel
              );
            } catch {
              /* Sin trazas: el run sigue */
            }
            try {
              const result = await runTestsAsynchronous(org.instanceUrl, sid, org.apiVersion, body);
              const jobId = extractApexTestRunJobId(result);
              if (traceFlagId && !jobId) {
                await scheduleNoJobTraceCleanup(orgId, traceFlagId);
              }
              sendResponse({
                ok: true,
                result,
                traceFlagId: traceFlagId || undefined
              });
            } catch (e) {
              if (traceFlagId) {
                try {
                  await deleteTraceFlagById(org.instanceUrl, sid, org.apiVersion, traceFlagId);
                } catch {
                  /* ignore */
                }
              }
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'apexTests:pollRuns': {
            const { orgId, jobIds } = message;
            const ids = Array.isArray(jobIds) ? jobIds.filter(Boolean).map(String).slice(0, 30) : [];
            if (!ids.length) {
              sendResponse({ ok: true, runs: [] });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              sendResponse({ ok: false, error: 'Org not saved' });
              break;
            }
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) {
              sendResponse({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const sfId15 = (id) => {
                const s = String(id || '');
                return s.length >= 15 ? s.slice(0, 15) : s;
              };
              const isTerminalJobStatus = (st) => {
                const s = String(st || '');
                return ['Completed', 'Failed', 'Aborted', 'Error'].includes(s);
              };

              /** Developer Console: mismo servlet que `ApexTestQueueServlet?action=STATUS`. */
              let servletJobs = [];
              try {
                const st = await fetchApexTestQueueServletStatus(org.instanceUrl, sid);
                if (st && st.success && Array.isArray(st.apexTestJobs)) servletJobs = st.apexTestJobs;
              } catch {
                servletJobs = [];
              }
              const servletByParent15 = new Map();
              for (const row of servletJobs) {
                const p = row?.parentid;
                if (!p) continue;
                const k = sfId15(p);
                if (!servletByParent15.has(k)) servletByParent15.set(k, []);
                servletByParent15.get(k).push(row);
              }

              const inList = ids.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
              const jobSoql = `SELECT Id, Status, JobItemsProcessed, TotalJobItems, NumberOfErrors, ExtendedStatus, JobType, CompletedDate, CreatedDate, CreatedById FROM AsyncApexJob WHERE Id IN (${inList})`;
              let jobRows = [];
              try {
                jobRows = (await toolingQuery(org.instanceUrl, sid, org.apiVersion, jobSoql)) || [];
              } catch {
                jobRows = [];
              }
              if (!jobRows.length) {
                try {
                  jobRows = (await restQuery(org.instanceUrl, sid, org.apiVersion, jobSoql)) || [];
                } catch {
                  jobRows = [];
                }
              }
              const byJobId = new Map();
              for (const r of jobRows || []) {
                if (!r?.Id) continue;
                const full = String(r.Id);
                byJobId.set(full, r);
                if (full.length >= 15) byJobId.set(full.slice(0, 15), r);
              }
              const lookupJob = (requested) => {
                const req = String(requested || '');
                if (byJobId.has(req)) return byJobId.get(req);
                if (req.length >= 15) return byJobId.get(req.slice(0, 15));
                return undefined;
              };

              const runs = [];
              for (const jobId of ids) {
                const queueRows = servletByParent15.get(sfId15(jobId)) || [];
                let job = null;

                if (queueRows.length) {
                  const primary = pickPrimaryApexTestServletRow(queueRows);
                  job = {
                    Id: primary.parentid,
                    Status: primary.status,
                    JobType: 'TestRequest',
                    ExtendedStatus: primary.extstatus || null,
                    CreatedDate: primary.date,
                    JobItemsProcessed: undefined,
                    TotalJobItems: undefined,
                    NumberOfErrors: undefined
                  };
                  const m = primary.extstatus && String(primary.extstatus).match(/\((\d+)\s*\/\s*(\d+)\)/);
                  if (m) {
                    job.JobItemsProcessed = Number(m[1]);
                    job.TotalJobItems = Number(m[2]);
                  }
                  const apiMerge = lookupJob(jobId);
                  if (apiMerge) {
                    if (apiMerge.CompletedDate != null) job.CompletedDate = apiMerge.CompletedDate;
                    if (apiMerge.CreatedDate != null) job.CreatedDate = apiMerge.CreatedDate;
                    if (apiMerge.CreatedById != null) job.CreatedById = apiMerge.CreatedById;
                    if (job.JobItemsProcessed == null && apiMerge.JobItemsProcessed != null) {
                      job.JobItemsProcessed = apiMerge.JobItemsProcessed;
                    }
                    if (job.TotalJobItems == null && apiMerge.TotalJobItems != null) {
                      job.TotalJobItems = apiMerge.TotalJobItems;
                    }
                    if (job.NumberOfErrors == null && apiMerge.NumberOfErrors != null) {
                      job.NumberOfErrors = apiMerge.NumberOfErrors;
                    }
                  }
                }
                if (!job) {
                  job = lookupJob(jobId);
                }

                if (!job) {
                  runs.push({ jobId, missing: true, queueRows: [] });
                  continue;
                }

                const jobIdForResults = String(job.Id);
                let outcomeCounts = null;
                const terminal = isTerminalJobStatus(job.Status);
                if (terminal) {
                  try {
                    const aggSoql = `SELECT Outcome, COUNT(Id) FROM ApexTestResult WHERE AsyncApexJobId = '${escapeSoqlLiteral(
                      jobIdForResults
                    )}' GROUP BY Outcome`;
                    const agg = await toolingQuery(org.instanceUrl, sid, org.apiVersion, aggSoql);
                    outcomeCounts = {};
                    for (const row of agg || []) {
                      const k = row.Outcome != null ? String(row.Outcome) : '?';
                      let n = 0;
                      for (const [key, val] of Object.entries(row)) {
                        if (key === 'attributes' || key === 'Outcome') continue;
                        if (typeof val === 'number') n = val;
                      }
                      outcomeCounts[k] = n;
                    }
                    outcomeCounts = await adjustOutcomeCountsExcludingTestSetup(
                      org.instanceUrl,
                      sid,
                      org.apiVersion,
                      jobIdForResults,
                      outcomeCounts
                    );
                  } catch {
                    try {
                      const light = `SELECT Outcome, IsTestSetup FROM ApexTestResult WHERE AsyncApexJobId = '${escapeSoqlLiteral(
                        jobIdForResults
                      )}'`;
                      const rows = await toolingQueryAll(org.instanceUrl, sid, org.apiVersion, light);
                      outcomeCounts = {};
                      for (const r of rows) {
                        const k = r.Outcome != null ? String(r.Outcome) : '?';
                        if (k === 'Pass' && isTestSetupApexTestResult(r)) continue;
                        outcomeCounts[k] = (outcomeCounts[k] || 0) + 1;
                      }
                    } catch {
                      try {
                        const legacy = `SELECT Outcome FROM ApexTestResult WHERE AsyncApexJobId = '${escapeSoqlLiteral(
                          jobIdForResults
                        )}'`;
                        const rows = await toolingQueryAll(org.instanceUrl, sid, org.apiVersion, legacy);
                        outcomeCounts = {};
                        for (const r of rows) {
                          const k = r.Outcome != null ? String(r.Outcome) : '?';
                          outcomeCounts[k] = (outcomeCounts[k] || 0) + 1;
                        }
                      } catch {
                        outcomeCounts = null;
                      }
                    }
                  }
                }
                runs.push({
                  jobId,
                  canonicalJobId: job.Id,
                  job,
                  outcomeCounts,
                  queueRows
                });
              }
              await scheduleTerminalJobsTraceCleanup(orgId, runs);
              sendResponse({ ok: true, runs });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'apexTests:getOtherQueueJobs': {
            const { orgId, trackedJobIds } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              sendResponse({ ok: false, error: 'Org not saved' });
              break;
            }
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) {
              sendResponse({ ok: false, reason: 'NO_SID' });
              break;
            }
            const sfId15 = (id) => {
              const s = String(id || '').replace(/[^a-zA-Z0-9]/g, '');
              return s.length >= 15 ? s.slice(0, 15) : s;
            };
            const trackedSet = new Set(
              (Array.isArray(trackedJobIds) ? trackedJobIds : []).map((id) => sfId15(id))
            );
            try {
              const st = await fetchApexTestQueueServletStatus(org.instanceUrl, sid);
              const raw =
                st && st.success && Array.isArray(st.apexTestJobs) ? st.apexTestJobs : [];
              const byParentLists = new Map();
              for (const row of raw) {
                const p = row?.parentid;
                if (!p) continue;
                const k15 = sfId15(p);
                if (trackedSet.has(k15)) continue;
                if (!byParentLists.has(k15)) byParentLists.set(k15, []);
                byParentLists.get(k15).push(row);
              }
              const jobs = [];
              for (const list of byParentLists.values()) {
                const primary = pickPrimaryApexTestServletRow(list);
                if (!primary) continue;
                jobs.push({
                  parentid: String(primary.parentid),
                  status: primary.status != null ? String(primary.status) : '',
                  extstatus: primary.extstatus != null ? String(primary.extstatus) : '',
                  date: primary.date != null ? String(primary.date) : '',
                  classname: primary.classname != null ? String(primary.classname) : ''
                });
              }
              sendResponse({ ok: true, jobs });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'apexTests:getRunFailures': {
            const { orgId, jobId } = message;
            if (!jobId) {
              sendResponse({ ok: false, error: 'Missing jobId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              sendResponse({ ok: false, error: 'Org not saved' });
              break;
            }
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) {
              sendResponse({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const esc = escapeSoqlLiteral(jobId);
              let rows;
              try {
                const soql = `SELECT MethodName, Message, StackTrace, Outcome, ApexClass.Name, IsTestSetup FROM ApexTestResult WHERE AsyncApexJobId = '${esc}' AND (Outcome = 'Fail' OR Outcome = 'CompileFail') ORDER BY ApexClass.Name, MethodName LIMIT 200`;
                rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql);
              } catch {
                try {
                  const soql2 = `SELECT MethodName, Message, StackTrace, Outcome, ApexClass.Name FROM ApexTestResult WHERE AsyncApexJobId = '${esc}' AND (Outcome = 'Fail' OR Outcome = 'CompileFail') ORDER BY ApexClass.Name, MethodName LIMIT 200`;
                  rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql2);
                } catch {
                  const soql3 = `SELECT MethodName, Message, StackTrace, Outcome, ApexClass.Name FROM ApexTestResult WHERE AsyncApexJobId = '${esc}' AND (Outcome = 'Fail' OR Outcome = 'CompileFail') LIMIT 200`;
                  rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql3);
                }
              }
              const raw = rows || [];
              const failures = raw.filter((r) => !isTestSetupApexTestResult(r));
              sendResponse({ ok: true, failures });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'apexTests:getRunCoverage': {
            const { orgId, jobId, minCoveragePercent: minCoveragePercentMsg } = message;
            if (!jobId) {
              sendResponse({ ok: false, error: 'Missing jobId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              sendResponse({ ok: false, error: 'Org not saved' });
              break;
            }
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) {
              sendResponse({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              await loadExtensionSettings();
              let minPct = getApexTestsCoverageMinPercent();
              if (minCoveragePercentMsg != null && minCoveragePercentMsg !== '') {
                const n = Number(minCoveragePercentMsg);
                if (Number.isFinite(n)) minPct = Math.min(100, Math.max(0, n));
              }
              const coverageMinFraction = Math.min(1, Math.max(0, minPct / 100));
              const esc = escapeSoqlLiteral(jobId);
              const trSoql = `SELECT ApexClassId FROM ApexTestResult WHERE AsyncApexJobId = '${esc}'`;
              let testClassRows = [];
              try {
                testClassRows = await toolingQueryAll(org.instanceUrl, sid, org.apiVersion, trSoql);
              } catch {
                testClassRows = [];
              }
              const testClassIds = [
                ...new Set((testClassRows || []).map((r) => r.ApexClassId).filter(Boolean).map(String))
              ];
              if (!testClassIds.length) {
                sendResponse({ ok: true, classes: [], note: 'NO_TEST_RESULTS' });
                break;
              }
              /** Misma lógica que Developer Console: unir Coverage JSON de todas las filas del run. */
              const allCov = [];
              const covChunkSize = 20;
              for (let i = 0; i < testClassIds.length; i += covChunkSize) {
                const chunk = testClassIds.slice(i, i + covChunkSize);
                const inList = chunk.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
                const covSoql = `SELECT ApexClassOrTriggerId, Coverage FROM ApexCodeCoverage WHERE ApexTestClassId IN (${inList})`;
                try {
                  const part = await toolingQueryAll(org.instanceUrl, sid, org.apiVersion, covSoql);
                  allCov.push(...(part || []));
                } catch {
                  /* chunk omitido */
                }
              }
              const byTarget = new Map();
              for (const row of allCov) {
                const tid = row.ApexClassOrTriggerId;
                if (!tid) continue;
                if (!byTarget.has(tid)) byTarget.set(tid, { covered: new Set(), uncovered: new Set() });
                const ag = byTarget.get(tid);
                mergeApexCoverageJsonField(row.Coverage, ag.covered, ag.uncovered);
              }
              const overThreshold = [];
              for (const [classOrTriggerId, ag] of byTarget) {
                for (const ln of ag.covered) ag.uncovered.delete(ln);
                const nCovered = ag.covered.size;
                const nUncovered = ag.uncovered.size;
                const total = nCovered + nUncovered;
                if (total <= 0) continue;
                const pct = nCovered / total;
                if (pct >= coverageMinFraction) {
                  overThreshold.push({ id: classOrTriggerId, percent: pct, covered: nCovered, total });
                }
              }
              overThreshold.sort((a, b) => b.percent - a.percent);
              const ids = overThreshold.map((x) => x.id);
              const nameById = new Map();
              const chunkSize = 40;
              for (let i = 0; i < ids.length; i += chunkSize) {
                const chunk = ids.slice(i, i + chunkSize);
                const inList = chunk.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
                try {
                  const cls = await toolingQuery(
                    org.instanceUrl,
                    sid,
                    org.apiVersion,
                    `SELECT Id, Name FROM ApexClass WHERE Id IN (${inList})`
                  );
                  for (const r of cls || []) {
                    if (!r?.Id) continue;
                    nameById.set(r.Id, r.Name);
                    if (String(r.Id).length >= 15) nameById.set(String(r.Id).slice(0, 15), r.Name);
                  }
                } catch {
                  /* ignore */
                }
                try {
                  const trg = await toolingQuery(
                    org.instanceUrl,
                    sid,
                    org.apiVersion,
                    `SELECT Id, Name FROM ApexTrigger WHERE Id IN (${inList})`
                  );
                  for (const r of trg || []) {
                    if (!r?.Id) continue;
                    nameById.set(r.Id, r.Name);
                    if (String(r.Id).length >= 15) nameById.set(String(r.Id).slice(0, 15), r.Name);
                  }
                } catch {
                  /* ignore */
                }
              }
              const resolveName = (id) => {
                const s = String(id || '');
                return nameById.get(s) || (s.length >= 15 ? nameById.get(s.slice(0, 15)) : null) || s;
              };
              const classes = overThreshold.map((row) => ({
                id: row.id,
                name: resolveName(row.id),
                percent: row.percent,
                covered: row.covered,
                total: row.total
              }));
              sendResponse({ ok: true, classes });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'apexTests:getTestRunLog': {
            let { orgId, jobId, createdDate, completedDate, createdById, logId: logIdParam, intent } =
              message;
            const wantLogBody = intent === 'body';
            if (!jobId) {
              sendResponse({ ok: false, error: 'Missing jobId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              sendResponse({ ok: false, error: 'Org not saved' });
              break;
            }
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) {
              sendResponse({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const parseMs = (d) => {
                if (d == null) return null;
                const t = new Date(d).getTime();
                return Number.isNaN(t) ? null : t;
              };

              const rawLogId = logIdParam != null ? String(logIdParam).replace(/[^a-zA-Z0-9]/g, '') : '';
              if (wantLogBody && rawLogId) {
                const body = await fetchApexLogBody(org.instanceUrl, sid, org.apiVersion, rawLogId);
                sendResponse({
                  ok: true,
                  logId: rawLogId,
                  body
                });
                break;
              }

              const escJob = escapeSoqlLiteral(jobId);
              const jq = `SELECT Id, CreatedDate, CompletedDate, CreatedById FROM AsyncApexJob WHERE Id = '${escJob}'`;
              try {
                let jr = await toolingQuery(org.instanceUrl, sid, org.apiVersion, jq);
                if (!jr || !jr.length) jr = await restQuery(org.instanceUrl, sid, org.apiVersion, jq);
                const row = jr && jr[0];
                if (row) {
                  if (createdDate == null) createdDate = row.CreatedDate;
                  if (completedDate == null) completedDate = row.CompletedDate;
                  if (createdById == null) createdById = row.CreatedById;
                }
              } catch {
                /* fechas del mensaje */
              }

              if (!createdById) {
                sendResponse({ ok: false, error: 'NO_LOG_USER' });
                break;
              }

              const jobCreatedMs = parseMs(createdDate);
              if (jobCreatedMs == null) {
                sendResponse({ ok: false, error: 'NO_JOB_START' });
                break;
              }

              const completedParsed = parseMs(completedDate);
              const jobCompletedMs =
                completedParsed ?? jobCreatedMs + 6 * 60 * 60 * 1000;

              /** Ventana amplia: los ApexLog pueden cerrarse después del CompletedDate del job. */
              const untilMs = Math.max(
                jobCompletedMs + 45 * 60 * 1000,
                jobCreatedMs + 6 * 60 * 60 * 1000
              );
              const sinceIso = new Date(jobCreatedMs - 60_000).toISOString();
              const untilIso = new Date(untilMs).toISOString();

              const logs = await queryApexLogsInWindow(
                org.instanceUrl,
                sid,
                org.apiVersion,
                sinceIso,
                untilIso,
                {
                  logUserId: String(createdById),
                  operationEquals: 'ApexTestHandler',
                  limit: 200
                }
              );

              if (!logs.length) {
                sendResponse({ ok: false, error: 'NO_APEX_LOGS_TRACES' });
                break;
              }

              const slimLogs = logs.map((l) => ({ Id: l.Id }));
              sendResponse({ ok: true, pick: true, logs: slimLogs });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'apexTests:getCoverageLineView': {
            const { orgId, jobId, classOrTriggerId, className } = message;
            if (!jobId || !classOrTriggerId) {
              sendResponse({ ok: false, error: 'Missing jobId or classOrTriggerId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              sendResponse({ ok: false, error: 'Org not saved' });
              break;
            }
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) {
              sendResponse({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const escJob = escapeSoqlLiteral(jobId);
              const tid = escapeSoqlLiteral(String(classOrTriggerId));
              let testClassRows = [];
              try {
                testClassRows = await toolingQueryAll(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  `SELECT ApexClassId FROM ApexTestResult WHERE AsyncApexJobId = '${escJob}'`
                );
              } catch {
                testClassRows = [];
              }
              const testClassIds = [
                ...new Set((testClassRows || []).map((r) => r.ApexClassId).filter(Boolean).map(String))
              ];
              if (!testClassIds.length) {
                sendResponse({ ok: false, error: 'NO_TEST_RESULTS' });
                break;
              }
              const covered = new Set();
              const uncovered = new Set();
              const chunkSize = 20;
              for (let i = 0; i < testClassIds.length; i += chunkSize) {
                const chunk = testClassIds.slice(i, i + chunkSize);
                const inList = chunk.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
                const covSoql = `SELECT ApexTestClassId, TestMethodName, Coverage FROM ApexCodeCoverage WHERE ApexClassOrTriggerId = '${tid}' AND ApexTestClassId IN (${inList})`;
                try {
                  const part = await toolingQueryAll(org.instanceUrl, sid, org.apiVersion, covSoql);
                  for (const row of part || []) {
                    mergeApexCoverageJsonField(row.Coverage, covered, uncovered);
                  }
                } catch {
                  /* chunk omitido */
                }
              }
              for (const ln of covered) uncovered.delete(ln);
              let body = '';
              try {
                const clsRows = await restQuery(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  `SELECT Body FROM ApexClass WHERE Id = '${tid}' LIMIT 1`
                );
                body = (clsRows && clsRows[0] && clsRows[0].Body) || '';
              } catch {
                body = '';
              }
              if (!body) {
                try {
                  const trRows = await restQuery(
                    org.instanceUrl,
                    sid,
                    org.apiVersion,
                    `SELECT Body FROM ApexTrigger WHERE Id = '${tid}' LIMIT 1`
                  );
                  body = (trRows && trRows[0] && trRows[0].Body) || '';
                } catch {
                  body = '';
                }
              }
              sendResponse({
                ok: true,
                body,
                name: className != null ? String(className) : '',
                coveredLines: [...covered].sort((a, b) => a - b),
                uncoveredLines: [...uncovered].sort((a, b) => a - b)
              });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'apexTests:getTestClassSource': {
            const { orgId, classId, className } = message;
            if (!classId && !className) {
              sendResponse({ ok: false, error: 'Missing classId or className' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              sendResponse({ ok: false, error: 'Org not saved' });
              break;
            }
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) {
              sendResponse({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              let soql;
              if (classId) {
                soql = `SELECT Name, Body FROM ApexClass WHERE Id = '${escapeSoqlLiteral(String(classId))}' LIMIT 1`;
              } else {
                soql = `SELECT Id, Name, Body FROM ApexClass WHERE Name = '${escapeSoqlLiteral(String(className))}' LIMIT 1`;
              }
              let rows = [];
              try {
                rows = (await restQuery(org.instanceUrl, sid, org.apiVersion, soql)) || [];
              } catch {
                rows = [];
              }
              if (!rows.length) {
                try {
                  rows = (await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql)) || [];
                } catch {
                  rows = [];
                }
              }
              const row = rows && rows[0];
              const bodyText = row && row.Body != null ? String(row.Body) : '';
              if (!bodyText) {
                sendResponse({ ok: false, error: 'NOT_FOUND' });
                break;
              }
              sendResponse({
                ok: true,
                name: row.Name != null ? String(row.Name) : '',
                body: bodyText
              });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'notifications:showApexTestComplete': {
            const { title, message: msg } = message;
            const nid = `sfoc_at_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            try {
              await new Promise((resolve, reject) => {
                chrome.notifications.create(
                  nid,
                  {
                    type: 'basic',
                    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
                    title: String(title || 'Salesforce Org Compare').slice(0, 128),
                    message: String(msg || '').slice(0, 256),
                    priority: 0
                  },
                  () => {
                    const err = chrome.runtime.lastError;
                    if (err) reject(new Error(err.message));
                    else resolve(undefined);
                  }
                );
              });
              sendResponse({ ok: true });
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          case 'apexTests:abortRun': {
            const { orgId, jobId } = message;
            if (!jobId) {
              sendResponse({ ok: false, error: 'Missing jobId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              sendResponse({ ok: false, error: 'Org not saved' });
              break;
            }
            let sid = await getSidForCookieDomain(org.cookieDomain);
            if (!sid) sid = await getSidForOrgId(org.id);
            if (!sid) {
              sendResponse({ ok: false, reason: 'NO_SID' });
              break;
            }
            /**
             * `AsyncApexJob` no admite PATCH por REST (CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY).
             * La forma soportada es actualizar `ApexTestQueueItem` (Tooling) a Status Aborted.
             */
            try {
              const jid = escapeSoqlLiteral(String(jobId).replace(/[^a-zA-Z0-9]/g, ''));
              const soql = `SELECT Id, Status FROM ApexTestQueueItem WHERE ParentJobId = '${jid}'`;
              const rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql);
              if (!rows || !rows.length) {
                sendResponse({
                  ok: false,
                  reason: 'NO_QUEUE_ITEMS',
                  error:
                    'No ApexTestQueueItem rows for this job (job may be too old or not cancelable via queue).'
                });
                break;
              }
              const isTerminalQueue = (st) => {
                const s = String(st || '')
                  .trim()
                  .toLowerCase();
                return ['completed', 'failed', 'aborted'].includes(s);
              };
              let patched = 0;
              let lastErr = '';
              for (const row of rows) {
                if (!row?.Id || isTerminalQueue(row.Status)) continue;
                try {
                  await toolingPatchSobject(
                    org.instanceUrl,
                    sid,
                    org.apiVersion,
                    'ApexTestQueueItem',
                    row.Id,
                    { Status: 'Aborted' }
                  );
                  patched++;
                } catch (e) {
                  lastErr = String(e?.message || e);
                }
              }
              if (patched > 0) {
                sendResponse({ ok: true });
              } else {
                sendResponse({
                  ok: false,
                  reason: 'NO_ABORTABLE_QUEUE_ITEMS',
                  error:
                    lastErr ||
                    'No queue items in a state that can be aborted (already finished or not updatable).'
                });
              }
            } catch (e) {
              sendResponse({ ok: false, error: String(e?.message || e) });
            }
            break;
          }
          default:
            sendResponse({
              ok: false,
              reason: 'UNKNOWN_MESSAGE',
              error:
                'Message type not handled (reload the extension on chrome://extensions so the service worker picks up the latest code).'
            });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  });
}

export function installCookieCacheInvalidation() {
  chrome.cookies.onChanged.addListener(async (changeInfo) => {
    const cookie = changeInfo.cookie;
    if (!cookie || !cookie.domain) return;
    if (
      cookie.domain.endsWith('.salesforce.com') ||
      cookie.domain.endsWith('.my.salesforce.com') ||
      cookie.domain.endsWith('.force.com') ||
      cookie.domain.endsWith('.salesforce-setup.com')
    ) {
      versionCache.clear();
      indexCache.clear();
      sourceCache.clear();
      authStatusCache.clear();
    }
  });
}
