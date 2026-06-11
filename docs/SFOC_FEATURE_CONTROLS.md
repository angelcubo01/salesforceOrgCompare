# Panel de control remoto (kill switch) — `sfoc_feature_controls`

Guía operativa para activar, desactivar o degradar funcionalidades de **Salesforce Org Compare** sin publicar una nueva versión de la extensión.

---

## Resumen

| Concepto | Valor |
|----------|--------|
| **Feature flag (PostHog EU)** | `sfoc_feature_controls` |
| **Proyecto** | Default project (`191202`) |
| **Flag ID** | `204164` |
| **Enlace directo** | [Editar flag en PostHog](https://eu.posthog.com/project/191202/feature_flags/204164) |
| **Rollout** | 100 % — el comportamiento se cambia editando el **payload JSON**, no el porcentaje |
| **Estado inicial** | Todo habilitado (payload vacío de restricciones) |
| **Depende de telemetría de uso** | **No** — funciona aunque el usuario tenga desactivada la telemetría en Ajustes |

---

## ¿Qué puedes controlar?

1. **Ocultar secciones completas** del menú superior (`modes`).
2. **Ocultar herramientas** concretas (`tools`).
3. **Ocultar tipos de metadata** en el comparador (`metadataTypes`).
4. **Bloquear acciones peligrosas** aunque la herramienta siga visible (`actions`).
5. **Mostrar avisos globales** o por herramienta (`global`, `message` en tools/modes).
6. **Aviso global** — banner bajo el menú. **Avisos por herramienta** — modal sobre el contenido (el menú sigue usable); bloqueante o cerrable.

La restricción se aplica en:

- Menú y selector de operación (`#typeSelect`)
- Búsqueda rápida (Ctrl+Shift+P)
- Búsqueda de metadata en el comparador
- Paneles de UI (Quick Edit, Apex Tests, Anonymous Apex, retrieve/compare)
- **Service worker** (deploy, retrieve, tests, anonymous apex) — no se puede saltar solo manipulando el DOM

---

## Cómo editar la configuración

1. Abre [sfoc_feature_controls en PostHog](https://eu.posthog.com/project/191202/feature_flags/204164).
2. En **Release conditions** → payload cuando el flag es `true`, pega o edita el JSON.
3. Guarda los cambios.

No hace falta tocar el rollout (debe seguir al 100 %). Si el flag está **desactivado** globalmente en PostHog, la extensión se comporta como si no hubiera restricciones.

### Propagación a usuarios

| Situación | Cuándo ven el cambio |
|-----------|----------------------|
| Pestaña ya abierta | Hasta **30 minutos** (TTL de recarga de flags) o al **recargar** la página |
| Pestaña nueva | Al abrir Compare |
| Sin red / PostHog caído | Última configuración en caché local; si no hay caché → **todo visible** (fail-open) |

---

## Prueba rápida (un solo payload)

Un único JSON para validar **un poco de cada tipo** de control. Pensado para ~5 minutos: pegar, recargar Compare y recorrer la tabla.

### Pasos

1. Abre el [flag en PostHog](https://eu.posthog.com/project/191202/feature_flags/204164).
2. Sustituye el payload por el bloque **Smoke test** de abajo y guarda.
3. En Chrome: recarga la extensión en `chrome://extensions` (solo la primera vez tras desplegar código nuevo).
4. **F5** en la pestaña de Compare.
5. Sigue la checklist (orden sugerido).
6. Al terminar, restaura el [payload por defecto](#1-payload-por-defecto-sin-restricciones).

### Payload «Smoke test» (copiar tal cual)

```json
{
  "version": 1,
  "global": {
    "message": {
      "es": "[TEST] Aviso global — smoke test kill switch",
      "en": "[TEST] Global notice — kill switch smoke test",
      "severity": "info",
      "blocking": false,
      "url": "https://eu.posthog.com/project/191202/feature_flags/204164"
    }
  },
  "modes": {
    "manifests": { "hidden": true }
  },
  "tools": {
    "ApexTests": { "hidden": true },
    "QuickEdit": {
      "message": {
        "es": "[TEST] Aviso no bloqueante en Quick Edit",
        "en": "[TEST] Non-blocking notice on Quick Edit",
        "severity": "warn",
        "blocking": false
      }
    },
    "AnonymousApex": {
      "message": {
        "es": "[TEST] Overlay bloqueante en Apex anónimo",
        "en": "[TEST] Blocking overlay on Anonymous Apex",
        "severity": "error",
        "blocking": true
      }
    }
  },
  "metadataTypes": {
    "Profile": { "hidden": true }
  },
  "actions": {
    "deploy": {
      "disabled": true,
      "message": {
        "es": "[TEST] Deploy deshabilitado",
        "en": "[TEST] Deploy disabled",
        "severity": "error"
      }
    },
    "retrieve": {
      "disabled": true,
      "message": {
        "es": "[TEST] Retrieve deshabilitado",
        "en": "[TEST] Retrieve disabled",
        "severity": "error"
      }
    },
    "compare_run": {
      "disabled": true,
      "message": {
        "es": "[TEST] Comparación con retrieve deshabilitada",
        "en": "[TEST] Compare with retrieve disabled",
        "severity": "error"
      }
    },
    "anonymous_apex_execute": {
      "disabled": true,
      "message": {
        "es": "[TEST] Ejecución Apex anónimo deshabilitada",
        "en": "[TEST] Anonymous Apex execution disabled",
        "severity": "error"
      }
    }
  }
}
```

### Qué comprueba cada parte

| # | Tipo | Dónde mirar | Qué debe pasar |
|---|------|-------------|----------------|
| 1 | `global` | Cualquier pantalla | Banner azul bajo el menú; **Cerrar aviso** si no es bloqueante |
| 2 | `modes.hidden` | Menú superior | No aparece la sección **Manifiestos** |
| 3 | `tools.hidden` | Menú **Tests y depurar** | No aparece **Ejecutar Tests Apex** |
| 4 | Aviso no bloqueante | **Editor rápido Apex** | Modal ámbar en el contenido; **Cerrar** y usar la herramienta |
| 5 | Aviso bloqueante | **Ejecutar Apex anónimo** | Modal rojo sin cerrar en el contenido; **el menú sigue usable** para cambiar de herramienta |
| 6 | `metadataTypes.hidden` | **Comparador** + búsqueda | Un perfil conocido **no** sale; una clase Apex **sí** |
| 7 | `actions.deploy` | Quick Edit → Deploy | Toast «Función no disponible» + mensaje `[TEST] Deploy…` |
| 8 | `actions.compare_run` | Comparador → comparar ítem entre orgs | Toast de bloqueo antes de arrancar |
| 9 | `actions.anonymous_apex_execute` | Apex anónimo | Con modal bloqueante (punto 5) no llegas a Run; si solo `actions`, Run → toast |
| 10 | Quick Open | Ctrl+Shift+P → «tests» | No lista Apex Tests; «quick» sí lista Quick Edit |
| 11 | Deep link (opcional) | URL `?nav=development&op=ApexTests` | Redirige; toast de herramienta no disponible |

**No cubierto en este payload** (usa los [ejemplos por escenario](#ejemplos-por-escenario) si lo necesitas): `quick_edit_save`, `apex_test_run` (Apex Tests está oculto a propósito), aviso en `modes.message` (solo `hidden` en modos está implementado en UI).

### Restaurar tras la prueba

```json
{
  "version": 1,
  "global": null,
  "modes": {},
  "tools": {},
  "metadataTypes": {},
  "actions": {}
}
```

Guarda en PostHog y **F5** en Compare.

---

## Esquema del payload

```json
{
  "version": 1,
  "global": null,
  "modes": {},
  "tools": {},
  "metadataTypes": {},
  "actions": {}
}
```

### Campos de nivel raíz

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `version` | `number` | Versión del esquema. Usar `1`. |
| `global` | `object \| null` | Aviso para toda la aplicación. |
| `modes` | `object` | Restricciones por sección del menú. |
| `tools` | `object` | Restricciones por herramienta. |
| `metadataTypes` | `object` | Restricciones por tipo de metadata en el comparador. |
| `actions` | `object` | Bloqueo de operaciones en UI y service worker. |

### Objeto `message` (avisos)

Usado en `global`, `modes`, `tools` y `actions`:

```json
{
  "es": "Texto en español",
  "en": "Text in English",
  "severity": "warn",
  "blocking": false,
  "url": "https://tu-status-page.com/incidente"
}
```

| Campo | Valores | Efecto |
|-------|---------|--------|
| `es` / `en` | string | Texto mostrado según idioma de la UI (fallback: el otro idioma). |
| `severity` | `info`, `warn`, `error` | Borde del modal (azul / ámbar / rojo). |
| `blocking` | `true` / `false` | En **herramientas**: modal sin cerrar; bloquea solo el área de contenido (menú libre). `false` = modal cerrable. En **global**: banner sin botón cerrar si es `true`. |
| `url` | string (opcional) | Enlace «Más información». |

### Entrada de modo / herramienta / metadata

```json
{
  "hidden": true,
  "message": { ... }
}
```

- `hidden: true` → no aparece en menú, Quick Open ni selector; deep links redirigen a Home u otra herramienta visible.
- `message` sin `hidden` → la herramienta **sigue visible** pero muestra el aviso (bloqueante o no).

> **Nota:** en `modes`, solo `hidden` tiene efecto en la UI hoy. Un `message` en un modo se parsea pero **no se muestra** (sí funciona en `tools`, `global` y `actions`).

### Entrada de acción

```json
{
  "disabled": true,
  "message": { ... }
}
```

- `disabled: true` → la acción falla en UI y en el service worker.
- Útil para **modo solo lectura**: herramienta visible, ejecución cortada.

---

## Reglas de resolución (prioridad)

De más específico a más general:

1. **`tools[toolId]`** — menú, `#typeSelect`, Quick Open.
2. **`metadataTypes[artType]`** — resultados del buscador del comparador.
3. **`modes[mode]`** — pestaña completa del menú superior.
4. **`actions[actionId]`** — bloqueo de operación (independiente de `hidden`).
5. **`global`** — banner bajo la barra de modos.

Si el JSON está mal formado o PostHog no responde, **no se aplica ninguna restricción**.

---

## Inventario de IDs

### Modos (`modes`)

| ID | Sección en la UI |
|----|------------------|
| `comparator` | Comparador |
| `development` | Tests y depurar |
| `monitoring` | Límites y auditoría |
| `manifests` | Manifiestos |

### Herramientas (`tools`)

| ID | Nombre en la UI |
|----|-----------------|
| `Comparator` | Comparador |
| `ApexTests` | Ejecutar Tests Apex |
| `QuickEdit` | Editor rápido Apex |
| `AnonymousApex` | Ejecutar Apex anónimo |
| `QueryExplorer` | Explorador SOQL / SOSL |
| `DebugLogBrowser` | Explorar Debug Logs |
| `ApexCoverageCompare` | Comparar cobertura Apex |
| `OrgLimits` | Límites de org |
| `SetupAuditTrail` | Setup Audit Trail |
| `FieldHistory` | Historial de campos |
| `FieldDependency` | Dependencias de campos |
| `DependencyExplorer` | Explorador de dependencias |
| `PermissionDiff` | Diff de permisos |
| `CustomSettingsCompare` | Comparar Custom Settings |
| `CustomMetadataCompare` | Comparar Custom Metadata |
| `GeneratePackageXml` | Generar package.xml |

### Tipos de metadata (`metadataTypes`) — comparador

| ID | Tipo |
|----|------|
| `ApexClass` | Clases Apex |
| `ApexTrigger` | Triggers Apex |
| `ApexPage` | Páginas Visualforce |
| `ApexComponent` | Componentes Visualforce |
| `LWC` | Lightning Web Components |
| `Aura` | Aura Components |
| `PermissionSet` | Permission sets |
| `Profile` | Perfiles |
| `FlexiPage` | Páginas Lightning |

### Acciones (`actions`)

| ID | Qué bloquea |
|----|-------------|
| `deploy` | Deploy de metadata (Quick Edit y similares) |
| `quick_edit_save` | Validación «check only» en Quick Edit |
| `retrieve` | Retrieve de metadata (Permission Set, Profile, FlexiPage, package.xml, sesión retrieve) |
| `compare_run` | Comparación con retrieve entre dos orgs |
| `apex_test_run` | Ejecutar tests Apex |
| `anonymous_apex_execute` | Ejecutar Apex anónimo |

---

## Ejemplos por escenario

### 1. Payload por defecto (sin restricciones)

Estado actual del flag en producción:

```json
{
  "version": 1,
  "global": null,
  "modes": {},
  "tools": {},
  "metadataTypes": {},
  "actions": {}
}
```

---

### 2. Incidente: ocultar Tests Apex

El menú deja de mostrar la opción; deep links a Apex Tests redirigen.

```json
{
  "version": 1,
  "tools": {
    "ApexTests": { "hidden": true }
  }
}
```

---

### 3. Aviso bloqueante sin ocultar la herramienta

El usuario ve Tests Apex en el menú pero no puede interactuar con el panel.

```json
{
  "version": 1,
  "tools": {
    "ApexTests": {
      "message": {
        "es": "Los tests Apex están temporalmente deshabilitados por un incidente en la API de Salesforce.",
        "en": "Apex tests are temporarily disabled due to a Salesforce API incident.",
        "severity": "error",
        "blocking": true,
        "url": "https://status.salesforce.com"
      }
    }
  }
}
```

---

### 4. Aviso informativo (no bloqueante)

Banner amarillo cerrable; la herramienta sigue usable.

```json
{
  "version": 1,
  "tools": {
    "QuickEdit": {
      "message": {
        "es": "El editor rápido puede ir lento hoy. Evita deploys masivos.",
        "en": "Quick Edit may be slow today. Avoid large deploys.",
        "severity": "warn",
        "blocking": false
      }
    }
  }
}
```

---

### 5. Cortar todos los deploys (modo solo lectura global de escritura)

Las herramientas siguen visibles; deploy y validación en Quick Edit fallan con mensaje.

```json
{
  "version": 1,
  "actions": {
    "deploy": {
      "disabled": true,
      "message": {
        "es": "Los deploys están deshabilitados temporalmente.",
        "en": "Deploys are temporarily disabled.",
        "severity": "error"
      }
    },
    "quick_edit_save": {
      "disabled": true,
      "message": {
        "es": "La validación y el deploy están deshabilitados temporalmente.",
        "en": "Validation and deploy are temporarily disabled.",
        "severity": "error"
      }
    }
  }
}
```

---

### 6. Cortar retrieve y comparación con ZIP

```json
{
  "version": 1,
  "actions": {
    "retrieve": {
      "disabled": true,
      "message": {
        "es": "Retrieve deshabilitado por mantenimiento.",
        "en": "Retrieve disabled for maintenance.",
        "severity": "error"
      }
    },
    "compare_run": {
      "disabled": true,
      "message": {
        "es": "La comparación con retrieve está deshabilitada.",
        "en": "Compare with retrieve is disabled.",
        "severity": "error"
      }
    }
  }
}
```

---

### 7. Ocultar toda la sección «Tests y depurar»

```json
{
  "version": 1,
  "modes": {
    "development": { "hidden": true }
  }
}
```

---

### 8. Aviso global de mantenimiento

Banner bajo la barra de modos para todos los usuarios.

```json
{
  "version": 1,
  "global": {
    "message": {
      "es": "Mantenimiento programado hoy 22:00–23:00 UTC. Algunas funciones pueden no estar disponibles.",
      "en": "Scheduled maintenance today 22:00–23:00 UTC. Some features may be unavailable.",
      "severity": "warn",
      "blocking": false,
      "url": "https://salesforceorgcompare.web.app/"
    }
  }
}
```

---

### 9. Degradar solo perfiles en el comparador

El comparador sigue activo; búsqueda de `Profile` no devuelve resultados.

```json
{
  "version": 1,
  "metadataTypes": {
    "Profile": { "hidden": true }
  }
}
```

---

### 10. Incidente compuesto (emergencia)

Ocultar desarrollo, bloquear deploy/retrieve/tests y aviso global.

```json
{
  "version": 1,
  "global": {
    "message": {
      "es": "Incidente en curso. Solo consulta y comparación de lectura.",
      "en": "Ongoing incident. Read-only compare and browse only.",
      "severity": "error",
      "blocking": false
    }
  },
  "modes": {
    "development": { "hidden": true }
  },
  "actions": {
    "deploy": { "disabled": true },
    "retrieve": { "disabled": true },
    "apex_test_run": { "disabled": true },
    "anonymous_apex_execute": { "disabled": true }
  }
}
```

---

## Runbook rápido (incidente)

1. Abre el [flag en PostHog](https://eu.posthog.com/project/191202/feature_flags/204164).
2. Edita el payload según el escenario (ver ejemplos arriba).
3. Guarda.
4. Opcional: añade una [anotación](https://eu.posthog.com/project/191202/annotations) en PostHog con la hora del cambio.
5. Para revertir: vuelve al payload por defecto (sección 1).
6. Comunica a usuarios que recarguen Compare si necesitan el cambio al instante.

---

## Crear o actualizar el flag desde el repo

Requiere una **Personal API Key** (`phx_...`) de PostHog EU. **No la subas al repositorio.**

```powershell
$env:POSTHOG_PERSONAL_API_KEY="phx_..."
$env:POSTHOG_PROJECT_ID="191202"
npm run posthog:feature-controls-flag
```

Para sobrescribir definición del flag (nombre, rollout, payload base):

```powershell
npm run posthog:feature-controls-flag:update
```

Publicar el **payload smoke test** de este documento:

```powershell
npm run posthog:feature-controls-flag:smoke
```

Volver al payload sin restricciones:

```powershell
npm run posthog:feature-controls-flag:reset
```

Script: [`scripts/createPosthogFeatureControlsFlag.mjs`](../scripts/createPosthogFeatureControlsFlag.mjs)

---

## Arquitectura (referencia técnica)

```
PostHog (sfoc_feature_controls)
        ↓
bootstrapFeatureControls (al F5, antes de navegación/UI; fuerza recarga del flag)
        ↓
initPosthogClient → ensureFeatureFlagsLoaded (siempre, con o sin telemetría)
        ↓
parseFeatureControlsPayload → chrome.storage.local (sfocFeatureControlsCache)
        ↓
├── appModeNav (menú filtrado)
├── featureControlsUi (banner global + modales de herramienta)
├── paneles + retrieveFlow (guardToolAction)
└── background/messageHandlers (featureControlBlockedResponse)
```

Archivos principales:

| Archivo | Rol |
|---------|-----|
| [`shared/featureControls.js`](../shared/featureControls.js) | Parser y reglas de negocio |
| [`shared/posthogFeatureControlsFlag.js`](../shared/posthogFeatureControlsFlag.js) | Carga desde PostHog |
| [`shared/featureControlsCache.js`](../shared/featureControlsCache.js) | Persistencia para el SW |
| [`code/ui/featureControlsUi.js`](../code/ui/featureControlsUi.js) | Banners y guards en UI |
| [`background/featureControlsGuard.js`](../background/featureControlsGuard.js) | Guards en service worker |

---

## Telemetría opcional

Si el usuario tiene **telemetría de uso activada**, al bloquear una acción desde la UI se envía el evento `feature_control_blocked` con `{ action, tool }`. Esto no afecta al kill switch.

---

## Ideas futuras (no implementadas aún)

- Rollout por cohorte (org Salesforce, versión de extensión)
- Ventanas de mantenimiento con **Scheduled changes** de PostHog
- `minExtensionVersion` en payload → forzar actualización
- Dashboard de eventos `feature_control_blocked` en PostHog
- Recarga forzada de flags al recuperar el foco de la ventana

---

## Preguntas frecuentes

**¿Afecta a usuarios sin telemetría?**  
Sí, el flag se carga igual. La telemetría de uso solo afecta a eventos analíticos opcionales.

**¿Puedo desactivar todo con un solo switch?**  
Desactiva el flag en PostHog o usa payload vacío. Para «modo emergencia», combina `modes`, `actions` y `global` (ejemplo 10).

**¿El usuario puede saltarse el bloqueo?**  
No en operaciones críticas: el service worker valida `actions` aunque manipulen la UI.

**¿Cuánto tarda en aplicarse un cambio?**  
Hasta 30 min en pestañas abiertas; inmediato al recargar Compare.
