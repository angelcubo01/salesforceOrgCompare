# Controles del popup — `sfoc_popup_controls`

Guía operativa para parametrizar el aviso del popup de la extensión y el botón **Abrir aplicación** sin publicar una nueva versión.

---

## Resumen

| Concepto | Valor |
|----------|--------|
| **Feature flag (PostHog EU)** | `sfoc_popup_controls` |
| **Proyecto** | Default project (`191202`) |
| **Rollout** | 100 % — el comportamiento se cambia editando el **payload JSON** |
| **Depende de telemetría de uso** | **No** — los flags se cargan aunque el usuario tenga desactivada la telemetría en Ajustes |
| **Flag OFF o sin red** | Sin aviso + botón Open app habilitado (fail-open) |

---

## Esquema de payload (v1)

```json
{
  "version": 1,
  "notice": {
    "enabled": true,
    "es": "Texto del aviso en español…",
    "en": "Notice text in English…",
    "severity": "info",
    "frequency": "once",
    "dismissible": true,
    "dismissLabel": { "es": "Entendido", "en": "Got it" },
    "url": "https://…"
  },
  "openApp": {
    "disabled": false,
    "message": {
      "es": "Aplicación temporalmente no disponible",
      "en": "App temporarily unavailable",
      "severity": "warn"
    }
  }
}
```

### Campos del aviso (`notice`)

| Campo | Valores | Comportamiento |
|-------|---------|----------------|
| `enabled` | `true` / `false` | `false` → no mostrar aviso (ni remoto ni local) si el flag está ON |
| `severity` | `info` \| `warn` \| `error` | Estilo visual del banner |
| `frequency` | `once` \| `always` | `once`: persistir cierre; `always`: mostrar en cada apertura del popup |
| `dismissible` | `true` / `false` | `false`: sin botón cerrar; el banner permanece visible |
| `url` | URL opcional | Enlace adicional bajo el texto |

### Botón Open app (`openApp`)

| Campo | Comportamiento |
|-------|----------------|
| `disabled: true` | Deshabilita el botón «Abrir aplicación» |
| `message` | Tooltip al pasar el cursor (es/en) |

---

## Crear o actualizar el flag

```powershell
$env:POSTHOG_PERSONAL_API_KEY="phx_..."
npm run posthog:popup-controls-flag
npm run posthog:popup-controls-flag:update
npm run posthog:popup-controls-flag:reset
```

Buscar en PostHog: [feature flags → `sfoc_popup_controls`](https://eu.posthog.com/project/191202/feature_flags?search=sfoc_popup_controls)

---

## Ejemplos

### Aviso de mantenimiento (error, cada apertura, sin cerrar)

```json
{
  "version": 1,
  "notice": {
    "enabled": true,
    "es": "Mantenimiento programado. Compare no estará disponible hasta las 18:00 CET.",
    "en": "Scheduled maintenance. Compare will be unavailable until 6:00 PM CET.",
    "severity": "error",
    "frequency": "always",
    "dismissible": false
  },
  "openApp": { "disabled": false }
}
```

### Desactivar acceso a Compare desde el popup

```json
{
  "version": 1,
  "notice": { "enabled": false },
  "openApp": {
    "disabled": true,
    "message": {
      "es": "Compare no disponible temporalmente",
      "en": "Compare temporarily unavailable",
      "severity": "error"
    }
  }
}
```

### Aviso informativo una sola vez (por defecto al crear el flag)

El script `posthog:popup-controls-flag` crea el payload con el texto de telemetría actual, `frequency: once`, `severity: info` y `dismissible: true`.

---

## Código relacionado

- Parser: [`shared/popupControls.js`](../shared/popupControls.js)
- Loader PostHog: [`shared/posthogPopupControlsFlag.js`](../shared/posthogPopupControlsFlag.js)
- UI: [`popup/popup.js`](../popup/popup.js)
- Persistencia dismiss: [`shared/onboardingPrefs.js`](../shared/onboardingPrefs.js) (`popupNoticeDismissedFingerprint`)

Cuando cambias el texto del aviso en PostHog, el fingerprint cambia y los usuarios que ya lo cerraron (`frequency: once`) volverán a verlo.
