import { state } from '../core/state.js';
import { t } from '../../shared/i18n.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { formatLastModified } from './documentMeta.js';

/**
 * @typedef {object} SourceFileMeta
 * @property {string} [lastModifiedDate]
 * @property {string} [lastModifiedByName]
 * @property {string} [lastModifiedByUsername]
 */

/**
 * @param {string | null | undefined} orgId
 */
export function getOrgDisplayLabel(orgId) {
  if (!orgId) return '';
  const org = (state.orgsList || []).find((o) => o.id === orgId);
  if (!org) return String(orgId);
  try {
    return buildOrgPicklistLabel(org);
  } catch {
    return org.label || org.displayName || String(org.id || orgId);
  }
}

/**
 * @param {SourceFileMeta[]} files
 * @returns {SourceFileMeta}
 */
export function pickNewestSourceMetadata(files) {
  /** @type {SourceFileMeta} */
  let best = {};
  let bestTime = -1;
  for (const f of files || []) {
    const raw = f?.lastModifiedDate ? String(f.lastModifiedDate) : '';
    const time = raw ? new Date(raw).getTime() : NaN;
    if (!Number.isNaN(time) && time >= bestTime) {
      bestTime = time;
      best = {
        lastModifiedDate: raw,
        lastModifiedByName: String(f?.lastModifiedByName || ''),
        lastModifiedByUsername: String(f?.lastModifiedByUsername || '')
      };
    }
  }
  return best;
}

/**
 * @param {string | null | undefined} orgId
 */
export function normalizeCodeEditorOrgId(orgId) {
  return orgId != null && orgId !== '' ? String(orgId) : '';
}

/**
 * @param {Array<{ id?: string, artType?: string, name?: string, bundleName?: string, sourceOrgId?: string | null }>} tabs
 * @param {{ artType: string, artifactName: string, orgId?: string | null }} key
 */
export function findCodeEditorTabByArtifact(tabs, key) {
  const org = normalizeCodeEditorOrgId(key.orgId);
  const name = String(key.artifactName || '');
  return (
    (tabs || []).find((tab) => {
      const tabName = String(tab.bundleName || tab.name || '');
      return (
        tab.artType === key.artType &&
        tabName === name &&
        normalizeCodeEditorOrgId(tab.sourceOrgId) === org
      );
    }) || null
  );
}

/**
 * @param {string} baseName
 * @param {string | null | undefined} sourceOrgId
 */
export function formatCodeEditorTabLabel(baseName, sourceOrgId) {
  const base = String(baseName || '');
  if (!base) return base;
  if (!normalizeCodeEditorOrgId(sourceOrgId)) return base;
  const orgLabel = getOrgDisplayLabel(sourceOrgId);
  return orgLabel ? `${base} · ${orgLabel}` : base;
}

/**
 * @param {HTMLElement | null} titleEl
 * @param {string} baseTitle
 * @param {string | null | undefined} sourceOrgId
 * @param {string | null | undefined} [currentOrgId]
 */
export function renderCodeEditorToolbarTitle(titleEl, baseTitle, sourceOrgId, currentOrgId = state.leftOrgId) {
  if (!titleEl) return;
  titleEl.textContent = '';
  if (!baseTitle) return;

  const main = document.createElement('span');
  main.className = 'quick-edit-current-file-name';
  main.textContent = baseTitle;
  titleEl.appendChild(main);

  const src = sourceOrgId ? String(sourceOrgId) : '';
  if (src) {
    const orgLabel = getOrgDisplayLabel(src);
    if (orgLabel) {
      const sep = document.createElement('span');
      sep.className = 'quick-edit-title-sep';
      sep.setAttribute('aria-hidden', 'true');
      const org = document.createElement('span');
      org.className = 'quick-edit-source-org';
      org.textContent = orgLabel;
      org.title = t('codeEditor.sourceOrgHint', { org: orgLabel });
      titleEl.append(sep, org);
    }
  }
}

/**
 * @param {{
 *   titleEl: HTMLElement | null,
 *   metaEl: HTMLElement | null,
 *   title: string,
 *   meta: SourceFileMeta | null | undefined,
 *   sourceOrgId?: string | null,
 *   currentOrgId?: string | null
 * }} options
 */
export function updateCodeEditorToolbarDisplay(options) {
  const { titleEl, metaEl, title, meta, sourceOrgId, currentOrgId } = options;
  renderCodeEditorToolbarTitle(titleEl, title, sourceOrgId, currentOrgId);

  if (!metaEl) return;
  const metaText = formatLastModified(meta || {});
  if (metaText && metaText !== '—') {
    metaEl.textContent = metaText;
    metaEl.hidden = false;
    metaEl.title = metaText;
  } else {
    metaEl.textContent = '';
    metaEl.hidden = true;
    metaEl.removeAttribute('title');
  }
}
