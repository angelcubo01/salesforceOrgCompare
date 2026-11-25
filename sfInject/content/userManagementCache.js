/** Session-only cache owned by the palette; invalidation also isolates in-flight reads. */
export function createUserManagementCache() {
  const entries = new Map();
  return {
    get(key, loader) {
      if (entries.has(key)) return entries.get(key);
      const promise = Promise.resolve().then(loader).catch((error) => {
        if (entries.get(key) === promise) entries.delete(key);
        throw error;
      });
      entries.set(key, promise); return promise;
    },
    invalidate(prefix) { for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key); },
    clear() { entries.clear(); }
  };
}
