# 05 — Testing, CI y operaciones

Estado de tests, cobertura, pipeline CI y checklist de release.

---

## Estado actual de tests

**Ejecutado:** junio 2026  
**Framework:** Vitest 3.2.4  
**Resultado:** **57 archivos, 365 tests — todos pasando**

```
Test Files  57 passed (57)
     Tests  365 passed (365)
  Duration  ~19s
```

**Nota:** Warnings de source maps faltantes en `vendor/posthog-js/dist/` (no afectan resultado).

---

## Configuración de tests

Archivo: [`vitest.config.js`](../../vitest.config.js)

| Parámetro | Valor |
|-----------|-------|
| Entorno | `node` |
| Include | `tests/**/*.test.js` |
| Setup | [`tests/setup.js`](../../tests/setup.js) — mock `chrome.storage`, carga global `Diff` |
| Pretest | [`scripts/ensureTelemetryConfig.mjs`](../../scripts/ensureTelemetryConfig.mjs) |

### Cobertura configurada (v8)

**Incluye:**
- `shared/**/*.js`
- `code/lib/**/*.js`
- `code/editor/diffUtils.js`

**Excluye:**
- `background/**`
- `code/ui/**`
- `code/code.js`, `popup/**`
- `vendor/**`

Ejecutar cobertura: `npm run test:coverage`

---

## Inventario de tests por área

### API y dominio Salesforce (12 archivos)

| Archivo | Tests | Área |
|---------|-------|------|
| `salesforceApi.test.js` | 25 | REST, SOQL, límites, logs |
| `salesforceRestErrors.test.js` | 9 | Errores REST |
| `metadataRetrieve` (indirecto) | — | Via deploy tests |
| `deployStatusRunTest.test.js` | 2 | Poll deploy status |
| `dependencyExplorer.test.js` | 21 | Explorador dependencias |
| `permissionsDiffCore.test.js` | 10 | Diff permisos |
| `recordCompareCore.test.js` | 9 | Comparación registros |
| `recordCompareApi.test.js` | 2 | API record compare |
| `setupRecordsCompareCore.test.js` | 12 | Custom settings/metadata |
| `setupRecordsCompareApi.test.js` | 1 | API setup records |
| `fieldHistoryApi.test.js` | 11 | Field history |
| `trustStatusApi.test.js` | 5 | Trust status API |

### Apex tests hub (10 archivos)

| Archivo | Tests |
|---------|-------|
| `apexTestRunBodyApi.test.js` | 3 |
| `apexTestRunStatus.test.js` | 3 |
| `apexTestServletPick.test.js` | 4 |
| `apexTestJobIdMatch.test.js` | 2 |
| `apexTestRunJobPrune.test.js` | 2 |
| `apexTestRunProfilesCore.test.js` | 3 |
| `apexTestsExportCore.test.js` | 3 |
| `apexStackTraceParse.test.js` | 6 |
| `apexLogParser.test.js` | 7 |
| `timelineExport.test.js` | 3 |

### Diffs y comparador (4 archivos)

| Archivo | Tests |
|---------|-------|
| `unifiedDiffCore.test.js` | 3 |
| `alignedDiffCore.test.js` | 13 |
| `compareDeepLink.test.js` | 7 |
| `cache.test.js` | 6 |

### Telemetría y PostHog (18 archivos)

| Archivo | Tests |
|---------|-------|
| `posthogEventMap.test.js` | 19 |
| `posthogException.test.js` | 3 |
| `posthogFeatureFlagLoader.test.js` | 4 |
| `posthogFeatureControlsFlag.test.js` | 5 |
| `posthogPopupControlsFlag.test.js` | 4 |
| `posthogSupportFlag.test.js` | 9 |
| `posthogSupport.test.js` | 3 |
| `posthogCsatSurvey.test.js` | 7 |
| `posthogSessionReplay.test.js` | 10 |
| `telemetryInstallId.test.js` | 7 |
| `telemetryAudienceContext.test.js` | 4 |
| `telemetryOrgContext.test.js` | 3 |
| `telemetryUserContext.test.js` | 9 |
| `firstOrgConnectedTelemetry.test.js` | 4 |
| `usageLogEntry.test.js` | 5 |
| `errorTelemetryPolicy.test.js` | 6 |
| `installEarlyExceptionCapture.test.js` | 4 |
| `featureControlsProductionPayload.test.js` | 2 |

### Feature controls y popup (4 archivos)

| Archivo | Tests |
|---------|-------|
| `featureControls.test.js` | 14 |
| `popupControls.test.js` | 10 |
| `onboardingPrefs.test.js` | 16 |
| `quickEditDeployContext.test.js` | 2 |
| `lightningQuickEditDeploy.test.js` | 3 |

### Utilidades (9 archivos)

| Archivo | Tests |
|---------|-------|
| `utilities.test.js` | 15 |
| `htmlEscape.test.js` | 2 |
| `sanitizeUiError.test.js` | 3 |
| `sfDomains.test.js` | 2 |
| `trustedSender.test.js` | 2 |
| `i18n.test.js` | 6 |
| `toolNavGroups.test.js` | 6 |
| `orgSelectDefaults.test.js` | 3 |
| `landingDiscoverBanner.test.js` | 1 |

---

## Huecos de cobertura críticos

