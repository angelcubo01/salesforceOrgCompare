import './loadProjectEnv.mjs';

/**
 * Reactiva la encuesta CSAT `SFOC CSAT` en PostHog EU.
 *
 * La extensión la muestra manualmente tras N eventos `comparison_run` locales
 * (`POSTHOG_CSAT_SURVEY_ID` en shared/telemetryConfig.js).
 *
 * Uso:
 *   $env:POSTHOG_PERSONAL_API_KEY="phx_..."
 *   npm run posthog:survey
 */
const API_HOST = 'https://eu.posthog.com';
const SURVEY_NAME = 'SFOC CSAT';
const DEFAULT_SURVEY_ID = '019e8ce8-6bb9-0000-6c3b-a5e878a9aa6c';

const PERSONAL_KEY =
  process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_WIZARD_API_KEY || '';

if (!PERSONAL_KEY.startsWith('phx_')) {
  console.error('Falta POSTHOG_PERSONAL_API_KEY (phx_...).');
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
  const match = list.find((p) => /org compare/i.test(String(p.name || '')));
  if (match) return String(match.id);
  if (list.length === 1) return String(list[0].id);
  throw new Error('Define POSTHOG_PROJECT_ID');
}

async function findSurvey(projectId) {
  const byId = process.env.POSTHOG_CSAT_SURVEY_ID || DEFAULT_SURVEY_ID;
  try {
    const survey = await api(`/api/projects/${projectId}/surveys/${byId}/`);
    if (survey?.id) return survey;
  } catch {
    // fallback por nombre
  }
  const data = await api(`/api/projects/${projectId}/surveys/?search=${encodeURIComponent(SURVEY_NAME)}`);
  const rows = data?.results || [];
  return rows.find((s) => s.name === SURVEY_NAME) || null;
}

async function activateSurvey(projectId, surveyId) {
  await api(`/api/projects/${projectId}/surveys/${surveyId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ end_date: null, remove_targeting_flag: true })
  });
  await api(`/api/projects/${projectId}/surveys/${surveyId}/launch/`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

async function main() {
  const projectId = await resolveProjectId();
  const survey = await findSurvey(projectId);
  if (!survey) {
    console.error(`No se encontró la encuesta "${SURVEY_NAME}". Créala en PostHog y actualiza telemetryConfig.js.`);
    process.exit(1);
  }

  await activateSurvey(projectId, survey.id);

  console.log('Encuesta CSAT activada:', survey.id);
  console.log(`Panel: https://eu.posthog.com/project/${projectId}/surveys/${survey.id}`);
  console.log('\nEn la extensión: telemetría ON, ≥7 comparison_run, sin sfoc_posthog_csat_completed en storage.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
