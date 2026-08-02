# Install Tpf2 Mod Studio (Windows) from the latest GitHub release.
# Usage (PowerShell):
#   irm https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-windows.ps1 | iex
# Or from a local clone:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
[CmdletBinding()]
param(
    [string]$Repo = $(if ($env:TPF2_REPO) { $env:TPF2_REPO } else { "CeberusOne/Tpf2-Mod-Studio" }),
    [string]$Tag = $(if ($env:TPF2_TAG) { $env:TPF2_TAG } else { "latest" }),
    [ValidateSet("nsis", "msi")]
    [string]$Package = "nsis",
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

function Get-Release {
    param([string]$Repository, [string]$ReleaseTag)
    $headers = @{
        "User-Agent" = "Tpf2-Mod-Studio-Installer"
        "Accept"     = "application/vnd.github+json"
    }
    if ($ReleaseTag -ne "latest") {
        $uri = "https://api.github.com/repos/$Repository/releases/tags/$ReleaseTag"
        return Invoke-RestMethod -Uri $uri -Headers $headers
    }

    # Prefer /latest, then fall back to newest non-draft (includes pre-releases).
    try {
        return Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/latest" -Headers $headers
    } catch {
        $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases?per_page=20" -Headers $headers
        $candidate = $releases | Where-Object { -not $_.draft } | Select-Object -First 1
        if (-not $candidate) {
            throw "No published release found for $Repository."
        }
        return $candidate
    }
}

Write-Host "==> Resolving release ($Tag) from $Repo..."
$release = Get-Release -Repository $Repo -ReleaseTag $Tag
$tagName = $release.tag_name

$pattern = if ($Package -eq "msi") { "\.msi$" } else { "setup\.exe$|\.exe$" }
$asset = $release.assets | Where-Object { $_.name -match $pattern } | Select-Object -First 1

if (-not $asset) {
    # Prefer NSIS setup when multiple EXEs exist.
    $asset = $release.assets | Where-Object { $_.name -like "*setup*.exe" } | Select-Object -First 1
}
if (-not $asset -and $Package -eq "nsis") {
    $asset = $release.assets | Where-Object { $_.name -like "*.msi" } | Select-Object -First 1
    if ($asset) {
        Write-Host "NSIS setup not found; falling back to MSI: $($asset.name)"
    }
}

if (-not $asset) {
    throw "No Windows installer asset found on release $Tag. Open https://github.com/$Repo/releases"
}

$downloadDir = Join-Path $env:TEMP "tpf2-mod-studio-install"
New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
$installerPath = Join-Path $downloadDir $asset.name

Write-Host "==> Release: $tagName"
Write-Host "==> Download: $($asset.browser_download_url)"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installerPath

Write-Host "==> Starting installer..."
if ($asset.name -like "*.msi") {
    $msiArgs = @("/i", "`"$installerPath`"")
    if ($Silent) { $msiArgs += "/qn" } else { $msiArgs += "/passive" }
    $proc = Start-Process -FilePath "msiexec.exe" -ArgumentList $msiArgs -Wait -PassThru
} else {
    # Tauri NSIS: /S for silent install. Do not pass an empty ArgumentList,
    # because Windows PowerShell 5.1 rejects empty arrays for this parameter.
    if ($Silent) {
        $proc = Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -PassThru
    } else {
        $proc = Start-Process -FilePath $installerPath -Wait -PassThru
    }
}

if ($proc.ExitCode -ne 0) {
    throw "Installer exited with code $($proc.ExitCode)."
}

Write-Host ""
Write-Host "Installed Tpf2 Mod Studio ($tagName)"
Write-Host "  Package : $($asset.name)"
Write-Host "  Start from the Start menu: Tpf2 Mod Studio"
Write-Host ""
Write-Host "If Windows SmartScreen warns about an unsigned app, choose More info -> Run anyway."
