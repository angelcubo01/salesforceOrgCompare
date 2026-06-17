# 02 — Seguridad y privacidad

Análisis de seguridad y privacidad para el lanzamiento a producción de Salesforce Org Compare.

---

## Resumen

| Severidad | Cantidad |
|-----------|----------|
| Critical | 0 |
| High | 6 |
| Medium | 10 |
| Low | 2 |

No se detectaron secretos de producción commiteados en el repositorio. El modelo de autenticación basado en cookies es adecuado para una extensión de sesión de navegador. Los mayores riesgos están en **telemetría PostHog** (opt-out parcial, metadatos enviados), **almacenamiento local de código/metadata** y **XSS puntual**.

---

## Controles existentes (aspectos positivos)

| Control | Archivo | Descripción |
|---------|---------|-------------|
| Validación remitente | [`shared/trustedSender.js`](../../shared/trustedSender.js) | Solo acepta mensajes de `chrome-extension://{id}/` |
| Dominios SF allowlist | [`shared/sfDomains.js`](../../shared/sfDomains.js) | Sufijos permitidos para cookies y API |
| Escape HTML | [`shared/htmlEscape.js`](../../shared/htmlEscape.js) | Función centralizada `escapeHtml()` |
| Sanitización errores UI | [`shared/sanitizeUiError.js`](../../shared/sanitizeUiError.js) | Limpia mensajes antes de mostrar al usuario |
| Config telemetría gitignored | [`.gitignore`](../../.gitignore), [`shared/telemetryConfig.example.js`](../../shared/telemetryConfig.example.js) | Clave PostHog no en repo |
| SID no en storage | [`background/orgHelpers.js`](../../background/orgHelpers.js) | Cookie solo en runtime |
| Export orgs sin credenciales | [`background/messageHandlers.js`](../../background/messageHandlers.js) | `sanitizeOrgForConfigExport` |
| CSP restrictiva | [`manifest.json`](../../manifest.json) | `script-src 'self'`, sin `unsafe-eval` |
| Sin eval en código propio | — | No hay `eval()` ni `new Function()` |
| Errores API enmascarados | [`background/messageHandlers.js`](../../background/messageHandlers.js) | Mensaje genérico en muchos handlers |
| Allowlists telemetría | [`shared/usageLogEntry.js`](../../shared/usageLogEntry.js) | Filtra propiedades de eventos de uso |

---

## Hallazgos detallados

### SEC-01: Excepciones PostHog ignoran opt-out

| Campo | Valor |
|-------|-------|
| **Severidad** | High |
| **Archivo** | [`background/posthogTelemetry.js:416`](../../background/posthogTelemetry.js) |
| **Estado** | Abierto |

**Descripción:** `sendPosthogException()` no comprueba `telemetryEnabled` antes de enviar eventos `$exception` a PostHog. Solo verifica `isPosthogConfigured()`.

En contraste, `sendPosthogOperationalFailure()` sí respeta el opt-out (líneas 447–449).

La captura temprana en [`shared/installEarlyExceptionCapture.js`](../../shared/installEarlyExceptionCapture.js) documenta que el error tracking es independiente del opt-out.

**Impacto:** Usuarios que desactivan telemetría en Ajustes siguen enviando excepciones (mensaje hasta 2000 chars, stack hasta 8000 chars) a PostHog EU.

**Solución propuesta:**
1. Añadir check `telemetryEnabled` en `sendPosthogException()` y `installEarlyExceptionCapture`, **o**
2. Documentar explícitamente en la política de privacidad y en Ajustes que el error tracking es un canal separado.
3. Limitar propiedades enviadas (ver SEC-02).

---

### SEC-02: Contexto arbitrario en telemetry:exception

| Campo | Valor |
|-------|-------|
| **Severidad** | High |
| **Archivo** | [`background/messageHandlers.js:787`](../../background/messageHandlers.js) |
| **Estado** | Abierto |

**Descripción:** El handler `telemetry:exception` acepta `message.context` como objeto arbitrario y lo fusiona en el payload PostHog sin allowlist.

**Solución propuesta:** Allowlist de propiedades (`artifact_type`, `phase`, `error_handled`). Reutilizar patrón de [`shared/usageLogEntry.js`](../../shared/usageLogEntry.js).

---

### SEC-03: Metadata en storage local sin cifrar

| Campo | Valor |
|-------|-------|
| **Severidad** | High |
| **Archivo** | [`code/core/persistence.js:38`](../../code/core/persistence.js) |
| **Estado** | Abierto |

**Descripción:** `savedCodeItems` en `chrome.storage.local` contiene código/metadata completo sin cifrar.

**Solución propuesta:** Advertencia en UI, opción "no persistir historial", documentar en política de privacidad.

---

### SEC-04: XSS en Dependency Explorer

| Campo | Valor |
|-------|-------|
| **Severidad** | Medium |
| **Archivo** | [`code/ui/dependencyExplorerPanel.js:553`](../../code/ui/dependencyExplorerPanel.js) |
| **Estado** | Abierto |

**Solución propuesta:** `escapeHtml(row.name)`.

---

### SEC-05: XSS en Apex Log Viewer

| Campo | Valor |
|-------|-------|
| **Severidad** | Medium |
| **Archivo** | [`code/apex-log-viewer.js:99`](../../code/apex-log-viewer.js) |
| **Estado** | Abierto |

**Solución propuesta:** Escapar `parts` con `escapeHtml()`.

---

### SEC-06: errorMessage de deploy sin sanitizar

| Campo | Valor |
|-------|-------|
| **Severidad** | Medium |
| **Archivo** | [`background/messageHandlers.js:1110`](../../background/messageHandlers.js) |
| **Estado** | Abierto |

**Solución propuesta:** Pasar por `sanitizeUiError` en respuestas de deploy.

---

### SEC-07: Clave PostHog embebida en CRX

| Campo | Valor |
|-------|-------|
| **Severidad** | Medium |
| **Archivo** | [`scripts/pack-chrome-store.ps1`](../../scripts/pack-chrome-store.ps1) |
| **Estado** | Documentado |

**Solución propuesta:** Restricciones dominio PostHog, rotación, monitorización cuota.

---

### SEC-08: CSP style-src unsafe-inline

| Campo | Valor |
|-------|-------|
| **Severidad** | Low |
| **Archivo** | [`manifest.json:48`](../../manifest.json) |
| **Estado** | Aceptable |

**Solución propuesta:** Documentar justificación en Chrome Web Store submission.

---

## Privacidad — datos enviados a PostHog

Ver [04-telemetria-y-feature-flags.md](./04-telemetria-y-feature-flags.md).

**Política:** [`PRIVACY_POLICY_URL`](../../code/core/constants.js)

**Recomendación enterprise:** Revisión legal/DPO antes de despliegue regulado.

---

## Matriz consolidada

| ID | Severidad | Hallazgo | Solución | Esfuerzo |
|----|-----------|----------|----------|----------|
| SEC-01 | High | `$exception` ignora opt-out | Check o documentar política | S |
| SEC-02 | High | Contexto arbitrario | Allowlist propiedades | S |
| SEC-03 | High | Código en storage sin cifrar | Advertencia + opción no persistir | M |
| SEC-04 | Medium | XSS dependency explorer | escapeHtml | S |
| SEC-05 | Medium | XSS apex log viewer | escapeHtml | S |
| SEC-06 | Medium | errorMessage sin sanitizar | sanitizeUiError | S |
| SEC-07 | Medium | phc_* en CRX | Restricciones PostHog | S (ops) |
| SEC-08 | Low | unsafe-inline CSP | Documentar | S (docs) |
