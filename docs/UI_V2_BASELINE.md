# UI 2.0 Workbench: baseline e inventario

Fecha del baseline: 2026-08-19.

## Estado de partida

- Rama de origen: `main`.
- Commit de origen y `origin/main`: `650d7deef437e017574092e232440a768b98f9dd`.
- Árbol de trabajo: limpio antes de crear `feature/code-ui-v2`.
- Suite: 124 archivos y 845 tests correctos; 24,13 s de Vitest y unos 28 s de proceso total.
- Avisos: únicamente los avisos preexistentes de sourcemaps de PostHog.
- `code/code.html`: 204.239 bytes.
- `code/code.css`: 281.678 bytes.
- `code/code-theme-light.css`: 104.769 bytes.
- `code/code.js`: 13.905 bytes.
- No hay recursos UI remotos en la implementación de la aplicación.

La métrica de carga que utilizará la comparación es el tiempo desde la navegación hasta que se retira `app-nav-booting`. Se tomarán diez aperturas Classic y diez V2 con contexto limpio, y se comparará la mediana. El presupuesto máximo de V2 es Classic + 10 %.

## Navegación actual

La navegación Classic se apoya en `code/ui/appModeNav.js`, el estado `state.appNavMode` y el selector oculto `#typeSelect`. `applyArtifactTypeUi` mantiene los paneles de herramienta montados y alterna su visibilidad. `code/lib/compareDeepLink.js` conserva los parámetros `nav`, `op`, `left`, `right`, `type`, `key`, `file` y `descriptor`; `code/lib/appHistoryNavigation.js` restaura el estado en `popstate`.

| Modo legacy | Herramientas |
| --- | --- |
| `comparator` | `Comparator` y normalizaciones de operaciones históricas de metadata |
| `development` | `ApexTests`, `ApexCoverageCompare`, `QuickEdit`, `LightningQuickEdit`, `AnonymousApex`, `QueryExplorer`, `RestExplorer`, `DebugLogBrowser`, `EventMonitor` |
| `analysis` | `FieldDependency`, `DependencyExplorer`, `PermissionDiff`, `CustomSettingsCompare`, `CustomMetadataCompare`, `RecordCompare`, `ObjectDescribe`, `DataWorkbench` |
| `monitoring` | `EnvironmentStatus`, `OrgLimits`, `DeployStatus`, `BulkJobMonitor`, `SetupAuditTrail`, `FieldHistory` |
| `manifests` | `GeneratePackageXml`, `MetadataTypeCompare` |

Las rutas antiguas continuarán siendo la URL canónica. La UI V2 resolverá cada `toolId` a workspace/tab sin reescribir el parser, el serializador ni el listener de historial del Comparator.

## Estado y preferencias compartidas

- Navegación: `sfocAppNavPrefs` en `chrome.storage.local`.
- Recientes/fijadas: `sfocToolRecents` en `chrome.storage.local`.
- Ajustes generales y tema: claves existentes de `shared/extensionSettings.js`.
- Orgs, aliases y grupos: claves existentes; no se duplican.
- Feature controls: modos y Tool IDs legacy, que siguen siendo la autoridad.

V2 solo añadirá `sfocUiMode` y `sfocWorkbenchPrefs`. No se copiará ni migrará información funcional.

## Límite protegido del Comparator

No se modificarán internamente `standardComparePanel`, el sidebar de comparación, Monaco, retrieve, buscadores, lista/selección, rutas, deep links, atajos ni estilos Classic. Los hashes Git del punto de partida son:

| Recurso | Hash blob Git |
| --- | --- |
| `code/code.html` | `038143e39d0c00c735d2a81bbe2ff3479148d8c4` |
| `code/code.css` | `e408c79c07d1137a2f77e7732d966422c04ccdd2` |
| `code/lib/compareDeepLink.js` | `b53d2632f86584181cd3f45203dc505aa36c9569` |
| `code/lib/appHistoryNavigation.js` | `9d3a6f7d76e655b146da2f0b920070c6cf6d64d3` |

También se consideran protegidos todos los archivos bajo `code/editor/**` y `code/flows/**`. Sus blobs quedan fijados por el árbol Git del commit de origen. La integración V2 se realizará con elementos hermanos, CSS aislado por `[data-ui-mode="v2"]` y llamadas a la navegación pública existente.

## Riesgos iniciales

- El documento actual monta todas las herramientas; el shell no debe reconstruirlas ni clonar handlers.
- El sidebar Classic es parte funcional del Comparator; el panel Workbench será independiente y se colapsará por defecto al entrar al Comparator si no está fijado.
- Los feature controls usan IDs legacy; una categoría o workspace V2 solo será visible si contiene al menos una herramienta visible.
- Quick Open ya busca herramientas, scripts Anonymous Apex y metadata. La command palette evolucionará ese módulo para mantener esa capacidad.
- Los flujos de escritura ya están defendidos en backend por `orgWriteGuard`; la UI añadirá contexto y confirmación sin reemplazar esa autoridad.
