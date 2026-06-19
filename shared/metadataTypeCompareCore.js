/**
 * Lógica pura para comparación masiva de un tipo Metadata API entre dos orgs.
 */

/** Tipos Metadata API comparables vía REST fetchSource (no retrieve wildcard). */
export const REST_COMPARABLE_METADATA_TYPES = Object.freeze([
  'ApexClass',
  'ApexTrigger',
  'ApexPage',
  'ApexComponent',
  'LightningComponentBundle',
  'AuraDefinitionBundle'
]);

/** Tipos pesados que merecen aviso previo en UI. */
export const HEAVY_METADATA_TYPES = Object.freeze([
  'Profile',
  'Flow',
  'FlowDefinition',
  'CustomObject',
  'Layout',
  'Report',
  'Dashboard'
]);

/** @typedef {'match' | 'diff' | 'leftOnly' | 'rightOnly' | 'error'} MemberCompareStatus */

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   status: MemberCompareStatus,
 *   detail?: string
 * }} MemberCompareRow
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeCompareText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd();
}

/**
 * @param {string} raw
 */
function escapeXmlText(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} metadataType
 * @param {string} apiVersion
 * @returns {string}
 */
export function buildWildcardPackageXml(metadataType, apiVersion) {
  const ver = String(apiVersion || '60.0');
  const typeSafe = escapeXmlText(metadataType);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>${typeSafe}</name>
    </types>
    <version>${ver}</version>
</Package>`;
}

/**
 * package.xml para retrieve de un único miembro (abrir en comparador).
 * @param {string} metadataType
 * @param {string} memberName
 * @param {string} apiVersion
 * @returns {string}
 */
export function buildSingleMemberPackageXml(metadataType, memberName, apiVersion) {
  const ver = String(apiVersion || '60.0');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${escapeXmlText(memberName)}</members>
        <name>${escapeXmlText(metadataType)}</name>
    </types>
    <version>${ver}</version>
</Package>`;
}

/**
 * @param {Array<{ fileName?: string, content?: string }>} files
 * @returns {string}
 */
export function contentSignatureFromFiles(files) {
  return (files || [])
    .map((f) => `${String(f.fileName || f.path || '')}\t${normalizeCompareText(f.content)}`)
    .sort((a, b) => a.localeCompare(b))
    .join('\n');
}

/**
 * Normaliza path de retrieve ZIP (sin prefijo unpackaged).
 * @param {string} rawPath
 */
export function normalizeZipComparePath(rawPath) {
  let p = String(rawPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const parts = p.split('/').filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0].toLowerCase();
    if (first === 'unpackaged' || first === 'unpackage') {
      p = parts.slice(1).join('/');
    }
  }
  return p;
}

/**
 * Extrae clave de miembro a partir de un path dentro del ZIP de retrieve.
 * @param {string} rawPath
 * @param {string} [metadataType]
 * @returns {string | null}
 */
export function extractMemberKeyFromZipPath(rawPath, metadataType) {
  const p = normalizeZipComparePath(rawPath);
  const parts = p.split('/').filter(Boolean);
  if (!parts.length) return null;

  const dir = parts[0].toLowerCase();
  if (dir === 'lwc' || dir === 'aura') {
    return parts.length >= 2 ? parts[1] : null;
  }

  const fileName = parts[parts.length - 1];
  if (!fileName) return null;

  if (fileName.endsWith('.flow-meta.xml')) {
    return fileName.slice(0, -'.flow-meta.xml'.length);
  }
  if (fileName.endsWith('.object-meta.xml')) {
    return fileName.slice(0, -'.object-meta.xml'.length);
  }
  if (fileName.endsWith('-meta.xml')) {
    return null;
  }

  let base = fileName;
  const dot = base.indexOf('.');
  if (dot > 0) base = base.slice(0, dot);

  if (!base) return null;

  if (metadataType === 'CustomLabels' && dir === 'labels') {
    return 'CustomLabels';
  }

  return base;
}

/**
 * Path principal de un miembro para abrir en el comparador (prefiere fichero principal, no *-meta.xml).
 * @param {Array<{ path: string }>} leftMemberFiles
 * @param {Array<{ path: string }>} rightMemberFiles
 * @returns {string | null}
 */
