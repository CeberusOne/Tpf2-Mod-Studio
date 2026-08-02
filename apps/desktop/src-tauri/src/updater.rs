//! Self-update from GitHub Releases (including pre-releases).
//!
//! The UI should call [`check_for_update`] **once at startup** and only
//! apply via an explicit user action. Automatic install+restart caused
//! endless relaunch loops when the published package version lagged the
//! release tag.
//!
//! Linux AppImage installs replace the current image; Windows downloads
//! the NSIS setup and runs it silently.

use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

const GITHUB_REPO: &str = "CeberusOne/Tpf2-Mod-Studio";
const USER_AGENT: &str = "Tpf2-Mod-Studio-Updater";
const MAX_DOWNLOAD_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_tag: String,
    pub notes: String,
    pub download_url: String,
    pub asset_name: String,
    pub html_url: String,
}

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    draft: bool,
    #[allow(dead_code)]
    prerelease: bool,
    html_url: String,
    assets: Vec<GhAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
    #[allow(dead_code)]
    size: u64,
}

fn current_version_string() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn parse_version(raw: &str) -> Option<semver::Version> {
    let trimmed = raw.trim().trim_start_matches('v');
    semver::Version::parse(trimmed).ok()
}

/// Stable user-data directory for updater state (survives AppImage restarts).
fn updater_state_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(base) = env::var("LOCALAPPDATA") {
            return Some(PathBuf::from(base).join("Tpf2ModStudio"));
        }
        if let Ok(base) = env::var("APPDATA") {
            return Some(PathBuf::from(base).join("Tpf2ModStudio"));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(xdg) = env::var("XDG_DATA_HOME") {
            return Some(PathBuf::from(xdg).join("tpf2-mod-studio"));
        }
        if let Ok(home) = env::var("HOME") {
            return Some(PathBuf::from(home).join(".local/share/tpf2-mod-studio"));
        }
    }
    None
}

fn applied_tag_path() -> Option<PathBuf> {
    updater_state_dir().map(|dir| dir.join("last-applied-release-tag"))
}

/// Tag of the release we already installed (empty if never recorded).
pub fn read_applied_release_tag() -> String {
    let Some(path) = applied_tag_path() else {
        return String::new();
    };
    fs::read_to_string(path)
        .map(|value| value.trim().to_string())
        .unwrap_or_default()
}

/// Persist the release tag so the same package is never re-applied in a loop.
pub fn remember_applied_release_tag(tag: &str) -> Result<(), String> {
    let tag = tag.trim();
    if tag.is_empty() {
        return Ok(());
    }
    let path = applied_tag_path().ok_or_else(|| {
        "Cannot resolve updater state directory for applied release tag.".to_string()
    })?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Cannot create updater state directory: {error}"))?;
    }
    fs::write(&path, format!("{tag}\n"))
        .map_err(|error| format!("Cannot write applied release tag: {error}"))
}

fn tag_matches_applied(release_tag: &str, latest_version: &str, applied: &str) -> bool {
    if applied.is_empty() {
        return false;
    }
    let applied = applied.trim();
    applied == release_tag
        || applied == latest_version
        || applied == format!("v{latest_version}")
        || release_tag.trim_start_matches('v') == applied.trim_start_matches('v')
}

fn platform_asset_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    #[cfg(target_os = "linux")]
    {
        lower.ends_with(".appimage")
    }
    #[cfg(target_os = "windows")]
    {
        lower.contains("setup") && lower.ends_with(".exe") || lower.ends_with(".msi")
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = lower;
        false
    }
}

fn prefer_windows_setup(a: &GhAsset, b: &GhAsset) -> std::cmp::Ordering {
    let score = |asset: &GhAsset| {
        let lower = asset.name.to_ascii_lowercase();
        if lower.contains("setup") && lower.ends_with(".exe") {
            0
        } else if lower.ends_with(".msi") {
            1
        } else {
            2
        }
    };
    score(a).cmp(&score(b))
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Cannot create HTTP client: {error}"))
}

