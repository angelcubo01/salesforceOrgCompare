import { fetchSource as apiFetchSource } from './salesforceApi.js';
import { listMetadataWithFolderFallback, retrievePackageXmlZip } from './metadataRetrieve.js';
import {
  buildFetchDescriptor,
  buildWildcardPackageXml,
  compareZipMembers,
  contentSignatureFromFiles,
  groupZipFilesByMember,
  isRestComparableMetadataType,
  mergeMemberRows,
  metadataTypeToArtType
} from './metadataTypeCompareCore.js';

const REST_BATCH_CONCURRENCY = 6;

/**
 * @param {() => boolean} isCancelled
 */
function throwIfCancelled(isCancelled) {
  if (typeof isCancelled === 'function' && isCancelled()) {
    const err = new Error('METADATA_TYPE_COMPARE_CANCELLED');
    err.code = 'METADATA_TYPE_COMPARE_CANCELLED';
    throw err;
  }
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} metadataType
 * @param {string | undefined} folderHint
 */
export async function listMembersForMetadataType(instanceUrl, sid, apiVersion, metadataType, folderHint) {
  const records = await listMetadataWithFolderFallback(
    instanceUrl,
    sid,
    apiVersion,
    String(metadataType || ''),
    folderHint != null && folderHint !== '' ? String(folderHint) : undefined
  );
  return (records || [])
    .map((r) => String(r.fullName || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} artType
 * @param {string} memberName
 */
async function fetchMemberContentSignature(instanceUrl, sid, apiVersion, artType, memberName) {
  const descriptor = buildFetchDescriptor(artType, memberName);
  const files = await apiFetchSource(instanceUrl, sid, apiVersion, artType, descriptor);
  return contentSignatureFromFiles(files || []);
}

/**
 * Compara un lote de miembros vía REST fetchSource.
 * @param {object} opts
 * @param {string} opts.leftInstanceUrl
 * @param {string} opts.leftSid
 * @param {string} opts.rightInstanceUrl
 * @param {string} opts.rightSid
 * @param {string} opts.apiVersion
 * @param {string} opts.metadataType
 * @param {string[]} opts.memberNames
 * @param {() => boolean} [opts.isCancelled]
 */
export async function compareRestMemberBatch(opts) {
  const {
    leftInstanceUrl,
    leftSid,
    rightInstanceUrl,
    rightSid,
    apiVersion,
    metadataType,
    memberNames,
    isCancelled
  } = opts;

  throwIfCancelled(isCancelled);

  const artType = metadataTypeToArtType(metadataType);
  if (!artType || !isRestComparableMetadataType(metadataType)) {
    throw new Error(`Tipo no soportado para REST batch: ${metadataType}`);
  }

  /** @type {Map<string, { status: 'match' | 'diff' | 'leftOnly' | 'rightOnly' | 'error', detail?: string }>} */
  const results = new Map();
  const names = (memberNames || []).map((n) => String(n).trim()).filter(Boolean);

  for (let i = 0; i < names.length; i += REST_BATCH_CONCURRENCY) {
    throwIfCancelled(isCancelled);
    const chunk = names.slice(i, i + REST_BATCH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (memberName) => {
        throwIfCancelled(isCancelled);
        try {
          const [leftSig, rightSig] = await Promise.all([
            fetchMemberContentSignature(leftInstanceUrl, leftSid, apiVersion, artType, memberName).catch(
              () => null
            ),
            fetchMemberContentSignature(rightInstanceUrl, rightSid, apiVersion, artType, memberName).catch(
              () => null
            )
          ]);

          if (leftSig == null && rightSig == null) {
            results.set(memberName, { status: 'error', detail: 'read failed' });
            return;
          }
          if (leftSig == null && rightSig != null) {
            results.set(memberName, { status: 'rightOnly' });
            return;
          }
          if (leftSig != null && rightSig == null) {
            results.set(memberName, { status: 'leftOnly' });
            return;
          }
          if (leftSig === rightSig) {
            results.set(memberName, { status: 'match' });
          } else {
            results.set(memberName, { status: 'diff' });
          }
        } catch (e) {
          if (e?.code === 'METADATA_TYPE_COMPARE_CANCELLED') throw e;
          results.set(memberName, { status: 'error', detail: String(e?.message || e) });
        }
      })
    );
  }

  return results;
}

/**
 * Retrieve wildcard de un tipo en una org.
 * @param {object} opts
 * @param {string} opts.instanceUrl
 * @param {string} opts.sid
 * @param {string} opts.apiVersion
 * @param {string} opts.metadataType
 * @param {() => boolean} [opts.isCancelled]
 */
export async function retrieveMetadataTypeWildcard(opts) {
  const { instanceUrl, sid, apiVersion, metadataType, isCancelled } = opts;
  throwIfCancelled(isCancelled);
  const packageXml = buildWildcardPackageXml(metadataType, apiVersion);
  const { zipBase64 } = await retrievePackageXmlZip(instanceUrl, sid, apiVersion, packageXml, {
    isCancelled
  });
  throwIfCancelled(isCancelled);
  return zipBase64;
}

/**
 * Compara ficheros ZIP ya extraídos (paths + content).
 * @param {Array<{ path: string, content: string }>} leftFiles
 * @param {Array<{ path: string, content: string }>} rightFiles
 * @param {string} metadataType
 */
export function compareRetrieveZipFiles(leftFiles, rightFiles, metadataType) {
  const leftByMember = groupZipFilesByMember(leftFiles, metadataType);
  const rightByMember = groupZipFilesByMember(rightFiles, metadataType);
  return compareZipMembers(leftByMember, rightByMember);
}

/**
 * @param {string[]} leftNames
 * @param {string[]} rightNames
 * @param {Map<string, { status: string, detail?: string }>} compareResults
 */
export function buildMergedMemberRows(leftNames, rightNames, compareResults) {
  return mergeMemberRows(leftNames, rightNames, compareResults);
}
