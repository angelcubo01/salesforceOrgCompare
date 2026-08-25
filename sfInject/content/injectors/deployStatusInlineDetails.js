import { sfInjectT } from '../../lib/strings.js';
import { isDeployStatusInjectPage } from '../matchers/deployStatusPages.js';
import { fetchDeployStatusInlineDetail, openDeployStatusApexSource } from '../bridge.js';
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
  isDeployStatusTableDocument
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
  row.appendChild(el(row.ownerDocument, 'td', className, value || '—'));
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

function validLine(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** @param {Document} doc @param {{ orgId: string, lang: string, onError?: (message: string) => void }} ctx */
function createRenderer(doc, ctx) {
  const apexHint = sfInjectT(ctx.lang, 'sfInject.deployStatus.openApex');

  const apexLink = (className, initialLine) => {
    const link = el(doc, 'a', 'sfoc-deploy-inline-apex', className);
    link.href = '#';
    link.title = apexHint;
    link.setAttribute('aria-label', `${className}. ${apexHint}`);
    link.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!event.ctrlKey && !event.metaKey) return;
      void openDeployStatusApexSource({ orgId: ctx.orgId, className, initialLine }).then((res) => {
        if (!res?.ok) ctx.onError?.(errorText(res, ctx.lang).replace(sfInjectT(ctx.lang, 'sfInject.deployStatus.errorLoad'), sfInjectT(ctx.lang, 'sfInject.deployStatus.errorOpenApex')));
      });
    });
    return link;
  };

  return (panel, model) => {
    panel.replaceChildren();
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
        const message = failure.problem;
        const secondary = [failure.problemType, failure.fileName].filter(Boolean).join(' · ');
        const messageCell = el(doc, 'td', '', message || '—');
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
        if (className) {
          const cell = doc.createElement('td');
          cell.appendChild(apexLink(className, pos.initialLine));
          row.appendChild(cell);
        } else appendCell(row, '');
        appendCell(row, failure.methodName);
        appendCell(row, failure.message);
        appendCell(row, failure.stackTrace, 'sfoc-deploy-inline-stack');
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
    if (model.coverageWarnings.length) panel.append(sectionTitle(doc, sfInjectT(ctx.lang, 'sfInject.deployStatus.coverageWarnings')), el(doc, 'div', 'sfoc-deploy-inline-message', model.coverageWarnings.join(' · ')));
    if (!hasComponents && !hasTests && !model.errorMessage && !model.coverageWarnings.length) panel.appendChild(el(doc, 'div', 'sfoc-deploy-inline-empty', sfInjectT(ctx.lang, 'sfInject.deployStatus.empty')));
  };
}

/** @param {Document} doc @param {{ orgId: string, lang: string, onError?: (message: string) => void }} ctx */
export function mountDeployStatusInlineDetails(doc, ctx) {
  const openIds = new Set();
  const detailCache = new Map();
  const renderDetail = createRenderer(doc, ctx);
  let mounted = true;

  const detailIdFor = (asyncId) => `sfoc-deploy-inline-detail-${asyncId}`;
  const removeDetail = (asyncId) => doc.getElementById(detailIdFor(asyncId))?.remove();

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
      detailCache.delete(asyncId); // Los errores se pueden reintentar.
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
    renderDetail(panel, buildDeployDetailModel(res.detail));
  };

  const inject = () => {
    for (const row of findFailedDeploymentRows(doc)) {
      const asyncId = extractDeployAsyncIdFromRow(row);
      const cell = findDeployActionCell(row);
      if (!asyncId || !cell || cell.querySelector(`[data-sfoc-inject="${INTEGRATION_ID}"]`)) continue;
      const button = el(doc, 'button', 'sfoc-deploy-inline-toggle', '›');
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
          button.textContent = '›';
          button.setAttribute('aria-expanded', 'false');
          button.setAttribute('aria-label', sfInjectT(ctx.lang, 'sfInject.deployStatus.toggleOpen'));
        } else {
          openIds.add(asyncId);
          button.textContent = '⌄';
          button.setAttribute('aria-expanded', 'true');
          button.setAttribute('aria-label', sfInjectT(ctx.lang, 'sfInject.deployStatus.toggleClose'));
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
    // El observer de mount cubre AJAX; el host mantiene este hook para el retry común.
    return isDeployStatusTableDocument(doc);
  }
};
