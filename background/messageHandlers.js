import {
  searchIndex as apiSearchIndex,
  fetchSource as apiFetchSource,
  fetchSourceListOnly as apiFetchSourceListOnly,
  fetchSourceVersionSignature as apiFetchSourceVersionSignature,
  sourceSignatureFromFiles,
  restQuery,
  restQueryAll,
  restPatchSobject,
  restSoqlQueryPage,
  toolingSoqlQueryPage,
  restSoslSearchPage,
  restSoslSearchAll,
  toolingPatchSobject,
  getOrganizationInfo,
  toolingQuery,
  toolingQueryAll,
  parseApexTestMethodNames,
  executeAnonymous,
  runTestsAsynchronous,
  fetchApexTestQueueServletStatus,
  fetchApexLogBody,
  resolveApexLogExecutionContext,
  mergeApexLogExecutionContext,
  filterApexTestRunCandidateLogs,
  filterApexTestRunLogsByExecutionType,
  queryApexLogsInWindow,
  deleteAllApexLogs,
  enableUserDebugTraceForSessionUser,
  searchUsersByNameOrUsername,
  queryDebugLevels,
  createUserDebugTraceFlag,
  deleteTraceFlagById,
  queryUserDebugTraceFlags,
  extendUserDebugTraceFlag,
  updateUserDebugTraceFlag,
  fetchSessionUserId,
  fetchOrgLimits,
  queryApexCodeCoverageAggregate,
  restDescribeGlobal,
  restDescribeSobject,
  restRequestWithSid,
  listRestApiVersions
} from '../shared/salesforceApi.js';
import { isRestWriteMethod } from '../shared/restExplorerApi.js';
import { executeDml, retrieveRecord, retrieveLayout } from '../shared/dataWorkbenchApi.js';
import {
  fetchBulkJob,
  fetchBulkJobBatches,
  fetchBulkBatchResult
} from '../shared/bulkJobApi.js';
import { executeSoapImportBatch } from '../shared/dataImportSoap.js';
import { listEventChannels } from '../shared/eventMonitorApi.js';
import {
  clearEventMonitorEvents,
  getEventMonitorSession,
  subscribeEventMonitor,
  unsubscribeEventMonitor
} from './eventMonitorSession.js';
import {
  getSoapHeadersForOrg,
  normalizeSoapHeadersMap,
  SOAP_HEADERS_STORAGE_KEY
} from '../shared/soapHeadersPrefs.js';
import {
  loadOrgReadOnlyMap,
  ORG_READ_ONLY_STORAGE_KEY,
  assertOrgWriteAllowed,
  recordLocalAudit,
  syncOrgSandboxFlagIfNeeded
} from './orgWriteGuard.js';
import { extractApexTestRunJobId } from '../shared/extractApexTestRunJobId.js';
import {
  sanitizeRunTestsBodyForApi,
  validateRunTestsBodyForApi
} from '../shared/apexTestRunBodyApi.js';
import { scheduleTerminalJobsTraceCleanup, scheduleNoJobTraceCleanup } from './apexTestTraceAlarms.js';
import { fetchAllEnvironmentStatusRows, fetchSessionDetailForOrg, invalidateDescribeCacheForOrg } from './environmentStatus.js';
import { pollDeployStatus, fetchDeployDetail, cancelDeployRequest } from '../shared/deployStatusApi.js';
import { resolveDeployCoverageLineSets } from '../shared/apexCoverageLines.js';

/** Error devuelto al comparador cuando falla la API Salesforce (título del toast = errorCode). */
function queryExplorerCatchErrorPayload(e) {
  const error = sanitizeUiError(e?.message || e);
  /** @type {{ ok: false, error: string, errorCode?: string }} */
  const out = { ok: false, error };
  if (e && typeof e === 'object' && e.salesforceErrorCode) {
    const c = String(e.salesforceErrorCode).trim();
    if (c) out.errorCode = c;
  }
  return out;
}
import {
  retrievePermissionSetZip,
  retrieveProfileZip,
  retrieveFlexiPageZip,
  retrievePackageXmlZip,
  describeMetadata,
  listMetadataWithFolderFallback,
  buildQuickOpenMetadataIndex,
  createDeployZipBase64,
  createBundleDeployZipBase64,
  artifactTypeToMetadataType,
  deployZipBase64,
  deployAndWait,
  checkDeployStatus
} from '../shared/metadataRetrieve.js';
import { formatMetadataApiVersion } from '../shared/metadataApiVersion.js';
import {
  fetchPermissionContainerData,
  searchPermissionContainers,
  fetchAccessByResource,
  searchPermissionResources,
  searchCustomPermissions,
  fetchAssignmentsForCustomPermission
} from '../shared/permissionsDiffApi.js';
import {
  resolveHistoryContext,
  queryFieldHistoryRows,
  isValidSalesforceRecordId
} from '../shared/fieldHistoryApi.js';
import {
  listCustomSettingTypes,
  listCustomMetadataTypes,
  fetchSetupRecordsForType
} from '../shared/setupRecordsCompareApi.js';
import {
  compareRestMemberBatch,
  listMembersForMetadataType
} from '../shared/metadataTypeCompareApi.js';
import {
  beginMetadataTypeCompareSession,
  cancelMetadataTypeCompareSessions,
  isMetadataTypeCompareGenerationCurrent,
  metadataTypeCompareCancelOpts
} from './metadataTypeCompareSession.js';
import {
  resolveObjectFromRecordId,
  fetchRecordForCompare
} from '../shared/recordCompareApi.js';
import {
  analyzeDependencies,
  buildCustomObjectNameSoql,
  buildFieldObjectSoql,
  buildSearchSoql,
  collectCustomFieldIds,
  collectCustomObjectIdsFromFieldMap,
  enrichCategoriesWithReferencedBy,
  fetchReferencedByMap,
  filterListMetadataForSearch,
  getListMetadataType,
  groupNodesIntoCategories,
  mapFieldObjectRows,
  mapListMetadataRows,
  mapObjectNameRows,
  mapSearchRows,
  resolveSearchItemIds,
  getSeedTypeById,
  usesToolingSearch
} from '../shared/dependencyExplorer.js';
import {
  authStatusCache,
  depExplorerListCache,
  describeGlobalCache,
  describeSobjectCache,
  indexCache,
  sourceCache,
  versionCache
} from './caches.js';
import { DEBUG_LOGS } from './config.js';
import { appendTelemetryOptInLog, appendTelemetryOptOutLog, appendUsageLog, escapeSoqlLiteral } from './usageLog.js';
import { captureLogiUsage } from './logi/posthogLogiTelemetry.js';
import { sendPosthogException, sendPosthogOperationalFailure, maybeSendFirstOrgConnectedTelemetry } from './posthogTelemetry.js';
import { classifyError, toError } from '../shared/errorTelemetryPolicy.js';
import { resolveTelemetryUserLabel } from './telemetryUserResolver.js';
import { resolveOrgConnectedUser, resolveOrgConnectedUsers } from './orgConnectedUser.js';
import {
  resolveApexLogBodyFetchLimit,
  sanitizeOrgForConfigExport,
  sanitizeOrgForConfigImport
} from './helpers/messageHandlerHelpers.js';

const apexLogContextCache = new Map();

async function enrichApexLogRowsWithExecutionContext(instanceUrl, sid, apiVersion, rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [];
  const bodyFetchLimit = resolveApexLogBodyFetchLimit(list.length, opts);
  const concurrency = Math.max(1, Math.min(6, Number(opts.concurrency) || 4));
  const queue = list.map((row, index) => ({ row, index }));
  const out = new Array(list.length);

  const runOne = async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) continue;
      const row = item.row && typeof item.row === 'object' ? item.row : {};
      const logId = row.Id != null ? String(row.Id).replace(/[^a-zA-Z0-9]/g, '') : '';
      let meta = resolveApexLogExecutionContext('', row);
      const shouldFetchBody = item.index < bodyFetchLimit && !!logId;
      if (shouldFetchBody) {
        const cacheKey = `${String(instanceUrl)}|${logId}`;
        const cached = apexLogContextCache.get(cacheKey);
        if (cached) {
          meta = mergeApexLogExecutionContext(cached, meta);
        } else {
          try {
            const body = await fetchApexLogBody(instanceUrl, sid, apiVersion, logId, {
              maxBytes: 196_608
            });
            const parsed = resolveApexLogExecutionContext(body, row);
            apexLogContextCache.set(cacheKey, parsed);
            meta = parsed;
          } catch {
            /* metadata fallback ya en meta */
          }
        }
      }
      out[item.index] = {
        ...row,
        Type: meta.logType || 'N/A',
        Name: meta.logName || 'N/A',
        Method: meta.logMethod || 'N/A'
      };
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => runOne()));
  return out.map(
    (r, i) => r || { ...(list[i] || {}), Type: 'N/A', Name: 'N/A', Method: 'N/A' }
  );
}
import {
  loadExtensionSettings,
  getApexTestsClassNameLikePatterns,
  getApexTestsTraceDebugLevel,
  getApexTestsCoverageMinPercent,
  getMetadataDeployMaxAttempts,
  getMetadataDeployPollIntervalMs,
  getDebugLogsListMaxRows,
  getSetupAuditQueryDefaultLimit,
  getAnonymousApexLogSearchMaxAttempts,
  getAnonymousApexLogSearchDelayMs
} from '../shared/extensionSettings.js';
import { stageApexViewerPayload, takeApexViewerPayload } from './apexViewerStaging.js';
import { isTestSetupApexTestResult } from '../shared/apexTestMakeDataMethod.js';
import { pickPrimaryApexTestServletRow } from '../shared/apexTestServletPick.js';
import { isOrgAlreadySaved } from '../shared/orgPrefs.js';
import { RetrieveCancelledError } from '../shared/metadataRetrieve.js';
import { sanitizeUiError } from '../shared/sanitizeUiError.js';
import { isTrustedExtensionSender } from '../shared/trustedSender.js';
import { pickUsageLogEntry } from '../shared/usageLogEntry.js';
import {
  beginRetrieveSession,
  cancelRetrieveSessions,
  isRetrieveGenerationCurrent,
  retrieveCancelOpts
} from './retrieveSession.js';
import { featureControlBlockedResponse } from './featureControlsGuard.js';
import {
  handleLogiAdvisorBootstrap,
  handleLogiAdvisorChat,
  handleLogiAdvisorSummarize,
  handleLogiAdvisorCancel,
  handleLogiAdvisorCheckUsageLimits,
  handleLogiAdvisorGetConfig,
  handleLogiAdvisorGetSessionIteration,
  handleLogiAdvisorSaveSettings,
  handleLogiAdvisorTestByok,
  isReadOnlySalesforceQuery
} from './logi/apexLogAiAdvisor.js';
import { slimQueryRecords } from '../shared/logi/apexLogAiContext.js';

/**
 * @param {(response: object) => void} reply
 * @param {unknown} e
 * @param {{ handler?: string, artifact_type?: string, phase?: string }} [ctx]
 */
function replyHandlerError(reply, e, ctx = {}) {
  const err = toError(e);
  const telemetryCtx = {
    error_handled: 1,
    error_source: 'service_worker.handler',
    handler: String(ctx.handler || '').slice(0, 64),
    artifact_type: String(ctx.artifact_type || 'ServiceWorker').slice(0, 64),
    phase: String(ctx.phase || ctx.handler || 'handler').slice(0, 64),
    reason: String(ctx.reason || err.code || '').slice(0, 64)
  };
  const category = classifyError(err, telemetryCtx);
  if (category === 'bug') {
    void sendPosthogException(err, telemetryCtx);
  } else if (category === 'operational') {
    void sendPosthogOperationalFailure({
      artifactType: telemetryCtx.artifact_type,
      phase: telemetryCtx.phase,
      reason: telemetryCtx.reason || err.message,
      error: String(err.message || '').slice(0, 200)
    });
  }
  reply({ ok: false, error: sanitizeUiError(e) });
}

function retrieveCancelledResponse() {
  return { ok: false, cancelled: true };
}

/** @param {unknown} e @param {(response: object) => void} deliver */
function sendRetrieveErrorResponse(e, deliver) {
  if (e instanceof RetrieveCancelledError || (e && typeof e === 'object' && e.code === 'RETRIEVE_CANCELLED')) {
    deliver(retrieveCancelledResponse());
  } else {
    replyHandlerError(deliver, e, { artifact_type: 'Retrieve', phase: 'retrieve' });
  }
}

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
 * @param {Record<string, unknown>} row
 */
