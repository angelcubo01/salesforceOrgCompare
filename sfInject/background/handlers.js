/**
 * Handlers background para integración UI en Salesforce (sfInject:*).
 */
import {
  extendUserDebugTraceFlag,
  fetchApexLogBody,
  queryApexLogsInWindow,
  queryUserDebugTraceFlags,
  searchIndex
} from '../../shared/salesforceApi.js';
import { fetchDeployDetail } from '../../shared/deployStatusApi.js';
import { fetchApexClassSource } from '../../shared/apexClassSource.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { instanceUrlsReferToSameOrg } from '../../shared/orgDiscovery.js';
import { loadLang } from '../../shared/i18n.js';
import {
  getSfInjectSettingsSnapshot,
  isSfInjectIntegrationEnabled,
  loadSfInjectSettings,
  saveSfInjectPrefs,
  saveSfInjectSettings
} from '../lib/settings.js';
import { normalizeTraceFlagId } from '../content/matchers/traceFlagIds.js';
import { stageApexViewerPayload } from '../../background/apexViewerStaging.js';
import { buildOrgFromActiveTab, checkOrgAuthStatus, getOrderedSavedOrgs, loadSavedOrgs, resolveSidForOrg } from '../../background/orgHelpers.js';
import { instanceUrlFromLocationUrl } from '../lib/instanceUrl.js';
import { isApexDebugLogsInjectPage, normalizeApexLogId } from '../content/matchers/debugLogPages.js';
import { isDeployStatusDetailInjectPage, isDeployStatusInjectPage } from '../content/matchers/deployStatusPages.js';
import { isQuickLinksSalesforcePage } from '../content/matchers/quickLinksPages.js';
import { buildSfocQuickLinkUrl } from '../lib/quickLinkNavigation.js';
import { RECORD_ID_RE, canEditRecordField } from '../../shared/recordViewerCore.js';
import { patchRecordViewerRecords, resolveRecordViewerTarget } from '../../shared/recordViewerApi.js';
import {
  RECORD_VIEWER_QUICK_ACTIONS_KEY,
  groupRecordViewerQuickActionUpdates,
  normalizeRecordViewerQuickActions,
  recordViewerQuickActionsFor
} from '../../shared/recordViewerQuickActions.js';
import { assertOrgWriteAllowed, recordLocalAudit } from '../../background/orgWriteGuard.js';

const RECORD_VIEWER_REQUEST_PREFIX = 'sfoc_record_viewer_request:';
const RECORD_VIEWER_REQUEST_TTL_MS = 10 * 60 * 1000;

function validRecordViewerId(value) {
  const id = String(value || '').trim();
  return RECORD_ID_RE.test(id) ? id : '';
}

async function resolveRecordQuickActionContext(message, sender) {
  const recordId = validRecordViewerId(message?.recordId);
  const requestedOrgId = String(message?.orgId || '').trim();
  if (!recordId || !requestedOrgId) return { ok: false, reason: 'INVALID_REQUEST' };
  const resolved = await resolveSavedOrgForInstance(undefined, sender?.tab?.id);
  if (!resolved.ok || resolved.orgId !== requestedOrgId || !resolved.org) return { ok: false, reason: 'ORG_NOT_SAVED' };
  const sid = await resolveSidForOrg(resolved.org);
  if (!sid) return { ok: false, reason: 'NO_SID' };
  const root = await resolveRecordViewerTarget(resolved.org.instanceUrl, sid, resolved.org.apiVersion, recordId);
  const stored = await chrome.storage.local.get(RECORD_VIEWER_QUICK_ACTIONS_KEY);
  const actions = recordViewerQuickActionsFor(
    normalizeRecordViewerQuickActions(stored?.[RECORD_VIEWER_QUICK_ACTIONS_KEY]),
    resolved.orgId,
    root.objectApiName
  );
  return { ok: true, org: resolved.org, orgId: resolved.orgId, sid, recordId, root, actions };
}

