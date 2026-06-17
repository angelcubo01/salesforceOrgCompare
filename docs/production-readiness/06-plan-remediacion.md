# 06 — Plan de remediación

Plan consolidado de correcciones priorizado para el lanzamiento a producción. Incluye criterios de aceptación y riesgo residual si no se implementa antes del rollout.

**Alcance de este documento:** propuestas de solución. La implementación queda pendiente de PRs dedicados.

---

## Tabla priorizada

| Prioridad | ID | Acción | Esfuerzo | PR sugerido | Dependencias |
|-----------|-----|--------|----------|-------------|--------------|
| **P0** | P0-1 | Guard sandbox en SW para deploy | S | `fix/deploy-production-guard` | — |
| **P0** | P0-2 | Refrescar `isSandbox` desde API al guardar org | S | `fix/sandbox-flag-api` | — |
| **P1** | P1-1 | Feature controls en `fetchSource`/`searchIndex` | M | `fix/feature-controls-sw` | — |
| **P1** | P1-2 | Hook popup controls en vivo | S | `fix/popup-controls-live` | — |
| **P1** | SEC-01 | Respetar opt-out en `$exception` | S | `fix/telemetry-optout-exceptions` | Decisión producto |
| **P1** | P1-3 | Feature control en `debugLogs:deleteAll` | S | `fix/debug-logs-feature-control` | P1-1 |
| **P2** | SEC-04/05 | Escapar innerHTML (XSS) | S | `fix/xss-escape` | — |
| **P2** | SEC-02 | Allowlist contexto excepciones | S | `fix/exception-context-allowlist` | SEC-01 |
| **P2** | SEC-06 | Sanitizar errorMessage deploy | S | `fix/sanitize-deploy-errors` | — |
| **P2** | P2-* | Async hardening, LRU cache, XML escape | M | `fix/async-hardening` | — |
| **P2** | VERSION | Alinear manifest.json y package.json | S | `chore/version-align` | — |
| **P3** | SEC-03 | Advertencia storage código local | M | `feat/storage-privacy-warning` | — |
| **P3** | P3-* | i18n errores SW + CI ampliado | L | `chore/i18n-errors-ci` | — |

**Esfuerzo:** S = horas, M = 1–2 días, L = varios días

---

## Detalle por ítem

### P0-1: Guard sandbox en SW para deploy

**Problema:** Deploy a producción bloqueado solo en UI, no en service worker.

**Archivos a modificar:**
- [`background/messageHandlers.js`](../../background/messageHandlers.js) — casos `metadata:deploy`, `metadata:deployBundle`

**Implementación:**
```javascript
if (!checkOnly) {
  const orgInfo = await getOrganizationInfo(org.instanceUrl, sid);
  if (!orgInfo?.IsSandbox) {
    return reply({ ok: false, reason: 'PRODUCTION_DEPLOY_BLOCKED' });
  }
}
```

**Criterios de aceptación:**
- [ ] `metadata:deploy` con `checkOnly: false` contra org producción devuelve `PRODUCTION_DEPLOY_BLOCKED`
- [ ] `metadata:deploy` con `checkOnly: true` (validate) funciona en producción
- [ ] Deploy en sandbox sigue funcionando
- [ ] Test unitario con mock de `getOrganizationInfo`

**Riesgo residual si no se implementa:** Deploy accidental a producción vía mensaje directo al SW. **Inaceptable para enterprise.**

---

### P0-2: Refrescar isSandbox desde API

**Problema:** `isSandbox` manipulable al importar/añadir orgs.

**Archivos a modificar:**
- [`background/messageHandlers.js`](../../background/messageHandlers.js) — `addOrg`, `orgs:importConfig`, `syncOrgsFromActiveTab`

**Implementación:** Tras guardar org con SID válido, llamar `getOrganizationInfo()` y actualizar `isSandbox` desde respuesta API.

**Criterios de aceptación:**
- [ ] Importar JSON con `isSandbox: true` para org producción corrige el flag tras sync
- [ ] Quick Edit UI refleja estado real de sandbox
- [ ] Test con mock API

**Riesgo residual si no se implementa:** UI de deploy puede mostrar sandbox cuando la org es producción. **Alto para enterprise.**

---

### P1-1: Feature controls en lectura metadata

**Problema:** `fetchSource`, `searchIndex`, `quickOpen:buildIndex` no comprueban `retrieve`; `compare_run` no se aplica en SW.

**Archivos a modificar:**
- [`background/messageHandlers.js`](../../background/messageHandlers.js)

**Implementación:** Añadir `featureControlBlockedResponse('retrieve')` al inicio de cada handler. Evaluar unificar `compare_run` bajo `retrieve`.

**Criterios de aceptación:**
- [ ] Con flag `retrieve` disabled, `searchIndex` devuelve bloqueo
- [ ] Con flag `compare_run` disabled, comparación no puede cargar fuente
- [ ] Tests unitarios para cada handler

**Riesgo residual:** Kill switch remoto incompleto en incidentes. **Medio para operaciones.**

---

### P1-2: Hook popup controls en vivo

**Problema:** `hookPopupControlsOnFeatureFlags` nunca invocado.

