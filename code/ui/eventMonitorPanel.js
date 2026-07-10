import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { handleToolError } from '../../shared/reportToolError.js';
import { guardToolAction, getFeatureControlsConfig } from './featureControlsUi.js';
import { isActionDisabled } from '../../shared/featureControls.js';
import { logToolUsage } from './toolUsageLog.js';
import { EVENT_CHANNEL_TYPES, buildChannelPath } from '../../shared/eventMonitorApi.js';

/** @typedef {import('../../shared/eventMonitorApi.js').EventChannelType} EventChannelType */

const CHANNEL_CACHE_PREFIX = 'sfocEventMonitorChannels_';

/** @type {EventChannelType} */
let selectedChannelType = 'platformEvent';
let selectedChannel = '';
let customChannelPath = '';
let replayId = -1;
/** @type {{ name: string, label: string }[]} */
let channels = [];
/** @type {Array<{ receivedAt: number, channel: string, data: unknown, replayId?: number | string | null }>} */
let events = [];
let listening = false;
let pollTimer = null;
let messageListenerBound = false;

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getOrgId() {
  return document.getElementById('leftOrg')?.value || state.leftOrgId || '';
}

function setStatus(msg) {
  const el = document.getElementById('eventMonitorStatus');
  if (el) el.textContent = msg || '';
}

function channelCacheKey(orgId, channelType) {
  return `${CHANNEL_CACHE_PREFIX}${orgId}_${channelType}`;
}

