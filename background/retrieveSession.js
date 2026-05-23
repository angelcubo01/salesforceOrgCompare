/** Generación activa de retrieve Metadata API; al incrementar, los retrieve en curso se abandonan. */
let currentGeneration = 0;

export function beginRetrieveSession() {
  currentGeneration += 1;
  return currentGeneration;
}

export function cancelRetrieveSessions() {
  currentGeneration += 1;
  return currentGeneration;
}

export function isRetrieveGenerationCurrent(generation) {
  if (generation == null || generation === undefined) return true;
  return Number(generation) === currentGeneration;
}

/** @param {number | undefined} generation */
export function retrieveCancelOpts(generation) {
  return {
    isCancelled: () => !isRetrieveGenerationCurrent(generation)
  };
}
