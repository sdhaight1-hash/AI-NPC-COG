# Optional one-time CC0 asset installer. Does not touch model weights or PATH.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$assets = Join-Path $root 'public\assets'
$dest = Join-Path $assets 'kenney-tiny-town.png'
$stage = Join-Path ([IO.Path]::GetTempPath()) ('ai-npc-art-' + [guid]::NewGuid().ToString('N'))
function Test-Tileset([string]$file) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { return $false }
  $stream = [IO.File]::OpenRead($file)
  try {
    if ($stream.Length -lt 24 -or $stream.Length -gt 2097152) { return $false }
    $bytes = New-Object byte[] 24
    [void]$stream.Read($bytes, 0, 24)
    $signature = @(137,80,78,71,13,10,26,10)
    for ($i=0; $i -lt 8; $i++) { if ($bytes[$i] -ne $signature[$i]) { return $false } }
    $width = $bytes[19] + 256*$bytes[18] + 65536*$bytes[17] + 16777216*$bytes[16]
    $height = $bytes[23] + 256*$bytes[22] + 65536*$bytes[21] + 16777216*$bytes[20]
    return ($width -eq 192 -and $height -eq 176)
  } finally { $stream.Dispose() }
}
if (Test-Tileset $dest) { Write-Host 'Kenney Tiny Town CC0 art already installed.' -ForegroundColor Green; exit 0 }
try {
  New-Item -ItemType Directory -Force -Path $assets,$stage | Out-Null
  $candidate = Join-Path $stage 'atlas.png'
  $zip = Join-Path $stage 'tiny-town.zip'
  $official = 'https://kenney.nl/media/pages/assets/tiny-town/a415fbeb49-1735736916/kenney_tiny-town.zip'
  Write-Host 'Downloading optional Kenney Tiny Town CC0 art...' -ForegroundColor Cyan
  try {
    Invoke-WebRequest -Uri $official -OutFile $zip -UseBasicParsing -TimeoutSec 30
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $stage 'unzipped') -Force
    $sheet = Get-ChildItem -Path (Join-Path $stage 'unzipped') -Recurse -File -Filter 'tilemap_packed.png' | Select-Object -First 1
    if (-not $sheet) { throw 'Packed tilemap absent from official archive' }
    Copy-Item -LiteralPath $sheet.FullName -Destination $candidate
    if (-not (Test-Tileset $candidate)) { throw 'Unexpected PNG dimensions in official archive' }
  } catch {
    # Fallback is an unchanged CC0 Kenney sheet mirrored within a public asset repository.
    Write-Warning ('Official Kenney download failed: ' + $_.Exception.Message)
    $mirror = 'https://raw.githubusercontent.com/Two-Weeks-Team/openClawWorld/main/packages/client/public/assets/kenney/tiles/tinytown_tilemap.png'
    Invoke-WebRequest -Uri $mirror -OutFile $candidate -UseBasicParsing -TimeoutSec 25
    if (-not (Test-Tileset $candidate)) { throw 'Downloaded atlas failed PNG validation' }
  }
  Copy-Item -LiteralPath $candidate -Destination $dest -Force
  Write-Host 'Installed local Kenney Tiny Town sprites (16x16, CC0).' -ForegroundColor Green
  exit 0
} catch {
  Write-Warning ('Optional art could not be installed: ' + $_.Exception.Message)
  Write-Host 'The included original procedural pixel art will still render normally.'
  exit 1
} finally {
  if(Test-Path -LiteralPath $stage){Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue}
}
