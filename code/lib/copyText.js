/**
 * Copia texto al portapapeles. Usa la API moderna y, si no está disponible o la rechaza
 * (p. ej. documento sin foco), recurre a un textarea temporal + execCommand.
 * @param {unknown} text
 * @returns {Promise<boolean>} true si se copió
 */
export async function copyTextToClipboard(text) {
  const value = String(text ?? '');
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard?.writeText) {
      await clipboard.writeText(value);
      return true;
    }
  } catch {
    /* se intenta el método clásico */
  }
  return legacyCopy(value);
}

function legacyCopy(value) {
  if (typeof document === 'undefined' || !document.body) return false;
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = !!document.execCommand?.('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
