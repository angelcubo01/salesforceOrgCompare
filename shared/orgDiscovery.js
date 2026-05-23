/**
 * Detección de contexto Salesforce en la pestaña activa (cookies sid, URL de instancia).
 * Pensado para extensiones MV3 sin content scripts obligatorios.
 */

import { hostnameMatchesSfCloud } from './sfDomains.js';

function toMyDomainRoot(host) {
  if (host.endsWith('.lightning.force.com')) {
    const prefix = host.replace('.lightning.force.com', '');
    return `https://${prefix}.my.salesforce.com`;
  }
  if (host.endsWith('.salesforce-setup.com')) {
    const prefix = host.replace('.salesforce-setup.com', '');
    if (prefix.endsWith('.my')) {
      return `https://${prefix}.salesforce.com`;
    }
    return `https://${prefix}.my.salesforce.com`;
  }
  return `https://${host}`;
}

async function cookieValueForHost(host, cookieNames, partitionOrigin) {
  for (const cookieName of cookieNames) {
    const byUrl = await chrome.cookies.getAll({ url: `https://${host}/`, name: cookieName });
    if (byUrl?.length) {
      const pick = byUrl.find((c) => c.hostOnly) || byUrl[0];
      return pick.value;
    }
  }
  if (partitionOrigin) {
    for (const cookieName of cookieNames) {
      try {
        const part = await chrome.cookies.getAll({
          url: `https://${host}/`,
          name: cookieName,
          partitionKey: { topLevelSite: partitionOrigin }
        });
        if (part?.length) {
          const pick = part.find((c) => c.hostOnly) || part[0];
          return pick.value;
        }
      } catch {}
    }
  }
  for (const cookieName of cookieNames) {
    const dom = await chrome.cookies.getAll({ domain: host, name: cookieName });
    if (dom?.length) {
      const pick = dom.find((c) => c.hostOnly) || dom[0];
      return pick.value;
    }
  }
  for (const cookieName of cookieNames) {
    const dotted = host.startsWith('.') ? host : `.${host}`;
    const dom2 = await chrome.cookies.getAll({ domain: dotted, name: cookieName });
    if (dom2?.length) {
      const pick = dom2.find((c) => c.hostOnly) || dom2[0];
      return pick.value;
    }
  }
  if (partitionOrigin) {
    for (const cookieName of cookieNames) {
      try {
        const dom = await chrome.cookies.getAll({
          domain: host,
          name: cookieName,
          partitionKey: { topLevelSite: partitionOrigin }
        });
        if (dom?.length) {
          const pick = dom.find((c) => c.hostOnly) || dom[0];
          return pick.value;
        }
      } catch {}
    }
    for (const cookieName of cookieNames) {
      try {
        const dotted = host.startsWith('.') ? host : `.${host}`;
        const dom2 = await chrome.cookies.getAll({
          domain: dotted,
          name: cookieName,
          partitionKey: { topLevelSite: partitionOrigin }
        });
        if (dom2?.length) {
          const pick = dom2.find((c) => c.hostOnly) || dom2[0];
          return pick.value;
        }
      } catch {}
    }
  }
  return undefined;
}

const SID_NAMES = ['__Host-sid', 'sid', 'sid_Client'];

async function firstSidAmongHosts(hostList, partitionOrigin) {
  for (const h of hostList) {
    const sid = await cookieValueForHost(h, SID_NAMES, partitionOrigin);
    if (sid) return { sid, host: h };
  }
  return undefined;
}

export async function discoverActiveTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.url) return { ok: false, reason: 'NO_ACTIVE_TAB' };
  let parsed;
  try {
    parsed = new URL(tab.url);
  } catch {
    return { ok: false, reason: 'INVALID_URL' };
  }
  if (!hostnameMatchesSfCloud(parsed.hostname)) {
    return { ok: false, reason: 'NOT_SF_HOST' };
  }

  const instanceUrl = toMyDomainRoot(parsed.hostname);
  let instanceHost;
  try {
    instanceHost = new URL(instanceUrl).hostname;
  } catch {
    instanceHost = parsed.hostname;
  }

  let apexHost = parsed.hostname;
  if (parsed.hostname.endsWith('.lightning.force.com')) {
    apexHost = `${parsed.hostname.replace('.lightning.force.com', '')}.salesforce.com`;
  } else if (parsed.hostname.endsWith('.my.salesforce.com')) {
    apexHost = `${parsed.hostname.replace('.my.salesforce.com', '')}.salesforce.com`;
  } else if (parsed.hostname.endsWith('.salesforce-setup.com')) {
    apexHost = `${parsed.hostname.replace('.salesforce-setup.com', '')}.salesforce.com`;
  }

  const lightningTop = 'lightning.force.com';
  const hostCandidates = Array.from(
    new Set([parsed.hostname, instanceHost, apexHost, lightningTop])
  );
  const siteOrigin = `${parsed.protocol}//${parsed.hostname}`;
  const sidHit = await firstSidAmongHosts(hostCandidates, siteOrigin);

  return {
    ok: true,
    cookieDomain: sidHit?.host || parsed.hostname,
    instanceUrl,
    sid: sidHit?.sid,
    hostsToTry: hostCandidates,
    topLevelSiteOrigin: siteOrigin
  };
}

