# Select a *binary* release, not GitHub's v1.0.0 'latest' marker-only release.
function Select-LlamaCudaRelease {
    param([Parameter(Mandatory=$true)][object[]]$Releases)
    foreach ($release in $Releases) {
        if ($release.tag_name -notmatch '^b[0-9]+$') { continue }
        $serverName = "llama-$($release.tag_name)-bin-win-cuda-12.4-x64.zip"
        $server = @($release.assets | Where-Object { $_.name -eq $serverName } | Select-Object -First 1)
        $cudart = @($release.assets | Where-Object { $_.name -eq 'cudart-llama-bin-win-cuda-12.4-x64.zip' } | Select-Object -First 1)
        if ($server.Count -gt 0 -and $cudart.Count -gt 0) {
            return @{ Tag=$release.tag_name; Server=$server[0]; Cudart=$cudart[0] }
        }
    }
    throw 'No Windows x64 CUDA 12.4 binary release with runtime DLLs was found in the latest 20 releases.'
}