export function pickPrimaryMemberComparePath(leftMemberFiles, rightMemberFiles) {
  const all = [...(leftMemberFiles || []), ...(rightMemberFiles || [])];
  const seen = new Set();
  /** @type {{ path: string }[]} */
  const unique = [];
  for (const f of all) {
    const p = normalizeZipComparePath(f.path);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    unique.push({ path: p });
  }
  const nonMeta = unique.filter((f) => !f.path.toLowerCase().endsWith('-meta.xml'));
  const pool = nonMeta.length ? nonMeta : unique;
  pool.sort((a, b) => a.path.localeCompare(b.path));
  return pool[0]?.path || null;
}

/**
 * Construye caché de paths y mapa miembro → path principal tras retrieve masivo.
 * @param {Array<{ path: string, content: string }>} leftFiles
 * @param {Array<{ path: string, content: string }>} rightFiles
 * @param {string} metadataType
 */
export function buildRetrieveCompareCache(leftFiles, rightFiles, metadataType) {
  /** @type {Record<string, string>} */
  const leftByPath = {};
  /** @type {Record<string, string>} */
  const rightByPath = {};
  for (const f of leftFiles || []) {
    const p = normalizeZipComparePath(f.path);
    if (p) leftByPath[p] = f.content ?? '';
  }
  for (const f of rightFiles || []) {
    const p = normalizeZipComparePath(f.path);
    if (p) rightByPath[p] = f.content ?? '';
  }
  const paths = [...new Set([...Object.keys(leftByPath), ...Object.keys(rightByPath)])].sort((a, b) =>
    a.localeCompare(b)
  );
  const leftGrouped = groupZipFilesByMember(leftFiles, metadataType);
  const rightGrouped = groupZipFilesByMember(rightFiles, metadataType);
  /** @type {Map<string, string>} */
  const primaryPathByMember = new Map();
  for (const key of new Set([...leftGrouped.keys(), ...rightGrouped.keys()])) {
    const path = pickPrimaryMemberComparePath(leftGrouped.get(key), rightGrouped.get(key));
    if (path) primaryPathByMember.set(key, path);
  }
  return { leftByPath, rightByPath, paths, primaryPathByMember };
}

/**
 * Mapas miembro/path → estado de comparación para el explorador lateral.
 * @param {MemberCompareRow[]} mergedRows
 * @param {string[]} paths
 * @param {string} metadataType
 * @param {Map<string, string>} primaryPathByMember
 */
export function buildPathStatusMaps(mergedRows, paths, metadataType, primaryPathByMember) {
  /** @type {Record<string, MemberCompareStatus>} */
  const memberStatusByKey = {};
  for (const row of mergedRows || []) {
    memberStatusByKey[row.key] = row.status;
  }
  /** @type {Record<string, MemberCompareStatus>} */
  const pathStatusByRelativePath = {};
  for (const p of paths || []) {
    const member = extractMemberKeyFromZipPath(p, metadataType);
    if (member && memberStatusByKey[member]) {
      pathStatusByRelativePath[p] = memberStatusByKey[member];
    }
  }
  if (primaryPathByMember) {
    for (const [member, path] of primaryPathByMember) {
      if (memberStatusByKey[member]) {
        pathStatusByRelativePath[path] = memberStatusByKey[member];
      }
    }
  }
  return { memberStatusByKey, pathStatusByRelativePath };
}

/**
 * Agrupa ficheros ZIP por miembro.
 * @param {Array<{ path: string, content: string }>} files
 * @param {string} [metadataType]
 * @returns {Map<string, Array<{ path: string, content: string }>>}
 */
export function groupZipFilesByMember(files, metadataType) {
  /** @type {Map<string, Array<{ path: string, content: string }>>} */
  const byMember = new Map();
  for (const f of files || []) {
    const key = extractMemberKeyFromZipPath(f.path, metadataType);
    if (!key) continue;
    if (!byMember.has(key)) byMember.set(key, []);
    byMember.get(key).push(f);
  }
  return byMember;
}