async fn fetch_releases(client: &reqwest::Client) -> Result<Vec<GhRelease>, String> {
    let url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases?per_page=15");
    let response = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("GitHub releases request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "GitHub releases returned HTTP {}",
            response.status()
        ));
    }
    response
        .json::<Vec<GhRelease>>()
        .await
        .map_err(|error| format!("Cannot parse GitHub releases JSON: {error}"))
}

fn pick_asset(release: &GhRelease) -> Option<&GhAsset> {
    let mut matches: Vec<&GhAsset> = release
        .assets
        .iter()
        .filter(|asset| platform_asset_name(&asset.name))
        .collect();
    if matches.is_empty() {
        return None;
    }
    #[cfg(target_os = "windows")]
    {
        matches.sort_by(|a, b| prefer_windows_setup(a, b));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = prefer_windows_setup;
        matches.sort_by(|a, b| a.name.cmp(&b.name));
    }
    matches.into_iter().next()
}

/// Compare remote release versions and return the newest newer-than-current release.
///
/// If the newest newer release was already applied (marker file), report
/// `available: false` so install+restart loops cannot continue.
pub async fn check_for_update() -> Result<UpdateInfo, String> {
    let current_raw = current_version_string();
    let current = parse_version(&current_raw)
        .ok_or_else(|| format!("Invalid current version: {current_raw}"))?;
    let applied = read_applied_release_tag();
    let client = http_client()?;
    let releases = fetch_releases(&client).await?;

    let mut best: Option<(semver::Version, GhRelease, GhAsset)> = None;
    for release in releases {
        if release.draft {
            continue;
        }
        let Some(version) = parse_version(&release.tag_name) else {
            continue;
        };
        if version <= current {
            continue;
        }
        // Already installed this tag (package version may still lag the tag).
        if tag_matches_applied(&release.tag_name, &version.to_string(), &applied) {
            continue;
        }
        let Some(asset) = pick_asset(&release).cloned() else {
            continue;
        };
        let is_better = best
            .as_ref()
            .map(|(existing, _, _)| version > *existing)
            .unwrap_or(true);
        if is_better {
            best = Some((version, release, asset));
        }
    }

    let Some((version, release, asset)) = best else {
        return Ok(UpdateInfo {
            available: false,
            current_version: current_raw,
            latest_version: current.to_string(),
            release_tag: String::new(),
            notes: String::new(),
            download_url: String::new(),
            asset_name: String::new(),
            html_url: String::new(),
        });
    };

    Ok(UpdateInfo {
        available: true,
        current_version: current_raw,
        latest_version: version.to_string(),
        release_tag: release.tag_name,
        notes: release
            .body
            .or(release.name)
            .unwrap_or_default()
            .chars()
            .take(4_000)
            .collect(),
        download_url: asset.browser_download_url,
        asset_name: asset.name,
        html_url: release.html_url,
    })
}

fn timestamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default()
}