function aggregateCountFromRow(row) {
  for (const [key, val] of Object.entries(row)) {
    if (key === 'attributes' || key === 'Outcome' || key === 'AsyncApexJobId') continue;
    if (typeof val === 'number') return val;
  }
  return 0;
}

/**
 * Conteos Outcome por job en una sola query (jobs terminales).
 * @returns {Promise<Map<string, Record<string, number>> | null>} null = usar fallback por job
 */
async function batchOutcomeCountsForTerminalJobs(instanceUrl, sid, apiVersion, jobIdsForResults) {
  const map = new Map();
  if (!jobIdsForResults.length) return map;
  const inList = jobIdsForResults
    .map((id) => `'${escapeSoqlLiteral(String(id))}'`)
    .join(',');
  try {
    const aggSoql = `SELECT AsyncApexJobId, Outcome, COUNT(Id) FROM ApexTestResult WHERE AsyncApexJobId IN (${inList}) GROUP BY AsyncApexJobId, Outcome`;
    const agg = await toolingQuery(instanceUrl, sid, apiVersion, aggSoql);
    for (const row of agg || []) {
      const jid = row.AsyncApexJobId != null ? String(row.AsyncApexJobId) : '';
      if (!jid) continue;
      const k = row.Outcome != null ? String(row.Outcome) : '?';
      const n = aggregateCountFromRow(row);
      if (!map.has(jid)) map.set(jid, {});
      const oc = map.get(jid);
      oc[k] = (oc[k] || 0) + n;
    }
    await Promise.all(
      [...map.entries()].map(async ([jid, oc]) => {
        const adjusted = await adjustOutcomeCountsExcludingTestSetup(
          instanceUrl,
          sid,
          apiVersion,
          jid,
          oc
        );
        map.set(jid, adjusted);
      })
    );
    return map;
  } catch {
    return null;
  }
}

const APEX_TEST_TERMINAL_JOB_STATUSES = new Set(['Completed', 'Failed', 'Aborted', 'Error']);

