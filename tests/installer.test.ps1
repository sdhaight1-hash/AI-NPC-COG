$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$files = @(
    'scripts/install.ps1', 'scripts/release-selection.ps1'
)
foreach ($name in $files) {
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        (Join-Path $root $name), [ref]$tokens, [ref]$errors
    )
    if (@($errors).Count -ne 0) { throw "PowerShell parser errors in $name : $errors" }
}
. (Join-Path $root 'scripts/release-selection.ps1')
$mock = @(
    [pscustomobject]@{ tag_name='v1.0.0'; assets=@([pscustomobject]@{name='nightly-tag.txt'}) },
    [pscustomobject]@{ tag_name='b123'; assets=@([pscustomobject]@{name='llama-b123-bin-win-cuda-12.4-x64.zip'}) },
    [pscustomobject]@{ tag_name='b122'; assets=@(
        [pscustomobject]@{name='llama-b122-bin-win-cuda-12.4-x64.zip'},
        [pscustomobject]@{name='cudart-llama-bin-win-cuda-12.4-x64.zip'}
    ) }
)
$chosen = Select-LlamaCudaRelease $mock
if ($chosen.Tag -ne 'b122') { throw 'Should skip marker-only and incomplete binary releases.' }
$threw = $false
try { [void](Select-LlamaCudaRelease @($mock[0])) } catch { $threw = $true }
if (-not $threw) { throw 'Missing archives should produce an error.' }
$start = Get-Content (Join-Path $root 'start.bat') -Raw
$install = Get-Content (Join-Path $root 'install.bat') -Raw
if ($start -notmatch 'Model\\Rein-NPC-4B-Q4_K_M[.]gguf') { throw 'Launcher must use project-local model.' }
if ($start -notmatch 'llama-server[.]exe') { throw 'Launcher must use installed inference server.' }
if ($install -notmatch 'scripts\\install[.]ps1') { throw 'Installer must call PowerShell helper.' }
Write-Host 'Windows installer parsing and release selection tests passed.'
