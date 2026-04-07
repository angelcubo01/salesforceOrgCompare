/** Descriptor para `fetchSource` / caché: incluye `fileName` de ítems de bundle (LWC/Aura). */
export function descriptorForFetchSource(item) {
  if (!item || !item.descriptor) return {};
  const d = { ...item.descriptor };
  if (item.fileName) d.fileName = item.fileName;
  return d;
}
