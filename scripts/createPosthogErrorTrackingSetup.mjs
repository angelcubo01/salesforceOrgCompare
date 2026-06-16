import './loadProjectEnv.mjs';

/**
 * Configura insights PostHog para Error Tracking SFOC (bugs vs operacional).
 *
 * Uso:
 *   $env:POSTHOG_PERSONAL_API_KEY="phx_..."
 *   $env:POSTHOG_PROJECT_ID="191202"
 *   node scripts/createPosthogErrorTrackingSetup.mjs
 *   node scripts/createPosthogErrorTrackingSetup.mjs --update
 *
 * Nota: las reglas de supresión de ruido histórico (Canceled, Monaco, etc.)
 * deben crearse en PostHog UI → Error Tracking → Settings → Suppression rules,
 * o vía API cuando esté disponible en vuestro plan.
 */
const API_HOST = 'https://eu.posthog.com';
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID || '191202';
const PERSONAL_KEY =
  process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_WIZARD_API_KEY || '';
const UPDATE = process.argv.includes('--update');

const INSIGHTS = [
  {
    name: 'SFOC — Bugs ($exception con error_category=bug)',
    description: 'Solo excepciones técnicas reales tras política de clasificación.',
    query: {
      kind: 'TrendsQuery',
      series: [
        {
          event: '$exception',
          kind: 'EventsNode',
          math: 'total',
          properties: [
            {
              key: 'error_category',
              value: 'bug',
              operator: 'exact',
              type: 'event'
            }
          ]
        }
      ],
      dateRange: { date_from: '-30d' },
      interval: 'day'
    }
  },
  {
    name: 'SFOC — Fallos operacionales (extension_failure)',
    description: 'Sesión caducada, API esperada, etc. — no Error Tracking.',
    query: {
      kind: 'TrendsQuery',
      series: [
        {
          event: 'extension_failure',
          kind: 'EventsNode',
          math: 'total'
        }
      ],
      dateRange: { date_from: '-30d' },
      interval: 'day'
    }
  }
];

const SUPPRESSION_PATTERNS = [
  'Canceled',
  'no diff result available',
  'Illegal value for lineNumber',
  'Test already enqueued',
  'TextModel got disposed',
  'Receiving end does not exist',
  'Extension context invalidated'
];

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
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`PostHog API ${res.status}: ${text.slice(0, 400)}`);
  }
  return body;
}

async function listInsights() {
  const data = await api(`/api/projects/${PROJECT_ID}/insights/?limit=100`);
  return data.results || [];
}

async function createOrUpdateInsight(def, existing) {
  const payload = {
    name: def.name,
    description: def.description,
    query: def.query,
    tags: ['sfoc', 'error-tracking']
  };
  if (existing && UPDATE) {
    return api(`/api/projects/${PROJECT_ID}/insights/${existing.id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }
  if (existing) {
    console.log(`  skip (exists): ${def.name} → ${API_HOST}/project/${PROJECT_ID}/insights/${existing.id}`);
    return existing;
  }
  return api(`/api/projects/${PROJECT_ID}/insights/`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function main() {
  if (!PERSONAL_KEY) {
    console.error('Falta POSTHOG_PERSONAL_API_KEY (phx_...)');
    process.exit(1);
  }

  console.log('SFOC Error Tracking — insights');
  const existing = await listInsights();
  for (const def of INSIGHTS) {
    const match = existing.find((i) => i.name === def.name);
    const out = await createOrUpdateInsight(def, match);
    const id = out.id || match?.id;
    console.log(`  ${match ? 'updated' : 'created'}: ${def.name}`);
    if (id) console.log(`    ${API_HOST}/project/${PROJECT_ID}/insights/${id}`);
  }

  console.log('\nPatrones recomendados para supresión manual en Error Tracking:');
  for (const p of SUPPRESSION_PATTERNS) {
    console.log(`  - ${p}`);
  }
  console.log('\nListo.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
