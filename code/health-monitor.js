import '../shared/installEarlyExceptionCapture.js';
import { loadLang, getCurrentLang } from '../shared/i18n.js';
import { loadExtensionSettings, applyUiThemeToDocument } from '../shared/extensionSettings.js';

const COPY = {
  es: {
    title: 'Análisis de entorno', back: 'Volver', rerun: 'Reejecutar análisis', loadingOrg: 'Cargando entorno…', all: 'Todas las áreas',
    startKicker: 'Diagnóstico bajo demanda', startTitle: 'Revisa el estado real de tu entorno', startText: 'Lanza una revisión estructurada de capacidad, configuración, automatización y seguridad. La información se consulta directamente en Salesforce y no modifica ningún registro.',
    startAction: 'Ejecutar diagnóstico', startNote: 'No se ejecutará ninguna llamada hasta confirmar esta acción.', readOnly: 'Solo lectura', readOnlyDetail: 'Sin cambios en la organización', live: 'Datos actuales', liveDetail: 'Sin caché ni resultados de ayer', selective: 'Control granular', selectiveDetail: 'Cada área se puede repetir por separado',
    scopeTitle: 'Áreas incluidas', scopeText: 'La ejecución consulta solo las áreas disponibles para tu edición y permisos. Las consultas que Salesforce no permita se indicarán sin detener el resto del diagnóstico.',
    infrastructure: 'Infraestructura', security: 'Seguridad', operations: 'Operaciones', quality: 'Calidad de código', licensing: 'Licencias', automation: 'Automatización', metadata: 'Metadatos',
    instance: 'Estado de instancia', limits: 'Límites y almacenamiento', healthCheck: 'Security Health Check', async: 'Trabajos asíncronos', scheduled: 'Apex programado', tests: 'Cobertura Apex', apiVersions: 'Versiones API', licenses: 'Uso de licencias', packages: 'Paquetes instalados', automations: 'Automatizaciones', objects: 'Objetos y límites', sharing: 'Configuración de compartición', audit: 'Setup Audit Trail', signals: 'Señales de seguridad', hygiene: 'Higiene de la organización',
    monitor: 'Health Monitor', analysing: 'Analizando {done} de {total} áreas…', complete: 'Diagnóstico completado: {done} áreas consultadas.', score: 'Índice de salud', filter: 'Filtrar áreas', filterRisks: 'Filtrar riesgos, ajustes o valores…', moreRows: '{count} más en la tabla', showAllRows: 'Ver {count} restantes', showFewerRows: 'Mostrar menos', showSummary: 'Abrir resumen', hideSummary: 'Cerrar resumen', pending: 'Pendiente de ejecución.', querying: 'Consultando…', retry: 'Repetir', noData: 'No hay datos que mostrar.', noSession: 'No hay una sesión Salesforce activa para este entorno.', requestFailed: 'La consulta no se ha podido completar.', noOrg: 'No se ha indicado un entorno para analizar.', contextFailed: 'No se ha podido obtener el entorno.', summary: 'Resumen ejecutivo', actionItems: 'señales para revisar', unavailable: 'áreas con acceso limitado', criticalLimits: 'límites críticos', coverage: 'cobertura Apex', recentFailures: 'fallos asíncronos (7 días)', scheduledErrors: 'jobs programados con error', recommendation: 'Prioridades', summaryClean: 'No hay señales críticas en las áreas ya consultadas.', summaryIncomplete: 'El resumen se completará al finalizar las consultas.'
  },
  en: {
    title: 'Environment analysis', back: 'Back', rerun: 'Run analysis again', loadingOrg: 'Loading environment…', all: 'All areas',
    startKicker: 'On-demand diagnostic', startTitle: 'Review your environment as it is now', startText: 'Run a structured review of capacity, configuration, automation, and security. Information is read directly from Salesforce and no record is changed.',
    startAction: 'Run diagnostic', startNote: 'No call is made until you confirm this action.', readOnly: 'Read only', readOnlyDetail: 'No change is made to the organization', live: 'Current data', liveDetail: 'No cache or yesterday’s result', selective: 'Granular control', selectiveDetail: 'Each area can be rerun independently',
    scopeTitle: 'Included areas', scopeText: 'The run only reads areas available to your edition and permissions. Queries Salesforce does not allow are reported without stopping the rest of the diagnostic.',
    infrastructure: 'Infrastructure', security: 'Security', operations: 'Operations', quality: 'Code quality', licensing: 'Licensing', automation: 'Automation', metadata: 'Metadata',
    instance: 'Instance status', limits: 'Limits and storage', healthCheck: 'Security Health Check', async: 'Async jobs', scheduled: 'Scheduled Apex', tests: 'Apex coverage', apiVersions: 'API versions', licenses: 'License usage', packages: 'Installed packages', automations: 'Automations', objects: 'Objects and limits', sharing: 'Sharing settings', audit: 'Setup Audit Trail', signals: 'Security signals', hygiene: 'Organization hygiene',
    monitor: 'Health Monitor', analysing: 'Analysing {done} of {total} areas…', complete: 'Analysis complete: {done} areas queried.', score: 'Health score', filter: 'Filter areas', filterRisks: 'Filter risks, settings, or values…', moreRows: '{count} more in the table', showAllRows: 'Show {count} remaining', showFewerRows: 'Show fewer', showSummary: 'Open summary', hideSummary: 'Close summary', pending: 'Waiting to run.', querying: 'Querying…', retry: 'Run again', noData: 'There is no data to show.', noSession: 'There is no active Salesforce session for this environment.', requestFailed: 'The query could not be completed.', noOrg: 'No environment was provided for analysis.', contextFailed: 'The environment could not be loaded.', summary: 'Executive summary', actionItems: 'signals to review', unavailable: 'areas with limited access', criticalLimits: 'critical limits', coverage: 'Apex coverage', recentFailures: 'async failures (7 days)', scheduledErrors: 'scheduled jobs with errors', recommendation: 'Priorities', summaryClean: 'There are no critical signals in the areas queried so far.', summaryIncomplete: 'The summary will complete once the queries finish.'
  }
};
let locale = 'es';
function tr(key, values = {}) { return (COPY[locale]?.[key] || COPY.es[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? '')); }
const SECTIONS = [
  ['overview','infrastructure','instance'], ['limits','infrastructure','limits'], ['securityHealth','security','healthCheck'], ['async','operations','async'], ['scheduled','operations','scheduled'], ['tests','quality','tests'], ['apiVersions','quality','apiVersions'], ['licenses','licensing','licenses'], ['packages','licensing','packages'], ['automation','automation','automations'], ['objects','metadata','objects'], ['sharing','metadata','sharing'], ['audit','operations','audit'], ['security','security','signals'], ['hygiene','metadata','hygiene']
].map(([id, group, title]) => ({ id, group, title }));
const state = { orgId:new URLSearchParams(location.search).get('orgId') || '', org:null, results:new Map(), running:false, completed:0, filter:'all', securityFilter:'', summaryExpanded:false, expandedCharts:new Set() };
const root = document.getElementById('healthMonitorRoot');
const $ = (selector) => document.querySelector(selector);
function esc(value) { return String(value ?? '—').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }
function message(payload) { return new Promise((resolve) => chrome.runtime.sendMessage(payload, (response) => resolve(response || { ok:false, error:chrome.runtime.lastError?.message || tr('requestFailed') }))); }
function groupLabel(group) { return tr(group); }
function sectionLabel(section) { return tr(section.title); }
function uniqueGroups() { return ['all', ...new Set(SECTIONS.map((section) => section.group))]; }
function host(url) { try { return new URL(url).hostname; } catch { return url || '—'; } }
function sectionIcon(group) { const paths = { infrastructure:'<path d="M4 20h16M6 20V9l6-5 6 5v11M9 20v-5h6v5"/>', security:'<path d="M12 3l7 3v5c0 4.4-2.8 7.8-7 10-4.2-2.2-7-5.6-7-10V6l7-3z"/><path d="M9.5 12l1.7 1.7 3.5-3.5"/>', operations:'<path d="M4 12h4l2-6 4 12 2-6h4"/>', quality:'<path d="M7 3h8l3 3v15H7z"/><path d="M15 3v4h4M10 12h4M10 16h4"/>', licensing:'<path d="M4 7h16v10H4z"/><path d="M4 10h16M8 15h3"/>', automation:'<path d="M12 3v5M12 16v5M4.2 7.5l4.3 2.5M15.5 14l4.3 2.5M4.2 16.5l4.3-2.5M15.5 10l4.3-2.5"/><circle cx="12" cy="12" r="4"/>', metadata:'<path d="M4 6h16v12H4z"/><path d="M4 10h16M9 6v12"/>' }; return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[group] || paths.infrastructure}</svg>`; }
function gaugeHtml(value, label) { const safe = Math.max(0, Math.min(100, Number(value) || 0)); const circumference = 276.46; const tone = safe >= 80 ? 'var(--hm-good)' : safe >= 55 ? 'var(--hm-warn)' : 'var(--hm-bad)'; return `<svg class="hm-gauge" viewBox="0 0 112 112" role="img" aria-label="${esc(label)} ${safe}%"><circle cx="56" cy="56" r="44" fill="none" stroke="var(--hm-border)" stroke-width="9"/><circle cx="56" cy="56" r="44" fill="none" stroke="${tone}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(circumference * safe / 100).toFixed(1)} ${circumference}" transform="rotate(-90 56 56)"/><text x="56" y="53" text-anchor="middle" fill="var(--hm-text)" font-size="23" font-weight="700">${safe}%</text><text x="56" y="69" text-anchor="middle" fill="var(--hm-muted)" font-size="7" letter-spacing=".8">${esc(label).toUpperCase()}</text></svg>`; }
function startHtml() { return `<section class="hm-briefing"><div class="hm-briefing-main"><p class="hm-kicker">${esc(tr('startKicker'))}</p><h1>${esc(tr('startTitle'))}</h1><p class="hm-intro">${esc(tr('startText'))}</p><div class="hm-briefing-actions"><button class="hm-start" id="hmStart">▶ ${esc(tr('startAction'))}</button><span>${esc(tr('startNote'))}</span></div><p class="hm-org-note">▦ ${esc(host(state.org?.instanceUrl))} · API v${esc(state.org?.apiVersion || '63.0')}</p></div><aside class="hm-assurances"><div><b>◌ ${esc(tr('readOnly'))}</b><span>${esc(tr('readOnlyDetail'))}</span></div><div><b>◷ ${esc(tr('live'))}</b><span>${esc(tr('liveDetail'))}</span></div><div><b>↻ ${esc(tr('selective'))}</b><span>${esc(tr('selectiveDetail'))}</span></div></aside><section class="hm-scope"><h2>${esc(tr('scopeTitle'))}</h2><p>${esc(tr('scopeText'))}</p><div class="hm-scope-grid">${uniqueGroups().slice(1).map((group) => `<span>${esc(groupLabel(group))}</span>`).join('')}</div></section></section>`; }
function score() { const limits = state.results.get('limits'); const tests = state.results.get('tests'); const critical = Number(String(limits?.metrics?.find((m) => /Críticos|Critical/.test(m.label))?.value || 0).match(/\d+/)?.[0] || 0); const coverage = Number(String(tests?.metrics?.find((m) => /Cobertura global|Overall coverage/.test(m.label))?.value || '100').match(/\d+/)?.[0] || 100); return Math.max(0, Math.min(100, Math.round((coverage + Math.max(0, 100 - critical * 12)) / 2))); }
function chartHtml(chart, sectionId) { if (!chart?.values?.length) return ''; const expanded = state.expandedCharts.has(sectionId); const items = expanded ? chart.values : chart.values.slice(0, 12); const max = chart.suffix === '%' ? 100 : Math.max(...items.map(Number), 1); const rowH = 29; const width = 760; const labelX = 245; const barW = 415; const height = Math.max(58, items.length * rowH + 16); const rows = items.map((value, index) => { const numeric = Number(value) || 0; const y = 9 + index * rowH; const bar = Math.max(2, Math.min(barW, Math.round(numeric / max * barW))); const color = chart.suffix === '%' && numeric >= 90 ? 'var(--hm-bad)' : chart.suffix === '%' && numeric >= 75 ? 'var(--hm-warn)' : 'var(--hm-accent)'; return `<g><text x="0" y="${y + 15}" fill="var(--hm-text)" font-size="12">${esc(String(chart.labels?.[index] || '—').slice(0, 34))}</text><rect x="${labelX}" y="${y + 3}" width="${barW}" height="14" rx="4" fill="var(--hm-panel-2)"/><rect x="${labelX}" y="${y + 3}" width="${bar}" height="14" rx="4" fill="${color}"/><text x="${width}" y="${y + 15}" fill="var(--hm-muted)" text-anchor="end" font-size="12">${esc(value)}${esc(chart.suffix || '')}</text></g>`; }).join(''); const more = chart.values.length > 12 ? `<button type="button" class="hm-chart-expand" data-chart-expand="${esc(sectionId)}">${esc(expanded ? tr('showFewerRows') : tr('showAllRows', { count:chart.values.length - 12 }))}</button>` : ''; return `<div class="hm-chart"><svg viewBox="0 0 ${width} ${height}" role="img">${rows}</svg>${more}</div>`; }
function metricValue(sectionId, labelPattern) { const metrics = state.results.get(sectionId)?.metrics || []; const metric = metrics.find((item) => labelPattern.test(String(item.label))); return Number(String(metric?.value ?? 0).match(/\d+/)?.[0] || 0); }
function executiveSummaryHtml() { const critical = metricValue('limits', /Críticos|Critical/); const coverage = metricValue('tests', /Cobertura global|Overall coverage/); const asyncFailures = metricValue('async', /Fallidos|Failed/); const scheduledErrors = metricValue('scheduled', /Con error|With errors/); const unavailable = [...state.results.values()].filter((result) => result.note && /not supported|no disponible|not available|insufficient|permission/i.test(result.note)).length; const findings = []; if (critical) findings.push(`${critical} ${tr('criticalLimits')}`); if (coverage && coverage < 75) findings.push(`${coverage}% ${tr('coverage')}`); if (asyncFailures) findings.push(`${asyncFailures} ${tr('recentFailures')}`); if (scheduledErrors) findings.push(`${scheduledErrors} ${tr('scheduledErrors')}`); const priority = critical ? 'limits' : coverage && coverage < 75 ? 'tests' : asyncFailures ? 'async' : scheduledErrors ? 'scheduled' : 'overview'; const status = findings.length ? findings.join(' · ') : (state.running ? tr('summaryIncomplete') : tr('summaryClean')); const expanded = state.summaryExpanded; return `<section class="hm-exec-summary${expanded ? ' is-expanded' : ''}"><button type="button" class="hm-summary-toggle" data-summary-toggle aria-expanded="${expanded}"><span class="hm-summary-title"><span>${sectionIcon('operations')}</span><span><b>${esc(tr('summary'))}</b><small>${esc(status)}</small></span></span><span class="hm-summary-toggle-label">${esc(expanded ? tr('hideSummary') : tr('showSummary'))} ${expanded ? '⌃' : '⌄'}</span></button>${expanded ? `<div class="hm-summary-metrics"><button type="button" data-summary-target="${priority}" class="hm-summary-metric ${findings.length ? 'bad' : 'good'}"><b>${findings.length}</b><span>${esc(tr('actionItems'))}</span></button><button type="button" data-summary-target="securityHealth" class="hm-summary-metric ${unavailable ? 'warn' : 'good'}"><b>${unavailable}</b><span>${esc(tr('unavailable'))}</span></button><button type="button" data-summary-target="limits" class="hm-summary-metric ${critical ? 'bad' : 'good'}"><b>${critical}</b><span>${esc(tr('criticalLimits'))}</span></button><button type="button" data-summary-target="tests" class="hm-summary-metric ${coverage && coverage < 75 ? 'bad' : 'good'}"><b>${coverage || '—'}${coverage ? '%' : ''}</b><span>${esc(tr('coverage'))}</span></button></div>` : ''}</section>`; }
function sectionHtml(def) { const head = `<span class="hm-section-icon hm-section-icon-${esc(def.group)}">${sectionIcon(def.group)}</span><div><div class="hm-section-group">${esc(groupLabel(def.group))}</div><h2>${esc(sectionLabel(def))}</h2></div>`; const result = state.results.get(def.id); if (!result) return `<article class="hm-section loading" data-health-section="${esc(def.id)}"><header class="hm-section-head">${head}</header><div class="hm-section-body">${state.running ? esc(tr('querying')) : esc(tr('pending'))}</div></article>`; const metrics = (result.metrics || []).map((metric) => `<div class="hm-metric ${esc(metric.tone || '')}"><strong>${esc(metric.value)}</strong><span>${esc(metric.label)}</span></div>`).join(''); const allRows = result.rows || []; const needle = def.id === 'securityHealth' ? state.securityFilter.trim().toLowerCase() : ''; const rows = needle ? allRows.filter((row) => row.join(' ').toLowerCase().includes(needle)) : allRows; const filter = def.id === 'securityHealth' ? `<label class="hm-table-filter"><span>⌕</span><input type="search" data-security-filter value="${esc(state.securityFilter)}" placeholder="${esc(tr('filterRisks'))}" /></label>` : ''; const table = result.columns?.length ? `${filter}<div class="hm-table-wrap"><table class="hm-table"><thead><tr>${result.columns.map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((value) => `<td>${esc(value)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${result.columns.length}" class="hm-empty">${esc(tr('noData'))}</td></tr>`}</tbody></table></div>` : ''; return `<article class="hm-section" data-health-section="${esc(def.id)}"><header class="hm-section-head">${head}<button class="hm-retry" data-retry="${esc(def.id)}" title="${esc(tr('retry'))}">↻</button></header><div class="hm-section-body">${metrics ? `<div class="hm-metrics">${metrics}</div>` : ''}${chartHtml(result.chart, def.id)}${table}${result.note ? `<p class="hm-note">${esc(result.note)}</p>` : ''}</div></article>`; }
function dashboardHtml() { const visible = SECTIONS.filter((section) => state.filter === 'all' || section.group === state.filter); const progress = Math.round(state.completed / SECTIONS.length * 100); return `<section>${executiveSummaryHtml()}<header class="hm-dashboard-head"><div><p class="hm-kicker">${esc(tr('startKicker'))}</p><h1>${esc(tr('monitor'))}</h1><p class="hm-progress-copy">${state.running ? esc(tr('analysing', { done:state.completed, total:SECTIONS.length })) : esc(tr('complete', { done:state.completed }))}</p></div><div class="hm-score">${gaugeHtml(score(), tr('score'))}</div></header><div class="hm-progress"><i style="width:${progress}%"></i></div><div class="hm-dashboard-layout"><nav class="hm-side-nav" aria-label="${esc(tr('filter'))}"><span>${esc(tr('filter'))}</span>${uniqueGroups().map((group) => `<button type="button" class="hm-filter${state.filter === group ? ' is-active' : ''}" data-filter="${esc(group)}"><i>${group === 'all' ? '◫' : '○'}</i>${esc(group === 'all' ? tr('all') : groupLabel(group))}</button>`).join('')}</nav><div class="hm-results">${visible.map(sectionHtml).join('')}</div></div></section>`; }
function openSummaryDetail(sectionId) { const definition = SECTIONS.find((section) => section.id === sectionId); if (!definition) return; state.filter = definition.group; render(); requestAnimationFrame(() => root.querySelector(`[data-health-section="${sectionId}"]`)?.scrollIntoView({ behavior:'smooth', block:'start' })); }
function render() { root.innerHTML = state.results.size || state.running ? dashboardHtml() : startHtml(); const runAgain = $('#hmRunAgain'); runAgain.hidden = !(state.results.size && !state.running); runAgain.disabled = state.running; root.querySelector('#hmStart')?.addEventListener('click', runAll); root.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter; render(); })); root.querySelectorAll('[data-retry]').forEach((button) => button.addEventListener('click', () => runOne(button.dataset.retry))); root.querySelector('[data-summary-toggle]')?.addEventListener('click', () => { state.summaryExpanded = !state.summaryExpanded; render(); }); root.querySelectorAll('[data-summary-target]').forEach((button) => button.addEventListener('click', () => openSummaryDetail(button.dataset.summaryTarget))); root.querySelectorAll('[data-chart-expand]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.chartExpand; if (state.expandedCharts.has(id)) state.expandedCharts.delete(id); else state.expandedCharts.add(id); render(); requestAnimationFrame(() => root.querySelector(`[data-health-section="${id}"]`)?.scrollIntoView({ block:'start' })); })); root.querySelector('[data-security-filter]')?.addEventListener('input', (event) => { state.securityFilter = event.target.value; render(); root.querySelector('[data-security-filter]')?.focus(); }); }
async function runOne(sectionId) { const response = await message({ type:'healthMonitor:runSection', orgId:state.orgId, sectionId, locale }); if (response?.ok) state.results.set(sectionId, response.section); else state.results.set(sectionId, { columns:[], rows:[], metrics:[], note:response?.reason === 'NO_SID' ? tr('noSession') : response?.error || tr('requestFailed') }); }
async function runAll() { if (state.running) return; state.running = true; state.completed = 0; state.results.clear(); render(); const queue = [...SECTIONS]; const worker = async () => { while (queue.length) { const section = queue.shift(); await runOne(section.id); state.completed += 1; render(); } }; try { await Promise.all(Array.from({ length:3 }, worker)); } finally { state.running = false; render(); } }
function closeHealthTab() { chrome.tabs.getCurrent((tab) => { if (tab?.id) { void chrome.tabs.remove(tab.id); return; } history.back(); }); }
async function main() { await loadLang(); locale = getCurrentLang() === 'en' ? 'en' : 'es'; await loadExtensionSettings(); applyUiThemeToDocument(document); document.documentElement.lang = locale; document.title = `${tr('title')} · Salesforce Org Compare`; $('#hmBackText').textContent = tr('back'); $('#hmTitle').textContent = tr('title'); $('#hmOrgLabel').textContent = tr('loadingOrg'); $('#hmRunAgain').textContent = tr('rerun'); $('#hmBack').addEventListener('click', closeHealthTab); $('#hmRunAgain').addEventListener('click', runAll); if (!state.orgId) { root.innerHTML = `<p class="hm-error">${esc(tr('noOrg'))}</p>`; return; } const context = await message({ type:'healthMonitor:context', orgId:state.orgId }); if (!context?.ok) { root.innerHTML = `<p class="hm-error">${esc(context?.error || tr('contextFailed'))}</p>`; return; } state.org = context.org; $('#hmOrgLabel').textContent = `${state.org.name || host(state.org.instanceUrl)} · ${host(state.org.instanceUrl)}`; render(); }
function summaryDetailText(key) { const copy = { es: { details:'Ver diagnóstico', closeDetails:'Ocultar diagnóstico', actionDetail:'Prioridades detectadas durante el análisis.', accessDetail:'Consultas que no se han podido completar por disponibilidad o permisos.', limitsDetail:'Límites que requieren revisión antes de que alcancen el umbral crítico.', coverageDetail:'Cobertura y estado de la última ejecución de pruebas Apex.', clean:'No se han detectado acciones pendientes.', noAccess:'No hay áreas con acceso limitado.', noCritical:'No hay límites críticos detectados.', coverageOk:'La cobertura no requiere una acción prioritaria.', review:'Revisar detalle' }, en: { details:'View diagnosis', closeDetails:'Hide diagnosis', actionDetail:'Priorities detected during the analysis.', accessDetail:'Queries that could not complete because of availability or permissions.', limitsDetail:'Limits to review before they reach the critical threshold.', coverageDetail:'Coverage and the latest Apex test run status.', clean:'No pending actions were detected.', noAccess:'There are no areas with limited access.', noCritical:'No critical limits were detected.', coverageOk:'Coverage does not require a priority action.', review:'Review detail' } }; return copy[locale]?.[key] || copy.es[key] || key; }
function executiveSummaryDetailsHtml() { const critical = metricValue('limits', /Críticos|Critical/); const coverage = metricValue('tests', /Cobertura global|Overall coverage/); const asyncFailures = metricValue('async', /Fallidos|Failed/); const scheduledErrors = metricValue('scheduled', /Con error|With errors/); const unavailableResults = [...state.results.entries()].filter(([, result]) => result.note && /not supported|no disponible|not available|insufficient|permission/i.test(result.note)); const unavailable = unavailableResults.length; const findings = []; if (critical) findings.push(`${critical} ${tr('criticalLimits')}`); if (coverage && coverage < 75) findings.push(`${coverage}% ${tr('coverage')}`); if (asyncFailures) findings.push(`${asyncFailures} ${tr('recentFailures')}`); if (scheduledErrors) findings.push(`${scheduledErrors} ${tr('scheduledErrors')}`); const priority = critical ? 'limits' : coverage && coverage < 75 ? 'tests' : asyncFailures ? 'async' : scheduledErrors ? 'scheduled' : 'overview'; const summaryRows = (sectionId, empty) => { const result = state.results.get(sectionId); const rows = (result?.rows || []).slice(0, 4).map((row) => row.filter(Boolean).slice(0, 3).join(' · ')); return rows.length ? rows : [empty]; }; const details = [ { target:priority, title:tr('actionItems'), intro:summaryDetailText('actionDetail'), lines:findings.length ? findings : [summaryDetailText('clean')] }, { target:'securityHealth', title:tr('unavailable'), intro:summaryDetailText('accessDetail'), lines:unavailableResults.length ? unavailableResults.map(([id, result]) => `${sectionLabel(SECTIONS.find((section) => section.id === id))}: ${result.note}`) : [summaryDetailText('noAccess')] }, { target:'limits', title:tr('criticalLimits'), intro:summaryDetailText('limitsDetail'), lines:critical ? summaryRows('limits', summaryDetailText('noCritical')) : [summaryDetailText('noCritical')] }, { target:'tests', title:tr('coverage'), intro:summaryDetailText('coverageDetail'), lines:coverage && coverage < 75 ? summaryRows('tests', summaryDetailText('coverageOk')) : [summaryDetailText('coverageOk')] } ]; const expanded = state.summaryExpanded; return `<section class="hm-exec-summary${expanded ? ' is-expanded' : ''}"><button type="button" class="hm-summary-toggle" data-summary-toggle aria-expanded="${expanded}"><span class="hm-summary-title"><span>${sectionIcon('operations')}</span><span><b>${esc(tr('summary'))}</b><small>${esc(findings.length ? findings.join(' · ') : (state.running ? tr('summaryIncomplete') : tr('summaryClean')))}</small></span></span><span class="hm-summary-toggle-label">${esc(expanded ? summaryDetailText('closeDetails') : summaryDetailText('details'))} ${expanded ? '⌃' : '⌄'}</span></button><div class="hm-summary-metrics"><button type="button" data-summary-target="${priority}" class="hm-summary-metric ${findings.length ? 'bad' : 'good'}"><b>${findings.length}</b><span>${esc(tr('actionItems'))}</span></button><button type="button" data-summary-target="securityHealth" class="hm-summary-metric ${unavailable ? 'warn' : 'good'}"><b>${unavailable}</b><span>${esc(tr('unavailable'))}</span></button><button type="button" data-summary-target="limits" class="hm-summary-metric ${critical ? 'bad' : 'good'}"><b>${critical}</b><span>${esc(tr('criticalLimits'))}</span></button><button type="button" data-summary-target="tests" class="hm-summary-metric ${coverage && coverage < 75 ? 'bad' : 'good'}"><b>${coverage || '—'}${coverage ? '%' : ''}</b><span>${esc(tr('coverage'))}</span></button></div>${expanded ? `<div class="hm-summary-details">${details.map((detail) => `<article class="hm-summary-detail"><div><b>${esc(detail.title)}</b><p>${esc(detail.intro)}</p><ul>${detail.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></div><button type="button" data-summary-target="${esc(detail.target)}">${esc(summaryDetailText('review'))} →</button></article>`).join('')}</div>` : ''}</section>`; }
executiveSummaryHtml = executiveSummaryDetailsHtml;
function pdfText(key) { const copy = { es: { title:'Documento de análisis del entorno', generated:'Generado el', environment:'Información del entorno', name:'Nombre', instance:'Instancia', api:'Versión API', summary:'Resumen ejecutivo', detail:'Detalle del análisis', metrics:'Indicadores', chart:'Distribución', data:'Datos detallados', note:'Nota', noData:'Sin datos disponibles', export:'Generar documento PDF', exporting:'Generando PDF…', error:'No se ha podido generar el PDF.' }, en: { title:'Environment analysis document', generated:'Generated on', environment:'Environment information', name:'Name', instance:'Instance', api:'API version', summary:'Executive summary', detail:'Analysis detail', metrics:'Metrics', chart:'Distribution', data:'Detailed data', note:'Note', noData:'No data available', export:'Generate PDF document', exporting:'Generating PDF…', error:'The PDF could not be generated.' } }; return copy[locale]?.[key] || copy.es[key] || key; }
async function logoDataUrl() { const response = await fetch(chrome.runtime.getURL('icons/logo-horizontal.png')); const blob = await response.blob(); return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }
async function exportAnalysisPdf() { const button = $('#hmExportPdf'); if (!state.results.size || state.running || button?.disabled) return; button.disabled = true; const previousText = button.textContent; button.textContent = pdfText('exporting'); try { const JsPdf = globalThis.jspdf?.jsPDF; if (!JsPdf) throw new Error('jsPDF unavailable'); const pdf = new JsPdf({ unit:'pt', format:'a4', compress:true }); const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = pdf.internal.pageSize.getHeight(); const margin = 40; const right = pageWidth - margin; const usable = right - margin; const logo = await logoDataUrl(); const generatedAt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', { dateStyle:'long', timeStyle:'short' }).format(new Date()); let y = 0; const header = (first) => { pdf.setFillColor(255,255,255); pdf.rect(0, 0, pageWidth, pageHeight, 'F'); if (first && logo) pdf.addImage(logo, 'PNG', margin, 28, 152, 46); pdf.setTextColor(20,48,76); pdf.setFont('helvetica','bold'); pdf.setFontSize(first ? 18 : 11); pdf.text(first ? pdfText('title') : 'Salesforce Org Compare · Health Monitor', first ? margin : margin, first ? 99 : 34); pdf.setTextColor(93,112,136); pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.text(`${pdfText('generated')}: ${generatedAt}`, first ? margin : right, first ? 115 : 34, { align:first ? 'left' : 'right' }); pdf.setDrawColor(28,144,185); pdf.setLineWidth(1); pdf.line(margin, first ? 126 : 44, right, first ? 126 : 44); y = first ? 150 : 64; }; const page = () => { pdf.addPage(); header(false); }; const space = (height) => { if (y + height > pageHeight - 42) page(); }; const text = (value, size = 10, color = [34,53,74], indent = margin, width = usable, gap = 5) => { const lines = pdf.splitTextToSize(String(value || ''), width); const height = lines.length * (size + 3) + gap; space(height); pdf.setFont('helvetica','normal'); pdf.setFontSize(size); pdf.setTextColor(...color); pdf.text(lines, indent, y); y += height; }; const heading = (value, level = 1) => { const size = level === 1 ? 15 : 12; space(size + 15); pdf.setFillColor(232,246,251); pdf.roundedRect(margin, y - size, usable, size + 12, 4, 4, 'F'); pdf.setTextColor(10,91,129); pdf.setFont('helvetica','bold'); pdf.setFontSize(size); pdf.text(value, margin + 9, y + 2); y += size + 20; }; const labelValue = (label, value) => { pdf.setFont('helvetica','bold'); pdf.setFontSize(10); pdf.setTextColor(34,53,74); pdf.text(`${label}:`, margin, y); pdf.setFont('helvetica','normal'); pdf.setTextColor(82,102,125); const lines = pdf.splitTextToSize(String(value || '—'), usable - 110); pdf.text(lines, margin + 110, y); y += Math.max(15, lines.length * 13) + 3; }; const table = (columns, rows) => { if (!columns?.length) return; const widths = columns.map(() => usable / columns.length); const drawHeader = () => { space(20); pdf.setFillColor(22,61,92); pdf.rect(margin, y - 11, usable, 19, 'F'); pdf.setTextColor(255,255,255); pdf.setFont('helvetica','bold'); pdf.setFontSize(7); let x = margin; columns.forEach((column, index) => { pdf.text(pdf.splitTextToSize(String(column), widths[index] - 7).slice(0, 2), x + 4, y); x += widths[index]; }); y += 14; }; drawHeader(); for (const row of rows || []) { pdf.setFont('helvetica','normal'); pdf.setFontSize(7); const cells = columns.map((_, index) => pdf.splitTextToSize(String(row[index] ?? '—'), widths[index] - 7)); const height = Math.max(14, ...cells.map((cell) => cell.length * 9 + 5)); if (y + height > pageHeight - 42) { page(); drawHeader(); } let x = margin; cells.forEach((cell, index) => { pdf.setDrawColor(214,225,234); pdf.rect(x, y - 10, widths[index], height, 'S'); pdf.setTextColor(43,62,82); pdf.text(cell, x + 4, y); x += widths[index]; }); y += height; } y += 10; }; const chart = (result) => { if (!result.chart?.values?.length) return; heading(pdfText('chart'), 2); const values = result.chart.values.map(Number); const max = result.chart.suffix === '%' ? 100 : Math.max(...values, 1); result.chart.values.forEach((raw, index) => { const label = String(result.chart.labels?.[index] || '—'); const value = Number(raw) || 0; const labelLines = pdf.splitTextToSize(label, 160); const height = Math.max(15, labelLines.length * 9 + 3); if (y + height > pageHeight - 42) page(); pdf.setFont('helvetica','normal'); pdf.setFontSize(8); pdf.setTextColor(38,57,77); pdf.text(labelLines, margin, y); const barX = margin + 170; const barW = usable - 222; pdf.setFillColor(228,238,246); pdf.roundedRect(barX, y - 8, barW, 9, 3, 3, 'F'); pdf.setFillColor(5,169,216); pdf.roundedRect(barX, y - 8, Math.max(2, barW * value / max), 9, 3, 3, 'F'); pdf.setTextColor(66,92,119); pdf.text(`${raw}${result.chart.suffix || ''}`, right, y, { align:'right' }); y += height; }); y += 8; }; header(true); heading(pdfText('environment')); labelValue(pdfText('name'), state.org?.name || '—'); labelValue(pdfText('instance'), state.org?.instanceUrl || '—'); labelValue(pdfText('api'), state.org?.apiVersion || '63.0'); y += 6; heading(pdfText('summary')); const summary = [ [tr('actionItems'), String(metricValue('limits', /Críticos|Critical/) + (metricValue('tests', /Cobertura global|Overall coverage/) < 75 ? 1 : 0))], [tr('unavailable'), String([...state.results.values()].filter((result) => result.note).length)], [tr('criticalLimits'), String(metricValue('limits', /Críticos|Critical/))], [tr('coverage'), `${metricValue('tests', /Cobertura global|Overall coverage/) || '—'}%`] ]; table([pdfText('metrics'), 'Valor'], summary); heading(pdfText('detail')); for (const section of SECTIONS) { const result = state.results.get(section.id); if (!result) continue; heading(sectionLabel(section), 1); const metrics = result.metrics || []; if (metrics.length) { pdf.setFont('helvetica','bold'); pdf.setFontSize(10); pdf.setTextColor(34,53,74); pdf.text(pdfText('metrics'), margin, y); y += 14; table(['Indicador', 'Valor'], metrics.map((metric) => [metric.label, metric.value])); } chart(result); if (result.columns?.length) { heading(pdfText('data'), 2); table(result.columns, result.rows || []); } if (result.note) { heading(pdfText('note'), 2); text(result.note, 9, [130,87,28]); } if (!metrics.length && !result.chart?.values?.length && !result.columns?.length && !result.note) text(pdfText('noData'), 9, [93,112,136]); } const pages = pdf.getNumberOfPages(); for (let index = 1; index <= pages; index += 1) { pdf.setPage(index); pdf.setFont('helvetica','normal'); pdf.setFontSize(8); pdf.setTextColor(100,117,137); pdf.text(`Salesforce Org Compare · ${index}/${pages}`, right, pageHeight - 18, { align:'right' }); } const name = String(state.org?.name || 'environment').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase(); pdf.save(`sfoc-environment-analysis-${name || 'environment'}-${new Date().toISOString().slice(0, 10)}.pdf`); } catch (error) { console.error('Health Monitor PDF export failed', error); alert(pdfText('error')); } finally { button.disabled = false; button.textContent = previousText || pdfText('export'); } }
function pdfReportText(key) {
  const copy = {
    es: { title:'Documento de análisis del entorno', generated:'Generado el', environment:'Información del entorno', name:'Nombre', instance:'Instancia', api:'Versión API', orgId:'ID de organización', summary:'Resumen ejecutivo', detail:'Detalle del análisis', metrics:'Indicadores', chart:'Distribución', data:'Datos detallados', note:'Nota', noData:'Sin datos disponibles', value:'Valor', export:'Generar documento PDF', exporting:'Generando PDF…', error:'No se ha podido generar el PDF.', condensed:'El detalle se ha resumido para mantener el informe en un máximo de 15 páginas.', showing:'Se muestran {shown} de {total} filas.' },
    en: { title:'Environment analysis document', generated:'Generated on', environment:'Environment information', name:'Name', instance:'Instance', api:'API version', orgId:'Organization ID', summary:'Executive summary', detail:'Analysis detail', metrics:'Metrics', chart:'Distribution', data:'Detailed data', note:'Note', noData:'No data available', value:'Value', export:'Generate PDF document', exporting:'Generating PDF…', error:'The PDF could not be generated.', condensed:'The detail has been condensed to keep the report within 15 pages.', showing:'Showing {shown} of {total} rows.' }
  };
  return (copy[locale]?.[key] || copy.es[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(arguments[1]?.[name] ?? ''));
}

async function exportAnalysisPdfV2() {
  const button = $('#hmExportPdf');
  if (!state.results.size || state.running || button?.disabled) return;
  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = pdfReportText('exporting');

  try {
    const JsPdf = globalThis.jspdf?.jsPDF;
    if (!JsPdf) throw new Error('jsPDF unavailable');

    const pdf = new JsPdf({ unit:'pt', format:'a4', compress:true });
    const maxPages = 15;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 42;
    const right = pageWidth - margin;
    const usable = right - margin;
    const bottom = pageHeight - 52;
    const logo = await logoDataUrl();
    const generatedAt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', { dateStyle:'long', timeStyle:'short' }).format(new Date());
    let y = 0;
    let stopped = false;
    let condensed = false;

    const header = (first) => {
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      if (first && logo) pdf.addImage(logo, 'PNG', margin, 24, 84, 55);
      pdf.setTextColor(20, 48, 76);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(first ? 17 : 10);
      pdf.text(first ? 'Salesforce Org Compare' : 'Salesforce Org Compare · Environment analysis', first ? margin + 98 : margin, first ? 51 : 32);
      if (first) {
        pdf.setTextColor(83, 105, 128);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text(pdfReportText('title'), margin + 98, 67);
        pdf.setTextColor(20, 48, 76);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(18);
        pdf.text(pdfReportText('title'), margin, 108);
      }
      pdf.setTextColor(93, 112, 136);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(`${pdfReportText('generated')}: ${generatedAt}`, first ? margin : right, first ? 124 : 32, { align:first ? 'left' : 'right' });
      pdf.setDrawColor(28, 144, 185);
      pdf.setLineWidth(1);
      pdf.line(margin, first ? 136 : 42, right, first ? 136 : 42);
      y = first ? 158 : 61;
    };
    const newPage = () => {
      if (pdf.getNumberOfPages() >= maxPages) { stopped = true; condensed = true; return false; }
      pdf.addPage();
      header(false);
      return true;
    };
    const ensureSpace = (height) => (y + height <= bottom ? true : newPage());
    const text = (value, size = 9, color = [43, 62, 82], width = usable, gap = 6) => {
      if (stopped) return false;
      const lines = pdf.splitTextToSize(String(value || ''), width).slice(0, 12);
      const height = lines.length * (size + 3) + gap;
      if (!ensureSpace(height)) return false;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(size);
      pdf.setTextColor(...color);
      pdf.text(lines, margin, y);
      y += height;
      return true;
    };
    const heading = (value, level = 1) => {
      if (stopped) return false;
      const height = level === 1 ? 29 : 24;
      if (!ensureSpace(height + 5)) return false;
      pdf.setFillColor(level === 1 ? 228 : 240, level === 1 ? 243 : 248, level === 1 ? 249 : 252);
      pdf.roundedRect(margin, y - 13, usable, height, 4, 4, 'F');
      pdf.setTextColor(10, 91, 129);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(level === 1 ? 13 : 10);
      pdf.text(String(value), margin + 10, y + (level === 1 ? 5 : 2));
      y += height + 5;
      return true;
    };
    const labelValue = (label, value) => {
      const lines = pdf.splitTextToSize(String(value || '—'), usable - 118).slice(0, 4);
      const height = Math.max(18, lines.length * 12 + 6);
      if (!ensureSpace(height)) return false;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(34, 53, 74); pdf.text(`${label}:`, margin, y);
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(82, 102, 125); pdf.text(lines, margin + 118, y);
      y += height;
      return true;
    };
    const table = (columns, sourceRows, limit = 10) => {
      if (!columns?.length || stopped) return false;
      const rows = (sourceRows || []).slice(0, limit);
      if ((sourceRows || []).length > rows.length) condensed = true;
      const widths = columns.length === 2 ? [usable * .5, usable * .5] : columns.map(() => usable / columns.length);
      const drawHead = () => {
        const headerLines = columns.map((column, index) => pdf.splitTextToSize(String(column), widths[index] - 10).slice(0, 2));
        const height = Math.max(20, ...headerLines.map((lines) => lines.length * 9 + 8));
        if (!ensureSpace(height)) return false;
        pdf.setFillColor(28, 69, 105); pdf.rect(margin, y - 11, usable, height, 'F');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(255, 255, 255);
        let x = margin;
        headerLines.forEach((lines, index) => { pdf.text(lines, x + 5, y); x += widths[index]; });
        y += height;
        return true;
      };
      if (!drawHead()) return false;
      rows.forEach((row, rowIndex) => {
        if (stopped) return;
        const cells = columns.map((_, index) => pdf.splitTextToSize(String(row[index] ?? '—'), widths[index] - 10).slice(0, 5));
        const height = Math.max(19, ...cells.map((lines) => lines.length * 10 + 8));
        if (y + height > bottom && (!newPage() || !drawHead())) return;
        pdf.setFillColor(...(rowIndex % 2 ? [247, 250, 252] : [255, 255, 255]));
        pdf.rect(margin, y - 11, usable, height, 'F');
        pdf.setDrawColor(214, 225, 234); pdf.rect(margin, y - 11, usable, height, 'S');
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(43, 62, 82);
        let x = margin;
        cells.forEach((lines, index) => { pdf.text(lines, x + 5, y); if (index) pdf.line(x, y - 11, x, y - 11 + height); x += widths[index]; });
        y += height;
      });
      y += 9;
      return !stopped;
    };
    const chart = (result) => {
      if (!result.chart?.values?.length || stopped || !heading(pdfReportText('chart'), 2)) return;
      const values = result.chart.values.slice(0, 6).map(Number);
      if (result.chart.values.length > values.length) condensed = true;
      const max = result.chart.suffix === '%' ? 100 : Math.max(...values, 1);
      values.forEach((value, index) => {
        if (stopped || !ensureSpace(18)) return;
        const label = pdf.splitTextToSize(String(result.chart.labels?.[index] || '—'), 160).slice(0, 2);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(38, 57, 77); pdf.text(label, margin, y);
        const barX = margin + 170; const barWidth = usable - 222;
        pdf.setFillColor(228, 238, 246); pdf.roundedRect(barX, y - 8, barWidth, 9, 3, 3, 'F');
        pdf.setFillColor(5, 145, 190); pdf.roundedRect(barX, y - 8, Math.max(2, barWidth * value / max), 9, 3, 3, 'F');
        pdf.setTextColor(66, 92, 119); pdf.text(`${result.chart.values[index]}${result.chart.suffix || ''}`, right, y, { align:'right' });
        y += 18;
      });
      y += 6;
    };

    header(true);
    heading(pdfReportText('environment'));
    labelValue(pdfReportText('name'), state.org?.name || '—');
    labelValue(pdfReportText('instance'), state.org?.instanceUrl || '—');
    labelValue(pdfReportText('api'), state.org?.apiVersion || '63.0');
    if (state.org?.id) labelValue(pdfReportText('orgId'), state.org.id);
    heading(pdfReportText('summary'));
    table([pdfReportText('metrics'), pdfReportText('value')], [
      [tr('actionItems'), String(metricValue('limits', /Críticos|Critical/) + (metricValue('tests', /Cobertura global|Overall coverage/) < 75 ? 1 : 0))],
      [tr('unavailable'), String([...state.results.values()].filter((result) => result.note).length)],
      [tr('criticalLimits'), String(metricValue('limits', /Críticos|Critical/))],
      [tr('coverage'), `${metricValue('tests', /Cobertura global|Overall coverage/) || '—'}%`]
    ], 4);
    heading(pdfReportText('detail'));
    for (const section of SECTIONS) {
      if (stopped) break;
      const result = state.results.get(section.id);
      if (!result || !heading(sectionLabel(section), 1)) continue;
      const metrics = result.metrics || [];
      if (metrics.length) { heading(pdfReportText('metrics'), 2); table([pdfReportText('metrics'), pdfReportText('value')], metrics.map((metric) => [metric.label, metric.value]), 10); }
      chart(result);
      if (result.columns?.length && !stopped) {
        heading(pdfReportText('data'), 2);
        const originalRows = result.rows || [];
        table(result.columns, originalRows, 10);
        if (!stopped && originalRows.length > 10) text(pdfReportText('showing', { shown:10, total:originalRows.length }), 8, [93, 112, 136]);
      }
      if (result.note && !stopped) { heading(pdfReportText('note'), 2); text(result.note, 8, [130, 87, 28]); }
      if (!metrics.length && !result.chart?.values?.length && !result.columns?.length && !result.note && !stopped) text(pdfReportText('noData'), 9, [93, 112, 136]);
    }
    const pages = pdf.getNumberOfPages();
    for (let index = 1; index <= pages; index += 1) {
      pdf.setPage(index);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(100, 117, 137);
      if (condensed && index === pages) pdf.text(pdfReportText('condensed'), margin, pageHeight - 20);
      pdf.text(`Salesforce Org Compare · ${index}/${pages}`, right, pageHeight - 20, { align:'right' });
    }
    const name = String(state.org?.name || 'environment').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
    pdf.save(`sfoc-environment-analysis-${name || 'environment'}-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (error) {
    console.error('Health Monitor PDF export failed', error);
    alert(pdfReportText('error'));
  } finally {
    button.disabled = false;
    button.textContent = previousText || pdfReportText('export');
  }
}

$('#hmExportPdf')?.addEventListener('click', exportAnalysisPdfV2);
function syncPdfExportButton() { const button = $('#hmExportPdf'); if (!button) return; button.hidden = !(state.results.size && !state.running); button.disabled = state.running; if (!button.disabled) button.textContent = pdfReportText('export'); }
new MutationObserver(syncPdfExportButton).observe(root, { childList:true });
void main().then(syncPdfExportButton);
