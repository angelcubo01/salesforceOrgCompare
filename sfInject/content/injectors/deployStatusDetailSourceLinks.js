import { sfInjectT } from '../../lib/strings.js';
import { fetchActiveSavedOrgsForDeployDetail, openDeployStatusApexSource } from '../bridge.js';
import { isDeployStatusDetailInjectPage } from '../matchers/deployStatusPages.js';
import { mountDebouncedDomObserver } from './observer.js';
import {
  INTEGRATION_ID,
  extractComponentErrorRow,
  extractTestErrorRow,
  findComponentErrorsTable,
  findDetailRows,
  findDetailSectionHeaderHost,
  findTestErrorsTable,
  isDeployStatusDetailDocument,
  parseApexStackTraceFrames,
  splitTestErrorMessage
} from './deployStatusDetailSourceLinksDom.js';

function sourceError(res, lang) {
  if (res?.reason === 'NO_SID') return sfInjectT(lang, 'sfInject.deployDetailSource.noSession');
  if (res?.reason === 'ORG_NOT_SAVED') return sfInjectT(lang, 'sfInject.deployDetailSource.orgNotSaved');
  if (res?.reason === 'NOT_FOUND') return sfInjectT(lang, 'sfInject.deployDetailSource.classNotFound');
  return res?.error || sfInjectT(lang, 'sfInject.deployDetailSource.openError');
}