async function executeRecordQuickAction(context, action) {
  const writeGuard = await assertOrgWriteAllowed(context.org, context.sid, { action: 'dml_execute' });
  if (!writeGuard.ok) return { ok: false, reason: writeGuard.reason || 'WRITE_NOT_ALLOWED' };
  const requestedUpdates = groupRecordViewerQuickActionUpdates(action.operations);
  if (!requestedUpdates.length) return { ok: false, reason: 'INVALID_ACTION' };
  const validatedUpdates = [];
  const seenTargets = new Set();
  for (const requested of requestedUpdates) {
    const path = Array.isArray(requested.path) ? requested.path : [];
    const current = path.length
      ? await resolveRecordViewerTarget(context.org.instanceUrl, context.sid, context.org.apiVersion, context.recordId, path)
      : context.root;
    if (!current.record?.Id || seenTargets.has(current.record.Id)) return { ok: false, reason: 'DUPLICATE_TARGET' };
    seenTargets.add(current.record.Id);
    const allowed = new Set();
    for (const field of current.describe?.fields || []) {
      const decision = canEditRecordField({
        objectPermissions: current.objectPermissions,
        recordAccess: current.recordAccess,
        field,
        orgReadOnly: false,
        writePolicyAllowed: true
      });
      if (decision.editable) allowed.add(field.name);
    }
    const fields = requested.fields && typeof requested.fields === 'object' ? requested.fields : {};
    const safePatch = Object.fromEntries(Object.entries(fields).filter(([name]) => allowed.has(name)));
    if (!Object.keys(safePatch).length || Object.keys(safePatch).length !== Object.keys(fields).length) {
      return { ok: false, reason: 'FIELD_NOT_EDITABLE' };
    }
    validatedUpdates.push({
      path,
      objectApiName: current.objectApiName,
      recordId: current.record.Id,
      fields: safePatch,
      lastModifiedDate: current.record?.LastModifiedDate
    });
  }
  const result = await patchRecordViewerRecords(context.org.instanceUrl, context.sid, context.org.apiVersion, validatedUpdates);
  if (!result.ok) return { ok: false, reason: result.status === 412 ? 'CONCURRENT_UPDATE' : 'SAVE_FAILED' };
  await recordLocalAudit({
    action: 'dml_execute', orgId: String(context.orgId),
    detail: `recordQuickAction:${action.id}:${validatedUpdates.map((item) => item.objectApiName).join(',')}:${validatedUpdates.length}`
  });
  return { ok: true };
}

async function stageRecordViewerRequest(orgId, recordId) {
  const stored = await chrome.storage.session.get(null);
  const now = Date.now();
  const stale = [];
  for (const [key, value] of Object.entries(stored)) {
    if (!key.startsWith(RECORD_VIEWER_REQUEST_PREFIX)) continue;
    if (!value || now - Number(value.createdAt || 0) > RECORD_VIEWER_REQUEST_TTL_MS) { stale.push(key); continue; }
    if (value.orgId === orgId && value.recordId === recordId) return key.slice(RECORD_VIEWER_REQUEST_PREFIX.length);
  }
  if (stale.length) await chrome.storage.session.remove(stale);
  const requestId = crypto.randomUUID();
  await chrome.storage.session.set({
    [`${RECORD_VIEWER_REQUEST_PREFIX}${requestId}`]: { orgId, recordId, createdAt: Date.now() }
  });
  return requestId;
}

