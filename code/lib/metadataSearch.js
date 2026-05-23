import { bg } from '../core/bridge.js';

export const MIN_METADATA_CHARS = 1;

/** @type {{ artType: string, navTool: string, categoryKey: string, isBundle?: boolean }[]} */
export const METADATA_SEARCH_SPECS = [
  { artType: 'ApexClass', navTool: 'Apex', categoryKey: 'quickOpen.catApexClass' },
  { artType: 'ApexTrigger', navTool: 'Apex', categoryKey: 'quickOpen.catApexTrigger' },
  { artType: 'ApexPage', navTool: 'VF', categoryKey: 'quickOpen.catApexPage' },
  { artType: 'ApexComponent', navTool: 'VF', categoryKey: 'quickOpen.catApexComponent' },
  { artType: 'LWC', navTool: 'LWC', categoryKey: 'quickOpen.catLwc', isBundle: true },
  { artType: 'Aura', navTool: 'Aura', categoryKey: 'quickOpen.catAura', isBundle: true },
  { artType: 'PermissionSet', navTool: 'PermissionSet', categoryKey: 'quickOpen.catPermSet' },
  { artType: 'Profile', navTool: 'Profile', categoryKey: 'quickOpen.catProfile' },
  { artType: 'FlexiPage', navTool: 'FlexiPage', categoryKey: 'quickOpen.catFlexi' }
];

const SPEC_BY_ART_TYPE = Object.fromEntries(METADATA_SEARCH_SPECS.map((s) => [s.artType, s]));

/** Slug CSS por tipo de metadata (`quick-open-item--meta-{slug}`). */
export const METADATA_ART_TYPE_SLUG = {
  ApexClass: 'apex-class',
  ApexTrigger: 'apex-trigger',
  ApexPage: 'apex-page',
  ApexComponent: 'apex-component',
  LWC: 'lwc',
  Aura: 'aura',
  PermissionSet: 'perm-set',
  Profile: 'profile',
  FlexiPage: 'flexipage'
};

/**
 * Clases de fila de resultado (Quick Open y buscador Comparador).
 * @param {string} artType
 */
export function metadataSearchItemClasses(artType) {
  const slug = METADATA_ART_TYPE_SLUG[artType] || 'generic';
  return `quick-open-item quick-open-item--meta-${slug}`;
}

/** Clave i18n de la etiqueta del tipo en el buscador (p. ej. «Clases Apex»). */
export function metadataTypeLabelKey(artType) {
  return SPEC_BY_ART_TYPE[artType]?.categoryKey ?? null;
}

/** Clave i18n del título contextual sobre los selectores de org (singular). */
export const METADATA_CONTEXT_TITLE_I18N = {
  ApexClass: 'code.compareContext.apexClass',
  ApexTrigger: 'code.compareContext.apexTrigger',
  ApexPage: 'code.compareContext.apexPage',
  ApexComponent: 'code.compareContext.apexComponent',
  LWC: 'code.compareContext.lwc',
  Aura: 'code.compareContext.aura',
  PermissionSet: 'code.compareContext.permSet',
  Profile: 'code.compareContext.profile',
  FlexiPage: 'code.compareContext.flexipage'
};

export function metadataContextTitleKey(artType) {
  return METADATA_CONTEXT_TITLE_I18N[artType] ?? null;
}

/** Herramientas de comparación cubiertas por el índice de metadatos. */
export const COMPARE_TOOLS_COVERED_BY_METADATA = new Set(
  METADATA_SEARCH_SPECS.map((s) => s.navTool)
);

/** @typedef {{ artType: string, navTool: string, categoryKey: string, isBundle?: boolean, name: string, id?: string, searchHay: string }} MetadataSearchEntry */

let indexBuildGeneration = 0;

/** @type {{ orgId: string | null, loading: boolean, ready: boolean, entries: MetadataSearchEntry[] }} */
let nameIndex = {
  orgId: null,
  loading: false,
  ready: false,
  entries: []
};

export function normalizeQueryLocal(raw) {
  return String(raw || '')
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, 120)
    .toLowerCase();
}

export function sanitizeApiPrefix(raw) {
  let prefix = String(raw || '').trim();
  if (prefix.length > 64) prefix = prefix.slice(0, 64);
  return prefix.replace(/[\u0000-\u001F\u007F]/g, '');
}

/**
 * @param {HTMLElement} crumbs
 * @param {string} groupLabel
 * @param {string} name
 */
export function fillBreadcrumb(crumbs, groupLabel, name) {
  crumbs.innerHTML = '';
  const g = document.createElement('span');
  g.className = 'quick-open-crumb-group';
  g.textContent = groupLabel;
  const sep = document.createElement('span');
  sep.className = 'quick-open-crumb-sep';
  sep.setAttribute('aria-hidden', 'true');
  sep.textContent = '›';
  const n = document.createElement('span');
  n.className = 'quick-open-crumb-name';
  n.textContent = name;
  crumbs.append(g, sep, n);
}

