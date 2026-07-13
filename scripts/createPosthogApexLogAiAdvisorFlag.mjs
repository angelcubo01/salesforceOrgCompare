import './loadProjectEnv.mjs';

/**
 * Crea o actualiza el feature flag remoto `sfoc_apex_log_ai_advisor` en PostHog EU.
 *
 * Controla Logi (asesor IA del visor de logs Apex): visibilidad, límites, modelos y API key.
 *
 * Uso:
 *   $env:POSTHOG_PERSONAL_API_KEY="phx_..."
 *   $env:OPENROUTER_API_KEY="sk-or-..."   # solo al provisionar; no commitear
 *   npm run posthog:ai-advisor-flag
 *   npm run posthog:ai-advisor-flag:update
 *   npm run posthog:ai-advisor-flag:update -- --enable-beta
 *   npm run posthog:ai-advisor-flag:enable-proxy
 */
import {
  DEFAULT_LOGI_ADVISOR_CONFIG,
  parseLogiAdvisorConfig
} from '../shared/apexLogAiAdvisorConfig.js';

const API_HOST = 'https://eu.posthog.com';
const FLAG_KEY = 'sfoc_apex_log_ai_advisor';
const UPDATE = process.argv.includes('--update');
const RESET = process.argv.includes('--reset');
const ENABLE_BETA = process.argv.includes('--enable-beta');
const ENABLE_PROXY = process.argv.includes('--enable-proxy');
const PERSONAL_KEY =
  process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_WIZARD_API_KEY || '';

const DEFAULT_ROLLOUT_PERCENTAGE = Number(process.env.SFOC_LOGI_ADVISOR_ROLLOUT || 0);

function resolveDefaultPayload() {
  if (RESET) {
    return parseLogiAdvisorConfig({ enabled: false, showButton: false });
  }
  if (ENABLE_PROXY) {
    const proxyUrl = process.env.LOGI_PROXY_URL || '';
    const proxyAuthToken = process.env.LOGI_PROXY_AUTH_TOKEN || '';
    if (!proxyUrl.trim() || !proxyAuthToken.trim()) {
      console.error(
        'Para --enable-proxy define LOGI_PROXY_URL y LOGI_PROXY_AUTH_TOKEN en .env o variables de entorno.'
      );
      process.exit(1);
    }
    return parseLogiAdvisorConfig({
      ...DEFAULT_LOGI_ADVISOR_CONFIG,
      enabled: true,
      showButton: true,
      beta: true,
      transport: 'proxy',
      proxyUrl: proxyUrl.trim(),
      proxyAuthToken: proxyAuthToken.trim(),
      openRouterApiKey: null
    });
  }
  const openRouterApiKey = process.env.OPENROUTER_API_KEY || null;
  return parseLogiAdvisorConfig({
    ...DEFAULT_LOGI_ADVISOR_CONFIG,
    enabled: ENABLE_BETA,
    showButton: ENABLE_BETA,
    openRouterApiKey
  });
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
 * @param {ReturnType<typeof parseLogiAdvisorConfig>} payload
 */
function flagBody(payload) {
  return {
    key: FLAG_KEY,
    name: 'SFOC — Logi (asesor IA logs Apex)',
    filters: {
      groups: [{ properties: [], rollout_percentage: DEFAULT_ROLLOUT_PERCENTAGE }],
      payloads: {
        true: JSON.stringify(payload)
      }
    },
    active: true,
    is_remote_configuration: true,
    tags: ['sfoc', 'logi', 'ai'],
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

  if (existing && !UPDATE && !ENABLE_BETA && !ENABLE_PROXY) {
    console.log(`Flag "${FLAG_KEY}" ya existe (id ${existing.id}). Usa --update para actualizar.`);
    console.log('Payload actual:', JSON.stringify(existing.filters?.payloads?.true || existing.payload, null, 2));
    console.log(`\nhttps://eu.posthog.com/project/${projectId}/feature_flags/${existing.id}`);
    return;
  }

  const body = flagBody(payload);
  if ((existing && UPDATE) || (existing && ENABLE_BETA) || (existing && ENABLE_PROXY)) {
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
  console.log('Configura la cohorte beta-ai-advisor en PostHog antes de activar usuarios.');
  const safePayload = {
    ...payload,
    openRouterApiKey: payload.openRouterApiKey ? '[SET]' : null,
    proxyAuthToken: payload.proxyAuthToken ? '[SET]' : null
  };
  console.log('Payload cuando true:', JSON.stringify(safePayload, null, 2));
  console.log(`\nEditar: https://eu.posthog.com/project/${projectId}/feature_flags?search=${FLAG_KEY}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
