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
    const unavailable = { ok: false, reason: "EXTENSION_CONTEXT_INVALIDATED" };
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.id) return Promise.resolve(unavailable);
      return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => unavailable);
    } catch {
      return Promise.resolve(unavailable);
    }
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

  // shared/htmlEntities.js
  function decodeHtmlEntities(value) {
    const named = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: "\xA0" };
    let text = String(value ?? "");
    for (let pass = 0; pass < 3; pass += 1) {
      const decoded = text.replace(/&(#x[\da-f]+|#\d+|amp|apos|quot|lt|gt|nbsp);/gi, (entity, token) => {
        const lower = token.toLowerCase();
        if (lower in named) return named[lower];
        const radix = lower.startsWith("#x") ? 16 : 10;
        const codePoint = Number.parseInt(lower.slice(radix === 16 ? 2 : 1), radix);
        if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 1114111) return entity;
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return entity;
        }
      });
      if (decoded === text) break;
      text = decoded;
    }
    return text;
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
  function decodeDeployHtmlEntities(value) {
    return decodeHtmlEntities(value);
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
  function asRows(value) {
    return Array.isArray(value) ? value : [];
  }
  function buildDeployDetailModel(detail) {
    const soap = detail?.soap || detail || {};
    const componentFailures = asRows(soap.componentFailures).map((item) => ({
      fullName: decodeDeployHtmlEntities(item?.fullName),
      componentType: decodeDeployHtmlEntities(item?.componentType),
      lineNumber: Number.isFinite(Number(item?.lineNumber)) ? Number(item.lineNumber) : null,
      columnNumber: Number.isFinite(Number(item?.columnNumber)) ? Number(item.columnNumber) : null,
      problem: decodeDeployHtmlEntities(item?.problem),
      problemType: decodeDeployHtmlEntities(item?.problemType),
      fileName: decodeDeployHtmlEntities(item?.fileName)
    }));
    const testFailures = asRows(soap.runTestResult?.failures).map((item) => ({
      className: decodeDeployHtmlEntities(item?.className),
      methodName: decodeDeployHtmlEntities(item?.methodName),
      message: decodeDeployHtmlEntities(item?.message),
      stackTrace: decodeDeployHtmlEntities(item?.stackTrace),
      time: decodeDeployHtmlEntities(item?.time)
    }));
    return {
      componentFailures,
      testFailures,
      errorMessage: decodeDeployHtmlEntities(soap.errorMessage || detail?.row?.errorMessage),
      coverageWarnings: asRows(soap.runTestResult?.codeCoverageWarnings).map((item) => decodeDeployHtmlEntities(item?.message || item)).filter(Boolean)
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
    row.appendChild(el(row.ownerDocument, "td", className, value == null || value === "" ? "\u2014" : value));
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
  function sourceError(res, lang) {
    if (res?.reason === "NO_SID") return sfInjectT(lang, "sfInject.deployDetailSource.noSession");
    if (res?.reason === "ORG_NOT_SAVED") return sfInjectT(lang, "sfInject.deployDetailSource.orgNotSaved");
    if (res?.reason === "NOT_FOUND") return sfInjectT(lang, "sfInject.deployDetailSource.classNotFound");
    return res?.error || sfInjectT(lang, "sfInject.deployDetailSource.openError");
  }
  function validLine(value) {
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : void 0;
  }
  function createRenderer(doc, ctx, sourceState) {
    const apexHint = sfInjectT(ctx.lang, "sfInject.deployDetailSource.openHint");
    const apexLink = (className, initialLine, label = className) => {
      const link = el(doc, "a", "sfoc-deploy-inline-apex", label);
      link.href = "#";
      link.title = apexHint;
      link.setAttribute("aria-label", `${className}. ${apexHint}`);
      link.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!event.ctrlKey && !event.metaKey) return;
        if (!sourceState.selectedOrgId) {
          ctx.onError?.(sfInjectT(ctx.lang, "sfInject.deployDetailSource.selectOrg"));
          return;
        }
        void openDeployStatusApexSource({ orgId: sourceState.selectedOrgId, className, initialLine }).then((res) => {
          if (!res?.ok) ctx.onError?.(sourceError(res, ctx.lang));
        });
      });
      return link;
    };
    const createOrgSelect = () => {
      const select = el(doc, "select", "sfoc-deploy-inline-org-select");
      select.setAttribute("aria-label", sfInjectT(ctx.lang, "sfInject.deployDetailSource.orgLabel"));
      select.title = sfInjectT(ctx.lang, "sfInject.deployDetailSource.orgLabel");
      if (!sourceState.orgs.length) {
        select.appendChild(new Option(sfInjectT(ctx.lang, "sfInject.deployDetailSource.noOrgs"), ""));
        select.disabled = true;
        return select;
      }
      if (!sourceState.selectedOrgId) select.appendChild(new Option(sfInjectT(ctx.lang, "sfInject.deployDetailSource.chooseOrg"), ""));
      for (const org of sourceState.orgs) select.appendChild(new Option(org.label, org.id));
      select.value = sourceState.selectedOrgId;
      select.addEventListener("change", () => {
        sourceState.selectedOrgId = select.value || "";
        sourceState.syncSelects();
      });
      return select;
    };
    const appendStackTraceCell = (row, value, fallbackClassName) => {
      const cell2 = el(doc, "td", "sfoc-deploy-inline-stack");
      const trace = String(value || "");
      const frames = parseApexStackTraceFrames(trace);
      if (!frames.length) {
        if (fallbackClassName && trace) cell2.appendChild(apexLink(fallbackClassName, void 0, trace));
        else cell2.textContent = trace || "\u2014";
        row.appendChild(cell2);
        return;
      }
      let cursor = 0;
      for (const frame of frames) {
        cell2.append(trace.slice(cursor, frame.start));
        cell2.appendChild(apexLink(frame.className, frame.initialLine, trace.slice(frame.start, frame.end)));
        cursor = frame.end;
      }
      cell2.append(trace.slice(cursor));
      row.appendChild(cell2);
    };
    return (panel, model) => {
      panel.replaceChildren();
      const sourcePicker = el(doc, "div", "sfoc-deploy-inline-org-picker");
      sourcePicker.appendChild(el(doc, "span", "sfoc-deploy-inline-org-label", sfInjectT(ctx.lang, "sfInject.deployDetailSource.orgLabel")));
      sourcePicker.appendChild(createOrgSelect());
      panel.appendChild(sourcePicker);
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
          const secondary = [failure.problemType, failure.fileName].filter(Boolean).join(" \xB7 ");
          const messageCell = el(doc, "td", "", failure.problem || "\u2014");
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
          const classFrame = parseApexStackTraceFrames(failure.stackTrace).find((frame) => frame.className === className);
          const initialLine = classFrame?.initialLine || pos.initialLine;
          if (className) {
            const cell2 = doc.createElement("td");
            cell2.appendChild(apexLink(className, initialLine));
            row.appendChild(cell2);
          } else appendCell(row, "");
          if (className && failure.methodName) {
            const cell2 = doc.createElement("td");
            cell2.appendChild(apexLink(className, initialLine, failure.methodName));
            row.appendChild(cell2);
          } else appendCell(row, failure.methodName);
          appendCell(row, failure.message);
          appendStackTraceCell(row, failure.stackTrace, className);
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
    const renderedDetails = /* @__PURE__ */ new Map();
    const sourceState = {
      selectedOrgId: ctx.orgId || "",
      orgs: [],
      syncSelects() {
        for (const select of doc.querySelectorAll("select.sfoc-deploy-inline-org-select")) select.value = sourceState.selectedOrgId;
      }
    };
    const renderDetail = createRenderer(doc, ctx, sourceState);
    let mounted = true;
    const detailIdFor = (asyncId) => `sfoc-deploy-inline-detail-${asyncId}`;
    const removeDetail = (asyncId) => {
      renderedDetails.delete(asyncId);
      doc.getElementById(detailIdFor(asyncId))?.remove();
    };
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
      const model = buildDeployDetailModel(res.detail);
      renderedDetails.set(asyncId, { panel, model });
      renderDetail(panel, model);
    };
    const loadSourceOrgs = async () => {
      const response = await fetchActiveSavedOrgsForDeployDetail();
      sourceState.orgs = response?.ok && Array.isArray(response.orgs) ? response.orgs : [];
      if (!sourceState.orgs.some((org) => org.id === sourceState.selectedOrgId)) sourceState.selectedOrgId = "";
      if (!mounted) return;
      for (const { panel, model } of renderedDetails.values()) {
        if (panel.isConnected) renderDetail(panel, model);
      }
    };
    const onStorageChanged = (changes, area) => {
      if (area === "sync" && (changes.savedOrgs || changes.savedOrgOrder || changes.orgAliases || changes.orgGroups)) void loadSourceOrgs();
    };
    chrome.storage.onChanged.addListener(onStorageChanged);
    void loadSourceOrgs();
    const inject = () => {
      for (const row of findFailedDeploymentRows(doc)) {
        const asyncId = extractDeployAsyncIdFromRow(row);
        const cell2 = findDeployActionCell(row);
        if (!asyncId || !cell2 || cell2.querySelector(`[data-sfoc-inject="${INTEGRATION_ID4}"]`)) continue;
        const button = el(doc, "button", "sfoc-deploy-inline-toggle");
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
            button.setAttribute("aria-expanded", "false");
            button.setAttribute("aria-label", sfInjectT(ctx.lang, "sfInject.deployStatus.toggleOpen"));
            button.title = button.getAttribute("aria-label") || "";
          } else {
            openIds.add(asyncId);
            button.setAttribute("aria-expanded", "true");
            button.setAttribute("aria-label", sfInjectT(ctx.lang, "sfInject.deployStatus.toggleClose"));
            button.title = button.getAttribute("aria-label") || "";
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
      chrome.storage.onChanged.removeListener(onStorageChanged);
      renderedDetails.clear();
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
    const frames = parseApexStackTraceFrames2(stackCell?.textContent || "");
    return {
      className: /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(className) ? className : "",
      classCell,
      stackCell,
      initialLine: frames.find((frame) => frame.className === className)?.initialLine
    };
  }
  function parseApexStackTraceFrames2(value) {
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
  function splitTestErrorMessage(value, frames = parseApexStackTraceFrames2(value)) {
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
  function sourceError2(res, lang) {
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
        if (!res?.ok) ctx.onError?.(sourceError2(res, ctx.lang));
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
        const frames = parseApexStackTraceFrames2(original);
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

  // sfInject/content/matchers/quickLinksPages.js
  var QUICK_LINKS_SALESFORCE_HOST_SUFFIXES = [
    ".salesforce.com",
    ".force.com",
    ".lightning.force.com",
    ".visual.force.com",
    ".vf.force.com",
    ".visualforce.com",
    ".cloudforce.com",
    ".salesforce-setup.com",
    ".my.salesforce-setup.com"
  ];
  function toUrl3(value) {
    if (!value) return null;
    try {
      return value instanceof URL ? value : new URL(String(value), "https://example.invalid");
    } catch {
      return null;
    }
  }
  function isSalesforceHost2(hostname) {
    const host = String(hostname || "").toLowerCase();
    return QUICK_LINKS_SALESFORCE_HOST_SUFFIXES.some(
      (suffix) => host.endsWith(suffix)
    );
  }
  function isQuickLinksSalesforcePage(value) {
    const url = toUrl3(value);
    return !!(url && isSalesforceHost2(url.hostname));
  }

  // sfInject/lib/quickLinkNavigation.js
  var RELATIVE_SALESFORCE_PATH = /^\/(?!\/)/;
  var SFOC_TOOL_MODES = Object.freeze({
    Comparator: "comparator",
    ApexTests: "development",
    ApexCoverageCompare: "development",
    QuickEdit: "development",
    LightningQuickEdit: "development",
    AnonymousApex: "development",
    QueryExplorer: "development",
    RestExplorer: "development",
    DebugLogBrowser: "development",
    EventMonitor: "development",
    FieldDependency: "analysis",
    DependencyExplorer: "analysis",
    PermissionDiff: "analysis",
    CustomSettingsCompare: "analysis",
    CustomMetadataCompare: "analysis",
    RecordCompare: "analysis",
    ObjectDescribe: "analysis",
    DataWorkbench: "analysis",
    EnvironmentStatus: "monitoring",
    OrgLimits: "monitoring",
    DeployStatus: "monitoring",
    BulkJobMonitor: "monitoring",
    SetupAuditTrail: "monitoring",
    FieldHistory: "monitoring",
    GeneratePackageXml: "manifests",
    MetadataTypeCompare: "manifests",
    PackageXml: "comparator"
  });
  function buildCustomQuickLinkUrl(path, origin = globalThis.location?.origin) {
    const relativePath = String(path || "").trim();
    if (!origin || !RELATIVE_SALESFORCE_PATH.test(relativePath)) return "";
    try {
      return new URL(relativePath, origin).href;
    } catch {
      return "";
    }
  }

  // sfInject/content/injectors/quickLinksTestButton.js
  var INTEGRATION_ID6 = "quickLinks";
  var INJECT_SELECTOR = `[data-sfoc-inject="${INTEGRATION_ID6}"]`;
  var INLINE_ICON_PATHS = Object.freeze({
    link: ["M10 13a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15", "M14 11a5 5 0 0 0-7.07 0l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15"],
    "arrows-diff": ["M7 3v11", "M7 3l-3 3", "M7 3l3 3", "M17 21V10", "M17 21l-3-3", "M17 21l3-3"],
    star: ["M12 3l2.8 5.7 6.2 .9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"],
    home: ["M3 11.5L12 4l9 7.5", "M5 10v10h14V10", "M9 20v-6h6v6"],
    settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.1 2.1-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56v.08h-3v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 7.08 15a1.7 1.7 0 0 0-1.56-1.04h-.08v-3h.08A1.7 1.7 0 0 0 7.08 9.92a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.1-2.1.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.04-1.56v-.08h3v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.1 2.1-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.04h.08v3h-.08A1.7 1.7 0 0 0 19.4 15z"],
    "terminal-2": ["M4 5h16v14H4z", "M7 9l3 3-3 3", "M13 15h4"],
    database: ["M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z", "M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6", "M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"],
    package: ["M4 7l8-4 8 4-8 4z", "M4 7v10l8 4 8-4V7", "M12 11v10"],
    activity: ["M3 12h4l2-7 4 14 2-7h6"],
    "shield-lock": ["M12 3l7 3v5c0 4.7-3 8-7 10-4-2-7-5.3-7-10V6z", "M9.5 12.5a2.5 2.5 0 1 1 5 0V15h-5z", "M12 10v1"],
    "help-circle": ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M9.5 9a2.5 2.5 0 1 1 4 2c-.8.6-1.5 1-1.5 2.5", "M12 17h.01"],
    "file-code": ["M6 3h8l4 4v14H6z", "M14 3v5h5", "M9 13l-2 2 2 2", "M15 13l2 2-2 2"],
    "external-link": ["M14 5h5v5", "M19 5l-8 8", "M18 14v5H5V6h5"],
    rocket: ["M5 16l-2 4 4-2 2-2", "M9 15l-3-3c2-4 5-7 10-8 1 5-4 9-7 11z", "M14 9h.01"],
    "database-search": ["M5 5c0-1.1 3.1-2 7-2s7 .9 7 2-3.1 2-7 2-7-.9-7-2z", "M5 5v6c0 1.1 3.1 2 7 2", "M5 11v6c0 1.1 3.1 2 7 2", "M18 18l3 3", "M17 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"]
  });
  function validQuickLinkColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "#0b5cab";
  }
  function humanizeToolId(value) {
    return String(value || "SFOC").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
  }
  function quickLinkLabel(link) {
    const label = String(link?.label || "").trim();
    return label || humanizeToolId(link?.toolId);
  }
  function createQuickLinkIcon(doc, iconName, color) {
    const icon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.classList.add("sfoc-quick-links-menu-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.style.setProperty("--quick-link-color", validQuickLinkColor(color));
    const safeIcon = String(iconName || "link").replace(/[^a-z0-9-]/gi, "") || "link";
    for (const pathData of INLINE_ICON_PATHS[safeIcon] || INLINE_ICON_PATHS.link) {
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData);
      icon.appendChild(path);
    }
    return icon;
  }
  function openSfocQuickLink(link, ctx, openInNewTab) {
    return sfInjectSend({
      type: "sfInject:openQuickLink",
      orgId: ctx.orgId,
      linkId: link.id,
      toolId: link.toolId,
      openInNewTab
    }).then((result) => {
      if (!result?.ok) ctx.onError?.("No se pudo abrir la herramienta en SFOC.");
    }).catch(() => ctx.onError?.("No se pudo abrir la herramienta en SFOC."));
  }
  function createQuickLinksMenu(doc, links, ctx) {
    const menu = doc.createElement("div");
    menu.className = "sfoc-quick-links-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Quick Links");
    const heading = doc.createElement("div");
    heading.className = "sfoc-quick-links-menu-heading";
    const headingTitle = doc.createElement("strong");
    headingTitle.textContent = "Quick Links";
    const orgName = String(ctx.orgLabel || "").trim();
    const headingOrg = doc.createElement("span");
    headingOrg.className = "sfoc-quick-links-menu-heading-org";
    headingOrg.textContent = orgName;
    const headingActions = doc.createElement("div");
    headingActions.className = "sfoc-quick-links-menu-heading-actions";
    headingActions.appendChild(headingOrg);
    const configure = doc.createElement("button");
    configure.type = "button";
    configure.className = "sfoc-quick-links-menu-configure";
    configure.title = "Configurar Quick Links";
    configure.setAttribute("aria-label", "Configurar Quick Links");
    configure.appendChild(createQuickLinkIcon(doc, "settings", "#0b5cab"));
    configure.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void sfInjectSend({ type: "sfInject:openQuickLinksSettings", orgId: ctx.orgId }).then((result) => {
        if (!result?.ok) ctx.onError?.("No se pudo abrir la configuraci\xF3n de Quick Links.");
      }).catch(() => ctx.onError?.("No se pudo abrir la configuraci\xF3n de Quick Links."));
    });
    headingActions.appendChild(configure);
    heading.append(headingTitle, headingActions);
    menu.appendChild(heading);
    let count = 0;
    for (const link of links) {
      if (!link || typeof link !== "object") continue;
      const href = link.type === "sfoc" ? "#" : buildCustomQuickLinkUrl(link.url);
      if (!href) continue;
      const row = doc.createElement("div");
      row.className = "sfoc-quick-links-menu-row";
      const option = doc.createElement("a");
      option.className = "sfoc-quick-links-menu-option";
      option.href = href;
      if (link.type === "sfoc") {
        option.addEventListener("click", (event) => {
          event.preventDefault();
          void openSfocQuickLink(link, ctx, false);
        });
      }
      option.setAttribute("role", "menuitem");
      option.appendChild(createQuickLinkIcon(doc, link.icon, link.color));
      const text = doc.createElement("span");
      text.className = "sfoc-quick-links-menu-text";
      const label = doc.createElement("strong");
      label.textContent = quickLinkLabel(link);
      text.appendChild(label);
      option.appendChild(text);
      const openNewTab = doc.createElement("button");
      openNewTab.type = "button";
      openNewTab.className = "sfoc-quick-links-menu-open-new-tab";
      openNewTab.title = "Abrir en una nueva pesta\xF1a";
      openNewTab.setAttribute("aria-label", "Abrir en una nueva pesta\xF1a");
      openNewTab.appendChild(createQuickLinkIcon(doc, "external-link", "#9dceff"));
      openNewTab.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (link.type === "sfoc") {
          void openSfocQuickLink(link, ctx, true);
        } else {
          window.open(href, "_blank", "noopener,noreferrer");
        }
      });
      row.append(option, openNewTab);
      menu.appendChild(row);
      count += 1;
    }
    return count ? menu : null;
  }
  function hasConfiguredQuickLinks(ctx) {
    return Array.isArray(ctx?.quickLinks) && ctx.quickLinks.length > 0;
  }
  function findQuickLinksActionsHost(doc) {
    const favoriteButton = doc.querySelector(
      "button.slds-global-actions__favorites-action, button.branding-favorites-star-button"
    );
    return favoriteButton?.closest("ul.slds-global-actions") || doc.querySelector("ul.slds-global-actions");
  }
  function removeQuickLinksTestButton(doc) {
    doc.querySelectorAll(INJECT_SELECTOR).forEach((node) => node.remove());
  }
  function injectQuickLinksTestButton(doc, ctx = {}) {
    if (doc.querySelector(INJECT_SELECTOR)) return;
    const actionsHost = findQuickLinksActionsHost(doc);
    if (!actionsHost) return;
    const item = doc.createElement("li");
    item.className = "slds-global-actions__item sfoc-quick-links-test-item";
    item.setAttribute("data-sfoc-inject", INTEGRATION_ID6);
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "slds-button sfoc-quick-links-button";
    button.setAttribute("aria-label", "Quick Links");
    const logo = doc.createElement("img");
    logo.className = "sfoc-quick-links-button-logo";
    logo.src = chrome.runtime.getURL("icons/icon-32.png");
    logo.alt = "";
    logo.setAttribute("aria-hidden", "true");
    const label = doc.createElement("span");
    label.className = "sfoc-quick-links-button-label";
    label.textContent = "Quick Links";
    button.append(logo, label);
    const menu = createQuickLinksMenu(doc, Array.isArray(ctx.quickLinks) ? ctx.quickLinks : [], ctx);
    if (menu) {
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      const setMenuOpen = (open) => {
        item.classList.toggle("is-open", open);
        button.setAttribute("aria-expanded", String(open));
      };
      item.addEventListener("pointerenter", () => setMenuOpen(true));
      item.addEventListener("pointerleave", () => setMenuOpen(false));
      item.addEventListener("focusin", () => setMenuOpen(true));
      item.addEventListener("focusout", (event) => {
        if (!item.contains(event.relatedTarget)) setMenuOpen(false);
      });
      button.addEventListener("click", () => setMenuOpen(!item.classList.contains("is-open")));
      item.append(button, menu);
    } else {
      item.appendChild(button);
    }
    const firstAction = actionsHost.querySelector(":scope > li.slds-global-actions__item");
    if (firstAction) actionsHost.insertBefore(item, firstAction);
    else actionsHost.appendChild(item);
  }
  function mountQuickLinksTestButton(doc, ctx) {
    if (!hasConfiguredQuickLinks(ctx)) {
      removeQuickLinksTestButton(doc);
      return () => {
      };
    }
    const inject = () => injectQuickLinksTestButton(doc, ctx);
    const stopObserver = mountDebouncedDomObserver(doc, inject, { debounceMs: 200, cooldownMs: 30 });
    return () => {
      stopObserver();
      removeQuickLinksTestButton(doc);
    };
  }
  function isParentQuickLinksPage() {
    try {
      return isQuickLinksSalesforcePage(window.top.location.href);
    } catch {
      return isQuickLinksSalesforcePage(location.href);
    }
  }
  var quickLinksIntegration = {
    id: INTEGRATION_ID6,
    requiresQuickLinks: true,
    isParentPageActive: isParentQuickLinksPage,
    isFrameRelevant: () => window.top === window,
    mount(doc, ctx) {
      return mountQuickLinksTestButton(doc, ctx);
    },
    retryInject(doc, ctx) {
      if (hasConfiguredQuickLinks(ctx)) injectQuickLinksTestButton(doc, ctx);
    }
  };

  // sfInject/content/setupPaletteCatalog.js
  var SETUP_PALETTE_PAGES = Object.freeze([{ "label": "Account Engagement > Analytics > B2B Marketing Analytics > Getting Started", "path": "/lightning/setup/B2BMAGettingStartedSetup/home" }, { "label": "Account Engagement > Analytics > B2B Marketing Analytics > Optional Features", "path": "/lightning/setup/B2BMAOptionalFeaturesSetup/home" }, { "label": "Account Engagement > Analytics > Object Sync", "path": "/lightning/setup/ObjectSyncForPardot/home" }, { "label": "Account Engagement > Business Unit Setup", "path": "/lightning/setup/PardotAccountSetup/home" }, { "label": "Account Engagement > Content Setup", "path": "/lightning/setup/MarketingEmailSetup/home" }, { "label": "Account Engagement > Copy to CMS", "path": "/lightning/setup/PardotContentConvergenceSetup/home" }, { "label": "Account Engagement > Engagement History", "path": "/lightning/setup/EngagementHistorySetup/home" }, { "label": "Account Engagement > Marketing App Extensions", "path": "/lightning/setup/MarketingAppExtension/home" }, { "label": "Account Engagement > Marketing Setup Home", "path": "/lightning/setup/PardotSetup/home" }, { "label": "Account Engagement > Setup Assistant", "path": "/lightning/setup/PardotSetupAssistant/home" }, { "label": "AgentExchange Offers", "path": "/lightning/setup/IsvTmOffersMarketplace/home" }, { "label": "Agentforce Coworker > Get Started with Agentforce Coworker", "path": "/lightning/setup/SentOs/home" }, { "label": "Agentforce for Sales > Agentforce Account Management", "path": "/lightning/setup/AgentforceAccountManagementGo/home" }, { "label": "Agentforce for Sales > Agentforce Pipeline Management", "path": "/lightning/setup/AgentforcePipelineManagementGo/home" }, { "label": "Agentforce for Sales > Agentforce Sales Coach", "path": "/lightning/setup/AgentforceSalesCoach/home" }, { "label": "Agentforce for Sales > Engagement", "path": "/lightning/setup/EinsteinSdr/home" }, { "label": "Apps > AgentExchange > Marketplace", "path": "/lightning/setup/AppExchangeMarketplace/home" }, { "label": "Apps > App Manager", "path": "/lightning/setup/NavigationMenus/home" }, { "label": "Apps > Builder Central (Beta)", "path": "/lightning/setup/BuilderCentralSetup/home" }, { "label": "Apps > Connected Apps > Connected Apps OAuth Usage", "path": "/lightning/setup/ConnectedAppsUsage/home" }, { "label": "Apps > Connected Apps > Manage Connected Apps", "path": "/lightning/setup/ConnectedApplication/home" }, { "label": "Apps > External Client Apps > External Client App Manager", "path": "/lightning/setup/ManageExternalClientApplication/home" }, { "label": "Apps > External Client Apps > OAuth Usage", "path": "/lightning/setup/ExternalClientApplicationOauthUsage/home" }, { "label": "Apps > External Client Apps > Settings", "path": "/lightning/setup/ExternalClientApplicationSettings/home" }, { "label": "Apps > Lightning Bolt > Flow Category", "path": "/lightning/setup/FlowCategory/home" }, { "label": "Apps > Lightning Bolt > Lightning Bolt Solutions", "path": "/lightning/setup/LightningBolt/home" }, { "label": "Apps > Lightning Out 2.0 Apps > Lightning Out 2.0 App Manager", "path": "/lightning/setup/LightningOut/home" }, { "label": "Apps > Mobile Apps > Mobile Publisher", "path": "/lightning/setup/mySalesforce/home" }, { "label": "Apps > Mobile Apps > Mobile Security", "path": "/lightning/setup/MobileSecurity/home" }, { "label": "Apps > Mobile Apps > Salesforce > Mobile Builder for Salesforce Mobile App Plus", "path": "/lightning/setup/MobileBuilderSapp/home" }, { "label": "Apps > Mobile Apps > Salesforce > Mobile Builder for the Seller-Focused Experience", "path": "/lightning/setup/SalesCloudMab/home" }, { "label": "Apps > Mobile Apps > Salesforce > Salesforce Branding", "path": "/lightning/setup/Salesforce1Branding/home" }, { "label": "Apps > Mobile Apps > Salesforce > Salesforce Navigation", "path": "/lightning/setup/ProjectOneAppMenu/home" }, { "label": "Apps > Mobile Apps > Salesforce > Salesforce Notifications", "path": "/lightning/setup/NotificationsSettings/home" }, { "label": "Apps > Mobile Apps > Salesforce > Salesforce Offline", "path": "/lightning/setup/MobileOfflineStorageAdmin/home" }, { "label": "Apps > Mobile Apps > Salesforce > Salesforce Settings", "path": "/lightning/setup/Salesforce1Settings/home" }, { "label": "Apps > Packaging > Installed Packages", "path": "/lightning/setup/ImportedPackage/home" }, { "label": "Apps > Packaging > Package Manager", "path": "/lightning/setup/Package/home" }, { "label": "Apps > Packaging > Package Usage", "path": "/lightning/setup/PackageUsageSummary/home" }, { "label": "Apps > React Development with Salesforce Multi-Framework", "path": "/lightning/setup/AgentforceVibesInReact/home" }, { "label": "Apps > Templated Apps > App Hub", "path": "/lightning/setup/AppHub/home" }, { "label": "Apps > Templated Apps > Templates", "path": "/lightning/setup/TemplateStudio/home" }, { "label": "Commerce Setup Assistant", "path": "/lightning/setup/CommerceSetupAssistant/home" }, { "label": "Company Settings > Business Hours", "path": "/lightning/setup/BusinessHours/home" }, { "label": "Company Settings > Calendar Settings > Public Calendars and Resources", "path": "/lightning/setup/Calendars/home" }, { "label": "Company Settings > Company Information", "path": "/lightning/setup/CompanyProfileInfo/home" }, { "label": "Company Settings > Data Protection and Privacy", "path": "/lightning/setup/ConsentManagement/home" }, { "label": "Company Settings > Fiscal Year", "path": "/lightning/setup/ForecastFiscalYear/home" }, { "label": "Company Settings > Holidays", "path": "/lightning/setup/Holiday/home" }, { "label": "Company Settings > Language Settings", "path": "/lightning/setup/LanguageSettings/home" }, { "label": "Company Settings > Manage Currencies", "path": "/lightning/setup/CompanyCurrency/home" }, { "label": "Company Settings > Maps and Location Settings", "path": "/lightning/setup/MapsAndLocationServicesSettings/home" }, { "label": "Company Settings > My Domain", "path": "/lightning/setup/OrgDomain/home" }, { "label": "Custom Code > Apex Classes", "path": "/lightning/setup/ApexClasses/home" }, { "label": "Custom Code > Apex Settings", "path": "/lightning/setup/ApexSettings/home" }, { "label": "Custom Code > Apex Triggers", "path": "/lightning/setup/ApexTriggers/home" }, { "label": "Custom Code > Application Test Execution", "path": "/lightning/setup/ApexTestQueue/home" }, { "label": "Custom Code > Application Test History", "path": "/lightning/setup/ApexTestHistory/home" }, { "label": "Custom Code > Canvas App Previewer", "path": "/lightning/setup/CanvasPreviewerUi/home" }, { "label": "Custom Code > Custom Metadata Types", "path": "/lightning/setup/CustomMetadata/home" }, { "label": "Custom Code > Custom Permissions", "path": "/lightning/setup/CustomPermissions/home" }, { "label": "Custom Code > Custom Settings", "path": "/lightning/setup/CustomSettings/home" }, { "label": "Custom Code > DataWeave Resources", "path": "/lightning/setup/DataWeaveResources/home" }, { "label": "Custom Code > Email Services", "path": "/lightning/setup/EmailToApexFunction/home" }, { "label": "Custom Code > Lightning Components > Debug Mode", "path": "/lightning/setup/UserDebugModeSetup/home" }, { "label": "Custom Code > Lightning Components > Lightning Components", "path": "/lightning/setup/LightningComponentBundles/home" }, { "label": "Custom Code > Lightning Components > Live Preview", "path": "/lightning/setup/LightningPreview/home" }, { "label": "Custom Code > Lightning Types", "path": "/lightning/setup/LightningTypes/home" }, { "label": "Custom Code > Platform Cache", "path": "/lightning/setup/PlatformCache/home" }, { "label": "Custom Code > Remote Access", "path": "/lightning/setup/RemoteAccess/home" }, { "label": "Custom Code > Static Resources", "path": "/lightning/setup/StaticResources/home" }, { "label": "Custom Code > Tools", "path": "/lightning/setup/ClientDevTools/home" }, { "label": "Custom Code > Visualforce Components", "path": "/lightning/setup/ApexComponents/home" }, { "label": "Custom Code > Visualforce Pages", "path": "/lightning/setup/ApexPages/home" }, { "label": "Data > Big Objects", "path": "/lightning/setup/BigObjects/home" }, { "label": "Data > Conversation Transcript Export", "path": "/lightning/setup/CssDataExport/home" }, { "label": "Data > Data Export", "path": "/lightning/setup/DataManagementExport/home" }, { "label": "Data > Data Integration Metrics", "path": "/lightning/setup/XCleanVitalsUi/home" }, { "label": "Data > Data Integration Rules", "path": "/lightning/setup/CleanRules/home" }, { "label": "Data > Duplicate Management > Duplicate Error Logs", "path": "/lightning/setup/DuplicateErrorLog/home" }, { "label": "Data > Duplicate Management > Duplicate Rules", "path": "/lightning/setup/DuplicateRules/home" }, { "label": "Data > Duplicate Management > Matching Rules", "path": "/lightning/setup/MatchingRules/home" }, { "label": "Data > Export Articles for Translation", "path": "/lightning/setup/ArticleExportForTranslation/home" }, { "label": "Data > Import Article Translations", "path": "/lightning/setup/ArticleImportTranslation/home" }, { "label": "Data > Import Articles", "path": "/lightning/setup/ArticleImport/home" }, { "label": "Data > Mass Delete Records", "path": "/lightning/setup/DataManagementDelete/home" }, { "label": "Data > Mass Reassign Account Teams", "path": "/lightning/setup/DataManagementMassAcctTeamReassign/home" }, { "label": "Data > Mass Reassign Opportunity Teams", "path": "/lightning/setup/DataManagementMassOppTeamReassign/home" }, { "label": "Data > Mass Transfer Approval Requests", "path": "/lightning/setup/DataManagementManageApprovals/home" }, { "label": "Data > Mass Transfer Records", "path": "/lightning/setup/DataManagementTransfer/home" }, { "label": "Data > Mass Update Addresses", "path": "/lightning/setup/DataManagementMassUpdateAddresses/home" }, { "label": "Data > Picklist Settings", "path": "/lightning/setup/PicklistSettings/home" }, { "label": "Data > Schema Settings", "path": "/lightning/setup/SchemaSettings/home" }, { "label": "Data > State and Country/Territory Picklists", "path": "/lightning/setup/AddressCleanerOverview/home" }, { "label": "Data > Storage Usage", "path": "/lightning/setup/CompanyResourceDisk/home" }, { "label": "Data Classification > Data Classification Download", "path": "/lightning/setup/DataClassificationDownload/home" }, { "label": "Data Classification > Data Classification Settings", "path": "/lightning/setup/DataClassificationSettings/home" }, { "label": "Data Classification > Data Classification Upload", "path": "/lightning/setup/DataClassificationUpload/home" }, { "label": "Data Cloud > Data Cloud Setup Home", "path": "/lightning/setup/CDPSetupHome/home" }, { "label": "Data Mask > Create with Einstein", "path": "/lightning/setup/DataMaskGptSetup/home" }, { "label": "Development > Agentforce Vibes Extension", "path": "/lightning/setup/EinsteinForDevelopers/home" }, { "label": "Development > Agentforce Vibes IDE", "path": "/lightning/setup/CodeBuilderSetup/home" }, { "label": "Development > Dev Hub", "path": "/lightning/setup/DevHub/home" }, { "label": "Development > DevOps Center", "path": "/lightning/setup/DevOpsCenterSetup/home" }, { "label": "Development > Scratch Orgs", "path": "/lightning/setup/ShapeGrantAccess/home" }, { "label": "Development > Web Console (Beta)", "path": "/lightning/setup/PlatformWebIdeSetup/home" }, { "label": "Einstein > Agentforce Data Library", "path": "/lightning/setup/EinsteinDataLibrary/home" }, { "label": "Einstein > Agentforce Gateway > Policies", "path": "/lightning/setup/AgentforceProtectionPolicies/home" }, { "label": "Einstein > Agentforce Registry > Registered APIs", "path": "/lightning/setup/ApiRegistry/home" }, { "label": "Einstein > Agentforce Registry > Registered MCP Servers", "path": "/lightning/setup/AgentforceRegistry/home" }, { "label": "Einstein > Einstein Account Engagement > Einstein Attribution", "path": "/lightning/setup/EinsteinAttribution/home" }, { "label": "Einstein > Einstein Account Engagement > Einstein Behavior Scoring", "path": "/lightning/setup/BehaviorScore/home" }, { "label": "Einstein > Einstein Account Engagement > Einstein Campaign Insights", "path": "/lightning/setup/CampaignInsights/home" }, { "label": "Einstein > Einstein Account Engagement > Einstein Engagement Frequency", "path": "/lightning/setup/PardotEngagementFrequency/home" }, { "label": "Einstein > Einstein Account Engagement > Einstein Key Accounts Identification", "path": "/lightning/setup/EKAI/home" }, { "label": "Einstein > Einstein Account Engagement > Einstein Lead Scoring", "path": "/lightning/setup/PardotEinsteinLeadIQ/home" }, { "label": "Einstein > Einstein Account Engagement > Send Time Optimization", "path": "/lightning/setup/SendTimeOptimization/home" }, { "label": "Einstein > Einstein for Marketing > Einstein Engagement Frequency", "path": "/lightning/setup/UmaEef/home" }, { "label": "Einstein > Einstein for Marketing > Einstein Engagement Scoring", "path": "/lightning/setup/UmaEes/home" }, { "label": "Einstein > Einstein for Marketing > Einstein Send Time Optimization (STO)", "path": "/lightning/setup/UmaSto/home" }, { "label": "Einstein > Einstein Generative AI > Einstein Autofill Setup", "path": "/lightning/setup/AIAutofillSettings/home" }, { "label": "Einstein > Einstein Generative AI > Einstein Setup", "path": "/lightning/setup/EinsteinGPTSetup/home" }, { "label": "Einstein > Einstein Generative AI > Flow Creation with Einstein", "path": "/lightning/setup/EinsteinForFlow/home" }, { "label": "Einstein > Einstein Generative AI > Setup with Agentforce", "path": "/lightning/setup/AgentforceSetup/home" }, { "label": "Einstein > Einstein Platform > Einstein Bots", "path": "/lightning/setup/EinsteinBots/home" }, { "label": "Einstein > Einstein Platform > Einstein Recommendation Builder", "path": "/lightning/setup/EinsteinRecommendation/home" }, { "label": "Einstein > Einstein Platform > Einstein.ai", "path": "/lightning/setup/EinsteinKeyManagement/home" }, { "label": "Einstein > Einstein Sales > Assisted Setup", "path": "/lightning/setup/SalesInsightsSetupAssistant/home" }, { "label": "Einstein > Einstein Sales > Einstein Activity Capture > Settings", "path": "/lightning/setup/ActivitySyncEngineSettingsMain/home" }, { "label": "Einstein > Einstein Sales > Einstein Conversation Insights > Delete Video Calls", "path": "/lightning/setup/VideoCallDelete/home" }, { "label": "Einstein > Einstein Sales > Einstein Conversation Insights > General Settings", "path": "/lightning/setup/CallCoachingSettings/home" }, { "label": "Einstein > Einstein Sales > Einstein for Sales", "path": "/lightning/setup/GPTEmailGeneration/home" }, { "label": "Einstein > Einstein Sales > Einstein Forecasting", "path": "/lightning/setup/ForecastingPrediction/home" }, { "label": "Einstein > Einstein Sales > Einstein Lead Scoring", "path": "/lightning/setup/LeadIQ/home" }, { "label": "Einstein > Einstein Sales > Einstein Opportunity Scoring", "path": "/lightning/setup/OpportunityIQSetupHome/home" }, { "label": "Einstein > Einstein Search > Promoted Search Terms", "path": "/lightning/setup/SearchPromotionRulesManagementPage/home" }, { "label": "Einstein > Einstein Search > Search Layouts", "path": "/lightning/setup/EinsteinSearchLayouts/home" }, { "label": "Einstein > Einstein Search > Search Manager > Analytics", "path": "/lightning/setup/SearchAnalytics/home" }, { "label": "Einstein > Einstein Search > Search Manager > Query Configurations", "path": "/lightning/setup/SearchConfiguration/home" }, { "label": "Einstein > Einstein Search > Search Manager > Search Setup", "path": "/lightning/setup/SearchIndex/home" }, { "label": "Einstein > Einstein Search > Settings", "path": "/lightning/setup/EinsteinSearchSettings/home" }, { "label": "Einstein > Einstein Search > Synonyms", "path": "/lightning/setup/ManageSynonyms/home" }, { "label": "Einstein > Industries Cloud Einstein > AI Accelerator", "path": "/lightning/setup/AIAccelerator/home" }, { "label": "Einstein > Industries Cloud Einstein > Einstein Relationship Insights", "path": "/lightning/setup/EinsteinSmartTags/home" }, { "label": "Einstein > Industries Cloud Einstein > Einstein Visit Recommendations", "path": "/lightning/setup/EinsteinVisits/home" }, { "label": "Einstein > Industries Cloud Einstein > Industries AI Setup", "path": "/lightning/setup/GenerativeAISetup/home" }, { "label": "Einstein > Industries Cloud Einstein > Scoring Framework", "path": "/lightning/setup/ScoringFramework/home" }, { "label": "Einstein > Opt Out of Customer Data Access", "path": "/lightning/setup/EinsteinOptOut/home" }, { "label": "Email > Apex Exception Email", "path": "/lightning/setup/ApexExceptionEmail/home" }, { "label": "Email > Authorized Email Domains", "path": "/lightning/setup/AuthorizedEmailDomains/home" }, { "label": "Email > Classic Email Templates", "path": "/lightning/setup/CommunicationTemplatesEmail/home" }, { "label": "Email > Classic Letterheads", "path": "/lightning/setup/CommunicationTemplatesLetterheads/home" }, { "label": "Email > Compliance BCC Email", "path": "/lightning/setup/SecurityComplianceBcc/home" }, { "label": "Email > Delete Attachments Sent as Links", "path": "/lightning/setup/EmailAttachmentManagement/home" }, { "label": "Email > Deliverability", "path": "/lightning/setup/OrgEmailSettings/home" }, { "label": "Email > DKIM Keys", "path": "/lightning/setup/EmailDKIMList/home" }, { "label": "Email > Email Address Internationalization", "path": "/lightning/setup/InternationalEmailAddresses/home" }, { "label": "Email > Email Attachments", "path": "/lightning/setup/EmailAttachmentSettings/home" }, { "label": "Email > Email Delivery Settings > Email Domain Filters", "path": "/lightning/setup/EmailDomainFilter/home" }, { "label": "Email > Email Delivery Settings > Email Relays", "path": "/lightning/setup/EmailRelay/home" }, { "label": "Email > Email Footers", "path": "/lightning/setup/EmailDisclaimers/home" }, { "label": "Email > Email to Salesforce", "path": "/lightning/setup/EmailToSalesforce/home" }, { "label": "Email > Enhanced Email", "path": "/lightning/setup/EnhancedEmail/home" }, { "label": "Email > Filter Email Tracking", "path": "/lightning/setup/FilterEmailTracking/home" }, { "label": "Email > Gmail Integration and Sync", "path": "/lightning/setup/LightningForGmailAndSyncSettings/home" }, { "label": "Email > Lightning Email Templates", "path": "/lightning/setup/LightningEmailTemplateSetup/home" }, { "label": "Email > Mail Merge Templates", "path": "/lightning/setup/CommunicationTemplatesWord/home" }, { "label": "Email > Organization-Wide Addresses", "path": "/lightning/setup/OrgWideEmailAddresses/home" }, { "label": "Email > Outlook Integration and Sync", "path": "/lightning/setup/LightningForOutlookAndSyncSettings/home" }, { "label": "Email > Send through External Email Services", "path": "/lightning/setup/EmailTransportServiceSetupPage/home" }, { "label": "Email > Test Deliverability", "path": "/lightning/setup/TestEmailDeliverability/home" }, { "label": "Enablement > Enablement Settings", "path": "/lightning/setup/EnablementPrograms/home" }, { "label": "Enablement > Partner Enablement Settings", "path": "/lightning/setup/ExternalEnablementPrograms/home" }, { "label": "Enablement Sites (myTrailhead) > Content Permissions Assistant", "path": "/lightning/setup/ContentPermissions/home" }, { "label": "Environments > Change Sets > Inbound Change Sets", "path": "/lightning/setup/InboundChangeSet/home" }, { "label": "Environments > Change Sets > Outbound Change Sets", "path": "/lightning/setup/OutboundChangeSet/home" }, { "label": "Environments > Deploy > Deployment Settings", "path": "/lightning/setup/DeploymentSettings/home" }, { "label": "Environments > Deploy > Deployment Status", "path": "/lightning/setup/DeployStatus/home" }, { "label": "Environments > Jobs > Apex Flex Queue", "path": "/lightning/setup/ApexFlexQueue/home" }, { "label": "Environments > Jobs > Apex Jobs", "path": "/lightning/setup/AsyncApexJobs/home" }, { "label": "Environments > Jobs > Background Jobs", "path": "/lightning/setup/ParallelJobsStatus/home" }, { "label": "Environments > Jobs > Bulk Data Load Jobs", "path": "/lightning/setup/AsyncApiJobStatus/home" }, { "label": "Environments > Jobs > Scheduled Jobs", "path": "/lightning/setup/ScheduledJobs/home" }, { "label": "Environments > Logs > Debug Logs", "path": "/lightning/setup/ApexDebugLogs/home" }, { "label": "Environments > Logs > Email Log Files", "path": "/lightning/setup/EmailLogFiles/home" }, { "label": "Environments > Monitoring > API Usage Notifications", "path": "/lightning/setup/MonitoringRateLimitingNotification/home" }, { "label": "Environments > Monitoring > Article Imports and Exports", "path": "/lightning/setup/DataManagementImportArticlesMonitoring/home" }, { "label": "Environments > Monitoring > Case Escalations", "path": "/lightning/setup/DataManagementManageCaseEscalation/home" }, { "label": "Environments > Monitoring > Email Snapshots", "path": "/lightning/setup/EmailCapture/home" }, { "label": "Environments > Monitoring > Entitlement Processes", "path": "/lightning/setup/DataManagementManageSlaProcess/home" }, { "label": "Environments > Monitoring > Outbound Messages", "path": "/lightning/setup/WorkflowOmStatus/home" }, { "label": "Environments > Monitoring > Time-Based Automations", "path": "/lightning/setup/DataManagementManageWorkflowQueue/home" }, { "label": "Environments > Sandboxes", "path": "/lightning/setup/DataManagementCreateTestInstance/home" }, { "label": "Environments > System Overview", "path": "/lightning/setup/SystemOverview/home" }, { "label": "Events > Event Manager", "path": "/lightning/setup/EventManager/home" }, { "label": "Events > Event Relays", "path": "/lightning/setup/EventRelay/home" }, { "label": "Events > Event Studio", "path": "/lightning/setup/EventHome/home" }, { "label": "Feature Settings > Account Relationship Data Sharing Rule > Account Relationship Data Sharing Rule Settings", "path": "/lightning/setup/ARSSettings/home" }, { "label": "Feature Settings > Action Plan Template Settings", "path": "/lightning/setup/APTSetupPage/home" }, { "label": "Feature Settings > Actionable Event Orchestration > Actionable Event Orchestration Settings", "path": "/lightning/setup/EventOrchestrationSettings/home" }, { "label": "Feature Settings > Actionable Relationship Center", "path": "/lightning/setup/ActionableRelationshipCenter/home" }, { "label": "Feature Settings > Analytics > Analytics > Allowlist", "path": "/lightning/setup/CSPFrameAncestors/home" }, { "label": "Feature Settings > Analytics > Analytics > Data Prep Settings", "path": "/lightning/setup/InsightsRecipeConfigurationSettings/home" }, { "label": "Feature Settings > Analytics > Analytics > Getting Started", "path": "/lightning/setup/InsightsSetupGettingStarted/home" }, { "label": "Feature Settings > Analytics > Analytics > Settings", "path": "/lightning/setup/InsightsSetupSettings/home" }, { "label": "Feature Settings > Analytics > Analytics > Sharing Inheritance Coverage Assessment", "path": "/lightning/setup/InsightsSetupSharingInheritanceCoverage/home" }, { "label": "Feature Settings > Analytics > Apps > App Install History", "path": "/lightning/setup/InsightsSetupAppHistoryControlPanel/home" }, { "label": "Feature Settings > Analytics > Apps > Auto-Installed Apps", "path": "/lightning/setup/InsightsSetupAutoInstalledApps/home" }, { "label": "Feature Settings > Analytics > Data Pipeline > Getting Started", "path": "/lightning/setup/SonicGettingStarted/home" }, { "label": "Feature Settings > Analytics > Einstein Discovery > Usage", "path": "/lightning/setup/EinsteinDiscoveryUsage/home" }, { "label": "Feature Settings > Analytics > Reports & Dashboards > Access Policies", "path": "/lightning/setup/SessionLevelPolicyUI/home" }, { "label": "Feature Settings > Analytics > Reports & Dashboards > Historical Trending", "path": "/lightning/setup/HistoricalTrendingUI/home" }, { "label": "Feature Settings > Analytics > Reports & Dashboards > Report Types", "path": "/lightning/setup/CustomReportTypeLightning/home" }, { "label": "Feature Settings > Analytics > Reports & Dashboards > Reporting Snapshots", "path": "/lightning/setup/AnalyticSnapshots/home" }, { "label": "Feature Settings > Analytics > Reports & Dashboards > Reports and Dashboards Settings", "path": "/lightning/setup/ReportUI/home" }, { "label": "Feature Settings > Analytics > Tableau > Tableau Embedding", "path": "/lightning/setup/TableauEmbeddingSettings/home" }, { "label": "Feature Settings > Analytics > Tableau > Tableau UAF Claims Definition", "path": "/lightning/setup/TableauUafClaimDefnSettings/home" }, { "label": "Feature Settings > Appraisal Management Settings", "path": "/lightning/setup/AppraisalManagementSettings/home" }, { "label": "Feature Settings > Approval Settings", "path": "/lightning/setup/ApprovalSetup/home" }, { "label": "Feature Settings > Automotive > Automotive Generative AI", "path": "/lightning/setup/AutomotiveGenerativeAISettings/home" }, { "label": "Feature Settings > Automotive > Automotive Settings", "path": "/lightning/setup/AutomotiveFoundationSettings/home" }, { "label": "Feature Settings > Benefit Actions", "path": "/lightning/setup/BenefitActionMapping/home" }, { "label": "Feature Settings > Billing > Billing Settings", "path": "/lightning/setup/BillingSettings/home" }, { "label": "Feature Settings > Business Rules Engine > Business Rules Engine Settings", "path": "/lightning/setup/BREDecisionTableAccess/home" }, { "label": "Feature Settings > Business Rules Engine > Object and Field Aliases", "path": "/lightning/setup/ExpressionSetObjectAlias/home" }, { "label": "Feature Settings > Channel Partner Inventory Tracking > Channel Partner Inventory Tracking Settings", "path": "/lightning/setup/ChannelInventory/home" }, { "label": "Feature Settings > Chatter > Chatter Settings", "path": "/lightning/setup/CollaborationSettings/home" }, { "label": "Feature Settings > Chatter > Email Settings", "path": "/lightning/setup/ChatterEmailSettings/home" }, { "label": "Feature Settings > Chatter > Feed Item > Feed Item Actions", "path": "/lightning/setup/FeedItemActions/home" }, { "label": "Feature Settings > Chatter > Feed Item > Feed Item Layouts", "path": "/lightning/setup/FeedItemLayouts/home" }, { "label": "Feature Settings > Chatter > Feed Tracking", "path": "/lightning/setup/FeedTracking/home" }, { "label": "Feature Settings > Chatter > Groups > Group Layouts", "path": "/lightning/setup/CollaborationGroupLayouts/home" }, { "label": "Feature Settings > Chatter > Groups > Group Member Triggers", "path": "/lightning/setup/CollaborationGroupMemberTriggers/home" }, { "label": "Feature Settings > Chatter > Groups > Group Record Triggers", "path": "/lightning/setup/CollaborationGroupRecordTriggers/home" }, { "label": "Feature Settings > Chatter > Groups > Group Triggers", "path": "/lightning/setup/CollaborationGroupTriggers/home" }, { "label": "Feature Settings > Chatter > Groups > Record Types", "path": "/lightning/setup/CollaborationGroupRecordTypes/home" }, { "label": "Feature Settings > Chatter > Influence", "path": "/lightning/setup/InfluenceSettings/home" }, { "label": "Feature Settings > Chatter > Triggers > FeedComment Triggers", "path": "/lightning/setup/FeedCommentTriggers/home" }, { "label": "Feature Settings > Chatter > Triggers > FeedItem Triggers", "path": "/lightning/setup/FeedItemTriggers/home" }, { "label": "Feature Settings > Clause Management > Clause Category Configuration", "path": "/lightning/setup/ClauseCatgConfiguration/home" }, { "label": "Feature Settings > CMDB and Service Graph > Asset Discovery", "path": "/lightning/setup/AssetDiscovery/home" }, { "label": "Feature Settings > CMDB and Service Graph > Configuration Management Database (CMDB)", "path": "/lightning/setup/ConfigurationMgmtDatabase/home" }, { "label": "Feature Settings > CMDB and Service Graph > Provisioning Settings", "path": "/lightning/setup/CMDBProvisionalSettings/home" }, { "label": "Feature Settings > Collections > Collections and Recovery Settings", "path": "/lightning/setup/CollectionPlanSettings/home" }, { "label": "Feature Settings > Collections > Guided Setup > Collections", "path": "/lightning/setup/CollectionsSetup/home" }, { "label": "Feature Settings > Commerce > Commerce Agentforce Settings", "path": "/lightning/setup/CommerceAgentSettings/home" }, { "label": "Feature Settings > Commerce > Settings", "path": "/lightning/setup/CommerceStoreEnable/home" }, { "label": "Feature Settings > Commerce > Store Configurations", "path": "/lightning/setup/CommerceStoreConfiguration/home" }, { "label": "Feature Settings > Commerce > Stores", "path": "/lightning/setup/CommerceStore/home" }, { "label": "Feature Settings > Communications Cloud > Services Setup", "path": "/lightning/setup/CommsServiceConsoleSettings/home" }, { "label": "Feature Settings > Connect to B2C Commerce > B2C Commerce Connections", "path": "/lightning/setup/ManageC2CSelfProvisioningConnections/home" }, { "label": "Feature Settings > Connected Services > Connected Asset Services", "path": "/lightning/setup/ConnectedAssetServices/home" }, { "label": "Feature Settings > Connected Services > Telemetry Definition and Action Management", "path": "/lightning/setup/TelemetryDefinitionAndActionManagement/home" }, { "label": "Feature Settings > Consumer Goods Cloud > Retail Execution Settings", "path": "/lightning/setup/RetailExecutionSettings/home" }, { "label": "Feature Settings > Context Service > Context Definitions", "path": "/lightning/setup/ContextManagementSetupNode/home" }, { "label": "Feature Settings > Context Service > Context Service Settings", "path": "/lightning/setup/ContextManagementAccess/home" }, { "label": "Feature Settings > Contract Lifecycle Management > General Settings", "path": "/lightning/setup/ClmGeneralSettings/home" }, { "label": "Feature Settings > Criteria-Based Search and Filter Settings > Criteria-Based Search and Filter", "path": "/lightning/setup/CriteriaBasedSearchAndFilter/home" }, { "label": "Feature Settings > Cross-Object Field History > Cross-Object Field History Settings", "path": "/lightning/setup/CrossObjectFieldHistorySettings/home" }, { "label": "Feature Settings > Data.com > Licenses & Limits", "path": "/lightning/setup/ViewLicensesAndLimits/home" }, { "label": "Feature Settings > Data.com > Prospector Preferences", "path": "/lightning/setup/DataDotComPreferences/home" }, { "label": "Feature Settings > Data.com > Prospector Users", "path": "/lightning/setup/ProspectingUsers/home" }, { "label": "Feature Settings > Decision Explainer > Application Subtype Definition", "path": "/lightning/setup/ApplicationSubtypeDefinition/home" }, { "label": "Feature Settings > Decision Explainer > Business Process Type Definition", "path": "/lightning/setup/BusinessProcessTypeDef/home" }, { "label": "Feature Settings > Decision Explainer > Explainability Action Definition", "path": "/lightning/setup/ExplainabilityActionDef/home" }, { "label": "Feature Settings > Decision Explainer > Explainability Action Version", "path": "/lightning/setup/ExplainabilityActionVersion/home" }, { "label": "Feature Settings > Decision Explainer > Explainability Message Template", "path": "/lightning/setup/ExplainabilityMsgTemplate/home" }, { "label": "Feature Settings > Decision Explainer > Expression Set Message Token", "path": "/lightning/setup/ExpressionSetMessageToken/home" }, { "label": "Feature Settings > Decision Tables", "path": "/lightning/setup/DecisionTables/home" }, { "label": "Feature Settings > Dialer > Dialer Settings", "path": "/lightning/setup/TalkSettings/home" }, { "label": "Feature Settings > Digital Experiences > All Sites", "path": "/lightning/setup/SetupNetworks/home" }, { "label": "Feature Settings > Digital Experiences > Pages", "path": "/lightning/setup/CommunityFlexiPageList/home" }, { "label": "Feature Settings > Digital Experiences > Salesforce CMS", "path": "/lightning/setup/SalesforceCMSSettings/home" }, { "label": "Feature Settings > Digital Experiences > Settings", "path": "/lightning/setup/NetworkSettings/home" }, { "label": "Feature Settings > Digital Experiences > Templates", "path": "/lightning/setup/CommunityTemplateDefinitionList/home" }, { "label": "Feature Settings > Digital Experiences > Themes", "path": "/lightning/setup/CommunityThemeDefinitionList/home" }, { "label": "Feature Settings > Digital Verification > Digital Verification Settings", "path": "/lightning/setup/HCDigitalVerificationSetup/home" }, { "label": "Feature Settings > Disclosure and Compliance Hub > Disclosure and Compliance Hub Settings", "path": "/lightning/setup/GdfPrefs/home" }, { "label": "Feature Settings > Disclosure and Compliance Hub > Disclosure Definition", "path": "/lightning/setup/DisclosureDefinition/home" }, { "label": "Feature Settings > Disclosure and Compliance Hub > Disclosure Definition Version", "path": "/lightning/setup/DisclosureDefinitionVersion/home" }, { "label": "Feature Settings > Disclosure and Compliance Hub > Disclosure Report Builder Settings", "path": "/lightning/setup/NetZeroDCHConfigurationSetup/home" }, { "label": "Feature Settings > Disclosure and Compliance Hub > Disclosure Type", "path": "/lightning/setup/DisclosureType/home" }, { "label": "Feature Settings > Discovery Framework > Assessments > Assessment Settings", "path": "/lightning/setup/EmailAssessmentSettings/home" }, { "label": "Feature Settings > Discovery Framework > Assessments > Prefill Assessment Question Settings", "path": "/lightning/setup/PrefillQuestionsSettings/home" }, { "label": "Feature Settings > Discovery Framework > General Settings", "path": "/lightning/setup/KycSettings/home" }, { "label": "Feature Settings > Document Checklist > Document Category", "path": "/lightning/setup/DocumentCategory/home" }, { "label": "Feature Settings > Document Checklist > Document Category Document Type", "path": "/lightning/setup/DocumentCategoryDocumentType/home" }, { "label": "Feature Settings > Document Checklist > Document Checklist Settings", "path": "/lightning/setup/DocumentChecklistSettings/home" }, { "label": "Feature Settings > Document Generation > Custom Fonts Configuration", "path": "/lightning/setup/CustomFontsSetup/home" }, { "label": "Feature Settings > Document Generation > Document Generation Settings", "path": "/lightning/setup/DocumentGenerationSetting/home" }, { "label": "Feature Settings > Document Generation > Electronic Signature Configuration", "path": "/lightning/setup/ESignatureConfig/home" }, { "label": "Feature Settings > Document Generation > Electronic Signature Envelope Config", "path": "/lightning/setup/ESignatureEnvelopeConfig/home" }, { "label": "Feature Settings > Document Generation > General Settings", "path": "/lightning/setup/GeneralSettings/home" }, { "label": "Feature Settings > Dynamic Revenue Orchestrator > Dynamic Common Orchestrator Advanced Settings", "path": "/lightning/setup/DynamicCommonOrchestratorSetupNode/home" }, { "label": "Feature Settings > Dynamic Revenue Orchestrator > Dynamic Revenue Orchestrator Settings", "path": "/lightning/setup/DynamicFulfillmentOrchestratorSetupNode/home" }, { "label": "Feature Settings > Education Cloud > Set Up Education Cloud", "path": "/lightning/setup/EducationCloudSettings/home" }, { "label": "Feature Settings > Field History Tracking", "path": "/lightning/setup/FieldHistoryTracking/home" }, { "label": "Feature Settings > Financial Services > Agentforce for Financial Services > Collections and Recovery Employee Assistance", "path": "/lightning/setup/CollectionAgentSettingsWrapper/home" }, { "label": "Feature Settings > Financial Services > Agentic Advisor", "path": "/lightning/setup/WealthAppSetup/home" }, { "label": "Feature Settings > Financial Services > Financial Account Settings", "path": "/lightning/setup/FscServiceExcellenceSettings/home" }, { "label": "Feature Settings > Financial Services > Financial Services Data Model Preference", "path": "/lightning/setup/FinancialServicesDatamodelPreference/home" }, { "label": "Feature Settings > Financial Services > General Settings", "path": "/lightning/setup/FscWealthSettings/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Action Plans", "path": "/lightning/setup/IndustriesActionPlanSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Actionable Relationship Center", "path": "/lightning/setup/ActionableRelationshipCenterSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Branch Management", "path": "/lightning/setup/BranchManagementSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Complaint Management", "path": "/lightning/setup/FscComplaintAnalytics/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Compliant Data Sharing", "path": "/lightning/setup/CompliantDataSharingSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Contextual Alerts", "path": "/lightning/setup/ContextualAlertSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Data Consumption Framework", "path": "/lightning/setup/DcfSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Document Checklist Items", "path": "/lightning/setup/DocumentChecklistItemSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Financial Account Management", "path": "/lightning/setup/ServiceExcellenceSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Group Membership and Households", "path": "/lightning/setup/HouseholdSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Intelligent Document Automation", "path": "/lightning/setup/IntelligentDocumentAutomationSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Interaction Summaries", "path": "/lightning/setup/InteractionSummariesSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Interest Tags", "path": "/lightning/setup/InterestTagsSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Life Events", "path": "/lightning/setup/LifeEventsSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Record Alert Access", "path": "/lightning/setup/CustomSharingRecordAlertSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Record Alerts", "path": "/lightning/setup/RecordAlertSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Record Alerts Using Business Rules Engine", "path": "/lightning/setup/BreRecordAlertSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Record Alerts Using Data Consumption Framework", "path": "/lightning/setup/DcfRecordAlertSetup/home" }, { "label": "Feature Settings > Financial Services > Guided Setup > Record Association Builder", "path": "/lightning/setup/RecordAssociationBuilderSetup/home" }, { "label": "Feature Settings > Financial Services > Interaction Summary Settings", "path": "/lightning/setup/InteractionSummarySettings/home" }, { "label": "Feature Settings > Functions", "path": "/lightning/setup/Functions/home" }, { "label": "Feature Settings > Fundraising > Fundraising Settings", "path": "/lightning/setup/FundraisingSettings/home" }, { "label": "Feature Settings > Global Promotions Management > Global Promotions Management Analytics", "path": "/lightning/setup/UnifiedPromotionsAnalyticsSetup/home" }, { "label": "Feature Settings > Global Promotions Management > Global Promotions Management Settings", "path": "/lightning/setup/UnifiedPromotionsSetupNode/home" }, { "label": "Feature Settings > Global Promotions Management > Marketing Cloud Integration", "path": "/lightning/setup/UnifiedPromotionMrktCloudSetupNode/home" }, { "label": "Feature Settings > Grantmaking > Grantmaking Settings", "path": "/lightning/setup/GrantmakingSettings/home" }, { "label": "Feature Settings > Group Membership > Group Membership Settings", "path": "/lightning/setup/GroupMembershipSettings/home" }, { "label": "Feature Settings > Headless Experience Layer Settings", "path": "/lightning/setup/HxlWidgetSettings/home" }, { "label": "Feature Settings > Health Cloud > Advanced Therapy Management Settings", "path": "/lightning/setup/AdvancedTherapyManagementSettings/home" }, { "label": "Feature Settings > Health Cloud > Care System Field Mapping", "path": "/lightning/setup/CareSystemFieldMapping/home" }, { "label": "Feature Settings > Health Cloud > FHIR R4 Support Settings", "path": "/lightning/setup/ClinicalDataModelSettings/home" }, { "label": "Feature Settings > Health Cloud > Health Cloud", "path": "/lightning/setup/PackageToCoreSettings/home" }, { "label": "Feature Settings > Health Cloud > Health Cloud CRM Analytics Settings", "path": "/lightning/setup/HealthCloudConfigurations/home" }, { "label": "Feature Settings > Health Cloud > Health Cloud Setup", "path": "/lightning/setup/HealthCloudAdminFeatureSetup/home" }, { "label": "Feature Settings > Health Cloud > Health Engagement Settings", "path": "/lightning/setup/HealthEngagementSettings/home" }, { "label": "Feature Settings > Health Cloud > Home Health Settings", "path": "/lightning/setup/HomeHealthSettings/home" }, { "label": "Feature Settings > Health Cloud > Industries Licensing, Permitting, and Inspections (LPI) Settings", "path": "/lightning/setup/IndustriesLPISettings/home" }, { "label": "Feature Settings > Health Cloud > Integrated Care Management Settings", "path": "/lightning/setup/IntegratedCareManagementSettings/home" }, { "label": "Feature Settings > Health Cloud > Intelligent Appointment Management Settings", "path": "/lightning/setup/PatientAppointmentSchedulingSettings/home" }, { "label": "Feature Settings > Health Cloud > Intelligent Sales Settings", "path": "/lightning/setup/MedicalDevices/home" }, { "label": "Feature Settings > Health Cloud > Medication Management and Medication Review Settings", "path": "/lightning/setup/MedicationManagementSettings/home" }, { "label": "Feature Settings > Health Cloud > Participant Management Settings", "path": "/lightning/setup/ParticipantManagementSettingsHC/home" }, { "label": "Feature Settings > Health Cloud > Program Enrollee Settings", "path": "/lightning/setup/ProgramEnrolleeSettings/home" }, { "label": "Feature Settings > Health Cloud > Public Health > Public Health Settings", "path": "/lightning/setup/PublicHealthSettings/home" }, { "label": "Feature Settings > Health Cloud > Score Category Settings", "path": "/lightning/setup/HCScoreCategorySettings/home" }, { "label": "Feature Settings > Health Cloud > Troubleshooter", "path": "/lightning/setup/HealthCloudInvestigationApp/home" }, { "label": "Feature Settings > Health Cloud > Waitlist Management", "path": "/lightning/setup/WaitlistManagementSettings/home" }, { "label": "Feature Settings > Home", "path": "/lightning/setup/Home/home" }, { "label": "Feature Settings > Identity Verification > Identity Verification Process Definition", "path": "/lightning/setup/IdentityVerificationProcDef/home" }, { "label": "Feature Settings > Identity Verification > Identity Verification Process Details", "path": "/lightning/setup/IdentityVerificationProcDtl/home" }, { "label": "Feature Settings > Identity Verification > Identity Verification Process Field", "path": "/lightning/setup/IdentityVerificationProcFld/home" }, { "label": "Feature Settings > Identity Verification > Identity Verification Settings", "path": "/lightning/setup/IdentityVerificationSetup/home" }, { "label": "Feature Settings > Industry Sales Excellence > Actionable List Data Sources", "path": "/lightning/setup/ActionableListDataSources/home" }, { "label": "Feature Settings > Industry Sales Excellence > Actionable Segmentation Settings", "path": "/lightning/setup/ActionableSegmentationSettings/home" }, { "label": "Feature Settings > Industry Sales Excellence > Bulk Action Configurations", "path": "/lightning/setup/BulkActionsConfiguration/home" }, { "label": "Feature Settings > Industry Sales Excellence > Custom Key Performance Indicators", "path": "/lightning/setup/MetricDefinition/home" }, { "label": "Feature Settings > Industry Sales Excellence > Guided Setup > Actionable Segmentation", "path": "/lightning/setup/ActionableSegmentationSetup/home" }, { "label": "Feature Settings > Intelligent Document Automation > Intelligent Document Automation Settings", "path": "/lightning/setup/IntelligentDocumentAutomationSettings/home" }, { "label": "Feature Settings > Intelligent Document Automation > Intelligent Document Workspace Settings", "path": "/lightning/setup/IntelligentDocumentWorkspaceSettings/home" }, { "label": "Feature Settings > Interest Tags", "path": "/lightning/setup/InterestTaggingSettings/home" }, { "label": "Feature Settings > Inventory Management > Inventory Allocation Settings", "path": "/lightning/setup/InventoryAllocationSetup/home" }, { "label": "Feature Settings > Inventory Management > Inventory Batch Management Settings", "path": "/lightning/setup/InventoryBatchManagementSetup/home" }, { "label": "Feature Settings > Inventory Management > Inventory Count Settings", "path": "/lightning/setup/InventoryCountSetup/home" }, { "label": "Feature Settings > Inventory Management > Inventory Replenishment Settings", "path": "/lightning/setup/InventoryReplenishmentSettings/home" }, { "label": "Feature Settings > Inventory Management > Inventory Search Settings", "path": "/lightning/setup/InventorySearchSetup/home" }, { "label": "Feature Settings > IT Asset Management > Hardware Asset Management", "path": "/lightning/setup/ItsmAssetMgmt/home" }, { "label": "Feature Settings > IT Compliance Setup > Evidence Management", "path": "/lightning/setup/EvidenceMgmt/home" }, { "label": "Feature Settings > IT Compliance Setup > Risk Management", "path": "/lightning/setup/RiskMgmt/home" }, { "label": "Feature Settings > IT Service Management > Assignment Rules", "path": "/lightning/setup/AssignmentRule/home" }, { "label": "Feature Settings > IT Service Management > Change Management", "path": "/lightning/setup/ChangeMgmt/home" }, { "label": "Feature Settings > IT Service Management > Email-to-Incident", "path": "/lightning/setup/EmailToIncident/home" }, { "label": "Feature Settings > IT Service Management > Guided Omni Channel Setup", "path": "/lightning/setup/ITSMRoutingConfig/home" }, { "label": "Feature Settings > IT Service Management > Incident Management", "path": "/lightning/setup/IncidentMgmt/home" }, { "label": "Feature Settings > IT Service Management > IT Service Calendar", "path": "/lightning/setup/ITSMEventType/home" }, { "label": "Feature Settings > IT Service Management > Major Incident Management", "path": "/lightning/setup/MIM/home" }, { "label": "Feature Settings > IT Service Management > Problem Management", "path": "/lightning/setup/ProblemMgmt/home" }, { "label": "Feature Settings > IT Service Management > Quick Setup", "path": "/lightning/setup/ITSMSetup/home" }, { "label": "Feature Settings > IT Service Management > Release Management", "path": "/lightning/setup/ReleaseMgmt/home" }, { "label": "Feature Settings > IT Service Management > Service Management Privileges", "path": "/lightning/setup/ServiceMgmtPrivilegeSetup/home" }, { "label": "Feature Settings > IT Service Management > Service Request Picklist Values Mapping", "path": "/lightning/setup/ServiceAutomationSetup/home" }, { "label": "Feature Settings > IT Service Management > SLA Management > Settings", "path": "/lightning/setup/SLASettings/home" }, { "label": "Feature Settings > Life Sciences > Advanced Therapy Management Settings", "path": "/lightning/setup/AdvancedTherapyManagementSettingsStarter/home" }, { "label": "Feature Settings > Life Sciences > Care Benefit Verification Settings", "path": "/lightning/setup/CareBenefitVerifySettingsLS/home" }, { "label": "Feature Settings > Life Sciences > Care System Field Mapping", "path": "/lightning/setup/CareSystemFieldMappingInStarter/home" }, { "label": "Feature Settings > Life Sciences > FHIR R4 Support Settings", "path": "/lightning/setup/ClinicalDataModelSettingsStarter/home" }, { "label": "Feature Settings > Life Sciences > Home Health Settings", "path": "/lightning/setup/HomeHealthSettingsLSC/home" }, { "label": "Feature Settings > Life Sciences > Intelligent Sales Settings", "path": "/lightning/setup/MedicalDevicesHCStarter/home" }, { "label": "Feature Settings > Life Sciences > Life Events", "path": "/lightning/setup/LifeEventsSetupLS/home" }, { "label": "Feature Settings > Life Sciences > Participant Management Settings", "path": "/lightning/setup/ParticipantManagementSettings/home" }, { "label": "Feature Settings > Life Sciences > Program Enrollee Settings", "path": "/lightning/setup/ProgramEnrolleeSettingsInStarter/home" }, { "label": "Feature Settings > Life Sciences > Provider Search Settings", "path": "/lightning/setup/ProviderSearchSettingsLS/home" }, { "label": "Feature Settings > Loyalty Management > Loyalty Management Settings", "path": "/lightning/setup/LoyaltySettings/home" }, { "label": "Feature Settings > Manufacturing > Account Forecasting", "path": "/lightning/setup/AccountForecastSettings/home" }, { "label": "Feature Settings > Manufacturing > Account Manager Targets", "path": "/lightning/setup/AcctMgrTargetSettings/home" }, { "label": "Feature Settings > Manufacturing > Advanced Account Forecasting", "path": "/lightning/setup/AdvancedAccountForecastSettings/home" }, { "label": "Feature Settings > Manufacturing > Fleet Management", "path": "/lightning/setup/FleetManagementSettings/home" }, { "label": "Feature Settings > Manufacturing > Manufacturing Generative AI", "path": "/lightning/setup/ManufacturingGenAIPrefSettings/home" }, { "label": "Feature Settings > Manufacturing > Partner Lead Management", "path": "/lightning/setup/MfgPartnerLeadMgmtSettings/home" }, { "label": "Feature Settings > Manufacturing > Partner Performance Management", "path": "/lightning/setup/MfgPartnerPerfMgmtSettings/home" }, { "label": "Feature Settings > Manufacturing > Partner Visit Management", "path": "/lightning/setup/MfgPartnerVisitMgmtSettings/home" }, { "label": "Feature Settings > Manufacturing > Program Based Business", "path": "/lightning/setup/MfgProgramTemplates/home" }, { "label": "Feature Settings > Manufacturing > Sales Agreements", "path": "/lightning/setup/SalesAgreementSettings/home" }, { "label": "Feature Settings > Manufacturing > Sample Management", "path": "/lightning/setup/SampleManagementPrefSettings/home" }, { "label": "Feature Settings > Manufacturing > Service Console for Manufacturing", "path": "/lightning/setup/MfgServiceExcellenceSettings/home" }, { "label": "Feature Settings > Manufacturing > Set Up CRM Analytics for Manufacturing", "path": "/lightning/setup/ManufacturingAnalytics/home" }, { "label": "Feature Settings > Manufacturing > Set Up CRM Analytics for Warranty Lifecycle Management", "path": "/lightning/setup/WarrantyAnalytics/home" }, { "label": "Feature Settings > Manufacturing > Vehicle and Asset Finance", "path": "/lightning/setup/VehicleAndAssetFinanceSettings/home" }, { "label": "Feature Settings > Manufacturing > Warranty Lifecycle Management", "path": "/lightning/setup/MfgServiceSettings/home" }, { "label": "Feature Settings > Marketing > Accounts As Campaign Members", "path": "/lightning/setup/AccountAsCM/home" }, { "label": "Feature Settings > Marketing > Campaign Influence > Auto-Association Settings", "path": "/lightning/setup/AutoAssociationSettings/home" }, { "label": "Feature Settings > Marketing > Campaign Influence > Campaign Influence Settings", "path": "/lightning/setup/CampaignInfluenceSettings/home" }, { "label": "Feature Settings > Marketing > Campaign Influence > Model Settings", "path": "/lightning/setup/CampaignInfluenceModel/home" }, { "label": "Feature Settings > Marketing > Lead Assignment Rules", "path": "/lightning/setup/LeadRules/home" }, { "label": "Feature Settings > Marketing > Lead Auto-Response Rules", "path": "/lightning/setup/LeadResponses/home" }, { "label": "Feature Settings > Marketing > Lead Processes", "path": "/lightning/setup/LeadProcess/home" }, { "label": "Feature Settings > Marketing > Lead Settings", "path": "/lightning/setup/LeadSettings/home" }, { "label": "Feature Settings > Marketing > LinkedIn Lead Gen > Lead Gen Fields", "path": "/lightning/setup/LinkedInLeadGenFields/home" }, { "label": "Feature Settings > Marketing > LinkedIn Lead Gen > LinkedIn Accounts", "path": "/lightning/setup/LinkedInLeadGenAccounts/home" }, { "label": "Feature Settings > Marketing > Marketing Intelligence", "path": "/lightning/setup/MCISetup/home" }, { "label": "Feature Settings > Marketing > Web-to-Lead", "path": "/lightning/setup/LeadWebtoleads/home" }, { "label": "Feature Settings > Net Zero > Building Energy Intensity Record Type Config", "path": "/lightning/setup/BldgEnrgyIntensityCnfg/home" }, { "label": "Feature Settings > Net Zero > Load Reference Data", "path": "/lightning/setup/SetupReferenceDataLoad/home" }, { "label": "Feature Settings > Net Zero > Net Zero Configurations", "path": "/lightning/setup/NetZeroConfigurationsSettings/home" }, { "label": "Feature Settings > Net Zero > Net Zero Settings", "path": "/lightning/setup/NetZeroPrefs/home" }, { "label": "Feature Settings > Net Zero > Stationary Asset Environmental Source Record Type Config", "path": "/lightning/setup/StnryAssetEnvSrcCnfg/home" }, { "label": "Feature Settings > Net Zero > Vehicle Asset Emission Source Record Type Config", "path": "/lightning/setup/VehicleAssetEmssnSrcCnfg/home" }, { "label": "Feature Settings > Nonprofit Cloud > Nonprofit Cloud Generative AI Settings", "path": "/lightning/setup/NonprofitGenAiSettings/home" }, { "label": "Feature Settings > Omni Interaction > Omni Interaction Access Configuration", "path": "/lightning/setup/OmniInteractionAccessConfig/home" }, { "label": "Feature Settings > Omni Interaction > Omni Interaction Configuration", "path": "/lightning/setup/OmniInteractionConfig/home" }, { "label": "Feature Settings > Omni Interaction > OmniAnalytics > Settings", "path": "/lightning/setup/OmniAnalyticsSettings/home" }, { "label": "Feature Settings > Omni Interaction > Omnistudio Settings", "path": "/lightning/setup/OmniStudioSettings/home" }, { "label": "Feature Settings > Omnichannel Inventory", "path": "/lightning/setup/OmniChannelInventory/home" }, { "label": "Feature Settings > Order Management > Setup", "path": "/lightning/setup/OrderManagementSetup/home" }, { "label": "Feature Settings > Outcome Management > Outcome Management Settings", "path": "/lightning/setup/OutcomesSettings/home" }, { "label": "Feature Settings > Payments", "path": "/lightning/setup/PaymentsSettings/home" }, { "label": "Feature Settings > Procedure Plan > Procedure Plan Definition Templates", "path": "/lightning/setup/ProcedurePlanDefinitionTemplates/home" }, { "label": "Feature Settings > Procedure Plan > Procedure Plan Definitions", "path": "/lightning/setup/ProcedurePlanDefinitions/home" }, { "label": "Feature Settings > Product Catalog Management > General Settings > Deep Clone Product Settings", "path": "/lightning/setup/ProductDeepCloneSettings/home" }, { "label": "Feature Settings > Product Catalog Management > Product Discovery > Product Discovery Settings", "path": "/lightning/setup/ProductDiscoverySettings/home" }, { "label": "Feature Settings > Product Catalog Management > Product Specification Record Type", "path": "/lightning/setup/ProductSpecificationRecType/home" }, { "label": "Feature Settings > Product Catalog Management > Product Specification Type", "path": "/lightning/setup/ProductSpecificationType/home" }, { "label": "Feature Settings > Program and Case Management > Care Plan Settings", "path": "/lightning/setup/CarePlanSettings/home" }, { "label": "Feature Settings > Program and Case Management > Case Proceedings Settings", "path": "/lightning/setup/CaseProceedingSettings/home" }, { "label": "Feature Settings > Program and Case Management > Case Referrals Settings", "path": "/lightning/setup/CaseReferralSettings/home" }, { "label": "Feature Settings > Program and Case Management > Interaction Summary Settings", "path": "/lightning/setup/IndustriesInteractionSummarySettings/home" }, { "label": "Feature Settings > Program and Case Management > Program and Benefit Management Settings", "path": "/lightning/setup/BenefitManagementSettings/home" }, { "label": "Feature Settings > Program and Case Management > Set Up Caseworker Productivity Analytics", "path": "/lightning/setup/WorkloadManagementAnalyticsSetup/home" }, { "label": "Feature Settings > Provider Search > Care Provider Affiliation Role Config", "path": "/lightning/setup/CareProviderAfflRoleConfig/home" }, { "label": "Feature Settings > Provider Search > Care Provider Search Config", "path": "/lightning/setup/CareProviderSearchConfig/home" }, { "label": "Feature Settings > Provider Search > Provider Search Settings", "path": "/lightning/setup/ProviderSearchSettings/home" }, { "label": "Feature Settings > Public Sector Solutions > Benefit Disbursement Settings", "path": "/lightning/setup/DisbursementSettings/home" }, { "label": "Feature Settings > Public Sector Solutions > Guided Setup > Assistant 5: Set Up Business Rules Engine and Decision Explainer", "path": "/lightning/setup/PSSBusinessRulesEngineSetupAssistant/home" }, { "label": "Feature Settings > Purchase Order Management > Purchase Order Management Settings", "path": "/lightning/setup/PurchaseOrderMgmtSetup/home" }, { "label": "Feature Settings > Quip (Salesforce Anywhere)", "path": "/lightning/setup/SalesforceAnywhereSetupPage/home" }, { "label": "Feature Settings > Rebate Management > Price Protection", "path": "/lightning/setup/PriceProtection/home" }, { "label": "Feature Settings > Rebate Management > Rebates > Rebate and Accrual Management Advanced", "path": "/lightning/setup/RebateAndAccrualMgmtAdvncd/home" }, { "label": "Feature Settings > Rebate Management > Rebates > Rebates", "path": "/lightning/setup/RebatesSettings/home" }, { "label": "Feature Settings > Rebate Management > Ship and Debit", "path": "/lightning/setup/ShipAndDebitSettings/home" }, { "label": "Feature Settings > Rebate Management > Stock Rotation Incentive", "path": "/lightning/setup/StockRotation/home" }, { "label": "Feature Settings > Record Alert Settings > Record Alert Access", "path": "/lightning/setup/RecordAlertOrgSettings/home" }, { "label": "Feature Settings > Record Alert Settings > Record Alert Category", "path": "/lightning/setup/RecordAlertCategory/home" }, { "label": "Feature Settings > Record Alert Settings > Record Alert Data Source", "path": "/lightning/setup/RecordAlertDataSource/home" }, { "label": "Feature Settings > Record Alert Settings > Record Alert Data Source Expression Set Definition", "path": "/lightning/setup/RecAlrtDataSrcExpSetDef/home" }, { "label": "Feature Settings > Record Alert Settings > Record Alert Template", "path": "/lightning/setup/RecordAlertTemplate/home" }, { "label": "Feature Settings > Referral Management > Referral Management Settings", "path": "/lightning/setup/ReferralManagementSettings/home" }, { "label": "Feature Settings > Referral Marketing > Referral Marketing Analytics", "path": "/lightning/setup/ReferralManagementAnalyticsSetup/home" }, { "label": "Feature Settings > Relationship Card Types > Relationship Card Type Manager", "path": "/lightning/setup/RelationshipCardTypeManager/home" }, { "label": "Feature Settings > Revenue Cloud > Revenue Settings", "path": "/lightning/setup/RevenueSettings/home" }, { "label": "Feature Settings > Revenue Management Intelligence > Revenue Management Intelligence Setup", "path": "/lightning/setup/RevenueLifecycleIntelligence/home" }, { "label": "Feature Settings > Sales > Accounts > Account Intelligence View Setup", "path": "/lightning/setup/AccountInspectionSettings/home" }, { "label": "Feature Settings > Sales > Accounts > Account Plans > Sales Account Plans", "path": "/lightning/setup/SalesAccountPlans/home" }, { "label": "Feature Settings > Sales > Accounts > Account Plans > Sales Action Plans", "path": "/lightning/setup/SalesActionPlans/home" }, { "label": "Feature Settings > Sales > Accounts > Account Settings", "path": "/lightning/setup/AccountSettings/home" }, { "label": "Feature Settings > Sales > Accounts > Account Teams", "path": "/lightning/setup/AccountTeamSelling/home" }, { "label": "Feature Settings > Sales > Accounts > Person Accounts", "path": "/lightning/setup/PersonAccountSettings/home" }, { "label": "Feature Settings > Sales > Activity Settings", "path": "/lightning/setup/HomeActivitiesSetupPage/home" }, { "label": "Feature Settings > Sales > Contact Intelligence View Setup", "path": "/lightning/setup/ContactInspectionSettings/home" }, { "label": "Feature Settings > Sales > Contact Roles on Contracts", "path": "/lightning/setup/ContractContactRoles/home" }, { "label": "Feature Settings > Sales > Contact Roles on Opportunities", "path": "/lightning/setup/OpportunityRoles/home" }, { "label": "Feature Settings > Sales > Contacts > Buyer Relationship Map", "path": "/lightning/setup/BuyerRelationshipMap/home" }, { "label": "Feature Settings > Sales > Contract Settings", "path": "/lightning/setup/ContractSettings/home" }, { "label": "Feature Settings > Sales > Forecasts > Forecasts Hierarchy", "path": "/lightning/setup/Forecasting3Role/home" }, { "label": "Feature Settings > Sales > Forecasts > Forecasts Quotas", "path": "/lightning/setup/Forecasting3Quota/home" }, { "label": "Feature Settings > Sales > Forecasts > Forecasts Settings", "path": "/lightning/setup/Forecasting3Settings/home" }, { "label": "Feature Settings > Sales > Individual Settings", "path": "/lightning/setup/IndividualSettings/home" }, { "label": "Feature Settings > Sales > Lead Intelligence View Setup", "path": "/lightning/setup/LeadInspectionSettings/home" }, { "label": "Feature Settings > Sales > LinkedIn Sales Navigator", "path": "/lightning/setup/LinkedInSalesNavigatorPage/home" }, { "label": "Feature Settings > Sales > Meetings > Settings", "path": "/lightning/setup/SalesforceMeetingsSettings/home" }, { "label": "Feature Settings > Sales > Notes Settings", "path": "/lightning/setup/NotesSetupPage/home" }, { "label": "Feature Settings > Sales > Opportunities > Big Deal Alert", "path": "/lightning/setup/OpportunityAlerts/home" }, { "label": "Feature Settings > Sales > Opportunities > Opportunity Settings", "path": "/lightning/setup/OpportunitySettings/home" }, { "label": "Feature Settings > Sales > Opportunities > Opportunity Splits Settings", "path": "/lightning/setup/OpportunitySplitSetup/home" }, { "label": "Feature Settings > Sales > Opportunities > Opportunity Team Settings", "path": "/lightning/setup/OpportunityTeamMemberSettings/home" }, { "label": "Feature Settings > Sales > Opportunities > Pipeline Inspection Setup", "path": "/lightning/setup/PipelineInspectionSettings/home" }, { "label": "Feature Settings > Sales > Order Settings", "path": "/lightning/setup/OrderSettings/home" }, { "label": "Feature Settings > Sales > Partner Relationship Management > An Overview of PRM", "path": "/lightning/setup/PrmUnifiedSetupSettings/home" }, { "label": "Feature Settings > Sales > Partner Relationship Management > Channel Management", "path": "/lightning/setup/ChannelManagement/home" }, { "label": "Feature Settings > Sales > Partner Relationship Management > Partner Connect for Vendors", "path": "/lightning/setup/PrmExtIntegVendor/home" }, { "label": "Feature Settings > Sales > Partner Relationship Management > Partner Experience", "path": "/lightning/setup/PartnerExperience/home" }, { "label": "Feature Settings > Sales > Partner Relationship Management > Partner Productivity", "path": "/lightning/setup/ChannelProductivity/home" }, { "label": "Feature Settings > Sales > Products > Asset Settings", "path": "/lightning/setup/AssetSettings/home" }, { "label": "Feature Settings > Sales > Products > Product Schedules Settings", "path": "/lightning/setup/Product2ScheduleSetup/home" }, { "label": "Feature Settings > Sales > Products > Product Settings", "path": "/lightning/setup/Product2Settings/home" }, { "label": "Feature Settings > Sales > Quotes > Quote Templates", "path": "/lightning/setup/QuoteTemplateEditor/home" }, { "label": "Feature Settings > Sales > Quotes > Quotes Settings", "path": "/lightning/setup/QuoteSettings/home" }, { "label": "Feature Settings > Sales > Replace Team Roles", "path": "/lightning/setup/OpportunityTeamMemberRolesReplace/home" }, { "label": "Feature Settings > Sales > Revenue Insights > Einstein Account Management Setup", "path": "/lightning/setup/EinsteinAccountManagementAppSettings/home" }, { "label": "Feature Settings > Sales > Revenue Insights > Revenue Insights Setup", "path": "/lightning/setup/RevenueInsightsSetup/home" }, { "label": "Feature Settings > Sales > Sales Engagement > Buyer Assistant", "path": "/lightning/setup/BuyerAssistant/home" }, { "label": "Feature Settings > Sales > Sales Engagement > Dialer > Dialer Settings", "path": "/lightning/setup/DialerSetupPage/home" }, { "label": "Feature Settings > Sales > Sales Engagement > Inbox > Setup Assistant", "path": "/lightning/setup/EmailIqSetupPage/home" }, { "label": "Feature Settings > Sales > Sales Engagement > Log a Call", "path": "/lightning/setup/DialerLogACallSetup/home" }, { "label": "Feature Settings > Sales > Sales Engagement > Sales Engagement Settings", "path": "/lightning/setup/SalesEngagement/home" }, { "label": "Feature Settings > Sales > Sales Processes", "path": "/lightning/setup/OpportunityProcess/home" }, { "label": "Feature Settings > Sales > Sales Workspace Signals", "path": "/lightning/setup/SalesWorkspace/home" }, { "label": "Feature Settings > Sales > Team Roles", "path": "/lightning/setup/OpportunityTeamMemberRoles/home" }, { "label": "Feature Settings > Sales > Territories > Territory Models", "path": "/lightning/setup/Territory2Models/home" }, { "label": "Feature Settings > Sales > Territories > Territory Settings", "path": "/lightning/setup/Territory2Settings/home" }, { "label": "Feature Settings > Sales > Territories > Territory Types", "path": "/lightning/setup/Territory2Types/home" }, { "label": "Feature Settings > Sales > Update Reminders", "path": "/lightning/setup/OpportunityUpdateReminders/home" }, { "label": "Feature Settings > Sales > Video Settings > Zoom Video Setup", "path": "/lightning/setup/ZoomVideoSetup/home" }, { "label": "Feature Settings > Salesforce Files > Asset Files", "path": "/lightning/setup/ContentAssets/home" }, { "label": "Feature Settings > Salesforce Files > Content Deliveries and Public Links", "path": "/lightning/setup/ContentDistribution/home" }, { "label": "Feature Settings > Salesforce Files > Files Connect", "path": "/lightning/setup/ContentHub/home" }, { "label": "Feature Settings > Salesforce Files > General Settings", "path": "/lightning/setup/FilesGeneralSettings/home" }, { "label": "Feature Settings > Salesforce Files > Malware Scanning", "path": "/lightning/setup/MalwareScanSettings/home" }, { "label": "Feature Settings > Salesforce Files > Regenerate Previews", "path": "/lightning/setup/RegeneratePreviews/home" }, { "label": "Feature Settings > Salesforce Files > Salesforce CRM Content", "path": "/lightning/setup/SalesforceCRMContent/home" }, { "label": "Feature Settings > Salesforce Pricing > Advanced Logging", "path": "/lightning/setup/AdvancedLogging/home" }, { "label": "Feature Settings > Salesforce Pricing > Pricing Action Parameters", "path": "/lightning/setup/PricingActionParameters/home" }, { "label": "Feature Settings > Salesforce Pricing > Pricing Recipes", "path": "/lightning/setup/PricingRecipeListAura/home" }, { "label": "Feature Settings > Salesforce Pricing > Salesforce Pricing Settings", "path": "/lightning/setup/CorePricingSetting/home" }, { "label": "Feature Settings > Salesforce Pricing > Salesforce Pricing Setup", "path": "/lightning/setup/CorePricingSetup/home" }, { "label": "Feature Settings > Salesforce Scheduler > Assignment Policies", "path": "/lightning/setup/AppointmentAssignmentPolicy/home" }, { "label": "Feature Settings > Salesforce Scheduler > Salesforce Scheduler Settings", "path": "/lightning/setup/LightningSchedulerSettings/home" }, { "label": "Feature Settings > Salesforce Scheduler > Scheduling Policies", "path": "/lightning/setup/AppointmentSchedulingPolicy/home" }, { "label": "Feature Settings > Salesforce Scheduler > Skills", "path": "/lightning/setup/Skills/home" }, { "label": "Feature Settings > Salesforce Scheduler > Troubleshooter", "path": "/lightning/setup/SalesforceSchedulerTroubleshooting/home" }, { "label": "Feature Settings > Scheduled Reminders > Scheduled Reminder Settings", "path": "/lightning/setup/ReminderSettings/home" }, { "label": "Feature Settings > Scoring Models", "path": "/lightning/setup/ScoreRuleConfigurationSetup/home" }, { "label": "Feature Settings > Service > Advanced Timesheets and Labor Cost Optimization > Advanced Timesheets and Labor Cost Optimization Settings", "path": "/lightning/setup/LaborCostOptimizationSettings/home" }, { "label": "Feature Settings > Service > Agentforce Orchestrator", "path": "/lightning/setup/AgentforceOrchestrator/home" }, { "label": "Feature Settings > Service > Analytics > Service Insights", "path": "/lightning/setup/ServiceIncludedAppSetup/home" }, { "label": "Feature Settings > Service > Analytics > Service Intelligence", "path": "/lightning/setup/ServiceIntelSetup/home" }, { "label": "Feature Settings > Service > Asset Service Lifecycle Management > Asset Service Lifecycle Management Settings", "path": "/lightning/setup/IndustriesFieldServiceSettings/home" }, { "label": "Feature Settings > Service > Call Center > Call Centers", "path": "/lightning/setup/CallCenters/home" }, { "label": "Feature Settings > Service > Call Center > Directory Numbers", "path": "/lightning/setup/AdditionalDirectoryNumbers/home" }, { "label": "Feature Settings > Service > Call Center > Softphone Layouts", "path": "/lightning/setup/SoftphoneLayouts/home" }, { "label": "Feature Settings > Service > Case Assignment Rules", "path": "/lightning/setup/CaseRules/home" }, { "label": "Feature Settings > Service > Case Auto-Response Rules", "path": "/lightning/setup/CaseResponses/home" }, { "label": "Feature Settings > Service > Case Comment Triggers", "path": "/lightning/setup/CaseCommentTriggers/home" }, { "label": "Feature Settings > Service > Case Merge", "path": "/lightning/setup/CaseMerge/home" }, { "label": "Feature Settings > Service > Case Teams > Case Team Roles", "path": "/lightning/setup/CaseTeamRoles/home" }, { "label": "Feature Settings > Service > Case Teams > Predefined Case Teams", "path": "/lightning/setup/CaseTeamTemplates/home" }, { "label": "Feature Settings > Service > Channel-Object Linking (Beta)", "path": "/lightning/setup/ChannelObjectLinkingSetup/home" }, { "label": "Feature Settings > Service > Chat > Block Visitors", "path": "/lightning/setup/LiveChatBlockingRuleSettings/home" }, { "label": "Feature Settings > Service > Chat > Chat Agent Configurations", "path": "/lightning/setup/LiveChatUserConfigSettings/home" }, { "label": "Feature Settings > Service > Chat > Chat Buttons & Invitations", "path": "/lightning/setup/LiveChatButtonSettings/home" }, { "label": "Feature Settings > Service > Chat > Chat Settings", "path": "/lightning/setup/LiveAgentSettings/home" }, { "label": "Feature Settings > Service > Chat > Deployments", "path": "/lightning/setup/LiveChatDeploymentSettings/home" }, { "label": "Feature Settings > Service > Chat > Sensitive Data Rules", "path": "/lightning/setup/LiveChatSensitiveDataRuleSettings/home" }, { "label": "Feature Settings > Service > Chat > Skills", "path": "/lightning/setup/SkillSettings/home" }, { "label": "Feature Settings > Service > Communication Channels", "path": "/lightning/setup/ChannelManagementSetup/home" }, { "label": "Feature Settings > Service > Contact Roles on Cases", "path": "/lightning/setup/CaseContactRoles/home" }, { "label": "Feature Settings > Service > Conversation Intelligence Rules", "path": "/lightning/setup/CiSignals/home" }, { "label": "Feature Settings > Service > Conversation Service APIs", "path": "/lightning/setup/ConversationServiceAPI/home" }, { "label": "Feature Settings > Service > Conversation Transcripts on Data Cloud", "path": "/lightning/setup/AccessConversationTranscriptsOnDataCloud/home" }, { "label": "Feature Settings > Service > Customer Contact Requests", "path": "/lightning/setup/ContactRequestFlows/home" }, { "label": "Feature Settings > Service > Customer Service Incident Management", "path": "/lightning/setup/IncidentManagement/home" }, { "label": "Feature Settings > Service > Data Categories > Data Category Setup", "path": "/lightning/setup/DataCategorySetup/home" }, { "label": "Feature Settings > Service > Data Categories > Default Data Category Visibility", "path": "/lightning/setup/DataCategoryDefaultVisibilitySettings/home" }, { "label": "Feature Settings > Service > Email-to-Case", "path": "/lightning/setup/EmailToCase/home" }, { "label": "Feature Settings > Service > Embedded Service > Channel Menu", "path": "/lightning/setup/ChannelMenuDeployments/home" }, { "label": "Feature Settings > Service > Embedded Service > Embedded Service Deployments", "path": "/lightning/setup/EmbeddedServiceDeployments/home" }, { "label": "Feature Settings > Service > Embedded Service > Enhanced Chat User Verification", "path": "/lightning/setup/Authorization/home" }, { "label": "Feature Settings > Service > Embedded Service > Legacy Web Chat Migration (Beta)", "path": "/lightning/setup/MigrateChatDeployments/home" }, { "label": "Feature Settings > Service > Entitlement Management > Entitlement Processes", "path": "/lightning/setup/SlaProcess/home" }, { "label": "Feature Settings > Service > Entitlement Management > Entitlement Settings", "path": "/lightning/setup/EntitlementSettings/home" }, { "label": "Feature Settings > Service > Entitlement Management > Entitlement Templates", "path": "/lightning/setup/EntitlementTemplates/home" }, { "label": "Feature Settings > Service > Entitlement Management > Milestones", "path": "/lightning/setup/MilestoneTypes/home" }, { "label": "Feature Settings > Service > Escalation Rules", "path": "/lightning/setup/CaseEscRules/home" }, { "label": "Feature Settings > Service > Feed Filters", "path": "/lightning/setup/FeedFilterDefinitions/home" }, { "label": "Feature Settings > Service > Field Service > Document Builder", "path": "/lightning/setup/DocumentBuilder/home" }, { "label": "Feature Settings > Service > Field Service > Field Maps Settings", "path": "/lightning/setup/FieldMapsSettings/home" }, { "label": "Feature Settings > Service > Field Service > Field Service Mobile > Field Service Mobile App Builder", "path": "/lightning/setup/FieldServiceAppBuilder/home" }, { "label": "Feature Settings > Service > Field Service > Field Service Mobile > Field Service Mobile Settings", "path": "/lightning/setup/FieldServiceMobileSettings/home" }, { "label": "Feature Settings > Service > Field Service > Field Service Settings", "path": "/lightning/setup/FieldServiceSettings/home" }, { "label": "Feature Settings > Service > Field Service > Scheduling Console Settings", "path": "/lightning/setup/SchedulingConsoleSettingsSetup/home" }, { "label": "Feature Settings > Service > Field Service > Service Report Templates", "path": "/lightning/setup/ServiceReportEditor/home" }, { "label": "Feature Settings > Service > Field Service > Time Sheet Settings", "path": "/lightning/setup/TimeSheetSettings/home" }, { "label": "Feature Settings > Service > Field Service > Work Plans", "path": "/lightning/setup/WorkPlanSettings/home" }, { "label": "Feature Settings > Service > Industry Service Excellence > Action Launcher > Deployments", "path": "/lightning/setup/ActionLauncherDeployment/home" }, { "label": "Feature Settings > Service > Industry Service Excellence > Attendee Settings", "path": "/lightning/setup/AttendeeSettings/home" }, { "label": "Feature Settings > Service > Industry Service Excellence > Bot Template Settings", "path": "/lightning/setup/BotTemplateSettings/home" }, { "label": "Feature Settings > Service > Knowledge > Data Category Assignments", "path": "/lightning/setup/KnowledgeDataCategorySetup/home" }, { "label": "Feature Settings > Service > Knowledge > Data Category Mappings", "path": "/lightning/setup/ArticleFilterRules/home" }, { "label": "Feature Settings > Service > Knowledge > Enhanced Knowledge Settings", "path": "/lightning/setup/EnhancedKnowledgeSettings/home" }, { "label": "Feature Settings > Service > Knowledge > Knowledge Settings", "path": "/lightning/setup/KnowledgeSettings/home" }, { "label": "Feature Settings > Service > Knowledge > Validation Statuses", "path": "/lightning/setup/ValidationStatuses/home" }, { "label": "Feature Settings > Service > Macro Settings", "path": "/lightning/setup/MacroSettings/home" }, { "label": "Feature Settings > Service > Messaging > Enhanced Messaging Log", "path": "/lightning/setup/ConvMessageSendRequests/home" }, { "label": "Feature Settings > Service > Messaging > Messaging Components", "path": "/lightning/setup/ConversationMessageDefinitions/home" }, { "label": "Feature Settings > Service > Messaging > Messaging Settings", "path": "/lightning/setup/LiveMessageSetup/home" }, { "label": "Feature Settings > Service > Messaging > Messaging Templates", "path": "/lightning/setup/MessagingTemplates/home" }, { "label": "Feature Settings > Service > Messaging > Regulatory Compliance", "path": "/lightning/setup/SmsRegulatoryCompliance/home" }, { "label": "Feature Settings > Service > Messaging > Sensitive Data Rules > Sensitive Data Rules for Standard Channels", "path": "/lightning/setup/MessagingSensitiveDataRulesStandard/home" }, { "label": "Feature Settings > Service > Messaging > Standard Messaging Error Log", "path": "/lightning/setup/MessagingDeliveryErrors/home" }, { "label": "Feature Settings > Service > Omni-Channel > Limits", "path": "/lightning/setup/OmniChannelLimits/home" }, { "label": "Feature Settings > Service > Omni-Channel > Omni-Channel Home", "path": "/lightning/setup/OmniChannelHome/home" }, { "label": "Feature Settings > Service > Omni-Channel > Omni-Channel Settings", "path": "/lightning/setup/OmniChannelSettings/home" }, { "label": "Feature Settings > Service > Omni-Channel > Presence Configurations", "path": "/lightning/setup/ServicePresenceUserConfigSettings/home" }, { "label": "Feature Settings > Service > Omni-Channel > Presence Decline Reasons", "path": "/lightning/setup/ServicePresenceDeclineReasonSettings/home" }, { "label": "Feature Settings > Service > Omni-Channel > Presence Statuses", "path": "/lightning/setup/ServicePresenceStatusSettings/home" }, { "label": "Feature Settings > Service > Omni-Channel > Routing Configurations", "path": "/lightning/setup/QueueRoutingConfigSettings/home" }, { "label": "Feature Settings > Service > Omni-Channel > Service Channels", "path": "/lightning/setup/ServiceChannelSettings/home" }, { "label": "Feature Settings > Service > Omni-Channel > Skills", "path": "/lightning/setup/OmniChannelSkillSettings/home" }, { "label": "Feature Settings > Service > Omni-Channel > Skills-Based Routing Rules", "path": "/lightning/setup/OmniChannelAttributeBasedRouting/home" }, { "label": "Feature Settings > Service > Omni-Channel > Supervisor > Supervisor Configurations", "path": "/lightning/setup/OmniSupervisorConfigSettings/home" }, { "label": "Feature Settings > Service > Omni-Channel > Supervisor > Supervisor Settings", "path": "/lightning/setup/OmniSupervisorSettings/home" }, { "label": "Feature Settings > Service > Partner Contact Centers", "path": "/lightning/setup/PartnerContactCenters/home" }, { "label": "Feature Settings > Service > Proactive Services", "path": "/lightning/setup/ProactiveServices/home" }, { "label": "Feature Settings > Service > Sensitive Data Rules for Enhanced Channels", "path": "/lightning/setup/MessagingSensitiveDataRulesEnhanced/home" }, { "label": "Feature Settings > Service > Service Cloud Einstein > Article Recommendations", "path": "/lightning/setup/EinsteinArticleRecommendations/home" }, { "label": "Feature Settings > Service > Service Cloud Einstein > Einstein Classification", "path": "/lightning/setup/EinsteinCaseClassification/home" }, { "label": "Feature Settings > Service > Service Cloud Einstein > Einstein Conversation Mining", "path": "/lightning/setup/EinsteinConversationMining/home" }, { "label": "Feature Settings > Service > Service Cloud Einstein > Einstein Reply Recommendations", "path": "/lightning/setup/EinsteinReplyRecommendation/home" }, { "label": "Feature Settings > Service > Service Cloud Einstein > Einstein Service Replies for Email", "path": "/lightning/setup/EinsteinGPTEmailGenSetting/home" }, { "label": "Feature Settings > Service > Service Cloud Einstein > Einstein Work Summaries", "path": "/lightning/setup/EinsteinWorkSummaries/home" }, { "label": "Feature Settings > Service > Service Cloud Einstein > Real-Time Translations", "path": "/lightning/setup/EinsteinConversationTranslate/home" }, { "label": "Feature Settings > Service > Service Cloud Einstein > Service AI Grounding", "path": "/lightning/setup/EinsteinGPTGrounding/home" }, { "label": "Feature Settings > Service > Service Cloud Einstein > Write with AI", "path": "/lightning/setup/EinsteinConversationWriteWithAi/home" }, { "label": "Feature Settings > Service > Shift Scheduling > Objectives", "path": "/lightning/setup/FslSchedulingObjective/home" }, { "label": "Feature Settings > Service > Shift Scheduling > Rules", "path": "/lightning/setup/FslSchedulingRule/home" }, { "label": "Feature Settings > Service > Support Processes", "path": "/lightning/setup/CaseProcess/home" }, { "label": "Feature Settings > Service > Support Settings", "path": "/lightning/setup/CaseSettings/home" }, { "label": "Feature Settings > Service > Swarming", "path": "/lightning/setup/CaseSwarming/home" }, { "label": "Feature Settings > Service > Voice > Agentforce Voice Setup", "path": "/lightning/setup/ServiceCloudVoiceAgentforce/home" }, { "label": "Feature Settings > Service > Voice > Amazon Setup", "path": "/lightning/setup/ServiceCloudVoice/home" }, { "label": "Feature Settings > Service > Voice > Call Recording and Transcription", "path": "/lightning/setup/callRecordingTranscription/home" }, { "label": "Feature Settings > Service > Voice > Emergency Calling Services", "path": "/lightning/setup/E911/home" }, { "label": "Feature Settings > Service > Voice > Media Management", "path": "/lightning/setup/MediaManagement/home" }, { "label": "Feature Settings > Service > Voice > Partner Telephony Setup", "path": "/lightning/setup/ServiceCloudVoicePartnerTelephony/home" }, { "label": "Feature Settings > Service > Voice > Quality Management", "path": "/lightning/setup/qualityManagement/home" }, { "label": "Feature Settings > Service > Web-to-Case", "path": "/lightning/setup/CaseWebtocase/home" }, { "label": "Feature Settings > Service > Web-to-Case HTML Generator", "path": "/lightning/setup/CaseWebToCaseHtmlGenerator/home" }, { "label": "Feature Settings > Service > Workforce Engagement Management > Getting Started", "path": "/lightning/setup/WEMGettingStarted/home" }, { "label": "Feature Settings > Skill Settings > Skill Types", "path": "/lightning/setup/SkillType/home" }, { "label": "Feature Settings > Skill Settings > Skills", "path": "/lightning/setup/SkillPage/home" }, { "label": "Feature Settings > Stage Management > Stage Definitions", "path": "/lightning/setup/IndustriesStageDefinitions/home" }, { "label": "Feature Settings > Supplier Management > Supplier Management Settings", "path": "/lightning/setup/SupplierManagementPrefs/home" }, { "label": "Feature Settings > Survey > Customer Lifecycle Maps", "path": "/lightning/setup/CustomerLifecycleMaps/home" }, { "label": "Feature Settings > Survey > Survey Invitation Rules", "path": "/lightning/setup/SurveyInvitationRules/home" }, { "label": "Feature Settings > Survey > Survey Settings", "path": "/lightning/setup/SurveySettings/home" }, { "label": "Feature Settings > Teams Configurations", "path": "/lightning/setup/TeamsConfigurations/home" }, { "label": "Feature Settings > Timeline Settings > Summary", "path": "/lightning/setup/TimelineSummarisationSettings/home" }, { "label": "Feature Settings > Timeline Settings > Timeline", "path": "/lightning/setup/Timeline/home" }, { "label": "Feature Settings > Topics > Topic Assignment Triggers", "path": "/lightning/setup/TopicAssigmentTriggers/home" }, { "label": "Feature Settings > Topics > Topic Triggers", "path": "/lightning/setup/TopicTriggers/home" }, { "label": "Feature Settings > Topics > Topics for Objects", "path": "/lightning/setup/TopicRecords/home" }, { "label": "Feature Settings > Unified Employee License Migration", "path": "/lightning/setup/UnifiedEmployeeMigration/home" }, { "label": "Feature Settings > Usage Management > Usage Management Settings", "path": "/lightning/setup/CoreUsageSetting/home" }, { "label": "Feature Settings > Video Calls > Video Call Configuration", "path": "/lightning/setup/VirtualVisitConfig/home" }, { "label": "Feature Settings > Video Calls > Video Call Settings", "path": "/lightning/setup/VideoVisits/home" }, { "label": "Feature Settings > Visit Settings > Inventory Settings", "path": "/lightning/setup/InventorySettings/home" }, { "label": "Feature Settings > Visit Settings > Visit Calendar Settings", "path": "/lightning/setup/CalendarSyncSettings/home" }, { "label": "Global Consent Manager > Consent Export Settings", "path": "/lightning/setup/GlobalConsentExportStore/home" }, { "label": "Global Consent Manager > Data 360 Stream Settings", "path": "/lightning/setup/GlobalConsentDataCloudStream/home" }, { "label": "Go Accelerate > Solution Deployment Monitoring", "path": "/lightning/setup/SolutionMonitoring/home" }, { "label": "Heroku > About Heroku", "path": "/lightning/setup/AboutHeroku/home" }, { "label": "Heroku > Apps", "path": "/lightning/setup/HerokuApps/home" }, { "label": "Hyperforce Assistant", "path": "/lightning/setup/HyperforceAssistant/home" }, { "label": "Identity > Auth Providers", "path": "/lightning/setup/AuthProviders/home" }, { "label": "Identity > Identity Provider", "path": "/lightning/setup/IdpPage/home" }, { "label": "Identity > Identity Provider Event Log", "path": "/lightning/setup/IdpErrorLog/home" }, { "label": "Identity > Identity Verification", "path": "/lightning/setup/IdentityVerification/home" }, { "label": "Identity > Identity Verification History", "path": "/lightning/setup/VerificationHistory/home" }, { "label": "Identity > Login Flows", "path": "/lightning/setup/LoginFlow/home" }, { "label": "Identity > Login History", "path": "/lightning/setup/OrgLoginHistory/home" }, { "label": "Identity > OAuth and OpenID Connect Settings", "path": "/lightning/setup/OauthOidcSettings/home" }, { "label": "Identity > OAuth Custom Scopes", "path": "/lightning/setup/OauthCustomScope/home" }, { "label": "Identity > Single Sign-On Settings", "path": "/lightning/setup/SingleSignOn/home" }, { "label": "Identity > Token Exchange Handlers", "path": "/lightning/setup/OauthTokenExchangeHandlers/home" }, { "label": "Integration Definitions", "path": "/lightning/setup/IntegrationConfiguration/home" }, { "label": "Integrations > API", "path": "/lightning/setup/WebServices/home" }, { "label": "Integrations > API Catalog > API Catalog", "path": "/lightning/setup/ApiCatalog/home" }, { "label": "Integrations > API Catalog > MCP Servers", "path": "/lightning/setup/McpServer/home" }, { "label": "Integrations > Basic Data Import", "path": "/lightning/setup/BasicDataImport/home" }, { "label": "Integrations > Change Data Capture", "path": "/lightning/setup/CdcObjectEnablement/home" }, { "label": "Integrations > Data Import Wizard", "path": "/lightning/setup/DataManagementDataImporter/home" }, { "label": "Integrations > Data Loader", "path": "/lightning/setup/DataLoader/home" }, { "label": "Integrations > Dataloader.io", "path": "/lightning/setup/DataLoaderIo/home" }, { "label": "Integrations > External Data Sources", "path": "/lightning/setup/ExternalDataSource/home" }, { "label": "Integrations > External Objects", "path": "/lightning/setup/ExternalObjects/home" }, { "label": "Integrations > External Services", "path": "/lightning/setup/ExternalServices/home" }, { "label": "Integrations > MuleSoft > Industry APIs", "path": "/lightning/setup/IndustryAPISetup/home" }, { "label": "Integrations > Named Query API", "path": "/lightning/setup/ApiNamedQuery/home" }, { "label": "Integrations > Platform Events", "path": "/lightning/setup/EventObjects/home" }, { "label": "Integrations > Teams Integration", "path": "/lightning/setup/MicrosoftTeamsIntegration/home" }, { "label": "Lightning Usage", "path": "/lightning/setup/LightningUsageSetup/home" }, { "label": "Marketing Cloud > Assisted Setup > Assistant Home", "path": "/lightning/setup/UnifiedMarketingAssistantHome/home" }, { "label": "Marketing Cloud > Assisted Setup > Basic Settings", "path": "/lightning/setup/UnifiedMarketingBasicSettings/home" }, { "label": "Marketing Cloud > Assisted Setup > Einstein & Agentforce > Agentforce & Gen AI", "path": "/lightning/setup/UnifiedMarketingAgentforceAndGenAi/home" }, { "label": "Marketing Cloud > Assisted Setup > Marketing Cloud Engagement > Connect Data", "path": "/lightning/setup/UmaMarketingCloudEngagement/home" }, { "label": "Marketing Cloud > Assisted Setup > User Access", "path": "/lightning/setup/UnifiedMarketingUserAccess/home" }, { "label": "Marketing Cloud > Marketing Features > Business Units > Business Units", "path": "/lightning/setup/BusinessUnits/home" }, { "label": "Marketing Cloud > Marketing Features > Distributed Marketing and Alerts", "path": "/lightning/setup/DMAlerts/home" }, { "label": "Marketing Cloud > Marketing Features > Unified Engagement History Dashboards", "path": "/lightning/setup/UnifiedEngagementHistoryDashboard/home" }, { "label": "MuleSoft > Anypoint Platform Setup", "path": "/lightning/setup/MulesoftSetup/home" }, { "label": "MuleSoft > Integration Intelligence Setup Assistant", "path": "/lightning/setup/IntegrationIntelligence/home" }, { "label": "MuleSoft > MuleSoft Direct", "path": "/lightning/setup/IntegrationsSetup/home" }, { "label": "MuleSoft > MuleSoft Observability", "path": "/lightning/setup/MulesoftObservability/home" }, { "label": "Notification Builder > Custom Notifications", "path": "/lightning/setup/CustomNotifications/home" }, { "label": "Notification Builder > Notification Delivery Settings", "path": "/lightning/setup/NotificationTypesManager/home" }, { "label": "Objects and Fields > Object Manager", "path": "/lightning/setup/ObjectManager/home" }, { "label": "Objects and Fields > Picklist Value Sets", "path": "/lightning/setup/Picklists/home" }, { "label": "Objects and Fields > Schema Builder", "path": "/lightning/setup/SchemaBuilder/home" }, { "label": "Offline > Briefcase Builder", "path": "/lightning/setup/Briefcase/home" }, { "label": "Privacy Agent > Privacy Agent Settings", "path": "/lightning/setup/PrivacyAgentSettings/home" }, { "label": "Privacy Center > Consent Event Stream", "path": "/lightning/setup/ConsentEventStream/home" }, { "label": "Privacy Center > Portability Log", "path": "/lightning/setup/DsarPolicyLog/home" }, { "label": "Privacy Center > Portability Policy", "path": "/lightning/setup/DsarPolicyManager/home" }, { "label": "Privacy Center > Privacy Policy Settings", "path": "/lightning/setup/DataManagementPolicySettings/home" }, { "label": "Privacy Center > Privacy Request Settings", "path": "/lightning/setup/PrivacyRequestSettings/home" }, { "label": "Process Automation > Approval Processes", "path": "/lightning/setup/ApprovalProcesses/home" }, { "label": "Process Automation > Automation App", "path": "/lightning/setup/ProcessHome/home" }, { "label": "Process Automation > Flow Performance", "path": "/lightning/setup/FlowPerformance/home" }, { "label": "Process Automation > Flows", "path": "/lightning/setup/Flows/home" }, { "label": "Process Automation > Migrate to Flow", "path": "/lightning/setup/MigrateToFlowTool/home" }, { "label": "Process Automation > MuleSoft Composer", "path": "/lightning/setup/MuleSoftComposer/home" }, { "label": "Process Automation > Next Best Action", "path": "/lightning/setup/NextBestAction/home" }, { "label": "Process Automation > Paused And Failed Flow Interviews", "path": "/lightning/setup/Pausedflows/home" }, { "label": "Process Automation > Post Templates", "path": "/lightning/setup/FeedTemplates/home" }, { "label": "Process Automation > Process Automation Settings", "path": "/lightning/setup/WorkflowSettings/home" }, { "label": "Process Automation > Process Builder", "path": "/lightning/setup/ProcessAutomation/home" }, { "label": "Process Automation > Service Catalog > Catalog Eligibility", "path": "/lightning/setup/ServiceCatalogEligibilityRules/home" }, { "label": "Process Automation > Service Catalog > Catalog Fulfillments", "path": "/lightning/setup/Fulfillments/home" }, { "label": "Process Automation > Service Catalog > Catalog Management", "path": "/lightning/setup/ServiceCatalogHome/home" }, { "label": "Process Automation > Service Catalog > Catalog Settings", "path": "/lightning/setup/ServiceCatalogSettings/home" }, { "label": "Process Automation > Service Process Automation > Service Process Definition Settings", "path": "/lightning/setup/ServiceProcessPrefSettings/home" }, { "label": "Process Automation > Service Process Automation > Service Process Studio", "path": "/lightning/setup/ServiceProcessWizardSetup/home" }, { "label": "Process Automation > Workflow Actions > Email Alerts", "path": "/lightning/setup/WorkflowEmails/home" }, { "label": "Process Automation > Workflow Actions > Field Updates", "path": "/lightning/setup/WorkflowFieldUpdates/home" }, { "label": "Process Automation > Workflow Actions > Knowledge Action", "path": "/lightning/setup/WorkflowKnowledgeSubmit/home" }, { "label": "Process Automation > Workflow Actions > Outbound Messages", "path": "/lightning/setup/WorkflowOutboundMessaging/home" }, { "label": "Process Automation > Workflow Actions > Send Actions", "path": "/lightning/setup/SendAction/home" }, { "label": "Process Automation > Workflow Actions > Tasks", "path": "/lightning/setup/WorkflowTasks/home" }, { "label": "Process Automation > Workflow Rules", "path": "/lightning/setup/WorkflowRules/home" }, { "label": "Release Updates", "path": "/lightning/setup/ReleaseUpdates/home" }, { "label": "Sales Cloud Everywhere", "path": "/lightning/setup/SalesCloudEverywhereSettings/home" }, { "label": "Salesforce Foundations", "path": "/lightning/setup/C360ProvisioningSetup/home" }, { "label": "Salesforce Go", "path": "/lightning/setup/SalesforceGo/home" }, { "label": "Salesforce Mobile App", "path": "/lightning/setup/SalesforceMobileAppQuickStart/home" }, { "label": "Scale > Scale Center > Alerts", "path": "/lightning/setup/ScaleCenterAlerts/home" }, { "label": "Scale > Scale Center > Org Overview", "path": "/lightning/setup/ScaleCenterOrgOverview/home" }, { "label": "Scale > Scale Center > Org Performance", "path": "/lightning/setup/Metrics/home" }, { "label": "Scale > Scale Center > Performance Analysis", "path": "/lightning/setup/PerformanceAnalysis/home" }, { "label": "Scale > Scale Center > Scale Insights > ApexGuru Insights", "path": "/lightning/setup/ApexGuruInsights/home" }, { "label": "Scale > Scale Center > Scale Insights > Database Insights", "path": "/lightning/setup/DatabaseInsights/home" }, { "label": "Scale > Scale Center > Scale Insights > Deployment Insights", "path": "/lightning/setup/DeploymentInsights/home" }, { "label": "Scale > Scale Center > Scale Insights > Governor Limit Insights", "path": "/lightning/setup/GovernorLimitsInsights/home" }, { "label": "Scale > Scale Center > Scale Insights > Lightning Experience Insights", "path": "/lightning/setup/LexInsights/home" }, { "label": "Scale > Scale Center > Scale Insights > Report Insights", "path": "/lightning/setup/ReportInsights/home" }, { "label": "Scale > Scale Center > Scale Insights > Search Insights", "path": "/lightning/setup/SearchInsights/home" }, { "label": "Scale > Scale Test > Overview", "path": "/lightning/setup/ScaleTestOverview/home" }, { "label": "Security > Activations", "path": "/lightning/setup/ActivatedIpAddressAndClientBrowsersPage/home" }, { "label": "Security > Audit Trail > Audit Trail Export Dashboard", "path": "/lightning/setup/ExportDashboard/home" }, { "label": "Security > Certificate and Key Management", "path": "/lightning/setup/CertificatesAndKeysManagement/home" }, { "label": "Security > Compliant Data Sharing > Custom Object Settings", "path": "/lightning/setup/CustomObjectSettings/home" }, { "label": "Security > Compliant Data Sharing > General Settings", "path": "/lightning/setup/CDSGeneralSettings/home" }, { "label": "Security > Compliant Data Sharing > Object Enablement Settings", "path": "/lightning/setup/ObjectEnablementSettings/home" }, { "label": "Security > Compliant Data Sharing > Participant Roles", "path": "/lightning/setup/ParticipantRoles/home" }, { "label": "Security > CORS", "path": "/lightning/setup/CorsWhitelistEntries/home" }, { "label": "Security > Delegated Administration", "path": "/lightning/setup/DelegateGroups/home" }, { "label": "Security > Event Monitoring > Event Log File Browser", "path": "/lightning/setup/ElfBrowser/home" }, { "label": "Security > Event Monitoring > Event Monitoring Settings", "path": "/lightning/setup/EventMonitoringSetup/home" }, { "label": "Security > Event Monitoring > Transaction Security Policies", "path": "/lightning/setup/TransactionSecurityNew/home" }, { "label": "Security > Expire All Passwords", "path": "/lightning/setup/SecurityExpirePasswords/home" }, { "label": "Security > Field Accessibility", "path": "/lightning/setup/FieldAccessibility/home" }, { "label": "Security > File Upload and Download Security", "path": "/lightning/setup/FileTypeSetting/home" }, { "label": "Security > Guest User Sharing Rule Access Report", "path": "/lightning/setup/GuestUserAccessVerification/home" }, { "label": "Security > Health Check", "path": "/lightning/setup/HealthCheck/home" }, { "label": "Security > Login Access Policies", "path": "/lightning/setup/LoginAccessPolicies/home" }, { "label": "Security > Named Credentials", "path": "/lightning/setup/NamedCredential/home" }, { "label": "Security > Password Policies", "path": "/lightning/setup/SecurityPolicies/home" }, { "label": "Security > Platform Encryption > Encryption Settings", "path": "/lightning/setup/EncryptionAdvancedSettings/home" }, { "label": "Security > Platform Encryption > Key Management", "path": "/lightning/setup/PlatformEncryptionKeyManagement/home" }, { "label": "Security > Portal Health Check", "path": "/lightning/setup/PortalSecurityReport/home" }, { "label": "Security > Private Connect", "path": "/lightning/setup/PrivateConnect/home" }, { "label": "Security > Remote Site Settings", "path": "/lightning/setup/SecurityRemoteProxy/home" }, { "label": "Security > Session Management", "path": "/lightning/setup/SessionManagementPage/home" }, { "label": "Security > Session Settings", "path": "/lightning/setup/SecuritySession/home" }, { "label": "Security > Sharing Settings", "path": "/lightning/setup/SecuritySharing/home" }, { "label": "Security > Trusted URL and Browser Policy Violations", "path": "/lightning/setup/BrowserPolicyViolations/home" }, { "label": "Security > Trusted URLs", "path": "/lightning/setup/SecurityCspTrustedSite/home" }, { "label": "Security > Trusted URLs for Redirects", "path": "/lightning/setup/SecurityRedirectWhitelistUrl/home" }, { "label": "Security > View Setup Audit Trail", "path": "/lightning/setup/SecurityEvents/home" }, { "label": "Service Cloud Reports", "path": "/lightning/setup/ServiceCloudReportsSetupAssistant/home" }, { "label": "Setup Home", "path": "/lightning/setup/SetupOneHome/home" }, { "label": "Slack > Guided Slack Setup", "path": "/lightning/setup/AutoSlack/home" }, { "label": "Slack > Manage Slack Connection", "path": "/lightning/setup/SlackWorkspaces/home" }, { "label": "Slack > Slack Apps Setup", "path": "/lightning/setup/SlackSetupAssistant/home" }, { "label": "Slack > Slack Channels for Records", "path": "/lightning/setup/SlackRecordChannels/home" }, { "label": "Slack > Specialized Slack Apps > Care Coordination for Slack Settings", "path": "/lightning/setup/CareMgmtSlack/home" }, { "label": "Slack > Specialized Slack Apps > CRM Analytics for Slack", "path": "/lightning/setup/SlackAnalyticsApp/home" }, { "label": "Slack > Specialized Slack Apps > PRM for Slack", "path": "/lightning/setup/SlackSetupForPRM/home" }, { "label": "Slack > Specialized Slack Apps > Sales Cloud For Slack", "path": "/lightning/setup/SlackSetupForSales/home" }, { "label": "Slack > Specialized Slack Apps > Service Cloud for Slack", "path": "/lightning/setup/SlackServiceApp/home" }, { "label": "Slack > Specialized Slack Apps > Slack App Builder", "path": "/lightning/setup/SlackApexCustomApps/home" }, { "label": "Slack > Specialized Slack Apps > System Users Setup", "path": "/lightning/setup/SlackIntegrationUserSetup/home" }, { "label": "Subscription Management > General Settings", "path": "/lightning/setup/SubMgmtGettingStarted/home" }, { "label": "Tableau Next > CRM Analytics Metadata Bridge", "path": "/lightning/setup/AnalyticsMetadataBridgeV2/home" }, { "label": "Tableau Next > Reports Metadata Bridge", "path": "/lightning/setup/OperationalAnalyticsMetadataBridge/home" }, { "label": "Tableau Next > Tableau Next Setup", "path": "/lightning/setup/EasySetup/home" }, { "label": "Unified Messaging > Microsoft Copilot", "path": "/lightning/setup/MSCopilotSetup/home" }, { "label": "Unified Messaging > RCS Messaging > RCS Sender Agents", "path": "/lightning/setup/RcsAgents/home" }, { "label": "Unified Messaging > WhatsApp > Your Numbers", "path": "/lightning/setup/WhatsappPhoneNumbers/home" }, { "label": "User Engagement > Adoption Assistance", "path": "/lightning/setup/AdoptionAssistance/home" }, { "label": "User Engagement > Guidance Center", "path": "/lightning/setup/LearningSetup/home" }, { "label": "User Engagement > Help Menu", "path": "/lightning/setup/HelpMenu/home" }, { "label": "User Engagement > In-App Guidance", "path": "/lightning/setup/Prompts/home" }, { "label": "User Engagement > Motivation", "path": "/lightning/setup/MotivationSetup/home" }, { "label": "User Engagement > Personalized Suggestions", "path": "/lightning/setup/PersonalizedSuggestionsSetup/home" }, { "label": "User Interface > Action Link Templates", "path": "/lightning/setup/ActionLinkGroupTemplates/home" }, { "label": "User Interface > Actions & Recommendations", "path": "/lightning/setup/GuidedActions/home" }, { "label": "User Interface > App Menu", "path": "/lightning/setup/AppMenu/home" }, { "label": "User Interface > Console Settings > Console Workspace Page Loading Preference", "path": "/lightning/setup/DeferRenderingWorkspacePageSetupPage/home" }, { "label": "User Interface > Console Settings > Loaded Console Tab Limit", "path": "/lightning/setup/ConsoleMaxTabCacheSetup/home" }, { "label": "User Interface > Custom Labels", "path": "/lightning/setup/ExternalStrings/home" }, { "label": "User Interface > Density Settings", "path": "/lightning/setup/DensitySetup/home" }, { "label": "User Interface > Global Actions > Global Actions", "path": "/lightning/setup/GlobalActions/home" }, { "label": "User Interface > Global Actions > Publisher Layouts", "path": "/lightning/setup/GlobalPublisherLayouts/home" }, { "label": "User Interface > Icons > Events and Milestones", "path": "/lightning/setup/MilestoneIcons/home" }, { "label": "User Interface > Lightning App Builder", "path": "/lightning/setup/FlexiPageList/home" }, { "label": "User Interface > Lightning Extension", "path": "/lightning/setup/LightningExtension/home" }, { "label": "User Interface > Path Settings", "path": "/lightning/setup/PathAssistantSetupHome/home" }, { "label": "User Interface > Quick Text Settings", "path": "/lightning/setup/LightningQuickTextSettings/home" }, { "label": "User Interface > Record Page Settings", "path": "/lightning/setup/SimpleRecordHome/home" }, { "label": "User Interface > Rename Tabs and Labels", "path": "/lightning/setup/RenameTab/home" }, { "label": "User Interface > Sites and Domains > Custom URLs", "path": "/lightning/setup/DomainSites/home" }, { "label": "User Interface > Sites and Domains > Domains", "path": "/lightning/setup/DomainNames/home" }, { "label": "User Interface > Sites and Domains > Sites", "path": "/lightning/setup/CustomDomain/home" }, { "label": "User Interface > Tabs", "path": "/lightning/setup/CustomTabs/home" }, { "label": "User Interface > Themes and Branding", "path": "/lightning/setup/ThemingAndBranding/home" }, { "label": "User Interface > Translation Workbench > Data Translation Settings", "path": "/lightning/setup/LabelWorkbenchDataTranslationSetup/home" }, { "label": "User Interface > Translation Workbench > Export", "path": "/lightning/setup/LabelWorkbenchExport/home" }, { "label": "User Interface > Translation Workbench > Import", "path": "/lightning/setup/LabelWorkbenchImport/home" }, { "label": "User Interface > Translation Workbench > Override", "path": "/lightning/setup/LabelWorkbenchOverride/home" }, { "label": "User Interface > Translation Workbench > Translate", "path": "/lightning/setup/LabelWorkbenchTranslate/home" }, { "label": "User Interface > Translation Workbench > Translation Language Settings", "path": "/lightning/setup/LabelWorkbenchSetup/home" }, { "label": "User Interface > User Interface", "path": "/lightning/setup/UserInterfaceUI/home" }, { "label": "Users > Analytics Groups", "path": "/lightning/setup/DataAnalyticsGroups/home" }, { "label": "Users > Permission Set Groups", "path": "/lightning/setup/PermSetGroups/home" }, { "label": "Users > Permission Sets", "path": "/lightning/setup/PermissionSetListView/home" }, { "label": "Users > Profiles", "path": "/lightning/setup/EnhancedProfiles/home" }, { "label": "Users > Public Groups", "path": "/lightning/setup/PublicGroups/home" }, { "label": "Users > Queues", "path": "/lightning/setup/Queues/home" }, { "label": "Users > Roles", "path": "/lightning/setup/Roles/home" }, { "label": "Users > User Management Settings", "path": "/lightning/setup/UserManagementSettings/home" }, { "label": "Users > User Mappings", "path": "/lightning/setup/UserMapping/home" }, { "label": "Users > Users", "path": "/lightning/setup/ManageUsersLightning/home" }, { "label": "Workflow Services > Batch Management", "path": "/lightning/setup/BatchProcessJobDefinition/home" }, { "label": "Workflow Services > Data Processing Engine", "path": "/lightning/setup/DataProcessingEngine/home" }, { "label": "Workflow Services > Monitor Workflow Services", "path": "/lightning/setup/MonitorWorkflowServices/home" }]);

  // sfInject/content/setupCommandPaletteUtils.js
  var DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT = "Ctrl+K";
  var MODIFIER_ORDER = ["Ctrl", "Alt", "Shift"];
  function normalizeSetupCommandPaletteShortcut(value) {
    const raw = String(value || "").trim();
    const parts = raw.split("+").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 4) return DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT;
    const key = parts.pop();
    const modifiers = new Set(parts.map((part) => part.toLowerCase()));
    if (!/^[a-z0-9]$/i.test(key) || !modifiers.has("ctrl") || modifiers.size !== parts.length) {
      return DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT;
    }
    const normalized = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier.toLowerCase()));
    return [...normalized, key.toUpperCase()].join("+");
  }
  function shortcutFromKeyboardEvent(event) {
    const key = String(event?.key || "").toUpperCase();
    if (!/^[A-Z0-9]$/.test(key)) return "";
    const modifiers = [];
    if (event.ctrlKey || event.metaKey) modifiers.push("Ctrl");
    if (event.altKey) modifiers.push("Alt");
    if (event.shiftKey) modifiers.push("Shift");
    return modifiers.length ? [...modifiers, key].join("+") : "";
  }
  function isSetupCommandPaletteShortcut(event, shortcut) {
    if (!event || event.isComposing) return false;
    const target = normalizeSetupCommandPaletteShortcut(shortcut);
    const actual = shortcutFromKeyboardEvent(event);
    return actual === target;
  }
  function normalizePaletteSearch(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
  }
  function filterSetupCommandPaletteEntries(entries, query, limit = 60) {
    const terms = normalizePaletteSearch(query).split(/\s+/).filter(Boolean);
    return (Array.isArray(entries) ? entries : []).map((entry) => ({
      ...entry,
      searchText: normalizePaletteSearch(`${entry.label || ""} ${entry.detail || ""}`),
      rankingText: normalizePaletteSearch(entry.searchLabel || entry.label || "")
    })).filter((entry) => terms.every((term) => entry.searchText.includes(term))).sort((a, b) => {
      const aOrder = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
      const bOrder = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
      const aStarts = terms.length && a.rankingText.startsWith(terms[0]) ? 0 : 1;
      const bStarts = terms.length && b.rankingText.startsWith(terms[0]) ? 0 : 1;
      return aOrder - bOrder || aStarts - bStarts || String(a.label).localeCompare(String(b.label), "es");
    }).slice(0, limit);
  }

  // sfInject/content/setupCommandPalette.js
  var INTEGRATION_ID7 = "setupCommandPalette";
  var ROOT_ID = "sfoc-setup-command-palette";
  var MAX_RESULTS = 60;
  var COPY = Object.freeze({
    es: {
      title: "Paleta de configuraci\xF3n Salesforce",
      search: "Buscar Setup, Quick links, herramientas, scripts o ficheros\u2026",
      searchLabel: "Buscar en la paleta de configuraci\xF3n Salesforce",
      hint: "\u2191\u2193 navegar \xB7 Enter abrir \xB7 Esc cerrar",
      noResults: "No hay resultados.",
      loadingFiles: "Buscando ficheros del entorno\u2026",
      setup: "Setup Salesforce",
      quickLinks: "Quick links del entorno",
      tools: "Herramientas SFOC",
      scripts: "Scripts",
      savedScripts: "Scripts Apex guardados",
      savedFiles: "Ficheros del entorno",
      openInNewTab: "Abrir en una nueva pesta\xF1a",
      anonymousApex: "Abrir Anonymous Apex en SFOC"
    },
    en: {
      title: "Salesforce Setup palette",
      search: "Search Setup, Quick links, tools, scripts, or files\u2026",
      searchLabel: "Search Salesforce Setup palette",
      hint: "\u2191\u2193 navigate \xB7 Enter open \xB7 Esc close",
      noResults: "No results.",
      loadingFiles: "Searching environment files\u2026",
      setup: "Salesforce Setup",
      quickLinks: "Environment Quick links",
      tools: "SFOC tools",
      scripts: "Scripts",
      savedScripts: "Saved Apex scripts",
      savedFiles: "Environment files",
      openInNewTab: "Open in a new tab",
      anonymousApex: "Open Anonymous Apex in SFOC"
    }
  });
  function copyFor(lang) {
    return COPY[lang === "en" ? "en" : "es"];
  }
  function humanize(value) {
    return String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
  }
  function setupEntries(copy) {
    return SETUP_PALETTE_PAGES.flatMap((item) => {
      const path = String(item?.path || "");
      const label = String(item?.label || "").trim();
      if (!path || !label) return [];
      return [{
        kind: "setup",
        order: 3,
        group: copy.setup,
        label,
        detail: path,
        path
      }];
    });
  }
  function sfocEntries(copy) {
    return Object.keys(SFOC_TOOL_MODES).map((toolId) => ({
      kind: "tool",
      order: 2,
      group: copy.tools,
      label: humanize(toolId),
      detail: toolId,
      toolId
    }));
  }
  function quickLinkEntries(copy, links) {
    return (Array.isArray(links) ? links : []).flatMap((link) => {
      if (!link || typeof link !== "object") return [];
      if (link.type === "sfoc") return [];
      const label = String(link.label || "").trim();
      if (!label) return [];
      const path = String(link.url || "");
      return buildCustomQuickLinkUrl(path) ? [{ kind: "setup", order: 0, group: copy.quickLinks, label, detail: path, path }] : [];
    });
  }
  function scriptEntries(copy, scripts = []) {
    const saved = (Array.isArray(scripts) ? scripts : []).map((script) => ({
      kind: "script",
      order: 1,
      group: copy.savedScripts,
      label: script.name || "script",
      detail: "Anonymous Apex",
      scriptId: script.id
    })).filter((script) => script.scriptId);
    return saved.length ? saved : [{
      kind: "tool",
      order: 1,
      group: copy.scripts,
      label: copy.savedScripts,
      detail: copy.anonymousApex,
      toolId: "AnonymousApex"
    }];
  }
  function createResultIcon(doc, entry) {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("sfoc-setup-palette-result-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    const order = Number(entry.order);
    if (order === 0) path.setAttribute("d", "M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1");
    else if (order === 1) path.setAttribute("d", "M8 9l-3 3 3 3M16 9l3 3-3 3M14 5l-4 14");
    else if (order === 2) path.setAttribute("d", "M14.7 6.3a5 5 0 0 0-6 6L3 18l3 3 5.7-5.7a5 5 0 0 0 6-6L14 13l-3-3z");
    else if (order === 3) path.setAttribute("d", "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5");
    else path.setAttribute("d", "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.2 2.2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3.2v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L6.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5v-3.2h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.2-2.2.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V4h3.2v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.2 2.2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.5 1z");
    svg.appendChild(path);
    return svg;
  }
  function createOption(doc, entry, active, onSelect, copy) {
    const row = doc.createElement("div");
    row.className = "sfoc-setup-palette-option";
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", active ? "true" : "false");
    if (active) row.classList.add("is-active");
    const option = doc.createElement("button");
    option.type = "button";
    option.className = "sfoc-setup-palette-option-main";
    const group = doc.createElement("span");
    group.className = "sfoc-setup-palette-option-group";
    group.textContent = entry.group;
    const label = doc.createElement("strong");
    label.textContent = entry.label;
    const content = doc.createElement("span");
    content.className = "sfoc-setup-palette-option-content";
    content.append(group, label);
    option.append(createResultIcon(doc, entry), content);
    option.addEventListener("click", () => onSelect(entry));
    const openNewTab = doc.createElement("button");
    openNewTab.type = "button";
    openNewTab.className = "sfoc-setup-palette-open-new-tab";
    openNewTab.title = copy.openInNewTab;
    openNewTab.setAttribute("aria-label", `${copy.openInNewTab}: ${entry.label}`);
    openNewTab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5"/></svg>';
    openNewTab.addEventListener("click", () => onSelect(entry, true));
    row.append(option, openNewTab);
    return row;
  }
  async function loadExtraEntries(ctx, copy) {
    try {
      const result = await sfInjectSend({ type: "sfInject:getSetupCommandPaletteFiles", orgId: ctx.orgId });
      return {
        files: (Array.isArray(result?.files) ? result.files : []).map((file) => ({
          kind: "file",
          order: 4,
          group: copy.savedFiles,
          label: `${file.typeLabel || file.type} > ${file.label}`,
          detail: file.type,
          searchLabel: file.label,
          type: file.type,
          key: file.key,
          bundleId: file.bundleId
        })),
        scripts: Array.isArray(result?.scripts) ? result.scripts : []
      };
    } catch {
      return { files: [], scripts: [] };
    }
  }
  function createPalette(doc, ctx) {
    const copy = copyFor(ctx.lang);
    const root = doc.createElement("section");
    root.id = ROOT_ID;
    root.className = "sfoc-setup-palette";
    root.setAttribute("aria-hidden", "true");
    const backdrop = doc.createElement("div");
    backdrop.className = "sfoc-setup-palette-backdrop";
    const dialog = doc.createElement("div");
    dialog.className = "sfoc-setup-palette-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", copy.title);
    const searchRow = doc.createElement("div");
    searchRow.className = "sfoc-setup-palette-search-row";
    const appIcon = doc.createElement("img");
    appIcon.className = "sfoc-setup-palette-app-icon";
    appIcon.src = chrome.runtime.getURL("icons/icon-512.png");
    appIcon.alt = "";
    appIcon.setAttribute("aria-hidden", "true");
    const input = doc.createElement("input");
    input.type = "search";
    input.className = "sfoc-setup-palette-input";
    input.placeholder = copy.search;
    input.setAttribute("aria-label", copy.searchLabel);
    input.setAttribute("autocomplete", "off");
    const hint = doc.createElement("p");
    hint.className = "sfoc-setup-palette-hint";
    hint.textContent = `${copy.hint} \xB7 ${ctx.shortcut || DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT}`;
    const results = doc.createElement("div");
    results.className = "sfoc-setup-palette-results";
    results.setAttribute("role", "listbox");
    results.setAttribute("aria-live", "polite");
    searchRow.append(appIcon, input);
    dialog.append(searchRow, results, hint);
    root.append(backdrop, dialog);
    doc.body.appendChild(root);
    let entries = [...quickLinkEntries(copy, ctx.quickLinks), ...scriptEntries(copy), ...sfocEntries(copy), ...setupEntries(copy)];
    let matches = [];
    let activeIndex = 0;
    let previousFocus = null;
    let open = false;
    let fileEntries = [];
    let savedScripts = [];
    let fileSearchTimer = null;
    let fileSearchGeneration = 0;
    let filesLoading = false;
    const rebuildEntries = () => {
      entries = [...quickLinkEntries(copy, ctx.quickLinks), ...scriptEntries(copy, savedScripts), ...sfocEntries(copy), ...setupEntries(copy), ...fileEntries];
    };
    const close = () => {
      if (!open) return;
      open = false;
      root.classList.remove("is-open");
      root.setAttribute("aria-hidden", "true");
      if (previousFocus?.isConnected) previousFocus.focus();
      previousFocus = null;
    };
    const select = async (entry, openInNewTab = false) => {
      close();
      if (entry.kind === "setup") {
        const url = buildCustomQuickLinkUrl(entry.path);
        if (openInNewTab) window.open(url, "_blank", "noopener,noreferrer");
        else location.assign(url);
        return;
      }
      try {
        await sfInjectSend({
          type: "sfInject:openSetupCommandPaletteTarget",
          orgId: ctx.orgId,
          target: entry.kind,
          toolId: entry.toolId,
          itemType: entry.type,
          itemKey: entry.key,
          scriptId: entry.scriptId,
          bundleId: entry.bundleId,
          openInNewTab
        });
      } catch {
        ctx.onError?.(ctx.lang === "en" ? "The selected item could not be opened in SFOC." : "No se pudo abrir el elemento seleccionado en SFOC.");
      }
    };
    const render = () => {
      if (!input.value.trim()) {
        matches = [];
        activeIndex = 0;
        results.replaceChildren();
        return;
      }
      matches = filterSetupCommandPaletteEntries(entries, input.value, MAX_RESULTS);
      activeIndex = Math.min(activeIndex, Math.max(0, matches.length - 1));
      results.replaceChildren();
      const appendLoading = () => {
        const loading = doc.createElement("p");
        loading.className = "sfoc-setup-palette-loading";
        const spinner = doc.createElement("span");
        spinner.className = "sfoc-setup-palette-spinner";
        spinner.setAttribute("aria-hidden", "true");
        loading.append(spinner, doc.createTextNode(copy.loadingFiles));
        results.appendChild(loading);
      };
      if (!matches.length) {
        if (filesLoading) {
          appendLoading();
          return;
        }
        const empty = doc.createElement("p");
        empty.className = "sfoc-setup-palette-empty";
        empty.textContent = copy.noResults;
        results.appendChild(empty);
        return;
      }
      matches.forEach((entry, index) => results.appendChild(createOption(doc, entry, index === activeIndex, select, copy)));
      if (filesLoading) appendLoading();
    };
    const show = () => {
      if (open) return close();
      previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
      open = true;
      if (fileSearchTimer) clearTimeout(fileSearchTimer);
      fileSearchGeneration++;
      filesLoading = false;
      fileEntries = [];
      rebuildEntries();
      activeIndex = 0;
      input.value = "";
      root.classList.add("is-open");
      root.setAttribute("aria-hidden", "false");
      render();
      requestAnimationFrame(() => input.focus());
    };
    const searchFiles = () => {
      const query = input.value.trim();
      const generation = ++fileSearchGeneration;
      if (fileSearchTimer) clearTimeout(fileSearchTimer);
      if (!query) {
        filesLoading = false;
        fileEntries = [];
        rebuildEntries();
        return;
      }
      filesLoading = true;
      fileSearchTimer = setTimeout(async () => {
        const result = await sfInjectSend({
          type: "sfInject:searchSetupCommandPaletteFiles",
          orgId: ctx.orgId,
          query
        }).catch(() => null);
        if (generation !== fileSearchGeneration) return;
        filesLoading = false;
        fileEntries = (Array.isArray(result?.files) ? result.files : []).map((file) => ({
          kind: "file",
          order: 4,
          group: copy.savedFiles,
          label: `${file.typeLabel || file.type} > ${file.label}`,
          detail: file.type,
          searchLabel: file.label,
          type: file.type,
          key: file.key,
          bundleId: file.bundleId
        }));
        rebuildEntries();
        if (open) render();
      }, 220);
    };
    input.addEventListener("input", () => {
      activeIndex = 0;
      searchFiles();
      render();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowDown" && matches.length) {
        event.preventDefault();
        activeIndex = Math.min(activeIndex + 1, matches.length - 1);
        render();
      }
      if (event.key === "ArrowUp" && matches.length) {
        event.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        render();
      }
      if (event.key === "Enter" && matches[activeIndex]) {
        event.preventDefault();
        void select(matches[activeIndex]);
      }
    });
    backdrop.addEventListener("click", close);
    const onKeyDown = (event) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (!isSetupCommandPaletteShortcut(event, ctx.shortcut)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      show();
    };
    doc.addEventListener("keydown", onKeyDown, true);
    void loadExtraEntries(ctx, copy).then(({ scripts }) => {
      savedScripts = scripts;
      rebuildEntries();
      if (open) render();
    });
    return () => {
      doc.removeEventListener("keydown", onKeyDown, true);
      root.remove();
    };
  }
  function isParentPageActive() {
    try {
      return isQuickLinksSalesforcePage(window.top.location.href);
    } catch {
      return isQuickLinksSalesforcePage(location.href);
    }
  }
  var setupCommandPaletteIntegration = {
    id: INTEGRATION_ID7,
    isParentPageActive,
    isFrameRelevant: () => window.top === window,
    mount(doc, ctx) {
      return createPalette(doc, {
        ...ctx,
        shortcut: ctx.prefs?.setupCommandPaletteShortcut || DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT
      });
    }
  };

  // sfInject/content/injectors/registry.js
  var SF_INJECT_CONTENT_INTEGRATIONS = [
    debugLogOpenViewerIntegration,
    debugLogsTableOrderIntegration,
    userTraceFlagsEnhanceIntegration,
    deployStatusInlineDetailsIntegration,
    deployStatusDetailSourceLinksIntegration,
    quickLinksIntegration,
    setupCommandPaletteIntegration
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
      },
      {
        id: "quickLinks",
        settingsLabelKey: "settings.sfInjectQuickLinks",
        settingsHintKey: "settings.sfInjectQuickLinksHint",
        settingsConfigureLabelKey: "settings.sfInjectQuickLinksConfigure",
        settingsConfigureModalTitleKey: "settings.sfInjectQuickLinksConfigureTitle"
      },
      {
        id: "setupCommandPalette",
        settingsLabelKey: "settings.sfInjectSetupCommandPalette",
        settingsHintKey: "settings.sfInjectSetupCommandPaletteHint",
        settingsConfigureLabelKey: "settings.sfInjectSetupCommandPaletteConfigure",
        settingsConfigureModalTitleKey: "settings.sfInjectSetupCommandPaletteConfigureTitle"
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
    userTraceFlagsActiveOnly: false,
    /** Atajo configurable para abrir la paleta de Setup en Salesforce. */
    setupCommandPaletteShortcut: "Ctrl+K"
  };
  var DEFAULTS = {
    /** Master toggle: opt-in; sin activación explícita no hay inyección. */
    enabled: false,
    /** Toggles por integración; opt-in (`true` solo si el usuario las activa). */
    integrations: { ...DEFAULT_INTEGRATIONS },
    /** Preferencias de comportamiento (no son toggles de integración). */
    prefs: { ...DEFAULT_SF_INJECT_PREFS },
    quickLinks: {}
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
      orgLabel: String(orgRes?.org?.label || orgRes?.org?.displayName || orgRes?.org?.instanceUrl || ""),
      lang,
      prefs: settings.prefs || {},
      quickLinks: Array.isArray(settings.quickLinks?.[orgRes?.orgId]) ? settings.quickLinks[orgRes.orgId] : [],
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
      if (integration.requiresQuickLinks && !ctx.quickLinks.length) {
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
