# Configura secrets del Worker Logi en Cloudflare (lee .env de la raíz del repo).
# Uso: .\scripts\setupLogiProxySecrets.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root '.env'
$proxyDir = Join-Path $root 'services\logi-proxy'

if (-not (Test-Path $envFile)) {
  Write-Error "No existe $envFile — copia .env.example y rellena las claves."
}

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $name = $matches[1].Trim()
    $value = $matches[2].Trim()
    Set-Item -Path "env:$name" -Value $value
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
  Write-Host 'Secrets OK. Ejecuta: npm run deploy'
}
finally {
  Pop-Location
}