#[cfg(target_os = "linux")]
fn linux_install_target() -> Result<PathBuf, String> {
    if let Ok(appimage) = env::var("APPIMAGE") {
        let path = PathBuf::from(appimage);
        if path.is_file() {
            return Ok(path);
        }
    }
    if let Ok(home) = env::var("HOME") {
        let candidates = [
            PathBuf::from(&home).join("Applications/Tpf2.Mod.Studio.AppImage"),
            PathBuf::from(&home).join("Applications/Tpf2.Mod.Studio_0.1.0_amd64.AppImage"),
        ];
        for candidate in candidates {
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
        // Default install location used by scripts/install-linux.sh
        return Ok(PathBuf::from(home).join("Applications/Tpf2.Mod.Studio.AppImage"));
    }
    Err("Cannot determine Linux AppImage install path.".into())
}

async fn download_to_file(url: &str, destination: &Path) -> Result<(), String> {
    let client = http_client()?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Download failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Download HTTP {}", response.status()));
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Cannot create download directory: {error}"))?;
    }
    let mut file = fs::File::create(destination)
        .map_err(|error| format!("Cannot create download file: {error}"))?;
    // Stream to disk: installer packages are tens of megabytes.
    let mut downloaded = 0u64;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Download body failed: {error}"))?
    {
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > MAX_DOWNLOAD_BYTES {
            let _ = fs::remove_file(destination);
            return Err(format!(
                "The update package exceeds the {MAX_DOWNLOAD_BYTES} byte download limit."
            ));
        }
        file.write_all(&chunk)
            .map_err(|error| format!("Cannot write download: {error}"))?;
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn replace_file_atomic(source: &Path, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Cannot create install directory: {error}"))?;
    }
    let backup = target.with_extension(format!("bak-{}", timestamp()));
    if target.exists() {
        fs::rename(target, &backup)
            .map_err(|error| format!("Cannot backup previous install: {error}"))?;
    }
    match fs::rename(source, target) {
        Ok(()) => {
            let _ = fs::remove_file(&backup);
            Ok(())
        }
        Err(_) => {
            // Cross-device rename can fail; fall back to copy.
            fs::copy(source, target).map_err(|error| {
                if backup.exists() {
                    let _ = fs::rename(&backup, target);
                }
                format!("Cannot install update file: {error}")
            })?;
            let _ = fs::remove_file(source);
            let _ = fs::remove_file(&backup);
            Ok(())
        }
    }
}

/// Download and install the given update package for this platform.
pub async fn apply_update(info: UpdateInfo) -> Result<String, String> {
    if !info.available || info.download_url.is_empty() {
        return Err("No update is available to install.".into());
    }

    let tag = if info.release_tag.is_empty() {
        format!("v{}", info.latest_version)
    } else {
        info.release_tag.clone()
    };
    let applied = read_applied_release_tag();
    if tag_matches_applied(&tag, &info.latest_version, &applied) {
        return Err(format!(
            "Release {tag} was already applied; refusing to reinstall (loop guard)."
        ));
    }
    // Record before download/install so a crash mid-install cannot loop forever.
    remember_applied_release_tag(&tag)?;

    let temp_dir = env::temp_dir().join(format!(
        "tpf2-mod-studio-update-{}-{}",
        std::process::id(),
        timestamp()
    ));
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("Cannot create temp update directory: {error}"))?;
    let download_path = temp_dir.join(&info.asset_name);
    download_to_file(&info.download_url, &download_path).await?;

    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        let target = linux_install_target()?;
        let mut perms = fs::metadata(&download_path)
            .map_err(|error| format!("Cannot read downloaded AppImage metadata: {error}"))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&download_path, perms)
            .map_err(|error| format!("Cannot mark AppImage executable: {error}"))?;
        replace_file_atomic(&download_path, &target)?;
        // Keep launcher wrapper pointing at the stable name when possible.
        if let Ok(home) = env::var("HOME") {
            let wrapper = PathBuf::from(home).join(".local/bin/tpf2-mod-studio");
            if !wrapper.exists() {
                let script = format!(
                    "#!/usr/bin/env bash\nexport WEBKIT_DISABLE_DMABUF_RENDERER=\"${{WEBKIT_DISABLE_DMABUF_RENDERER:-1}}\"\nexec \"{}\" \"$@\"\n",
                    target.display()
                );
                if let Some(parent) = wrapper.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                if fs::write(&wrapper, script).is_ok() {
                    let mut perms = fs::metadata(&wrapper)
                        .map(|meta| meta.permissions())
                        .unwrap_or_else(|_| fs::Permissions::from_mode(0o755));
                    perms.set_mode(0o755);
                    let _ = fs::set_permissions(&wrapper, perms);
                }
            }
        }
        let _ = fs::remove_dir_all(&temp_dir);
        Ok(format!(
            "Updated to {} at {}",
            info.latest_version,
            target.display()
        ))
    }

    #[cfg(target_os = "windows")]
    {
        let lower = info.asset_name.to_ascii_lowercase();
        if lower.ends_with(".msi") {
            let status = Command::new("msiexec.exe")
                .args([
                    "/i",
                    &download_path.to_string_lossy(),
                    "/passive",
                    "/norestart",
                ])
                .status()
                .map_err(|error| format!("Cannot start MSI installer: {error}"))?;
            if !status.success() {
                return Err(format!("MSI installer exited with {status}"));
            }
        } else {
            // NSIS setup from Tauri: /S silent install
            let status = Command::new(&download_path)
                .arg("/S")
                .status()
                .map_err(|error| format!("Cannot start setup installer: {error}"))?;
            if !status.success() {
                return Err(format!("Setup installer exited with {status}"));
            }
        }
        let _ = fs::remove_dir_all(&temp_dir);
        Ok(format!(
            "Installed update {}. Restart the application if it does not relaunch automatically.",
            info.latest_version
        ))
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = download_path;
        let _ = temp_dir;
        Err("Auto-update is only implemented for Linux and Windows.".into())
    }
}

