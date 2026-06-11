import { ttlExpiryCache, lruEvictionCache } from '../shared/cache.js';

export const versionCache = ttlExpiryCache(24 * 60 * 60 * 1000);
export const indexCache = ttlExpiryCache(30 * 60 * 1000);
export const sourceCache = lruEvictionCache(200);
export const authStatusCache = ttlExpiryCache(2 * 60 * 1000);
/** listMetadata por org+tipo para búsqueda del Dependency Explorer (5 min). */
export const depExplorerListCache = ttlExpiryCache(5 * 60 * 1000);