**Archivos a modificar:**
- [`popup/popup.js`](../../popup/popup.js)

**Criterios de aceptación:**
- [ ] Cambio de flag PostHog aplica controles sin reabrir popup
- [ ] Fallback a defaults si PostHog falla

**Riesgo residual:** No se puede bloquear popup remotamente en tiempo real. **Bajo-medio.**

---

### SEC-01: Respetar opt-out en excepciones

**Problema:** `$exception` ignora `telemetryEnabled`.

**Opciones:**
1. **A)** Añadir check en `sendPosthogException` — respeta opt-out total
2. **B)** Documentar como canal separado en política y UI

**Criterios de aceptación (opción A):**
- [ ] Con telemetría desactivada, `sendPosthogException` no envía
- [ ] Test en `posthogException.test.js` o nuevo test

**Riesgo residual:** Incumplimiento percepción privacidad / GDPR. **Alto para enterprise regulado.**

---

### P1-3: Feature control deleteAll logs

**Archivos:** `messageHandlers.js` caso `debugLogs:deleteAll`

**Criterios de aceptación:**
- [ ] Nueva acción en feature controls o reutilizar flag global
- [ ] Con acción disabled, deleteAll devuelve bloqueo

---

### P2: XSS y sanitización

| ID | Archivo | Fix |
|----|---------|-----|
| SEC-04 | `dependencyExplorerPanel.js:553` | `escapeHtml(row.name)` |
| SEC-05 | `apex-log-viewer.js:99` | `escapeHtml` en parts |
| SEC-06 | `messageHandlers.js` deploy | `sanitizeUiError(errorMessage)` |
| SEC-02 | `messageHandlers.js:787` | Allowlist contexto |

**Riesgo residual:** XSS limitado en contexto extensión. **Bajo** pero corregible fácilmente.

---

### P2: Robustez async y memoria

| Ítem | Archivo | Fix |
|------|---------|-----|
| P2-1 | `popup/popup.js` | try/catch en `bg()` |
| P2-2 | `code/code.js` | try/catch en setInterval auth |
| P2-3 | `messageHandlers.js` | LRU en `apexLogContextCache` |
| P2-4 | `metadataRetrieve.js` | `escapeXmlText` en retrieve SOAP |
| P2-5 | `messageHandlers.js` | `testLevel` configurable |
| P2-6 | `messageHandlers.js` | Mutex deploy / dedup cache |
| P2-7 | `posthogPopupControlsFlag.js` | `.catch` en load |

---

### VERSION: Alinear versiones

**Acción:** Actualizar `package.json` a `2.11` o `manifest.json` según versión de release deseada.

**Criterios de aceptación:**
- [ ] Ambos archivos con misma versión semver
- [ ] CI valida alineación (script opcional)

---

### P3: i18n y CI

| Ítem | Acción |
|------|--------|
| P3-1 | Códigos error estables (`reason`) en SW |
| P3-2 | `message.lang` en mensajes al SW |
| P3-3 | Script CI comparación claves `es`/`en` |
| P3-4 | `npm audit` en CI |
| P3-5 | Validación manifest en CI |

---

### SEC-03: Advertencia storage local

**Acción:** Banner en primera comparación + opción en Ajustes "No guardar historial".

**Criterios de aceptación:**
- [ ] Usuario informado de que código se guarda localmente
- [ ] Opción desactiva `saveItemsToStorage`

---

## Roadmap sugerido

### Fase 1 — Pre-lanzamiento bloqueante (1–2 días)

1. P0-1 + P0-2 (deploy guards)
2. VERSION (alinear versiones)
3. SEC-04/05 (XSS rápido)

### Fase 2 — Pre-lanzamiento recomendado (2–3 días)

4. P1-1 (feature controls SW)
5. SEC-01 (opt-out excepciones — tras decisión producto)
6. P1-2 (popup controls live)
7. Tests para P0 items

### Fase 3 — Post-lanzamiento (1–2 semanas)

8. P2 robustez async/memoria
9. P3 i18n + CI ampliado
10. SEC-03 storage warning
11. E2E básico (opcional)

---

## Matriz riesgo residual vs lanzamiento

| Escenario | Sin Fase 1 | Con Fase 1 | Con Fase 1+2 |
|-----------|------------|------------|--------------|
| Deploy accidental producción | **Crítico** | Mitigado | Mitigado |
| Kill switch incompleto | Alto | Alto | Mitigado |
| Privacidad telemetría | Alto | Alto | Mitigado |
| XSS | Bajo | Bajo | Bajo |
| Enterprise CaixaBank | **No recomendado** | Con reservas | **Aceptable** |

---

## Veredicto final

| Audiencia | Recomendación |
|-----------|---------------|
| Usuarios individuales / devs | Lanzamiento aceptable tras Fase 1 |
| Equipos con sandboxes | Lanzamiento aceptable tras Fase 1 |
| Enterprise regulado (CaixaBank) | Requiere Fase 1 + Fase 2 + revisión DPO |
| Chrome Web Store público | Lanzamiento tras Fase 1 + VERSION |

Ver también: [README.md](./README.md) para resumen ejecutivo y enlaces a documentación operativa existente.
