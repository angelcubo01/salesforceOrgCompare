/**
 * Handlers background para integración UI en Salesforce (sfInject:*).
 */
import { fetchApexLogBody, queryApexLogsInWindow } from '../../shared/salesforceApi.js';
import { instanceUrlsReferToSameOrg } from '../../shared/orgDiscovery.js';
import { loadLang } from '../../shared/i18n.js';
import {
  getSfInjectSettingsSnapshot,
  isSfInjectIntegrationEnabled,
  loadSfInjectSettings,
  saveSfInjectSettings
} from '../lib/settings.js';
import { stageApexViewerPayload } from '../../background/apexViewerStaging.js';
import { buildOrgFromActiveTab, loadSavedOrgs, resolveSidForOrg } from '../../background/orgHelpers.js';
import { instanceUrlFromLocationUrl } from '../lib/instanceUrl.js';
import { isApexDebugLogsInjectPage, normalizeApexLogId } from '../content/matchers/debugLogPages.js';

function sanitizeLogFileName(logId) {
  return String(logId || 'log')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .slice(0, 200);
}

/**
 * Solo páginas chrome-extension:// de esta extensión (popup/settings), no content scripts.
 * @param {chrome.runtime.MessageSender} [sender]
 */
function isExtensionUiSender(sender) {
  return (
    typeof sender?.url === 'string' &&
    sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
  );
}

/**
 * Content script en Debug Logs (home Lightning o iframe Classic).
 * @param {chrome.runtime.MessageSender} [sender]
 */
function isDebugLogsPageSender(sender) {
  const candidates = [sender?.url, sender?.tab?.url].filter(
    (u) => typeof u === 'string' && u.length > 0
  );
  return candidates.some((u) => isApexDebugLogsInjectPage(u));
}

/**
 * @param {string | undefined} instanceUrl
 * @param {number | undefined} tabId
 */
async function resolveSavedOrgForInstance(instanceUrl, tabId) {
  const saved = await loadSavedOrgs();

  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const tabInstance = instanceUrlFromLocationUrl(tab?.url || '');
      const candidates = [tabInstance, instanceUrl].filter(Boolean);
      for (const inst of candidates) {
        for (const org of Object.values(saved)) {
          if (instanceUrlsReferToSameOrg(org.instanceUrl, inst)) {
            return { ok: true, orgId: org.id, org };
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const discovered = await buildOrgFromActiveTab();
  if (discovered.ok && discovered.org && saved[discovered.org.id]) {
    return { ok: true, orgId: discovered.org.id, org: saved[discovered.org.id] };
  }

  if (!instanceUrl) return { ok: false, reason: 'NO_ORG' };
  for (const org of Object.values(saved)) {
    if (instanceUrlsReferToSameOrg(org.instanceUrl, instanceUrl)) {
      return { ok: true, orgId: org.id, org };
    }
  }
  return { ok: false, reason: 'ORG_NOT_SAVED' };
}

/**
 * @param {object} message
 * @param {chrome.runtime.MessageSender} [sender]
 */
export async function handleSfInjectMessage(message, sender) {
  switch (message?.type) {
    case 'sfInject:getSettings': {
      await loadSfInjectSettings();
      const settings = getSfInjectSettingsSnapshot();
      const lang = await loadLang();
      return { ok: true, settings, lang };
    }
    case 'sfInject:saveSettings': {
      // Nunca permitir que una página web (content script) cambie ajustes.
      if (!isExtensionUiSender(sender)) {
        return { ok: false, reason: 'FORBIDDEN' };
      }
      const settings = await saveSfInjectSettings(message.settings || {});
      return { ok: true, settings };
    }
    case 'sfInject:resolveActiveOrg': {
      if (!isExtensionUiSender(sender) && !isDebugLogsPageSender(sender)) {
        return { ok: false, reason: 'FORBIDDEN' };
      }
      return resolveSavedOrgForInstance(message.instanceUrl, sender?.tab?.id);
    }
    case 'sfInject:listDebugLogs': {
      if (!isDebugLogsPageSender(sender)) {
        return { ok: false, reason: 'FORBIDDEN' };
      }
      const { orgId, hours = 48, limit = 200 } = message;
      const saved = await loadSavedOrgs();
      const org = saved[orgId];
      if (!org) return { ok: false, reason: 'ORG_NOT_SAVED' };
      const sid = await resolveSidForOrg(org);
      if (!sid) return { ok: false, reason: 'NO_SID' };
      try {
        const hrs = Math.max(1, Math.min(168, Number(hours) || 48));
        const lim = Math.max(10, Math.min(200, Number(limit) || 200));
        const until = new Date().toISOString();
        const since = new Date(Date.now() - hrs * 3600 * 1000).toISOString();
        const rows =
          (await queryApexLogsInWindow(org.instanceUrl, sid, org.apiVersion, since, until, {
            limit: lim
          })) || [];
        const sorted = [...rows].reverse();
        return {
          ok: true,
          logs: sorted.map((r) => ({
            id: String(r.Id || '').slice(0, 15),
            startTime: r.StartTime,
            operation: r.Operation,
            userName: r.LogUser?.Name || ''
          }))
        };
      } catch (e) {
        return { ok: false, error: e?.message || String(e) };
      }
    }
    case 'sfInject:openApexLog': {
      if (!isDebugLogsPageSender(sender)) {
        return { ok: false, reason: 'FORBIDDEN' };
      }
      const logId = normalizeApexLogId(message.logId);
      if (!logId) return { ok: false, error: 'Invalid logId' };
      const { orgId } = message;
      if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), 'debugLogOpenViewer')) {
        return { ok: false, reason: 'DISABLED' };
      }
      const saved = await loadSavedOrgs();
      const org = saved[orgId];
      if (!org) return { ok: false, reason: 'ORG_NOT_SAVED' };
      const sid = await resolveSidForOrg(org);
      if (!sid) return { ok: false, reason: 'NO_SID' };
      try {
        const body = await fetchApexLogBody(org.instanceUrl, sid, org.apiVersion, logId);
        const stagedId = stageApexViewerPayload(`Apex Log · ${logId}`, String(body || ''), {
          downloadFileName: `${sanitizeLogFileName(logId)}.log`,
          defaultTab: 'summary',
          orgId,
          instanceUrl: org.instanceUrl,
          logId
        });
        const viewerUrl = chrome.runtime.getURL(
          `code/apex-log-viewer.html?staged=${encodeURIComponent(stagedId)}`
        );
        const tabOpts = { url: viewerUrl, active: true };
        if (sender?.tab?.id != null) {
          tabOpts.openerTabId = sender.tab.id;
          if (sender.tab.index != null) tabOpts.index = sender.tab.index + 1;
        }
        await chrome.tabs.create(tabOpts);
        return { ok: true, stagedId, opened: true };
      } catch (e) {
        return { ok: false, error: e?.message || String(e) };
      }
    }
    default:
      return null;
  }
}

/** @param {string | undefined} type */
export function isSfInjectMessageType(type) {
  return typeof type === 'string' && type.startsWith('sfInject:');
}
