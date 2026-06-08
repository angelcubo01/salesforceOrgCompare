/**
 * Crea insights y dashboard «SFOC — Uso por usuario Salesforce» en PostHog EU.
 *
 * Requiere propiedad de evento `sf_user_label` en telemetría de la extensión.
 *
 * Uso:
 *   $env:POSTHOG_PERSONAL_API_KEY="phx_..."
 *   node scripts/createPosthogUserDashboard.mjs          # crear / enlazar
 *   node scripts/createPosthogUserDashboard.mjs --update # refrescar queries y dashboard
 */
const API_HOST = 'https://eu.posthog.com';

const PERSONAL_KEY =
  process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_WIZARD_API_KEY || '';

const DASHBOARD_NAME = 'SFOC — Uso por usuario Salesforce';
const USAGE_DASHBOARD_ID = 721895;
const UPDATE = process.argv.includes('--update');

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
  throw new Error('Varios proyectos: define POSTHOG_PROJECT_ID');
}

function trendsInsight(name, description, querySource) {
  return {
    name,
    description,
    tags: ['sfoc', 'sf_user_label'],
    query: {
      kind: 'InsightVizNode',
      source: querySource
    }
  };
}

const INSIGHT_DEFS = [
  trendsInsight(
    'SFOC — Usuarios activos diarios (comparison_run)',
    'Usuarios Salesforce únicos por día (sf_user_label)',
    {
      kind: 'TrendsQuery',
      series: [{ kind: 'EventsNode', event: 'comparison_run', math: 'dau', name: 'comparison_run' }],
      dateRange: { date_from: '-30d' },
      interval: 'day',
      breakdownFilter: {
        breakdown_limit: 25,
        breakdowns: [{ property: 'sf_user_label', type: 'event' }]
      },
      trendsFilter: { display: 'ActionsLineGraph' }
    }
  ),
  trendsInsight(
    'SFOC — Comparaciones por usuario Salesforce',
    'Volumen de comparison_run por sf_user_label',
    {
      kind: 'TrendsQuery',
      series: [{ kind: 'EventsNode', event: 'comparison_run', math: 'total', name: 'comparison_run' }],
      dateRange: { date_from: '-30d' },
      interval: 'day',
      breakdownFilter: {
        breakdown_limit: 25,
        breakdowns: [{ property: 'sf_user_label', type: 'event' }]
      },
      trendsFilter: { display: 'ActionsBar' }
    }
  ),
  trendsInsight(
    'SFOC — Distribución por usuario Salesforce',
    'comparison_run por sf_user_label (Name (org))',
    {
      kind: 'TrendsQuery',
      series: [{ kind: 'EventsNode', event: 'comparison_run', math: 'total', name: 'comparison_run' }],
      dateRange: { date_from: '-30d' },
      interval: 'week',
      breakdownFilter: {
        breakdown_limit: 15,
        breakdowns: [{ property: 'sf_user_label', type: 'event' }]
      },
      trendsFilter: { display: 'ActionsPie' }
    }
  ),
  trendsInsight(
    'SFOC — Herramientas por usuario Salesforce',
    'comparison_run por artifact_type y sf_user_label',
    {
      kind: 'TrendsQuery',
      series: [{ kind: 'EventsNode', event: 'comparison_run', math: 'total', name: 'comparison_run' }],
      dateRange: { date_from: '-30d' },
      interval: 'week',
      breakdownFilter: {
        breakdown_limit: 25,
        breakdowns: [
          { property: 'sf_user_label', type: 'event' },
          { property: 'artifact_type', type: 'event' }
        ]
      },
      trendsFilter: { display: 'ActionsStackedBar' }
    }
  ),
  trendsInsight(
    'SFOC — Top 10 usuarios comparison_run',
    'Top 10 usuarios por volumen de comparison_run',
    {
      kind: 'TrendsQuery',
      series: [{ kind: 'EventsNode', event: 'comparison_run', math: 'total', name: 'comparison_run' }],
      dateRange: { date_from: '-30d' },
      interval: 'day',
      breakdownFilter: {
        breakdown_limit: 10,
        breakdowns: [{ property: 'sf_user_label', type: 'event' }]
      },
      trendsFilter: { display: 'ActionsBarValue' }
    }
  ),
  trendsInsight(
    'SFOC — Usuarios únicos comparison_run (30d)',
    'Usuarios Salesforce únicos con sf_user_label',
    {
      kind: 'TrendsQuery',
      series: [{ kind: 'EventsNode', event: 'comparison_run', math: 'dau', name: 'comparison_run' }],
      dateRange: { date_from: '-30d' },
      interval: 'day',
      properties: [{ key: 'sf_user_label', operator: 'is_set', type: 'event', value: 'is_set' }],
      trendsFilter: { display: 'BoldNumber' }
    }
  )
];