export async function getSidForCookieDomain(cookieDomain, topLevelSiteOrigin) {
  return cookieValueForHost(cookieDomain, SID_NAMES, topLevelSiteOrigin);
}

/** Comprueba si dos URLs de instancia apuntan a la misma org (my domain / lightning). */
export function instanceUrlsReferToSameOrg(a, b) {
  if (!a || !b) return false;
  try {
    const ha = new URL(a).hostname;
    const hb = new URL(b).hostname;
    if (ha === hb) return true;
    return new URL(toMyDomainRoot(ha)).hostname === new URL(toMyDomainRoot(hb)).hostname;
  } catch {
    return false;
  }
}

/** Hostnames donde buscar la cookie `sid` para una org guardada. */
export function buildHostCandidatesForOrg(org) {
  const hosts = [];
  const add = (h) => {
    if (!h || typeof h !== 'string') return;
    if (!hosts.includes(h)) hosts.push(h);
  };
  add(org?.cookieDomain);
  try {
    const instHost = new URL(org.instanceUrl).hostname;
    add(instHost);
    if (instHost.endsWith('.my.salesforce.com')) {
      const prefix = instHost.replace('.my.salesforce.com', '');
      add(`${prefix}.lightning.force.com`);
      add(`${prefix}.salesforce.com`);
    } else if (instHost.endsWith('.lightning.force.com')) {
      const prefix = instHost.replace('.lightning.force.com', '');
      add(`${prefix}.my.salesforce.com`);
      add(`${prefix}.salesforce.com`);
    } else if (instHost.endsWith('.salesforce-setup.com')) {
      const prefix = instHost.replace('.salesforce-setup.com', '');
      add(`${prefix}.my.salesforce.com`);
      add(`${prefix}.salesforce.com`);
    }
  } catch {}
  return hosts;
}

/** Orígenes top-level de pestañas SF abiertas para la misma instancia (cookies particionadas). */
export async function collectPartitionOriginsForInstance(instanceUrl) {
  const origins = new Set();
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab?.url) continue;
      let parsed;
      try {
        parsed = new URL(tab.url);
      } catch {
        continue;
      }
      if (!hostnameMatchesSfCloud(parsed.hostname)) continue;
      const tabInstance = toMyDomainRoot(parsed.hostname);
      if (!instanceUrlsReferToSameOrg(instanceUrl, tabInstance)) continue;
      origins.add(`${parsed.protocol}//${parsed.hostname}`);
    }
  } catch {}
  return [...origins];
}

/**
 * Resuelve SID para una org guardada: varios hosts, id de org, cookies particionadas en pestañas abiertas.
 * @param {object} org
 * @param {(orgId: string) => Promise<string>} [getSidByOrgId]
 */
export async function resolveSidForSavedOrg(org, getSidByOrgId) {
  if (!org) return '';

  const hosts = buildHostCandidatesForOrg(org);

  let hit = await firstSidAmongHosts(hosts, undefined);
  if (hit?.sid) return hit.sid;

  if (getSidByOrgId) {
    const byId = await getSidByOrgId(org.id);
    if (byId) return byId;
  }

  const partitions = await collectPartitionOriginsForInstance(org.instanceUrl);
  for (const origin of partitions) {
    hit = await firstSidAmongHosts(hosts, origin);
    if (hit?.sid) return hit.sid;
  }

  try {
    const ctx = await discoverActiveTabContext();
    if (ctx.ok && ctx.sid && instanceUrlsReferToSameOrg(ctx.instanceUrl, org.instanceUrl)) {
      return ctx.sid;
    }
  } catch {}

  return '';
}
