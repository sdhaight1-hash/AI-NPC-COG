$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $root 'scripts/install.ps1'
$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$errors)
if (@($errors).Count -ne 0) { throw "PowerShell parser errors in installer: $errors" }

$installer = Get-Content $scriptPath -Raw
$expected = @(
    'b12521'
    'llama-b12521-bin-win-cuda-12.4-x64.zip'
    'cudart-llama-bin-win-cuda-12.4-x64.zip'
    '9ce11d38104c119d039120c219ad521be765e681ac19145e39bd45fe08ead816'
    '8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6'
    'Download-Verified'
)
foreach ($item in $expected) {
    if (-not $installer.Contains($item)) { throw "Missing verified release component: $item" }
}
if ($installer.Contains('Select-LlamaCudaRelease') -or $installer.Contains('releases?per_page=')) {
    throw 'Installer should not depend on rolling GitHub releases selection'
}
$start = Get-Content (Join-Path $root 'start.bat') -Raw
$install = Get-Content (Join-Path $root 'install.bat') -Raw
if ($start -notmatch 'Model\\Rein-NPC-4B-Q4_K_M[.]gguf') { throw 'Launcher must use project-local model.' }
if ($start -notmatch 'llama-server[.]exe') { throw 'Launcher must use installed inference server.' }
if ($install -notmatch 'scripts\\install[.]ps1') { throw 'Installer must call PowerShell helper.' }
Write-Host 'Windows installer syntax, verified-release and launcher tests passed.'
