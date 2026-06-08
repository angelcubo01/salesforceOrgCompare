/**
 * Crea o actualiza el feature flag remoto `sfoc_support` en PostHog EU.
 *
 * Por defecto rollout 0 % (Support apagado). Sube el porcentaje en PostHog para activarlo
 * poco a poco. Payload cuando el flag es true: { "enabled": true }.
 *
 * Uso:
 *   $env:POSTHOG_PERSONAL_API_KEY="phx_..."
 *   node scripts/createPosthogSupportFlag.mjs
 *   node scripts/createPosthogSupportFlag.mjs --update
 */
const API_HOST = 'https://eu.posthog.com';
const FLAG_KEY = 'sfoc_support';
const UPDATE = process.argv.includes('--update');
const PERSONAL_KEY =
  process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_WIZARD_API_KEY || '';

/** Porcentaje inicial de usuarios con Support activo (0 = apagado). */
const DEFAULT_ROLLOUT_PERCENTAGE = Number(process.env.SFOC_SUPPORT_ROLLOUT || 0);

const DEFAULT_PAYLOAD = {
  enabled: true
};

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

function flagBody() {
  return {
    key: FLAG_KEY,
    name: 'SFOC PostHog Support — activación gradual del chat de soporte',
    filters: {
      groups: [{ properties: [], rollout_percentage: DEFAULT_ROLLOUT_PERCENTAGE }],
      payloads: {
        true: JSON.stringify(DEFAULT_PAYLOAD)
      }
    },
    active: true,
    tags: ['sfoc', 'support', 'conversations'],
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
  if (existing && !UPDATE) {
    console.log(`Flag "${FLAG_KEY}" ya existe (id ${existing.id}). Usa --update para actualizar.`);
    const rollout = existing.filters?.groups?.[0]?.rollout_percentage;
    console.log('Rollout actual:', rollout ?? '?', '%');
    console.log('Payload actual:', JSON.stringify(existing.filters?.payloads?.true || existing.payload, null, 2));
    console.log(`\nhttps://eu.posthog.com/project/${projectId}/feature_flags/${existing.id}`);
    return;
  }

  const body = flagBody();
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

  console.log('\nRollout inicial:', DEFAULT_ROLLOUT_PERCENTAGE, '% (0 = Support oculto)');
  console.log('Payload cuando true:', JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  console.log(`\nEditar rollout: https://eu.posthog.com/project/${projectId}/feature_flags?search=${FLAG_KEY}`);
  console.log('\nRecuerda en PostHog Support → Allowed domains usar el ID de extensión, no chrome-extension://*');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
