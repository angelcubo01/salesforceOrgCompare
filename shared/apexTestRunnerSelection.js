export const APEX_TEST_RUNNER_SELECTION_TTL_MS = 30 * 60 * 1000;

/**
 * La selección del runner es un borrador de trabajo breve, no una preferencia
 * permanente. Los snapshots antiguos (incluidos los del formato previo sin
 * `updatedAt`) se descartan para evitar ejecuciones accidentales días después.
 */
export function isApexTestRunnerSelectionFresh(
  snapshot,
  nowMs = Date.now(),
  ttlMs = APEX_TEST_RUNNER_SELECTION_TTL_MS
) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const updatedAt = Number(snapshot.updatedAt);
  return Number.isFinite(updatedAt) && updatedAt > 0 && nowMs - updatedAt >= 0 && nowMs - updatedAt <= ttlMs;
}

/** Modelo puro para alternar un método sin confundir "clase completa" con
 * "métodos concretos". `selectedMethods: null` significa clase completa. */
export function updateApexMethodSelection({
  knownMethods = [],
  selectedMethods = [],
  wholeClass = false,
  methodName,
  checked
}) {
  const known = [...new Set(knownMethods.filter(Boolean))];
  const next = wholeClass ? new Set(known) : new Set(selectedMethods.filter(Boolean));
  if (checked) next.add(methodName);
  else next.delete(methodName);
  if (!next.size) return { selectedClass: false, selectedMethods: null };
  if (known.length && known.every((name) => next.has(name))) {
    return { selectedClass: true, selectedMethods: null };
  }
  return {
    selectedClass: true,
    selectedMethods: [...next].sort((a, b) => a.localeCompare(b))
  };
}
