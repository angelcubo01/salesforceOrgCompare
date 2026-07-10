import { ttlExpiryCache, lruEvictionCache } from '../shared/cache.js';

export const versionCache = ttlExpiryCache(24 * 60 * 60 * 1000);
export const indexCache = ttlExpiryCache(30 * 60 * 1000);
export const sourceCache = lruEvictionCache(200);
export const authStatusCache = ttlExpiryCache(2 * 60 * 1000);
/** listMetadata por org+tipo para búsqueda del Dependency Explorer (5 min). */
export const depExplorerListCache = ttlExpiryCache(5 * 60 * 1000);
/** describeGlobal por org (5 min) — Query Explorer / Object Describe. */
export const describeGlobalCache = ttlExpiryCache(5 * 60 * 1000);
/** describeSObject por org+objeto (5 min). */
export const describeSobjectCache = ttlExpiryCache(5 * 60 * 1000);

/**
 * Invalida cachés de describe y listados asociados a una org.
 * @param {string} orgId
 */
export function clearDescribeCachesForOrg(orgId) {
  const id = String(orgId || '');
  if (!id) return;
  const prefixes = [`${id}:`, `org:${id}:`];
  for (const cache of [describeGlobalCache, describeSobjectCache, depExplorerListCache, indexCache]) {
    for (const key of cache.keys()) {
      if (prefixes.some((p) => String(key).startsWith(p))) cache.del(key);
    }
  }
}
