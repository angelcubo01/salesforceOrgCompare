import {
  fetchOrgLimits,
  fetchOrganizationStatus,
  listRestApiVersions,
  restQuery,
  toolingQuery
} from '../shared/salesforceApi.js';

const SECTION_IDS = [
  'overview', 'limits', 'securityHealth', 'async', 'scheduled', 'tests', 'apiVersions',
  'licenses', 'packages', 'automation', 'objects', 'sharing', 'audit', 'security', 'hygiene'
];

export const HEALTH_MONITOR_SECTIONS = [
  ['overview', 'Infraestructura', 'Estado de instancia'], ['limits', 'Infraestructura', 'Límites y almacenamiento'],
  ['securityHealth', 'Seguridad', 'Security Health Check'], ['async', 'Operaciones', 'Trabajos asíncronos'],
  ['scheduled', 'Operaciones', 'Apex programado'], ['tests', 'Calidad de código', 'Cobertura Apex'],
  ['apiVersions', 'Calidad de código', 'Versiones API'], ['licenses', 'Licencias', 'Uso de licencias'],
  ['packages', 'Licencias', 'Paquetes instalados'], ['automation', 'Automatización', 'Automatizaciones'],
  ['objects', 'Metadatos', 'Objetos y límites'], ['sharing', 'Metadatos', 'Configuración de compartición'],
  ['audit', 'Operaciones', 'Setup Audit Trail'], ['security', 'Seguridad', 'Señales de seguridad'],
  ['hygiene', 'Metadatos', 'Higiene de la organización']
].map(([id, group, title]) => ({ id, group, title }));

function number(value) { return Number(value || 0); }
function percent(value, max) { return max > 0 ? Math.round((value / max) * 100) : 0; }
function asError(error) { return String(error?.message || error || 'Consulta no disponible'); }
function table(columns, rows, metrics = [], chart = null, note = '') { return { columns, rows, metrics, chart, note }; }
async function safe(task) { try { return { value: await task(), error: '' }; } catch (error) { return { value: null, error: asError(error) }; } }
const EN = {
  'Dato':'Data', 'Valor':'Value', 'Organización':'Organization', 'Instancia':'Instance', 'Tipo':'Type', 'Límite':'Limit', 'Usado':'Used', 'Restante':'Remaining', 'Máximo':'Maximum', '% uso':'% used', 'Métrica':'Metric', 'Inicio':'Start', 'Fin':'End', 'Grupo':'Group', 'Ajuste':'Setting', 'Nivel':'Level', 'Valor org.':'Org value', 'Estándar':'Standard', 'Estado':'Status', 'Cantidad':'Count', 'Clase / trigger':'Class / trigger', 'Cubiertas':'Covered', 'No cubiertas':'Uncovered', 'Cobertura':'Coverage', 'Versión API':'API version', 'Componentes':'Components', 'Licencia':'License', 'Usadas':'Used', 'Total':'Total', 'Paquete':'Package', 'Namespace':'Namespace', 'Versión':'Version', 'Beta':'Beta', 'Automatización':'Automation', 'API name':'API name', 'Etiqueta':'Label', 'Personalizable':'Customizable', 'Modelo de compartición':'Sharing model', 'Fecha':'Date', 'Usuario':'User', 'Acción':'Action', 'Sección':'Section', 'Detalle':'Detail', 'Señal':'Signal', 'Indicador':'Indicator',
  'Sí':'Yes', 'No':'No', 'Activo':'Active', 'Inactivo':'Inactive', 'Válidas':'Valid', 'No válidas':'Invalid', 'Configuradas':'Configured', 'No disponible':'Not available', 'Consultas correctas':'Successful queries', 'Límites medidos':'Limits measured', 'Críticos ≥ 90%':'Critical ≥ 90%', 'Avisos ≥ 75%':'Warnings ≥ 75%', 'Métricas disponibles':'Available metrics', 'Puntuación':'Score', 'Riesgos':'Risks', 'Estados':'Statuses', 'Fallidos / abortados':'Failed / aborted', 'Fallidos / abortados (7 días)':'Failed / aborted (7 days)', 'Jobs':'Jobs', 'Con error':'With errors', 'Cobertura global':'Overall coverage', 'Último run':'Latest run', 'Fallos último run':'Latest run failures', 'API más reciente usada':'Latest API version used', 'Tipos':'Types', 'Licencias usadas':'Licenses used', 'Paquetes':'Packages', 'Licencias de paquete/PSL':'Package / PSL licenses', 'Licencias ≥ 90%':'Licenses ≥ 90%', 'Flows':'Flows', 'Triggers':'Triggers', 'Workflow rules':'Workflow rules', 'Objetos':'Objects', 'Custom objects':'Custom objects', 'Eventos mostrados':'Events shown', 'Estados de login':'Login statuses', 'Connected apps':'Connected apps', 'Clases no válidas':'Invalid classes', 'Trace flags activos':'Active trace flags', 'Líneas':'Lines'
};
function toEnglish(value) { if (typeof value !== 'string') return value; const raw = value; if (EN[raw]) return EN[raw]; return raw.replace(/^Flow · /, 'Flow · ').replace(/^Apex classes$/, 'Apex classes').replace(/^Deploys$/, 'Deploys').replace(/^Trace flags activos$/, 'Active trace flags'); }
function localizeResult(result, locale) {
  if (locale !== 'en') return result;
  return {
    ...result,
    columns: (result.columns || []).map(toEnglish),
    rows: (result.rows || []).map((row) => row.map(toEnglish)),
    metrics: (result.metrics || []).map((metric) => ({ ...metric, label: toEnglish(metric.label) })),
    chart: result.chart ? { ...result.chart, labels: (result.chart.labels || []).map(toEnglish), suffix: toEnglish(result.chart.suffix) } : result.chart,
    note: result.note === 'Salesforce solo expone esta información cuando la funcionalidad está disponible en la organización.' ? 'Salesforce exposes this information only when the feature is available in the organization.' : result.note
  };
}
function limitRows(limits) {
  return Object.entries(limits || {}).map(([name, item]) => {
    const max = number(item?.Max); const remaining = number(item?.Remaining); const used = Math.max(0, max - remaining);
    return { name, max, remaining, used, percent: percent(used, max) };
  }).filter((row) => row.max > 0).sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
}

