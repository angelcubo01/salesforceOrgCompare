import './loadProjectEnv.mjs';

const flag = 'sfoc_apex_log_ai_advisor';
const token = process.env.POSTHOG_PROJECT_TOKEN || '';
const phs = process.env.POSTHOG_FF_SECURE_API_KEY || '';
const phx = process.env.POSTHOG_PERSONAL_API_KEY || '';

if (!token) {
  console.error('Falta POSTHOG_PROJECT_TOKEN');
  process.exit(1);
}

for (const host of ['https://eu.posthog.com', 'https://eu.i.posthog.com']) {
  for (const [label, key] of [
    ['phs', phs],
    ['phx', phx]
  ]) {
    if (!key) continue;
    const url = `${host}/api/projects/@current/feature_flags/${encodeURIComponent(flag)}/remote_config?token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }
    });
    const text = await res.text();
    console.log(label, host, res.status, text.slice(0, 200));
  }
}
