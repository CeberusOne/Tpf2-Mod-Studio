# Install Tpf2 Mod Studio (Windows) from a GitHub release.
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
    [switch]$Silent,
    # Only for recovering from a broken checksum file; leaves the download unverified.
    [switch]$SkipChecksum
)

$ErrorActionPreference = "Stop"
$InstallerScriptVersion = "2026.08.02.3"

$headers = @{
    "User-Agent" = "Tpf2-Mod-Studio-Installer"
    "Accept"     = "application/vnd.github+json"
}

# Order releases by version, newest first.
#
# `/releases/latest` deliberately skips pre-releases. Every release of this
# project is a pre-release, so relying on it would return nothing today and,
# once a stable release exists, would silently keep installing that stable one
# while ignoring every newer pre-release. The list endpoint is used instead.
function Get-VersionKey {
    param([string]$TagName)
    $text = $TagName -replace '^v', ''
    $split = $text -split '-', 2
    $core = $split[0]
    $pre = if ($split.Count -gt 1) { $split[1] } else { "" }

    $parts = @($core -split '\.') + @('0', '0', '0')
    $numbers = @()
    foreach ($part in $parts[0..2]) {
        $value = 0
        [void][int]::TryParse($part, [ref]$value)
        $numbers += $value
    }
    # Zero-pad so 10 sorts above 9 instead of below it as plain text would.
    $key = "{0:D6}.{1:D6}.{2:D6}" -f $numbers[0], $numbers[1], $numbers[2]
    if ([string]::IsNullOrEmpty($pre)) {
        # A release without a pre-release part outranks any pre-release of the
        # same core version.
        return "$key.1."
    }
    $identifiers = @()
    foreach ($identifier in ($pre -split '\.')) {
        if ($identifier -match '^\d+$') {
            $identifiers += "0" + ("{0:D10}" -f [int]$identifier)
        } else {
            $identifiers += "1" + $identifier
        }
    }
    return "$key.0." + ($identifiers -join '.')
}

function Get-Release {
    param([string]$Repository, [string]$ReleaseTag)
    if ($ReleaseTag -ne "latest") {
        return Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/tags/$ReleaseTag" -Headers $headers
    }
    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases?per_page=50" -Headers $headers
    $usable = @($releases | Where-Object { -not $_.draft })
    if ($usable.Count -eq 0) {
        throw "No published release found for $Repository."
    }
    return $usable |
        Sort-Object -Property @{ Expression = { Get-VersionKey $_.tag_name } } -Descending |
        Select-Object -First 1
}

Write-Host "==> Installer script: $InstallerScriptVersion"
Write-Host "==> Resolving release ($Tag) from $Repo..."
$release = Get-Release -Repository $Repo -ReleaseTag $Tag
$tagName = $release.tag_name

# Prefer the NSIS setup; only fall back to MSI when no setup exists.
if ($Package -eq "msi") {
    $asset = $release.assets | Where-Object { $_.name -like "*.msi" } | Select-Object -First 1
} else {
    $asset = $release.assets | Where-Object { $_.name -like "*setup*.exe" } | Select-Object -First 1
    if (-not $asset) {
        $asset = $release.assets | Where-Object { $_.name -like "*.msi" } | Select-Object -First 1
        if ($asset) { Write-Host "No NSIS setup on this release; using MSI: $($asset.name)" }
    }
}
if (-not $asset) {
    throw "No Windows installer asset on release $tagName. See https://github.com/$Repo/releases"
}

# The asset file name carries the package version. If it disagrees with the
# resolved tag, something other than the intended release is about to install.
$version = $tagName -replace '^v', ''
if ($asset.name -notlike "*$version*") {
    throw "Asset '$($asset.name)' does not carry version '$version' from tag '$tagName'. Aborting rather than installing an unexpected build."
}

$downloadDir = Join-Path $env:TEMP "tpf2-mod-studio-install"
New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null
$installerPath = Join-Path $downloadDir $asset.name

Write-Host "==> Release: $tagName"
Write-Host "==> Download: $($asset.browser_download_url)"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installerPath -Headers @{ "User-Agent" = "Tpf2-Mod-Studio-Installer" }

# Packages are unsigned, so the published checksum is the only integrity check
# available. Download the checksum asset to disk and read it explicitly as
# UTF-8. This avoids differing Invoke-WebRequest.Content types between Windows
# PowerShell 5.1 and newer PowerShell releases.
$checksumAsset = $release.assets | Where-Object { $_.name -eq "SHA256SUMS.txt" } | Select-Object -First 1
if ($SkipChecksum) {
    Write-Host "!! Checksum verification skipped on request."
} elseif (-not $checksumAsset) {
    Write-Host "!! Release $tagName publishes no SHA256SUMS.txt; cannot verify the download."
} else {
    Write-Host "==> Verifying SHA-256..."
    $checksumPath = Join-Path $downloadDir "SHA256SUMS-$tagName.txt"
    Invoke-WebRequest -Uri $checksumAsset.browser_download_url -OutFile $checksumPath -Headers @{ "User-Agent" = "Tpf2-Mod-Studio-Installer" }
    $sums = [System.IO.File]::ReadAllText($checksumPath, [System.Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
    $expected = $null

    foreach ($line in ($sums -split "`r?`n")) {
        # Accept the standard sha256sum formats:
        #   <hash>  filename
        #   <hash> *filename
        # Also tolerate ./ or directory prefixes from older release jobs.
        if ($line -match '^\s*([0-9A-Fa-f]{64})\s+\*?(.+?)\s*$') {
            $listedPath = $matches[2].Trim().Replace('\', '/')
            $listedName = [System.IO.Path]::GetFileName($listedPath)
            if ($listedName -ieq $asset.name) {
                $expected = $matches[1].ToLowerInvariant()
                break
            }
        }
    }

    if (-not $expected) {
        throw "SHA256SUMS.txt contains no usable entry for $($asset.name)."
    }
    $actual = (Get-FileHash -Path $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) {
        Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
        throw "Checksum mismatch for $($asset.name). Expected $expected, got $actual. The download was deleted."
    }
    Write-Host "    OK $actual"
}

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
