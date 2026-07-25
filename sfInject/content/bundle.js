/* SFOC sfInject content script (bundled; do not edit) */
(() => {
  // sfInject/lib/strings.js
  var STRINGS = {
    es: {
      "sfInject.debugLogOpenViewer.button": "Abrir en SFOC",
      "sfInject.debugLogOpenViewer.ariaOpen": "Abrir log de depuraci\xF3n en Salesforce Org Compare",
      "sfInject.debugLogOpenViewer.errorNoSession": "Sesi\xF3n no disponible. Inicia sesi\xF3n en Salesforce.",
      "sfInject.debugLogOpenViewer.errorOpen": "No se pudo abrir el log en SFOC.",
      "sfInject.debugLogOpenViewer.errorOrgNotSaved": "Entorno no guardado en SFOC."
    },
    en: {
      "sfInject.debugLogOpenViewer.button": "Open in SFOC",
      "sfInject.debugLogOpenViewer.ariaOpen": "Open debug log in Salesforce Org Compare",
      "sfInject.debugLogOpenViewer.errorNoSession": "Session unavailable. Sign in to Salesforce.",
      "sfInject.debugLogOpenViewer.errorOpen": "Could not open log in SFOC.",
      "sfInject.debugLogOpenViewer.errorOrgNotSaved": "Org not saved in SFOC."
    }
  };
  function sfInjectT(lang, key) {
    const l = lang === "en" ? "en" : "es";
    return STRINGS[l][key] || STRINGS.es[key] || key;
  }

  // sfInject/content/matchers/debugLogPages.js
  var APEX_DEBUG_LOGS_HOME_RE = /\/lightning\/setup\/ApexDebugLogs\/home\/?$/i;
  var APEX_DEBUG_LOGS_CLASSIC_FRAME_RE = /\/setup\/ui\/listApexTraces\.apexp$/i;
  function toUrl(url) {
    if (!url) return null;
    try {
      return typeof url === "string" ? new URL(url, "https://example.com") : url;
    } catch {
      return null;
    }
  }
  function isApexDebugLogsHomePage(url) {
    const u = toUrl(url);
    return !!(u && APEX_DEBUG_LOGS_HOME_RE.test(u.pathname));
  }
  function isApexDebugLogsClassicFrame(url) {
    const u = toUrl(url);
    return !!(u && APEX_DEBUG_LOGS_CLASSIC_FRAME_RE.test(u.pathname));
  }
  function isApexDebugLogsInjectPage(url) {
    return isApexDebugLogsHomePage(url) || isApexDebugLogsClassicFrame(url);
  }
  function extractApexLogId(text) {
    const s = String(text || "");
    const q = s.match(/[?&](?:apexLogId|id|file)=(07L[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)/i);
    if (q) return q[1];
    const m = s.match(/\b(07L[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)\b/);
    return m ? m[1] : null;
  }

  // sfInject/content/bridge.js
  function sfInjectSend(message) {
    return chrome.runtime.sendMessage(message);
  }
  async function fetchSfInjectBootstrap() {
    try {
      return await sfInjectSend({ type: "sfInject:getSettings" });
    } catch {
      return { ok: false, reason: "MESSAGE_FAILED" };
    }
  }
  async function resolveActiveSavedOrg(instanceUrl) {
    try {
      return await sfInjectSend({ type: "sfInject:resolveActiveOrg", instanceUrl });
    } catch {
      return { ok: false, reason: "MESSAGE_FAILED" };
    }
  }
  async function fetchDebugLogCatalog(orgId) {
    try {
      return await sfInjectSend({ type: "sfInject:listDebugLogs", orgId, hours: 48, limit: 200 });
    } catch {
      return { ok: false, reason: "MESSAGE_FAILED" };
    }
  }
  async function openApexLogInViewer(orgId, logId) {
    try {
      return await sfInjectSend({ type: "sfInject:openApexLog", orgId, logId });
    } catch {
      return { ok: false, reason: "MESSAGE_FAILED" };
    }
  }

  // sfInject/content/injectors/dom.js
  function findInjectedForLog(doc, integrationId, subKey, logId) {
    return doc.querySelector(
      `[data-sfoc-inject="${integrationId}"][data-sfoc-key="${subKey}"][data-sfoc-log-id="${logId}"]`
    );
  }
  function createSfocActionLink(opts) {
    const doc = opts.ownerDoc || document;
    const a = doc.createElement("a");
    a.href = "#";
    const templateClass = opts.templateLink?.className?.trim();
    a.className = templateClass ? `${templateClass} sfoc-inject-link` : "link-button slds-text-link sfoc-inject-link";
    a.setAttribute("data-sfoc-inject", opts.integrationId);
    a.setAttribute("data-sfoc-key", opts.subKey);
    a.setAttribute("data-sfoc-log-id", opts.logId);
    a.setAttribute("aria-label", opts.ariaLabel);
    a.title = opts.ariaLabel;
    a.textContent = opts.label;
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      opts.onClick();
    });
    return a;
  }

  // sfInject/content/domUtils.js
  function queryAllDeep(root, selector) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    function walk(node) {
      if (!node || typeof node.querySelectorAll !== "function") return;
      try {
        for (const el of node.querySelectorAll(selector)) {
          if (seen.has(el)) continue;
          seen.add(el);
          out.push(el);
        }
      } catch {
      }
      try {
        if (node instanceof Element && node.shadowRoot) walk(node.shadowRoot);
        for (const el of node.querySelectorAll("*")) {
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      } catch {
      }
    }
    walk(root);
    return out;
  }

  // sfInject/content/injectors/debugLogOpenViewerDom.js
  var INTEGRATION_ID = "debugLogOpenViewer";
  var NATIVE_ACTION_LINK_SELECTOR = "a.link-button, a.slds-text-link, a.actionLink, button.link-button, button.slds-text-link";
  var VIEW_LABELS = /* @__PURE__ */ new Set(["view", "ver"]);
  var SECONDARY_ACTION_LABELS = /* @__PURE__ */ new Set([
    "delete",
    "analyze",
    "analyse",
    "download",
    "descargar",
    "eliminar",
    "analizar",
    "borrar"
  ]);
  function actionLinkLabel(el) {
    const text = (el.textContent || "").trim().toLowerCase();
    if (text) return text;
    const aria = (el.getAttribute("aria-label") || el.getAttribute("title") || "").trim().toLowerCase();
    return aria;
  }
  function isNativeDebugLogActionLink(link) {
    const label = actionLinkLabel(link);
    return VIEW_LABELS.has(label) || SECONDARY_ACTION_LABELS.has(label);
  }
  function findNativeActionLinksInRow(row) {
    try {
      return [...row.querySelectorAll(NATIVE_ACTION_LINK_SELECTOR)].filter(isNativeDebugLogActionLink);
    } catch {
      return queryAllDeep(row, NATIVE_ACTION_LINK_SELECTOR).filter(isNativeDebugLogActionLink);
    }
  }
  function isDebugLogActionRow(row) {
    const links = findNativeActionLinksInRow(row);
    const labels = new Set(links.map((a) => actionLinkLabel(a)));
    const hasView = [...labels].some((l) => VIEW_LABELS.has(l));
    const hasOther = [...labels].some((l) => SECONDARY_ACTION_LABELS.has(l));
    return hasView && hasOther;
  }
  function isDebugLogsTableDocument(doc) {
    if (!doc) return false;
    const title = (doc.querySelector("h1.pageType, h2.mainTitle, .pageType, .mainTitle")?.textContent || "").toLowerCase();
    if (title.includes("debug log")) return true;
    return findDebugLogActionRows(doc).length > 0;
  }
  function extractLogIdFromRow(row) {
    if (!row) return null;
    const attrCandidates = [
      row.getAttribute("data-row-key-value"),
      row.getAttribute("data-record-id"),
      row.getAttribute("data-key"),
      row.getAttribute("data-id")
    ];
    for (const raw of attrCandidates) {
      const id = extractApexLogId(String(raw || ""));
      if (id) return id.slice(0, 15);
    }
    for (const el of queryAllDeep(row, "a[href], button[onclick], [data-href], [onclick]")) {
      const href = el.getAttribute("href") || el.getAttribute("data-href") || "";
      const fromHref = extractApexLogId(href);
      if (fromHref) return fromHref.slice(0, 15);
      const onclick = el.getAttribute("onclick") || "";
      const fromOnclick = extractApexLogId(onclick);
      if (fromOnclick) return fromOnclick.slice(0, 15);
    }
    const text = row.textContent || "";
    const m = text.match(/\b(07L[a-zA-Z0-9]{12})\b/);
    return m ? m[1] : null;
  }
  function findDebugLogActionsHost(row) {
    const actionLinks = findNativeActionLinksInRow(row);
    if (!actionLinks.length) return null;
    const parent = actionLinks[0].parentElement;
    if (!parent) return null;
    if (parent.matches('td, th, [role="gridcell"], div, span')) return parent;
    return actionLinks[actionLinks.length - 1].parentElement;
  }
  function getDebugLogsScanRoot(doc) {
    const table = doc.getElementById("Apex_Trace_List:traceForm:traceTable");
    if (table) return table;
    return doc;
  }
  function findDebugLogActionRows(doc) {
    const rows = [];
    const seen = /* @__PURE__ */ new Set();
    const root = getDebugLogsScanRoot(doc);
    let candidates;
    try {
      candidates = root.querySelectorAll('tbody tr, tr.dataRow, tr[class*="dataRow"], [role="row"]');
    } catch {
      candidates = queryAllDeep(root, 'tr, [role="row"]');
    }
    for (const row of candidates) {
      if (!(row instanceof Element) || seen.has(row)) continue;
      if (row.closest('thead, [role="columnheader"]')) continue;
      if (!isDebugLogActionRow(row)) continue;
      seen.add(row);
      rows.push(row);
    }
    return rows;
  }

  // sfInject/content/injectors/debugLogRowResolver.js
  async function resolveDebugLogRowsWithIds(doc, orgId, fetchCatalog) {
    const listRows = findDebugLogActionRows(doc);
    if (!listRows.length) return [];
    const pairs = listRows.map((row) => ({
      row,
      logId: extractLogIdFromRow(row)
    }));
    const needsCatalog = pairs.some((p) => !p.logId);
    let catalog = [];
    if (needsCatalog) {
      try {
        const res = await fetchCatalog(orgId);
        if (res?.ok && Array.isArray(res.logs)) catalog = res.logs;
      } catch {
      }
    }
    return listRows.map((row, index) => {
      const fromDom = extractLogIdFromRow(row);
      const fromApi = catalog[index]?.id ? String(catalog[index].id).slice(0, 15) : null;
      const logId = fromDom || fromApi;
      return logId ? { row, logId } : null;
    }).filter(Boolean);
  }

  // sfInject/content/injectors/observer.js
  function mountDebouncedDomObserver(doc, run, opts = {}) {
    const debounceMs = opts.debounceMs ?? 300;
    let timer = null;
    let suspended = false;
    const schedule = () => {
      if (suspended) return;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (suspended || !doc.body) return;
        suspended = true;
        try {
          run();
        } finally {
          queueMicrotask(() => {
            suspended = false;
          });
        }
      }, debounceMs);
    };
    const observer = new MutationObserver(() => schedule());
    const start = () => {
      if (!doc.body) return;
      run();
      observer.observe(doc.body, { childList: true, subtree: true });
    };
    if (doc.body) {
      start();
    } else {
      doc.addEventListener("DOMContentLoaded", start, { once: true });
    }
    return () => {
      if (timer != null) clearTimeout(timer);
      observer.disconnect();
    };
  }

  // sfInject/content/injectors/debugLogOpenViewer.js
  var opening = false;
  var injectInFlight = false;
  var catalogPromise = null;
  async function handleOpenLog(ctx, logId) {
    if (opening || !ctx.orgId || !logId) return;
    opening = true;
    try {
      const res = await openApexLogInViewer(ctx.orgId, logId);
      if (!res?.ok) {
        const msg = res?.reason === "NO_SID" ? sfInjectT(ctx.lang, "sfInject.debugLogOpenViewer.errorNoSession") : res?.reason === "ORG_NOT_SAVED" ? sfInjectT(ctx.lang, "sfInject.debugLogOpenViewer.errorOrgNotSaved") : res?.error || sfInjectT(ctx.lang, "sfInject.debugLogOpenViewer.errorOpen");
        ctx.onError?.(msg);
      }
    } finally {
      opening = false;
    }
  }
  function fetchCatalogCached(orgId) {
    if (!catalogPromise) {
      catalogPromise = fetchDebugLogCatalog(orgId).then((res) => res?.ok && Array.isArray(res.logs) ? res.logs : []).catch(() => []);
    }
    return catalogPromise.then((logs) => ({ ok: true, logs: logs || [] }));
  }
  function injectRowActionLink(row, ctx, logId) {
    const subKey = "row-link";
    const ownerDoc = row.ownerDocument || document;
    if (findInjectedForLog(ownerDoc, INTEGRATION_ID, subKey, logId)) return;
    const host = findDebugLogActionsHost(row);
    if (!host) return;
    const templateLink = host.querySelector("a.actionLink, a.link-button, a.slds-text-link");
    const link = createSfocActionLink({
      ownerDoc,
      label: sfInjectT(ctx.lang, "sfInject.debugLogOpenViewer.button"),
      ariaLabel: sfInjectT(ctx.lang, "sfInject.debugLogOpenViewer.ariaOpen"),
      onClick: () => void handleOpenLog(ctx, logId),
      integrationId: INTEGRATION_ID,
      subKey,
      logId,
      templateLink: templateLink || void 0
    });
    host.appendChild(ownerDoc.createTextNode(" | "));
    host.appendChild(link);
  }
  async function injectDebugLogOpenViewer(doc, ctx) {
    if (injectInFlight) return;
    injectInFlight = true;
    try {
      const rows = await resolveDebugLogRowsWithIds(doc, ctx.orgId, fetchCatalogCached);
      for (const { row, logId } of rows) {
        injectRowActionLink(row, ctx, logId);
      }
      if (rows.length && doc.documentElement) {
        doc.documentElement.setAttribute("data-sfoc-inject-status", "active");
      }
    } finally {
      injectInFlight = false;
    }
  }
  function mountDebugLogOpenViewer(doc, ctx) {
    catalogPromise = null;
    return mountDebouncedDomObserver(
      doc,
      () => {
        void injectDebugLogOpenViewer(doc, ctx).catch(() => {
        });
      },
      { debounceMs: 400 }
    );
  }
  function isParentDebugLogsHomePage() {
    try {
      return isApexDebugLogsInjectPage(window.top.location.href);
    } catch {
      return isApexDebugLogsInjectPage(location.href);
    }
  }
  var debugLogOpenViewerIntegration = {
    id: INTEGRATION_ID,
    isParentPageActive: isParentDebugLogsHomePage,
    isFrameRelevant: isDebugLogsTableDocument,
    mount(doc, ctx) {
      return mountDebugLogOpenViewer(doc, ctx);
    },
    retryInject(doc, ctx) {
      if (findDebugLogActionRows(doc).length > 0) {
        void injectDebugLogOpenViewer(doc, ctx);
      }
    }
  };

  // sfInject/content/injectors/debugLogsTableOrderDom.js
  var INTEGRATION_ID2 = "debugLogsTableOrder";
  var TRACE_FORM_ID = "Apex_Trace_List:traceForm";
  var MONITORED_FORM_ID = "Apex_Trace_List:monitoredUsersForm";
  var ORDER_APPLIED_ATTR = "data-sfoc-debug-logs-order";
  function containsUserTraceFlags(el) {
    if (!el || typeof el.querySelector !== "function") return false;
    if (el.querySelector(`[id="${MONITORED_FORM_ID}"]`)) return true;
    for (const h2 of el.querySelectorAll("h2.mainTitle")) {
      if (/user trace flags/i.test((h2.textContent || "").trim())) return true;
    }
    return false;
  }
  function findOuterTbodyRow(el, excludeTr = null) {
    let node = el;
    while (node) {
      if (node.tagName === "TR" && node.parentElement?.tagName === "TBODY" && node !== excludeTr && containsUserTraceFlags(node)) {
        return (
          /** @type {HTMLTableRowElement} */
          node
        );
      }
      node = node.parentElement;
    }
    return null;
  }
  function isApexDebugLogsSetupDocument(doc) {
    if (!doc) return false;
    return !!(doc.getElementById(TRACE_FORM_ID) || doc.getElementById(MONITORED_FORM_ID));
  }
  function findDebugLogsSectionRow(doc) {
    const form = doc.getElementById(TRACE_FORM_ID);
    if (!form) return null;
    const tr = form.closest?.("tr") ?? null;
    if (!tr || tr.tagName !== "TR") return null;
    if (!tr.querySelector(`[id="${TRACE_FORM_ID}"]`)) return null;
    return (
      /** @type {HTMLTableRowElement} */
      tr
    );
  }
  function findUserTraceFlagsSectionRow(doc, debugTr = null) {
    const debugRow = debugTr || findDebugLogsSectionRow(doc);
    if (debugRow?.parentElement) {
      let prev = debugRow.previousElementSibling;
      while (prev) {
        if (prev.tagName === "TR" && containsUserTraceFlags(prev)) {
          return (
            /** @type {HTMLTableRowElement} */
            prev
          );
        }
        prev = prev.previousElementSibling;
      }
    }
    const form = doc.getElementById(MONITORED_FORM_ID);
    if (!form) return null;
    return findOuterTbodyRow(form, debugRow);
  }
  function isDebugLogsAboveUserTraceFlags(doc) {
    const debugTr = findDebugLogsSectionRow(doc);
    const userTr = findUserTraceFlagsSectionRow(doc, debugTr);
    if (!debugTr || !userTr || debugTr === userTr) return false;
    if (debugTr.parentElement !== userTr.parentElement) return false;
    const parent = debugTr.parentElement;
    const rows = [...parent.children].filter((child) => child.tagName === "TR");
    const debugIdx = rows.indexOf(debugTr);
    const userIdx = rows.indexOf(userTr);
    return debugIdx !== -1 && userIdx !== -1 && debugIdx < userIdx;
  }
  function reorderDebugLogsAboveUserTraceFlags(doc) {
    const debugTr = findDebugLogsSectionRow(doc);
    const userTr = findUserTraceFlagsSectionRow(doc, debugTr);
    if (!debugTr || !userTr) return { ok: false, reason: "not-found" };
    if (debugTr === userTr) return { ok: false, reason: "same-row" };
    const parent = debugTr.parentElement;
    if (!parent || parent !== userTr.parentElement) {
      return { ok: false, reason: "different-parent" };
    }
    if (isDebugLogsAboveUserTraceFlags(doc)) {
      doc.documentElement?.setAttribute(ORDER_APPLIED_ATTR, "applied");
      return { ok: true, reason: "already-ordered" };
    }
    parent.insertBefore(debugTr, userTr);
    doc.documentElement?.setAttribute(ORDER_APPLIED_ATTR, "applied");
    return { ok: true, reason: "reordered" };
  }

  // sfInject/content/injectors/debugLogsTableOrder.js
  function applyDebugLogsTableOrder(doc) {
    if (!isApexDebugLogsSetupDocument(doc)) return;
    if (isDebugLogsAboveUserTraceFlags(doc)) return;
    const result = reorderDebugLogsAboveUserTraceFlags(doc);
    if (result.ok && doc.documentElement) {
      doc.documentElement.setAttribute("data-sfoc-inject-status", "active");
    }
  }
  function mountDebugLogsTableOrder(doc) {
    return mountDebouncedDomObserver(doc, () => applyDebugLogsTableOrder(doc), { debounceMs: 250 });
  }
  function isParentDebugLogsHomePage2() {
    try {
      return isApexDebugLogsInjectPage(window.top.location.href);
    } catch {
      return isApexDebugLogsInjectPage(location.href);
    }
  }
  var debugLogsTableOrderIntegration = {
    id: INTEGRATION_ID2,
    isParentPageActive: isParentDebugLogsHomePage2,
    isFrameRelevant: isApexDebugLogsSetupDocument,
    mount(doc) {
      return mountDebugLogsTableOrder(doc);
    },
    retryInject(doc) {
      if (isApexDebugLogsSetupDocument(doc) && !isDebugLogsAboveUserTraceFlags(doc)) {
        applyDebugLogsTableOrder(doc);
      }
    }
  };

  // sfInject/content/injectors/registry.js
  var SF_INJECT_CONTENT_INTEGRATIONS = [
    debugLogOpenViewerIntegration,
    debugLogsTableOrderIntegration
  ];

  // sfInject/content/ui.js
  function setInjectStatus(status) {
    try {
      document.documentElement?.setAttribute("data-sfoc-inject-status", status);
    } catch {
    }
  }
  function showInjectToast(message, isError = false) {
    try {
      const doc = document;
      if (!doc.body) return;
      const el = doc.createElement("div");
      el.className = `sfoc-inject-toast${isError ? " sfoc-inject-toast--error" : ""}`;
      el.setAttribute("role", "status");
      el.textContent = message;
      doc.body.appendChild(el);
      setTimeout(() => el.remove(), 4e3);
    } catch {
    }
  }

  // sfInject/lib/instanceUrl.js
  function instanceUrlFromHostname(hostname) {
    const host = String(hostname || "").trim();
    if (!host) return "";
    if (host.endsWith(".lightning.force.com")) {
      const prefix = host.replace(".lightning.force.com", "");
      return `https://${prefix}.my.salesforce.com`;
    }
    if (host.endsWith(".salesforce-setup.com")) {
      const prefix = host.replace(".salesforce-setup.com", "");
      if (prefix.endsWith(".my")) return `https://${prefix}.salesforce.com`;
      return `https://${prefix}.my.salesforce.com`;
    }
    if (host.endsWith(".my.salesforce.com") || host.endsWith(".salesforce.com")) {
      return `https://${host}`;
    }
    return `https://${host}`;
  }
  function instanceUrlFromLocation() {
    try {
      return instanceUrlFromHostname(location.hostname);
    } catch {
      return "";
    }
  }

  // sfInject/lib/registry.js
  var SF_INJECT_SHIPPED = (
    /** @type {const} */
    [
      {
        id: "debugLogOpenViewer",
        settingsLabelKey: "settings.sfInjectDebugLogOpenViewer",
        settingsHintKey: "settings.sfInjectDebugLogOpenViewerHint"
      },
      {
        id: "debugLogsTableOrder",
        settingsLabelKey: "settings.sfInjectDebugLogsTableOrder",
        settingsHintKey: "settings.sfInjectDebugLogsTableOrderHint"
      }
    ]
  );
  var SF_INJECT_INTEGRATION_IDS = SF_INJECT_SHIPPED.map((item) => item.id);

  // sfInject/lib/settings.js
  var DEFAULT_INTEGRATIONS = Object.fromEntries(
    SF_INJECT_INTEGRATION_IDS.map((id) => [id, true])
  );
  var DEFAULTS = {
    /** Master toggle: activa content scripts e inyección DOM. */
    enabled: true,
    /** Toggles por integración; `false` desactiva solo ese control. */
    integrations: { ...DEFAULT_INTEGRATIONS }
  };
  var cache = structuredClone(DEFAULTS);
  function isSfInjectIntegrationEnabled(settings, integrationId) {
    const cfg = settings || cache;
    if (!cfg.enabled) return false;
    if (!SF_INJECT_INTEGRATION_IDS.includes(integrationId)) return false;
    return cfg.integrations?.[integrationId] !== false;
  }

  // sfInject/content/host.js
  var teardownById = /* @__PURE__ */ new Map();
  var retryTimer = null;
  var bootstrapTimer = null;
  var bootstrapRunning = false;
  var bootstrapQueued = false;
  var lastHref = location.href;
  function clearRetryTimer() {
    if (retryTimer != null) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
  }
  function teardownAll() {
    for (const teardown of teardownById.values()) teardown();
    teardownById.clear();
    clearRetryTimer();
  }
  function teardownIntegration(id) {
    const teardown = teardownById.get(id);
    if (teardown) {
      teardown();
      teardownById.delete(id);
    }
  }
  function anyParentPageActive() {
    return SF_INJECT_CONTENT_INTEGRATIONS.some((item) => item.isParentPageActive());
  }
  function scheduleBootstrap(delayMs = 0) {
    if (bootstrapTimer != null) clearTimeout(bootstrapTimer);
    bootstrapTimer = setTimeout(() => {
      bootstrapTimer = null;
      void runBootstrap();
    }, delayMs);
  }
  async function runBootstrap() {
    if (bootstrapRunning) {
      bootstrapQueued = true;
      return;
    }
    bootstrapRunning = true;
    bootstrapQueued = false;
    try {
      await bootstrap();
    } finally {
      bootstrapRunning = false;
      if (bootstrapQueued) {
        bootstrapQueued = false;
        scheduleBootstrap(50);
      }
    }
  }
  async function bootstrap() {
    if (!anyParentPageActive()) {
      setInjectStatus("off-page");
      teardownAll();
      return;
    }
    const relevantIntegrations = SF_INJECT_CONTENT_INTEGRATIONS.filter(
      (item) => item.isParentPageActive() && item.isFrameRelevant(document)
    );
    if (!relevantIntegrations.length) {
      setInjectStatus(window.top === window ? "shell" : "off-page");
      teardownAll();
      return;
    }
    const bootstrapRes = await fetchSfInjectBootstrap();
    if (!bootstrapRes?.ok || !bootstrapRes.settings) {
      setInjectStatus("bootstrap-failed");
      teardownAll();
      return;
    }
    const settings = bootstrapRes.settings;
    if (!settings.enabled) {
      setInjectStatus("disabled");
      teardownAll();
      return;
    }
    const instanceUrl = instanceUrlFromLocation();
    const orgRes = await resolveActiveSavedOrg(instanceUrl);
    if (!orgRes?.ok || !orgRes.orgId) {
      setInjectStatus("org-not-saved");
      teardownAll();
      return;
    }
    const lang = bootstrapRes.lang === "en" ? "en" : "es";
    const ctx = {
      orgId: orgRes.orgId,
      lang,
      onError: (msg) => showInjectToast(msg, true)
    };
    let mountedAny = false;
    const relevantIds = new Set(relevantIntegrations.map((item) => item.id));
    for (const integration of SF_INJECT_CONTENT_INTEGRATIONS) {
      if (!relevantIds.has(integration.id)) {
        teardownIntegration(integration.id);
        continue;
      }
      if (!isSfInjectIntegrationEnabled(settings, integration.id)) {
        teardownIntegration(integration.id);
        continue;
      }
      if (!teardownById.has(integration.id)) {
        teardownById.set(integration.id, integration.mount(document, ctx));
      }
      mountedAny = true;
    }
    if (!mountedAny) {
      setInjectStatus(window.top === window ? "shell" : "off-page");
      clearRetryTimer();
      return;
    }
    setInjectStatus("mounting");
    if (retryTimer == null) {
      let attempts = 0;
      retryTimer = setInterval(() => {
        attempts += 1;
        if (attempts > 40) {
          clearRetryTimer();
          return;
        }
        for (const integration of SF_INJECT_CONTENT_INTEGRATIONS) {
          if (!relevantIds.has(integration.id)) continue;
          if (!isSfInjectIntegrationEnabled(settings, integration.id)) continue;
          integration.retryInject?.(document, ctx);
        }
      }, 1500);
    }
  }
  function startInitialBootstrap() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => scheduleBootstrap(0), { once: true });
    } else {
      scheduleBootstrap(0);
    }
  }
  startInitialBootstrap();
  function checkHrefChanged() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    teardownAll();
    scheduleBootstrap(100);
  }
  window.addEventListener("popstate", checkHrefChanged);
  window.addEventListener("hashchange", checkHrefChanged);
  setInterval(checkHrefChanged, 1e3);
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.sfoc_sf_inject) {
        teardownAll();
        scheduleBootstrap(50);
      }
    });
  } catch {
  }
})();
