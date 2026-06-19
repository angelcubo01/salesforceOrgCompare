/** Generación activa de comparación masiva por tipo; al incrementar, las operaciones en curso se abandonan. */
let currentGeneration = 0;

export function beginMetadataTypeCompareSession() {
  currentGeneration += 1;
  return currentGeneration;
}

export function cancelMetadataTypeCompareSessions() {
  currentGeneration += 1;
  return currentGeneration;
}

export function isMetadataTypeCompareGenerationCurrent(generation) {
  if (generation == null || generation === undefined) return true;
  return Number(generation) === currentGeneration;
}

/** @param {number | undefined} generation */
export function metadataTypeCompareCancelOpts(generation) {
  return {
    isCancelled: () => !isMetadataTypeCompareGenerationCurrent(generation)
  };
}