async function openRecordViewerTab(sender, org, recordId, quickActionId = '') {
  const url = new URL(chrome.runtime.getURL('code/record-viewer.html'));
  // Solo identificadores no sensibles: la página resuelve la sesión en background.
  url.searchParams.set('orgId', String(org.id));
  url.searchParams.set('instance', new URL(String(org.instanceUrl)).origin);
  url.searchParams.set('recordId', recordId);
  if (quickActionId) url.searchParams.set('quickAction', quickActionId);
  const tabs = await chrome.tabs.query({ url: `${chrome.runtime.getURL('code/record-viewer.html')}*` });
  const existing = tabs.find((tab) => typeof tab.url === 'string' && tab.url === url.href);
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true }).catch(() => {});
    return;
  }
  const options = { url: url.href, active: true };
  if (sender?.tab?.id != null) { options.openerTabId = sender.tab.id; if (sender.tab.index != null) options.index = sender.tab.index + 1; }
  await chrome.tabs.create(options);
}
const COMMAND_PALETTE_FILE_TYPE_LABELS = Object.freeze({
  ApexClass: 'Apex Class',
  ApexTrigger: 'Apex Trigger',
  ApexPage: 'Visualforce Page',
  ApexComponent: 'Visualforce Component',
  LWC: 'Lightning Web Component',
  Aura: 'Aura Component',
  PermissionSet: 'Permission Set',
  Profile: 'Profile',
  FlexiPage: 'Lightning Page'
});

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

/** Content script de Setup > Deployment Status o de su iframe Visualforce. */
export function isDeployStatusPageSender(sender) {
  const candidates = [sender?.url, sender?.tab?.url].filter(
    (u) => typeof u === 'string' && u.length > 0
  );
  return candidates.some((u) => isDeployStatusInjectPage(u) || isDeployStatusDetailInjectPage(u));
}

function isDeployStatusDetailPageSender(sender) {
  const candidates = [sender?.url, sender?.tab?.url].filter((u) => typeof u === 'string' && u.length > 0);
  return candidates.some((u) => isDeployStatusDetailInjectPage(u));
}

/** Content script de Quick links en cualquier página Salesforce. */
function isQuickLinksPageSender(sender) {
  const candidates = [sender?.url, sender?.tab?.url].filter((u) => typeof u === 'string' && u.length > 0);
  return candidates.some((u) => isQuickLinksSalesforcePage(u));
}

/** La paleta se muestra en el mismo alcance global Salesforce que Quick links. */
function isSetupCommandPalettePageSender(sender) {
  return isQuickLinksPageSender(sender);
}

function commandPaletteMetadataEntries(raw) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(raw) ? raw : []) {
    const type = String(item?.artifactType || item?.type || '').trim();
    const typeLabel = COMMAND_PALETTE_FILE_TYPE_LABELS[type];
    const bundle = type === 'LWC' || type === 'Aura';
    const key = String(bundle ? item?.developerName : item?.name || '').trim().slice(0, 512);
    if (!typeLabel || !key) continue;
    const unique = `${type}:${key}`;
    if (seen.has(unique)) continue;
    seen.add(unique);
    out.push({
      type, key, typeLabel, label: key,
      ...(bundle ? { bundle: true, bundleId: String(item?.id || '').trim().slice(0, 128) } : {})
    });
  }
  return out;
}

function commandPaletteScriptEntries(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).flatMap((script) => {
    const id = String(script?.id || '').trim().slice(0, 128);
    const name = String(script?.name || '').trim().slice(0, 160);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: name || 'script' }];
  }).slice(0, 100);
}

