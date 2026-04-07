import { ttlExpiryCache, lruEvictionCache } from '../shared/cache.js';

export const versionCache = ttlExpiryCache(24 * 60 * 60 * 1000);
export const indexCache = ttlExpiryCache(30 * 60 * 1000);
export const sourceCache = lruEvictionCache(200);
export const authStatusCache = ttlExpiryCache(2 * 60 * 1000);
