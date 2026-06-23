import './loadProjectEnv.mjs';

/**
 * Crea o actualiza el feature flag remoto `sfoc_popup_controls` en PostHog EU.
 *
 * Controla el aviso del popup de la extensión y el botón «Abrir aplicación».
 *
 * Uso:
 *   $env:POSTHOG_PERSONAL_API_KEY="phx_..."
 *   node scripts/createPosthogPopupControlsFlag.mjs
 *   node scripts/createPosthogPopupControlsFlag.mjs --update
 *   node scripts/createPosthogPopupControlsFlag.mjs --update --reset
 */
import { parsePopupControlsPayload } from '../shared/popupControls.js';

const API_HOST = 'https://eu.posthog.com';
const FLAG_KEY = 'sfoc_popup_controls';
const UPDATE = process.argv.includes('--update');
const RESET = process.argv.includes('--reset');
const PERSONAL_KEY =
  process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_WIZARD_API_KEY || '';

const DEFAULT_ROLLOUT_PERCENTAGE = Number(process.env.SFOC_POPUP_CONTROLS_ROLLOUT || 100);

const EMPTY_PAYLOAD = {
  version: 1,
  notice: { enabled: false },
  openApp: { disabled: false }
};

/** Aviso de telemetría por defecto (solo remoto vía PostHog; sin fallback local). */
const DEFAULT_PAYLOAD = {
  version: 1,
  notice: {
    enabled: true,
    es: 'Esta extensión puede recoger estadísticas anónimas de uso (qué herramientas utilizas y tu entorno de referencia). Nunca se envían credenciales, código ni datos de tus orgs. Puedes desactivarlo en Ajustes en cualquier momento.',
    en: 'This extension may collect anonymous usage statistics (which tools you use and your reference org). Your credentials, code, and org data are never sent. You can turn this off anytime in Settings.',
    severity: 'info',
    frequency: 'once',
    dismissible: true,
    dismissLabel: { es: 'Entendido', en: 'Got it' },
    minVersion: '2.13'
  },
  openApp: { disabled: false }
};

function resolveDefaultPayload() {
  if (RESET) return EMPTY_PAYLOAD;
  return DEFAULT_PAYLOAD;
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
 * @param {ReturnType<typeof parsePopupControlsPayload>} payload
 */
function flagBody(payload) {
  return {
    key: FLAG_KEY,
    name: 'SFOC — controles del popup de extensión',
    filters: {
      groups: [{ properties: [], rollout_percentage: DEFAULT_ROLLOUT_PERCENTAGE }],
      payloads: {
        true: JSON.stringify(payload)
      }
    },
    active: true,
    tags: ['sfoc', 'ops', 'popup'],
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

  const existing = await findExistingFlag(projectId);
  const payload = resolveDefaultPayload();

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
  if (RESET) console.log('Modo: reset (sin aviso remoto)');
  console.log('Payload cuando true:', JSON.stringify(payload, null, 2));
  console.log(`\nEditar payload: https://eu.posthog.com/project/${projectId}/feature_flags?search=${FLAG_KEY}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