/** @param {Document} doc @param {{orgId: string, lang: string, onError?: (message: string) => void}} ctx */
export function mountDeployStatusDetailSourceLinks(doc, ctx) {
  let selectedOrgId = ctx.orgId || '';
  let orgs = [];
  let active = true;
  const selectorClass = 'sfoc-deploy-detail-org-select';

  const openSource = (className, initialLine) => {
    if (!selectedOrgId) {
      ctx.onError?.(sfInjectT(ctx.lang, 'sfInject.deployDetailSource.selectOrg'));
      return;
    }
    void openDeployStatusApexSource({ orgId: selectedOrgId, className, initialLine }).then((res) => {
      if (!res?.ok) ctx.onError?.(sourceError(res, ctx.lang));
    });
  };

  const createLink = (className, initialLine, label = className) => {
    const link = doc.createElement('a');
    link.className = 'sfoc-deploy-detail-source-link';
    link.setAttribute('role', 'link');
    link.tabIndex = 0;
    link.textContent = label;
    const hint = sfInjectT(ctx.lang, 'sfInject.deployDetailSource.openHint');
    link.title = hint;
    link.setAttribute('aria-label', `${className}. ${hint}`);
    const activate = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      openSource(className, initialLine);
    };
    link.addEventListener('click', activate);
    link.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && (event.ctrlKey || event.metaKey)) activate(event);
    });
    return link;
  };

  const restoreCell = (cell) => {
    const original = cell.getAttribute('data-sfoc-detail-original');
    if (original == null) return;
    cell.textContent = original;
    cell.removeAttribute('data-sfoc-detail-original');
  };

  const injectComponentLinks = (table) => {
    for (const row of findDetailRows(table)) {
      const item = extractComponentErrorRow(row);
      if (!item.isApexClass || !item.className || !item.classCell || item.classCell.hasAttribute('data-sfoc-detail-original')) continue;
      item.classCell.setAttribute('data-sfoc-detail-original', item.classCell.textContent || '');
      item.classCell.replaceChildren(createLink(item.className, item.initialLine));
    }
  };

  const injectTestLinks = (table) => {
    for (const row of findDetailRows(table)) {
      const item = extractTestErrorRow(row);
      if (item.className && item.classCell && !item.classCell.hasAttribute('data-sfoc-detail-original')) {
        item.classCell.setAttribute('data-sfoc-detail-original', item.classCell.textContent || '');
        item.classCell.replaceChildren(createLink(item.className, item.initialLine));
      }
      if (!item.stackCell || item.stackCell.hasAttribute('data-sfoc-detail-original')) continue;
      const original = item.stackCell.textContent || '';
      const frames = parseApexStackTraceFrames(original);
      if (!frames.length) continue;
      item.stackCell.setAttribute('data-sfoc-detail-original', original);
      item.stackCell.classList.add('sfoc-deploy-detail-stack');
      const detail = splitTestErrorMessage(original, frames);
      const fragment = doc.createDocumentFragment();
      if (detail.message) {
        const message = doc.createElement('div');
        message.className = 'sfoc-deploy-detail-error-message';
        message.textContent = detail.message;
        fragment.appendChild(message);
      }
      const stack = doc.createDocumentFragment();
      const traceOffset = original.length - detail.trace.length;
      let cursor = 0;
      for (const frame of frames) {
        const frameStart = frame.start - traceOffset;
        const frameEnd = frame.end - traceOffset;
        const between = detail.trace.slice(cursor, frameStart)
          .replace(/stack\s*trace\s*:/ig, '').trim();
        if (between) {
          const note = doc.createElement('div');
          note.className = 'sfoc-deploy-detail-stack-note';
          note.textContent = between;
          stack.appendChild(note);
        }
        const frameRow = doc.createElement('div');
        frameRow.className = 'sfoc-deploy-detail-stack-frame';
        frameRow.appendChild(createLink(frame.className, frame.initialLine, original.slice(frame.start, frame.end)));
        stack.appendChild(frameRow);
        cursor = frameEnd;
      }
      const tail = detail.trace.slice(cursor).replace(/stack\s*trace\s*:/ig, '').trim();
      if (tail) {
        const note = doc.createElement('div');
        note.className = 'sfoc-deploy-detail-stack-note';
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
    const select = doc.createElement('select');
    select.className = selectorClass;
    select.setAttribute('data-sfoc-inject', INTEGRATION_ID);
    select.setAttribute('aria-label', sfInjectT(ctx.lang, 'sfInject.deployDetailSource.orgLabel'));
    select.title = sfInjectT(ctx.lang, 'sfInject.deployDetailSource.orgLabel');
    if (!orgs.length) {
      const option = new Option(sfInjectT(ctx.lang, 'sfInject.deployDetailSource.noOrgs'), '');
      select.appendChild(option);
      select.disabled = true;
      return select;
    }
    if (!selectedOrgId) select.appendChild(new Option(sfInjectT(ctx.lang, 'sfInject.deployDetailSource.chooseOrg'), ''));
    for (const org of orgs) select.appendChild(new Option(org.label, org.id));
    select.value = selectedOrgId;
    select.addEventListener('change', () => {
      selectedOrgId = select.value || '';
      syncSelects();
    });
    return select;
  };

  const injectSelectors = () => {
    for (const table of [findComponentErrorsTable(doc), findTestErrorsTable(doc)].filter(Boolean)) {
      const host = findDetailSectionHeaderHost(table);
      if (!host || host.querySelector(`[data-sfoc-inject="${INTEGRATION_ID}"]`)) continue;
      const wrap = doc.createElement('span');
      wrap.className = 'sfoc-deploy-detail-org-picker';
      wrap.setAttribute('data-sfoc-inject', INTEGRATION_ID);
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
    if (!orgs.some((org) => org.id === selectedOrgId)) selectedOrgId = orgs.some((org) => org.id === ctx.orgId) ? ctx.orgId : '';
    doc.querySelectorAll(`[data-sfoc-inject="${INTEGRATION_ID}"]`).forEach((node) => node.remove());
    if (active) inject();
  };

  const onStorageChanged = (changes, area) => {
    if (area === 'sync' && (changes.savedOrgs || changes.savedOrgOrder || changes.orgAliases || changes.orgGroups)) void loadOrgs();
  };
  chrome.storage.onChanged.addListener(onStorageChanged);
  void loadOrgs();
  const stopObserver = mountDebouncedDomObserver(doc, inject, { debounceMs: 250, cooldownMs: 30 });
  return () => {
    active = false;
    stopObserver();
    chrome.storage.onChanged.removeListener(onStorageChanged);
    doc.querySelectorAll('[data-sfoc-detail-original]').forEach(restoreCell);
    doc.querySelectorAll(`[data-sfoc-inject="${INTEGRATION_ID}"]`).forEach((node) => node.remove());
  };
}

function isParentDeployStatusDetailPage() {
  try { return isDeployStatusDetailInjectPage(window.top.location.href); } catch { return isDeployStatusDetailInjectPage(location.href); }
}

export const deployStatusDetailSourceLinksIntegration = {
  id: INTEGRATION_ID,
  requiresSavedOrg: false,
  isParentPageActive: isParentDeployStatusDetailPage,
  isFrameRelevant: isDeployStatusDetailDocument,
  mount: mountDeployStatusDetailSourceLinks,
  retryInject(doc) { return isDeployStatusDetailDocument(doc); }
};