/**
 * @param {Record<string, unknown>[]} items
 * @returns {MetadataSearchEntry[]}
 */
export function mapApiIndexToEntries(items) {
  /** @type {MetadataSearchEntry[]} */
  const out = [];
  for (const row of items) {
    const artType = String(row.artifactType || row.type || '');
    const spec = SPEC_BY_ART_TYPE[artType];
    if (!spec) continue;
    if (spec.isBundle) {
      const name = String(row.developerName || '');
      if (!name) continue;
      out.push({
        artType: spec.artType,
        navTool: spec.navTool,
        categoryKey: spec.categoryKey,
        isBundle: true,
        name,
        id: row.id != null ? String(row.id) : undefined,
        searchHay: name.toLowerCase()
      });
      continue;
    }
    const name = String(row.name || '');
    if (!name) continue;
    out.push({
      artType: spec.artType,
      navTool: spec.navTool,
      categoryKey: spec.categoryKey,
      name,
      searchHay: name.toLowerCase()
    });
  }
  return out;
}

function resetNameIndex() {
  nameIndex = { orgId: null, loading: false, ready: false, entries: [] };
}

function waitForNameIndex() {
  return new Promise((resolve) => {
    const tick = () => {
      if (!nameIndex.loading) {
        resolve(undefined);
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

/** Carga todos los nombres de la org (silencioso, en segundo plano). */
export async function ensureNameIndex(orgId) {
  if (!orgId) return;
  if (nameIndex.orgId === orgId && nameIndex.ready) return;
  if (nameIndex.orgId === orgId && nameIndex.loading) {
    await waitForNameIndex();
    return;
  }

  const gen = ++indexBuildGeneration;
  nameIndex = { orgId, loading: true, ready: false, entries: [] };

  try {
    const res = await bg({ type: 'quickOpen:buildIndex', orgId });
    if (gen !== indexBuildGeneration) return;
    if (res?.ok && Array.isArray(res.items)) {
      nameIndex.entries = mapApiIndexToEntries(res.items);
      nameIndex.ready = true;
    }
  } catch {
    if (gen === indexBuildGeneration) resetNameIndex();
  } finally {
    if (gen === indexBuildGeneration) nameIndex.loading = false;
  }
}

/**
 * @param {string} orgId
 * @param {() => void} [onIndexReady]
 */
export function kickSilentIndexBuild(orgId, onIndexReady) {
  if (!orgId) return;
  if (nameIndex.orgId === orgId && nameIndex.ready) {
    if (typeof onIndexReady === 'function') onIndexReady();
    return;
  }
  if (nameIndex.orgId !== orgId || !nameIndex.loading) {
    nameIndex = { orgId, loading: true, ready: false, entries: [] };
  }
  void ensureNameIndex(orgId).then(() => {
    if (typeof onIndexReady === 'function') onIndexReady();
  });
}

/** @param {string} orgId */
export function isNameIndexReady(orgId) {
  return !!orgId && nameIndex.orgId === orgId && nameIndex.ready;
}

/** @param {string} orgId */
export function isNameIndexLoading(orgId) {
  return !!orgId && nameIndex.orgId === orgId && nameIndex.loading;
}

function filterMetadataFromIndex(query) {
  if (!query || !nameIndex.ready) return [];
  return nameIndex.entries.filter((e) => e.searchHay.includes(query));
}

/**
 * @param {string} orgId
 * @param {string} apiPrefix
 */
async function searchMetadataByPrefix(orgId, apiPrefix) {
  const batches = await Promise.all(
    METADATA_SEARCH_SPECS.map(async (spec) => {
      const r = await bg({ type: 'searchIndex', orgId, artifactType: spec.artType, prefix: apiPrefix });
      if (!r.ok) return [];
      return mapApiIndexToEntries(
        (Array.isArray(r.items) ? r.items : []).map((item) => ({
          ...item,
          artifactType: spec.artType
        }))
      );
    })
  );
  return batches.flat();
}

/**
 * @param {string} orgId
 * @param {string} queryLocal
 * @param {string} apiPrefix
 * @returns {Promise<MetadataSearchEntry[]>}
 */
export async function resolveMetadataMatches(orgId, queryLocal, apiPrefix) {
  if (nameIndex.orgId === orgId && nameIndex.ready) {
    return filterMetadataFromIndex(queryLocal);
  }
  if (apiPrefix.length >= MIN_METADATA_CHARS) {
    return searchMetadataByPrefix(orgId, apiPrefix);
  }
  return [];
}

/**
 * @param {MetadataSearchEntry[]} metadata
 * @param {number} max
 */
export function capMetadataResults(metadata, max) {
  return metadata.slice(0, max);
}
