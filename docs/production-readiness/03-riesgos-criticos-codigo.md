# 03 — Riesgos críticos de código

Hallazgos de código ordenados por prioridad (P0–P3) con ubicación exacta, impacto y solución propuesta.

---

## P0 — Bloqueantes operativos

### P0-1: Deploy a producción sin guard en service worker

| Campo | Valor |
|-------|-------|
| **Prioridad** | P0 |
| **Severidad** | Crítica operativa |
| **Estado** | Abierto |

**Ubicación UI (bloqueo presente):**
- [`code/ui/quickEditPanel.js`](../../code/ui/quickEditPanel.js) — comprueba `isCurrentOrgSandbox()` antes de deploy
- [`code/ui/lightningQuickEditPanel.js`](../../code/ui/lightningQuickEditPanel.js) — mismo patrón

**Ubicación SW (sin bloqueo):**
- [`background/messageHandlers.js:1056`](../../background/messageHandlers.js) — `metadata:deploy`
- [`background/messageHandlers.js:1118`](../../background/messageHandlers.js) — `metadata:deployBundle`

El handler de deploy valida feature controls y SID, pero **no comprueba si la org es sandbox**:

```javascript
case 'metadata:deploy': {
  const { orgId, metadataType, memberName, content, fileName, checkOnly, async: deployAsync } = message;
  const saved = await loadSavedOrgs();
  const org = saved[orgId];
  // ... resuelve sid, despliega con testLevel: 'NoTestRun'
}
```

**Riesgo:** Cualquier página de extensión de confianza puede invocar `metadata:deploy` con `checkOnly: false` y desplegar en producción si la sesión es válida. La UI bloquea, pero el SW no es la última línea de defensa.

**Solución propuesta:**
```javascript
if (!checkOnly) {
  const orgInfo = await getOrganizationInfo(org.instanceUrl, sid);
  if (!orgInfo?.IsSandbox) {
    return reply({ ok: false, reason: 'PRODUCTION_DEPLOY_BLOCKED' });
  }
}
```
Aplicar en ambos handlers `metadata:deploy` y `metadata:deployBundle`. No confiar en `saved[orgId].isSandbox`.

---

### P0-2: Flag isSandbox manipulable

| Campo | Valor |
|-------|-------|
| **Prioridad** | P0 |
| **Severidad** | Crítica operativa |
| **Estado** | Abierto |

**Ubicación:**
- [`background/messageHandlers.js:496`](../../background/messageHandlers.js) — `addOrg`
- [`background/messageHandlers.js:577`](../../background/messageHandlers.js) — `orgs:importConfig`

Al añadir o importar una org, el valor `isSandbox` del mensaje/cliente se persiste directamente sin verificar contra la API de Salesforce.

**Riesgo:** Importar JSON con `"isSandbox": true` para una org de producción desbloquea deploy en Quick Edit UI aunque la org sea producción real.

**Solución propuesta:**
- Tras guardar org, llamar `getOrganizationInfo()` con SID válido y actualizar `isSandbox` desde la respuesta API.
- Aplicar en `addOrg`, `orgs:importConfig` y `syncOrgsFromActiveTab`.
- Usar siempre el valor API como fuente de verdad en guards de deploy.

---

## P1 — Alto impacto

### P1-1: Feature controls bypass en lectura de metadata

| Campo | Valor |
|-------|-------|
| **Prioridad** | P1 |
| **Estado** | Abierto |

**Definición:** [`shared/featureControls.js`](../../shared/featureControls.js) define acciones `retrieve` y `compare_run`.

**Enforcement en SW (presente):**
- `retrieve:begin` → `featureControlBlockedResponse('retrieve')`
- `metadata:retrieve*` (PermissionSet, Profile, FlexiPage, PackageXml) → `retrieve`
- `metadata:deploy*` → `deploy` / `quick_edit_save`
- `apexTests:run` → `apex_test_run`
- `anonymousApex:execute` → `anonymous_apex_execute`

**Enforcement en SW (ausente):**
- `searchIndex` (línea 613)
- `quickOpen:buildIndex` (línea 638)
- `fetchSource` (línea 662)
- Acción `compare_run` — **no se comprueba en ningún handler**

**Enforcement en UI (presente):**
- [`code/flows/retrieveFlow.js`](../../code/flows/retrieveFlow.js) — `guardToolAction('compare_run')` y `guardToolAction('retrieve')`

