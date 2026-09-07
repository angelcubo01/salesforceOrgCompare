import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import {
  buildCompanyInfoUrl, buildTrustIncidentUrl, buildTrustMaintenanceUrl, buildTrustPageUrl,
  calculateIncidentDuration, deriveTrustHealth
} from '../../shared/trustStatusApi.js';
import { handleToolError } from '../../shared/reportToolError.js';
import { buildSessionDetailRows } from '../../shared/sessionInfoApi.js';
import {
  buildTimelineIntervals, escapeHtml, formatDuration, formatTrustDate, hasActiveSalesforceSession,
  renderSessionDetailGridHtml, toggleExpandedOrg
} from './environmentStatusPanelHelpers.js';

const COL_COUNT = 8;
let activeFilter = 'all';
let lastRows = [];
let lastFetchedAt = '';
let expandedOrgIds = new Set();
let renderGeneration = 0;
const sessionDetailCache = new Map();
const trustDetailCache = new Map();
const detailTabByOrg = new Map();
const historyDaysByOrg = new Map();
const historyFiltersByOrg = new Map();
let trustDialogRestoreFocus = null;

function lang() { return getCurrentLang() === 'en' ? 'en' : 'es'; }
function date(value) { return formatTrustDate(value, lang()); }
function host(url) { try { return new URL(String(url)).hostname; } catch { return '—'; } }
function array(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' ? value : {}; }
function statusLabel(status) { return t(`envStatus.health.${deriveTrustHealth(status).labelKey}`); }
function serviceNames(keys, labels) {
  return array(keys).map((key) => String(object(labels)[key] || key)).join(', ') || t('envStatus.none');
}
function envLabel(row, aliases, groups) {
  const saved = object(row.saved);
  return buildOrgPicklistLabel({ id: saved.id, displayName: saved.displayName, label: saved.label, instanceUrl: saved.instanceUrl }, { aliases, groups });
}
function sandbox(row) { return typeof row.sf?.isSandbox === 'boolean' ? row.sf.isSandbox : !!row.saved?.isSandbox; }
function rowAlert(row) {
  const health = deriveTrustHealth(row.trust?.status);
  return Number(row.activeIncidentCount || 0) > 0 || ['major', 'minor', 'maintenance'].includes(health.level) || array(row.errors).length > 0;
}
function filterRow(row) {
  // El panel principal representa solamente sesiones utilizables. Los datos Trust
  // se conservan en caché, pero una sesión expirada no ocupa una fila operativa.
  if (!hasActiveSalesforceSession(row)) return false;
  if (activeFilter === 'prod' && sandbox(row)) return false;
  if (activeFilter === 'sandbox' && !sandbox(row)) return false;
  return activeFilter !== 'alerts' || rowAlert(row);
}
function healthClass(status) { return `env-status-health-${deriveTrustHealth(status).level}`; }
function formatWithIso(value) {
  if (!value) return '—';
  return `<time title="${escapeHtml(String(value))}" datetime="${escapeHtml(String(value))}">${escapeHtml(date(value))}</time>`;
}
function syncFilters() {
  document.querySelectorAll('[data-env-status-filter]').forEach((button) => {
    const active = button.getAttribute('data-env-status-filter') === activeFilter;
    button.classList.toggle('env-status-filter-active', active); button.setAttribute('aria-pressed', String(active));
  });
}
function renderSummary(rows) {
  const root = document.getElementById('environmentStatusSummary');
  if (!root) return;
  const visible = rows.filter(filterRow);
  const uniqueIncidents = new Set(visible.flatMap((row) => array(row.activeIncidents).map((incident) => String(incident.id)).filter(Boolean)));
  const sevenDays = Date.now() + 7 * 86400000;
  const operationalInstances = new Set(visible.filter((row) => deriveTrustHealth(row.trust?.status).level === 'operational').map((row) => row.instanceKey).filter(Boolean));
  const maintenances = visible.filter((row) => {
    const time = new Date(row.nextMaintenance?.plannedStartTime || '').getTime(); return Number.isFinite(time) && time <= sevenDays;
  }).length;
  const expired = rows.filter((row) => !hasActiveSalesforceSession(row)).length;
  const cards = [
    ['visibleOrgs', visible.length], ['operationalInstances', operationalInstances.size], ['uniqueActiveIncidents', uniqueIncidents.size],
    ['maintenancesNext7Days', maintenances], ['expiredSessions', expired]
  ];
  root.innerHTML = cards.map(([label, value]) => `<div class="env-status-summary-card"><span>${escapeHtml(t(`envStatus.summary.${label}`))}</span><strong>${escapeHtml(String(value))}</strong></div>`).join('');
}
function instanceDetails(row, detail) {
  const instance = object(detail?.instance || row.instance);
  const trust = object(detail?.trust || row.trust);
  const saved = object(row.saved);
  const metadata = [
    [t('envStatus.detailOrgName'), row.sf?.name || saved.displayName || '—'], [t('envStatus.colOrgId'), row.orgId || saved.id || '—'],
    [t('envStatus.detailInstanceUrl'), saved.instanceUrl || '—'], [t('envStatus.colInstance'), row.instanceKey || '—'],
    [t('envStatus.location'), instance.location || '—'], [t('envStatus.environment'), instance.environment || '—'],
    [t('envStatus.release'), instance.releaseVersion || trust.releaseVersion || '—'], [t('envStatus.releaseNumber'), instance.releaseNumber || '—'],
    [t('envStatus.maintenanceWindow'), instance.maintenanceWindow || trust.maintenanceWindow || '—'],
    [t('envStatus.source'), row.auth === 'active' ? t('envStatus.sourceSalesforceTrust') : t('envStatus.sourceTrustCached')]
  ];
  return renderSessionDetailGridHtml(metadata.map(([label, value]) => ({ label, value: String(value ?? '—') })));
}
function timelineHtml(detail, labels, orgId) {
  const days = Number(detail?.days) === 90 ? 90 : 30;
  const end = Date.now(); const start = end - days * 86400000;
  const incidents = array(detail?.incidentHistory).concat(array(detail?.activeIncidents));
  const maintenances = array(detail?.upcomingMaintenances).concat(array(detail?.maintenanceHistory));
  const incidentIntervals = buildTimelineIntervals(incidents, start, end, end);
  const maintenanceIntervals = buildTimelineIntervals(maintenances, start, end, end);
  const interval = (entry, kind) => {
    const item = entry.item; const severity = String(item.severity || item.status || '').toUpperCase().includes('MAJOR') ? 'major' : 'minor';
    const eventStart = item.startTime || item.plannedStartTime; const eventEnd = item.endTime || item.plannedEndTime || new Date(end).toISOString();
    const label = `${kind}: ${item.id || item.name || ''} · ${date(eventStart)} – ${date(eventEnd)}`;
    return `<button type="button" class="env-status-timeline-item env-status-timeline-${kind} env-status-timeline-${severity}" style="left:${entry.left}%;width:${entry.width}%" aria-label="${escapeHtml(label)}" data-env-timeline-kind="${escapeHtml(kind)}" data-env-timeline-id="${escapeHtml(item.id || '')}" data-env-org="${escapeHtml(orgId)}" data-env-timeline-title="${escapeHtml(item.title || item.name || item.type || item.id || '')}" data-env-timeline-status="${escapeHtml(item.status || '')}" data-env-timeline-severity="${escapeHtml(item.severity || '')}" data-env-timeline-services="${escapeHtml(serviceNames(item.serviceKeys, labels))}" data-env-timeline-start="${escapeHtml(String(eventStart || ''))}" data-env-timeline-end="${escapeHtml(String(eventEnd || ''))}"></button>`;
  };
  return `<section class="env-status-timeline" aria-label="${escapeHtml(t('envStatus.trustActivity'))}"><h4>${escapeHtml(t('envStatus.trustActivity'))}</h4><p class="env-status-timeline-hint">${escapeHtml(t('envStatus.timelineHint'))}</p><div class="env-status-timeline-scale"><span>${escapeHtml(`${days} ${t('envStatus.days')}`)}</span><span>${escapeHtml(t('envStatus.now'))}</span></div><div class="env-status-timeline-track"><span class="env-status-timeline-now" aria-hidden="true"></span>${incidentIntervals.map((entry) => interval(entry, 'incident')).join('')}${maintenanceIntervals.map((entry) => interval(entry, 'maintenance')).join('')}</div><p class="env-status-timeline-legend"><span class="env-status-legend-major">${escapeHtml(t('envStatus.incidentMajor'))}</span><span class="env-status-legend-minor">${escapeHtml(t('envStatus.incidentMinor'))}</span><span class="env-status-legend-maintenance">${escapeHtml(t('envStatus.maintenance'))}</span></p></section>`;
}
function metricsHtml(values) {
  const points = array(values).map((item) => Number(item.value ?? item.metricValue)).filter(Number.isFinite);
  if (points.length < 2) return `<p class="env-status-metrics-empty">${escapeHtml(t('envStatus.noMetrics'))}</p>`;
  const min = Math.min(...points); const span = Math.max(1, Math.max(...points) - min);
  const line = points.map((value, index) => `${(index / (points.length - 1)) * 200},${60 - ((value - min) / span) * 55}`).join(' ');
  return `<section class="env-status-metrics"><h4>${escapeHtml(t('envStatus.metrics'))}</h4><svg viewBox="0 0 200 60" role="img" aria-label="${escapeHtml(t('envStatus.metrics'))}"><polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2"></polyline></svg></section>`;
}
function incidentCard(incident, labels, orgId) {
  const title = incident.title || incident.type || `${t('envStatus.incident')} ${incident.id}`;
  const duration = formatDuration(calculateIncidentDuration(incident.startTime, incident.endTime));
  return `<article class="env-status-event-card env-status-incident-card"><div><strong>${escapeHtml(title)}</strong><span class="env-status-state">${escapeHtml(incident.status || t('envStatus.unknown'))}</span></div><p>${escapeHtml(serviceNames(incident.serviceKeys, labels))}</p><p>${formatWithIso(incident.startTime)} · ${escapeHtml(duration)}</p><div class="env-status-card-actions"><button type="button" class="env-status-inline-btn" data-env-incident="${escapeHtml(incident.id)}" data-env-org="${escapeHtml(orgId)}" aria-haspopup="dialog">${escapeHtml(t('envStatus.viewDetail'))}</button><button type="button" class="env-status-inline-btn env-status-trust-btn" data-open-trust="${escapeHtml(buildTrustIncidentUrl(incident.id))}">${escapeHtml(t('envStatus.openTrust'))}</button></div></article>`;
}
function maintenanceCard(item, labels) {
  const duration = formatDuration(calculateIncidentDuration(item.plannedStartTime, item.plannedEndTime));
  return `<article class="env-status-event-card"><strong>${escapeHtml(item.name || `${t('envStatus.maintenance')} ${item.id}`)}</strong><span class="env-status-state">${escapeHtml(item.status || t('envStatus.scheduled'))}</span><p>${formatWithIso(item.plannedStartTime)} · ${escapeHtml(duration)}</p><p>${escapeHtml(t('envStatus.availability'))}: ${escapeHtml(String(item.availability || t('envStatus.notProvided')))} · ${escapeHtml(serviceNames(item.serviceKeys, labels))}</p><div class="env-status-card-actions"><button type="button" class="env-status-inline-btn env-status-trust-btn" data-open-trust="${escapeHtml(buildTrustMaintenanceUrl(item.id))}">${escapeHtml(t('envStatus.openTrust'))}</button></div></article>`;
}
function agendaHtml(items, labels, all = false) {
  const shown = all ? items : items.slice(0, 5);
  if (!shown.length) return `<p class="env-status-empty-inline">${escapeHtml(t('envStatus.noUpcomingMaintenances'))}</p>`;
  const groups = new Map();
  shown.forEach((item) => { const key = new Date(item.plannedStartTime).toLocaleDateString(lang() === 'en' ? 'en-GB' : 'es-ES'); groups.set(key, [...(groups.get(key) || []), item]); });
  return `<div class="env-status-agenda">${[...groups.entries()].map(([day, events]) => `<section><h5>${escapeHtml(day)}</h5>${events.map((item) => maintenanceCard(item, labels)).join('')}</section>`).join('')}</div>`;
}
function historyHtml(detail, labels, orgId) {
  const history = array(detail?.incidentHistory);
  if (!history.length) return `<p class="env-status-empty-inline">${escapeHtml(t('envStatus.noIncidentHistory'))}</p>`;
  const filter = historyFiltersByOrg.get(orgId) || {};
  const options = (values, selected) => `<option value="">${escapeHtml(t('envStatus.all'))}</option>${[...new Set(values.filter(Boolean))].map((value) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('')}`;
  const filtered = history.filter((incident) => (!filter.status || incident.status === filter.status) && (!filter.severity || incident.severity === filter.severity) && (!filter.core || String(!!incident.core) === filter.core) && (!filter.service || array(incident.serviceKeys).includes(filter.service)));
  return `<div class="env-status-history-filters"><label>${escapeHtml(t('envStatus.filterStatus'))}<select data-env-history-filter="${escapeHtml(orgId)}" data-filter-kind="status">${options(history.map((item) => item.status), filter.status)}</select></label><label>${escapeHtml(t('envStatus.filterSeverity'))}<select data-env-history-filter="${escapeHtml(orgId)}" data-filter-kind="severity">${options(history.map((item) => item.severity), filter.severity)}</select></label><label>${escapeHtml(t('envStatus.filterCore'))}<select data-env-history-filter="${escapeHtml(orgId)}" data-filter-kind="core">${options(['true', 'false'], filter.core)}</select></label><label>${escapeHtml(t('envStatus.filterService'))}<select data-env-history-filter="${escapeHtml(orgId)}" data-filter-kind="service">${options(history.flatMap((item) => array(item.serviceKeys)), filter.service)}</select></label></div><p><span class="env-status-neutral-chip">${escapeHtml(t('envStatus.historicalIncidents', { count: history.length }))}</span></p><div class="env-status-history-list">${filtered.length ? filtered.map((incident) => incidentCard(incident, labels, orgId)).join('') : `<p class="env-status-empty-inline">${escapeHtml(t('envStatus.emptyFilter'))}</p>`}</div>`;
}
function messagesHtml(messages) {
  if (!array(messages).length) return `<p class="env-status-empty-inline">${escapeHtml(t('envStatus.noMessages'))}</p>`;
  return array(messages).map((message) => `<article class="env-status-message"><strong>${escapeHtml(message.title || message.subject || message.id || t('envStatus.message'))}</strong><p>${escapeHtml(message.message || message.content || message.description || '')}</p><small>${formatWithIso(message.startTime || message.createdAt)}${message.endTime ? ` – ${formatWithIso(message.endTime)}` : ''}</small></article>`).join('');
}
function sectionError(errors) { return array(errors).length ? `<p class="env-status-section-error" role="alert">${escapeHtml(t('envStatus.partialError'))}: ${escapeHtml(array(errors).join(' · '))}</p>` : ''; }
function detailSection(label, content, extraClass = '') {
  return `<section class="env-status-detail-section ${extraClass}"><h3 class="env-status-detail-section-title">${escapeHtml(t(label))}</h3>${content}</section>`;
}
function detailHtml(row, trustDetail, sessionDetail, tab) {
  const orgId = String(row.orgId || row.saved?.id || ''); const labels = object(trustDetail?.serviceLabels || row.serviceLabels);
  const active = array(trustDetail?.activeIncidents || row.activeIncidents);
  const upcoming = array(trustDetail?.upcomingMaintenances || (row.nextMaintenance ? [row.nextMaintenance] : []));
  const sessionGrid = sessionDetail ? renderSessionDetailGridHtml(buildSessionDetailRows(sessionLabels(), sessionDetail)) : `<p class="env-status-empty-inline">${escapeHtml(t('envStatus.sessionUnavailable'))}</p>`;
  const tabs = [['summary', 'tabSummary'], ['current', 'tabCurrent'], ['maintenance', 'tabMaintenance'], ['history', 'tabHistory'], ['messages', 'tabMessages']];
  const content = {
    summary: `${detailSection('envStatus.sectionOrgInstance', instanceDetails(row, trustDetail), 'env-status-detail-section-primary')}${detailSection('envStatus.sessionDetailTitle', sessionGrid)}${detailSection('envStatus.services', `<p>${escapeHtml(serviceNames(object(trustDetail?.instance || row.instance).serviceKeys || object(trustDetail?.instance || row.instance).services, labels))}</p>`)}${detailSection('envStatus.sectionTrustActivity', `${timelineHtml(trustDetail, labels, orgId)}${metricsHtml(trustDetail?.metricValues)}`)}`,
    current: `${detailSection('envStatus.sectionCurrentHealth', `<p class="env-status-health ${healthClass((trustDetail?.trust || row.trust)?.status)}">${escapeHtml(statusLabel((trustDetail?.trust || row.trust)?.status))}</p>`, 'env-status-detail-section-primary')}${detailSection('envStatus.sectionActiveIncidents', active.length ? active.map((incident) => incidentCard(incident, labels, orgId)).join('') : `<p class="env-status-empty-inline">${escapeHtml(t('envStatus.noActiveIncidents'))}</p>`)}`,
    maintenance: `${array(trustDetail?.inProgressMaintenances).length ? detailSection('envStatus.maintenancesInProgress', array(trustDetail?.inProgressMaintenances).map((item) => maintenanceCard(item, labels)).join(''), 'env-status-detail-section-primary') : ''}${detailSection('envStatus.sectionUpcomingMaintenances', `${agendaHtml(upcoming, labels, !!row._showAllMaintenances)}${upcoming.length > 5 ? `<button type="button" class="env-status-inline-btn" data-env-all-maintenance="${escapeHtml(orgId)}">${escapeHtml(t('envStatus.viewAll'))}</button>` : ''}`)}`,
    history: `${detailSection('envStatus.sectionIncidentHistory', `<label>${escapeHtml(t('envStatus.period'))}<select data-env-history-days="${escapeHtml(orgId)}"><option value="30"${(historyDaysByOrg.get(orgId) || 30) === 30 ? ' selected' : ''}>30 ${escapeHtml(t('envStatus.days'))}</option><option value="90"${(historyDaysByOrg.get(orgId) || 30) === 90 ? ' selected' : ''}>90 ${escapeHtml(t('envStatus.days'))}</option></select></label>${historyHtml(trustDetail, labels, orgId)}`, 'env-status-detail-section-primary')}`,
    messages: detailSection('envStatus.sectionMessages', messagesHtml(trustDetail?.generalMessages || row.trust?.GeneralMessages), 'env-status-detail-section-primary')
  };
  return `<div class="env-status-detail-inner" id="env-detail-${escapeHtml(orgId)}"><div class="env-status-tabs" role="tablist" aria-label="${escapeHtml(t('envStatus.detailTabs'))}">${tabs.map(([key, label]) => `<button type="button" role="tab" aria-selected="${tab === key}" class="env-status-tab${tab === key ? ' is-active' : ''}" data-env-tab="${key}" data-env-org="${escapeHtml(orgId)}">${escapeHtml(t(`envStatus.${label}`))}</button>`).join('')}</div>${sectionError(trustDetail?.errors)}<div class="env-status-tabpanel" role="tabpanel">${content[tab] || content.summary}</div><div class="env-status-detail-actions"><button type="button" class="env-status-action-btn" data-open="${escapeHtml(row.saved?.instanceUrl || '')}">${escapeHtml(t('envStatus.openOrg'))}</button><button type="button" class="env-status-action-btn" data-open-trust="${escapeHtml(buildTrustPageUrl(row.instanceKey))}">${escapeHtml(t('envStatus.viewTrust'))}</button></div></div>`;
}
function sessionLabels() { return { userId: t('envStatus.detailUserId'), username: t('envStatus.detailUsername'), name: t('envStatus.detailName'), orgId: t('envStatus.colOrgId'), orgName: t('envStatus.detailOrgName'), orgType: t('envStatus.colType'), isSandbox: t('envStatus.detailSandbox'), namespace: t('envStatus.detailNamespace'), timezone: t('envStatus.detailTimezone'), locale: t('envStatus.detailLocale'), instanceName: t('envStatus.colInstance'), instanceUrl: t('envStatus.detailInstanceUrl'), savedApi: t('envStatus.detailSavedApi'), liveApi: t('envStatus.detailLiveApi'), restEndpoint: t('envStatus.detailRestEndpoint'), userInfoEndpoint: t('envStatus.detailUserInfoEndpoint'), yes: t('envStatus.yes'), no: t('envStatus.no') }; }
function createDetailRow(row) { const tr = document.createElement('tr'); const id = String(row.orgId || row.saved?.id || ''); tr.className = 'env-status-detail-row'; tr.dataset.detailFor = id; tr.innerHTML = `<td class="env-status-detail-cell" colspan="${COL_COUNT}">${detailHtml(row, trustDetailCache.get(id), sessionDetailCache.get(id), detailTabByOrg.get(id) || 'summary')}</td>`; return tr; }
function rowHtml(row, aliases, groups) {
  const saved = object(row.saved); const id = String(row.orgId || saved.id || ''); const trust = object(row.trust); const health = deriveTrustHealth(trust.status); const active = Number(row.activeIncidentCount || 0);
  const isExpanded = expandedOrgIds.has(id); const type = sandbox(row) ? 'sandbox' : 'prod'; const release = row.instance?.releaseVersion || trust.releaseVersion || '—';
  const tr = document.createElement('tr'); tr.dataset.orgId = id; if (rowAlert(row)) tr.classList.add('env-status-row-alert');
  tr.innerHTML = `<td><div class="env-status-env-cell"><button type="button" class="env-status-expand-btn${isExpanded ? ' env-status-expand-open' : ''}" data-env-expand="${escapeHtml(id)}" aria-expanded="${isExpanded}" aria-controls="env-detail-${escapeHtml(id)}" aria-label="${escapeHtml(t('envStatus.expandDetail'))}"><span class="env-status-expand-chevron" aria-hidden="true"></span><span>${escapeHtml(t('envStatus.detail'))}</span></button><div>${escapeHtml(envLabel(row, aliases, groups))}<div class="env-status-sub">${escapeHtml(host(saved.instanceUrl))}</div></div></div></td><td><span class="env-status-badge env-status-badge-${type}">${escapeHtml(t(type === 'sandbox' ? 'envStatus.badgeSandbox' : 'envStatus.badgeProd'))}</span></td><td>${row.instanceKey ? `<a class="env-status-link" target="_blank" rel="noopener noreferrer" href="${escapeHtml(buildTrustPageUrl(row.instanceKey))}">${escapeHtml(row.instanceKey)}</a><div class="env-status-sub">${escapeHtml(String(release))}</div>` : '—'}</td><td><span class="env-status-health ${healthClass(trust.status)}">${escapeHtml(statusLabel(trust.status))}</span></td><td>${active ? `<span class="env-status-incident-chip">${escapeHtml(t('envStatus.activeIncidents', { count: active }))}</span>` : `<span class="env-status-neutral-chip">${escapeHtml(t('envStatus.zeroActive'))}</span>`}</td><td>${row.nextMaintenance ? formatWithIso(row.nextMaintenance.plannedStartTime) : '—'}</td><td><span class="env-status-auth ${row.auth === 'active' ? 'env-status-auth-active' : 'env-status-auth-expired'}">${escapeHtml(t(row.auth === 'active' ? 'envStatus.sessionActive' : 'envStatus.sessionExpired'))}</span></td><td><button type="button" class="env-status-action-btn" data-env-expand="${escapeHtml(id)}" aria-expanded="${isExpanded}" aria-controls="env-detail-${escapeHtml(id)}">${escapeHtml(t('envStatus.detail'))}</button></td>`;
  return tr;
}
async function renderTable() {
  const tbody = document.getElementById('environmentStatusTbody'); const empty = document.getElementById('environmentStatusEmpty'); const updated = document.getElementById('environmentStatusUpdated'); if (!tbody) return;
  const extras = await chrome.storage.sync.get(['orgAliases', 'orgGroups']); const aliases = extras.orgAliases || {}; const groups = extras.orgGroups || {}; const rows = lastRows.filter(filterRow);
  if (updated && lastFetchedAt) updated.textContent = t('envStatus.lastUpdated', { when: date(lastFetchedAt) }); renderSummary(lastRows); tbody.innerHTML = '';
  if (!rows.length) { if (empty) { empty.hidden = false; empty.textContent = lastRows.length ? t('envStatus.emptyFilter') : t('envStatus.emptyNoOrgs'); } return; } if (empty) empty.hidden = true;
  rows.forEach((row) => { const main = rowHtml(row, aliases, groups); tbody.append(main); if (expandedOrgIds.has(String(row.orgId || row.saved?.id || ''))) tbody.append(createDetailRow(row)); });
  wire(tbody);
}
async function loadDetail(orgId, force = false) {
  const row = lastRows.find((item) => String(item.orgId || item.saved?.id || '') === orgId); if (!row) return;
  const generation = renderGeneration; const days = historyDaysByOrg.get(orgId) || 30;
  const tasks = [bg({ type: 'environmentStatus:getTrustDetail', orgId, options: { days, locale: lang() } })];
  if (row.auth === 'active' && !sessionDetailCache.has(orgId)) tasks.push(bg({ type: 'environmentStatus:getSessionDetail', orgId }));
  const results = await Promise.allSettled(tasks);
  if (generation !== renderGeneration || !expandedOrgIds.has(orgId)) return;
  const trust = results[0].status === 'fulfilled' ? results[0].value : null;
  if (trust?.ok) trustDetailCache.set(orgId, trust); else if (force) showToast(trust?.error || t('envStatus.trustDetailError'), 'error');
  const session = results[1]; if (session?.status === 'fulfilled' && session.value?.ok) sessionDetailCache.set(orgId, session.value.detail);
  await renderTable();
}
async function toggle(orgId) { expandedOrgIds = toggleExpandedOrg(orgId, expandedOrgIds); await renderTable(); if (expandedOrgIds.has(orgId)) void loadDetail(orgId); }
function wire(root) {
  root.querySelectorAll('[data-env-expand]').forEach((button) => button.addEventListener('click', () => void toggle(button.getAttribute('data-env-expand') || '')));
  root.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => { const url = button.getAttribute('data-open'); if (url) void chrome.tabs.create({ url }); }));
  root.querySelectorAll('[data-open-trust]').forEach((button) => button.addEventListener('click', () => { const url = button.getAttribute('data-open-trust'); if (url) void chrome.tabs.create({ url }); }));
  root.querySelectorAll('[data-env-tab]').forEach((button) => button.addEventListener('click', () => { detailTabByOrg.set(button.dataset.envOrg, button.dataset.envTab); void renderTable(); }));
  root.querySelectorAll('[data-env-history-days]').forEach((select) => select.addEventListener('change', () => { const id = select.dataset.envHistoryDays; historyDaysByOrg.set(id, Number(select.value)); trustDetailCache.delete(id); void loadDetail(id, true); }));
  root.querySelectorAll('[data-env-history-filter]').forEach((select) => select.addEventListener('change', () => { const id = select.dataset.envHistoryFilter; historyFiltersByOrg.set(id, { ...(historyFiltersByOrg.get(id) || {}), [select.dataset.filterKind]: select.value }); void renderTable(); }));
  root.querySelectorAll('[data-env-all-maintenance]').forEach((button) => button.addEventListener('click', () => { const row = lastRows.find((item) => String(item.orgId || item.saved?.id || '') === button.dataset.envAllMaintenance); if (row) { row._showAllMaintenances = true; void renderTable(); } }));
  root.querySelectorAll('[data-env-incident]').forEach((button) => button.addEventListener('click', async () => { const res = await bg({ type: 'environmentStatus:getIncidentDetail', orgId: button.dataset.envOrg, incidentId: button.dataset.envIncident, locale: lang() }); if (res?.ok) showIncidentDetail(button, res.incident); else showToast(res?.error || t('envStatus.trustDetailError'), 'error'); }));
  root.querySelectorAll('[data-env-timeline-kind]').forEach((button) => wireTimelineItem(button));
}
function closeTrustDialog() {
  document.getElementById('envStatusTrustDialog')?.remove(); document.body.classList.remove('env-status-dialog-open');
  trustDialogRestoreFocus?.focus?.(); trustDialogRestoreFocus = null;
}
function openTrustDialog(trigger, title, content) {
  closeTrustDialog(); trustDialogRestoreFocus = trigger;
  const dialog = document.createElement('div'); dialog.id = 'envStatusTrustDialog'; dialog.className = 'env-status-trust-dialog';
  dialog.innerHTML = `<div class="env-status-trust-dialog-backdrop" data-env-dialog-close></div><section class="env-status-trust-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="envStatusTrustDialogTitle"><header><h2 id="envStatusTrustDialogTitle">${escapeHtml(title)}</h2><button type="button" class="env-status-dialog-close" data-env-dialog-close aria-label="${escapeHtml(t('common.close'))}">×</button></header><div class="env-status-trust-dialog-content">${content}</div></section>`;
  document.body.append(dialog);
  const close = () => closeTrustDialog(); const panel = dialog.querySelector('.env-status-trust-dialog-panel');
  dialog.querySelectorAll('[data-env-dialog-close]').forEach((button) => button.addEventListener('click', close));
  dialog.querySelectorAll('[data-open-trust]').forEach((button) => button.addEventListener('click', () => { const url = button.getAttribute('data-open-trust'); if (url) void chrome.tabs.create({ url }); }));
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]), [href], select, [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  panel.querySelector('.env-status-dialog-close')?.focus();
}
function timelineEntriesHtml(entries) {
  const lines = array(entries).map((event) => `<li><time title="${escapeHtml(String(event.createdAt || event.startTime || ''))}">${formatWithIso(event.createdAt || event.startTime)}</time><span>${escapeHtml(event.message || event.description || event.type || '')}</span></li>`).join('');
  return lines ? `<ol class="env-status-event-timeline">${lines}</ol>` : `<p class="env-status-empty-inline">${escapeHtml(t('envStatus.none'))}</p>`;
}
function showIncidentDetail(button, raw) {
  const incident = object(raw); const events = array(incident.IncidentEvents || incident.incidentEvents); const impacts = array(incident.IncidentImpacts || incident.incidentImpacts); const id = String(incident.id || incident.Id || '');
  const firstImpact = object(impacts[0]); const start = incident.startTime || incident.createdAt || firstImpact.startTime; const end = incident.endTime || incident.resolvedAt || firstImpact.endTime;
  const title = incident.title || incident.type || `${t('envStatus.incident')} ${id}`;
  const facts = renderSessionDetailGridHtml([
    { label: t('envStatus.status'), value: incident.status || t('envStatus.unknown') }, { label: t('envStatus.severity'), value: incident.severity || firstImpact.severity || t('envStatus.unknown') },
    { label: t('envStatus.coreNonCore'), value: String(incident.isCore === true || /_CORE$/.test(String(incident.status || ''))) }, { label: t('envStatus.services'), value: array(incident.serviceKeys || firstImpact.serviceKeys).join(', ') || t('envStatus.none') },
    { label: t('envStatus.startedAt'), value: date(start) }, { label: t('envStatus.finishedAt'), value: date(end) }, { label: t('envStatus.duration'), value: formatDuration(calculateIncidentDuration(start, end)) }
  ]);
  const content = `${facts}${incident.additionalInformation || incident.lastMessage ? `<section class="env-status-dialog-section"><h3>${escapeHtml(t('envStatus.lastMessage'))}</h3><p>${escapeHtml(incident.additionalInformation || incident.lastMessage)}</p></section>` : ''}${incident.rootCause ? `<section class="env-status-dialog-section"><h3>${escapeHtml(t('envStatus.rootCause'))}</h3><p>${escapeHtml(incident.rootCause)}</p></section>` : ''}${incident.actionPlan || incident.pathToResolution ? `<section class="env-status-dialog-section"><h3>${escapeHtml(t('envStatus.actionPlan'))}</h3><p>${escapeHtml(incident.actionPlan || incident.pathToResolution)}</p></section>` : ''}<section class="env-status-dialog-section"><h3>${escapeHtml(t('envStatus.timeline'))}</h3>${timelineEntriesHtml([...events, ...impacts])}</section><div class="env-status-dialog-actions"><button type="button" class="env-status-action-btn" data-open-trust="${escapeHtml(buildTrustIncidentUrl(id))}">${escapeHtml(t('envStatus.openTrust'))}</button></div>`;
  openTrustDialog(button, `${title} · ${id}`, content);
}
function showMaintenanceDetail(button, raw) {
  const maintenance = object(raw); const id = String(maintenance.id || maintenance.Id || ''); const start = maintenance.plannedStartTime || maintenance.startTime; const end = maintenance.plannedEndTime || maintenance.endTime;
  const facts = renderSessionDetailGridHtml([
    { label: t('envStatus.status'), value: maintenance.status || t('envStatus.unknown') }, { label: t('envStatus.services'), value: array(maintenance.serviceKeys || maintenance.ServiceKeys).join(', ') || t('envStatus.none') },
    { label: t('envStatus.startedAt'), value: date(start) }, { label: t('envStatus.finishedAt'), value: date(end) }, { label: t('envStatus.duration'), value: formatDuration(calculateIncidentDuration(start, end)) },
    { label: t('envStatus.availability'), value: String(maintenance.availability || maintenance.expectedAvailability || t('envStatus.notProvided')) }
  ]);
  const content = `${facts}${maintenance.description || maintenance.additionalInformation ? `<section class="env-status-dialog-section"><h3>${escapeHtml(t('envStatus.details'))}</h3><p>${escapeHtml(maintenance.description || maintenance.additionalInformation)}</p></section>` : ''}<div class="env-status-dialog-actions"><button type="button" class="env-status-action-btn" data-open-trust="${escapeHtml(buildTrustMaintenanceUrl(id))}">${escapeHtml(t('envStatus.openTrust'))}</button></div>`;
  openTrustDialog(button, `${maintenance.name || t('envStatus.maintenance')} · ${id}`, content);
}
function getTimelinePopover() {
  let popover = document.getElementById('envStatusTimelinePopover');
  if (popover) return popover;
  popover = document.createElement('div'); popover.id = 'envStatusTimelinePopover'; popover.className = 'env-status-timeline-popover'; popover.hidden = true; popover.setAttribute('role', 'tooltip');
  popover.addEventListener('pointerleave', () => { popover.hidden = true; }); document.body.append(popover);
  return popover;
}
function showTimelinePopover(button) {
  const popover = getTimelinePopover(); const { envTimelineKind: kind, envTimelineTitle: title, envTimelineStatus: status, envTimelineSeverity: severity, envTimelineServices: services, envTimelineStart: start, envTimelineEnd: end } = button.dataset;
  const duration = formatDuration(calculateIncidentDuration(start, end));
  popover.innerHTML = `<strong>${escapeHtml(title || (kind === 'maintenance' ? t('envStatus.maintenance') : t('envStatus.incident')))}</strong><p>${escapeHtml(status || t('envStatus.unknown'))}${severity ? ` · ${escapeHtml(severity)}` : ''}</p><p>${formatWithIso(start)} – ${formatWithIso(end)} · ${escapeHtml(duration)}</p><p>${escapeHtml(services || t('envStatus.none'))}</p><button type="button" class="env-status-inline-btn" data-env-popover-detail>${escapeHtml(t('envStatus.viewDetail'))}</button>`;
  popover.querySelector('[data-env-popover-detail]')?.addEventListener('click', () => void openTimelineEvent(button));
  popover.hidden = false; const rect = button.getBoundingClientRect(); const width = Math.min(360, window.innerWidth - 16); const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  popover.style.width = `${width}px`; popover.style.left = `${left}px`; popover.style.top = `${Math.max(8, rect.top - popover.offsetHeight - 8)}px`; button.setAttribute('aria-describedby', popover.id);
}
function hideTimelinePopover(button) {
  const popover = document.getElementById('envStatusTimelinePopover'); if (!popover) return;
  if (button && popover.contains(document.activeElement)) return;
  popover.hidden = true; button?.removeAttribute('aria-describedby');
}
async function openTimelineEvent(button) {
  hideTimelinePopover(button); const id = button.dataset.envTimelineId; const orgId = button.dataset.envOrg;
  if (!id || !orgId) return;
  const type = button.dataset.envTimelineKind === 'maintenance' ? 'Maintenance' : 'Incident';
  const res = await bg({ type: `environmentStatus:get${type}Detail`, orgId, [`${type.toLowerCase()}Id`]: id, locale: lang() });
  if (!res?.ok) { showToast(res?.error || t('envStatus.trustDetailError'), 'error'); return; }
  if (type === 'Incident') showIncidentDetail(button, res.incident); else showMaintenanceDetail(button, res.maintenance);
}
function wireTimelineItem(button) {
  button.addEventListener('pointerenter', () => showTimelinePopover(button)); button.addEventListener('focus', () => showTimelinePopover(button));
  button.addEventListener('pointerleave', (event) => { const popover = document.getElementById('envStatusTimelinePopover'); if (!popover?.contains(event.relatedTarget)) hideTimelinePopover(button); });
  button.addEventListener('blur', () => hideTimelinePopover(button)); button.addEventListener('click', () => void openTimelineEvent(button));
}
async function runLoad() {
  if (getSelectedArtifactType() !== 'EnvironmentStatus') return; const status = document.getElementById('environmentStatusStatus'); const generation = ++renderGeneration; showToastWithSpinner(t('envStatus.loading')); if (status) status.textContent = t('envStatus.loading');
  try { const res = await bg({ type: 'environmentStatus:getAll', locale: lang(), force: true }); if (!res?.ok) throw new Error(res?.error || 'Fetch failed'); if (generation !== renderGeneration) return; lastRows = array(res.rows); lastFetchedAt = String(res.fetchedAt || new Date().toISOString()); await renderTable(); if (status) status.textContent = ''; }
  catch (error) { void handleToolError(error, { artifact_type: 'EnvironmentStatus', phase: 'fetch' }); if (status) status.textContent = t('envStatus.fetchError'); showToast(String(error?.message || error), 'error'); }
  finally { dismissSpinnerToast(); }
}
export async function refreshEnvironmentStatusPanel() { if (getSelectedArtifactType() === 'EnvironmentStatus' && !lastRows.length) void runLoad(); }
export function setupEnvironmentStatusPanel() { document.getElementById('environmentStatusRefreshBtn')?.addEventListener('click', () => void runLoad()); document.querySelectorAll('[data-env-status-filter]').forEach((button) => button.addEventListener('click', () => { activeFilter = button.getAttribute('data-env-status-filter') || 'all'; syncFilters(); void renderTable(); })); syncFilters(); }
export async function reloadEnvironmentStatusIfActive() { if (getSelectedArtifactType() === 'EnvironmentStatus') void runLoad(); }
