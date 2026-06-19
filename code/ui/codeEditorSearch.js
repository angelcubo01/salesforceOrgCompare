import { state } from '../core/state.js';
import { t } from '../../shared/i18n.js';
import { formatMetadataDate } from './documentMeta.js';
import {
  capMetadataResults,
  fillBreadcrumbWithMeta,
  kickSilentIndexBuild,
  metadataSearchItemClasses,
  MIN_METADATA_CHARS,
  normalizeQueryLocal,
  resolveCodeEditorMatches,
  sanitizeApiPrefix
} from '../lib/metadataSearch.js';
import {
  getMetadataSearchLoadingMessage,
  renderSearchLoadingSpinner
} from './searchLoadingUi.js';

/**
 * @param {HTMLElement} resultsEl
 * @param {'status'|'empty'} kind
 * @param {string} message
 */
function renderStatusMessage(resultsEl, kind, message) {
  resultsEl.innerHTML = '';
  const p = document.createElement('p');
  p.className = kind === 'status' ? 'quick-open-status' : 'quick-open-empty';
  p.textContent = message;
  resultsEl.appendChild(p);
  resultsEl.hidden = false;
}

/**
 * @param {HTMLElement} resultsEl
 * @param {string} message
 */
function renderLoading(resultsEl, message) {
  renderSearchLoadingSpinner(resultsEl, message);
  resultsEl.hidden = false;
}

/**
 * @param {HTMLElement} anchorEl
 * @param {HTMLElement} resultsEl
 */
function positionResultsDropdown(anchorEl, resultsEl) {
  if (!anchorEl || !resultsEl || resultsEl.hidden) return;
  if (resultsEl.parentElement !== document.body) {
    document.body.appendChild(resultsEl);
  }
  const rect = anchorEl.getBoundingClientRect();
  const gap = 4;
  const maxH = Math.min(360, Math.max(120, window.innerHeight - rect.bottom - gap - 16));
  resultsEl.style.position = 'fixed';
  resultsEl.style.top = `${rect.bottom + gap}px`;
  resultsEl.style.left = `${rect.left}px`;
  resultsEl.style.width = `${rect.width}px`;
  resultsEl.style.maxHeight = `${maxH}px`;
  resultsEl.style.zIndex = '10050';
}

/**
 * @param {HTMLElement} resultsEl
 * @param {import('../lib/metadataSearch.js').MetadataSearchEntry[]} metadata
 * @param {(entry: import('../lib/metadataSearch.js').MetadataSearchEntry) => void} onSelect
 * @param {number} activeIndex
 * @returns {number}
 */
export function renderCodeEditorSearchResults(resultsEl, metadata, onSelect, activeIndex = -1) {
  resultsEl.innerHTML = '';
  if (!metadata.length) {
    renderStatusMessage(resultsEl, 'empty', t('quickOpen.noResults'));
    return -1;
  }

  const frag = document.createDocumentFragment();
  let idx = 0;
  for (const entry of metadata) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = metadataSearchItemClasses(entry.artType);
    if (idx === activeIndex) btn.classList.add('is-active');
    btn.setAttribute('role', 'option');
    const crumbs = document.createElement('span');
    crumbs.className = 'quick-open-crumbs';
    const dateLabel = entry.lastModifiedDate ? formatMetadataDate(entry.lastModifiedDate) : '';
    fillBreadcrumbWithMeta(crumbs, t(entry.categoryKey), entry.name, dateLabel);
    btn.appendChild(crumbs);
    btn.addEventListener('click', () => onSelect(entry));
    frag.appendChild(btn);
    idx += 1;
  }
  resultsEl.appendChild(frag);
  resultsEl.hidden = false;
  return activeIndex;
}

/**
 * @param {object} options
 * @param {HTMLInputElement} options.inputEl
 * @param {HTMLElement} options.resultsEl
 * @param {HTMLElement} [options.anchorEl]
 * @param {string[]} options.artTypes
 * @param {(entry: import('../lib/metadataSearch.js').MetadataSearchEntry) => void} options.onSelect
 * @param {number} [options.minChars]
 * @param {number} [options.maxResults]
 * @param {() => string | null | undefined} [options.getOrgId]
 */