function readChannelCache(orgId, channelType) {
  try {
    const raw = sessionStorage.getItem(channelCacheKey(orgId, channelType));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeChannelCache(orgId, channelType, list) {
  try {
    sessionStorage.setItem(channelCacheKey(orgId, channelType), JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function populateChannelTypeSelect() {
  const sel = document.getElementById('eventMonitorChannelType');
  if (!sel) return;
  const prev = sel.value || selectedChannelType;
  sel.innerHTML = '';
  const types = [
    { value: 'standardPlatformEvent', labelKey: 'eventMonitor.typeStandardPe' },
    { value: 'platformEvent', labelKey: 'eventMonitor.typeCustomPe' },
    { value: 'customChannel', labelKey: 'eventMonitor.typeCustomChannel' },
    { value: 'changeEvent', labelKey: 'eventMonitor.typeChangeEvent' },
    { value: 'realTimeEvent', labelKey: 'eventMonitor.typeRealTime' }
  ];
  for (const type of types) {
    const opt = document.createElement('option');
    opt.value = type.value;
    opt.textContent = t(type.labelKey);
    sel.appendChild(opt);
  }
  if (types.some((x) => x.value === prev)) sel.value = prev;
  selectedChannelType = /** @type {EventChannelType} */ (sel.value);
}

function populateChannelSelect() {
  const sel = document.getElementById('eventMonitorChannel');
  if (!sel) return;
  sel.innerHTML = '';
  if (!channels.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = t('eventMonitor.noChannels');
    sel.appendChild(opt);
    return;
  }
  for (const ch of channels) {
    if (!ch.name) continue;
    const opt = document.createElement('option');
    opt.value = ch.name;
    opt.textContent = ch.label ? `${ch.label} (${ch.name})` : ch.name;
    sel.appendChild(opt);
  }
  if (selectedChannel && channels.some((c) => c.name === selectedChannel)) {
    sel.value = selectedChannel;
  } else if (channels[0]?.name) {
    selectedChannel = channels[0].name;
    sel.value = selectedChannel;
  }
}

function renderEvents() {
  const tbody = document.getElementById('eventMonitorEventsTbody');
  const filter = (document.getElementById('eventMonitorFilter')?.value || '').trim().toLowerCase();
  if (!tbody) return;
  const filtered = filter
    ? events.filter((ev) => JSON.stringify(ev.data).toLowerCase().includes(filter))
    : events;
  tbody.innerHTML = '';
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="event-monitor-empty">${escapeHtml(t('eventMonitor.noEvents'))}</td></tr>`;
    return;
  }
  const rows = filtered.slice(-200).reverse();
  for (const ev of rows) {
    const tr = document.createElement('tr');
    const ts = new Date(ev.receivedAt).toLocaleTimeString();
    const payload = JSON.stringify(ev.data, null, 0);
    const short = payload.length > 120 ? `${payload.slice(0, 120)}…` : payload;
    tr.innerHTML = `
      <td>${escapeHtml(ts)}</td>
      <td class="event-monitor-mono">${escapeHtml(String(ev.replayId ?? '—'))}</td>
      <td class="event-monitor-mono" title="${escapeHtml(payload)}">${escapeHtml(short)}</td>
      <td><button type="button" class="query-explorer-secondary-btn" data-copy-event="${escapeHtml(payload)}">${escapeHtml(t('eventMonitor.copy'))}</button></td>`;
    tbody.appendChild(tr);
  }
  const countEl = document.getElementById('eventMonitorEventCount');
  if (countEl) countEl.textContent = t('eventMonitor.eventCount', { count: events.length });
}

function updateListeningUi() {
  const subBtn = document.getElementById('eventMonitorSubscribeBtn');
  const unsubBtn = document.getElementById('eventMonitorUnsubscribeBtn');
  const badge = document.getElementById('eventMonitorListeningBadge');
  if (subBtn) subBtn.disabled = listening;
  if (unsubBtn) unsubBtn.disabled = !listening;
  if (badge) {
    badge.textContent = listening ? t('eventMonitor.listening') : t('eventMonitor.idle');
    badge.classList.toggle('event-monitor-badge--active', listening);
  }
}

async function loadChannels(force = false) {
  const orgId = getOrgId();
  if (!orgId) {
    showToast(t('eventMonitor.pickOrg'), 'warn');
    return;
  }
  if (!force) {
    const cached = readChannelCache(orgId, selectedChannelType);
    if (cached?.length) {
      channels = cached;
      populateChannelSelect();
      return;
    }
  }
  showToastWithSpinner(t('eventMonitor.loadingChannels'));
  try {
    const res = await bg({ type: 'eventMonitor:listChannels', orgId, channelType: selectedChannelType });
    if (!res?.ok) {
      if (res?.reason === 'NO_SID') throw new Error(t('eventMonitor.noSid'));
      throw new Error(res?.error || t('eventMonitor.loadFailed'));
    }
    channels = Array.isArray(res.channels) ? res.channels.filter((c) => c?.name) : [];
    writeChannelCache(orgId, selectedChannelType, channels);
    populateChannelSelect();
    setStatus(t('eventMonitor.channelsLoaded', { count: channels.length }));
    void logToolUsage('EventMonitor', 'list_channels', { ok: true });
  } catch (e) {
    channels = [];
    populateChannelSelect();
    void handleToolError(e, { artifact_type: 'EventMonitor', phase: 'list_channels' });
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

async function syncSessionFromBackground() {
  const orgId = getOrgId();
  if (!orgId) return;
  const res = await bg({ type: 'eventMonitor:getSession', orgId });
  if (!res?.ok || !res.session) return;
  listening = !!res.session.listening;
  if (Array.isArray(res.session.events)) {
    events = res.session.events;
    renderEvents();
  }
  if (res.session.error) setStatus(res.session.error);
  updateListeningUi();
}

function stopPollTimer() {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPollTimer() {
  stopPollTimer();
  pollTimer = setInterval(() => {
    void syncSessionFromBackground();
  }, 2500);
}

function bindRuntimeListener() {
  if (messageListenerBound || typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
  messageListenerBound = true;
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'eventMonitor:event') return;
    const orgId = getOrgId();
    if (!orgId || msg.orgId !== orgId) return;
    if (getSelectedArtifactType() !== 'EventMonitor') return;
    if (msg.event) {
      events.push(msg.event);
      if (events.length > 500) events.splice(0, events.length - 500);
      renderEvents();
    }
  });
}

async function subscribe() {
  const fc = getFeatureControlsConfig();
  if (isActionDisabled(fc, 'event_monitor_subscribe')) {
    if (guardToolAction('event_monitor_subscribe')) return;
  } else if (isActionDisabled(fc, 'streaming_subscribe')) {
    if (guardToolAction('streaming_subscribe')) return;
  }
  const orgId = getOrgId();
  if (!orgId) {
    showToast(t('eventMonitor.pickOrg'), 'warn');
    return;
  }
  selectedChannel = document.getElementById('eventMonitorChannel')?.value || selectedChannel;
  customChannelPath = document.getElementById('eventMonitorCustomPath')?.value?.trim() || '';
  replayId = parseInt(document.getElementById('eventMonitorReplayId')?.value ?? '-1', 10);
  if (replayId === -2 && !window.confirm(t('eventMonitor.replayAllConfirm'))) return;

  const channelPath = buildChannelPath(selectedChannelType, selectedChannel, customChannelPath);
  if (!channelPath) {
    showToast(t('eventMonitor.pickChannel'), 'warn');
    return;
  }

  showToastWithSpinner(t('eventMonitor.subscribing'));
  try {
    const res = await bg({
      type: 'eventMonitor:subscribe',
      orgId,
      channelPath,
      replayId
    });
    if (!res?.ok) {
      if (res?.reason === 'NO_SID') throw new Error(t('eventMonitor.noSid'));
      if (res?.featureControlBlocked) throw new Error(res.error);
      throw new Error(res?.error || t('eventMonitor.subscribeFailed'));
    }
    listening = true;
    events = [];
    updateListeningUi();
    setStatus(t('eventMonitor.subscribed', { channel: channelPath }));
    startPollTimer();
    void logToolUsage('EventMonitor', 'subscribe', { ok: true });
  } catch (e) {
    void handleToolError(e, { artifact_type: 'EventMonitor', phase: 'subscribe' });
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

async function unsubscribe() {
  const orgId = getOrgId();
  if (!orgId) return;
  showToastWithSpinner(t('eventMonitor.unsubscribing'));
  try {
    await bg({ type: 'eventMonitor:unsubscribe', orgId });
    listening = false;
    stopPollTimer();
    updateListeningUi();
    setStatus(t('eventMonitor.unsubscribed'));
    void logToolUsage('EventMonitor', 'unsubscribe', { ok: true });
  } catch (e) {
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

async function clearEvents() {
  const orgId = getOrgId();
  events = [];
  renderEvents();
  if (orgId) await bg({ type: 'eventMonitor:clearEvents', orgId });
}

function onChannelTypeChange() {
  const sel = document.getElementById('eventMonitorChannelType');
  selectedChannelType = /** @type {EventChannelType} */ (sel?.value || 'platformEvent');
  const customWrap = document.getElementById('eventMonitorCustomPathWrap');
  if (customWrap) customWrap.classList.toggle('hidden', selectedChannelType !== 'customChannel');
  void loadChannels(false);
}

export function setupEventMonitorPanel() {
  bindRuntimeListener();
  populateChannelTypeSelect();

  document.getElementById('eventMonitorChannelType')?.addEventListener('change', onChannelTypeChange);
  document.getElementById('eventMonitorLoadChannelsBtn')?.addEventListener('click', () => void loadChannels(true));
  document.getElementById('eventMonitorSubscribeBtn')?.addEventListener('click', () => void subscribe());
  document.getElementById('eventMonitorUnsubscribeBtn')?.addEventListener('click', () => void unsubscribe());
  document.getElementById('eventMonitorClearEventsBtn')?.addEventListener('click', () => void clearEvents());
  document.getElementById('eventMonitorFilter')?.addEventListener('input', renderEvents);

  document.getElementById('eventMonitorPanel')?.addEventListener('click', (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest('[data-copy-event]') : null;
    if (!btn) return;
    const text = btn.getAttribute('data-copy-event') || '';
    void navigator.clipboard.writeText(text).then(() => showToast(t('eventMonitor.copied'), 'success'));
  });
}

export async function refreshEventMonitorPanel() {
  const tool = getSelectedArtifactType();
  if (tool !== 'EventMonitor') {
    if (listening) await unsubscribe();
    return;
  }
  populateChannelTypeSelect();
  onChannelTypeChange();
  await syncSessionFromBackground();
  if (listening) startPollTimer();
  else stopPollTimer();
}

export async function teardownEventMonitorPanel() {
  stopPollTimer();
  if (listening) await unsubscribe();
}

// Silence unused import lint
void EVENT_CHANNEL_TYPES;
