# Configura secrets del Worker Logi en Cloudflare (lee .env de la raiz del repo).
# Uso: .\scripts\setupLogiProxySecrets.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root '.env'
$proxyDir = Join-Path $root 'services\logi-proxy'

if (-not (Test-Path $envFile)) {
  Write-Error "No existe $envFile - copia .env.example y rellena las claves."
}

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $name = $matches[1].Trim()
    $value = $matches[2].Trim().Trim('"').Trim("'")
    Set-Item -Path "env:$($name)" -Value $value
  }
}

if (-not $env:OPENROUTER_API_KEY) {
  Write-Error 'Falta OPENROUTER_API_KEY en .env'
}
if (-not $env:LOGI_PROXY_AUTH_TOKEN) {
  Write-Error 'Falta LOGI_PROXY_AUTH_TOKEN en .env'
}

Push-Location $proxyDir
try {
  Write-Host 'Subiendo OPENROUTER_API_KEY...'
  $env:OPENROUTER_API_KEY | npx wrangler secret put OPENROUTER_API_KEY
  Write-Host 'Subiendo PROXY_SHARED_SECRET...'
  $env:LOGI_PROXY_AUTH_TOKEN | npx wrangler secret put PROXY_SHARED_SECRET
  if ($env:POSTHOG_PERSONAL_API_KEY) {
    Write-Host 'Subiendo POSTHOG_PERSONAL_API_KEY...'
    $env:POSTHOG_PERSONAL_API_KEY | npx wrangler secret put POSTHOG_PERSONAL_API_KEY
  } else {
    Write-Warning 'Falta POSTHOG_PERSONAL_API_KEY en .env (necesaria para desencriptar remote config).'
  }
  if ($env:POSTHOG_FF_SECURE_API_KEY) {
    Write-Host 'Subiendo POSTHOG_FF_SECURE_API_KEY (opcional, no desencripta remote config)...'
    $env:POSTHOG_FF_SECURE_API_KEY | npx wrangler secret put POSTHOG_FF_SECURE_API_KEY
  }
  if ($env:POSTHOG_PROJECT_TOKEN) {
    Write-Host 'Subiendo POSTHOG_PROJECT_TOKEN...'
    $env:POSTHOG_PROJECT_TOKEN | npx wrangler secret put POSTHOG_PROJECT_TOKEN
  } elseif ($env:POSTHOG_API_KEY) {
    Write-Host 'Subiendo POSTHOG_PROJECT_TOKEN (desde POSTHOG_API_KEY)...'
    $env:POSTHOG_API_KEY | npx wrangler secret put POSTHOG_PROJECT_TOKEN
  } else {
    Write-Warning 'Falta POSTHOG_PROJECT_TOKEN o POSTHOG_API_KEY en .env (remote config).'
  }
  Write-Host 'Secrets OK. Ejecuta: npm run deploy'
}
finally {
  Pop-Location
}
