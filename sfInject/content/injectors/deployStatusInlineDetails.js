import { sfInjectT } from '../../lib/strings.js';
import { isDeployStatusInjectPage } from '../matchers/deployStatusPages.js';
import { fetchActiveSavedOrgsForDeployDetail, fetchDeployStatusInlineDetail, openDeployStatusApexSource } from '../bridge.js';
import { mountDebouncedDomObserver } from './observer.js';
import {
  INTEGRATION_ID,
  buildDeployDetailModel,
  deployRowColspan,
  extractApexClassAndLineFromStackTrace,
  extractDeployAsyncIdFromRow,
  findDeployActionCell,
  findFailedDeploymentRows,
  isApexClassComponent,
  isDeployStatusTableDocument,
  parseApexStackTraceFrames
} from './deployStatusInlineDetailsDom.js';

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function sectionTitle(doc, text) {
  return el(doc, 'h3', 'sfoc-deploy-inline-title', text);
}

function appendCell(row, value, className = '') {
  row.appendChild(el(row.ownerDocument, 'td', className, value == null || value === '' ? '\u2014' : value));
}

function appendTable(doc, headers, rows) {
  const table = el(doc, 'table', 'sfoc-deploy-inline-table');
  const thead = doc.createElement('thead');
  const hr = doc.createElement('tr');
  headers.forEach((header) => hr.appendChild(el(doc, 'th', '', header)));
  thead.appendChild(hr);
  const tbody = doc.createElement('tbody');
  rows.forEach((row) => tbody.appendChild(row));
  table.append(thead, tbody);
  return table;
}

function errorText(res, lang) {
  if (res?.reason === 'NO_SID') return sfInjectT(lang, 'sfInject.deployStatus.errorNoSession');
  if (res?.reason === 'ORG_NOT_SAVED') return sfInjectT(lang, 'sfInject.deployStatus.errorOrgNotSaved');
  return res?.error || sfInjectT(lang, 'sfInject.deployStatus.errorLoad');
}

function sourceError(res, lang) {
  if (res?.reason === 'NO_SID') return sfInjectT(lang, 'sfInject.deployDetailSource.noSession');
  if (res?.reason === 'ORG_NOT_SAVED') return sfInjectT(lang, 'sfInject.deployDetailSource.orgNotSaved');
  if (res?.reason === 'NOT_FOUND') return sfInjectT(lang, 'sfInject.deployDetailSource.classNotFound');
  return res?.error || sfInjectT(lang, 'sfInject.deployDetailSource.openError');
}