async function findDashboard(projectId, name) {
  const data = await api(`/api/projects/${projectId}/dashboards/?search=${encodeURIComponent(name)}`);
  return (data?.results || []).find((d) => d.name === name) || null;
}

async function findInsight(projectId, name) {
  const data = await api(`/api/projects/${projectId}/insights/?search=${encodeURIComponent(name)}`);
  return (data?.results || []).find((i) => i.name === name) || null;
}

async function main() {
  const projectId = await resolveProjectId();
  console.log('Proyecto:', projectId);

  let dashboard = await findDashboard(projectId, DASHBOARD_NAME);
  if (!dashboard) {
    dashboard = await api(`/api/projects/${projectId}/dashboards/`, {
      method: 'POST',
      body: JSON.stringify({
        name: DASHBOARD_NAME,
        description:
          'Uso identificado por sf_user_label (Name (org)). Requiere telemetría activa.',
        pinned: true,
        tags: ['sfoc', 'sf_user_label']
      })
    });
    console.log('Dashboard creado:', dashboard.id, dashboard.name);
  } else {
    console.log('Dashboard existente:', dashboard.id, dashboard.name);
    if (UPDATE) {
      dashboard = await api(`/api/projects/${projectId}/dashboards/${dashboard.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: DASHBOARD_NAME,
          description:
            'Uso identificado por sf_user_label (Name (org)). Requiere telemetría activa.',
          pinned: true,
          tags: ['sfoc', 'sf_user_label']
        })
      });
      console.log('Dashboard actualizado:', dashboard.id);
    }
  }

  const dashboardId = dashboard.id;
  const insightIds = [];

  for (const def of INSIGHT_DEFS) {
    let insight = await findInsight(projectId, def.name);
    if (!insight) {
      insight = await api(`/api/projects/${projectId}/insights/`, {
        method: 'POST',
        body: JSON.stringify(def)
      });
      console.log('Insight creado:', insight.name, insight.id);
    } else if (UPDATE) {
      insight = await api(`/api/projects/${projectId}/insights/${insight.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: def.name,
          description: def.description,
          tags: def.tags,
          query: def.query
        })
      });
      console.log('Insight actualizado:', insight.name, insight.id);
    } else {
      console.log('Insight existente:', insight.name, insight.id);
    }
    insightIds.push(insight.id);

    const dashboards = new Set(insight.dashboards || []);
    dashboards.add(dashboardId);
    if (def.name.includes('Top 10') || def.name.includes('Usuarios únicos')) {
      dashboards.add(USAGE_DASHBOARD_ID);
    }
    await api(`/api/projects/${projectId}/insights/${insight.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ dashboards: [...dashboards] })
    });
  }

  if (UPDATE) {
    console.log('\nDashboard refrescado (queries y metadatos sincronizados).');
  }

  console.log('\nDashboard:', `${API_HOST}/project/${projectId}/dashboard/${dashboardId}`);
  console.log('Insights:', insightIds.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
