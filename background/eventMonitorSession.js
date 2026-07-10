import { applyReplayExtension, buildCometdUrl } from '../shared/eventMonitorApi.js';

const MAX_EVENTS = 500;
const MAX_SEEN_REPLAY_IDS = 2000;

/** @type {Map<string, SessionState>} */
const sessions = new Map();

/**
 * @typedef {object} MonitorEvent
 * @property {number} receivedAt
 * @property {string} channel
 * @property {unknown} data
 * @property {number | string | null} [replayId]
 */

/**
 * @typedef {object} SessionState
 * @property {string} orgId
 * @property {string} channelPath
 * @property {number} replayId
 * @property {boolean} listening
 * @property {string} [clientId]
 * @property {string} [error]
 * @property {MonitorEvent[]} events
 * @property {Set<string>} seenReplayIds
 * @property {AbortController} [abort]
 * @property {Promise<void> | null} loopPromise
 */

let messageCounter = 0;

function nextMsgId() {
  messageCounter += 1;
  return String(messageCounter);
}

/**
 * @param {string} orgId
 */
export function getEventMonitorSession(orgId) {
  const id = String(orgId || '');
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  return {
    orgId: s.orgId,
    channelPath: s.channelPath,
    replayId: s.replayId,
    listening: s.listening,
    error: s.error || '',
    eventCount: s.events.length,
    events: s.events.slice(-100)
  };
}

/**
 * @param {MonitorEvent} event
 * @param {string} orgId
 */
function pushEvent(orgId, event) {
  const s = sessions.get(orgId);
  if (!s) return;
  const replayKey = event.replayId != null ? String(event.replayId) : '';
  if (replayKey && s.seenReplayIds.has(replayKey)) return;
  if (replayKey) {
    s.seenReplayIds.add(replayKey);
    if (s.seenReplayIds.size > MAX_SEEN_REPLAY_IDS) {
      const first = s.seenReplayIds.values().next().value;
      if (first) s.seenReplayIds.delete(first);
    }
  }
  s.events.push(event);
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
  try {
    chrome.runtime.sendMessage({
      type: 'eventMonitor:event',
      orgId,
      event
    });
  } catch {
    /* no listeners */
  }
}

/**
 * @param {string} url
 * @param {string} sid
 * @param {unknown[]} body
 * @param {AbortSignal} signal
 */
async function cometdPost(url, sid, body, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${sid}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal
  });
  const json = await res.json();
  return Array.isArray(json) ? json : [json];
}

/**
 * @param {SessionState} session
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 */
async function pollLoop(session, instanceUrl, sid, apiVersion) {
  const url = buildCometdUrl(instanceUrl, apiVersion);
  const signal = session.abort?.signal;
  if (!signal || !session.clientId) return;

  while (session.listening && !signal.aborted) {
    try {
      const connectMsg = {
        channel: '/meta/connect',
        clientId: session.clientId,
        connectionType: 'long-polling',
        id: nextMsgId()
      };
      const replies = await cometdPost(url, sid, [connectMsg], signal);
      for (const msg of replies) {
        if (!msg || typeof msg !== 'object') continue;
        const channel = String(msg.channel || '');
        if (channel === session.channelPath && msg.data) {
          const replayId = msg.data?.event?.replayId ?? null;
          pushEvent(session.orgId, {
            receivedAt: Date.now(),
            channel,
            data: msg.data,
            replayId
          });
        } else if (channel === '/meta/connect' && msg.error) {
          session.error = String(msg.error);
          session.listening = false;
        }
      }
    } catch (e) {
      if (signal.aborted) break;
      session.error = String(e?.message || e);
      session.listening = false;
      break;
    }
  }
}

/**
 * @param {object} opts
 * @param {string} opts.orgId
 * @param {string} opts.instanceUrl
 * @param {string} opts.sid
 * @param {string} opts.apiVersion
 * @param {string} opts.channelPath
 * @param {number} opts.replayId
 */
export async function subscribeEventMonitor(opts) {
  const orgId = String(opts.orgId || '');
  const channelPath = String(opts.channelPath || '').trim();
  const replayId = parseInt(String(opts.replayId ?? -1), 10);
  if (!orgId || !channelPath) throw new Error('Missing orgId or channel');

  await unsubscribeEventMonitor(orgId);

  /** @type {SessionState} */
  const session = {
    orgId,
    channelPath,
    replayId,
    listening: false,
    events: [],
    seenReplayIds: new Set(),
    loopPromise: null,
    abort: new AbortController()
  };
  sessions.set(orgId, session);

  const url = buildCometdUrl(opts.instanceUrl, opts.apiVersion);
  const signal = session.abort.signal;

  const handshake = await cometdPost(
    url,
    opts.sid,
    [
      {
        channel: '/meta/handshake',
        version: '1.0',
        supportedConnectionTypes: ['long-polling'],
        id: nextMsgId()
      }
    ],
    signal
  );
  const hs = handshake[0];
  if (!hs?.successful || !hs.clientId) {
    sessions.delete(orgId);
    throw new Error(hs?.error || 'CometD handshake failed');
  }
  session.clientId = hs.clientId;

  await cometdPost(
    url,
    opts.sid,
    [
      {
        channel: '/meta/connect',
        clientId: session.clientId,
        connectionType: 'long-polling',
        id: nextMsgId()
      }
    ],
    signal
  );

  const subscribeMsg = applyReplayExtension(
    {
      channel: '/meta/subscribe',
      clientId: session.clientId,
      subscription: channelPath,
      id: nextMsgId()
    },
    channelPath,
    replayId
  );
  const subReplies = await cometdPost(url, opts.sid, [subscribeMsg], signal);
  const sub = subReplies[0];
  if (!sub?.successful) {
    sessions.delete(orgId);
    throw new Error(sub?.error || 'CometD subscribe failed');
  }

  session.listening = true;
  session.error = '';
  session.loopPromise = pollLoop(session, opts.instanceUrl, opts.sid, opts.apiVersion);

  return {
    listening: true,
    channelPath,
    replayId
  };
}

/**
 * @param {string} orgId
 */
export async function unsubscribeEventMonitor(orgId) {
  const id = String(orgId || '');
  const session = sessions.get(id);
  if (!session) return { ok: true };

  session.listening = false;
  session.abort?.abort();
  if (session.loopPromise) {
    try {
      await session.loopPromise;
    } catch {
      /* aborted */
    }
  }
  sessions.delete(id);
  return { ok: true };
}

/**
 * @param {string} orgId
 */
export function clearEventMonitorEvents(orgId) {
  const session = sessions.get(String(orgId || ''));
  if (!session) return;
  session.events = [];
  session.seenReplayIds.clear();
}