function validLine(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** @param {Document} doc @param {{ orgId: string, lang: string, onError?: (message: string) => void }} ctx @param {{ selectedOrgId: string, orgs: Array<{id: string, label: string}>, syncSelects: () => void }} sourceState */
function createRenderer(doc, ctx, sourceState) {
  const apexHint = sfInjectT(ctx.lang, 'sfInject.deployDetailSource.openHint');

  const apexLink = (className, initialLine, label = className) => {
    const link = el(doc, 'a', 'sfoc-deploy-inline-apex', label);
    link.href = '#';
    link.title = apexHint;
    link.setAttribute('aria-label', `${className}. ${apexHint}`);
    link.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!event.ctrlKey && !event.metaKey) return;
      if (!sourceState.selectedOrgId) {
        ctx.onError?.(sfInjectT(ctx.lang, 'sfInject.deployDetailSource.selectOrg'));
        return;
      }
      void openDeployStatusApexSource({ orgId: sourceState.selectedOrgId, className, initialLine }).then((res) => {
        if (!res?.ok) ctx.onError?.(sourceError(res, ctx.lang));
      });
    });
    return link;
  };

  const createOrgSelect = () => {
    const select = el(doc, 'select', 'sfoc-deploy-inline-org-select');
    select.setAttribute('aria-label', sfInjectT(ctx.lang, 'sfInject.deployDetailSource.orgLabel'));
    select.title = sfInjectT(ctx.lang, 'sfInject.deployDetailSource.orgLabel');
    if (!sourceState.orgs.length) {
      select.appendChild(new Option(sfInjectT(ctx.lang, 'sfInject.deployDetailSource.noOrgs'), ''));
      select.disabled = true;
      return select;
    }
    if (!sourceState.selectedOrgId) select.appendChild(new Option(sfInjectT(ctx.lang, 'sfInject.deployDetailSource.chooseOrg'), ''));
    for (const org of sourceState.orgs) select.appendChild(new Option(org.label, org.id));
    select.value = sourceState.selectedOrgId;
    select.addEventListener('change', () => {
      sourceState.selectedOrgId = select.value || '';
      sourceState.syncSelects();
    });
    return select;
  };

  const appendStackTraceCell = (row, value, fallbackClassName) => {
    const cell = el(doc, 'td', 'sfoc-deploy-inline-stack');
    const trace = String(value || '');
    const frames = parseApexStackTraceFrames(trace);
    if (!frames.length) {
      if (fallbackClassName && trace) cell.appendChild(apexLink(fallbackClassName, undefined, trace));
      else cell.textContent = trace || '\u2014';
      row.appendChild(cell);
      return;
    }
    let cursor = 0;
    for (const frame of frames) {
      cell.append(trace.slice(cursor, frame.start));
      cell.appendChild(apexLink(frame.className, frame.initialLine, trace.slice(frame.start, frame.end)));
      cursor = frame.end;
    }
    cell.append(trace.slice(cursor));
    row.appendChild(cell);
  };

  return (panel, model) => {
    panel.replaceChildren();
    const sourcePicker = el(doc, 'div', 'sfoc-deploy-inline-org-picker');
    sourcePicker.appendChild(el(doc, 'span', 'sfoc-deploy-inline-org-label', sfInjectT(ctx.lang, 'sfInject.deployDetailSource.orgLabel')));
    sourcePicker.appendChild(createOrgSelect());
    panel.appendChild(sourcePicker);

    const hasComponents = model.componentFailures.length > 0;
    const hasTests = model.testFailures.length > 0;
    if (hasComponents) {
      panel.appendChild(sectionTitle(doc, sfInjectT(ctx.lang, 'sfInject.deployStatus.components')));
      const rows = model.componentFailures.map((failure) => {
        const row = doc.createElement('tr');
        if (isApexClassComponent(failure.componentType) && failure.fullName) {
          const cell = doc.createElement('td');
          cell.appendChild(apexLink(failure.fullName, validLine(failure.lineNumber)));
          row.appendChild(cell);
        } else appendCell(row, failure.fullName);
        appendCell(row, failure.componentType);
        appendCell(row, failure.lineNumber);
        appendCell(row, failure.columnNumber);
        const secondary = [failure.problemType, failure.fileName].filter(Boolean).join(' \u00b7 ');
        const messageCell = el(doc, 'td', '', failure.problem || '\u2014');
        if (secondary) messageCell.appendChild(el(doc, 'div', 'sfoc-deploy-inline-secondary', secondary));
        row.appendChild(messageCell);
        return row;
      });
      panel.appendChild(appendTable(doc, [
        sfInjectT(ctx.lang, 'sfInject.deployStatus.apiName'), sfInjectT(ctx.lang, 'sfInject.deployStatus.type'),
        sfInjectT(ctx.lang, 'sfInject.deployStatus.line'), sfInjectT(ctx.lang, 'sfInject.deployStatus.column'),
        sfInjectT(ctx.lang, 'sfInject.deployStatus.errorMessage')
      ], rows));
    }
    if (hasTests) {
      panel.appendChild(sectionTitle(doc, sfInjectT(ctx.lang, 'sfInject.deployStatus.tests')));
      const rows = model.testFailures.map((failure) => {
        const row = doc.createElement('tr');
        const pos = extractApexClassAndLineFromStackTrace(failure.stackTrace);
        const className = failure.className || pos.className;
        const classFrame = parseApexStackTraceFrames(failure.stackTrace).find((frame) => frame.className === className);
        const initialLine = classFrame?.initialLine || pos.initialLine;
        if (className) {
          const cell = doc.createElement('td');
          cell.appendChild(apexLink(className, initialLine));
          row.appendChild(cell);
        } else appendCell(row, '');
        if (className && failure.methodName) {
          const cell = doc.createElement('td');
          cell.appendChild(apexLink(className, initialLine, failure.methodName));
          row.appendChild(cell);
        } else appendCell(row, failure.methodName);
        appendCell(row, failure.message);
        appendStackTraceCell(row, failure.stackTrace, className);
        appendCell(row, failure.time);
        return row;
      });
      panel.appendChild(appendTable(doc, [
        sfInjectT(ctx.lang, 'sfInject.deployStatus.apexClass'), sfInjectT(ctx.lang, 'sfInject.deployStatus.testMethod'),
        sfInjectT(ctx.lang, 'sfInject.deployStatus.errorMessage'), sfInjectT(ctx.lang, 'sfInject.deployStatus.stackTrace'),
        sfInjectT(ctx.lang, 'sfInject.deployStatus.time')
      ], rows));
    }
    if (model.errorMessage) panel.append(sectionTitle(doc, sfInjectT(ctx.lang, 'sfInject.deployStatus.globalError')), el(doc, 'div', 'sfoc-deploy-inline-message', model.errorMessage));
    if (model.coverageWarnings.length) panel.append(sectionTitle(doc, sfInjectT(ctx.lang, 'sfInject.deployStatus.coverageWarnings')), el(doc, 'div', 'sfoc-deploy-inline-message', model.coverageWarnings.join(' \u00b7 ')));
    if (!hasComponents && !hasTests && !model.errorMessage && !model.coverageWarnings.length) panel.appendChild(el(doc, 'div', 'sfoc-deploy-inline-empty', sfInjectT(ctx.lang, 'sfInject.deployStatus.empty')));
  };
}

