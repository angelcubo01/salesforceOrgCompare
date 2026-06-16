import './loadProjectEnv.mjs';

/**
 * Crea o actualiza el feature flag remoto `sfoc_feature_controls` en PostHog EU.
 *
 * Panel de control operativo (kill switch): ocultar herramientas/modos, avisos y
 * bloqueo de acciones vía payload JSON. Rollout 100 %; el comportamiento se cambia
 * editando el payload, no el porcentaje.
 *
 * Ejemplos de payload en incidente:
 *   Ocultar tests:  { "version": 1, "tools": { "ApexTests": { "hidden": true } } }
 *   Aviso bloqueante: { "tools": { "ApexTests": { "message": { "es": "...", "en": "...", "severity": "error", "blocking": true } } } }
 *   Cortar deploys: { "actions": { "deploy": { "disabled": true, "message": { "es": "Deploy deshabilitado", "en": "Deploy disabled", "severity": "error" } } } }
 *
 * Uso:
 *   $env:POSTHOG_PERSONAL_API_KEY="phx_..."
 *   node scripts/createPosthogFeatureControlsFlag.mjs
 *   node scripts/createPosthogFeatureControlsFlag.mjs --update
 *   node scripts/createPosthogFeatureControlsFlag.mjs --update --smoke-test
 *   node scripts/createPosthogFeatureControlsFlag.mjs --update --reset
 *   node scripts/createPosthogFeatureControlsFlag.mjs --update --production
 */
import { buildProductionFeatureControlsPayload } from '../shared/featureControlsProductionPayload.js';
import { parseFeatureControlsPayload } from '../shared/featureControls.js';

const API_HOST = 'https://eu.posthog.com';
const FLAG_KEY = 'sfoc_feature_controls';
const UPDATE = process.argv.includes('--update');
const SMOKE_TEST = process.argv.includes('--smoke-test');
const RESET = process.argv.includes('--reset');
const PRODUCTION = process.argv.includes('--production');
const PERSONAL_KEY =
  process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_WIZARD_API_KEY || '';

/** Rollout 100 %: todos reciben el flag; restricciones solo si el payload las define. */
const DEFAULT_ROLLOUT_PERCENTAGE = Number(process.env.SFOC_FEATURE_CONTROLS_ROLLOUT || 100);

const EMPTY_PAYLOAD = {
  version: 1,
  global: null,
  modes: {},
  tools: {},
  metadataTypes: {},
  actions: {}
};

/** Mismo JSON que docs/SFOC_FEATURE_CONTROLS.md → Prueba rápida */
const SMOKE_TEST_PAYLOAD = {
  version: 1,
  global: {
    message: {
      es: '[TEST] Aviso global — smoke test kill switch',
      en: '[TEST] Global notice — kill switch smoke test',
      severity: 'info',
      blocking: false,
      url: 'https://eu.posthog.com/project/191202/feature_flags/204164'
    }
  },
  modes: {
    manifests: { hidden: true }
  },
  tools: {
    ApexTests: { hidden: true },
    QuickEdit: {
      message: {
        es: '[TEST] Aviso no bloqueante en Quick Edit',
        en: '[TEST] Non-blocking notice on Quick Edit',
        severity: 'warn',
        blocking: false
      }
    },
    AnonymousApex: {
      message: {
        es: '[TEST] Overlay bloqueante en Apex anónimo',
        en: '[TEST] Blocking overlay on Anonymous Apex',
        severity: 'error',
        blocking: true
      }
    }
  },
  metadataTypes: {
    Profile: { hidden: true }
  },
  actions: {
    deploy: {
      disabled: true,
      message: {
        es: '[TEST] Deploy deshabilitado',
        en: '[TEST] Deploy disabled',
        severity: 'error'
      }
    },
    retrieve: {
      disabled: true,
      message: {
        es: '[TEST] Retrieve deshabilitado',
        en: '[TEST] Retrieve disabled',
        severity: 'error'
      }
    },
    compare_run: {
      disabled: true,
      message: {
        es: '[TEST] Comparación con retrieve deshabilitada',
        en: '[TEST] Compare with retrieve disabled',
        severity: 'error'
      }
    },
    anonymous_apex_execute: {
      disabled: true,
      message: {
        es: '[TEST] Ejecución Apex anónimo deshabilitada',
        en: '[TEST] Anonymous Apex execution disabled',
        severity: 'error'
      }
    }
  }
};

