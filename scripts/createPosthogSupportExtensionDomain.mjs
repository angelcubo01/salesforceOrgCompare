/**
 * Corrige Allowed domains de PostHog Support para extensiones Chrome.
 *
 * PostHog compara location.hostname (el ID de extensión) con cada dominio permitido.
 * Valores como chrome-extension://* NO funcionan: se parsean como "chrome-extension".
 *
 * Uso:
 *   $env:POSTHOG_PERSONAL_API_KEY="phx_..."
 *   $env:CHROME_EXTENSION_ID="djhobakhnicidkkbcmjhchbolgmfdaga"   # opcional
 *   node scripts/createPosthogSupportExtensionDomain.mjs
 */
const API_HOST = 'https://eu.posthog.com';
const DEFAULT_EXTENSION_ID = 'djhobakhnicidkkbcmjhchbolgmfdaga';

const PERSONAL_KEY =
  process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_WIZARD_API_KEY || '';
const EXTENSION_ID = String(
  process.env.CHROME_EXTENSION_ID || process.env.SFOC_EXTENSION_ID || DEFAULT_EXTENSION_ID
).trim();

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
  const match = list.find((p) => /org compare|default project/i.test(String(p.name || '')));
  if (match) return String(match.id);
  if (list.length === 1) return String(list[0].id);
  throw new Error('Define POSTHOG_PROJECT_ID (proyecto 191202 en EU).');
}

function normalizeWidgetSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      widget_enabled: true,
      allowed_domains: [EXTENSION_ID]
    };
  }
  const next = { ...raw };
  const domainsKey = Array.isArray(next.allowed_domains)
    ? 'allowed_domains'
    : Array.isArray(next.domains)
      ? 'domains'
      : 'allowed_domains';
  next[domainsKey] = [EXTENSION_ID];
  if (next.widget_enabled == null && next.widgetEnabled == null) {
    next.widget_enabled = true;
  }
  return next;
}

async function main() {
  const projectId = await resolveProjectId();
  const project = await api(`/api/projects/${projectId}/`);
  const prev = project.conversations_settings;
  const conversations_settings = normalizeWidgetSettings(prev);

  const updated = await api(`/api/projects/${projectId}/`, {
    method: 'PATCH',
    body: JSON.stringify({
      conversations_enabled: true,
      conversations_settings
    })
  });

  console.log('PostHog Support — dominio de extensión actualizado');
  console.log('  project:', updated.name || projectId);
  console.log('  extension id:', EXTENSION_ID);
  console.log('  conversations_enabled:', updated.conversations_enabled);
  console.log('  conversations_settings:', JSON.stringify(updated.conversations_settings, null, 2));
  console.log('');
  console.log('Recarga la extensión y prueba el botón Soporte de nuevo.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
