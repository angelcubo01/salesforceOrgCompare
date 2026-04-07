/**
 * Trazas Apex (TraceFlag USER_DEBUG): programar parada 10 s después de que el job de tests termine.
 */
import { getSidForCookieDomain } from '../shared/orgDiscovery.js';
import { deleteTraceFlagById } from '../shared/salesforceApi.js';
import { getSidForOrgId, loadSavedOrgs } from './orgHelpers.js';

const APEX_JOBS_KEY = 'apexTestRunJobs';
const PENDING_PREFIX = 'apexTracePending_';

function jobIdMatchesTerminal(jobId, terminalSet) {
  const x = String(jobId || '').replace(/[^a-zA-Z0-9]/g, '');
  if (x.length < 15) return false;
  return (
    terminalSet.has(x.slice(0, 15).toLowerCase()) || terminalSet.has(x.toLowerCase())
  );
}

function buildTerminalJobIdSet(runs) {
  const s = new Set();
  const add = (id) => {
    const x = String(id || '').replace(/[^a-zA-Z0-9]/g, '');
    if (x.length >= 15) {
      s.add(x.slice(0, 15).toLowerCase());
      s.add(x.toLowerCase());
    }
  };
  for (const r of runs || []) {
    const j = r?.job;
    if (!j) continue;
    if (!['Completed', 'Failed', 'Aborted', 'Error'].includes(String(j.Status))) continue;
    add(r.jobId);
    add(r.canonicalJobId);
    add(j.Id);
  }
  return s;
}

async function clearTraceFlagFromStoredJobs(traceFlagId) {
  const tf = String(traceFlagId || '');
  if (!tf) return;
  let list = [];
  try {
    const st = await chrome.storage.local.get(APEX_JOBS_KEY);
    list = Array.isArray(st[APEX_JOBS_KEY]) ? st[APEX_JOBS_KEY] : [];
  } catch {
    return;
  }
  let changed = false;
  const next = list.map((row) => {
    if (String(row.traceFlagId) !== tf) return row;
    changed = true;
    const { traceFlagId: _a, traceCleanupScheduled: _b, ...rest } = row;
    return rest;
  });
  if (changed) {
    try {
      await chrome.storage.local.set({ [APEX_JOBS_KEY]: next });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Tras encolar tests sin Id de job: borrar TraceFlag a los 10 s.
 */
export async function scheduleNoJobTraceCleanup(orgId, traceFlagId) {
  if (!orgId || !traceFlagId) return;
  const alarmName = `apexTrace-nojob-${Date.now()}`;
  const pendingKey = `${PENDING_PREFIX}${alarmName}`;
  await chrome.storage.local.set({
    [pendingKey]: { orgId: String(orgId), traceFlagId: String(traceFlagId) }
  });
  await chrome.alarms.create(alarmName, { when: Date.now() + 10000 });
}

/**
 * Cuando el polling detecta jobs terminales, programa borrado del TraceFlag a los 10 s (una vez por job).
 */
export async function scheduleTerminalJobsTraceCleanup(orgId, runs) {
  const terminalSet = buildTerminalJobIdSet(runs);
  let list = [];
  try {
    const st = await chrome.storage.local.get(APEX_JOBS_KEY);
    list = Array.isArray(st[APEX_JOBS_KEY]) ? st[APEX_JOBS_KEY] : [];
  } catch {
    return;
  }
  const toSchedule = [];
  const next = list.map((row) => {
    if (String(row.orgId) !== String(orgId)) return row;
    if (!row.traceFlagId || row.traceCleanupScheduled) return row;
    if (!jobIdMatchesTerminal(row.jobId, terminalSet)) return row;
    toSchedule.push({
      jobId: String(row.jobId).replace(/[^a-zA-Z0-9]/g, ''),
      traceFlagId: row.traceFlagId,
      orgId: row.orgId
    });
    return { ...row, traceCleanupScheduled: true };
  });
  if (!toSchedule.length) return;
  try {
    await chrome.storage.local.set({ [APEX_JOBS_KEY]: next });
  } catch {
    return;
  }
  for (const s of toSchedule) {
    if (!s.jobId) continue;
    const alarmName = `apexTrace-${s.jobId}`;
    const pendingKey = `${PENDING_PREFIX}${alarmName}`;
    try {
      const existing = await chrome.storage.local.get(pendingKey);
      if (existing[pendingKey]) continue;
      await chrome.storage.local.set({
        [pendingKey]: { orgId: String(s.orgId), traceFlagId: String(s.traceFlagId) }
      });
      await chrome.alarms.create(alarmName, { when: Date.now() + 10000 });
    } catch {
      /* ignore */
    }
  }
}

export function installApexTraceAlarmListener() {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    const name = alarm.name;
    if (!name.startsWith('apexTrace-')) return;
    const pendingKey = `${PENDING_PREFIX}${name}`;
    let pending;
    try {
      const raw = await chrome.storage.local.get(pendingKey);
      pending = raw[pendingKey];
    } catch {
      return;
    }
    try {
      await chrome.storage.local.remove(pendingKey);
    } catch {
      /* ignore */
    }
    if (!pending?.orgId || !pending?.traceFlagId) return;
    try {
      const saved = await loadSavedOrgs();
      const org = saved[pending.orgId];
      if (!org) return;
      let sid = await getSidForCookieDomain(org.cookieDomain);
      if (!sid) sid = await getSidForOrgId(org.id);
      if (!sid) return;
      await deleteTraceFlagById(org.instanceUrl, sid, org.apiVersion, pending.traceFlagId);
      await clearTraceFlagFromStoredJobs(pending.traceFlagId);
    } catch {
      /* ignore */
    }
  });
}