async function openInSenderTab(sender, url, openInNewTab = false) {
  if (openInNewTab) {
    const options = { url, active: true };
    if (sender?.tab?.id != null) {
      options.openerTabId = sender.tab.id;
      if (sender.tab.index != null) options.index = sender.tab.index + 1;
    }
    await chrome.tabs.create(options);
  } else if (sender?.tab?.id != null) {
    await chrome.tabs.update(sender.tab.id, { url });
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}

/** @param {unknown} value */
export function normalizeDeployStatusAsyncId(value) {
  const m = String(value || '').match(/\b(0Af[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)\b/);
  return m ? m[1] : null;
}

/** @param {unknown} value */
export function normalizeApexClassId(value) {
  const m = String(value || '').match(/\b(01p[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)\b/);
  return m ? m[1] : null;
}

/** @param {unknown} value */
export function normalizeApexClassName(value) {
  const name = String(value || '').trim();
  return /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) ? name : null;
}

/** @param {unknown} value */
export function normalizeInitialLine(value) {
  if (value == null || value === '') return undefined;
  const line = Number(value);
  return Number.isSafeInteger(line) && line > 0 && line <= 1000000 ? line : null;
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
    case 'sfInject:savePrefs': {
      // Preferencias de UI inyectada: solo desde Debug Logs (no toggles master).
      if (!isDebugLogsPageSender(sender)) {
        return { ok: false, reason: 'FORBIDDEN' };
      }
      await loadSfInjectSettings();
      const settings = await saveSfInjectPrefs(message.prefs || {});
      return { ok: true, settings };
    }
    case 'sfInject:listTraceFlags': {
      if (!isDebugLogsPageSender(sender)) {
        return { ok: false, reason: 'FORBIDDEN' };
      }
      await loadSfInjectSettings();
      if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), 'userTraceFlagsEnhance')) {
        return { ok: false, reason: 'DISABLED' };
      }
      const { orgId } = message;
      const saved = await loadSavedOrgs();
      const org = saved[orgId];
      if (!org) return { ok: false, reason: 'ORG_NOT_SAVED' };
      const sid = await resolveSidForOrg(org);
      if (!sid) return { ok: false, reason: 'NO_SID' };
      try {
        const traces = await queryUserDebugTraceFlags(org.instanceUrl, sid, org.apiVersion);
        return { ok: true, traces };
      } catch (e) {
        return { ok: false, error: e?.message || String(e) };
      }
    }
    case 'sfInject:extendTraceFlag': {
      if (!isDebugLogsPageSender(sender)) {
        return { ok: false, reason: 'FORBIDDEN' };
      }
      await loadSfInjectSettings();
      if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), 'userTraceFlagsEnhance')) {
        return { ok: false, reason: 'DISABLED' };
      }
      const traceFlagId = normalizeTraceFlagId(message.traceFlagId);
      if (!traceFlagId) return { ok: false, error: 'Invalid traceFlagId' };
      const { orgId } = message;
      const saved = await loadSavedOrgs();
      const org = saved[orgId];
      if (!org) return { ok: false, reason: 'ORG_NOT_SAVED' };
      const sid = await resolveSidForOrg(org);
      if (!sid) return { ok: false, reason: 'NO_SID' };
      try {
        const result = await extendUserDebugTraceFlag(org.instanceUrl, sid, org.apiVersion, {
          traceFlagId,
          allowReactivate: !!message.allowReactivate
        });
        return { ok: true, ...result };
      } catch (e) {
        return { ok: false, error: e?.message || String(e) };
      }
    }
    case 'sfInject:resolveActiveOrg': {
      if (
        !isExtensionUiSender(sender) &&
        !isDebugLogsPageSender(sender) &&
        !isDeployStatusPageSender(sender) &&
        !isQuickLinksPageSender(sender)
      ) {
        return { ok: false, reason: 'FORBIDDEN' };
      }
      return resolveSavedOrgForInstance(message.instanceUrl, sender?.tab?.id);
    }
    case 'sfInject:openQuickLink': {
      if (!isQuickLinksPageSender(sender)) return { ok: false, reason: 'FORBIDDEN' };
      const orgId = typeof message.orgId === 'string' ? message.orgId : '';
      const openInNewTab = message.openInNewTab === true;
      const linkId = typeof message.linkId === 'string' ? message.linkId : '';
      const toolId = typeof message.toolId === 'string' ? message.toolId : '';
      if (!orgId || !linkId || !toolId) return { ok: false, reason: 'INVALID_QUICK_LINK' };
      await loadSfInjectSettings();
      const settings = getSfInjectSettingsSnapshot();
      if (!isSfInjectIntegrationEnabled(settings, 'quickLinks')) {
        return { ok: false, reason: 'DISABLED' };
      }
      const resolved = await resolveSavedOrgForInstance(undefined, sender?.tab?.id);
      if (!resolved.ok || resolved.orgId !== orgId) return { ok: false, reason: 'ORG_NOT_SAVED' };
      const configured = Array.isArray(settings.quickLinks?.[orgId]) && settings.quickLinks[orgId].some((link) => (
        link.id === linkId && link.type === 'sfoc' && link.toolId === toolId
      ));
      if (!configured) return { ok: false, reason: 'QUICK_LINK_NOT_CONFIGURED' };
      const url = buildSfocQuickLinkUrl(toolId, orgId);
      if (!url) return { ok: false, reason: 'INVALID_QUICK_LINK' };
      if (!openInNewTab && sender?.tab?.id != null) {
        await chrome.tabs.update(sender.tab.id, { url });
        return { ok: true, opened: true };
      }
      const tabOpts = { url, active: true };
      if (sender?.tab?.id != null) {
        tabOpts.openerTabId = sender.tab.id;
        if (sender.tab.index != null) tabOpts.index = sender.tab.index + 1;
      }
      await chrome.tabs.create(tabOpts);
      return { ok: true, opened: true };
    }
    case 'sfInject:listRecordQuickActions': {
      if (!isQuickLinksPageSender(sender)) return { ok: false, reason: 'FORBIDDEN' };
      await loadSfInjectSettings();
      if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), 'quickLinks')) {
        return { ok: false, reason: 'DISABLED' };
      }
      try {
        const context = await resolveRecordQuickActionContext(message, sender);
        if (!context.ok) return context;
        return {
          ok: true,
          actions: context.actions.map((action) => ({ id: action.id, name: action.name }))
        };
      } catch {
        return { ok: false, reason: 'LOAD_FAILED' };
      }
    }
    case 'sfInject:executeRecordQuickAction': {
      if (!isQuickLinksPageSender(sender)) return { ok: false, reason: 'FORBIDDEN' };
      const actionId = String(message.actionId || '').trim();
      if (!actionId) return { ok: false, reason: 'INVALID_ACTION' };
      await loadSfInjectSettings();
      if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), 'quickLinks')) {
        return { ok: false, reason: 'DISABLED' };
      }
      try {
        const context = await resolveRecordQuickActionContext(message, sender);
        if (!context.ok) return context;
        const action = context.actions.find((item) => item.id === actionId);
        if (!action) return { ok: false, reason: 'ACTION_NOT_AVAILABLE' };
        return await executeRecordQuickAction(context, action);
      } catch {
        return { ok: false, reason: 'EXECUTION_FAILED' };
      }
    }
    case 'sfInject:openRecordQuickActionConfig': {
      if (!isQuickLinksPageSender(sender)) return { ok: false, reason: 'FORBIDDEN' };
      const actionId = String(message.actionId || '').trim();
      if (!actionId) return { ok: false, reason: 'INVALID_ACTION' };
      await loadSfInjectSettings();
      if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), 'quickLinks')) {
        return { ok: false, reason: 'DISABLED' };
      }
      try {
        const context = await resolveRecordQuickActionContext(message, sender);
        if (!context.ok) return context;
        const action = context.actions.find((item) => item.id === actionId);
        if (!action) return { ok: false, reason: 'ACTION_NOT_AVAILABLE' };
        await openRecordViewerTab(sender, context.org, context.recordId, action.id);
        return { ok: true, opened: true };
      } catch {
        return { ok: false, reason: 'OPEN_FAILED' };
      }
    }
    case 'sfInject:openRecordViewer': {
      const recordId = validRecordViewerId(message.recordId);
      if (!recordId) return { ok: false, reason: 'INVALID_RECORD_ID' };
      const extensionUi = isExtensionUiSender(sender);
      if (!extensionUi && !isQuickLinksPageSender(sender)) return { ok: false, reason: 'FORBIDDEN' };
      const resolved = extensionUi && typeof message.orgId === 'string'
        ? await (async () => { const saved = await loadSavedOrgs(); const org = saved[message.orgId]; return org ? { ok: true, orgId: org.id, org } : { ok: false }; })()
        : await resolveSavedOrgForInstance(message.instanceUrl, sender?.tab?.id);
      if (!resolved.ok || !resolved.orgId) return { ok: false, reason: 'ORG_NOT_SAVED' };
      await openRecordViewerTab(sender, resolved.org, recordId);
      return { ok: true, opened: true };
    }
    case 'sfInject:openQuickLinksSettings': {
      if (!isQuickLinksPageSender(sender)) return { ok: false, reason: 'FORBIDDEN' };
      const orgId = typeof message.orgId === 'string' ? message.orgId : '';
      const resolved = await resolveSavedOrgForInstance(undefined, sender?.tab?.id);
      if (!orgId || !resolved.ok || resolved.orgId !== orgId) {
        return { ok: false, reason: 'ORG_NOT_SAVED' };
      }
      const url = new URL(chrome.runtime.getURL('popup/settings.html'));
      url.searchParams.set('quickLinks', '1');
      url.searchParams.set('orgId', orgId);
      const tabOpts = { url: url.href, active: true };
      if (sender?.tab?.id != null) {
        tabOpts.openerTabId = sender.tab.id;
        if (sender.tab.index != null) tabOpts.index = sender.tab.index + 1;
      }
      await chrome.tabs.create(tabOpts);
      return { ok: true, opened: true };
    }
    case 'sfInject:getSetupCommandPaletteFiles': {
      if (!isSetupCommandPalettePageSender(sender)) return { ok: false, reason: 'FORBIDDEN' };
      await loadSfInjectSettings();
      if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), 'setupCommandPalette')) {
        return { ok: false, reason: 'DISABLED' };
      }
      const resolved = await resolveSavedOrgForInstance(undefined, sender?.tab?.id);
      if (!resolved.ok || resolved.orgId !== message.orgId) return { ok: false, reason: 'ORG_NOT_SAVED' };
      const local = await chrome.storage.local.get('sfoc_setup_palette_anon_scripts');
      return {
        ok: true,
        scripts: commandPaletteScriptEntries(local.sfoc_setup_palette_anon_scripts)
      };
    }
    case 'sfInject:searchSetupCommandPaletteFiles': {
      if (!isSetupCommandPalettePageSender(sender)) return { ok: false, reason: 'FORBIDDEN' };
      await loadSfInjectSettings();
      if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), 'setupCommandPalette')) {
        return { ok: false, reason: 'DISABLED' };
      }
      const resolved = await resolveSavedOrgForInstance(undefined, sender?.tab?.id);
      if (!resolved.ok || resolved.orgId !== message.orgId) return { ok: false, reason: 'ORG_NOT_SAVED' };
      const query = String(message.query || '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 64);
      if (!query) return { ok: true, files: [] };
      const sid = await resolveSidForOrg(resolved.org);
      if (!sid) return { ok: false, reason: 'NO_SID' };
      const types = Object.keys(COMMAND_PALETTE_FILE_TYPE_LABELS);
      const batches = await Promise.allSettled(
        types.map((type) => searchIndex(resolved.org.instanceUrl, sid, resolved.org.apiVersion, type, query))
      );
      const files = commandPaletteMetadataEntries(
        batches.flatMap((batch) => batch.status === 'fulfilled' && Array.isArray(batch.value) ? batch.value : [])
      );
      return { ok: true, files };
    }
    case 'sfInject:openSetupCommandPaletteTarget': {
      if (!isSetupCommandPalettePageSender(sender)) return { ok: false, reason: 'FORBIDDEN' };
      await loadSfInjectSettings();
      if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), 'setupCommandPalette')) {
        return { ok: false, reason: 'DISABLED' };
      }
      const orgId = typeof message.orgId === 'string' ? message.orgId : '';
      const openInNewTab = message.openInNewTab === true;
      const resolved = await resolveSavedOrgForInstance(undefined, sender?.tab?.id);
      if (!orgId || !resolved.ok || resolved.orgId !== orgId) return { ok: false, reason: 'ORG_NOT_SAVED' };
      if (message.target === 'tool') {
        const toolId = String(message.toolId || '');
        const url = buildSfocQuickLinkUrl(toolId, orgId);
        if (!url) return { ok: false, reason: 'INVALID_TOOL' };
        // Anonymous Apex necesita montar Monaco explícitamente cuando viene de
        // la paleta, sin depender de la restauración asíncrona de la sesión.
        const targetUrl = toolId === 'AnonymousApex'
          ? (() => {
              const next = new URL(url);
              next.searchParams.set('paletteAnonymousApex', '1');
              return next.href;
            })()
          : url;
        await openInSenderTab(sender, targetUrl, openInNewTab);
        return { ok: true, opened: true };
      }
      if (message.target === 'file') {
        const type = String(message.itemType || '').trim();
        const key = String(message.itemKey || '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 512);
        if (!COMMAND_PALETTE_FILE_TYPE_LABELS[type] || !key) return { ok: false, reason: 'FILE_NOT_FOUND' };
        const item = {
          type,
          key,
          bundle: type === 'LWC' || type === 'Aura',
          bundleId: String(message.bundleId || '').trim().slice(0, 128)
        };
        const url = new URL(chrome.runtime.getURL('code/code.html'));
        url.searchParams.set('left', orgId);
        url.searchParams.set('nav', 'comparator');
        if (item.bundle) {
          url.searchParams.set('op', item.type);
          url.searchParams.set('paletteBundle', '1');
          url.searchParams.set('paletteBundleType', item.type);
          url.searchParams.set('paletteBundleName', item.key);
          if (item.bundleId) url.searchParams.set('paletteBundleId', item.bundleId);
        } else {
          url.searchParams.set('type', item.type);
          url.searchParams.set('key', item.key);
          url.searchParams.set('paletteOpen', '1');
        }
        await openInSenderTab(sender, url.href, openInNewTab);
        return { ok: true, opened: true };
      }
      if (message.target === 'script') {
        const scriptId = String(message.scriptId || '').trim().slice(0, 128);
        const local = await chrome.storage.local.get('sfoc_setup_palette_anon_scripts');
        const script = commandPaletteScriptEntries(local.sfoc_setup_palette_anon_scripts).find((entry) => entry.id === scriptId);
        if (!script) return { ok: false, reason: 'SCRIPT_NOT_FOUND' };
        const url = new URL(chrome.runtime.getURL('code/code.html'));
        url.searchParams.set('left', orgId);
        url.searchParams.set('nav', 'development');
        url.searchParams.set('op', 'AnonymousApex');
        url.searchParams.set('savedScript', script.id);
        await openInSenderTab(sender, url.href, openInNewTab);
        return { ok: true, opened: true };
      }
      return { ok: false, reason: 'INVALID_TARGET' };
    }
    case 'sfInject:getDeployStatusDetail': {
      // El SOAP de detalle queda ligado exclusivamente al listado de despliegues de la pestaña.
      const candidates = [sender?.url, sender?.tab?.url].filter((u) => typeof u === 'string' && u.length > 0);
      if (!candidates.some((u) => isDeployStatusInjectPage(u) && !isDeployStatusDetailInjectPage(u))) return { ok: false, reason: 'FORBIDDEN' };
      await loadSfInjectSettings();
      if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), 'deployStatusInlineDetails')) {
        return { ok: false, reason: 'DISABLED' };
      }
      const asyncId = normalizeDeployStatusAsyncId(message.asyncId);
      if (!asyncId) return { ok: false, reason: 'INVALID_ASYNC_ID' };
      const orgId = typeof message.orgId === 'string' ? message.orgId : '';
      const saved = await loadSavedOrgs();
      const org = saved[orgId];
      if (!org) return { ok: false, reason: 'ORG_NOT_SAVED' };
      const senderOrg = await resolveSavedOrgForInstance(undefined, sender?.tab?.id);
      if (!senderOrg.ok || senderOrg.orgId !== orgId) return { ok: false, reason: 'FORBIDDEN' };
      const sid = await resolveSidForOrg(org);
      if (!sid) return { ok: false, reason: 'NO_SID' };
      try {
        const detail = await fetchDeployDetail(org.instanceUrl, sid, org.apiVersion, asyncId);
        return detail ? { ok: true, detail } : { ok: false, reason: 'NOT_FOUND' };
      } catch (e) {
        return { ok: false, error: e?.message || 'DEPLOY_DETAIL_FAILED' };
      }
    }
    case 'sfInject:listActiveSavedOrgsForDeployDetail': {
      if (!isDeployStatusPageSender(sender)) return { ok: false, reason: 'FORBIDDEN' };
      await loadSfInjectSettings();
      const integrationId = isDeployStatusDetailPageSender(sender) ? 'deployStatusDetailSourceLinks' : 'deployStatusInlineDetails';
      if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), integrationId)) {
        return { ok: false, reason: 'DISABLED' };
      }
      const [ordered, extras] = await Promise.all([
        getOrderedSavedOrgs(),
        chrome.storage.sync.get(['orgAliases', 'orgGroups'])
      ]);
      const statuses = await Promise.all(ordered.map(async (org) => ({
        org,
        active: (await checkOrgAuthStatus(org)) === 'active'
      })));
      return {
        ok: true,
        orgs: statuses
          .filter((item) => item.active)
          .map(({ org }) => ({
            id: String(org.id),
            label: buildOrgPicklistLabel(org, { aliases: extras.orgAliases || {}, groups: extras.orgGroups || {} })
          }))
      };
    }
    case 'sfInject:openApexSource': {
      if (!isDeployStatusPageSender(sender)) return { ok: false, reason: 'FORBIDDEN' };
      await loadSfInjectSettings();
      const isDetailSender = isDeployStatusDetailPageSender(sender);
      const integrationId = isDetailSender ? 'deployStatusDetailSourceLinks' : 'deployStatusInlineDetails';
      if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), integrationId)) {
        return { ok: false, reason: 'DISABLED' };
      }
      const classId = message.classId == null || message.classId === '' ? undefined : normalizeApexClassId(message.classId);
      const className = normalizeApexClassName(message.className);
      const initialLine = normalizeInitialLine(message.initialLine);
      if ((!classId && message.classId) || !className || initialLine === null) {
        return { ok: false, reason: 'INVALID_APEX_SOURCE_REQUEST' };
      }
      const orgId = typeof message.orgId === 'string' ? message.orgId : '';
      const saved = await loadSavedOrgs();
      const org = saved[orgId];
      if (!org) return { ok: false, reason: 'ORG_NOT_SAVED' };
      // El detalle se consulta en el entorno de origen; la fuente puede abrirse
      // en cualquier entorno guardado y activo seleccionado por el usuario.
      const sid = await resolveSidForOrg(org);
      if (!sid) return { ok: false, reason: 'NO_SID' };
      try {
        const source = await fetchApexClassSource(org, sid, { classId, className });
        if (!source) return { ok: false, reason: 'NOT_FOUND' };
        const prefs = await chrome.storage.sync.get(['orgAliases', 'orgGroups']);
        const stagedId = stageApexViewerPayload(`Apex Class · ${source.name}`, source.body, {
          initialLine,
          downloadFileName: `${source.name}.cls`,
          orgId,
          orgLabel: buildOrgPicklistLabel(org, { aliases: prefs.orgAliases || {}, groups: prefs.orgGroups || {} }),
          instanceUrl: org.instanceUrl
        });
        const params = new URLSearchParams({ staged: stagedId });
        if (initialLine) params.set('line', String(initialLine));
        const tabOpts = { url: chrome.runtime.getURL(`code/apex-source-viewer.html?${params}`), active: true };
        if (sender?.tab?.id != null) {
          tabOpts.openerTabId = sender.tab.id;
          if (sender.tab.index != null) tabOpts.index = sender.tab.index + 1;
        }
        await chrome.tabs.create(tabOpts);
        return { ok: true, opened: true };
      } catch (e) {
        return { ok: false, error: e?.message || 'OPEN_APEX_SOURCE_FAILED' };
      }
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