export function setupCodeEditorSearch(options) {
  const {
    inputEl,
    resultsEl,
    anchorEl = inputEl.closest('.quick-edit-search-bar') || inputEl,
    artTypes,
    onSelect,
    minChars = MIN_METADATA_CHARS,
    maxResults = 50,
    getOrgId = () => state.leftOrgId
  } = options;

  let searchGeneration = 0;
  let activeResultIndex = -1;
  let debounceTimer = null;

  resultsEl.classList.add('code-editor-search-results', 'sidebar-search-results', 'sfoc-autocomplete-panel');

  function hideResults() {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    activeResultIndex = -1;
  }

  function highlightActive() {
    const items = resultsEl.querySelectorAll('.quick-open-item');
    items.forEach((el, i) => el.classList.toggle('is-active', i === activeResultIndex));
    const active = items[activeResultIndex];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function selectActiveOrFirst() {
    const items = resultsEl.querySelectorAll('.quick-open-item');
    if (!items.length) return;
    const idx = activeResultIndex >= 0 ? activeResultIndex : 0;
    items[idx]?.click();
  }

  async function runSearch() {
    const gen = ++searchGeneration;
    const queryLocal = normalizeQueryLocal(inputEl.value);
    const apiPrefix = sanitizeApiPrefix(inputEl.value);

    if (!queryLocal) {
      hideResults();
      return;
    }

    const orgId = getOrgId();
    if (!orgId) {
      renderStatusMessage(resultsEl, 'status', t('quickOpen.noAuth'));
      positionResultsDropdown(anchorEl, resultsEl);
      return;
    }

    if (queryLocal.length < minChars) {
      renderStatusMessage(resultsEl, 'empty', t('quickEdit.minChars'));
      positionResultsDropdown(anchorEl, resultsEl);
      return;
    }

    kickSilentIndexBuild(orgId);
    renderLoading(resultsEl, getMetadataSearchLoadingMessage(orgId));
    positionResultsDropdown(anchorEl, resultsEl);

    try {
      const metadata = await resolveCodeEditorMatches(orgId, queryLocal, apiPrefix, artTypes);
      if (gen !== searchGeneration) return;
      const capped = capMetadataResults(metadata, maxResults);
      activeResultIndex = -1;
      renderCodeEditorSearchResults(resultsEl, capped, (entry) => {
        onSelect(entry);
        hideResults();
        inputEl.value = '';
      });
      positionResultsDropdown(anchorEl, resultsEl);
    } catch {
      if (gen !== searchGeneration) return;
      renderStatusMessage(resultsEl, 'empty', t('quickEdit.searchError'));
      positionResultsDropdown(anchorEl, resultsEl);
    }
  }

  inputEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void runSearch(), 200);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const count = resultsEl.querySelectorAll('.quick-open-item').length;
      if (!count) return;
      activeResultIndex = activeResultIndex < count - 1 ? activeResultIndex + 1 : 0;
      highlightActive();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const count = resultsEl.querySelectorAll('.quick-open-item').length;
      if (!count) return;
      activeResultIndex = activeResultIndex > 0 ? activeResultIndex - 1 : count - 1;
      highlightActive();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimer);
      if (resultsEl.hidden || !resultsEl.childElementCount) {
        void runSearch();
      } else {
        selectActiveOrFirst();
      }
      return;
    }
    if (e.key === 'Escape') {
      hideResults();
    }
  });

  inputEl.addEventListener('focus', () => {
    if (normalizeQueryLocal(inputEl.value).length >= minChars) {
      void runSearch();
    }
  });

  document.addEventListener('click', (e) => {
    const zone = inputEl.closest('.quick-edit-search-zone');
    if (zone && !zone.contains(/** @type {Node} */ (e.target)) && !resultsEl.contains(/** @type {Node} */ (e.target))) {
      hideResults();
    }
  });

  window.addEventListener('resize', () => {
    if (!resultsEl.hidden) positionResultsDropdown(anchorEl, resultsEl);
  });
  window.addEventListener('scroll', () => {
    if (!resultsEl.hidden) positionResultsDropdown(anchorEl, resultsEl);
  }, true);

  return { runSearch, hideResults };
}
