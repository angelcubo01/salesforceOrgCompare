#Requires -Version 5.1
<#
.SYNOPSIS
  Genera el ZIP listo para subir a Chrome Web Store.

.DESCRIPTION
  Empaqueta solo los archivos de la extensión (manifest, background, code, icons,
  popup, shared, vendor). Excluye node_modules, tests, scripts de desarrollo, etc.

.PARAMETER IncludeSourceMaps
  Incluye ficheros .map del vendor (aumenta el tamaño del ZIP).

.PARAMETER OutputDir
  Carpeta de salida del ZIP (por defecto: dist/ en la raíz del repo).

.PARAMETER SkipMinify
  Omite la minificacion de JavaScript (util para depurar el paquete de store).

.EXAMPLE
  .\scripts\pack-chrome-store.ps1

.EXAMPLE
  npm run pack:chrome
#>
[CmdletBinding()]
param(
  [switch] $IncludeSourceMaps,
  [switch] $SkipMinify,
  [string] $OutputDir = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

$manifestPath = Join-Path $repoRoot 'manifest.json'
if (-not (Test-Path $manifestPath)) {
  throw "No se encontro manifest.json en $repoRoot"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = [string] $manifest.version
if ([string]::IsNullOrWhiteSpace($version)) {
  throw 'manifest.json no define una version valida.'
}

$telemetryConfig = Join-Path $repoRoot 'shared\telemetryConfig.js'
if (-not (Test-Path $telemetryConfig)) {
  throw @"
Falta shared/telemetryConfig.js (gitignored).
La extensión no funcionará en producción sin PostHog configurado.
Crea el archivo localmente antes de empaquetar.
"@
}

# Chrome solo admite estos tamaños en manifest.icons (16, 19, 32, 38, 48, 128).
$chromeIconSizes = @(16, 19, 32, 38, 48, 128)

function Test-ManifestIcons {
  param(
    [object] $Manifest,
    [string] $Root
  )

  $iconsDir = Join-Path $Root 'icons'
  if (-not (Test-Path $iconsDir)) {
    throw @"
No se encontro la carpeta icons/.
Los PNG deben estar versionados en el repo. Restaura con:
  git checkout -- icons/
"@
  }

  if (-not $Manifest.icons) {
    throw 'manifest.json no define la seccion icons.'
  }

  $missing = @()
  $invalidSizes = @()

  foreach ($prop in $Manifest.icons.PSObject.Properties) {
    $size = 0
    if (-not [int]::TryParse([string] $prop.Name, [ref] $size)) {
      $invalidSizes += $prop.Name
      continue
    }
    if ($chromeIconSizes -notcontains $size) {
      $invalidSizes += $prop.Name
    }

    $rel = [string] $prop.Value
    $full = Join-Path $Root ($rel -replace '/', [System.IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path $full)) {
      $missing += $rel
    }
  }

  if ($invalidSizes.Count -gt 0) {
    throw @"
manifest.json declara tamanos de icono no validos para Chrome: $($invalidSizes -join ', ').
Tamanos permitidos: $($chromeIconSizes -join ', ').
Quita del manifest los iconos 256/512 (pueden quedarse en icons/ para otros usos).
"@
  }

  if ($missing.Count -gt 0) {
    throw @"
Faltan iconos referenciados en manifest.json:
$($missing -join "`n")
Comprueba que la carpeta icons/ esta completa (git checkout -- icons/).
"@
  }
}

Test-ManifestIcons -Manifest $manifest -Root $repoRoot

$includeRoots = @(
  'manifest.json',
  'background.js',
  'background',
  'code',
  'icons',
  'popup',
  'shared',
  'vendor'
)

$excludeFileNames = @(
  '.DS_Store',
  'Thumbs.db',
  'Desktop.ini'
)

if (-not $IncludeSourceMaps) {
  $excludeExtensions = @('.map')
} else {
  $excludeExtensions = @()
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $repoRoot 'dist'
}

$safeVersion = $version -replace '[^\w.\-]', '_'
$zipName = "salesforce-org-compare-v$safeVersion.zip"
$zipPath = Join-Path $OutputDir $zipName

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("sfoc-pack-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

function Test-ShouldExcludeFile {
  param([System.IO.FileInfo] $File)

  if ($excludeFileNames -contains $File.Name) {
    return $true
  }

  if ($excludeExtensions -contains $File.Extension.ToLowerInvariant()) {
    return $true
  }

  return $false
}

function Copy-ExtensionTree {
  param(
    [string] $SourcePath,
    [string] $DestPath
  )

  if (-not (Test-Path $SourcePath)) {
    $name = Split-Path $SourcePath -Leaf
    if ($name -eq 'icons') {
      throw @"
No se encontro la carpeta icons en: $SourcePath
Restaura los iconos con: git checkout -- icons/
"@
    }
    throw "No se encontro: $SourcePath"
  }

  $item = Get-Item $SourcePath

  if ($item.PSIsContainer) {
    New-Item -ItemType Directory -Path $DestPath -Force | Out-Null
    Get-ChildItem -Path $SourcePath -Force | ForEach-Object {
      Copy-ExtensionTree -SourcePath $_.FullName -DestPath (Join-Path $DestPath $_.Name)
    }
    return
  }

  if (Test-ShouldExcludeFile -File $item) {
    return
  }

  $destParent = Split-Path $DestPath -Parent
  if (-not (Test-Path $destParent)) {
    New-Item -ItemType Directory -Path $destParent -Force | Out-Null
  }

  Copy-Item -Path $SourcePath -Destination $DestPath -Force
}

try {
  Write-Host ''
  Write-Host 'Salesforce Org Compare - empaquetado Chrome Web Store' -ForegroundColor Cyan
  Write-Host "Version (manifest.json): $version"
  Write-Host "Origen: $repoRoot"
  Write-Host ''

  foreach ($relativePath in $includeRoots) {
    $source = Join-Path $repoRoot $relativePath
    $dest = Join-Path $stageRoot $relativePath
    Copy-ExtensionTree -SourcePath $source -DestPath $dest
  }

  if (-not $SkipMinify) {
    Write-Host 'Minificando JavaScript...' -ForegroundColor Cyan
    node (Join-Path $repoRoot 'scripts\minify-extension.mjs') $stageRoot
    if ($LASTEXITCODE -ne 0) {
      throw 'Minificacion fallida.'
    }
  } else {
    Write-Host 'Minificacion omitida (-SkipMinify).' -ForegroundColor DarkGray
  }

  if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
  }

  Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal

  $files = Get-ChildItem $stageRoot -Recurse -File
  $zipSizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)

  Write-Host 'Contenido empaquetado:' -ForegroundColor Green
  foreach ($root in $includeRoots) {
    Write-Host "  - $root"
  }

  if (-not $IncludeSourceMaps) {
    Write-Host '  (sin ficheros .map)' -ForegroundColor DarkGray
  }

  if (-not $SkipMinify) {
    Write-Host '  (JS propio minificado; vendor/ sin cambios)' -ForegroundColor DarkGray
  }

  Write-Host ''
  Write-Host "Archivos: $($files.Count)" -ForegroundColor Green
  Write-Host "Tamano ZIP: $zipSizeMb MB" -ForegroundColor Green
  Write-Host "Salida: $zipPath" -ForegroundColor Green
  Write-Host ''
  Write-Host 'Sube este ZIP en Chrome Web Store > Tu extension > Paquete > Subir nuevo paquete.' -ForegroundColor Yellow
  Write-Host ''
}
finally {
  if (Test-Path $stageRoot) {
    Remove-Item $stageRoot -Recurse -Force
  }
}