| Área | Riesgo | Impacto |
|------|--------|---------|
| **`background/messageHandlers.js`** | Sin tests directos | Router central ~70 mensajes sin validación automatizada |
| **`code/ui/*.js`** | Sin cobertura | ~30 paneles UI sin tests |
| **Flujos E2E Chrome** | No existen | Auth cookie, deploy real, retrieve no probados end-to-end |
| **Deploy a producción guard** | Solo test UI parcial | `lightningQuickEditDeploy.test.js` (3 tests) no cubre SW |
| **Feature controls SW bypass** | Sin test | `fetchSource` sin guard no detectado por CI |
| **Integración PostHog real** | Mockeado | CI usa config vacía |

---

## CI/CD

Archivo: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

```yaml
on:
  push: [main, master]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - setup-node (22, cache npm)
      - npm ci
      - npm test
```

### Gaps del pipeline

| Gap | Severidad | Recomendación |
|-----|-----------|---------------|
| Solo `npm test` | Medium | Añadir `npm audit` |
| Sin linting (ESLint) | Low | Añadir ESLint o biome |
| Sin validación manifest | Medium | Script que valide JSON + versiones alineadas |
| Sin empaquetado Chrome | Medium | `pack:chrome` en CI (dry-run) |
| Sin comparación claves i18n | Medium | Script `es` vs `en` en `shared/i18n.js` |
| Sin secret scanning | Medium | GitHub secret scanning / gitleaks |
| Sin Dependabot | Low | Configurar actualizaciones dependencias |
| Sin SAST | Low | CodeQL u equivalente |

---

## Operaciones de release

### Empaquetado Chrome Web Store

Script: [`scripts/pack-chrome-store.ps1`](../../scripts/pack-chrome-store.ps1)  
Minificación: [`scripts/minify-extension.mjs`](../../scripts/minify-extension.mjs) (esbuild, archivo a archivo)  
npm: `npm run pack:chrome`

**Requisitos:**
- `shared/telemetryConfig.js` debe existir (gitignored, con clave `phc_*` válida)
- Incluye: manifest, background, popup, code, shared, vendor, assets, icons
- `npm install` (dependencia `esbuild` para minificar el JS propio)

**Minificación en el pack:**
- `pack:chrome` minifica `background.js`, `background/`, `code/`, `popup/` y `shared/` antes de crear el ZIP
- `vendor/` no se modifica (Monaco, PostHog, etc. ya vienen minificados)
- Los tests (`vitest`) siguen ejecutándose sobre el código fuente sin minificar
- Para depurar sin minificar: `.\scripts\pack-chrome-store.ps1 -SkipMinify`
- Probar minificación local: `node scripts/minify-extension.mjs <carpeta-staging>`

**Desalineación detectada:**
- [`manifest.json`](../../manifest.json): versión **2.11**
- [`package.json`](../../package.json): versión **2.5.0**

**Acción:** Alinear versiones antes de cada release.

### Configuración telemetría

1. Copiar `shared/telemetryConfig.example.js` → `shared/telemetryConfig.js`
2. Rellenar `POSTHOG_API_KEY` con clave de proyecto
3. No commitear el archivo real

### Flags PostHog pre-release

Verificar en PostHog EU antes de publicar:

- [ ] `sfoc_feature_controls` — payload correcto o desactivado
- [ ] `sfoc_popup_controls` — sin avisos bloqueantes inesperados
- [ ] Session replay flag — estado deseado
- [ ] CSAT survey — activa solo si se desea
- [ ] Support widget — estado deseado

---

## Checklist pre-release

### Versionado y build

- [ ] `manifest.json` version = `package.json` version
- [ ] Changelog o release notes actualizados
- [ ] `npm test` — 365 tests pasando
- [ ] `telemetryConfig.js` configurado para producción
- [ ] `pack:chrome` genera ZIP sin errores

### Seguridad

- [ ] No hay secretos en el bundle (excepto `phc_*` esperado)
- [ ] Revisar hallazgos P0 en [03-riesgos-criticos-codigo.md](./03-riesgos-criticos-codigo.md)
- [ ] Política de privacidad accesible y actualizada

### PostHog

- [ ] Feature controls en estado deseado
- [ ] Popup controls verificados
- [ ] Cuota PostHog monitorizada

### Chrome Web Store

- [ ] Permisos justificados en listing
- [ ] Screenshots actualizados
- [ ] Política de privacidad URL en panel desarrollador
- [ ] Descripción menciona uso de cookies Salesforce

### Enterprise (opcional)

- [ ] Revisión DPO/legal completada
- [ ] Documentar opt-out de telemetría para usuarios
- [ ] Evaluar desactivar session replay

---

## Dependencias

Archivo: [`package.json`](../../package.json)

**Solo devDependencies:**
- `vitest` ^3.1.4
- `posthog-js` ^1.379.0 (también vendoreado en `vendor/posthog-js/`)

**No hay bundler** (Vite/Webpack en producción): la extensión carga ES modules nativos en el navegador.

**Implicación:** Tamaño de extensión incluye Monaco vendor completo. Sin minificación en build.

---

## Recomendaciones de mejora de testing

| Prioridad | Acción | Esfuerzo |
|-----------|--------|----------|
| P1 | Tests unitarios para guards deploy en `messageHandlers` (mock) | M |
| P1 | Test que verifique `featureControlBlockedResponse` en `fetchSource` | S |
| P2 | Tests para `orgs:importConfig` con `isSandbox` falso | S |
| P2 | Script CI comparación claves i18n | S |
| P3 | E2E con Puppeteer/Playwright para flujo básico extensión | L |
| P3 | Cobertura de `background/featureControlsGuard.js` | S |