pub fn restart_application() -> Result<(), String> {
    let current = env::current_exe()
        .map_err(|error| format!("Cannot resolve current executable: {error}"))?;
    #[cfg(target_os = "linux")]
    {
        if let Ok(appimage) = env::var("APPIMAGE") {
            Command::new(appimage)
                .spawn()
                .map_err(|error| format!("Cannot relaunch AppImage: {error}"))?;
            std::process::exit(0);
        }
        if let Ok(home) = env::var("HOME") {
            let installed = PathBuf::from(home).join("Applications/Tpf2.Mod.Studio.AppImage");
            if installed.is_file() {
                Command::new(installed)
                    .spawn()
                    .map_err(|error| format!("Cannot relaunch installed AppImage: {error}"))?;
                std::process::exit(0);
            }
        }
    }
    Command::new(current)
        .spawn()
        .map_err(|error| format!("Cannot relaunch application: {error}"))?;
    std::process::exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_version_accepts_v_prefix_and_prerelease() {
        let version = parse_version("v0.1.0-alpha.4").expect("parse");
        assert_eq!(version.major, 0);
        assert_eq!(version.minor, 1);
        assert_eq!(version.patch, 0);
        assert!(!version.pre.is_empty());
        assert!(parse_version("0.1.0").expect("stable") > version);
    }

    #[test]
    fn platform_asset_filter_matches_expected_names() {
        #[cfg(target_os = "linux")]
        {
            assert!(platform_asset_name("Tpf2.Mod.Studio_0.1.0_amd64.AppImage"));
            assert!(!platform_asset_name("Tpf2.Mod.Studio_0.1.0_x64-setup.exe"));
        }
        #[cfg(target_os = "windows")]
        {
            assert!(platform_asset_name("Tpf2.Mod.Studio_0.1.0_x64-setup.exe"));
            assert!(platform_asset_name("Tpf2.Mod.Studio_0.1.0_x64_en-US.msi"));
            assert!(!platform_asset_name("Tpf2.Mod.Studio_0.1.0_amd64.AppImage"));
        }
    }

    /// Live GitHub call: opt in with `TPF2_UPDATER_NETWORK_TESTS=1`.
    /// Unauthenticated api.github.com allows 60 requests/hour per IP, so this
    /// must not run on every `cargo test` or in offline environments.
    #[tokio::test]
    async fn check_for_update_returns_structured_result() {
        if env::var_os("TPF2_UPDATER_NETWORK_TESTS").is_none() {
            eprintln!("skipped: set TPF2_UPDATER_NETWORK_TESTS=1 to run the live GitHub check");
            return;
        }
        let info = check_for_update().await.expect("github check");
        assert!(!info.current_version.is_empty());
        if info.available {
            assert!(info.download_url.starts_with("https://"));
            assert!(!info.asset_name.is_empty());
            assert!(
                parse_version(&info.latest_version).expect("latest")
                    > parse_version(&info.current_version).expect("current")
            );
        }
    }
}

#[cfg(test)]
mod applied_tag_tests {
    use super::*;

    #[test]
    fn tag_match_accepts_v_prefix_variants() {
        assert!(tag_matches_applied(
            "v0.1.0-alpha.5",
            "0.1.0-alpha.5",
            "v0.1.0-alpha.5"
        ));
        assert!(tag_matches_applied(
            "v0.1.0-alpha.5",
            "0.1.0-alpha.5",
            "0.1.0-alpha.5"
        ));
        assert!(!tag_matches_applied(
            "v0.1.0-alpha.6",
            "0.1.0-alpha.6",
            "v0.1.0-alpha.5"
        ));
    }
}
