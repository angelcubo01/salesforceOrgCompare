# UI v2: navegación superior y renovación visual

Actualización: 2026-08-24.

## Alcance

Esta versión sustituye exclusivamente el shell de UI v2. Classic/v1 conserva su HTML, navegación, controladores y estilos. La activación sigue dependiendo de `sfocUiMode === "v2"`; todos los estilos nuevos están acotados por `body[data-ui-mode="v2"]`.

Se mantienen los 26 Tool IDs, los parámetros `nav` y `op`, los panel IDs, permisos, riesgos, ámbitos de org, feature controls, favoritos, enlaces profundos, historial y command palette.

## Arquitectura de información

| Barra principal | Herramientas de la subbarra |
|---|---|
| Inicio | Acceso directo a la landing |
| Comparador | Acceso directo a Comparar metadatos, sin subbarra |
| Desarrollo | Calidad Apex; Editar código; Apex anónimo; Consultas SOQL/SOSL; Explorar API REST; Logs y trazas; Monitor de eventos |
| Análisis | Dependencias de listas; Dependencias de metadata; Analizar permisos; Comparar datos; Describir objetos; Editar e importar datos |
| Límites y auditoría | Estado de entornos; Límites; Despliegues; Procesos Bulk API; Cambios de configuración; Historial de campos |
| Manifiestos | Generar `package.xml`; Comparar tipos de metadata |

Las únicas fusiones con pestañas internas son:

- Calidad Apex: Tests, Ejecuciones, Resultados y Cobertura.
- Editar código: Apex/Visualforce y LWC/Aura.
- Logs y trazas: Debug Logs y Trace Flags.
- Dependencias de metadata: resultados y grafo.
- Comparar datos: Custom Settings, Custom Metadata y Registros.

Cada workspace se asigna una sola vez. Se retiraron de v2 los aliases duplicados y las agrupaciones amplias Advanced, Data/API y Org Operations.

## Comportamiento

- Inicio y Comparador navegan directamente. Las otras categorías abren una subbarra horizontal integrada en el layout. Ambas barras centran sus accesos cuando hay espacio y conservan desplazamiento horizontal cuando no lo hay.
- Repetir la categoría, pulsar fuera o usar Escape cierra la subbarra.
- Al cambiar de categoría se reemplaza su contenido; al elegir herramienta se cierra y el foco pasa al título contextual.
- Categorías, herramientas y pestañas internas admiten Tab, flechas, Home y End.
- La categoría de la herramienta actual y la categoría explorada tienen estados visuales distintos.
- Los controles ocultos por feature controls no se renderizan; los bloqueados conservan explicación accesible.
- En pantallas estrechas ambas barras usan desplazamiento horizontal y mantienen objetivos táctiles de al menos 44 px.
- La búsqueda global no ocupa espacio en la barra principal; continúa disponible desde la landing y mediante `Ctrl/Cmd+K`.

## Sistema visual

`code/workbench/workbench-refresh.css` centraliza tokens y presentación v2 para tema oscuro y claro: superficies, bordes, foco, estados semánticos, espaciado, tablas, formularios, editores, sidebar, modales, toasts y estados vacíos. Las animaciones son breves y se desactivan con `prefers-reduced-motion`; también existe una adaptación para `forced-colors`.

La landing incorpora hero compacto, búsqueda global, atajos y una sección ligera de beneficios. No muestra herramientas fijadas, recientes ni tarjetas para explorar por categoría en v2.

## Contratos de implementación

- `workspaceRegistry.js`: configuración independiente de categorías, workspaces, pestañas y rutas legacy.
- `workbenchShell.js`: presentación, navegación, historial, accesibilidad y decoración no destructiva de paneles existentes.
- `workbench-refresh.css`: overrides exclusivamente visuales y acotados a v2.
- `shared/i18n.js`: textos completos ES/EN para navegación, descripciones, estados y etiquetas accesibles.

No se mueven los nodos funcionales de las herramientas ni se reconectan sus eventos. Monaco, comparador, resize, scroll y lógica de negocio permanecen intactos.

## Validación

La regresión automatizada cubre:

- aislamiento Classic/v2;
- apertura, cambio, selección y cierre de subbarra por repetición, clic exterior y Escape;
- navegación por teclado, historial, recarga, favoritos, command palette y service worker;
- resolución de los 26 Tool IDs, workspace, pestaña, título y panel visible;
- reflow a 1024 y 640 px, equivalente de zoom al 200 %, tema claro y oscuro;
- Axe WCAG A/AA, ausencia de recursos UI remotos y comprobaciones visuales de landing y navegación.

Comandos principales:

```powershell
npm test
npx playwright test e2e/workbench.spec.js
$env:SFOC_UPDATE_VISUALS='1'; npx playwright test e2e/visuals.spec.js
```