function parseExistingPayload(raw) {
  if (!raw) return null;
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parseFeatureControlsPayload(value);
  } catch {
    return null;
  }
}

/**
 * @param {import('../shared/featureControls.js').FeatureControlsConfig | null | undefined} existing
 */
function resolveDefaultPayload(existing) {
  if (RESET) return EMPTY_PAYLOAD;
  if (SMOKE_TEST) return SMOKE_TEST_PAYLOAD;
  if (PRODUCTION) return buildProductionFeatureControlsPayload(existing);
  return EMPTY_PAYLOAD;
}

if (!PERSONAL_KEY.startsWith('phx_')) {
  console.error(
    'Falta POSTHOG_PERSONAL_API_KEY (phx_...). Créala en PostHog EU → Settings → Personal API keys.'
  );
  process.exit(1);
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_HOST}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${PERSONAL_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(
      `${res.status} ${res.statusText}: ${typeof body === 'string' ? body : JSON.stringify(body)}`
    );
  }
  return body;
}

async function resolveProjectId() {
  if (process.env.POSTHOG_PROJECT_ID) return String(process.env.POSTHOG_PROJECT_ID);
  const projects = await api('/api/projects/');
  const list = projects?.results || [];
  if (list.length === 1) return String(list[0].id);
  const match = list.find((p) => /org compare/i.test(String(p.name || '')));
  if (match) return String(match.id);
  if (list.length > 1) {
    throw new Error('Varios proyectos: define POSTHOG_PROJECT_ID');
  }
  throw new Error('No se encontró ningún proyecto PostHog');
}

/**
 * @param {import('../shared/featureControls.js').FeatureControlsConfig} payload
 */
function flagBody(payload) {
  return {
    key: FLAG_KEY,
    name: 'SFOC — control remoto de herramientas (kill switch)',
    filters: {
      groups: [{ properties: [], rollout_percentage: DEFAULT_ROLLOUT_PERCENTAGE }],
      payloads: {
        true: JSON.stringify(payload)
      }
    },
    active: true,
    tags: ['sfoc', 'ops', 'kill-switch'],
    ensure_experience_continuity: false
  };
}

async function findExistingFlag(projectId) {
  const data = await api(`/api/projects/${projectId}/feature_flags/?search=${FLAG_KEY}`);
  const rows = data?.results || [];
  return rows.find((f) => f.key === FLAG_KEY) || null;
}

async function main() {
  const projectId = await resolveProjectId();
  console.log('Proyecto:', projectId);

  const modeCount = [SMOKE_TEST, RESET, PRODUCTION].filter(Boolean).length;
  if (modeCount > 1) {
    console.error('Usa solo uno: --smoke-test, --reset o --production');
    process.exit(1);
  }

  const existing = await findExistingFlag(projectId);
  const existingPayload = parseExistingPayload(existing?.filters?.payloads?.true || existing?.payload);
  const payload = resolveDefaultPayload(existingPayload);

  if (existing && !UPDATE) {
    console.log(`Flag "${FLAG_KEY}" ya existe (id ${existing.id}). Usa --update para actualizar.`);
    const rollout = existing.filters?.groups?.[0]?.rollout_percentage;
    console.log('Rollout actual:', rollout ?? '?', '%');
    console.log('Payload actual:', JSON.stringify(existing.filters?.payloads?.true || existing.payload, null, 2));
    console.log(`\nhttps://eu.posthog.com/project/${projectId}/feature_flags/${existing.id}`);
    return;
  }

  const body = flagBody(payload);
  if (existing && UPDATE) {
    const updated = await api(`/api/projects/${projectId}/feature_flags/${existing.id}/`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    console.log('Flag actualizado:', updated.key, updated.id);
  } else {
    const created = await api(`/api/projects/${projectId}/feature_flags/`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    console.log('Flag creado:', created.key, created.id);
  }

  console.log('\nRollout inicial:', DEFAULT_ROLLOUT_PERCENTAGE, '%');
  if (SMOKE_TEST) console.log('Modo: smoke test (prueba rápida)');
  if (RESET) console.log('Modo: reset (sin restricciones)');
  if (PRODUCTION) console.log('Modo: producción (avisos beta en herramientas configuradas)');
  console.log('Payload cuando true:', JSON.stringify(payload, null, 2));
  console.log(`\nEditar payload: https://eu.posthog.com/project/${projectId}/feature_flags?search=${FLAG_KEY}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
