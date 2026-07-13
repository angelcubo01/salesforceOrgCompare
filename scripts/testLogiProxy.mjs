import './loadProjectEnv.mjs';

/**
 * Prueba el proxy Logi desplegado en Cloudflare Workers.
 *
 * Uso:
 *   $env:LOGI_PROXY_URL="https://sfoc-logi-proxy.TU-CUENTA.workers.dev/v1/chat"
 *   $env:LOGI_PROXY_AUTH_TOKEN="tu-secreto"
 *   node scripts/testLogiProxy.mjs
 */
const url = process.env.LOGI_PROXY_URL || '';
const token = process.env.LOGI_PROXY_AUTH_TOKEN || '';

if (!url || !token) {
  console.error('Define LOGI_PROXY_URL y LOGI_PROXY_AUTH_TOKEN en .env o variables de entorno.');
  process.exit(1);
}

const healthUrl = url.replace(/\/v1\/chat\/?$/, '/health');

async function main() {
  console.log('Health:', healthUrl);
  const health = await fetch(healthUrl);
  const healthText = await health.text();
  console.log(health.status, healthText.slice(0, 200));

  if (!health.ok) {
    console.error('Health check falló. ¿Netskope bloquea workers.dev?');
    process.exit(1);
  }

  console.log('\nChat:', url);
  const configUrl = url.replace(/\/v1\/chat\/?$/, '/v1/advisor-config');
  console.log('\nAdvisor config:', configUrl);
  const cfgRes = await fetch(configUrl, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  });
  const cfgText = await cfgRes.text();
  console.log('config', cfgRes.status, cfgText.slice(0, 300));
  if (!cfgRes.ok) {
    console.error('advisor-config fallo');
    process.exit(1);
  }
  try {
    const cfgData = JSON.parse(cfgText);
    const payload = cfgData?.payload;
    const payloadText = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (/\(encrypted\)/i.test(payloadText)) {
      console.error('advisor-config sigue cifrado: sube POSTHOG_PERSONAL_API_KEY (phx_) al Worker');
      process.exit(1);
    }
    if (!payloadText.includes('"enabled"')) {
      console.error('advisor-config no devolvio JSON de Logi');
      process.exit(1);
    }
    console.log('advisor-config OK (payload desencriptado)');
  } catch {
    console.error('advisor-config JSON invalido');
    process.exit(1);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      models: [
        'openai/gpt-oss-120b:free',
        'qwen/qwen3-coder:free',
        'meta-llama/llama-3.3-70b-instruct:free'
      ],
      messages: [{ role: 'user', content: 'Responde solo: OK' }],
      max_tokens: 16
    })
  });

  const text = await res.text();
  console.log(res.status, text.slice(0, 500));

  if (!res.ok) {
    process.exit(1);
  }

  try {
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    console.log('\nRespuesta:', content || '(sin content)');
  } catch {
    console.log('\n(JSON no parseable — revisa si es HTML de Netskope)');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