/** @param {Document} doc @param {{ orgId: string, lang: string, onError?: (message: string) => void }} ctx */
export function mountDeployStatusInlineDetails(doc, ctx) {
  const openIds = new Set();
  const detailCache = new Map();
  const renderedDetails = new Map();
  const sourceState = {
    selectedOrgId: ctx.orgId || '',
    orgs: [],
    syncSelects() {
      for (const select of doc.querySelectorAll('select.sfoc-deploy-inline-org-select')) select.value = sourceState.selectedOrgId;
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
    const detailRow = doc.createElement('tr');
    detailRow.id = detailIdFor(asyncId);
    detailRow.className = 'sfoc-deploy-inline-detail-row';
    detailRow.setAttribute('data-sfoc-inject', INTEGRATION_ID);
    detailRow.setAttribute('data-sfoc-async-id', asyncId);
    const cell = doc.createElement('td');
    cell.colSpan = deployRowColspan(row);
    const panel = el(doc, 'div', 'sfoc-deploy-inline-panel');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-live', 'polite');
    panel.appendChild(el(doc, 'div', 'sfoc-deploy-inline-loading', sfInjectT(ctx.lang, 'sfInject.deployStatus.loading')));
    cell.appendChild(panel);
    detailRow.appendChild(cell);
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
      panel.appendChild(el(doc, 'div', 'sfoc-deploy-inline-error', errorText(res, ctx.lang)));
      const retry = el(doc, 'button', 'sfoc-deploy-inline-retry', sfInjectT(ctx.lang, 'sfInject.deployStatus.retry'));
      retry.type = 'button';
      retry.addEventListener('click', () => void showDetail(row, asyncId));
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
    if (!sourceState.orgs.some((org) => org.id === sourceState.selectedOrgId)) sourceState.selectedOrgId = '';
    if (!mounted) return;
    for (const { panel, model } of renderedDetails.values()) {
      if (panel.isConnected) renderDetail(panel, model);
    }
  };

  const onStorageChanged = (changes, area) => {
    if (area === 'sync' && (changes.savedOrgs || changes.savedOrgOrder || changes.orgAliases || changes.orgGroups)) void loadSourceOrgs();
  };
  chrome.storage.onChanged.addListener(onStorageChanged);
  void loadSourceOrgs();

  const inject = () => {
    for (const row of findFailedDeploymentRows(doc)) {
      const asyncId = extractDeployAsyncIdFromRow(row);
      const cell = findDeployActionCell(row);
      if (!asyncId || !cell || cell.querySelector(`[data-sfoc-inject="${INTEGRATION_ID}"]`)) continue;
      const button = el(doc, 'button', 'sfoc-deploy-inline-toggle');
      button.type = 'button';
      button.setAttribute('data-sfoc-inject', INTEGRATION_ID);
      button.setAttribute('data-sfoc-async-id', asyncId);
      button.setAttribute('aria-controls', detailIdFor(asyncId));
      button.setAttribute('aria-expanded', openIds.has(asyncId) ? 'true' : 'false');
      button.setAttribute('aria-label', sfInjectT(ctx.lang, openIds.has(asyncId) ? 'sfInject.deployStatus.toggleClose' : 'sfInject.deployStatus.toggleOpen'));
      button.title = button.getAttribute('aria-label') || '';
      button.addEventListener('click', () => {
        if (openIds.has(asyncId)) {
          openIds.delete(asyncId);
          removeDetail(asyncId);
          button.setAttribute('aria-expanded', 'false');
          button.setAttribute('aria-label', sfInjectT(ctx.lang, 'sfInject.deployStatus.toggleOpen'));
          button.title = button.getAttribute('aria-label') || '';
        } else {
          openIds.add(asyncId);
          button.setAttribute('aria-expanded', 'true');
          button.setAttribute('aria-label', sfInjectT(ctx.lang, 'sfInject.deployStatus.toggleClose'));
          button.title = button.getAttribute('aria-label') || '';
          void showDetail(row, asyncId);
        }
      });
      cell.prepend(button);
      if (openIds.has(asyncId)) void showDetail(row, asyncId);
    }
  };

  const stopObserver = mountDebouncedDomObserver(doc, inject, { debounceMs: 250, cooldownMs: 30 });
  return () => {
    mounted = false;
    stopObserver();
    chrome.storage.onChanged.removeListener(onStorageChanged);
    renderedDetails.clear();
    doc.querySelectorAll(`[data-sfoc-inject="${INTEGRATION_ID}"]`).forEach((node) => node.remove());
  };
}

function isParentDeployStatusPage() {
  try { return isDeployStatusInjectPage(window.top.location.href); } catch { return isDeployStatusInjectPage(location.href); }
}

export const deployStatusInlineDetailsIntegration = {
  id: INTEGRATION_ID,
  isParentPageActive: isParentDeployStatusPage,
  isFrameRelevant: isDeployStatusTableDocument,
  mount: mountDeployStatusInlineDetails,
  retryInject(doc) {
    return isDeployStatusTableDocument(doc);
  }
};
