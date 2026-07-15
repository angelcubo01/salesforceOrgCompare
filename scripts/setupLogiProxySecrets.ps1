# Configure sfoc-logi-proxy Worker secrets from repo .env
# Usage: .\scripts\setupLogiProxySecrets.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
$proxyDir = Join-Path $root 'services\logi-proxy'

if (-not (Test-Path $envFile)) {
  Write-Error "Missing $envFile - copy .env.example and fill values."
}

function Read-DotEnv($path) {
  $map = @{}
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
    $map[$key] = $val
  }
  return $map
}

$vars = Read-DotEnv $envFile

$secrets = @{
  OPENROUTER_API_KEY       = $vars['OPENROUTER_API_KEY']
  LOGI_PROXY_AUTH_TOKEN    = $vars['LOGI_PROXY_AUTH_TOKEN']
  POSTHOG_PERSONAL_API_KEY = $vars['POSTHOG_PERSONAL_API_KEY']
  POSTHOG_PROJECT_TOKEN    = $vars['POSTHOG_PROJECT_TOKEN']
  POSTHOG_PROJECT_ID       = $vars['POSTHOG_PROJECT_ID']
}

foreach ($entry in $secrets.GetEnumerator()) {
  if (-not $entry.Value) {
    Write-Warning "Skip $($entry.Key): empty in .env"
    continue
  }
  Write-Host "Setting $($entry.Key)..."
  $entry.Value | npx wrangler secret put $entry.Key --cwd $proxyDir
}

Write-Host 'Done. Reload the extension and reopen an Apex log viewer.'