function isApexTestTerminalJobStatus(st) {
  return APEX_TEST_TERMINAL_JOB_STATUSES.has(String(st || '').trim());
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
import {
  buildOrgFromActiveTab,
  checkOrgAuthStatus,
  getOrderedSavedOrgs,
  resolveSidForOrg,
  loadSavedOrgOrder,
  loadSavedOrgs,
  makeIndexKey,
  makeSourceKey,
  saveSavedOrgOrder,
  saveSavedOrgs,
  syncOrgOrderAfterAdd,
  syncOrgOrderAfterRemove
} from './orgHelpers.js';

export function installMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, rawRespond) => {
    if (!isTrustedExtensionSender(sender)) {
      rawRespond({ ok: false, reason: 'UNTRUSTED_SENDER' });
      return false;
    }
    /** @param {object} payload */
    const reply = (payload) => {
      if (
        payload &&
        typeof payload === 'object' &&
        Object.prototype.hasOwnProperty.call(payload, 'error') &&
        payload.error != null &&
        payload.error !== ''
      ) {
        rawRespond({ ...payload, error: sanitizeUiError(payload.error) });
      } else {
        rawRespond(payload);
      }
    };
    (async () => {
      try {
        switch (message?.type) {
          case 'sfoc:ping': {
            reply({
              ok: true,
              extensionId: chrome.runtime.id,
              version: chrome.runtime.getManifest().version
            });
            break;
          }
          case 'discoverActiveOrg': {
            const res = await buildOrgFromActiveTab();
            reply(res);
            break;
          }
          case 'retrieve:begin': {
            {
              const blocked = featureControlBlockedResponse('retrieve');
              if (blocked) {
                reply(blocked);
                break;
              }
            }
            reply({ ok: true, generation: beginRetrieveSession() });
            break;
          }
          case 'retrieve:cancel': {
            reply({ ok: true, generation: cancelRetrieveSessions() });
            break;
          }
          case 'metadataTypeCompare:begin': {
            reply({ ok: true, generation: beginMetadataTypeCompareSession() });
            break;
          }
          case 'metadataTypeCompare:cancel': {
            reply({ ok: true, generation: cancelMetadataTypeCompareSessions() });
            break;
          }
          case 'metadataTypeCompare:listMembers': {
            const { orgId, metadataType, folder, compareGeneration: gen } = message;
            if (!isMetadataTypeCompareGenerationCurrent(gen)) {
              return reply({ ok: false, reason: 'CANCELLED' });
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });
            try {
              const members = await listMembersForMetadataType(
                org.instanceUrl,
                sid,
                org.apiVersion,
                String(metadataType || ''),
                folder != null && folder !== '' ? String(folder) : undefined
              );
              if (!isMetadataTypeCompareGenerationCurrent(gen)) {
                return reply({ ok: false, reason: 'CANCELLED' });
              }
              reply({ ok: true, members });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'metadataTypeCompare:compareRestBatch': {
            const {
              leftOrgId,
              rightOrgId,
              metadataType,
              memberNames,
              compareGeneration: gen
            } = message;
            if (!isMetadataTypeCompareGenerationCurrent(gen)) {
              return reply({ ok: false, reason: 'CANCELLED' });
            }
            const saved = await loadSavedOrgs();
            const leftOrg = saved[leftOrgId];
            const rightOrg = saved[rightOrgId];
            if (!leftOrg || !rightOrg) throw new Error('Org not saved');
            const leftSid = await resolveSidForOrg(leftOrg);
            const rightSid = await resolveSidForOrg(rightOrg);
            if (!leftSid || !rightSid) return reply({ ok: false, reason: 'NO_SID' });
            try {
              const resultsMap = await compareRestMemberBatch({
                leftInstanceUrl: leftOrg.instanceUrl,
                leftSid,
                rightInstanceUrl: rightOrg.instanceUrl,
                rightSid,
                apiVersion: leftOrg.apiVersion,
                metadataType: String(metadataType || ''),
                memberNames: Array.isArray(memberNames) ? memberNames : [],
                isCancelled: metadataTypeCompareCancelOpts(gen).isCancelled
              });
              if (!isMetadataTypeCompareGenerationCurrent(gen)) {
                return reply({ ok: false, reason: 'CANCELLED' });
              }
              const rows = [...resultsMap.entries()].map(([key, value]) => ({
                key,
                status: value.status,
                ...(value.detail ? { detail: value.detail } : {})
              }));
              reply({ ok: true, rows });
            } catch (e) {
              if (e?.code === 'METADATA_TYPE_COMPARE_CANCELLED') {
                return reply({ ok: false, reason: 'CANCELLED' });
              }
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'syncOrgsFromActiveTab': {
            const discovered = await buildOrgFromActiveTab();
            let addedOrg = null;
            if (discovered.ok && discovered.org) {
              const saved = await loadSavedOrgs();
              const list = Object.values(saved);
              if (!isOrgAlreadySaved(discovered.org, list)) {
                saved[discovered.org.id] = discovered.org;
                await saveSavedOrgs(saved);
                await syncOrgOrderAfterAdd(discovered.org.id);
                addedOrg = discovered.org;
                authStatusCache.del(`auth:${discovered.org.id}`);
              }
            }
            const orgs = await getOrderedSavedOrgs();
            const entries = await Promise.all(
              orgs.map(async (org) => [org.id, await checkOrgAuthStatus(org, true)])
            );
            reply({
              ok: true,
              orgs,
              addedOrg,
              statuses: Object.fromEntries(entries)
            });
            break;
          }
          case 'addOrg': {
            const saved = await loadSavedOrgs();
            const org = message.org;
            if (!org || !org.id) throw new Error('Invalid org');
            saved[org.id] = org;
            await saveSavedOrgs(saved);
            await syncOrgOrderAfterAdd(org.id);
            try {
              const sid = await resolveSidForOrg(org);
              if (sid) await syncOrgSandboxFlagIfNeeded(org, sid);
            } catch {
              /* ignore */
            }
            void maybeSendFirstOrgConnectedTelemetry(org);
            reply({ ok: true });
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
            reply({ ok: true });
            break;
          }
          case 'listSavedOrgs': {
            const orgs = await getOrderedSavedOrgs();
            reply({ ok: true, orgs });
            break;
          }
          case 'auth:getStatuses': {
            const saved = await loadSavedOrgs();
            const orgs = Object.values(saved);
            const force = !!message.force;
            const entries = await Promise.all(orgs.map(async (org) => [org.id, await checkOrgAuthStatus(org, force)]));
            const statuses = Object.fromEntries(entries);
            reply({ ok: true, statuses });
            break;
          }
          case 'getOrgConnectedUser': {
            const user = await resolveOrgConnectedUser(message.orgId, {
              force: !!message.force
            });
            reply({ ok: true, user: user || null });
            break;
          }
          case 'getOrgConnectedUsers': {
            const users = await resolveOrgConnectedUsers(message.orgIds, {
              force: !!message.force
            });
            reply({ ok: true, users });
            break;
          }
          case 'auth:reauth': {
            const saved = await loadSavedOrgs();
            const orgId = message.orgId;
            const org = saved[orgId];
            if (!org) return reply({ ok: false, error: 'Org not found' });
            const url = `${String(org.instanceUrl).replace(/\/$/, '')}/?login=true`;
            try {
              await chrome.tabs.create({ url });
              authStatusCache.del(`auth:${org.id}`);
              reply({ ok: true });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'removeOrg': {
            const saved = await loadSavedOrgs();
            delete saved[message.orgId];
            await saveSavedOrgs(saved);
            await syncOrgOrderAfterRemove(message.orgId);
            reply({ ok: true });
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
            reply({
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
              reply({ ok: false, error: 'INVALID_PAYLOAD' });
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
            reply({ ok: true, count: Object.keys(next).length });
            break;
          }
          case 'searchIndex': {
            const { orgId, artifactType, prefix } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });

            const key = makeIndexKey(orgId, artifactType, prefix);
            const cached = indexCache.get(key);
            if (cached) return reply({ ok: true, items: cached, cached: true });

            try {
              const items = await apiSearchIndex(org.instanceUrl, sid, org.apiVersion, artifactType, prefix || '');
              indexCache.set(key, items);
              reply({ ok: true, items });
            } catch (e) {
              if (e && (e.status === 401 || e.status === 403)) {
                indexCache.clear();
                sourceCache.clear();
              }
              reply({ ok: false, error: 'Request failed. Please retry or re-authenticate.' });
            }
            break;
          }
          case 'quickOpen:buildIndex': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });

            try {
              const items = await buildQuickOpenMetadataIndex(
                org.instanceUrl,
                sid,
                org.apiVersion
              );
              reply({ ok: true, items });
            } catch (e) {
              if (e && (e.status === 401 || e.status === 403)) {
                indexCache.clear();
                sourceCache.clear();
              }
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'fetchSource': {
            const { orgId, artifactType, descriptor, listOnly } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });

            if (listOnly) {
              try {
                const files = await apiFetchSourceListOnly(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  artifactType,
                  descriptor
                );
                reply({ ok: true, files });
              } catch (e) {
                if (e && (e.status === 401 || e.status === 403)) {
                  indexCache.clear();
                  sourceCache.clear();
                }
                reply({ ok: false, error: 'Request failed. Please retry or re-authenticate.' });
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
                  reply({ ok: true, files: normalizedCached.files, cached: true });
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
              reply({ ok: true, files });
            } catch (e) {
              if (e && (e.status === 401 || e.status === 403)) {
                indexCache.clear();
                sourceCache.clear();
              }
              reply({ ok: false, error: 'Request failed. Please retry or re-authenticate.' });
            }
            break;
          }
          case 'usage:log': {
            const picked = pickUsageLogEntry(message.entry || {});
            try {
              if (DEBUG_LOGS)
                console.log('[usage:log] received', {
                  kind: picked.kind,
                  artifactType: picked.artifactType,
                  leftOrgId: picked.leftOrgId,
                  rightOrgId: picked.rightOrgId,
                  viaRetrieveZip: !!picked.viaRetrieveZip,
                  phase: picked.phase
                });
            } catch {}
            await appendUsageLog(picked);
            reply({ ok: true });
            break;
          }
          case 'telemetry:opt-out': {
            try {
              await appendTelemetryOptOutLog();
            } catch {}
            reply({ ok: true });
            break;
          }
          case 'telemetry:opt-in': {
            try {
              await appendTelemetryOptInLog();
            } catch {}
            reply({ ok: true });
            break;
          }
          case 'telemetry:logiUsage': {
            try {
              const { type: _type, action, ...rest } = message;
              await captureLogiUsage({ action, ...rest });
            } catch {}
            reply({ ok: true });
            break;
          }
          case 'telemetry:resolveUserLabel': {
            try {
              const ctx = await resolveTelemetryUserLabel({
                rightOrgId: message.rightOrgId,
                leftOrgId: message.leftOrgId
              });
              if (!ctx?.sfUserLabel) {
                reply({ ok: false });
                break;
              }
              reply({
                ok: true,
                sfUserLabel: ctx.sfUserLabel
              });
            } catch {
              reply({ ok: false });
            }
            break;
          }
          case 'telemetry:exception': {
            try {
              const err = new Error(String(message.message || 'unknown').slice(0, 2000));
              if (message.name) err.name = String(message.name).slice(0, 128);
              if (message.stack) err.stack = String(message.stack).slice(0, 8000);
              const ctx =
                message.context && typeof message.context === 'object' ? message.context : {};
              const sent = await sendPosthogException(err, ctx);
              reply({ ok: sent });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexViewer:stage': {
            try {
              const il = message.initialLine;
              const id = stageApexViewerPayload(message.title, message.content, {
                initialLine: il != null ? Number(il) : undefined,
                downloadFileName: message.downloadFileName,
                defaultTab: message.defaultTab,
                orgId: message.orgId,
                instanceUrl: message.instanceUrl,
                logId: message.logId
              });
              reply({ ok: true, id });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexViewer:take': {
            const v = takeApexViewerPayload(message.id);
            if (!v) {
              reply({ ok: false, error: 'NOT_FOUND' });
              break;
            }
            reply({
              ok: true,
              title: v.title,
              content: v.content,
              ...(v.initialLine != null ? { initialLine: v.initialLine } : {}),
              ...(v.downloadFileName ? { downloadFileName: v.downloadFileName } : {}),
              ...(v.defaultTab ? { defaultTab: v.defaultTab } : {}),
              ...(v.orgId ? { orgId: v.orgId } : {}),
              ...(v.instanceUrl ? { instanceUrl: v.instanceUrl } : {}),
              ...(v.logId ? { logId: v.logId } : {})
            });
            break;
          }
          case 'metadata:retrievePermissionSet': {
            {
              const blocked = featureControlBlockedResponse('retrieve');
              if (blocked) {
                reply(blocked);
                break;
              }
            }
            const { orgId, permSetName, retrieveGeneration: gen } = message;
            if (!isRetrieveGenerationCurrent(gen)) {
              return reply(retrieveCancelledResponse());
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });

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

              await loadExtensionSettings();
              const { zipBase64, meta } = await retrievePermissionSetZip(
                org.instanceUrl,
                sid,
                org.apiVersion,
                memberFullName,
                retrieveCancelOpts(gen)
              );
              if (!isRetrieveGenerationCurrent(gen)) {
                return reply(retrieveCancelledResponse());
              }
              reply({
                ok: true,
                zipBase64,
                fileName: `${memberFullName}_permissionset.zip`,
                lastModifiedByName: meta?.lastModifiedByName || '',
                lastModifiedByUsername: meta?.lastModifiedByUsername || '',
                lastModifiedDate: meta?.lastModifiedDate || ''
              });
            } catch (e) {
              sendRetrieveErrorResponse(e, reply);
            }
            break;
          }
          case 'metadata:retrieveProfile': {
            {
              const blocked = featureControlBlockedResponse('retrieve');
              if (blocked) {
                reply(blocked);
                break;
              }
            }
            const { orgId, profileName, retrieveGeneration: gen } = message;
            if (!isRetrieveGenerationCurrent(gen)) {
              return reply(retrieveCancelledResponse());
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });

            try {
              await loadExtensionSettings();
              const { zipBase64, meta } = await retrieveProfileZip(
                org.instanceUrl,
                sid,
                org.apiVersion,
                profileName,
                retrieveCancelOpts(gen)
              );
              if (!isRetrieveGenerationCurrent(gen)) {
                return reply(retrieveCancelledResponse());
              }
              reply({
                ok: true,
                zipBase64,
                fileName: `${profileName}_profile.zip`,
                lastModifiedByName: meta?.lastModifiedByName || '',
                lastModifiedByUsername: meta?.lastModifiedByUsername || '',
                lastModifiedDate: meta?.lastModifiedDate || ''
              });
            } catch (e) {
              sendRetrieveErrorResponse(e, reply);
            }
            break;
          }
          case 'metadata:retrieveFlexiPage': {
            {
              const blocked = featureControlBlockedResponse('retrieve');
              if (blocked) {
                reply(blocked);
                break;
              }
            }
            const { orgId, flexiPageName, retrieveGeneration: gen } = message;
            if (!isRetrieveGenerationCurrent(gen)) {
              return reply(retrieveCancelledResponse());
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });

            try {
              await loadExtensionSettings();
              const { zipBase64, meta } = await retrieveFlexiPageZip(
                org.instanceUrl,
                sid,
                org.apiVersion,
                flexiPageName,
                retrieveCancelOpts(gen)
              );
              if (!isRetrieveGenerationCurrent(gen)) {
                return reply(retrieveCancelledResponse());
              }
              reply({
                ok: true,
                zipBase64,
                fileName: `${flexiPageName}_flexipage.zip`,
                lastModifiedByName: meta?.lastModifiedByName || '',
                lastModifiedByUsername: meta?.lastModifiedByUsername || '',
                lastModifiedDate: meta?.lastModifiedDate || ''
              });
            } catch (e) {
              sendRetrieveErrorResponse(e, reply);
            }
            break;
          }
          case 'metadata:retrievePackageXml': {
            {
              const blocked = featureControlBlockedResponse('retrieve');
              if (blocked) {
                reply(blocked);
                break;
              }
            }
            const { orgId, packageXml, retrieveGeneration: gen } = message;
            if (!isRetrieveGenerationCurrent(gen)) {
              return reply(retrieveCancelledResponse());
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });

            const raw = String(packageXml || '').trim();
            if (!raw) {
              return reply({ ok: false, error: 'package.xml vacío' });
            }

            try {
              await loadExtensionSettings();
              const { zipBase64, meta } = await retrievePackageXmlZip(
                org.instanceUrl,
                sid,
                org.apiVersion,
                raw,
                retrieveCancelOpts(gen)
              );
              if (!isRetrieveGenerationCurrent(gen)) {
                return reply(retrieveCancelledResponse());
              }
              reply({
                ok: true,
                zipBase64,
                fileName: 'package_retrieve.zip',
                lastModifiedByName: meta?.lastModifiedByName || '',
                lastModifiedByUsername: meta?.lastModifiedByUsername || '',
                lastModifiedDate: meta?.lastModifiedDate || ''
              });
            } catch (e) {
              sendRetrieveErrorResponse(e, reply);
            }
            break;
          }
          case 'metadata:describeMetadata': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });
            const ver = org.apiVersion;
            try {
              const metadataObjects = await describeMetadata(org.instanceUrl, sid, ver);
              reply({ ok: true, metadataObjects, apiVersionUsed: String(ver) });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'metadata:listMetadata': {
            const { orgId, metadataType, folder } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });
            const ver = org.apiVersion;
            try {
              const records = await listMetadataWithFolderFallback(
                org.instanceUrl,
                sid,
                ver,
                String(metadataType || ''),
                folder != null && folder !== '' ? String(folder) : undefined
              );
              reply({ ok: true, records, apiVersionUsed: String(ver) });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'metadata:deploy': {
            const actionId = message.checkOnly ? 'quick_edit_save' : 'deploy';
            {
              const blocked = featureControlBlockedResponse(actionId);
              if (blocked) {
                reply(blocked);
                break;
              }
            }
            const { orgId, metadataType, memberName, content, fileName, checkOnly, async: deployAsync, deployApiVersion } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });
            const writeGuard = await assertOrgWriteAllowed(org, sid, {
              checkOnly: !!checkOnly,
              action: actionId
            });
            if (!writeGuard.ok) {
              reply({ ok: false, reason: writeGuard.reason, error: writeGuard.error });
              break;
            }
            const ver = formatMetadataApiVersion(deployApiVersion || org.apiVersion);
            try {
              await loadExtensionSettings();
              const zipBase64 = createDeployZipBase64(
                metadataType,
                memberName,
                content,
                ver,
                { fileName }
              );
              const deployOpts = {
                deployOptions: {
                  checkOnly: !!checkOnly,
                  testLevel: 'NoTestRun'
                },
                maxAttempts: getMetadataDeployMaxAttempts(),
                pollIntervalMs: getMetadataDeployPollIntervalMs()
              };
              if (deployAsync === true) {
                const { asyncId } = await deployZipBase64(
                  org.instanceUrl,
                  sid,
                  ver,
                  zipBase64,
                  deployOpts
                );
                await recordLocalAudit({
                  action: checkOnly ? 'deploy_validate' : 'deploy',
                  orgId: String(orgId),
                  detail: `${metadataType}/${memberName}`
                });
                reply({ ok: true, asyncId });
                break;
              }
              const result = await deployAndWait(
                org.instanceUrl,
                sid,
                ver,
                zipBase64,
                deployOpts
              );
              await recordLocalAudit({
                action: checkOnly ? 'deploy_validate' : 'deploy',
                orgId: String(orgId),
                detail: `${metadataType}/${memberName}:${result.status || ''}`
              });
              reply({
                ok: result.success,
                asyncId: result.asyncId,
                status: result.status,
                errorMessage: result.errorMessage,
                componentFailures: result.componentFailures
              });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'metadata:deployBundle': {
            const actionId = message.checkOnly ? 'quick_edit_save' : 'deploy';
            {
              const blocked = featureControlBlockedResponse(actionId);
              if (blocked) {
                reply(blocked);
                break;
              }
            }
            const { orgId, metadataType, memberName, files, checkOnly, async: deployAsync } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });
            const writeGuard = await assertOrgWriteAllowed(org, sid, {
              checkOnly: !!checkOnly,
              action: actionId
            });
            if (!writeGuard.ok) {
              reply({ ok: false, reason: writeGuard.reason, error: writeGuard.error });
              break;
            }
            if (!Array.isArray(files) || files.length === 0) {
              return reply({ ok: false, errorMessage: 'No files to deploy' });
            }
            const ver = org.apiVersion;
            try {
              await loadExtensionSettings();
              const zipBase64 = createBundleDeployZipBase64(metadataType, memberName, files, ver);
              const deployOpts = {
                deployOptions: {
                  checkOnly: !!checkOnly,
                  testLevel: 'NoTestRun'
                },
                maxAttempts: getMetadataDeployMaxAttempts(),
                pollIntervalMs: getMetadataDeployPollIntervalMs()
              };
              if (deployAsync === true) {
                const { asyncId } = await deployZipBase64(
                  org.instanceUrl,
                  sid,
                  ver,
                  zipBase64,
                  deployOpts
                );
                await recordLocalAudit({
                  action: checkOnly ? 'deploy_validate' : 'deploy',
                  orgId: String(orgId),
                  detail: `${metadataType}/${memberName}:bundle`
                });
                reply({ ok: true, asyncId });
                break;
              }
              const result = await deployAndWait(
                org.instanceUrl,
                sid,
                ver,
                zipBase64,
                deployOpts
              );
              await recordLocalAudit({
                action: checkOnly ? 'deploy_validate' : 'deploy',
                orgId: String(orgId),
                detail: `${metadataType}/${memberName}:bundle:${result.status || ''}`
              });
              reply({
                ok: result.success,
                asyncId: result.asyncId,
                status: result.status,
                errorMessage: result.errorMessage,
                componentFailures: result.componentFailures
              });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexTests:listClasses': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });
            try {
              /** LIKE en servidor: evita paginar miles de ApexClass (Tooling API). */
              await loadExtensionSettings();
              const nameWhere = buildApexClassNameLikeWhere(getApexTestsClassNameLikePatterns());
              let rows;
              try {
                rows = await toolingQueryAll(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  `SELECT Id, Name FROM ApexClass WHERE Status = 'Active' AND ${nameWhere} ORDER BY Name`
                );
              } catch {
                rows = await toolingQueryAll(
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
              reply({ ok: true, classes });
            } catch (e) {
              replyHandlerError(reply, e);
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
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });
            if (!raw.length) {
              reply({ ok: true, byClass: [] });
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
                  const qrows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql);
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
                reply({ ok: true, byClass: [] });
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
              reply({ ok: true, byClass });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexTests:run': {
            {
              const blocked = featureControlBlockedResponse('apex_test_run');
              if (blocked) {
                reply(blocked);
                break;
              }
            }
            const { orgId, runBody } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) throw new Error('Org not saved');
            const sid = await resolveSidForOrg(org);
            if (!sid) return reply({ ok: false, reason: 'NO_SID' });
            const body = sanitizeRunTestsBodyForApi(
              runBody && typeof runBody === 'object' ? runBody : {}
            );
            const bodyError = validateRunTestsBodyForApi(body);
            if (bodyError) {
              reply({ ok: false, error: bodyError });
              break;
            }
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
              reply({
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
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'anonymousApex:execute': {
            {
              const blocked = featureControlBlockedResponse('anonymous_apex_execute');
              if (blocked) {
                reply(blocked);
                break;
              }
            }
            const { orgId, anonymousBody } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            const writeGuard = await assertOrgWriteAllowed(org, sid, { action: 'anonymous_apex_execute' });
            if (!writeGuard.ok) {
              reply({ ok: false, reason: writeGuard.reason, error: writeGuard.error });
              break;
            }
            const startedAtIso = new Date().toISOString();
            let traceFlagId = null;
            try {
              try {
                await loadExtensionSettings();
                traceFlagId = await enableUserDebugTraceForSessionUser(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  getApexTestsTraceDebugLevel()
                );
              } catch {
                traceFlagId = null;
              }
              const result = await executeAnonymous(
                org.instanceUrl,
                sid,
                org.apiVersion,
                String(anonymousBody || ''),
                org.id
              );
              let logId = '';
              // Errores de compilación (compiled=false) no generan ejecución ni log útil.
              if (result?.compiled === true) {
                try {
                  const userId = await fetchSessionUserId(org.instanceUrl, sid);
                  const startedMs = new Date(startedAtIso).getTime();
                  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                  const scoreAnonLog = (row) => {
                    const st = new Date(row?.StartTime || 0).getTime();
                    const op = String(row?.Operation || '').toLowerCase();
                    let score = 0;
                    if (Number.isFinite(st)) {
                      if (st >= startedMs - 15_000) score += 80;
                      score += Math.min(40, Math.max(0, (st - (startedMs - 120_000)) / 10_000));
                    }
                    if (op === 'execute anonymous') score += 120;
                    else if (op.includes('anonymous')) score += 60;
                    else if (op === 'developer console') score -= 30;
                    return score;
                  };
                  for (
                    let attempt = 0;
                    attempt < getAnonymousApexLogSearchMaxAttempts() && !logId;
                    attempt++
                  ) {
                    if (attempt > 0) await sleep(getAnonymousApexLogSearchDelayMs());
                    const since = new Date(startedMs - 120_000).toISOString();
                    const until = new Date(Date.now() + 10_000).toISOString();
                    let logs =
                      (await queryApexLogsInWindow(org.instanceUrl, sid, org.apiVersion, since, until, {
                        logUserId: userId,
                        operationEquals: 'Execute Anonymous',
                        limit: 40
                      })) || [];
                    if (!logs.length) {
                      logs =
                        (await queryApexLogsInWindow(org.instanceUrl, sid, org.apiVersion, since, until, {
                          logUserId: userId,
                          limit: 40
                        })) || [];
                    }
                    const ranked = [...logs]
                      .filter((r) => r?.Id)
                      .sort((a, b) => scoreAnonLog(b) - scoreAnonLog(a));
                    if (ranked[0]?.Id) logId = String(ranked[0].Id);
                  }
                } catch {
                  logId = '';
                }
              }
              reply({
                ok: true,
                result,
                startedAtIso,
                finishedAtIso: new Date().toISOString(),
                ...(logId ? { logId } : {})
              });
            } catch (e) {
              replyHandlerError(reply, e);
            } finally {
              if (traceFlagId) {
                try {
                  await deleteTraceFlagById(org.instanceUrl, sid, org.apiVersion, traceFlagId);
                } catch {
                  /* ignore cleanup error */
                }
              }
            }
            break;
          }
          case 'anonymousApex:getLogBody': {
            const { orgId, logId } = message;
            if (!logId) {
              reply({ ok: false, error: 'Missing logId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const body = await fetchApexLogBody(org.instanceUrl, sid, org.apiVersion, logId);
              reply({ ok: true, body });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'orgLimits:get': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const limits = await fetchOrgLimits(org.instanceUrl, sid, org.apiVersion);
              reply({ ok: true, limits });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'environmentStatus:getAll': {
            try {
              const result = await fetchAllEnvironmentStatusRows();
              reply(result);
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'environmentStatus:getSessionDetail': {
            const { orgId } = message;
            try {
              const result = await fetchSessionDetailForOrg(String(orgId || ''));
              reply(result);
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'environmentStatus:clearDescribeCache': {
            const { orgId } = message;
            try {
              reply(invalidateDescribeCacheForOrg(String(orgId || '')));
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'api:listVersions': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const versions = await listRestApiVersions(org.instanceUrl, sid);
              reply({ ok: true, versions });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'apexClass:getApiVersion': {
            const { orgId, className } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            const name = String(className || '').trim();
            if (!name) {
              reply({ ok: false, error: 'Class name required' });
              break;
            }
            try {
              const safe = escapeSoqlLiteral(name);
              const rows =
                (await toolingQuery(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  `SELECT ApiVersion FROM ApexClass WHERE Name = '${safe}' LIMIT 1`
                )) || [];
              const apiVersion = rows[0]?.ApiVersion;
              reply({
                ok: true,
                apiVersion: apiVersion != null ? formatMetadataApiVersion(apiVersion) : null
              });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'objectDescribe:describeGlobal': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const cacheKey = `${orgId}:global`;
              let sobjects = describeGlobalCache.get(cacheKey);
              if (!sobjects) {
                sobjects = await restDescribeGlobal(org.instanceUrl, sid, org.apiVersion);
                describeGlobalCache.set(cacheKey, sobjects);
              }
              reply({ ok: true, sobjects });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'objectDescribe:describeSobject': {
            const { orgId, objectApiName } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const name = String(objectApiName || '').trim();
              const cacheKey = `${orgId}:${name}`;
              let describe = describeSobjectCache.get(cacheKey);
              if (!describe) {
                describe = await restDescribeSobject(org.instanceUrl, sid, org.apiVersion, name);
                describeSobjectCache.set(cacheKey, describe);
              }
              reply({ ok: true, describe });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'restExplorer:request': {
            const { orgId, method, uri, headers, body } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            const httpMethod = String(method || 'GET').toUpperCase();
            if (isRestWriteMethod(httpMethod)) {
              const blocked = featureControlBlockedResponse('rest_write');
              if (blocked) {
                reply(blocked);
                break;
              }
              const writeGuard = await assertOrgWriteAllowed(org, sid, { action: 'rest_write' });
              if (!writeGuard.ok) {
                reply({ ok: false, reason: writeGuard.reason, error: writeGuard.error });
                break;
              }
            }
            try {
              const result = await restRequestWithSid(org.instanceUrl, sid, httpMethod, String(uri || ''), {
                headers: headers && typeof headers === 'object' ? headers : {},
                body: body != null && body !== '' ? String(body) : undefined
              });
              if (isRestWriteMethod(httpMethod)) {
                await recordLocalAudit({
                  action: 'rest_request',
                  orgId: String(orgId),
                  detail: `${httpMethod} ${String(uri || '').slice(0, 120)}`
                });
              }
              reply({
                ok: result.ok,
                status: result.status,
                statusText: result.statusText,
                text: result.text,
                json: result.json,
                headers: result.headers
              });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'dataWorkbench:describeSobject': {
            const { orgId, objectApiName } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const name = String(objectApiName || '').trim();
              const cacheKey = `${orgId}:${name}`;
              let describe = describeSobjectCache.get(cacheKey);
              if (!describe) {
                describe = await restDescribeSobject(org.instanceUrl, sid, org.apiVersion, name);
                describeSobjectCache.set(cacheKey, describe);
              }
              reply({ ok: true, describe });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'dataWorkbench:retrieveRecord': {
            const { orgId, objectApiName, recordId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const record = await retrieveRecord(
                org.instanceUrl,
                sid,
                org.apiVersion,
                String(objectApiName || ''),
                String(recordId || '')
              );
              reply({ ok: true, record });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'dataWorkbench:describeLayout': {
            const { orgId, objectApiName, recordTypeId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const layout = await retrieveLayout(
                org.instanceUrl,
                sid,
                org.apiVersion,
                String(objectApiName || ''),
                recordTypeId ? String(recordTypeId) : undefined
              );
              reply({ ok: true, layout });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'dataWorkbench:importBatch': {
            const blocked =
              featureControlBlockedResponse('bulk_import') || featureControlBlockedResponse('dml_execute');
            if (blocked) {
              reply(blocked);
              break;
            }
            const { orgId, operation, objectApiName, records, externalIdField, batchSize } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            const writeGuard = await assertOrgWriteAllowed(org, sid, { action: 'dml_execute' });
            if (!writeGuard.ok) {
              reply({ ok: false, reason: writeGuard.reason, error: writeGuard.error });
              break;
            }
            try {
              const data = await chrome.storage.local.get(SOAP_HEADERS_STORAGE_KEY);
              const map = normalizeSoapHeadersMap(data[SOAP_HEADERS_STORAGE_KEY]);
              const soapHeaders = getSoapHeadersForOrg(map, String(orgId || ''));
              const list = Array.isArray(records) ? records : [];
              const size = Math.max(1, Math.min(200, Number(batchSize) || 200));
              /** @type {Array<{ success: boolean, id?: string, errors?: string[] }>} */
              const allResults = [];
              for (let i = 0; i < list.length; i += size) {
                const chunk = list.slice(i, i + size);
                const chunkResults = await executeSoapImportBatch({
                  instanceUrl: org.instanceUrl,
                  sid,
                  apiVersion: org.apiVersion,
                  operation: String(operation || 'insert'),
                  objectApiName: String(objectApiName || ''),
                  records: chunk,
                  externalIdField: externalIdField ? String(externalIdField) : 'Id',
                  soapHeaders
                });
                allResults.push(...chunkResults);
              }
              await recordLocalAudit({
                action: 'dml_execute',
                orgId: String(orgId),
                detail: `import:${operation}:${list.length}`
              });
              reply({ ok: true, results: allResults });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'dataWorkbench:dml': {
            const { orgId, operation, objectApiName, records } = message;
            {
              const blocked = featureControlBlockedResponse('dml_execute');
              if (blocked) {
                reply(blocked);
                break;
              }
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            const writeGuard = await assertOrgWriteAllowed(org, sid, { action: 'dml_execute' });
            if (!writeGuard.ok) {
              reply({ ok: false, reason: writeGuard.reason, error: writeGuard.error });
              break;
            }
            try {
              const result = await executeDml(
                org.instanceUrl,
                sid,
                org.apiVersion,
                String(operation || ''),
                String(objectApiName || ''),
                Array.isArray(records) ? records : []
              );
              await recordLocalAudit({
                action: 'dml_execute',
                orgId: String(orgId),
                detail: `${operation} ${objectApiName} (${Array.isArray(records) ? records.length : 0})`
              });
              reply({ ok: true, results: result.results });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'bulkJob:getJob': {
            const { orgId, jobId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const loaded = await fetchBulkJob(org.instanceUrl, sid, org.apiVersion, String(jobId || ''));
              const batches = await fetchBulkJobBatches(
                org.instanceUrl,
                sid,
                loaded.apiVersion,
                String(jobId || ''),
                loaded.bulkApiKind
              );
              reply({ ok: true, job: loaded.job, batches, bulkApiKind: loaded.bulkApiKind, apiVersion: loaded.apiVersion });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'bulkJob:getBatchResult': {
            const { orgId, jobId, batchId, bulkApiKind, apiVersion } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const result = await fetchBulkBatchResult(
                org.instanceUrl,
                sid,
                String(apiVersion || org.apiVersion),
                String(jobId || ''),
                String(batchId || ''),
                bulkApiKind || 'bulk1'
              );
              reply({ ok: true, text: result.text, contentType: result.contentType });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'eventMonitor:listChannels': {
            const { orgId, channelType } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const channels = await listEventChannels(
                org.instanceUrl,
                sid,
                org.apiVersion,
                channelType
              );
              reply({ ok: true, channels });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'eventMonitor:subscribe': {
            const blocked =
              featureControlBlockedResponse('event_monitor_subscribe') ||
              featureControlBlockedResponse('streaming_subscribe');
            if (blocked) {
              reply({ ...blocked, reason: 'FEATURE_BLOCKED' });
              break;
            }
            const { orgId, channelPath, replayId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const sub = await subscribeEventMonitor({
                orgId: String(orgId),
                instanceUrl: org.instanceUrl,
                sid,
                apiVersion: org.apiVersion,
                channelPath: String(channelPath || ''),
                replayId: replayId != null ? Number(replayId) : -1
              });
              await recordLocalAudit({
                action: 'event_monitor_subscribe',
                orgId: String(orgId),
                detail: String(channelPath || '')
              });
              reply({ ok: true, ...sub });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'eventMonitor:unsubscribe': {
            const { orgId } = message;
            try {
              await unsubscribeEventMonitor(String(orgId || ''));
              reply({ ok: true });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'eventMonitor:getSession': {
            const { orgId } = message;
            const session = getEventMonitorSession(String(orgId || ''));
            reply({ ok: true, session });
            break;
          }
          case 'eventMonitor:clearEvents': {
            const { orgId } = message;
            clearEventMonitorEvents(String(orgId || ''));
            reply({ ok: true });
            break;
          }
          case 'orgWrite:getReadOnlyMap': {
            const map = await loadOrgReadOnlyMap();
            reply({ ok: true, map });
            break;
          }
          case 'orgWrite:setReadOnly': {
            const { orgId, readOnly } = message;
            const id = String(orgId || '');
            if (!id) {
              reply({ ok: false, error: 'Missing orgId' });
              break;
            }
            const data = await chrome.storage.local.get(ORG_READ_ONLY_STORAGE_KEY);
            const prev = data[ORG_READ_ONLY_STORAGE_KEY];
            const map = prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...prev } : {};
            if (readOnly) map[id] = true;
            else delete map[id];
            await chrome.storage.local.set({ [ORG_READ_ONLY_STORAGE_KEY]: map });
            reply({ ok: true, map });
            break;
          }
          case 'soapHeaders:get': {
            const { orgId } = message;
            const data = await chrome.storage.local.get(SOAP_HEADERS_STORAGE_KEY);
            const map = normalizeSoapHeadersMap(data[SOAP_HEADERS_STORAGE_KEY]);
            reply({ ok: true, headers: getSoapHeadersForOrg(map, String(orgId || '')) });
            break;
          }
          case 'soapHeaders:set': {
            const { orgId, headers } = message;
            const id = String(orgId || '');
            if (!id) {
              reply({ ok: false, error: 'Missing orgId' });
              break;
            }
            const data = await chrome.storage.local.get(SOAP_HEADERS_STORAGE_KEY);
            const map = normalizeSoapHeadersMap(data[SOAP_HEADERS_STORAGE_KEY]);
            map[id] = headers && typeof headers === 'object' ? headers : {};
            await chrome.storage.local.set({ [SOAP_HEADERS_STORAGE_KEY]: map });
            reply({ ok: true });
            break;
          }
          case 'deployStatus:poll': {
            const {
              orgId,
              selectedAsyncId,
              failedPage,
              succeededPage,
              pageSize,
              fetchDetail,
              knownCoverageHintIds
            } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const data = await pollDeployStatus(org.instanceUrl, sid, org.apiVersion, {
                selectedAsyncId,
                failedPage,
                succeededPage,
                pageSize,
                fetchDetail: !!fetchDetail,
                knownCoverageHintIds
              });
              reply({ ok: true, ...data });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'deployStatus:cancel': {
            const { orgId, asyncId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const result = await cancelDeployRequest(org.instanceUrl, sid, org.apiVersion, asyncId);
              reply({ ok: true, ...result });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'deployStatus:getCoverageLineView': {
            const { orgId, asyncId, classOrTriggerId, className, uncoveredLines: uncoveredLinesHint } = message;
            if (!classOrTriggerId) {
              reply({ ok: false, error: 'Missing classOrTriggerId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const tid = escapeSoqlLiteral(String(classOrTriggerId));
              let soap = null;
              if (asyncId) {
                soap = await checkDeployStatus(org.instanceUrl, sid, org.apiVersion, asyncId);
              }
              let coveredLines = [];
              let uncoveredLines = (Array.isArray(uncoveredLinesHint) ? uncoveredLinesHint : [])
                .map((n) => Number(n))
                .filter((n) => Number.isFinite(n) && n >= 1);

              let body = '';
              let name = className ? String(className) : '';
              try {
                const clsRows = await restQuery(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  `SELECT Name, Body FROM ApexClass WHERE Id = '${tid}' LIMIT 1`
                );
                const row = clsRows?.[0];
                if (row) {
                  body = row.Body || '';
                  if (!name) name = row.Name || '';
                }
              } catch {
                /* trigger */
              }
              if (!body) {
                try {
                  const trRows = await restQuery(
                    org.instanceUrl,
                    sid,
                    org.apiVersion,
                    `SELECT Name, Body FROM ApexTrigger WHERE Id = '${tid}' LIMIT 1`
                  );
                  const row = trRows?.[0];
                  if (row) {
                    body = row.Body || '';
                    if (!name) name = row.Name || '';
                  }
                } catch {
                  /* sin cuerpo */
                }
              }
              if (!body) {
                reply({ ok: false, error: 'NO_CLASS_BODY' });
                break;
              }

              const lineSets = await resolveDeployCoverageLineSets({
                instanceUrl: org.instanceUrl,
                sid,
                apiVersion: org.apiVersion,
                classOrTriggerId,
                runTestResult: soap?.runTestResult,
                uncoveredLinesHint: uncoveredLines,
                body
              });
              coveredLines = lineSets.coveredLines;
              uncoveredLines = lineSets.uncoveredLines;

              reply({
                ok: true,
                name,
                body,
                coveredLines,
                uncoveredLines
              });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'deployStatus:detail': {
            const { orgId, asyncId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const detail = await fetchDeployDetail(org.instanceUrl, sid, org.apiVersion, asyncId);
              if (!detail) {
                reply({ ok: false, error: 'Deploy not found' });
                break;
              }
              reply({ ok: true, detail });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'customSettingsCompare:listTypes': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const types = await listCustomSettingTypes(org.instanceUrl, sid, org.apiVersion);
              reply({ ok: true, types });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'customSettingsCompare:fetchRecords': {
            const { orgId, typeApiName } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const payload = await fetchSetupRecordsForType(
                org.instanceUrl,
                sid,
                org.apiVersion,
                typeApiName
              );
              reply({ ok: true, ...payload });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'customMetadataCompare:listTypes': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const types = await listCustomMetadataTypes(org.instanceUrl, sid, org.apiVersion);
              reply({ ok: true, types });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'customMetadataCompare:fetchRecords': {
            const { orgId, typeApiName } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const payload = await fetchSetupRecordsForType(
                org.instanceUrl,
                sid,
                org.apiVersion,
                typeApiName
              );
              reply({ ok: true, ...payload });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'recordCompare:fetchPair': {
            const { leftOrgId, rightOrgId, leftRecordId, rightRecordId } = message;
            if (!leftOrgId || !rightOrgId) {
              reply({ ok: false, reason: 'MISSING_ORGS' });
              break;
            }
            const saved = await loadSavedOrgs();
            const orgL = saved[leftOrgId];
            const orgR = saved[rightOrgId];
            if (!orgL || !orgR) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sidL = await resolveSidForOrg(orgL);
            const sidR = await resolveSidForOrg(orgR);
            if (!sidL || !sidR) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const [leftObject, rightObject] = await Promise.all([
                resolveObjectFromRecordId(orgL.instanceUrl, sidL, orgL.apiVersion, leftRecordId),
                resolveObjectFromRecordId(orgR.instanceUrl, sidR, orgR.apiVersion, rightRecordId)
              ]);
              if (leftObject !== rightObject) {
                reply({
                  ok: false,
                  reason: 'OBJECT_MISMATCH',
                  leftObject,
                  rightObject
                });
                break;
              }
              const [leftPayload, rightPayload] = await Promise.all([
                fetchRecordForCompare(
                  orgL.instanceUrl,
                  sidL,
                  orgL.apiVersion,
                  leftObject,
                  leftRecordId
                ),
                fetchRecordForCompare(
                  orgR.instanceUrl,
                  sidR,
                  orgR.apiVersion,
                  rightObject,
                  rightRecordId
                )
              ]);
              reply({
                ok: true,
                objectApiName: leftObject,
                left: leftPayload,
                right: rightPayload
              });
            } catch (e) {
              const code = e && typeof e === 'object' && e.code ? String(e.code) : '';
              const errorCode =
                e && typeof e === 'object' && e.salesforceErrorCode
                  ? String(e.salesforceErrorCode)
                  : '';
              if (code === 'INVALID_ID') {
                reply({ ok: false, reason: 'INVALID_ID', error: String(e?.message || e) });
              } else if (code === 'NOT_FOUND') {
                reply({ ok: false, reason: 'NOT_FOUND', error: String(e?.message || e) });
              } else {
                reply({
                  ok: false,
                  reason: 'QUERY_ERROR',
                  error: String(e?.message || e),
                  errorCode: errorCode || undefined
                });
              }
            }
            break;
          }
          case 'permissionsDiff:search': {
            const { orgId, containerType, queryText } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const ct = containerType === 'Profile' ? 'Profile' : 'PermissionSet';
              const items = await searchPermissionContainers(
                org.instanceUrl,
                sid,
                org.apiVersion,
                ct,
                queryText
              );
              reply({ ok: true, items });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'permissionsDiff:searchResource': {
            const { orgId, resourceType, queryText, objectApiName } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const rt = resourceType === 'field' ? 'field' : 'object';
              const items = await searchPermissionResources(
                org.instanceUrl,
                sid,
                org.apiVersion,
                rt,
                queryText,
                objectApiName
              );
              reply({ ok: true, items });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'permissionsDiff:fetchByResource': {
            const { orgId, resourceType, resourceInput, containerFilter } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const rt = resourceType === 'field' ? 'field' : 'object';
              const filter =
                containerFilter === 'Profile' || containerFilter === 'PermissionSet'
                  ? containerFilter
                  : 'all';
              const data = await fetchAccessByResource(
                org.instanceUrl,
                sid,
                org.apiVersion,
                rt,
                resourceInput,
                { containerFilter: filter }
              );
              reply({ ok: true, ...data });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'permissionsDiff:searchCustomPermission': {
            const { orgId, queryText } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const items = await searchCustomPermissions(
                org.instanceUrl,
                sid,
                org.apiVersion,
                queryText
              );
              reply({ ok: true, items });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'permissionsDiff:fetchByCustomPermission': {
            const { orgId, customPermissionInput, containerFilter } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const filter =
                containerFilter === 'Profile' || containerFilter === 'PermissionSet'
                  ? containerFilter
                  : 'all';
              const data = await fetchAssignmentsForCustomPermission(
                org.instanceUrl,
                sid,
                org.apiVersion,
                customPermissionInput,
                { containerFilter: filter }
              );
              reply({ ok: true, ...data });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'permissionsDiff:fetch': {
            const { orgId, containerType, containerName } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const ct = containerType === 'Profile' ? 'Profile' : 'PermissionSet';
              const data = await fetchPermissionContainerData(
                org.instanceUrl,
                sid,
                org.apiVersion,
                ct,
                containerName
              );
              reply({
                ok: true,
                container: data.container,
                objectPermissions: data.objectPermissions,
                fieldPermissions: data.fieldPermissions,
                setupEntityAccess: data.setupEntityAccess
              });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'queryExplorer:run': {
            const { orgId, variant, queryText, pagePath } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            const q = queryText != null ? String(queryText).trim() : '';
            const cont = pagePath != null && String(pagePath).trim() ? String(pagePath).trim() : '';
            if (!q && !cont) {
              reply({ ok: false, error: 'Empty query' });
              break;
            }
            try {
              const pathOrQ = cont || q;
              if (variant === 'rest-soql') {
                const r = await restSoqlQueryPage(org.instanceUrl, sid, org.apiVersion, pathOrQ);
                reply({
                  ok: true,
                  records: r.records,
                  totalSize: r.totalSize,
                  done: r.done,
                  nextPath: r.nextPath
                });
              } else if (variant === 'tooling-soql') {
                const r = await toolingSoqlQueryPage(org.instanceUrl, sid, org.apiVersion, pathOrQ);
                reply({
                  ok: true,
                  records: r.records,
                  totalSize: r.totalSize,
                  done: r.done,
                  nextPath: r.nextPath
                });
              } else if (variant === 'rest-sosl') {
                const r = await restSoslSearchPage(org.instanceUrl, sid, org.apiVersion, pathOrQ);
                reply({
                  ok: true,
                  records: r.records,
                  totalSize: r.totalSize,
                  done: r.done,
                  nextPath: r.nextPath
                });
              } else {
                reply({ ok: false, error: 'Invalid variant' });
              }
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'queryExplorer:describeGlobal': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const sobjects = await restDescribeGlobal(org.instanceUrl, sid, org.apiVersion);
              reply({ ok: true, sobjects });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'queryExplorer:describeSobject': {
            const { orgId, objectApiName } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const describe = await restDescribeSobject(org.instanceUrl, sid, org.apiVersion, objectApiName);
              reply({ ok: true, describe });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'aiAdvisor:bootstrap': {
            try {
              reply(await handleLogiAdvisorBootstrap(message));
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'aiAdvisor:getConfig': {
            try {
              reply(await handleLogiAdvisorGetConfig());
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'aiAdvisor:getSessionIteration': {
            try {
              reply(await handleLogiAdvisorGetSessionIteration(message));
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'aiAdvisor:checkUsageLimits': {
            try {
              reply(await handleLogiAdvisorCheckUsageLimits());
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'aiAdvisor:chat': {
            try {
              reply(await handleLogiAdvisorChat(message));
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'aiAdvisor:summarize': {
            try {
              reply(await handleLogiAdvisorSummarize(message));
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'aiAdvisor:cancel': {
            try {
              reply(handleLogiAdvisorCancel(message));
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'aiAdvisor:saveSettings': {
            try {
              reply(await handleLogiAdvisorSaveSettings(message));
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'aiAdvisor:testByok': {
            try {
              reply(await handleLogiAdvisorTestByok(message));
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'aiAdvisor:runQuery': {
            const blocked = featureControlBlockedResponse('ai_org_query');
            if (blocked) {
              reply(blocked);
              break;
            }
            const { orgId, variant, queryText } = message;
            const q = queryText != null ? String(queryText).trim() : '';
            if (!q || !isReadOnlySalesforceQuery(q)) {
              reply({ ok: false, error: 'Query not allowed (read-only SELECT/FIND only)' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              let records = [];
              let totalSize = 0;
              let done = true;
              if (variant === 'rest-soql') {
                const r = await restSoqlQueryPage(org.instanceUrl, sid, org.apiVersion, q);
                records = r.records;
                totalSize = r.totalSize;
                done = r.done;
              } else if (variant === 'tooling-soql') {
                const r = await toolingSoqlQueryPage(org.instanceUrl, sid, org.apiVersion, q);
                records = r.records;
                totalSize = r.totalSize;
                done = r.done;
              } else if (variant === 'rest-sosl') {
                const r = await restSoslSearchPage(org.instanceUrl, sid, org.apiVersion, q);
                records = r.records;
                totalSize = r.totalSize;
                done = r.done;
              } else {
                reply({ ok: false, error: 'Invalid variant' });
                break;
              }
              await recordLocalAudit({
                action: 'ai_org_query',
                orgId,
                detail: q.slice(0, 120)
              });
              reply({
                ok: true,
                records: slimQueryRecords(records, 50),
                totalSize,
                done
              });
            } catch (e) {
              reply(queryExplorerCatchErrorPayload(e));
            }
            break;
          }
          case 'apexCoverageCompare:fetch': {
            const { leftOrgId, rightOrgId } = message;
            const saved = await loadSavedOrgs();
            const orgL = saved[leftOrgId];
            const orgR = saved[rightOrgId];
            if (!orgL || !orgR) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sidL = await resolveSidForOrg(orgL);
            const sidR = await resolveSidForOrg(orgR);
            if (!sidL || !sidR) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const [leftRows, rightRows] = await Promise.all([
                queryApexCodeCoverageAggregate(orgL.instanceUrl, sidL, orgL.apiVersion),
                queryApexCodeCoverageAggregate(orgR.instanceUrl, sidR, orgR.apiVersion)
              ]);
              reply({
                ok: true,
                leftRows: Array.isArray(leftRows) ? leftRows : [],
                rightRows: Array.isArray(rightRows) ? rightRows : []
              });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexCoverageCompare:getLineView': {
            const { orgId, apexClassOrTriggerId, className } = message;
            const rawId = String(apexClassOrTriggerId || '').replace(/[^a-zA-Z0-9]/g, '');
            if (!rawId) {
              reply({ ok: false, error: 'Missing apexClassOrTriggerId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const tid = escapeSoqlLiteral(rawId);
              const covSoql = `SELECT Coverage FROM ApexCodeCoverage WHERE ApexClassOrTriggerId = '${tid}'`;
              const covRows = await toolingQueryAll(org.instanceUrl, sid, org.apiVersion, covSoql);
              const covered = new Set();
              const uncovered = new Set();
              for (const row of covRows || []) {
                mergeApexCoverageJsonField(row.Coverage, covered, uncovered);
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
              reply({
                ok: true,
                body,
                name: className != null ? String(className) : '',
                coveredLines: [...covered].sort((a, b) => a - b),
                uncoveredLines: [...uncovered].sort((a, b) => a - b)
              });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'debugLogs:list': {
            const { orgId, sinceIso, untilIso } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const since = String(sinceIso || '');
              const until = String(untilIso || '');
              if (!since || !until) {
                reply({ ok: false, error: 'Missing date range' });
                break;
              }
              await loadExtensionSettings();
              const logs = await queryApexLogsInWindow(org.instanceUrl, sid, org.apiVersion, since, until, {
                limit: getDebugLogsListMaxRows()
              });
              const safeLogs = Array.isArray(logs) ? [...logs].reverse() : [];
              reply({ ok: true, logs: safeLogs });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'debugLogs:enrichRows': {
            const { orgId, rows, maxBodyFetches } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const cap = Math.max(1, Math.min(100, Math.floor(Number(maxBodyFetches) || 25)));
              const inputRows = (Array.isArray(rows) ? rows : []).slice(0, cap);
              const enriched = await enrichApexLogRowsWithExecutionContext(
                org.instanceUrl,
                sid,
                org.apiVersion,
                inputRows,
                { pageBodiesOnly: true, maxBodyFetches: inputRows.length, concurrency: 3 }
              );
              reply({
                ok: true,
                rows: enriched.map((row) => ({ ...row, contextFromBody: true }))
              });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'debugLogs:deleteAll': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const result = await deleteAllApexLogs(org.instanceUrl, sid, org.apiVersion);
              reply({ ok: true, ...result });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'debugLogs:searchUsers': {
            const { orgId, queryText } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const items = await searchUsersByNameOrUsername(
                org.instanceUrl,
                sid,
                org.apiVersion,
                queryText
              );
              reply({ ok: true, items });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'debugLogs:listDebugLevels': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const levels = await queryDebugLevels(org.instanceUrl, sid, org.apiVersion);
              reply({ ok: true, levels });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'debugLogs:createTrace': {
            const { orgId, userId, debugLevelId, startIso, expirationIso } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const result = await createUserDebugTraceFlag(org.instanceUrl, sid, org.apiVersion, {
                userId,
                debugLevelId,
                startIso,
                expirationIso
              });
              reply({ ok: true, ...result });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'debugLogs:resolveUsers': {
            const { orgId, userIds } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((x) => String(x || '').replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean))];
              const namesById = {};
              if (!ids.length) {
                reply({ ok: true, namesById });
                break;
              }
              for (let i = 0; i < ids.length; i += 100) {
                const chunk = ids.slice(i, i + 100);
                const inList = chunk.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
                const soql = `SELECT Id, Name FROM User WHERE Id IN (${inList})`;
                let rows = [];
                try {
                  rows = (await restQuery(org.instanceUrl, sid, org.apiVersion, soql)) || [];
                } catch {
                  try {
                    rows = (await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql)) || [];
                  } catch {
                    rows = [];
                  }
                }
                for (const row of rows) {
                  const id = String(row?.Id || '').trim();
                  const name = String(row?.Name || '').trim();
                  if (!id || !name) continue;
                  namesById[id] = name;
                }
              }
              reply({ ok: true, namesById });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexViewer:resolveRecords': {
            const { orgId, ids } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const cleanIds = [
                ...new Set(
                  (Array.isArray(ids) ? ids : [])
                    .map((x) => String(x || '').replace(/[^a-zA-Z0-9]/g, ''))
                    .filter((x) => /^[a-zA-Z0-9]{15,18}$/.test(x))
                )
              ];
              /** Config por prefijo de Id: objeto SObject y campos de visualización. */
              const OBJECT_BY_PREFIX = {
                '001': { object: 'Account', fields: ['Name'] },
                '003': { object: 'Contact', fields: ['Name'] },
                '005': { object: 'User', fields: ['Name'] },
                '500': { object: 'Case', fields: ['CaseNumber', 'Subject'] }
              };
              const buildName = (prefix, row) => {
                if (prefix === '500') {
                  const num = String(row?.CaseNumber || '').trim();
                  const subj = String(row?.Subject || '').trim();
                  return [num, subj].filter(Boolean).join(' · ');
                }
                return String(row?.Name || '').trim();
              };
              const recordsById = {};
              const byPrefix = new Map();
              for (const id of cleanIds) {
                const prefix = id.slice(0, 3).toLowerCase();
                if (!OBJECT_BY_PREFIX[prefix]) continue;
                if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
                byPrefix.get(prefix).push(id);
              }
              for (const [prefix, prefixIds] of byPrefix.entries()) {
                const cfg = OBJECT_BY_PREFIX[prefix];
                const selectFields = ['Id', ...cfg.fields].join(', ');
                for (let i = 0; i < prefixIds.length; i += 100) {
                  const chunk = prefixIds.slice(i, i + 100);
                  const inList = chunk.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
                  const soql = `SELECT ${selectFields} FROM ${cfg.object} WHERE Id IN (${inList})`;
                  let rows = [];
                  try {
                    rows = (await restQuery(org.instanceUrl, sid, org.apiVersion, soql)) || [];
                  } catch {
                    try {
                      rows = (await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql)) || [];
                    } catch {
                      rows = [];
                    }
                  }
                  for (const row of rows) {
                    const id = String(row?.Id || '').trim();
                    if (!id) continue;
                    const name = buildName(prefix, row);
                    recordsById[id] = { name, type: cfg.object };
                  }
                }
              }
              reply({ ok: true, recordsById });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'debugLogs:listTraces': {
            const { orgId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const traces = await queryUserDebugTraceFlags(org.instanceUrl, sid, org.apiVersion);
              const userIds = [
                ...new Set(traces.map((t) => String(t.tracedEntityId || '').replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean))
              ];
              const namesById = {};
              for (let i = 0; i < userIds.length; i += 100) {
                const chunk = userIds.slice(i, i + 100);
                const inList = chunk.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
                const soql = `SELECT Id, Name, Username FROM User WHERE Id IN (${inList})`;
                let rows = [];
                try {
                  rows = (await restQuery(org.instanceUrl, sid, org.apiVersion, soql)) || [];
                } catch {
                  try {
                    rows = (await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql)) || [];
                  } catch {
                    rows = [];
                  }
                }
                for (const row of rows) {
                  const id = String(row?.Id || '').replace(/[^a-zA-Z0-9]/g, '');
                  const name = String(row?.Name || '').trim();
                  const username = String(row?.Username || '').trim();
                  if (!id) continue;
                  if (name && username) namesById[id] = `${name} (${username})`;
                  else namesById[id] = name || username || id;
                }
              }
              const enriched = traces.map((tr) => ({
                ...tr,
                userLabel: namesById[tr.tracedEntityId] || tr.tracedEntityId || ''
              }));
              reply({ ok: true, traces: enriched });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'debugLogs:extendTrace': {
            const { orgId, traceFlagId, allowReactivate } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const result = await extendUserDebugTraceFlag(org.instanceUrl, sid, org.apiVersion, {
                traceFlagId,
                allowReactivate: !!allowReactivate
              });
              reply({ ok: true, ...result });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'debugLogs:deleteTrace': {
            const { orgId, traceFlagId } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              await deleteTraceFlagById(org.instanceUrl, sid, org.apiVersion, traceFlagId);
              reply({ ok: true });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'debugLogs:updateTrace': {
            const { orgId, traceFlagId, debugLevelId, startIso, expirationIso } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const result = await updateUserDebugTraceFlag(org.instanceUrl, sid, org.apiVersion, {
                traceFlagId,
                debugLevelId,
                startIso,
                expirationIso
              });
              const levels = await queryDebugLevels(org.instanceUrl, sid, org.apiVersion);
              const lvl = levels.find((l) => l.id === result.debugLevelId);
              reply({
                ok: true,
                ...result,
                debugLevelLabel: lvl?.label || '',
                debugLevelDeveloperName: lvl?.developerName || ''
              });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'debugLogs:getBody': {
            const { orgId, logId } = message;
            if (!logId) {
              reply({ ok: false, error: 'Missing logId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const body = await fetchApexLogBody(org.instanceUrl, sid, org.apiVersion, logId);
              reply({ ok: true, body });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'setupAuditTrail:list': {
            const { orgId, sinceIso, untilIso, limit } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const since = String(sinceIso || '');
              const until = String(untilIso || '');
              if (!since || !until) {
                reply({ ok: false, error: 'Missing date range' });
                break;
              }
              const soqlDateTime = (v) => {
                const d = new Date(v);
                if (Number.isNaN(d.getTime())) {
                  throw new Error('Invalid date range');
                }
                return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
              };
              await loadExtensionSettings();
              const parsedLimit = Math.max(
                1,
                Math.min(50000, Number(limit) || getSetupAuditQueryDefaultLimit())
              );
              const sinceDt = soqlDateTime(since);
              const untilDt = soqlDateTime(until);
              const soql = `SELECT Id, CreatedDate, CreatedById, CreatedBy.Name, CreatedBy.Username, Section, Action, Display FROM SetupAuditTrail WHERE CreatedDate >= ${sinceDt} AND CreatedDate <= ${untilDt} ORDER BY CreatedDate DESC LIMIT ${parsedLimit}`;
              const rows = await restQueryAll(org.instanceUrl, sid, org.apiVersion, soql);
              reply({ ok: true, rows: Array.isArray(rows) ? rows : [] });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'fieldHistory:context': {
            const { orgId, objectApiName } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const input = String(objectApiName || '').trim();
              if (!input) {
                reply({ ok: false, error: 'Missing object name' });
                break;
              }
              const ctx = await resolveHistoryContext(
                org.instanceUrl,
                sid,
                org.apiVersion,
                input
              );
              reply({
                ok: true,
                objectApiName: ctx.objectApiName,
                historyObject: ctx.historyObject,
                parentField: ctx.parentField,
                trackedFields: ctx.trackedFields,
                historyQueryable: ctx.historyQueryable,
                historyEnabled: ctx.historyEnabled
              });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'fieldHistory:list': {
            const { orgId, objectApiName, historyObject, parentField, recordId, sinceIso, untilIso, fieldNames, limit } =
              message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const rid = String(recordId || '').trim();
              if (!isValidSalesforceRecordId(rid)) {
                reply({ ok: false, error: 'Invalid record Id' });
                break;
              }
              const since = String(sinceIso || '');
              const until = String(untilIso || '');
              if (!since || !until) {
                reply({ ok: false, error: 'Missing date range' });
                break;
              }
              if (new Date(since).getTime() > new Date(until).getTime()) {
                reply({ ok: false, error: 'Invalid date range' });
                break;
              }
              const histObj = String(historyObject || '').trim();
              const parentFld = String(parentField || '').trim();
              const objName = String(objectApiName || '').trim();
              if (!histObj || !parentFld) {
                reply({ ok: false, error: 'Missing history context' });
                break;
              }
              const rows = await queryFieldHistoryRows(org.instanceUrl, sid, org.apiVersion, {
                objectApiName: objName,
                historyObject: histObj,
                parentField: parentFld,
                recordId: rid,
                sinceIso: since,
                untilIso: until,
                fieldNames: Array.isArray(fieldNames) ? fieldNames : undefined,
                limit
              });
              reply({ ok: true, rows });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexTests:pollRuns': {
            const { orgId, jobIds } = message;
            const ids = Array.isArray(jobIds) ? jobIds.filter(Boolean).map(String).slice(0, 30) : [];
            if (!ids.length) {
              reply({ ok: true, runs: [] });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
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
              /** @type {Map<string, Record<string, number>> | null} */
              let batchOutcomes = null;
              const terminalJobIdsForBatch = [];
              for (const jobId of ids) {
                const queueRowsPre = servletByParent15.get(sfId15(jobId)) || [];
                let jobPre = lookupJob(jobId);
                if (!jobPre && queueRowsPre.length) {
                  const primary = pickPrimaryApexTestServletRow(queueRowsPre);
                  if (primary) jobPre = { Id: primary.parentid, Status: primary.status };
                }
                if (jobPre && isTerminalJobStatus(jobPre.Status)) {
                  terminalJobIdsForBatch.push(String(jobPre.Id));
                }
              }
              if (terminalJobIdsForBatch.length) {
                batchOutcomes = await batchOutcomeCountsForTerminalJobs(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  [...new Set(terminalJobIdsForBatch)]
                );
              }

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
                  if (batchOutcomes) {
                    const k15 =
                      jobIdForResults.length >= 15 ? jobIdForResults.slice(0, 15) : jobIdForResults;
                    outcomeCounts =
                      batchOutcomes.get(jobIdForResults) ||
                      batchOutcomes.get(k15) ||
                      null;
                  }
                  if (outcomeCounts == null && terminal) {
                  try {
                    const aggSoql = `SELECT Outcome, COUNT(Id) FROM ApexTestResult WHERE AsyncApexJobId = '${escapeSoqlLiteral(
                      jobIdForResults
                    )}' GROUP BY Outcome`;
                    const agg = await toolingQuery(org.instanceUrl, sid, org.apiVersion, aggSoql);
                    outcomeCounts = {};
                    for (const row of agg || []) {
                      const k = row.Outcome != null ? String(row.Outcome) : '?';
                      outcomeCounts[k] = aggregateCountFromRow(row);
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
              reply({ ok: true, runs });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexTests:getOtherQueueJobs': {
            const { orgId, trackedJobIds } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
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
              const launcherFromParentInfo = (rawParentInfo) => {
                const s = rawParentInfo != null ? String(rawParentInfo).trim() : '';
                if (!s) return '';
                const parts = s
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean);
                if (!parts.length) return '';
                // Formato típico: "YYYY-MM-DD HH:mm:ss, username@domain, ..."
                const looksLikeDate = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(parts[0]);
                if (looksLikeDate && parts[1]) return parts[1];
                return parts[0] || '';
              };
              const launcherFromServletRow = (row) => {
                if (!row || typeof row !== 'object') return '';
                // Campo esperado: parentinfo (pero puede variar en mayúsculas/minúsculas).
                const direct = Object.entries(row).find(
                  ([k]) => String(k).trim().toLowerCase() === 'parentinfo'
                );
                if (direct) return launcherFromParentInfo(direct[1]);
                // Fallback defensivo: primer valor string con pinta de "fecha,usuario,..."
                for (const val of Object.values(row)) {
                  const s = val != null ? String(val).trim() : '';
                  if (!s || !s.includes(',') || !s.includes('@')) continue;
                  const parsed = launcherFromParentInfo(s);
                  if (parsed) return parsed;
                }
                return '';
              };
              const launcherByParent15 = new Map();
              /** @type {Map<string, { Id: string, Status?: string, NumberOfErrors?: number, ExtendedStatus?: string, CreatedBy?: object }>} */
              const asyncJobByParent15 = new Map();
              try {
                const parentIds = [...byParentLists.values()]
                  .map((list) => list?.[0]?.parentid)
                  .filter(Boolean)
                  .map((id) => String(id));
                if (parentIds.length) {
                  const inList = parentIds
                    .map((id) => `'${escapeSoqlLiteral(id)}'`)
                    .join(',');
                  const soql = `SELECT Id, Status, NumberOfErrors, ExtendedStatus, CreatedBy.Username, CreatedBy.Name FROM AsyncApexJob WHERE Id IN (${inList})`;
                  let rows = [];
                  try {
                    rows = (await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql)) || [];
                  } catch {
                    rows = (await restQuery(org.instanceUrl, sid, org.apiVersion, soql)) || [];
                  }
                  for (const row of rows) {
                    const id = row?.Id != null ? String(row.Id) : '';
                    if (!id) continue;
                    const k15 = sfId15(id);
                    asyncJobByParent15.set(k15, row);
                    const name =
                      row?.CreatedBy &&
                      typeof row.CreatedBy === 'object' &&
                      row.CreatedBy.Username != null
                        ? String(row.CreatedBy.Username).trim()
                        : row?.CreatedBy && typeof row.CreatedBy === 'object' && row.CreatedBy.Name != null
                          ? String(row.CreatedBy.Name).trim()
                        : '';
                    launcherByParent15.set(k15, name || '');
                  }
                }
              } catch {
                /* sin nombre de lanzador: mantener cola con datos del servlet */
              }
              const terminalJobIdsForBatch = [];
              for (const list of byParentLists.values()) {
                const primary = pickPrimaryApexTestServletRow(list);
                if (!primary?.parentid) continue;
                const apiJob = asyncJobByParent15.get(sfId15(primary.parentid));
                const st = apiJob?.Status != null ? String(apiJob.Status) : String(primary.status || '');
                if (isApexTestTerminalJobStatus(st)) {
                  terminalJobIdsForBatch.push(String(primary.parentid));
                }
              }
              let batchOutcomes = null;
              if (terminalJobIdsForBatch.length) {
                batchOutcomes = await batchOutcomeCountsForTerminalJobs(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  [...new Set(terminalJobIdsForBatch)]
                );
              }
              for (const list of byParentLists.values()) {
                const primary = pickPrimaryApexTestServletRow(list);
                if (!primary) continue;
                const parent = String(primary.parentid);
                const k15 = sfId15(parent);
                const apiJob = asyncJobByParent15.get(k15);
                let fromParentInfo = launcherFromServletRow(primary);
                if (!fromParentInfo && Array.isArray(list)) {
                  for (const row of list) {
                    fromParentInfo = launcherFromServletRow(row);
                    if (fromParentInfo) break;
                  }
                }
                const status =
                  apiJob?.Status != null ? String(apiJob.Status) : primary.status != null ? String(primary.status) : '';
                const extstatus =
                  primary.extstatus != null
                    ? String(primary.extstatus)
                    : apiJob?.ExtendedStatus != null
                      ? String(apiJob.ExtendedStatus)
                      : '';
                let outcomeCounts = null;
                if (isApexTestTerminalJobStatus(status) && batchOutcomes) {
                  outcomeCounts =
                    batchOutcomes.get(parent) || batchOutcomes.get(k15) || null;
                }
                const numberOfErrors =
                  apiJob?.NumberOfErrors != null ? Number(apiJob.NumberOfErrors) : undefined;
                const queueRows = list.map((row) => ({
                  classname: row.classname != null ? String(row.classname) : '',
                  extstatus: row.extstatus != null ? String(row.extstatus) : '',
                  status: row.status != null ? String(row.status) : ''
                }));
                jobs.push({
                  parentid: parent,
                  launchedBy: launcherByParent15.get(k15) || fromParentInfo || '',
                  status,
                  extstatus,
                  date: primary.date != null ? String(primary.date) : '',
                  classname: primary.classname != null ? String(primary.classname) : '',
                  outcomeCounts,
                  numberOfErrors,
                  queueRows
                });
              }
              reply({ ok: true, jobs });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexTests:getRunFailures': {
            const { orgId, jobId } = message;
            if (!jobId) {
              reply({ ok: false, error: 'Missing jobId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const esc = escapeSoqlLiteral(jobId);
              let rows;
              try {
                const soql = `SELECT MethodName, Message, StackTrace, Outcome, ApexClass.Id, ApexClass.Name, IsTestSetup FROM ApexTestResult WHERE AsyncApexJobId = '${esc}' AND (Outcome = 'Fail' OR Outcome = 'CompileFail') ORDER BY ApexClass.Name, MethodName LIMIT 200`;
                rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql);
              } catch {
                try {
                  const soql2 = `SELECT MethodName, Message, StackTrace, Outcome, ApexClass.Id, ApexClass.Name FROM ApexTestResult WHERE AsyncApexJobId = '${esc}' AND (Outcome = 'Fail' OR Outcome = 'CompileFail') ORDER BY ApexClass.Name, MethodName LIMIT 200`;
                  rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql2);
                } catch {
                  const soql3 = `SELECT MethodName, Message, StackTrace, Outcome, ApexClass.Id, ApexClass.Name FROM ApexTestResult WHERE AsyncApexJobId = '${esc}' AND (Outcome = 'Fail' OR Outcome = 'CompileFail') LIMIT 200`;
                  rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql3);
                }
              }
              const raw = rows || [];
              const failures = raw.filter((r) => !isTestSetupApexTestResult(r));
              reply({ ok: true, failures });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexTests:getRunMethods': {
            const { orgId, jobId } = message;
            if (!jobId) {
              reply({ ok: false, error: 'Missing jobId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const esc = escapeSoqlLiteral(jobId);
              let rows;
              try {
                const soql = `SELECT ApexClass.Name, MethodName, Outcome, Message, StackTrace, IsTestSetup FROM ApexTestResult WHERE AsyncApexJobId = '${esc}' ORDER BY ApexClass.Name, MethodName LIMIT 2000`;
                rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql);
              } catch {
                try {
                  const soql2 = `SELECT ApexClass.Name, MethodName, Outcome, Message, StackTrace FROM ApexTestResult WHERE AsyncApexJobId = '${esc}' ORDER BY ApexClass.Name, MethodName LIMIT 2000`;
                  rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql2);
                } catch {
                  const soql3 = `SELECT ApexClass.Name, MethodName, Outcome, Message FROM ApexTestResult WHERE AsyncApexJobId = '${esc}' ORDER BY ApexClass.Name, MethodName LIMIT 2000`;
                  rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql3);
                }
              }
              const raw = Array.isArray(rows) ? rows : [];
              const methods = raw.filter((r) => !isTestSetupApexTestResult(r));
              reply({ ok: true, methods });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexTests:getRunCoverage': {
            const { orgId, jobId, minCoveragePercent: minCoveragePercentMsg } = message;
            if (!jobId) {
              reply({ ok: false, error: 'Missing jobId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
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
                reply({ ok: true, classes: [], note: 'NO_TEST_RESULTS' });
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
              reply({ ok: true, classes });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexTests:getTestRunLog': {
            let { orgId, jobId, createdDate, completedDate, createdById, logId: logIdParam, intent } =
              message;
            const wantLogBody = intent === 'body';
            if (!jobId) {
              reply({ ok: false, error: 'Missing jobId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
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
                reply({
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
                reply({ ok: false, error: 'NO_LOG_USER' });
                break;
              }

              const jobCreatedMs = parseMs(createdDate);
              if (jobCreatedMs == null) {
                reply({ ok: false, error: 'NO_JOB_START' });
                break;
              }

              const completedParsed = parseMs(completedDate);
              const jobCompletedMs =
                completedParsed ?? jobCreatedMs + 6 * 60 * 60 * 1000;

              // Acotar ventana superior con la siguiente ejecución del mismo usuario.
              let nextJobMs = null;
              try {
                const neighSoql = `SELECT Id, CreatedDate, CompletedDate FROM AsyncApexJob WHERE CreatedById = '${escapeSoqlLiteral(
                  String(createdById)
                )}' AND JobType = 'TestRequest' ORDER BY CreatedDate DESC LIMIT 200`;
                let neighRows = [];
                try {
                  neighRows =
                    (await toolingQuery(org.instanceUrl, sid, org.apiVersion, neighSoql)) || [];
                } catch {
                  neighRows = (await restQuery(org.instanceUrl, sid, org.apiVersion, neighSoql)) || [];
                }
                const current15 = String(jobId).slice(0, 15);
                const withMs = (neighRows || [])
                  .map((r) => {
                    const cMs = parseMs(r?.CreatedDate);
                    const eMs = parseMs(r?.CompletedDate);
                    return {
                      id15: String(r?.Id || '').slice(0, 15),
                      createdMs: cMs,
                      completedMs: eMs
                    };
                  })
                  .filter((r) => Number.isFinite(r.createdMs))
                  .sort((a, b) => a.createdMs - b.createdMs);
                let idx = withMs.findIndex((r) => r.id15 === current15);
                if (idx < 0) {
                  // Fallback: si no aparece el Id (normalización 15/18), localizar por fecha más cercana.
                  let best = -1;
                  let bestDelta = Number.POSITIVE_INFINITY;
                  for (let i = 0; i < withMs.length; i++) {
                    const d = Math.abs(withMs[i].createdMs - jobCreatedMs);
                    if (d < bestDelta) {
                      bestDelta = d;
                      best = i;
                    }
                  }
                  idx = best;
                }
                if (idx >= 0 && idx < withMs.length - 1) {
                  const next = withMs[idx + 1];
                  nextJobMs = next.createdMs;
                }
              } catch {
                /* sin vecinas: mantener ventana base */
              }

              /** Ventana amplia: los ApexLog pueden cerrarse después del CompletedDate del job. */
              let untilMs = Math.max(
                jobCompletedMs + 45 * 60 * 1000,
                jobCreatedMs + 6 * 60 * 60 * 1000
              );
              const sinceMs = jobCreatedMs;
              if (Number.isFinite(nextJobMs)) untilMs = Math.min(untilMs, nextJobMs - 1000);
              if (untilMs <= sinceMs) untilMs = sinceMs + 60_000;
              const sinceIso = new Date(sinceMs).toISOString();
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

              const timeFiltered = filterApexTestRunCandidateLogs(logs, jobCreatedMs);
              if (!timeFiltered.length) {
                reply({ ok: false, error: 'NO_APEX_LOGS_TRACES' });
                break;
              }

              const slimLogs = timeFiltered.map((l) => ({
                Id: l.Id,
                StartTime: l.StartTime,
                Location: l.Location,
                Operation: l.Operation
              }));
              const enrichedLogs = await enrichApexLogRowsWithExecutionContext(
                org.instanceUrl,
                sid,
                org.apiVersion,
                slimLogs,
                { pageBodiesOnly: true, maxBodyFetches: slimLogs.length, concurrency: 3 }
              );
              const apexLogs = filterApexTestRunLogsByExecutionType(enrichedLogs, 'Apex');
              if (!apexLogs.length) {
                reply({ ok: false, error: 'NO_APEX_LOGS_TRACES' });
                break;
              }
              reply({ ok: true, pick: true, logs: apexLogs });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexTests:getCoverageLineView': {
            const { orgId, jobId, classOrTriggerId, className } = message;
            if (!jobId || !classOrTriggerId) {
              reply({ ok: false, error: 'Missing jobId or classOrTriggerId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
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
                reply({ ok: false, error: 'NO_TEST_RESULTS' });
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
              reply({
                ok: true,
                body,
                name: className != null ? String(className) : '',
                coveredLines: [...covered].sort((a, b) => a - b),
                uncoveredLines: [...uncovered].sort((a, b) => a - b)
              });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexTests:getTestClassSource': {
            const { orgId, classId, className } = message;
            if (!classId && !className) {
              reply({ ok: false, error: 'Missing classId or className' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
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
                reply({ ok: false, error: 'NOT_FOUND' });
                break;
              }
              reply({
                ok: true,
                name: row.Name != null ? String(row.Name) : '',
                body: bodyText
              });
            } catch (e) {
              replyHandlerError(reply, e);
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
              reply({ ok: true });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'apexTests:abortRun': {
            const { orgId, jobId } = message;
            if (!jobId) {
              reply({ ok: false, error: 'Missing jobId' });
              break;
            }
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
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
                reply({
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
                reply({ ok: true });
              } else {
                reply({
                  ok: false,
                  reason: 'NO_ABORTABLE_QUEUE_ITEMS',
                  error:
                    lastErr ||
                    'No queue items in a state that can be aborted (already finished or not updatable).'
                });
              }
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'dependencyExplorer:search': {
            const { orgId, seedType, query } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            const typeDef = getSeedTypeById(seedType);
            if (!typeDef) {
              reply({ ok: false, error: 'Unknown seed type' });
              break;
            }
            try {
              if (usesToolingSearch(typeDef)) {
                const soql = buildSearchSoql(seedType, query);
                if (!soql) {
                  reply({ ok: true, items: [] });
                  break;
                }
                const rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql);
                const items = mapSearchRows(rows, typeDef);
                reply({ ok: true, items });
                break;
              }

              const metadataType = getListMetadataType(typeDef);
              if (!metadataType) {
                reply({ ok: false, error: 'Unknown list metadata type' });
                break;
              }

              const cacheKey = `${orgId}:${seedType}`;
              let records = depExplorerListCache.get(cacheKey);
              if (!records) {
                let describeObjects = [];
                try {
                  describeObjects = await describeMetadata(org.instanceUrl, sid, org.apiVersion);
                } catch {
                  describeObjects = [];
                }
                const metaObj = describeObjects.find((o) => o.xmlName === metadataType);
                const folderHint = metaObj?.directoryName?.trim() || undefined;
                records = await listMetadataWithFolderFallback(
                  org.instanceUrl,
                  sid,
                  org.apiVersion,
                  metadataType,
                  folderHint
                );
                depExplorerListCache.set(cacheKey, records);
              }

              const filtered = filterListMetadataForSearch(records, typeDef, query);
              let items = mapListMetadataRows(filtered, typeDef);
              items = await resolveSearchItemIds(typeDef, items, (soql) =>
                toolingQuery(org.instanceUrl, sid, org.apiVersion, soql)
              );
              reply({ ok: true, items });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          case 'dependencyExplorer:analyze': {
            const { orgId, seedId, transitive, includeReferencedBy } = message;
            const saved = await loadSavedOrgs();
            const org = saved[orgId];
            if (!org) {
              reply({ ok: false, error: 'Org not saved' });
              break;
            }
            const sid = await resolveSidForOrg(org);
            if (!sid) {
              reply({ ok: false, reason: 'NO_SID' });
              break;
            }
            try {
              const analysis = await analyzeDependencies({
                seedId,
                transitive: !!transitive,
                includeReferencedBy: !!includeReferencedBy,
                queryFn: (soql) => toolingQuery(org.instanceUrl, sid, org.apiVersion, soql)
              });
              const fieldIds = collectCustomFieldIds(analysis.nodes);
              /** @type {Record<string, string>} */
              let fieldObjectById = {};
              for (const soql of buildFieldObjectSoql(fieldIds)) {
                const rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql);
                Object.assign(fieldObjectById, mapFieldObjectRows(rows));
              }
              /** @type {Record<string, string>} */
              let objectNameById = {};
              const objectIds = collectCustomObjectIdsFromFieldMap(fieldObjectById, objectNameById);
              for (const soql of buildCustomObjectNameSoql(objectIds)) {
                const rows = await toolingQuery(org.instanceUrl, sid, org.apiVersion, soql);
                Object.assign(objectNameById, mapObjectNameRows(rows));
              }
              let categories = groupNodesIntoCategories(
                analysis.nodes,
                fieldObjectById,
                objectNameById
              );
              const nodeIds = analysis.nodes.map((n) => n.id).filter(Boolean);
              const referencedByMap = await fetchReferencedByMap(nodeIds, (soql) =>
                toolingQuery(org.instanceUrl, sid, org.apiVersion, soql)
              );
              categories = enrichCategoriesWithReferencedBy(categories, referencedByMap);
              reply({
                ok: true,
                nodes: analysis.nodes,
                edges: analysis.edges,
                categories,
                fieldObjectById,
                objectNameById,
                truncated: analysis.truncated,
                queryCount: analysis.queryCount,
                totalCount: analysis.nodes.length
              });
            } catch (e) {
              replyHandlerError(reply, e);
            }
            break;
          }
          default:
            reply({
              ok: false,
              reason: 'UNKNOWN_MESSAGE',
              error:
                'Message type not handled (reload the extension on chrome://extensions so the service worker picks up the latest code).'
            });
        }
      } catch (e) {
        replyHandlerError(reply, e);
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