**Riesgo:** Con `retrieve` o `compare_run` deshabilitados remotamente vía PostHog, la comparación sigue funcionando llamando `fetchSource` / `searchIndex` directamente al SW.

**Solución propuesta:**
- Añadir `featureControlBlockedResponse('retrieve')` a `searchIndex`, `quickOpen:buildIndex`, `fetchSource`.
- Añadir check de `compare_run` en handlers de comparación o unificar bajo `retrieve`.
- Pasar `message.lang` del cliente para mensajes de bloqueo localizados.

---

### P1-2: Popup controls sin actualización en vivo

| Campo | Valor |
|-------|-------|
| **Prioridad** | P1 |
| **Estado** | Abierto |

**Ubicación:**
- [`shared/posthogPopupControlsFlag.js:86`](../../shared/posthogPopupControlsFlag.js) — `hookPopupControlsOnFeatureFlags()` definido
- [`popup/popup.js`](../../popup/popup.js) — **nunca invoca** el hook

Solo se llama `loadPopupControlsFromPosthog()` una vez en init del popup.

**Comparación:** [`code/code.js`](../../code/code.js) sí hace `bootstrapFeatureControls` + eventos en vivo para feature controls de la app principal.

**Riesgo:** Cambios remotos en PostHog (deshabilitar "Abrir app", mostrar avisos) no se aplican hasta reabrir el popup.

**Solución propuesta:**
```javascript
hookPopupControlsOnFeatureFlags(getPosthogClient(), (config) => {
  applyPopupControlsFromConfig(config);
});
```

---

### P1-3: debugLogs:deleteAll sin feature control

| Campo | Valor |
|-------|-------|
| **Prioridad** | P1 |
| **Estado** | Abierto |

**Ubicación:** [`background/messageHandlers.js:2200`](../../background/messageHandlers.js)

Operación destructiva (borra todos los debug logs de la org) sin `featureControlBlockedResponse`. Solo páginas de extensión pueden invocarlo (`trustedSender`), pero no hay kill switch remoto.

**Solución propuesta:** Añadir acción `debug_logs_delete_all` en feature controls o reutilizar flag global blocking.

---

## P2 — Robustez y calidad

### P2-1: Promesas sin catch en popup

**Ubicación:** [`popup/popup.js`](../../popup/popup.js) — `bg()` sin try/catch

```javascript
async function bg(message) {
  return await chrome.runtime.sendMessage(message);
}
```

Usado en drag-reorder, add/remove org, reauth. Si el SW está caído → unhandled rejection.

**Solución:** Reutilizar patrón de [`code/core/bridge.js`](../../code/core/bridge.js) con try/catch y `{ ok: false, error }`.

---

### P2-2: setInterval async sin protección

**Ubicación:** [`code/code.js:295`](../../code/code.js)

```javascript
setInterval(async () => {
  const auth = await bg({ type: 'auth:getStatuses', force: true });
  ...
}, 600000);
```

Sin try/catch → rechazo no manejado cada 10 min si falla el bridge.

**Solución:** Envolver en IIFE con try/catch o usar `.catch()`.

---

### P2-3: apexLogContextCache sin límite

**Ubicación:** [`background/messageHandlers.js`](../../background/messageHandlers.js) — `apexLogContextCache` Map

Crece indefinidamente con cada log consultado en el service worker.

**Solución:** LRU con tope (~200 entradas) o TTL, como en [`background/caches.js`](../../background/caches.js).

---

### P2-4: XML sin escapar en retrieve SOAP

**Ubicación:** [`shared/metadataRetrieve.js:164`](../../shared/metadataRetrieve.js)

```javascript
`<members>${memberFullName}</members>` +
`<name>${typeName}</name>` +
```

`createDeployZipBase64` sí usa `escapeXmlText`. Inconsistencia que puede romper SOAP con nombres especiales (`&`, `<`).

**Solución:** `escapeXmlText(memberFullName)` y `escapeXmlText(typeName)`.

---

### P2-5: testLevel NoTestRun fijo en deploy

**Ubicación:** [`background/messageHandlers.js:1080`](../../background/messageHandlers.js)

```javascript
deployOptions: {
  checkOnly: !!checkOnly,
  testLevel: 'NoTestRun'
}
```