async function overview(ctx) {
  const [org, versions] = await Promise.all([safe(() => fetchOrganizationStatus(ctx.instanceUrl, ctx.sid, ctx.apiVersion)), safe(() => listRestApiVersions(ctx.instanceUrl, ctx.sid))]);
  const value = org.value || {};
  return table(['Dato', 'Valor'], [
    ['Organización', value.name || '—'], ['Instancia', value.instanceName || '—'], ['Tipo', value.organizationType || '—'],
    ['Sandbox', value.isSandbox ? 'Sí' : 'No'], ['API configurada', ctx.apiVersion], ['API máxima', Array.isArray(versions.value) ? versions.value.at(-1) || '—' : '—']
  ], [{ label: 'Consultas correctas', value: [org, versions].filter((r) => r.value).length, tone: 'good' }], null, [org.error, versions.error].filter(Boolean).join(' · '));
}
async function limits(ctx) {
  const result = await safe(() => fetchOrgLimits(ctx.instanceUrl, ctx.sid, ctx.apiVersion)); const rows = limitRows(result.value).slice(0, 60);
  const critical = rows.filter((row) => row.percent >= 90).length; const warning = rows.filter((row) => row.percent >= 75 && row.percent < 90).length;
  return table(['Límite', 'Usado', 'Restante', 'Máximo', '% uso'], rows.map((row) => [row.name, row.used, row.remaining, row.max, `${row.percent}%`]), [
    { label: 'Límites medidos', value: rows.length }, { label: 'Críticos ≥ 90%', value: critical, tone: critical ? 'bad' : 'good' }, { label: 'Avisos ≥ 75%', value: warning, tone: warning ? 'warn' : 'good' }
  ], { labels: rows.slice(0, 12).map((row) => row.name), values: rows.slice(0, 12).map((row) => row.percent), suffix: '%' }, result.error);
}
async function securityHealth(ctx) {
  const [score, risks] = await Promise.all([
    safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT Id, Score, CustomBaselineId FROM SecurityHealthCheck LIMIT 1')),
    safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT Id, RiskType, Setting, SettingGroup, OrgValue, StandardValue, SettingRiskCategory FROM SecurityHealthCheckRisks LIMIT 200'))
  ]);
  const riskRows = risks.value || []; const scoreValue = number(score.value?.[0]?.Score);
  return table(['Grupo', 'Ajuste', 'Nivel', 'Valor org.', 'Estándar'], riskRows.map((row) => [row.SettingGroup, row.Setting, row.SettingRiskCategory || row.RiskType, row.OrgValue, row.StandardValue]), [
    { label: 'Puntuación', value: score.value?.length ? `${scoreValue}%` : 'No disponible', tone: scoreValue >= 80 ? 'good' : scoreValue >= 50 ? 'warn' : 'bad' }, { label: 'Riesgos', value: riskRows.length }
  ], null, [score.error, risks.error].filter(Boolean).join(' · '));
}
async function asyncJobs(ctx) {
  const result = await safe(() => restQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, "SELECT JobType, Status, COUNT(Id) total FROM AsyncApexJob WHERE CreatedDate = LAST_N_DAYS:7 GROUP BY JobType, Status ORDER BY JobType, Status"));
  const rows = result.value || []; const failed = rows.filter((r) => ['Failed', 'Aborted'].includes(r.Status)).reduce((sum, r) => sum + number(r.total), 0);
  return table(['Tipo', 'Estado', 'Cantidad'], rows.map((r) => [r.JobType, r.Status, r.total]), [{ label: 'Estados', value: rows.length }, { label: 'Fallidos / abortados (7 días)', value: failed, tone: failed ? 'bad' : 'good' }], { labels: rows.slice(0, 12).map((r) => `${r.JobType} · ${r.Status}`), values: rows.slice(0, 12).map((r) => number(r.total)) }, result.error);
}
async function scheduled(ctx) {
  const result = await safe(() => restQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, "SELECT State, CronJobDetail.JobType, COUNT(Id) total FROM CronTrigger WHERE State IN ('WAITING', 'ACQUIRED', 'BLOCKED', 'ERROR') GROUP BY State, CronJobDetail.JobType ORDER BY State"));
  const rows = result.value || []; const blocked = rows.filter((r) => ['ERROR', 'BLOCKED'].includes(String(r.State).toUpperCase())).reduce((sum, r) => sum + number(r.total), 0);
  return table(['Tipo', 'Estado', 'Cantidad'], rows.map((r) => [r.CronJobDetail?.JobType || '—', r.State, r.total]), [{ label: 'Jobs', value: rows.reduce((sum, r) => sum + number(r.total), 0) }, { label: 'Con error', value: blocked, tone: blocked ? 'bad' : 'good' }], null, result.error);
}
async function tests(ctx) {
  const [coverageResult, latestRun] = await Promise.all([
    safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate ORDER BY ApexClassOrTrigger.Name')),
    safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT Status, MethodsEnqueued, MethodsCompleted, MethodsFailed, StartTime FROM ApexTestRunResult ORDER BY StartTime DESC LIMIT 1'))
  ]);
  const rows = coverageResult.value || []; const run = latestRun.value?.[0]; const covered = rows.reduce((sum, r) => sum + number(r.NumLinesCovered), 0); const uncovered = rows.reduce((sum, r) => sum + number(r.NumLinesUncovered), 0); const coverage = percent(covered, covered + uncovered);
  return table(['Clase / trigger', 'Cubiertas', 'No cubiertas', 'Cobertura'], rows.map((r) => { const total = number(r.NumLinesCovered) + number(r.NumLinesUncovered); return [r.ApexClassOrTrigger?.Name || '—', r.NumLinesCovered, r.NumLinesUncovered, `${percent(number(r.NumLinesCovered), total)}%`]; }), [{ label: 'Cobertura global', value: `${coverage}%`, tone: coverage >= 75 ? 'good' : 'bad' }, { label: 'Componentes', value: rows.length }, { label: 'Último run', value: run?.Status || 'No disponible', tone: run?.MethodsFailed ? 'bad' : 'good' }, { label: 'Fallos último run', value: number(run?.MethodsFailed), tone: number(run?.MethodsFailed) ? 'bad' : 'good' }], { labels: ['Cubiertas', 'No cubiertas'], values: [covered, uncovered], suffix: ' líneas' }, [coverageResult.error, latestRun.error].filter(Boolean).join(' · '));
}
async function apiVersions(ctx) {
  const [classes, triggers] = await Promise.all([safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT ApiVersion FROM ApexClass')), safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT ApiVersion FROM ApexTrigger'))]);
  const byVersion = new Map(); for (const row of [...(classes.value || []), ...(triggers.value || [])]) byVersion.set(String(row.ApiVersion), (byVersion.get(String(row.ApiVersion)) || 0) + 1);
  const rows = [...byVersion.entries()].sort((a, b) => number(a[0]) - number(b[0])); const current = Math.max(...rows.map((r) => number(r[0])), 0);
  return table(['Versión API', 'Componentes'], rows.map(([version, count]) => [version, count]), [{ label: 'Componentes', value: rows.reduce((s, [, count]) => s + count, 0) }, { label: 'API más reciente usada', value: current || '—' }], { labels: rows.map(([v]) => v), values: rows.map(([, c]) => c) }, [classes.error, triggers.error].filter(Boolean).join(' · '));
}
async function licenses(ctx) {
  const result = await safe(() => restQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT Name, TotalLicenses, UsedLicenses, Status FROM UserLicense ORDER BY Name'));
  const rows = result.value || [];
  return table(['Licencia', 'Usadas', 'Total', '% uso', 'Estado'], rows.map((r) => [r.Name, r.UsedLicenses, r.TotalLicenses, `${percent(number(r.UsedLicenses), number(r.TotalLicenses))}%`, r.Status]), [{ label: 'Tipos', value: rows.length }, { label: 'Licencias usadas', value: rows.reduce((s, r) => s + number(r.UsedLicenses), 0) }], { labels: rows.slice(0, 12).map((r) => r.Name), values: rows.slice(0, 12).map((r) => percent(number(r.UsedLicenses), number(r.TotalLicenses))), suffix: '%' }, result.error);
}
async function packages(ctx) {
  const [installed, packageLicenses, psLicenses] = await Promise.all([
    safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT Id, SubscriberPackage.Name, SubscriberPackage.NamespacePrefix, SubscriberPackageVersion.Name, SubscriberPackageVersion.IsBeta FROM InstalledSubscriberPackage ORDER BY SubscriberPackage.Name')),
    safe(() => restQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT NamespacePrefix, AllowedLicenses, UsedLicenses, ExpirationDate, Status FROM PackageLicense ORDER BY NamespacePrefix')),
    safe(() => restQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT MasterLabel, TotalLicenses, UsedLicenses, Status, ExpirationDate FROM PermissionSetLicense ORDER BY MasterLabel'))
  ]);
  const rows = installed.value || []; const licenseRows = [...(packageLicenses.value || []), ...(psLicenses.value || [])]; const nearLimit = licenseRows.filter((row) => percent(number(row.UsedLicenses), number(row.AllowedLicenses || row.TotalLicenses)) >= 90).length;
  return table(['Paquete', 'Namespace', 'Versión', 'Beta'], rows.map((r) => [r.SubscriberPackage?.Name || '—', r.SubscriberPackage?.NamespacePrefix || '—', r.SubscriberPackageVersion?.Name || '—', r.SubscriberPackageVersion?.IsBeta ? 'Sí' : 'No']), [{ label: 'Paquetes', value: rows.length }, { label: 'Licencias de paquete/PSL', value: licenseRows.length }, { label: 'Licencias ≥ 90%', value: nearLimit, tone: nearLimit ? 'warn' : 'good' }], null, [installed.error, packageLicenses.error, psLicenses.error].filter(Boolean).join(' · '));
}
async function automation(ctx) {
  const [flows, workflows, triggers] = await Promise.all([
    safe(() => restQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT ProcessType, IsActive FROM FlowDefinitionView')),
    safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT Id FROM WorkflowRule LIMIT 2000')),
    safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT Status, COUNT(Id) total FROM ApexTrigger GROUP BY Status'))
  ]);
  const flowRows = flows.value || []; const triggerRows = triggers.value || [];
  return table(['Automatización', 'Estado', 'Cantidad'], [
    ...[...flowRows.reduce((summary, row) => { const key = `${row.ProcessType || '—'}|${row.IsActive ? 'Activo' : 'Inactivo'}`; summary.set(key, (summary.get(key) || 0) + 1); return summary; }, new Map()).entries()].map(([key, total]) => { const [type, status] = key.split('|'); return [`Flow · ${type}`, status, total]; }),
    ...triggerRows.map((r) => ['Apex Trigger', r.Status || '—', r.total]), ['Workflow Rules', 'Configuradas', (workflows.value || []).length]
  ], [{ label: 'Flows', value: flowRows.length }, { label: 'Triggers', value: triggerRows.reduce((s, r) => s + number(r.total), 0) }, { label: 'Workflow rules', value: (workflows.value || []).length }], null, [flows.error, workflows.error, triggers.error].filter(Boolean).join(' · '));
}
async function objects(ctx) {
  const result = await safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, "SELECT QualifiedApiName, Label, IsCustomizable, IsCustomSetting FROM EntityDefinition WHERE IsCustomSetting = false ORDER BY QualifiedApiName LIMIT 2000"));
  const rows = result.value || []; const custom = rows.filter((r) => String(r.QualifiedApiName || '').endsWith('__c')).length;
  return table(['API name', 'Etiqueta', 'Personalizable'], rows.slice(0, 250).map((r) => [r.QualifiedApiName, r.Label, r.IsCustomizable ? 'Sí' : 'No']), [{ label: 'Objetos', value: rows.length }, { label: 'Custom objects', value: custom }], { labels: ['Estándar', 'Custom'], values: [Math.max(0, rows.length - custom), custom] }, result.error);
}
async function sharing(ctx) {
  const result = await safe(() => restQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT DefaultAccountAccess, DefaultContactAccess, DefaultOpportunityAccess, DefaultCaseAccess, DefaultLeadAccess FROM Organization LIMIT 1'));
  const row = result.value?.[0] || {};
  return table(['Modelo de compartición', 'Valor'], [['Account', row.DefaultAccountAccess], ['Contact', row.DefaultContactAccess], ['Opportunity', row.DefaultOpportunityAccess], ['Case', row.DefaultCaseAccess], ['Lead', row.DefaultLeadAccess]].map((r) => [r[0], r[1] || 'No disponible']), [], null, result.error);
}
async function audit(ctx) {
  const result = await safe(() => restQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT CreatedDate, CreatedBy.Name, Action, Section, Display FROM SetupAuditTrail ORDER BY CreatedDate DESC LIMIT 100'));
  const rows = result.value || [];
  return table(['Fecha', 'Usuario', 'Acción', 'Sección', 'Detalle'], rows.map((r) => [r.CreatedDate, r.CreatedBy?.Name || '—', r.Action, r.Section, r.Display]), [{ label: 'Eventos mostrados', value: rows.length }], null, result.error);
}
async function security(ctx) {
  const [logins, permSets, apps] = await Promise.all([
    safe(() => restQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT Status, COUNT(Id) total FROM LoginHistory GROUP BY Status')),
    safe(() => restQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT PermissionSetId, COUNT(Id) total FROM PermissionSetAssignment GROUP BY PermissionSetId LIMIT 100')),
    safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT Id, Name FROM ConnectedApplication ORDER BY Name LIMIT 200'))
  ]);
  const loginRows = logins.value || [];
  return table(['Señal', 'Valor'], [
    ...loginRows.map((r) => [`Login · ${r.Status}`, r.total]), ['Permission sets asignados (muestra)', (permSets.value || []).length], ['Connected apps', (apps.value || []).length]
  ], [{ label: 'Estados de login', value: loginRows.length }, { label: 'Connected apps', value: (apps.value || []).length }], { labels: loginRows.map((r) => r.Status), values: loginRows.map((r) => number(r.total)) }, [logins.error, permSets.error, apps.error].filter(Boolean).join(' · '));
}
async function hygiene(ctx) {
  const [classes, flags, deploys] = await Promise.all([
    safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT IsValid, Status, COUNT(Id) total FROM ApexClass GROUP BY IsValid, Status')),
    safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT Id FROM TraceFlag WHERE ExpirationDate > TODAY LIMIT 2000')),
    safe(() => toolingQuery(ctx.instanceUrl, ctx.sid, ctx.apiVersion, 'SELECT Status, COUNT(Id) total FROM DeployRequest GROUP BY Status'))
  ]);
  const rows = classes.value || []; const invalid = rows.filter((r) => r.IsValid === false).reduce((s, r) => s + number(r.total), 0);
  return table(['Indicador', 'Estado', 'Cantidad'], [...rows.map((r) => ['Apex classes', `${r.IsValid ? 'Válidas' : 'No válidas'} · ${r.Status}`, r.total]), ...(deploys.value || []).map((r) => ['Deploys', r.Status, r.total]), ['Trace flags activos', 'Activos', (flags.value || []).length]], [{ label: 'Clases no válidas', value: invalid, tone: invalid ? 'bad' : 'good' }, { label: 'Trace flags activos', value: (flags.value || []).length }], null, [classes.error, flags.error, deploys.error].filter(Boolean).join(' · '));
}

const RUNNERS = { overview, limits, securityHealth, async: asyncJobs, scheduled, tests, apiVersions, licenses, packages, automation, objects, sharing, audit, security, hygiene };

export async function fetchHealthMonitorContext(org) {
  return { ok: true, org: { id: org.id, name: org.displayName || org.label || org.username || '', instanceUrl: org.instanceUrl, apiVersion: org.apiVersion || '63.0', instanceName: '' }, contextError: '' };
}

export async function runHealthMonitorSection(org, sid, sectionId, locale = 'es') {
  if (!SECTION_IDS.includes(sectionId)) throw new Error('Sección de análisis no válida');
  const definition = HEALTH_MONITOR_SECTIONS.find((item) => item.id === sectionId);
  const result = await RUNNERS[sectionId]({ instanceUrl: org.instanceUrl, sid, apiVersion: org.apiVersion || '63.0' });
  return { ok: true, section: { ...definition, ...localizeResult(result, locale) } };
}
