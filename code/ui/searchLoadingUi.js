import { t } from '../../shared/i18n.js';
import { isNameIndexReady } from '../lib/metadataSearch.js';

/** @param {string | null | undefined} orgId */
export function getMetadataSearchLoadingMessage(orgId) {
  return !isNameIndexReady(orgId) ? t('quickOpen.loadingIndex') : t('quickOpen.searching');
}

/**
 * Fila de carga con spinner (mismo aspecto que el buscador del comparador).
 * @param {HTMLElement} container
 * @param {string} message
 * @param {{ onShow?: () => void }} [opts]
 */
export function renderSearchLoadingSpinner(container, message, opts = {}) {
  container.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'sidebar-search-loading-item';
  row.setAttribute('role', 'status');
  row.setAttribute('aria-live', 'polite');
  const spinner = document.createElement('span');
  spinner.className = 'sidebar-search-loading-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'sidebar-search-loading-text';
  text.textContent = message;
  row.append(spinner, text);
  container.appendChild(row);
  if (typeof opts.onShow === 'function') opts.onShow();
}
