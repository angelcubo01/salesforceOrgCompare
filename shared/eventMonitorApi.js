import { restRequestWithSid } from './salesforceApi.js';

/** @typedef {'standardPlatformEvent' | 'platformEvent' | 'customChannel' | 'changeEvent' | 'realTimeEvent'} EventChannelType */

export const EVENT_CHANNEL_TYPES = Object.freeze([
  { value: 'standardPlatformEvent', prefix: '/event/' },
  { value: 'platformEvent', prefix: '/event/' },
  { value: 'customChannel', prefix: '/event/' },
  { value: 'changeEvent', prefix: '/data/' },
  { value: 'realTimeEvent', prefix: '/event/' }
]);

/**
 * @param {EventChannelType} channelType
 * @param {string} channelName
 * @param {string} [customChannelPath]
 */
export function buildChannelPath(channelType, channelName, customChannelPath) {
  const custom = String(customChannelPath || '').trim();
  if (custom) return custom.startsWith('/') ? custom : `/${custom}`;
  const name = String(channelName || '').trim();
  if (!name) return '';
  const meta = EVENT_CHANNEL_TYPES.find((t) => t.value === channelType);
  if (!meta) return '';
  return `${meta.prefix}${name}`;
}

/**
 * @param {string} instanceUrl
 * @param {string} apiVersion
 */
export function buildCometdUrl(instanceUrl, apiVersion) {
  const base = String(instanceUrl || '').replace(/\/$/, '');
  const ver = String(apiVersion || '59.0').replace(/^v/i, '');
  return `${base}/cometd/${ver}`;
}

/**
 * @param {Record<string, unknown>} rec
 */
function normalizeChannel(rec, channelType) {
  const name =
    String(rec?.QualifiedApiName || rec?.FullName || rec?.SelectedEntity || rec?.EntityName || rec?.name || '');
  let label =
    String(rec?.Label || rec?.MasterLabel || rec?.EntityName || name);
  if (channelType === 'changeEvent' && rec?.SelectedEntity) {
    label = String(rec.SelectedEntity).replace(/([A-Z])/g, ' $1').replace(/__/g, '__c').trim();
  }
  return { name, label: label || name };
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {EventChannelType} channelType
 */
export async function listEventChannels(instanceUrl, sid, apiVersion, channelType) {
  const ver = String(apiVersion || '59.0').replace(/^v/i, '');
  /** @type {{ name: string, label: string }[]} */
  const channels = [];

  if (channelType === 'changeEvent') {
    channels.push({ name: 'ChangeEvents', label: 'All Change Events' });
  }

  /** @type {string | null} */
  let query = null;
  if (channelType === 'standardPlatformEvent') {
    query =
      "SELECT Label, QualifiedApiName FROM EntityDefinition WHERE IsCustomizable = FALSE AND IsEverCreatable = TRUE AND QualifiedApiName LIKE '%Event' AND (NOT QualifiedApiName LIKE '%ChangeEvent') ORDER BY Label ASC LIMIT 200";
  } else if (channelType === 'platformEvent') {
    query =
      "SELECT QualifiedApiName, Label FROM EntityDefinition WHERE IsCustomizable = TRUE AND KeyPrefix LIKE 'e%' ORDER BY Label ASC";
  } else if (channelType === 'customChannel') {
    query = 'SELECT FullName, MasterLabel FROM PlatformEventChannel ORDER BY DeveloperName';
  } else if (channelType === 'changeEvent') {
    query =
      "SELECT MasterLabel, SelectedEntity FROM PlatformEventChannelMember WHERE EventChannel = 'ChangeEvents' ORDER BY MasterLabel";
  } else if (channelType === 'realTimeEvent') {
    query = 'SELECT EntityName FROM RealTimeEvent WHERE IsEnabled = true ORDER BY EntityName';
  }

  if (!query) return channels;

  const path = `/services/data/v${ver}/tooling/query/?q=${encodeURIComponent(query)}`;
  const res = await restRequestWithSid(instanceUrl, sid, 'GET', path);
  if (!res.ok) {
    throw new Error(
      res.json && typeof res.json === 'object' && Array.isArray(res.json)
        ? res.json.map((e) => e.message).join('; ')
        : res.text || `Tooling query failed (${res.status})`
    );
  }
  const records = Array.isArray(res.json?.records) ? res.json.records : [];
  for (const rec of records) {
    const ch = normalizeChannel(rec, channelType);
    if (ch.name) channels.push(ch);
  }
  return channels;
}

/**
 * Añade ext.replay a mensajes subscribe (Salesforce Replay Extension).
 * @param {Record<string, unknown>} message
 * @param {string} channelPath
 * @param {number} replayId
 */
export function applyReplayExtension(message, channelPath, replayId) {
  if (message.channel !== '/meta/subscribe') return message;
  const replay = parseInt(String(replayId), 10);
  const ext = { ...(message.ext && typeof message.ext === 'object' ? message.ext : {}) };
  ext.replay = { [channelPath]: replay };
  return { ...message, ext };
}