En sandboxes con políticas estrictas puede fallar. En producción (si se saltara el guard P0-1) sería especialmente peligroso.

**Solución:** Configurar `testLevel` según tipo de org y preferencias de usuario. Nunca `NoTestRun` en producción.

---

### P2-6: Carreras en caché y deploys concurrentes

**searchIndex:** Dos peticiones paralelas con cache miss disparan dos llamadas API ([`messageHandlers.js:621`](../../background/messageHandlers.js)).

**Deploys:** Varios `metadata:deploy` simultáneos a la misma org sin serialización.

**fetchSource vs cancel:** `fetchSource` no respeta `retrieveGeneration` al cancelar compare.

**Solución:**
- Patrón in-flight promise por clave de caché (deduplicación).
- Cola/mutex por `orgId` para operaciones mutantes.
- Pasar `retrieveGeneration` a `fetchSource`.

---

### P2-7: posthogPopupControlsFlag sin .catch

**Ubicación:** [`shared/posthogPopupControlsFlag.js:90`](../../shared/posthogPopupControlsFlag.js)

```javascript
void loadPopupControlsFromPosthog(ph).then((config) => { ... });
```

**Solución:** `.catch(() => { cachedConfig = { ...DEFAULT_POPUP_CONTROLS }; })`.

---

### P2-8: Inicialización popup sin catch global

**Ubicación:** [`popup/popup.js:521`](../../popup/popup.js)

IIFE async de init sin try/catch global. Si `refresh()` falla, popup queda parcialmente roto.

---

### P2-9: renderSaved sin null check

**Ubicación:** [`popup/popup.js:284`](../../popup/popup.js)

`document.getElementById('savedList')` usado sin comprobar existencia.

---

## P3 — i18n y UX de errores

### P3-1: Errores del SW en inglés

**Ubicación:** [`background/messageHandlers.js`](../../background/messageHandlers.js)

Mensajes hardcodeados:
- `'Request failed. Please retry or re-authenticate.'`
- `'Org not saved'`, `'Org not found'`
- `'UNKNOWN_MESSAGE'`

**Solución:** Códigos de error estables (`reason: 'NO_SID'`) y traducción en UI con `t()`.

---

### P3-2: featureControlsGuard idioma fijo

**Ubicación:** [`background/featureControlsGuard.js:33`](../../background/featureControlsGuard.js)

```javascript
export function featureControlBlockedResponse(actionId, lang = 'es') {
```

Usuarios en inglés reciben mensajes de bloqueo en español desde el background.

**Solución:** `message.lang` desde el cliente o `getCurrentLang()` persistido en storage.

---

### P3-3: Errores mezclados ES/EN en metadataRetrieve

**Ubicación:** [`shared/metadataRetrieve.js`](../../shared/metadataRetrieve.js)

Mensajes como `Deploy agotó el tiempo...` en español mezclados con errores SW en inglés.

**Solución:** Catálogo `errors.*` compartido SW/UI; script CI que compare claves `es` vs `en`.

---

## Aspectos positivos detectados

| Aspecto | Ubicación |
|---------|-----------|
| try/catch global en onMessage | `messageHandlers.js` |
| `replyHandlerError` con telemetría clasificada | `messageHandlers.js` |
| Cancelación retrieve por generación | `retrieveSession.js` |
| `rollbackOnError: true` en deploy | `metadataRetrieve.js` |
| Quick Edit bloquea producción en UI | `quickEditPanel.js` |
| deleteAll logs pide confirmación | `debugLogBrowserPanel.js` |
| Bridge con manejo de errores | `code/core/bridge.js` |
| Feature controls en vivo en app principal | `code/code.js` |

---

## Resumen priorizado

| Prioridad | ID | Hallazgo | Esfuerzo |
|-----------|-----|----------|----------|
| P0 | P0-1 | Deploy producción sin guard SW | S |
| P0 | P0-2 | isSandbox manipulable | S |
| P1 | P1-1 | Feature controls bypass | M |
| P1 | P1-2 | Popup controls sin hook en vivo | S |
| P1 | P1-3 | deleteAll sin feature control | S |
| P2 | P2-1–P2-9 | Async, cache, XML, deploy opts | M |
| P3 | P3-1–P3-3 | i18n errores SW | L |

Ver [06-plan-remediacion.md](./06-plan-remediacion.md) para criterios de aceptación y riesgo residual.
