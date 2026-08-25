/* SFOC sfInject content script (bundled; do not edit) */
(() => {
  // sfInject/lib/strings.js
  var STRINGS = {
    es: {
      "sfInject.debugLogOpenViewer.button": "Abrir en SFOC",
      "sfInject.debugLogOpenViewer.ariaOpen": "Abrir log de depuraci\xF3n en Salesforce Org Compare",
      "sfInject.debugLogOpenViewer.errorNoSession": "Sesi\xF3n no disponible. Inicia sesi\xF3n en Salesforce.",
      "sfInject.debugLogOpenViewer.errorOpen": "No se pudo abrir el log en SFOC.",
      "sfInject.debugLogOpenViewer.errorOrgNotSaved": "Entorno no guardado en SFOC.",
      "sfInject.userTraceFlags.filterLabel": "Solo trazas activas o caducadas hace menos de 30 min",
      "sfInject.userTraceFlags.badgeExpired": "Caducada",
      "sfInject.userTraceFlags.extend": "Ampliar 15 min",
      "sfInject.userTraceFlags.reactivate": "Reactivar 15 min",
      "sfInject.userTraceFlags.ariaExtend": "Ampliar la traza 15 minutos",
      "sfInject.userTraceFlags.ariaReactivate": "Reactivar la traza 15 minutos",
      "sfInject.userTraceFlags.extending": "Ampliando traza\u2026",
      "sfInject.userTraceFlags.extendOk": "Traza ampliada 15 minutos.",
      "sfInject.userTraceFlags.reactivateOk": "Traza reactivada 15 minutos.",
      "sfInject.userTraceFlags.extendError": "No se pudo ampliar la traza.",
      "sfInject.userTraceFlags.extendMaxWindow": "La traza ya alcanza el m\xE1ximo de 24 horas.",
      "sfInject.userTraceFlags.errorNoSession": "Sesi\xF3n no disponible. Inicia sesi\xF3n en Salesforce.",
      "sfInject.userTraceFlags.errorOrgNotSaved": "Entorno no guardado en SFOC.",
      "sfInject.userTraceFlags.emptyFiltered": "No hay trazas que cumplan el filtro.",
      "sfInject.deployStatus.toggleOpen": "Mostrar detalles del despliegue fallido",
      "sfInject.deployStatus.toggleClose": "Ocultar detalles del despliegue fallido",
      "sfInject.deployStatus.loading": "Cargando detalles del despliegue\u2026",
      "sfInject.deployStatus.retry": "Reintentar",
      "sfInject.deployStatus.empty": "Salesforce no devolvi\xF3 detalles para este despliegue.",
      "sfInject.deployStatus.components": "Fallos de componentes",
      "sfInject.deployStatus.tests": "Fallos de tests",
      "sfInject.deployStatus.globalError": "Error general",
      "sfInject.deployStatus.coverageWarnings": "Avisos de cobertura",
      "sfInject.deployStatus.apiName": "API Name",
      "sfInject.deployStatus.type": "Type",
      "sfInject.deployStatus.line": "Line",
      "sfInject.deployStatus.column": "Column",
      "sfInject.deployStatus.errorMessage": "Error Message",
      "sfInject.deployStatus.apexClass": "Apex Class",
      "sfInject.deployStatus.testMethod": "Test Method",
      "sfInject.deployStatus.stackTrace": "Stack Trace",
      "sfInject.deployStatus.time": "Time",
      "sfInject.deployStatus.openApex": "Ctrl+clic para abrir en SFOC",
      "sfInject.deployStatus.errorNoSession": "Sesi\xF3n no disponible. Inicia sesi\xF3n en Salesforce.",
      "sfInject.deployStatus.errorOrgNotSaved": "Entorno no guardado en SFOC.",
      "sfInject.deployStatus.errorOpenApex": "No se pudo abrir la clase Apex en SFOC.",
      "sfInject.deployStatus.errorLoad": "No se pudieron cargar los detalles del despliegue.",
      "sfInject.deployDetailSource.orgLabel": "Organizaci\xF3n para abrir el c\xF3digo",
      "sfInject.deployDetailSource.noOrgs": "No hay organizaciones conectadas",
      "sfInject.deployDetailSource.chooseOrg": "Selecciona una organizaci\xF3n",
      "sfInject.deployDetailSource.selectOrg": "Selecciona una organizaci\xF3n para abrir el c\xF3digo.",
      "sfInject.deployDetailSource.openHint": "Ctrl/Cmd+clic para abrir en SFOC",
      "sfInject.deployDetailSource.noSession": "La organizaci\xF3n seleccionada no tiene una sesi\xF3n activa.",
      "sfInject.deployDetailSource.orgNotSaved": "La organizaci\xF3n seleccionada ya no est\xE1 guardada en SFOC.",
      "sfInject.deployDetailSource.classNotFound": "La clase Apex no existe en la organizaci\xF3n seleccionada.",
      "sfInject.deployDetailSource.openError": "No se pudo abrir la clase Apex en SFOC."
    },
    en: {
      "sfInject.debugLogOpenViewer.button": "Open in SFOC",
      "sfInject.debugLogOpenViewer.ariaOpen": "Open debug log in Salesforce Org Compare",
      "sfInject.debugLogOpenViewer.errorNoSession": "Session unavailable. Sign in to Salesforce.",
      "sfInject.debugLogOpenViewer.errorOpen": "Could not open log in SFOC.",
      "sfInject.debugLogOpenViewer.errorOrgNotSaved": "Org not saved in SFOC.",
      "sfInject.userTraceFlags.filterLabel": "Only active or expired within the last 30 min",
      "sfInject.userTraceFlags.badgeExpired": "Expired",
      "sfInject.userTraceFlags.extend": "Extend 15 min",
      "sfInject.userTraceFlags.reactivate": "Reactivate 15 min",
      "sfInject.userTraceFlags.ariaExtend": "Extend the trace by 15 minutes",
      "sfInject.userTraceFlags.ariaReactivate": "Reactivate the trace for 15 minutes",
      "sfInject.userTraceFlags.extending": "Extending trace\u2026",
      "sfInject.userTraceFlags.extendOk": "Trace extended by 15 minutes.",
      "sfInject.userTraceFlags.reactivateOk": "Trace reactivated for 15 minutes.",
      "sfInject.userTraceFlags.extendError": "Could not extend the trace.",
      "sfInject.userTraceFlags.extendMaxWindow": "The trace already reaches the 24-hour maximum.",
      "sfInject.userTraceFlags.errorNoSession": "Session unavailable. Sign in to Salesforce.",
      "sfInject.userTraceFlags.errorOrgNotSaved": "Org not saved in SFOC.",
      "sfInject.userTraceFlags.emptyFiltered": "No traces match the current filter.",
      "sfInject.deployStatus.toggleOpen": "Show failed deployment details",
      "sfInject.deployStatus.toggleClose": "Hide failed deployment details",
      "sfInject.deployStatus.loading": "Loading deployment details\u2026",
      "sfInject.deployStatus.retry": "Retry",
      "sfInject.deployStatus.empty": "Salesforce returned no details for this deployment.",
      "sfInject.deployStatus.components": "Component failures",
      "sfInject.deployStatus.tests": "Test failures",
      "sfInject.deployStatus.globalError": "General error",
      "sfInject.deployStatus.coverageWarnings": "Coverage warnings",
      "sfInject.deployStatus.apiName": "API Name",
      "sfInject.deployStatus.type": "Type",
      "sfInject.deployStatus.line": "Line",
      "sfInject.deployStatus.column": "Column",
      "sfInject.deployStatus.errorMessage": "Error Message",
      "sfInject.deployStatus.apexClass": "Apex Class",
      "sfInject.deployStatus.testMethod": "Test Method",
      "sfInject.deployStatus.stackTrace": "Stack Trace",
      "sfInject.deployStatus.time": "Time",
      "sfInject.deployStatus.openApex": "Ctrl+click to open in SFOC",
      "sfInject.deployStatus.errorNoSession": "Session unavailable. Sign in to Salesforce.",
      "sfInject.deployStatus.errorOrgNotSaved": "Org not saved in SFOC.",
      "sfInject.deployStatus.errorOpenApex": "Could not open the Apex class in SFOC.",
      "sfInject.deployStatus.errorLoad": "Could not load deployment details.",
      "sfInject.deployDetailSource.orgLabel": "Org used to open source",
      "sfInject.deployDetailSource.noOrgs": "No connected organizations",
      "sfInject.deployDetailSource.chooseOrg": "Select an organization",
      "sfInject.deployDetailSource.selectOrg": "Select an organization to open source.",
      "sfInject.deployDetailSource.openHint": "Ctrl/Cmd+click to open in SFOC",
      "sfInject.deployDetailSource.noSession": "The selected organization has no active session.",
      "sfInject.deployDetailSource.orgNotSaved": "The selected organization is no longer saved in SFOC.",
      "sfInject.deployDetailSource.classNotFound": "The Apex class does not exist in the selected organization.",
      "sfInject.deployDetailSource.openError": "Could not open the Apex class in SFOC."
    }
  };
  function sfInjectT(lang, key) {
    const l = lang === "en" ? "en" : "es";
    return STRINGS[l][key] || STRINGS.es[key] || key;
  }

  // sfInject/content/matchers/debugLogPages.js
  var APEX_DEBUG_LOGS_SETUP_RE = /\/lightning\/setup\/ApexDebugLogs(?:\/(?:home|page)?)?\/?$/i;
  var APEX_DEBUG_LOGS_CLASSIC_FRAME_RE = /\/setup\/ui\/listApexTraces\.apexp$/i;
  function toUrl(url) {
    if (!url) return null;
    try {
      return typeof url === "string" ? new URL(url, "https://example.com") : url;
    } catch {
      return null;
    }
  }
  function isApexDebugLogsSetupPage(url) {
    const u = toUrl(url);
    return !!(u && APEX_DEBUG_LOGS_SETUP_RE.test(u.pathname));
  }
  function isApexDebugLogsClassicFrame(url) {
    const u = toUrl(url);
    return !!(u && APEX_DEBUG_LOGS_CLASSIC_FRAME_RE.test(u.pathname));
  }
  function isApexDebugLogsInjectPage(url) {
    return isApexDebugLogsSetupPage(url) || isApexDebugLogsClassicFrame(url);
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
  async function saveSfInjectPrefsRemote(prefs) {
    try {
      return await sfInjectSend({ type: "sfInject:savePrefs", prefs });
    } catch {
      return { ok: false, reason: "MESSAGE_FAILED" };
    }
  }
  async function fetchUserTraceFlags(orgId) {
    try {
      return await sfInjectSend({ type: "sfInject:listTraceFlags", orgId });
    } catch {
      return { ok: false, reason: "MESSAGE_FAILED" };
    }
  }
  async function fetchDeployStatusInlineDetail(orgId, asyncId) {
    try {
      return await sfInjectSend({ type: "sfInject:getDeployStatusDetail", orgId, asyncId });
    } catch {
      return { ok: false, reason: "MESSAGE_FAILED" };
    }
  }
  async function openDeployStatusApexSource(opts) {
    try {
      return await sfInjectSend({
        type: "sfInject:openApexSource",
        orgId: opts.orgId,
        classId: opts.classId,
        className: opts.className,
        initialLine: opts.initialLine
      });
    } catch {
      return { ok: false, reason: "MESSAGE_FAILED" };
    }
  }
  async function fetchActiveSavedOrgsForDeployDetail() {
    try {
      return await sfInjectSend({ type: "sfInject:listActiveSavedOrgsForDeployDetail" });
    } catch {
      return { ok: false, reason: "MESSAGE_FAILED" };
    }
  }
  async function extendUserTraceFlag(opts) {
    try {
      return await sfInjectSend({
        type: "sfInject:extendTraceFlag",
        orgId: opts.orgId,
        traceFlagId: opts.traceFlagId,
        allowReactivate: opts.allowReactivate,
        startIso: opts.startIso,
        expirationIso: opts.expirationIso
      });
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
        for (const el2 of node.querySelectorAll(selector)) {
          if (seen.has(el2)) continue;
          seen.add(el2);
          out.push(el2);
        }
      } catch {
      }
      try {
        if (node instanceof Element && node.shadowRoot) walk(node.shadowRoot);
        for (const el2 of node.querySelectorAll("*")) {
          if (el2.shadowRoot) walk(el2.shadowRoot);
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
  function actionLinkLabel(el2) {
    const text = (el2.textContent || "").trim().toLowerCase();
    if (text) return text;
    const aria = (el2.getAttribute("aria-label") || el2.getAttribute("title") || "").trim().toLowerCase();
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
    for (const el2 of queryAllDeep(row, "a[href], button[onclick], [data-href], [onclick]")) {
      const href = el2.getAttribute("href") || el2.getAttribute("data-href") || "";
      const fromHref = extractApexLogId(href);
      if (fromHref) return fromHref.slice(0, 15);
      const onclick = el2.getAttribute("onclick") || "";
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
    const cooldownMs = opts.cooldownMs ?? 0;
    let timer = null;
    let cooldownTimer = null;
    let suspended = false;
    const release = () => {
      if (cooldownTimer != null) clearTimeout(cooldownTimer);
      if (cooldownMs > 0) {
        cooldownTimer = setTimeout(() => {
          cooldownTimer = null;
          suspended = false;
        }, cooldownMs);
        return;
      }
      queueMicrotask(() => {
        suspended = false;
      });
    };
    const schedule = () => {
      if (suspended) return;
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (suspended || !doc.body) return;
        suspended = true;
        try {
          const result = run();
          if (result && typeof /** @type {Promise<void>} */
          result.then === "function") {
            result.then(release, release);
          } else {
            release();
          }
        } catch {
          suspended = false;
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
      if (cooldownTimer != null) clearTimeout(cooldownTimer);
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
  function containsUserTraceFlags(el2) {
    if (!el2 || typeof el2.querySelector !== "function") return false;
    if (el2.querySelector(`[id="${MONITORED_FORM_ID}"]`)) return true;
    for (const h2 of el2.querySelectorAll("h2.mainTitle")) {
      if (/user trace flags/i.test((h2.textContent || "").trim())) return true;
    }
    return false;
  }
  function findOuterTbodyRow(el2, excludeTr = null) {
    let node = el2;
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
    applyDebugLogsTableOrder(doc);
    return () => {
    };
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

  // sfInject/content/matchers/classicDateTime.js
  var DATE_TIME_RE = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?/i;
  var DATE_TIME_RE_24H = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  function detectClassicDateOrder(samples) {
    for (const text of samples) {
      const raw = String(text || "").trim();
      const m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
      if (!m) continue;
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a > 12 && b <= 12) return "dmy";
      if (b > 12 && a <= 12) return "mdy";
    }
    return "dmy";
  }
  function resolveDayMonth(a, b, order) {
    if (a > 12 && b <= 12) return { day: a, month: b };
    if (b > 12 && a <= 12) return { day: b, month: a };
    return order === "mdy" ? { day: b, month: a } : { day: a, month: b };
  }
  function parseClassicDateTimeMs(text, orderOrLang = "dmy") {
    const raw = String(text || "").trim();
    if (!raw) return NaN;
    const order = orderOrLang === "mdy" || orderOrLang === "en" ? "mdy" : orderOrLang === "dmy" || orderOrLang === "es" ? "dmy" : "dmy";
    const ampm = raw.match(DATE_TIME_RE);
    const m = ampm || raw.match(DATE_TIME_RE_24H);
    if (!m) return NaN;
    const { day, month } = resolveDayMonth(Number(m[1]), Number(m[2]), order);
    let year = Number(m[3]);
    if (year < 100) year += 2e3;
    let hours = Number(m[4]);
    const minutes = Number(m[5]);
    const seconds = m[6] ? Number(m[6]) : 0;
    if (ampm) {
      const meridiem = String(m[7] || "").toLowerCase();
      if (meridiem === "p" && hours < 12) hours += 12;
      if (meridiem === "a" && hours === 12) hours = 0;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59) return NaN;
    const ms = new Date(year, month - 1, day, hours, minutes, seconds, 0).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }
  function formatClassicDateTime(iso, orderOrLang = "dmy") {
    const ms = Date.parse(String(iso || ""));
    if (!Number.isFinite(ms)) return "";
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, "0");
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const mdy = orderOrLang === "mdy" || orderOrLang === "en";
    if (mdy) {
      return `${month}/${day}/${year}, ${hh}:${mm}`;
    }
    return `${day}/${month}/${year}, ${hh}:${mm}`;
  }

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
      const el2 = doc.createElement("div");
      el2.className = `sfoc-inject-toast${isError ? " sfoc-inject-toast--error" : ""}`;
      el2.setAttribute("role", isError ? "alert" : "status");
      el2.textContent = message;
      doc.body.appendChild(el2);
      setTimeout(() => el2.remove(), 4e3);
    } catch {
    }
  }

  // sfInject/content/matchers/traceFlagIds.js
  var TRACE_FLAG_ID_RE = /7tf[a-zA-Z0-9]{12,15}/i;
  function decodeSalesforceHref(raw) {
    let s = String(raw || "");
    if (!s) return "";
    s = s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    for (let i = 0; i < 4; i += 1) {
      if (!/%[0-9a-fA-F]{2}/.test(s)) break;
      try {
        const next = decodeURIComponent(s.replace(/\+/g, " "));
        if (next === s) break;
        s = next;
      } catch {
        break;
      }
    }
    return s;
  }
  function normalizeTraceFlagId(raw) {
    const decoded = decodeSalesforceHref(raw);
    const m = decoded.match(TRACE_FLAG_ID_RE) || String(raw || "").match(TRACE_FLAG_ID_RE);
    if (!m) return null;
    return m[0].slice(0, 15);
  }

  // sfInject/content/injectors/userTraceFlagsEnhanceDom.js
  var INTEGRATION_ID3 = "userTraceFlagsEnhance";
  var MONITORED_FORM_ID2 = "Apex_Trace_List:monitoredUsersForm";
  var DEL_TRACE_FLAG_SELECTOR = 'a[href*="delTraceFlag"], a[onclick*="delTraceFlag"]';
  var FILTER_WRAP_ATTR = "data-sfoc-utf-filter";
  var BADGE_ATTR = "data-sfoc-utf-badge";
  var ROW_HIDDEN_ATTR = "data-sfoc-utf-hidden";
  var ROW_TRACE_ATTR = "data-sfoc-utf-trace-id";
  var SYNTHETIC_ROW_ATTR = "data-sfoc-utf-synthetic";
  var NATIVE_PAGER_HIDDEN_ATTR = "data-sfoc-utf-pager-hidden";
  var TRACE_ACTION_LABELS = /* @__PURE__ */ new Set([
    "del",
    "delete",
    "eliminar",
    "borrar",
    "edit",
    "editar",
    "modify",
    "modificar",
    "filters",
    "filter",
    "filtros",
    "filtro"
  ]);
  var USER_ID_RE = /005[a-zA-Z0-9]{12,15}/i;
  function findDelTraceFlagLink(root) {
    if (!root || typeof root.querySelector !== "function") return null;
    try {
      return root.querySelector(DEL_TRACE_FLAG_SELECTOR);
    } catch {
      return null;
    }
  }
  function actionLinkLabel2(el2) {
    const text = (el2.textContent || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (text && text.length < 40) return text;
    return (el2.getAttribute("aria-label") || el2.getAttribute("title") || "").trim().toLowerCase().split(/[\s—–-]+/)[0];
  }
  function normalizeUserId(raw) {
    const decoded = decodeSalesforceHref(raw);
    const m = decoded.match(USER_ID_RE) || String(raw || "").match(USER_ID_RE);
    if (!m) return null;
    return m[0].slice(0, 15);
  }
  function isUserTraceFlagsDocument(doc) {
    if (!doc) return false;
    if (doc.getElementById?.(MONITORED_FORM_ID2)) return true;
    return !!findDelTraceFlagLink(doc);
  }
  function findMonitoredUsersForm(doc) {
    return doc?.getElementById?.(MONITORED_FORM_ID2) || null;
  }
  function findTraceActionLinksInRow(row) {
    let links;
    try {
      links = [...row.querySelectorAll("a")];
    } catch {
      links = queryAllDeep(row, "a");
    }
    return links.filter((a) => {
      const label = actionLinkLabel2(a);
      if (TRACE_ACTION_LABELS.has(label)) return true;
      const title = (a.getAttribute("title") || "").trim().toLowerCase();
      return /^(del|delete|eliminar|edit|editar|modify|modificar|filter)\b/.test(title);
    });
  }
  function extractTraceFlagIdFromRow(row) {
    if (!row) return null;
    const cached = normalizeTraceFlagId(row.getAttribute(ROW_TRACE_ATTR) || "");
    if (cached) return cached;
    const delLink = findDelTraceFlagLink(row);
    if (delLink) {
      const fromDel = normalizeTraceFlagId(
        `${delLink.getAttribute("href") || ""} ${delLink.getAttribute("onclick") || ""}`
      );
      if (fromDel) return fromDel;
    }
    const attrCandidates = [
      row.getAttribute("data-row-key-value"),
      row.getAttribute("data-record-id"),
      row.getAttribute("data-key"),
      row.getAttribute("data-id")
    ];
    for (const raw of attrCandidates) {
      const id = normalizeTraceFlagId(String(raw || ""));
      if (id) return id;
    }
    let els;
    try {
      els = row.querySelectorAll("a[href], [onclick], input[value], input[name]");
    } catch {
      els = queryAllDeep(row, "a[href], [onclick], input[value], input[name]");
    }
    for (const el2 of els) {
      for (const chunk of [
        el2.getAttribute("href") || "",
        el2.getAttribute("onclick") || "",
        el2.getAttribute("value") || "",
        el2.getAttribute("name") || "",
        el2.getAttribute("title") || ""
      ]) {
        const id = normalizeTraceFlagId(chunk);
        if (id) return id;
      }
    }
    return normalizeTraceFlagId(row.textContent || "");
  }
  function extractUserIdFromRow(row) {
    if (!row) return null;
    let els;
    try {
      els = row.querySelectorAll("a[href], [onclick], input[value]");
    } catch {
      els = queryAllDeep(row, "a[href], [onclick], input[value]");
    }
    for (const el2 of els) {
      for (const chunk of [
        el2.getAttribute("href") || "",
        el2.getAttribute("onclick") || "",
        el2.getAttribute("value") || ""
      ]) {
        const id = normalizeUserId(chunk);
        if (id) return id;
      }
    }
    return null;
  }
  function isUserTraceFlagRow(row) {
    if (!row) return false;
    if (!findDelTraceFlagLink(row)) return false;
    try {
      if (row.querySelector("table")) return false;
    } catch {
    }
    return !!extractTraceFlagIdFromRow(row);
  }
  function findTraceActionsHost(row) {
    const actionCol = row.querySelector?.("td.actionColumn, th.actionColumn");
    if (actionCol) return actionCol;
    const actionLinks = findTraceActionLinksInRow(row);
    if (actionLinks.length && actionLinks[0].parentElement) {
      return actionLinks[0].parentElement;
    }
    return row.querySelector?.("td:first-child") || null;
  }
  function findUserTraceFlagsTable(root) {
    const doc = root?.ownerDocument || root;
    const link = findDelTraceFlagLink(root) || findDelTraceFlagLink(doc);
    if (!link) return null;
    const table = link.closest?.("table") || null;
    return (
      /** @type {HTMLTableElement | null} */
      table
    );
  }
  function findExpirationColumnIndex(table) {
    const headerRow = table.querySelector("thead tr") || table.querySelector("tr.headerRow") || table.querySelector("tr");
    if (!headerRow) return -1;
    const cells = [...headerRow.querySelectorAll("th, td")];
    for (let i = 0; i < cells.length; i += 1) {
      const text = (cells[i].textContent || "").trim().toLowerCase();
      if (/expiration|caducidad|expiraci|fecha de caducidad/.test(text)) return i;
    }
    return -1;
  }
  function readRowCellText(row, index) {
    if (!row || index < 0) return "";
    let cells;
    try {
      cells = row.querySelectorAll("td, th");
    } catch {
      return "";
    }
    const cell2 = cells[index];
    return cell2 ? (cell2.textContent || "").trim() : "";
  }
  function findUserTraceFlagRows(doc) {
    const table = findUserTraceFlagsTable(doc);
    if (!table) return [];
    const rows = [];
    const seen = /* @__PURE__ */ new Set();
    let candidates;
    try {
      candidates = table.querySelectorAll("tr");
    } catch {
      candidates = queryAllDeep(table, "tr");
    }
    for (const row of candidates) {
      if (seen.has(row)) continue;
      if (row.classList?.contains("headerRow")) continue;
      if (!isUserTraceFlagRow(row)) continue;
      seen.add(row);
      rows.push(row);
    }
    return rows;
  }
  function findFilterInsertPoint(doc) {
    const form = findMonitoredUsersForm(doc);
    if (form?.parentElement) {
      return { parent: form.parentElement, before: form.nextElementSibling };
    }
    const dataTable = findUserTraceFlagsTable(doc);
    if (dataTable?.parentElement) {
      return { parent: dataTable.parentElement, before: dataTable };
    }
    return null;
  }
  function findExistingFilterWrap(doc) {
    return doc.querySelector(`[${FILTER_WRAP_ATTR}]`);
  }
  function ensureFilterCheckbox(doc, labelText, checked, onChange) {
    let wrap = findExistingFilterWrap(doc);
    if (wrap) {
      wrap._sfocOnChange = onChange;
      const input2 = (
        /** @type {HTMLInputElement | null} */
        wrap.querySelector('input[type="checkbox"]')
      );
      const span2 = wrap.querySelector(".sfoc-utf-filter-text");
      if (span2 && span2.textContent !== labelText) span2.textContent = labelText;
      if (input2 && input2.checked !== checked) input2.checked = checked;
      return wrap;
    }
    const insert = findFilterInsertPoint(doc);
    if (!insert) {
      return doc.createElement("div");
    }
    wrap = doc.createElement("div");
    wrap.className = "sfoc-utf-filter";
    wrap.setAttribute(FILTER_WRAP_ATTR, "1");
    wrap.setAttribute("data-sfoc-inject", INTEGRATION_ID3);
    wrap._sfocOnChange = onChange;
    const label = doc.createElement("label");
    label.className = "sfoc-utf-filter-label";
    const input = doc.createElement("input");
    input.type = "checkbox";
    input.className = "sfoc-utf-filter-input";
    input.checked = checked;
    input.addEventListener("change", () => {
      wrap._sfocOnChange?.(!!input.checked);
    });
    const span = doc.createElement("span");
    span.className = "sfoc-utf-filter-text";
    span.textContent = labelText;
    label.append(input, span);
    wrap.appendChild(label);
    insert.parent.insertBefore(wrap, insert.before);
    return wrap;
  }
  function setRowFilteredHidden(row, hidden) {
    if (hidden) {
      row.setAttribute(ROW_HIDDEN_ATTR, "1");
      row.style.display = "none";
    } else {
      row.removeAttribute(ROW_HIDDEN_ATTR);
      row.style.display = "";
    }
  }
  function restoreAllUserTraceFlagRows(doc) {
    let nodes;
    try {
      nodes = doc.querySelectorAll(`[${ROW_HIDDEN_ATTR}], [data-sfoc-utf-dim]`);
    } catch {
      return;
    }
    for (const row of nodes) {
      row.removeAttribute(ROW_HIDDEN_ATTR);
      row.removeAttribute("data-sfoc-utf-dim");
      row.style.opacity = "";
      row.style.display = "";
    }
  }
  function stampRowTraceId(row, traceId) {
    if (traceId) row.setAttribute(ROW_TRACE_ATTR, traceId);
  }
  function ensureExpiredBadge(row, badgeText, expirationColIndex = -1) {
    if (row.querySelector(`[${BADGE_ATTR}]`)) return;
    const ownerDoc = row.ownerDocument || document;
    const badge = ownerDoc.createElement("span");
    badge.className = "sfoc-utf-badge slds-badge";
    badge.setAttribute(BADGE_ATTR, "1");
    badge.setAttribute("data-sfoc-inject", INTEGRATION_ID3);
    badge.textContent = badgeText;
    if (expirationColIndex >= 0) {
      const cells = row.querySelectorAll("td, th");
      const cell2 = cells[expirationColIndex];
      if (cell2) {
        cell2.appendChild(ownerDoc.createTextNode(" "));
        cell2.appendChild(badge);
        return;
      }
    }
    const host = findTraceActionsHost(row);
    if (host) {
      host.appendChild(ownerDoc.createTextNode(" "));
      host.appendChild(badge);
    }
  }
  function removeExpiredBadge(row) {
    row.querySelectorAll(`[${BADGE_ATTR}]`).forEach((el2) => el2.remove());
  }
  function clearSyntheticTraceRows(doc) {
    const table = findUserTraceFlagsTable(doc);
    if (!table) return;
    table.querySelectorAll(`tr[${SYNTHETIC_ROW_ATTR}]`).forEach((el2) => el2.remove());
  }
  function setUserTraceFlagsPagerHidden(doc, hide) {
    if (!hide) {
      let marked;
      try {
        marked = doc.querySelectorAll(`[${NATIVE_PAGER_HIDDEN_ATTR}]`);
      } catch {
        return;
      }
      for (const el2 of marked) {
        if (el2.closest?.('[id="Apex_Trace_List:traceForm"]')) continue;
        const prev = el2.getAttribute(NATIVE_PAGER_HIDDEN_ATTR);
        const htmlEl = (
          /** @type {HTMLElement} */
          el2
        );
        if (prev) htmlEl.style.display = prev;
        else htmlEl.style.removeProperty("display");
        el2.removeAttribute(NATIVE_PAGER_HIDDEN_ATTR);
      }
      return;
    }
    const form = findMonitoredUsersForm(doc);
    const related = form?.closest?.(".listRelatedObject") || null;
    const sectionCell = related?.parentElement || form?.closest?.("td") || form?.parentElement;
    const root = sectionCell || doc;
    const nodes = [];
    try {
      for (const el2 of root.querySelectorAll(
        ".bNext, .fewerMore, .listElementBottomNav, .withFilter, .bFilterView, form#filter_element"
      )) {
        if (el2.closest?.('[id="Apex_Trace_List:traceForm"]')) continue;
        nodes.push(el2);
      }
    } catch {
      return;
    }
    for (const el2 of nodes) {
      const htmlEl = (
        /** @type {HTMLElement} */
        el2
      );
      if (!el2.hasAttribute(NATIVE_PAGER_HIDDEN_ATTR)) {
        el2.setAttribute(NATIVE_PAGER_HIDDEN_ATTR, htmlEl.style.display || "");
      }
      htmlEl.style.display = "none";
    }
  }
  function createSyntheticTraceRow(doc, opts) {
    const tr = doc.createElement("tr");
    tr.className = opts.even ? "dataRow even" : "dataRow odd";
    tr.setAttribute(SYNTHETIC_ROW_ATTR, "1");
    tr.setAttribute(ROW_TRACE_ATTR, opts.id);
    tr.setAttribute("data-sfoc-inject", INTEGRATION_ID3);
    const encId = encodeURIComponent(opts.id);
    const editHref = `javascript:srcUp(${JSON.stringify(`/udd/TraceFlag/editTraceFlag.apexp?Id=${opts.id}&isdtp=p1`)});`;
    const filtersHref = `javascript:srcUp(${JSON.stringify(`/udd/DebugLevel/editDebugLevel.apexp?traceflag_id=${opts.id}&isdtp=p1`)});`;
    const actionTd = doc.createElement("td");
    actionTd.className = "actionColumn";
    const edit = doc.createElement("a");
    edit.className = "actionLink";
    edit.href = editHref;
    edit.textContent = "Edit";
    const filters = doc.createElement("a");
    filters.className = "actionLink";
    filters.href = filtersHref;
    filters.textContent = "Filters";
    actionTd.append(edit, doc.createTextNode(" | "), filters);
    const idTh = doc.createElement("th");
    idTh.scope = "row";
    idTh.className = " dataCell  ";
    const idLink = doc.createElement("a");
    idLink.href = editHref;
    idLink.textContent = opts.id;
    idTh.appendChild(idLink);
    const mkTextTd = (text) => {
      const td = doc.createElement("td");
      td.className = " dataCell  ";
      td.textContent = text;
      return td;
    };
    const nameTd = doc.createElement("td");
    nameTd.className = " dataCell  ";
    nameTd.textContent = opts.name;
    const levelTd = doc.createElement("td");
    levelTd.className = " dataCell  ";
    const levelLink = doc.createElement("a");
    levelLink.href = filtersHref;
    levelLink.textContent = opts.debugLevel || "";
    levelTd.appendChild(levelLink);
    tr.append(
      actionTd,
      idTh,
      nameTd,
      mkTextTd(opts.startText),
      mkTextTd(opts.expirationText),
      mkTextTd(opts.logType || "USER_DEBUG"),
      levelTd
    );
    const ghost = doc.createElement("a");
    ghost.href = `javascript:srcSelf(%27delTraceFlag%3D${encId}%27)`;
    ghost.style.display = "none";
    ghost.setAttribute("aria-hidden", "true");
    actionTd.appendChild(ghost);
    return (
      /** @type {HTMLTableRowElement} */
      tr
    );
  }
  function appendSyntheticTraceRows(table, rows) {
    const tbody = table.tBodies?.[0] || table.querySelector("tbody") || table;
    for (const row of rows) tbody.appendChild(row);
  }

  // shared/userDebugTraceFlagStatus.js
  var USER_DEBUG_TRACE_MAX_WINDOW_MS = 24 * 60 * 60 * 1e3;
  var USER_DEBUG_TRACE_RECENTLY_INACTIVE_MS = 30 * 60 * 1e3;
  function parseSalesforceDateTimeMs(value) {
    if (value == null || value === "") return NaN;
    if (value instanceof Date) return value.getTime();
    const raw = String(value).trim();
    if (!raw) return NaN;
    const normalized = raw.replace(/(\.\d{3})\+(\d{2})(\d{2})$/, "$1+$2:$3");
    const ms = Date.parse(normalized);
    return Number.isFinite(ms) ? ms : NaN;
  }
  function resolveUserDebugTraceDates(row) {
    const startMs = parseSalesforceDateTimeMs(row?.startIso ?? row?.StartDate);
    const expMs = parseSalesforceDateTimeMs(row?.expirationIso ?? row?.ExpirationDate);
    return {
      startMs,
      expMs,
      startIso: Number.isFinite(startMs) ? new Date(startMs).toISOString() : "",
      expirationIso: Number.isFinite(expMs) ? new Date(expMs).toISOString() : ""
    };
  }
  function isUserDebugTraceActive(row, nowMs = Date.now()) {
    const { startMs, expMs } = resolveUserDebugTraceDates(row);
    if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) return false;
    return startMs <= nowMs && nowMs < expMs;
  }
  function isUserDebugTraceRecentlyInactive(row, nowMs = Date.now()) {
    if (isUserDebugTraceActive(row, nowMs)) return false;
    const { startMs, expMs } = resolveUserDebugTraceDates(row);
    if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) return false;
    if (startMs > nowMs) return false;
    if (expMs > nowMs) return false;
    return nowMs - expMs <= USER_DEBUG_TRACE_RECENTLY_INACTIVE_MS;
  }
  function isUserDebugTraceVisibleByDefault(row, nowMs = Date.now()) {
    return isUserDebugTraceActive(row, nowMs) || isUserDebugTraceRecentlyInactive(row, nowMs);
  }
  function computeTraceExtension({ startIso, expirationIso, addMs, nowMs = Date.now() }) {
    const startMs = parseSalesforceDateTimeMs(startIso);
    const expMs = parseSalesforceDateTimeMs(expirationIso);
    const add = Math.max(0, Number(addMs) || 0);
    if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) {
      throw new Error("Invalid date range");
    }
    const maxExpMs = startMs + USER_DEBUG_TRACE_MAX_WINDOW_MS;
    const active = startMs <= nowMs && nowMs < expMs;
    const requestedMs = active ? expMs + add : nowMs + add;
    const nextMs = Math.min(requestedMs, maxExpMs);
    if (active && nextMs <= expMs) {
      throw new Error("Trace window cannot exceed 24 hours");
    }
    if (!active && nextMs <= nowMs) {
      throw new Error("Cannot reactivate trace");
    }
    return {
      expirationIso: new Date(nextMs).toISOString(),
      cappedAtMax: requestedMs > maxExpMs
    };
  }
  function buildTraceExtensionPlan(row, addMs = 15 * 60 * 1e3, nowMs = Date.now()) {
    const { startIso, expirationIso } = resolveUserDebugTraceDates(row);
    if (!startIso || !expirationIso) {
      throw new Error("Invalid trace dates");
    }
    const active = isUserDebugTraceActive(row, nowMs);
    const recentlyInactive = isUserDebugTraceRecentlyInactive(row, nowMs);
    if (!active && !recentlyInactive) {
      throw new Error("Trace is not active");
    }
    if (active) {
      const result2 = computeTraceExtension({ startIso, expirationIso, addMs, nowMs });
      return { ...result2, startIso: null, reactivated: false };
    }
    const nowIso = new Date(nowMs).toISOString();
    const result = computeTraceExtension({
      startIso: nowIso,
      expirationIso: nowIso,
      addMs,
      nowMs
    });
    return { ...result, startIso: nowIso, reactivated: true };
  }
  function canExtendOrReactivateUserDebugTrace(row, nowMs = Date.now()) {
    if (!isUserDebugTraceActive(row, nowMs) && !isUserDebugTraceRecentlyInactive(row, nowMs)) {
      return false;
    }
    const { startMs, expMs } = resolveUserDebugTraceDates(row);
    if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) return false;
    if (isUserDebugTraceActive(row, nowMs) && expMs >= startMs + USER_DEBUG_TRACE_MAX_WINDOW_MS) {
      return false;
    }
    try {
      buildTraceExtensionPlan(row, 15 * 60 * 1e3, nowMs);
      return true;
    } catch {
      return false;
    }
  }

  // sfInject/content/injectors/userTraceFlagsEnhance.js
  var extending = false;
  var injectInFlight2 = false;
  var tracesCatalogPromise = null;
  var activeOnlyFilter = false;
  var catalogErrorToasted = false;
  function readActiveOnlyPref(ctx) {
    if (ctx.prefs && typeof ctx.prefs.userTraceFlagsActiveOnly === "boolean") {
      return ctx.prefs.userTraceFlagsActiveOnly;
    }
    return false;
  }
  function fetchTracesCached(orgId) {
    if (!tracesCatalogPromise) {
      tracesCatalogPromise = fetchUserTraceFlags(orgId).then((res) => {
        const byId = /* @__PURE__ */ new Map();
        const byEntity = /* @__PURE__ */ new Map();
        const list = [];
        if (!res?.ok) {
          return { byId, byEntity, list, ok: false, error: res?.error || res?.reason || "error" };
        }
        if (Array.isArray(res.traces)) {
          for (const t of res.traces) {
            const id = normalizeTraceFlagId(String(t?.id || "")) || String(t?.id || "").slice(0, 15);
            const entity = String(t?.tracedEntityId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 15);
            if (id) {
              byId.set(id, t);
              list.push(t);
            }
            if (entity) byEntity.set(entity, t);
          }
        }
        return { byId, byEntity, list, ok: true };
      }).catch((e) => ({
        byId: /* @__PURE__ */ new Map(),
        byEntity: /* @__PURE__ */ new Map(),
        list: [],
        ok: false,
        error: e?.message || String(e)
      }));
    }
    return tracesCatalogPromise;
  }
  function matchTraceForRow(row, catalog) {
    const traceId = extractTraceFlagIdFromRow(row);
    if (traceId && catalog.byId.has(traceId)) {
      const t = catalog.byId.get(traceId) || null;
      if (t) stampRowTraceId(row, String(t.id || traceId).slice(0, 15));
      return t;
    }
    const userId = extractUserIdFromRow(row);
    if (userId && catalog.byEntity.has(userId)) {
      const t = catalog.byEntity.get(userId) || null;
      if (t?.id) stampRowTraceId(row, String(t.id).slice(0, 15));
      return t;
    }
    return null;
  }
  function detectDateOrderFromRows(rows, expCol) {
    return detectClassicDateOrder(rows.map((row) => readRowCellText(row, expCol)));
  }
  function resolveRowFilterState(row, expCol, dateOrder, nowMs, trace = null) {
    if (trace) {
      const visible = isUserDebugTraceVisibleByDefault(trace, nowMs);
      const recentlyExpired2 = isUserDebugTraceRecentlyInactive(trace, nowMs) && !isUserDebugTraceActive(trace, nowMs);
      return { known: true, visible, recentlyExpired: recentlyExpired2 };
    }
    const expMs = parseClassicDateTimeMs(readRowCellText(row, expCol), dateOrder);
    if (!Number.isFinite(expMs)) {
      return { known: false, visible: true, recentlyExpired: false };
    }
    const expired = expMs <= nowMs;
    const recentlyExpired = expired && nowMs - expMs <= USER_DEBUG_TRACE_RECENTLY_INACTIVE_MS;
    return { known: true, visible: !expired || recentlyExpired, recentlyExpired };
  }
  async function handleExtend(ctx, trace) {
    if (extending || !ctx.orgId || !trace?.id) return;
    if (!canExtendOrReactivateUserDebugTrace(trace)) {
      showInjectToast(sfInjectT(ctx.lang, "sfInject.userTraceFlags.extendMaxWindow"), true);
      return;
    }
    extending = true;
    const recentlyInactive = isUserDebugTraceRecentlyInactive(trace);
    showInjectToast(sfInjectT(ctx.lang, "sfInject.userTraceFlags.extending"));
    try {
      const res = await extendUserTraceFlag({
        orgId: ctx.orgId,
        traceFlagId: String(trace.id),
        allowReactivate: recentlyInactive,
        startIso: String(trace.startIso || ""),
        expirationIso: String(trace.expirationIso || "")
      });
      if (!res?.ok) {
        const msg = res?.reason === "NO_SID" ? sfInjectT(ctx.lang, "sfInject.userTraceFlags.errorNoSession") : res?.reason === "ORG_NOT_SAVED" ? sfInjectT(ctx.lang, "sfInject.userTraceFlags.errorOrgNotSaved") : res?.error?.includes("24 hour") || res?.error?.includes("24 hours") ? sfInjectT(ctx.lang, "sfInject.userTraceFlags.extendMaxWindow") : res?.error || sfInjectT(ctx.lang, "sfInject.userTraceFlags.extendError");
        showInjectToast(msg, true);
        return;
      }
      showInjectToast(
        sfInjectT(
          ctx.lang,
          res.reactivated ? "sfInject.userTraceFlags.reactivateOk" : "sfInject.userTraceFlags.extendOk"
        )
      );
      try {
        location.reload();
      } catch {
      }
    } finally {
      extending = false;
    }
  }
  function injectExtendLink(row, ctx, trace) {
    const subKey = "extend-link";
    const traceId = normalizeTraceFlagId(String(trace.id || "")) || String(trace.id || "").slice(0, 15);
    if (!traceId) return;
    const ownerDoc = row.ownerDocument || document;
    if (findInjectedForLog(ownerDoc, INTEGRATION_ID3, subKey, traceId)) return;
    if (!canExtendOrReactivateUserDebugTrace(trace)) return;
    const host = findTraceActionsHost(row);
    if (!host) return;
    const recentlyInactive = isUserDebugTraceRecentlyInactive(trace);
    const labelKey = recentlyInactive ? "sfInject.userTraceFlags.reactivate" : "sfInject.userTraceFlags.extend";
    const ariaKey = recentlyInactive ? "sfInject.userTraceFlags.ariaReactivate" : "sfInject.userTraceFlags.ariaExtend";
    const templateLink = host.querySelector("a.actionLink, a.link-button, a.slds-text-link, a");
    const link = createSfocActionLink({
      ownerDoc,
      label: sfInjectT(ctx.lang, labelKey),
      ariaLabel: sfInjectT(ctx.lang, ariaKey),
      onClick: () => void handleExtend(ctx, trace),
      integrationId: INTEGRATION_ID3,
      subKey,
      logId: traceId,
      templateLink: templateLink || void 0
    });
    host.appendChild(ownerDoc.createTextNode(" | "));
    host.appendChild(link);
  }
  function renderApiFilteredView(doc, ctx, catalog, nowMs) {
    const table = findUserTraceFlagsTable(doc);
    if (!table) return;
    const expCol = findExpirationColumnIndex(table);
    const nativeRows = findUserTraceFlagRows(doc).filter(
      (r) => !r.hasAttribute?.("data-sfoc-utf-synthetic")
    );
    const dateOrder = detectDateOrderFromRows(nativeRows, expCol);
    const visible = catalog.list.filter((t) => isUserDebugTraceVisibleByDefault(t, nowMs)).sort((a, b) => String(a.tracedEntityName || "").localeCompare(String(b.tracedEntityName || "")));
    for (const row of nativeRows) {
      setRowFilteredHidden(row, true);
      removeExpiredBadge(row);
    }
    clearSyntheticTraceRows(doc);
    setUserTraceFlagsPagerHidden(doc, true);
    const synthRows = visible.map((trace, index) => {
      const id = normalizeTraceFlagId(String(trace.id || "")) || String(trace.id || "").slice(0, 15);
      const row = createSyntheticTraceRow(doc, {
        id,
        name: String(trace.tracedEntityName || trace.tracedEntityId || id),
        startText: formatClassicDateTime(String(trace.startIso || ""), dateOrder),
        expirationText: formatClassicDateTime(String(trace.expirationIso || ""), dateOrder),
        logType: String(trace.logType || "USER_DEBUG"),
        debugLevel: String(trace.debugLevelLabel || trace.debugLevelDeveloperName || ""),
        even: index % 2 === 0
      });
      return { row, trace };
    });
    appendSyntheticTraceRows(
      table,
      synthRows.map((x) => x.row)
    );
    for (const { row, trace } of synthRows) {
      if (isUserDebugTraceRecentlyInactive(trace, nowMs) && !isUserDebugTraceActive(trace, nowMs)) {
        ensureExpiredBadge(row, sfInjectT(ctx.lang, "sfInject.userTraceFlags.badgeExpired"), expCol);
      }
      injectExtendLink(row, ctx, trace);
    }
  }
  function applyDomOnlyFilter(doc, ctx, nowMs) {
    const table = findUserTraceFlagsTable(doc);
    if (!table) return;
    const expCol = findExpirationColumnIndex(table);
    const rows = findUserTraceFlagRows(doc).filter((r) => !r.hasAttribute?.("data-sfoc-utf-synthetic"));
    const dateOrder = detectDateOrderFromRows(rows, expCol);
    const filterOn = activeOnlyFilter;
    clearSyntheticTraceRows(doc);
    setUserTraceFlagsPagerHidden(doc, filterOn);
    for (const row of rows) {
      const state = resolveRowFilterState(row, expCol, dateOrder, nowMs, null);
      const hide = filterOn && state.known && !state.visible;
      setRowFilteredHidden(row, hide);
      if (!hide && state.recentlyExpired) {
        ensureExpiredBadge(row, sfInjectT(ctx.lang, "sfInject.userTraceFlags.badgeExpired"), expCol);
      } else {
        removeExpiredBadge(row);
      }
    }
  }
  function applyFilterAndBadges(doc, ctx, catalog) {
    const nowMs = Date.now();
    if (!activeOnlyFilter) {
      clearSyntheticTraceRows(doc);
      setUserTraceFlagsPagerHidden(doc, false);
      restoreAllUserTraceFlagRows(doc);
      const table = findUserTraceFlagsTable(doc);
      if (!table || !catalog) return;
      const expCol = findExpirationColumnIndex(table);
      const rows = findUserTraceFlagRows(doc);
      const dateOrder = detectDateOrderFromRows(rows, expCol);
      for (const row of rows) {
        const trace = matchTraceForRow(row, catalog);
        const state = resolveRowFilterState(row, expCol, dateOrder, nowMs, trace);
        if (state.recentlyExpired) {
          ensureExpiredBadge(row, sfInjectT(ctx.lang, "sfInject.userTraceFlags.badgeExpired"), expCol);
        } else {
          removeExpiredBadge(row);
        }
        if (trace) injectExtendLink(row, ctx, trace);
      }
      return;
    }
    if (catalog?.ok && Array.isArray(catalog.list)) {
      renderApiFilteredView(doc, ctx, { list: catalog.list }, nowMs);
      return;
    }
    applyDomOnlyFilter(doc, ctx, nowMs);
  }
  async function injectUserTraceFlagsEnhance(doc, ctx) {
    if (injectInFlight2) return;
    injectInFlight2 = true;
    try {
      if (!isUserTraceFlagsDocument(doc)) return;
      restoreAllUserTraceFlagRows(doc);
      ensureFilterCheckbox(
        doc,
        sfInjectT(ctx.lang, "sfInject.userTraceFlags.filterLabel"),
        activeOnlyFilter,
        (next) => {
          activeOnlyFilter = next;
          if (!next) {
            clearSyntheticTraceRows(doc);
            setUserTraceFlagsPagerHidden(doc, false);
            restoreAllUserTraceFlagRows(doc);
          }
          void saveSfInjectPrefsRemote({ userTraceFlagsActiveOnly: next }).then((res) => {
            if (!res?.ok) {
              ctx.onError?.(sfInjectT(ctx.lang, "sfInject.userTraceFlags.extendError"));
            }
          });
          void fetchTracesCached(ctx.orgId).then((catalog2) => {
            applyFilterAndBadges(doc, ctx, catalog2);
          });
        }
      );
      if (!activeOnlyFilter) {
        applyFilterAndBadges(doc, ctx, null);
      }
      const catalog = await fetchTracesCached(ctx.orgId);
      if (catalog && !catalog.ok && !catalogErrorToasted) {
        catalogErrorToasted = true;
        const msg = catalog.error === "NO_SID" ? sfInjectT(ctx.lang, "sfInject.userTraceFlags.errorNoSession") : catalog.error === "ORG_NOT_SAVED" ? sfInjectT(ctx.lang, "sfInject.userTraceFlags.errorOrgNotSaved") : sfInjectT(ctx.lang, "sfInject.userTraceFlags.extendError");
        showInjectToast(msg, true);
      }
      applyFilterAndBadges(doc, ctx, catalog);
      if (doc.documentElement) {
        doc.documentElement.setAttribute("data-sfoc-inject-status", "active");
      }
    } finally {
      injectInFlight2 = false;
    }
  }
  function mountUserTraceFlagsEnhance(doc, ctx) {
    tracesCatalogPromise = null;
    catalogErrorToasted = false;
    activeOnlyFilter = readActiveOnlyPref(ctx);
    void injectUserTraceFlagsEnhance(doc, ctx).catch(() => {
    });
    return () => {
    };
  }
  function isParentDebugLogsHomePage3() {
    try {
      return isApexDebugLogsInjectPage(window.top.location.href);
    } catch {
      return isApexDebugLogsInjectPage(location.href);
    }
  }
  var userTraceFlagsEnhanceIntegration = {
    id: INTEGRATION_ID3,
    isParentPageActive: isParentDebugLogsHomePage3,
    isFrameRelevant: isUserTraceFlagsDocument,
    mount(doc, ctx) {
      return mountUserTraceFlagsEnhance(doc, ctx);
    },
    retryInject(doc, ctx) {
      if (isUserTraceFlagsDocument(doc)) {
        void injectUserTraceFlagsEnhance(doc, ctx);
      }
    }
  };

  // sfInject/content/matchers/deployStatusPages.js
  var DEPLOY_STATUS_SETUP_RE = /^\/lightning\/setup\/DeployStatus\/(?:page|home)\/?$/i;
  var DEPLOY_STATUS_CLASSIC_FRAME_RE = /^\/changemgmt\/monitorDeployment\.apexp$/i;
  var DEPLOY_STATUS_DETAIL_CLASSIC_FRAME_RE = /^\/changemgmt\/monitorDeploymentsDetails\.apexp$/i;
  function toUrl2(value) {
    if (!value) return null;
    try {
      return value instanceof URL ? value : new URL(String(value), "https://example.invalid");
    } catch {
      return null;
    }
  }
  function isSalesforceHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return [
      ".lightning.force.com",
      ".salesforce-setup.com",
      ".my.salesforce-setup.com",
      ".my.salesforce.com",
      ".salesforce.com"
    ].some((suffix) => host.endsWith(suffix));
  }
  function isDeployStatusSetupPage(value) {
    const url = toUrl2(value);
    return !!(url && isSalesforceHost(url.hostname) && DEPLOY_STATUS_SETUP_RE.test(url.pathname));
  }
  function isDeployStatusClassicFrame(value) {
    const url = toUrl2(value);
    return !!(url && isSalesforceHost(url.hostname) && DEPLOY_STATUS_CLASSIC_FRAME_RE.test(url.pathname));
  }
  function isDeployStatusInjectPage(value) {
    return isDeployStatusSetupPage(value) || isDeployStatusClassicFrame(value);
  }
  function isDeployStatusDetailSetupPage(value) {
    const url = toUrl2(value);
    if (!url || !isSalesforceHost(url.hostname) || !DEPLOY_STATUS_SETUP_RE.test(url.pathname)) return false;
    let address = url.searchParams.get("address") || "";
    try {
      address = decodeURIComponent(address);
    } catch {
    }
    return /^\/changemgmt\/monitorDeploymentsDetails\.apexp(?:[?&]|$)/i.test(address);
  }
  function isDeployStatusDetailClassicFrame(value) {
    const url = toUrl2(value);
    return !!(url && isSalesforceHost(url.hostname) && DEPLOY_STATUS_DETAIL_CLASSIC_FRAME_RE.test(url.pathname));
  }
  function isDeployStatusDetailInjectPage(value) {
    return isDeployStatusDetailSetupPage(value) || isDeployStatusDetailClassicFrame(value);
  }

  // sfInject/content/injectors/deployStatusInlineDetailsDom.js
  var INTEGRATION_ID4 = "deployStatusInlineDetails";
  var FAILED_TABLE_SELECTOR = 'table[id$=":FailedDeploymentsList"]';
  var FAILED_TBODY_SELECTOR = 'tbody[id$=":FailedDeploymentsList:tb"]';
  var ASYNC_ID_RE = /\b(0Af[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)\b/;
  function normalizeDeployAsyncId(value) {
    const match = String(value || "").match(ASYNC_ID_RE);
    return match ? match[1] : null;
  }
  function extractDeployAsyncIdFromRow(row) {
    if (!row) return null;
    const cell2 = row.querySelector('td[id$=":name"]');
    const fromCell = normalizeDeployAsyncId(cell2?.textContent || "");
    if (fromCell) return fromCell;
    for (const link of row.querySelectorAll("a[href]")) {
      const fromHref = normalizeDeployAsyncId(link.getAttribute("href") || "");
      if (fromHref) return fromHref;
    }
    return null;
  }
  function findFailedDeploymentsTable(doc) {
    return doc?.querySelector(FAILED_TABLE_SELECTOR) || null;
  }
  function findFailedDeploymentRows(doc) {
    const table = findFailedDeploymentsTable(doc);
    if (!table) return [];
    const tbody = table.querySelector(FAILED_TBODY_SELECTOR) || table.tBodies?.[0];
    if (!tbody) return [];
    return [...tbody.querySelectorAll(":scope > tr.dataRow")];
  }
  function isDeployStatusTableDocument(doc) {
    return !!findFailedDeploymentsTable(doc);
  }
  function findDeployActionCell(row) {
    return row?.querySelector("td.actionColumn") || null;
  }
  function deployRowColspan(row) {
    return Math.max(1, row?.querySelectorAll(":scope > td, :scope > th").length || 1);
  }
  function normalizeComponentType(value) {
    return String(value || "").replace(/[\s_\-]/g, "").toLowerCase();
  }
  function isApexClassComponent(value) {
    return normalizeComponentType(value) === "apexclass";
  }
  function extractApexClassAndLineFromStackTrace(stackTrace) {
    const text = String(stackTrace || "");
    const match = /Class\.([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z_][A-Za-z0-9_]*:\s*line\s+(\d+)/i.exec(text);
    if (!match) return { className: "", initialLine: void 0 };
    const initialLine = Number(match[2]);
    return { className: match[1], initialLine: Number.isSafeInteger(initialLine) && initialLine > 0 ? initialLine : void 0 };
  }
  function asRows(value) {
    return Array.isArray(value) ? value : [];
  }
  function buildDeployDetailModel(detail) {
    const soap = detail?.soap || detail || {};
    const componentFailures = asRows(soap.componentFailures).map((item) => ({
      fullName: String(item?.fullName || ""),
      componentType: String(item?.componentType || ""),
      lineNumber: Number.isFinite(Number(item?.lineNumber)) ? Number(item.lineNumber) : null,
      columnNumber: Number.isFinite(Number(item?.columnNumber)) ? Number(item.columnNumber) : null,
      problem: String(item?.problem || ""),
      problemType: String(item?.problemType || ""),
      fileName: String(item?.fileName || "")
    }));
    const testFailures = asRows(soap.runTestResult?.failures).map((item) => ({
      className: String(item?.className || ""),
      methodName: String(item?.methodName || ""),
      message: String(item?.message || ""),
      stackTrace: String(item?.stackTrace || ""),
      time: String(item?.time || "")
    }));
    return {
      componentFailures,
      testFailures,
      errorMessage: String(soap.errorMessage || detail?.row?.errorMessage || ""),
      coverageWarnings: asRows(soap.runTestResult?.codeCoverageWarnings).map((item) => String(item?.message || item || "")).filter(Boolean)
    };
  }

  // sfInject/content/injectors/deployStatusInlineDetails.js
  function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function sectionTitle(doc, text) {
    return el(doc, "h3", "sfoc-deploy-inline-title", text);
  }
  function appendCell(row, value, className = "") {
    row.appendChild(el(row.ownerDocument, "td", className, value || "\u2014"));
  }
  function appendTable(doc, headers, rows) {
    const table = el(doc, "table", "sfoc-deploy-inline-table");
    const thead = doc.createElement("thead");
    const hr = doc.createElement("tr");
    headers.forEach((header) => hr.appendChild(el(doc, "th", "", header)));
    thead.appendChild(hr);
    const tbody = doc.createElement("tbody");
    rows.forEach((row) => tbody.appendChild(row));
    table.append(thead, tbody);
    return table;
  }
  function errorText(res, lang) {
    if (res?.reason === "NO_SID") return sfInjectT(lang, "sfInject.deployStatus.errorNoSession");
    if (res?.reason === "ORG_NOT_SAVED") return sfInjectT(lang, "sfInject.deployStatus.errorOrgNotSaved");
    return res?.error || sfInjectT(lang, "sfInject.deployStatus.errorLoad");
  }
  function validLine(value) {
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : void 0;
  }
  function createRenderer(doc, ctx) {
    const apexHint = sfInjectT(ctx.lang, "sfInject.deployStatus.openApex");
    const apexLink = (className, initialLine) => {
      const link = el(doc, "a", "sfoc-deploy-inline-apex", className);
      link.href = "#";
      link.title = apexHint;
      link.setAttribute("aria-label", `${className}. ${apexHint}`);
      link.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!event.ctrlKey && !event.metaKey) return;
        void openDeployStatusApexSource({ orgId: ctx.orgId, className, initialLine }).then((res) => {
          if (!res?.ok) ctx.onError?.(errorText(res, ctx.lang).replace(sfInjectT(ctx.lang, "sfInject.deployStatus.errorLoad"), sfInjectT(ctx.lang, "sfInject.deployStatus.errorOpenApex")));
        });
      });
      return link;
    };
    return (panel, model) => {
      panel.replaceChildren();
      const hasComponents = model.componentFailures.length > 0;
      const hasTests = model.testFailures.length > 0;
      if (hasComponents) {
        panel.appendChild(sectionTitle(doc, sfInjectT(ctx.lang, "sfInject.deployStatus.components")));
        const rows = model.componentFailures.map((failure) => {
          const row = doc.createElement("tr");
          if (isApexClassComponent(failure.componentType) && failure.fullName) {
            const cell2 = doc.createElement("td");
            cell2.appendChild(apexLink(failure.fullName, validLine(failure.lineNumber)));
            row.appendChild(cell2);
          } else appendCell(row, failure.fullName);
          appendCell(row, failure.componentType);
          appendCell(row, failure.lineNumber);
          appendCell(row, failure.columnNumber);
          const message = failure.problem;
          const secondary = [failure.problemType, failure.fileName].filter(Boolean).join(" \xB7 ");
          const messageCell = el(doc, "td", "", message || "\u2014");
          if (secondary) messageCell.appendChild(el(doc, "div", "sfoc-deploy-inline-secondary", secondary));
          row.appendChild(messageCell);
          return row;
        });
        panel.appendChild(appendTable(doc, [
          sfInjectT(ctx.lang, "sfInject.deployStatus.apiName"),
          sfInjectT(ctx.lang, "sfInject.deployStatus.type"),
          sfInjectT(ctx.lang, "sfInject.deployStatus.line"),
          sfInjectT(ctx.lang, "sfInject.deployStatus.column"),
          sfInjectT(ctx.lang, "sfInject.deployStatus.errorMessage")
        ], rows));
      }
      if (hasTests) {
        panel.appendChild(sectionTitle(doc, sfInjectT(ctx.lang, "sfInject.deployStatus.tests")));
        const rows = model.testFailures.map((failure) => {
          const row = doc.createElement("tr");
          const pos = extractApexClassAndLineFromStackTrace(failure.stackTrace);
          const className = failure.className || pos.className;
          if (className) {
            const cell2 = doc.createElement("td");
            cell2.appendChild(apexLink(className, pos.initialLine));
            row.appendChild(cell2);
          } else appendCell(row, "");
          appendCell(row, failure.methodName);
          appendCell(row, failure.message);
          appendCell(row, failure.stackTrace, "sfoc-deploy-inline-stack");
          appendCell(row, failure.time);
          return row;
        });
        panel.appendChild(appendTable(doc, [
          sfInjectT(ctx.lang, "sfInject.deployStatus.apexClass"),
          sfInjectT(ctx.lang, "sfInject.deployStatus.testMethod"),
          sfInjectT(ctx.lang, "sfInject.deployStatus.errorMessage"),
          sfInjectT(ctx.lang, "sfInject.deployStatus.stackTrace"),
          sfInjectT(ctx.lang, "sfInject.deployStatus.time")
        ], rows));
      }
      if (model.errorMessage) panel.append(sectionTitle(doc, sfInjectT(ctx.lang, "sfInject.deployStatus.globalError")), el(doc, "div", "sfoc-deploy-inline-message", model.errorMessage));
      if (model.coverageWarnings.length) panel.append(sectionTitle(doc, sfInjectT(ctx.lang, "sfInject.deployStatus.coverageWarnings")), el(doc, "div", "sfoc-deploy-inline-message", model.coverageWarnings.join(" \xB7 ")));
      if (!hasComponents && !hasTests && !model.errorMessage && !model.coverageWarnings.length) panel.appendChild(el(doc, "div", "sfoc-deploy-inline-empty", sfInjectT(ctx.lang, "sfInject.deployStatus.empty")));
    };
  }
  function mountDeployStatusInlineDetails(doc, ctx) {
    const openIds = /* @__PURE__ */ new Set();
    const detailCache = /* @__PURE__ */ new Map();
    const renderDetail = createRenderer(doc, ctx);
    let mounted = true;
    const detailIdFor = (asyncId) => `sfoc-deploy-inline-detail-${asyncId}`;
    const removeDetail = (asyncId) => doc.getElementById(detailIdFor(asyncId))?.remove();
    const showDetail = async (row, asyncId) => {
      removeDetail(asyncId);
      const detailRow = doc.createElement("tr");
      detailRow.id = detailIdFor(asyncId);
      detailRow.className = "sfoc-deploy-inline-detail-row";
      detailRow.setAttribute("data-sfoc-inject", INTEGRATION_ID4);
      detailRow.setAttribute("data-sfoc-async-id", asyncId);
      const cell2 = doc.createElement("td");
      cell2.colSpan = deployRowColspan(row);
      const panel = el(doc, "div", "sfoc-deploy-inline-panel");
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-live", "polite");
      panel.appendChild(el(doc, "div", "sfoc-deploy-inline-loading", sfInjectT(ctx.lang, "sfInject.deployStatus.loading")));
      cell2.appendChild(panel);
      detailRow.appendChild(cell2);
      row.after(detailRow);
      let response = detailCache.get(asyncId);
      if (!response) {
        const request = fetchDeployStatusInlineDetail(ctx.orgId, asyncId);
        detailCache.set(asyncId, request);
        response = request;
      }
      const res = await response;
      if (!res?.ok) {
        detailCache.delete(asyncId);
        if (!mounted || !openIds.has(asyncId) || !detailRow.isConnected) return;
        panel.replaceChildren();
        panel.appendChild(el(doc, "div", "sfoc-deploy-inline-error", errorText(res, ctx.lang)));
        const retry = el(doc, "button", "sfoc-deploy-inline-retry", sfInjectT(ctx.lang, "sfInject.deployStatus.retry"));
        retry.type = "button";
        retry.addEventListener("click", () => void showDetail(row, asyncId));
        panel.appendChild(retry);
        return;
      }
      detailCache.set(asyncId, res);
      if (!mounted || !openIds.has(asyncId) || !detailRow.isConnected) return;
      renderDetail(panel, buildDeployDetailModel(res.detail));
    };
    const inject = () => {
      for (const row of findFailedDeploymentRows(doc)) {
        const asyncId = extractDeployAsyncIdFromRow(row);
        const cell2 = findDeployActionCell(row);
        if (!asyncId || !cell2 || cell2.querySelector(`[data-sfoc-inject="${INTEGRATION_ID4}"]`)) continue;
        const button = el(doc, "button", "sfoc-deploy-inline-toggle", "\u203A");
        button.type = "button";
        button.setAttribute("data-sfoc-inject", INTEGRATION_ID4);
        button.setAttribute("data-sfoc-async-id", asyncId);
        button.setAttribute("aria-controls", detailIdFor(asyncId));
        button.setAttribute("aria-expanded", openIds.has(asyncId) ? "true" : "false");
        button.setAttribute("aria-label", sfInjectT(ctx.lang, openIds.has(asyncId) ? "sfInject.deployStatus.toggleClose" : "sfInject.deployStatus.toggleOpen"));
        button.title = button.getAttribute("aria-label") || "";
        button.addEventListener("click", () => {
          if (openIds.has(asyncId)) {
            openIds.delete(asyncId);
            removeDetail(asyncId);
            button.textContent = "\u203A";
            button.setAttribute("aria-expanded", "false");
            button.setAttribute("aria-label", sfInjectT(ctx.lang, "sfInject.deployStatus.toggleOpen"));
          } else {
            openIds.add(asyncId);
            button.textContent = "\u2304";
            button.setAttribute("aria-expanded", "true");
            button.setAttribute("aria-label", sfInjectT(ctx.lang, "sfInject.deployStatus.toggleClose"));
            void showDetail(row, asyncId);
          }
        });
        cell2.prepend(button);
        if (openIds.has(asyncId)) void showDetail(row, asyncId);
      }
    };
    const stopObserver = mountDebouncedDomObserver(doc, inject, { debounceMs: 250, cooldownMs: 30 });
    return () => {
      mounted = false;
      stopObserver();
      doc.querySelectorAll(`[data-sfoc-inject="${INTEGRATION_ID4}"]`).forEach((node) => node.remove());
    };
  }
  function isParentDeployStatusPage() {
    try {
      return isDeployStatusInjectPage(window.top.location.href);
    } catch {
      return isDeployStatusInjectPage(location.href);
    }
  }
  var deployStatusInlineDetailsIntegration = {
    id: INTEGRATION_ID4,
    isParentPageActive: isParentDeployStatusPage,
    isFrameRelevant: isDeployStatusTableDocument,
    mount: mountDeployStatusInlineDetails,
    retryInject(doc) {
      return isDeployStatusTableDocument(doc);
    }
  };

  // sfInject/content/injectors/deployStatusDetailSourceLinksDom.js
  var INTEGRATION_ID5 = "deployStatusDetailSourceLinks";
  var COMPONENT_ERRORS_SELECTOR = 'table[id$=":componentErrorsTable"], table.componentErrorsTable';
  var TEST_ERRORS_SELECTOR = 'table[id$=":testErrorsTable"], table.testErrorsTable, table[id$=":apexTestFailuresTable"], table.apexTestFailuresTable';
  function fallbackTableByHeading(doc, labels) {
    for (const block of doc?.querySelectorAll?.(".bPageBlock, .apexDefaultPageBlock") || []) {
      const heading = String(block.querySelector(".pbHeader .pbTitle, .pbHeader h1, .pbHeader h2, .pbHeader h3, .mainTitle")?.textContent || "").trim().toLowerCase();
      if (!labels.some((label) => heading === label)) continue;
      const table = block.querySelector("table.list");
      if (table) return table;
    }
    return null;
  }
  function findComponentErrorsTable(doc) {
    return doc?.querySelector(COMPONENT_ERRORS_SELECTOR) || fallbackTableByHeading(doc, ["component errors", "errores de componentes"]);
  }
  function findTestErrorsTable(doc) {
    return doc?.querySelector(TEST_ERRORS_SELECTOR) || fallbackTableByHeading(doc, ["test errors", "errores de prueba", "errores de tests", "apex test failures", "fallos de pruebas apex"]);
  }
  function isDeployStatusDetailDocument(doc) {
    return !!(findComponentErrorsTable(doc) || findTestErrorsTable(doc));
  }
  function findDetailRows(table) {
    const tbody = table?.querySelector('tbody[id$=":tb"]') || table?.tBodies?.[0];
    return tbody ? [...tbody.querySelectorAll(":scope > tr.dataRow")] : [];
  }
  function cell(row, suffix) {
    return row?.querySelector(`td[id$=":${suffix}"]`) || null;
  }
  function cellByHeader(row, labels) {
    const table = row?.closest?.("table");
    const headers = table ? [...table.querySelectorAll("thead th, tr.headerRow th, tr.headerRow td")] : [];
    const index = headers.findIndex((header) => {
      const value = String(header.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      return labels.some((label) => value === label || value.includes(label));
    });
    if (index < 0) return null;
    return row.querySelectorAll(":scope > td")[index] || null;
  }
  function extractComponentErrorRow(row) {
    const type = cell(row, "type")?.textContent?.trim() || "";
    const className = cell(row, "apiName")?.textContent?.trim() || "";
    const line = Number(cell(row, "line")?.textContent?.trim());
    return {
      className: /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(className) ? className : "",
      isApexClass: isApexClassComponent(type),
      initialLine: Number.isSafeInteger(line) && line > 0 ? line : void 0,
      classCell: cell(row, "apiName")
    };
  }
  function extractTestErrorRow(row) {
    const classCell = cell(row, "className") || cell(row, "class") || cell(row, "name") || row?.querySelector('td[id$=":testClass"]') || cellByHeader(row, ["class name", "test class", "clase"]);
    const stackCell = cell(row, "stackTrace") || row?.querySelector('td[id$=":stacktrace"]') || cell(row, "errorMessage") || cellByHeader(row, ["stack trace", "error message", "mensaje de error"]);
    const className = classCell?.textContent?.trim() || "";
    const frames = parseApexStackTraceFrames(stackCell?.textContent || "");
    return {
      className: /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(className) ? className : "",
      classCell,
      stackCell,
      initialLine: frames.find((frame) => frame.className === className)?.initialLine
    };
  }
  function parseApexStackTraceFrames(value) {
    const text = String(value || "");
    const frames = [];
    const re = /Class\.([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z_][A-Za-z0-9_]*:\s*line\s+(\d+)(?:,\s*column\s+\d+)?/gi;
    let match;
    while (match = re.exec(text)) {
      const initialLine = Number(match[2]);
      if (!Number.isSafeInteger(initialLine) || initialLine <= 0) continue;
      frames.push({ className: match[1], initialLine, start: match.index, end: match.index + match[0].length });
    }
    return frames;
  }
  function splitTestErrorMessage(value, frames = parseApexStackTraceFrames(value)) {
    const text = String(value || "");
    const stackLabel = /stack\s*trace\s*:/i.exec(text);
    const traceStart = stackLabel ? stackLabel.index : frames[0]?.start ?? text.length;
    return {
      message: text.slice(0, traceStart).trim(),
      trace: text.slice(traceStart),
      frames
    };
  }
  function findDetailSectionHeaderHost(table) {
    const block = table?.closest(".bPageBlock, .apexDefaultPageBlock") || table?.parentElement;
    return block?.querySelector(".pbHeader td:last-child") || null;
  }

  // sfInject/content/injectors/deployStatusDetailSourceLinks.js
  function sourceError(res, lang) {
    if (res?.reason === "NO_SID") return sfInjectT(lang, "sfInject.deployDetailSource.noSession");
    if (res?.reason === "ORG_NOT_SAVED") return sfInjectT(lang, "sfInject.deployDetailSource.orgNotSaved");
    if (res?.reason === "NOT_FOUND") return sfInjectT(lang, "sfInject.deployDetailSource.classNotFound");
    return res?.error || sfInjectT(lang, "sfInject.deployDetailSource.openError");
  }
  function mountDeployStatusDetailSourceLinks(doc, ctx) {
    let selectedOrgId = ctx.orgId || "";
    let orgs = [];
    let active = true;
    const selectorClass = "sfoc-deploy-detail-org-select";
    const openSource = (className, initialLine) => {
      if (!selectedOrgId) {
        ctx.onError?.(sfInjectT(ctx.lang, "sfInject.deployDetailSource.selectOrg"));
        return;
      }
      void openDeployStatusApexSource({ orgId: selectedOrgId, className, initialLine }).then((res) => {
        if (!res?.ok) ctx.onError?.(sourceError(res, ctx.lang));
      });
    };
    const createLink = (className, initialLine, label = className) => {
      const link = doc.createElement("a");
      link.className = "sfoc-deploy-detail-source-link";
      link.setAttribute("role", "link");
      link.tabIndex = 0;
      link.textContent = label;
      const hint = sfInjectT(ctx.lang, "sfInject.deployDetailSource.openHint");
      link.title = hint;
      link.setAttribute("aria-label", `${className}. ${hint}`);
      const activate = (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        event.stopPropagation();
        openSource(className, initialLine);
      };
      link.addEventListener("click", activate);
      link.addEventListener("keydown", (event) => {
        if ((event.key === "Enter" || event.key === " ") && (event.ctrlKey || event.metaKey)) activate(event);
      });
      return link;
    };
    const restoreCell = (cell2) => {
      const original = cell2.getAttribute("data-sfoc-detail-original");
      if (original == null) return;
      cell2.textContent = original;
      cell2.removeAttribute("data-sfoc-detail-original");
    };
    const injectComponentLinks = (table) => {
      for (const row of findDetailRows(table)) {
        const item = extractComponentErrorRow(row);
        if (!item.isApexClass || !item.className || !item.classCell || item.classCell.hasAttribute("data-sfoc-detail-original")) continue;
        item.classCell.setAttribute("data-sfoc-detail-original", item.classCell.textContent || "");
        item.classCell.replaceChildren(createLink(item.className, item.initialLine));
      }
    };
    const injectTestLinks = (table) => {
      for (const row of findDetailRows(table)) {
        const item = extractTestErrorRow(row);
        if (item.className && item.classCell && !item.classCell.hasAttribute("data-sfoc-detail-original")) {
          item.classCell.setAttribute("data-sfoc-detail-original", item.classCell.textContent || "");
          item.classCell.replaceChildren(createLink(item.className, item.initialLine));
        }
        if (!item.stackCell || item.stackCell.hasAttribute("data-sfoc-detail-original")) continue;
        const original = item.stackCell.textContent || "";
        const frames = parseApexStackTraceFrames(original);
        if (!frames.length) continue;
        item.stackCell.setAttribute("data-sfoc-detail-original", original);
        item.stackCell.classList.add("sfoc-deploy-detail-stack");
        const detail = splitTestErrorMessage(original, frames);
        const fragment = doc.createDocumentFragment();
        if (detail.message) {
          const message = doc.createElement("div");
          message.className = "sfoc-deploy-detail-error-message";
          message.textContent = detail.message;
          fragment.appendChild(message);
        }
        const stack = doc.createDocumentFragment();
        const traceOffset = original.length - detail.trace.length;
        let cursor = 0;
        for (const frame of frames) {
          const frameStart = frame.start - traceOffset;
          const frameEnd = frame.end - traceOffset;
          const between = detail.trace.slice(cursor, frameStart).replace(/stack\s*trace\s*:/ig, "").trim();
          if (between) {
            const note = doc.createElement("div");
            note.className = "sfoc-deploy-detail-stack-note";
            note.textContent = between;
            stack.appendChild(note);
          }
          const frameRow = doc.createElement("div");
          frameRow.className = "sfoc-deploy-detail-stack-frame";
          frameRow.appendChild(createLink(frame.className, frame.initialLine, original.slice(frame.start, frame.end)));
          stack.appendChild(frameRow);
          cursor = frameEnd;
        }
        const tail = detail.trace.slice(cursor).replace(/stack\s*trace\s*:/ig, "").trim();
        if (tail) {
          const note = doc.createElement("div");
          note.className = "sfoc-deploy-detail-stack-note";
          note.textContent = tail;
          stack.appendChild(note);
        }
        fragment.appendChild(stack);
        item.stackCell.replaceChildren(fragment);
      }
    };
    const syncSelects = () => {
      for (const select of doc.querySelectorAll(`select.${selectorClass}`)) select.value = selectedOrgId;
    };
    const createSelect = () => {
      const select = doc.createElement("select");
      select.className = selectorClass;
      select.setAttribute("data-sfoc-inject", INTEGRATION_ID5);
      select.setAttribute("aria-label", sfInjectT(ctx.lang, "sfInject.deployDetailSource.orgLabel"));
      select.title = sfInjectT(ctx.lang, "sfInject.deployDetailSource.orgLabel");
      if (!orgs.length) {
        const option = new Option(sfInjectT(ctx.lang, "sfInject.deployDetailSource.noOrgs"), "");
        select.appendChild(option);
        select.disabled = true;
        return select;
      }
      if (!selectedOrgId) select.appendChild(new Option(sfInjectT(ctx.lang, "sfInject.deployDetailSource.chooseOrg"), ""));
      for (const org of orgs) select.appendChild(new Option(org.label, org.id));
      select.value = selectedOrgId;
      select.addEventListener("change", () => {
        selectedOrgId = select.value || "";
        syncSelects();
      });
      return select;
    };
    const injectSelectors = () => {
      for (const table of [findComponentErrorsTable(doc), findTestErrorsTable(doc)].filter(Boolean)) {
        const host = findDetailSectionHeaderHost(table);
        if (!host || host.querySelector(`[data-sfoc-inject="${INTEGRATION_ID5}"]`)) continue;
        const wrap = doc.createElement("span");
        wrap.className = "sfoc-deploy-detail-org-picker";
        wrap.setAttribute("data-sfoc-inject", INTEGRATION_ID5);
        wrap.appendChild(createSelect());
        host.replaceChildren(wrap);
      }
    };
    const inject = () => {
      const components = findComponentErrorsTable(doc);
      const tests = findTestErrorsTable(doc);
      injectSelectors();
      if (components) injectComponentLinks(components);
      if (tests) injectTestLinks(tests);
    };
    const loadOrgs = async () => {
      const response = await fetchActiveSavedOrgsForDeployDetail();
      orgs = response?.ok && Array.isArray(response.orgs) ? response.orgs : [];
      if (!orgs.some((org) => org.id === selectedOrgId)) selectedOrgId = orgs.some((org) => org.id === ctx.orgId) ? ctx.orgId : "";
      doc.querySelectorAll(`[data-sfoc-inject="${INTEGRATION_ID5}"]`).forEach((node) => node.remove());
      if (active) inject();
    };
    const onStorageChanged = (changes, area) => {
      if (area === "sync" && (changes.savedOrgs || changes.savedOrgOrder || changes.orgAliases || changes.orgGroups)) void loadOrgs();
    };
    chrome.storage.onChanged.addListener(onStorageChanged);
    void loadOrgs();
    const stopObserver = mountDebouncedDomObserver(doc, inject, { debounceMs: 250, cooldownMs: 30 });
    return () => {
      active = false;
      stopObserver();
      chrome.storage.onChanged.removeListener(onStorageChanged);
      doc.querySelectorAll("[data-sfoc-detail-original]").forEach(restoreCell);
      doc.querySelectorAll(`[data-sfoc-inject="${INTEGRATION_ID5}"]`).forEach((node) => node.remove());
    };
  }
  function isParentDeployStatusDetailPage() {
    try {
      return isDeployStatusDetailInjectPage(window.top.location.href);
    } catch {
      return isDeployStatusDetailInjectPage(location.href);
    }
  }
  var deployStatusDetailSourceLinksIntegration = {
    id: INTEGRATION_ID5,
    requiresSavedOrg: false,
    isParentPageActive: isParentDeployStatusDetailPage,
    isFrameRelevant: isDeployStatusDetailDocument,
    mount: mountDeployStatusDetailSourceLinks,
    retryInject(doc) {
      return isDeployStatusDetailDocument(doc);
    }
  };

  // sfInject/content/injectors/registry.js
  var SF_INJECT_CONTENT_INTEGRATIONS = [
    debugLogOpenViewerIntegration,
    debugLogsTableOrderIntegration,
    userTraceFlagsEnhanceIntegration,
    deployStatusInlineDetailsIntegration,
    deployStatusDetailSourceLinksIntegration
  ];

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
      },
      {
        id: "userTraceFlagsEnhance",
        settingsLabelKey: "settings.sfInjectUserTraceFlagsEnhance",
        settingsHintKey: "settings.sfInjectUserTraceFlagsEnhanceHint"
      },
      {
        id: "deployStatusInlineDetails",
        settingsLabelKey: "settings.sfInjectDeployStatusInlineDetails",
        settingsHintKey: "settings.sfInjectDeployStatusInlineDetailsHint"
      },
      {
        id: "deployStatusDetailSourceLinks",
        settingsLabelKey: "settings.sfInjectDeployStatusDetailSourceLinks",
        settingsHintKey: "settings.sfInjectDeployStatusDetailSourceLinksHint"
      }
    ]
  );
  var SF_INJECT_INTEGRATION_IDS = SF_INJECT_SHIPPED.map((item) => item.id);

  // sfInject/lib/settings.js
  var DEFAULT_INTEGRATIONS = Object.fromEntries(
    SF_INJECT_INTEGRATION_IDS.map((id) => [id, false])
  );
  var DEFAULT_SF_INJECT_PREFS = {
    /** Filtro User Trace Flags: solo activas + caducadas ≤30 min. Default inactivo. */
    userTraceFlagsActiveOnly: false
  };
  var DEFAULTS = {
    /** Master toggle: opt-in; sin activación explícita no hay inyección. */
    enabled: false,
    /** Toggles por integración; opt-in (`true` solo si el usuario las activa). */
    integrations: { ...DEFAULT_INTEGRATIONS },
    /** Preferencias de comportamiento (no son toggles de integración). */
    prefs: { ...DEFAULT_SF_INJECT_PREFS }
  };
  var cache = structuredClone(DEFAULTS);
  function isSfInjectIntegrationEnabled(settings, integrationId) {
    const cfg = settings || cache;
    if (!cfg.enabled) return false;
    if (!SF_INJECT_INTEGRATION_IDS.includes(integrationId)) return false;
    return cfg.integrations?.[integrationId] === true;
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
    const enabledRelevantIntegrations = relevantIntegrations.filter(
      (item) => isSfInjectIntegrationEnabled(settings, item.id)
    );
    const allowsNoSavedOrg = enabledRelevantIntegrations.some((item) => item.requiresSavedOrg === false);
    const instanceUrl = instanceUrlFromLocation();
    const orgRes = await resolveActiveSavedOrg(instanceUrl);
    if ((!orgRes?.ok || !orgRes.orgId) && !allowsNoSavedOrg) {
      setInjectStatus("org-not-saved");
      teardownAll();
      return;
    }
    const lang = bootstrapRes.lang === "en" ? "en" : "es";
    const ctx = {
      orgId: orgRes?.ok && orgRes.orgId ? orgRes.orgId : "",
      lang,
      prefs: settings.prefs || {},
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
      if (!ctx.orgId && integration.requiresSavedOrg !== false) {
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
