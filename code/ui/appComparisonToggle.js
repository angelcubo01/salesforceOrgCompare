/**
 * Un punto único para el modo comparación de las herramientas que lo soportan.
 * Los controles conservan su propio id y listeners: solo se reubican en el
 * chrome superior cuando su herramienta está activa.
 *
 * `Comparator` es el caso inverso: ya compara por defecto y su control es la
 * «Vista única», que al activarse abre el componente sin comparar.
 */
const TOGGLE_BY_TOOL = Object.freeze({
  Comparator: 'comparatorSingleViewToggle',
  GeneratePackageXml: 'generatePkgCompareToggle',
  DependencyExplorer: 'depExplorerCompareToggle',
  AnonymousApex: 'anonymousApexCompareToggle',
  QueryExplorer: 'queryExplorerCompareToggle',
  RecordCompare: 'recordCompareCompareToggle',
  PermissionDiff: 'permissionDiffCompareToggle',
  OrgLimits: 'orgLimitsCompareToggle'
});

function labelForToggle(toggleId) {
  const input = document.getElementById(toggleId);
  return input?.closest('label') || null;
}

export function comparisonToggleIdForTool(toolId) {
  return TOGGLE_BY_TOOL[toolId] || null;
}

/**
 * Mueve el toggle de la herramienta activa junto a Ayuda y aparca los demás.
 * Es intencionadamente idempotente porque `applyArtifactTypeUi` se ejecuta
 * también al activar o desactivar el propio modo comparación.
 */
export function syncAppComparisonToggle(toolId) {
  const shell = document.getElementById('appComparisonToggle');
  const mount = document.getElementById('appComparisonToggleMount');
  const parking = document.getElementById('appComparisonToggleParking');
  if (!shell || !mount || !parking) return;

  const activeToggleId = comparisonToggleIdForTool(toolId);
  for (const toggleId of Object.values(TOGGLE_BY_TOOL)) {
    const label = labelForToggle(toggleId);
    if (!label) continue;
    label.classList.add('app-comparison-control');
    (toggleId === activeToggleId ? mount : parking).appendChild(label);
  }

  shell.classList.toggle('hidden', !activeToggleId);
  shell.classList.toggle('is-visible', !!activeToggleId);
}

export const COMPARISON_MODE_TOGGLE_TOOLS = Object.freeze(Object.keys(TOGGLE_BY_TOOL));