/**
 * Compara ficheros ZIP de un miembro entre org izquierda y derecha.
 * @param {Array<{ path: string, content: string }> | undefined} leftFiles
 * @param {Array<{ path: string, content: string }> | undefined} rightFiles
 * @returns {{ status: MemberCompareStatus, detail?: string }}
 */
export function compareMemberZipFiles(leftFiles, rightFiles) {
  const left = leftFiles || [];
  const right = rightFiles || [];
  if (!left.length && !right.length) {
    return { status: 'match' };
  }
  if (!left.length && right.length) {
    return { status: 'rightOnly' };
  }
  if (left.length && !right.length) {
    return { status: 'leftOnly' };
  }

  const leftSig = contentSignatureFromFiles(
    left.map((f) => ({ fileName: normalizeZipComparePath(f.path), content: f.content }))
  );
  const rightSig = contentSignatureFromFiles(
    right.map((f) => ({ fileName: normalizeZipComparePath(f.path), content: f.content }))
  );

  if (leftSig === rightSig) {
    return { status: 'match' };
  }
  return { status: 'diff', detail: `${left.length} vs ${right.length} files` };
}

/**
 * Fusiona listas de miembros y resultados de comparación parcial.
 * @param {string[]} leftNames
 * @param {string[]} rightNames
 * @param {Map<string, { status: MemberCompareStatus, detail?: string }>} [compareResultsByKey]
 * @returns {MemberCompareRow[]}
 */
export function mergeMemberRows(leftNames, rightNames, compareResultsByKey) {
  const leftSet = new Set((leftNames || []).map((n) => String(n).trim()).filter(Boolean));
  const rightSet = new Set((rightNames || []).map((n) => String(n).trim()).filter(Boolean));
  const keys = [...new Set([...leftSet, ...rightSet])].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  return keys.map((key) => {
    const inLeft = leftSet.has(key);
    const inRight = rightSet.has(key);
    const compared = compareResultsByKey?.get(key);

    if (compared) {
      return {
        key,
        label: key,
        status: compared.status,
        ...(compared.detail ? { detail: compared.detail } : {})
      };
    }

    if (inLeft && !inRight) {
      return { key, label: key, status: 'leftOnly' };
    }
    if (!inLeft && inRight) {
      return { key, label: key, status: 'rightOnly' };
    }
    return { key, label: key, status: 'match' };
  });
}

/**
 * Compara mapas de miembros agrupados desde ZIP retrieve.
 * @param {Map<string, Array<{ path: string, content: string }>>} leftByMember
 * @param {Map<string, Array<{ path: string, content: string }>>} rightByMember
 * @returns {MemberCompareRow[]}
 */
export function compareZipMembers(leftByMember, rightByMember) {
  const keys = [...new Set([...leftByMember.keys(), ...rightByMember.keys()])].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  return keys.map((key) => {
    const result = compareMemberZipFiles(leftByMember.get(key), rightByMember.get(key));
    return {
      key,
      label: key,
      status: result.status,
      ...(result.detail ? { detail: result.detail } : {})
    };
  });
}

/**
 * @param {MemberCompareRow[]} rows
 * @param {boolean} diffOnly
 */
export function filterMemberRows(rows, diffOnly) {
  if (!diffOnly) return rows || [];
  return (rows || []).filter((r) => r.status !== 'match');
}

/**
 * @param {string} metadataType
 * @returns {boolean}
 */
export function isRestComparableMetadataType(metadataType) {
  return REST_COMPARABLE_METADATA_TYPES.includes(String(metadataType || ''));
}

/**
 * @param {string} metadataType
 * @returns {string | null}
 */
export function metadataTypeToArtType(metadataType) {
  const mt = String(metadataType || '');
  switch (mt) {
    case 'LightningComponentBundle':
      return 'LWC';
    case 'AuraDefinitionBundle':
      return 'Aura';
    case 'ApexClass':
    case 'ApexTrigger':
    case 'ApexPage':
    case 'ApexComponent':
      return mt;
    default:
      return null;
  }
}

/**
 * @param {string} artType
 * @param {string} memberName
 */
export function buildFetchDescriptor(artType, memberName) {
  const name = String(memberName || '').trim();
  if (artType === 'LWC' || artType === 'Aura') {
    return { bundleDeveloperName: name, bundleId: name };
  }
  return { name };
}
