# Windows PowerShell 5.1 compatible. Installs locally, with no admin rights or PATH edits.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtime = Join-Path $root '_runtime'
$llamaFolder = Join-Path $runtime 'llama'
$nodeFolder = Join-Path $runtime 'node'
$nodeExe = Join-Path $nodeFolder 'node.exe'
$model = Join-Path $root 'Model\Rein-NPC-4B-Q4_K_M.gguf'
$staging = Join-Path $runtime ('stage-' + [guid]::NewGuid().ToString('N'))
. (Join-Path $PSScriptRoot 'release-selection.ps1')

function Download-Verified {
    param([string]$Url, [string]$Destination, [string]$Sha256)
    if ($Url -notmatch '^https://(github[.]com/ggml-org/llama[.]cpp/releases/download/|nodejs[.]org/dist/)') {
        throw "Refusing an unexpected download host: $Url"
    }
    if ($Sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Missing a valid SHA-256 checksum' }
    Write-Host "Downloading $(Split-Path $Destination -Leaf)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
    $actual = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash
    if ($actual -ine $Sha256) {
        Remove-Item -LiteralPath $Destination -Force
        throw 'Checksum mismatch. Download rejected.'
    }
}

function Get-NodeMajor {
    param([string]$Exe)
    if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) { return 0 }
    try {
        $version = & $Exe --version 2>$null
        if ($LASTEXITCODE -eq 0 -and $version -match '^v([0-9]+)[.]') { return [int]$Matches[1] }
    } catch { }
    return 0
}

try {
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw 'AI-NPC-COG requires 64-bit Windows.'
    }
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    New-Item -ItemType Directory -Path $staging -Force | Out-Null

    # Prefer the existing system Node, then portable Node. No system changes.
    $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
    $major = 0
    if ($systemNode) { $major = Get-NodeMajor $systemNode.Source }
    if ($major -ge 20) {
        Write-Host "Node.js $major detected in PATH; no download needed." -ForegroundColor Green
    } elseif ((Get-NodeMajor $nodeExe) -ge 20) {
        Write-Host 'Portable Node.js already installed.' -ForegroundColor Green
    } else {
        Write-Host 'Installing portable Node.js 22 LTS...' -ForegroundColor Yellow
        $versions = @(Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json')
        $version = $versions | Where-Object {
            $_.version -match '^v22[.]' -and $_.lts -and $_.files -contains 'win-x64-zip'
        } | Select-Object -First 1
        if (-not $version) { throw 'Could not find the official Node.js 22 LTS Windows x64 archive.' }
        $archiveName = "node-$($version.version)-win-x64.zip"
        $base = "https://nodejs.org/dist/$($version.version)/"
        $checksums = (Invoke-WebRequest -Uri ($base + 'SHASUMS256.txt') -UseBasicParsing).Content
        $line = @($checksums -split "\r?\n" | Where-Object {
            $_ -match ("^[a-fA-F0-9]{64}\s+\*?" + [regex]::Escape($archiveName) + "\s*$")
        } | Select-Object -First 1)
        if ($line.Count -eq 0) { throw 'Node.js archive SHA-256 not found in official manifest.' }
        $expected = ($line[0].Trim() -split '\s+')[0]
        $zip = Join-Path $staging $archiveName
        Download-Verified ($base + $archiveName) $zip $expected
        $expanded = Join-Path $staging 'node-extracted'
        Expand-Archive -LiteralPath $zip -DestinationPath $expanded -Force
        $found = Get-ChildItem -Path $expanded -Recurse -File -Filter 'node.exe' |
            Select-Object -First 1
        if (-not $found) { throw 'Node.js archive had no node.exe.' }
        New-Item -ItemType Directory -Path $nodeFolder -Force | Out-Null
        Copy-Item -LiteralPath $found.FullName -Destination $nodeExe -Force
        if ((Get-NodeMajor $nodeExe) -lt 20) { throw 'Downloaded Node.js failed its version check.' }
        Write-Host "Portable Node.js installed: $($version.version)" -ForegroundColor Green
    }

    if (Test-Path -LiteralPath (Join-Path $llamaFolder 'llama-server.exe') -PathType Leaf) {
        Write-Host 'Local llama.cpp server already installed; keeping existing files.' -ForegroundColor Green
    } else {
        Write-Host 'Finding the newest official CUDA 12.4 Windows build...' -ForegroundColor Yellow
        $headers = @{ 'User-Agent'='AI-NPC-COG-installer'; 'Accept'='application/vnd.github+json' }
        $releases = @(Invoke-RestMethod -Uri 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=20' -Headers $headers)
        $release = Select-LlamaCudaRelease $releases
        Write-Host "Using llama.cpp $($release.Tag) from ggml-org/llama.cpp" -ForegroundColor Cyan

        $serverZip = Join-Path $staging 'llama-server.zip'
        $cudaZip = Join-Path $staging 'cuda-runtime.zip'
        foreach ($pair in @(
            @{ Asset=$release.Server; File=$serverZip },
            @{ Asset=$release.Cudart; File=$cudaZip }
        )) {
            $digest = [string]$pair.Asset.digest
            if ($digest -match '^sha256:([a-fA-F0-9]{64})$') {
                $expectedDigest = $Matches[1]
            } else {
                throw "Release $($release.Tag) did not provide a valid SHA-256 digest."
            }
            Download-Verified $pair.Asset.browser_download_url $pair.File $expectedDigest
        }

        $serverStage = Join-Path $staging 'server-extracted'
        $cudaStage = Join-Path $staging 'cuda-extracted'
        Expand-Archive -LiteralPath $serverZip -DestinationPath $serverStage -Force
        Expand-Archive -LiteralPath $cudaZip -DestinationPath $cudaStage -Force
        $found = Get-ChildItem -Path $serverStage -Recurse -File -Filter 'llama-server.exe' |
            Select-Object -First 1
        if (-not $found) { throw 'llama-server.exe not found in official archive.' }
        New-Item -ItemType Directory -Path $llamaFolder -Force | Out-Null
        Copy-Item -Path (Join-Path $found.Directory.FullName '*') -Destination $llamaFolder -Recurse -Force

        # CUDA runtime ships separately; copy all DLLs next to llama-server.exe.
        $dlls = @(Get-ChildItem -Path $cudaStage -Recurse -File -Filter '*.dll')
        if ($dlls.Count -eq 0) { throw 'CUDA runtime archive contains no DLLs.' }
        foreach ($dll in $dlls) {
            Copy-Item -LiteralPath $dll.FullName -Destination $llamaFolder -Force
        }
        Set-Content -LiteralPath (Join-Path $llamaFolder 'version.txt') -Value $release.Tag
        Write-Host "llama.cpp server and CUDA DLLs installed ($($release.Tag))." -ForegroundColor Green
    }

    if (-not (Test-Path -LiteralPath $model -PathType Leaf)) {
        Write-Warning "Model not found at '$model'. Put the already-downloaded GGUF in the Model folder before launching."
    } else {
        Write-Host 'Found Rein-NPC-4B-Q4_K_M.gguf in Model folder.' -ForegroundColor Green
    }
    Write-Host ''
    Write-Host 'Setup successful. No administrator rights required.' -ForegroundColor Green
    exit 0
} catch {
    Write-Host ''
    Write-Host ('INSTALL ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Your model was not changed. Double-click install.bat again to retry.' -ForegroundColor Yellow
    exit 1
} finally {
    if (Test-Path -LiteralPath $staging) {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
}
