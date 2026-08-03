//! Steam installation, library and Transport Fever 2 path discovery.
//!
//! Windows must not assume that Steam or its libraries are installed on C:.
//! This module reads the Steam registry values, parses `libraryfolders.vdf`
//! and uses the app manifest for Transport Fever 2 (app 1066780).

use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(target_os = "windows")]
use std::process::Command;

const APP_ID: &str = "1066780";
const DEFAULT_INSTALL_DIR: &str = "Transport Fever 2";

fn path_key(path: &Path) -> String {
    let resolved = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let value = resolved.to_string_lossy().replace('\\', "/");
    #[cfg(target_os = "windows")]
    {
        return value.to_ascii_lowercase();
    }
    #[cfg(not(target_os = "windows"))]
    {
        value
    }
}

fn push_unique(paths: &mut Vec<PathBuf>, seen: &mut HashSet<String>, path: PathBuf) {
    if !path.is_dir() {
        return;
    }
    if seen.insert(path_key(&path)) {
        paths.push(path);
    }
}

fn file_name_eq(path: &Path, expected: &str) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case(expected))
}

#[cfg(target_os = "windows")]
fn registry_value(key: &str, value_name: &str) -> Option<PathBuf> {
    let output = Command::new("reg")
        .args(["query", key, "/v", value_name])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines().rev() {
        let Some(index) = line.find("REG_SZ") else {
            continue;
        };
        let value = line[index + "REG_SZ".len()..].trim();
        if !value.is_empty() {
            return Some(PathBuf::from(value.replace('/', "\\")));
        }
    }
    None
}

/// Known Steam client roots, including registry-configured Windows locations.
pub(crate) fn steam_install_roots() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for variable in ["ProgramFiles(x86)", "ProgramFiles", "ProgramW6432"] {
            if let Ok(base) = env::var(variable) {
                candidates.push(PathBuf::from(base).join("Steam"));
            }
        }
        if let Ok(home) = env::var("USERPROFILE") {
            candidates.push(PathBuf::from(home).join("Steam"));
        }
        for (key, value_name) in [
            (r"HKCU\Software\Valve\Steam", "SteamPath"),
            (r"HKCU\Software\Valve\Steam", "InstallPath"),
            (r"HKLM\SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
            (r"HKLM\SOFTWARE\Valve\Steam", "InstallPath"),
        ] {
            if let Some(path) = registry_value(key, value_name) {
                candidates.push(path);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = env::var("HOME") {
            let home = PathBuf::from(home);
            candidates.extend([
                home.join(".steam").join("steam"),
                home.join(".local").join("share").join("Steam"),
                home.join(".var")
                    .join("app")
                    .join("com.valvesoftware.Steam")
                    .join(".steam")
                    .join("steam"),
            ]);
        }
    }

    let mut roots = Vec::new();
    let mut seen = HashSet::new();
    for candidate in candidates {
        push_unique(&mut roots, &mut seen, candidate);
    }
    roots
}

/// Tokenize quoted Valve KeyValues strings while decoding common escapes.
fn quoted_tokens(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();
    while let Some(character) = chars.next() {
        if character != '"' {
            continue;
        }
        let mut token = String::new();
        while let Some(character) = chars.next() {
            match character {
                '"' => break,
                '\\' => match chars.peek().copied() {
                    Some('\\') | Some('"') => {
                        if let Some(escaped) = chars.next() {
                            token.push(escaped);
                        }
                    }
                    Some(_) => token.push('\\'),
                    None => token.push('\\'),
                },
                other => token.push(other),
            }
        }
        tokens.push(token);
    }
    tokens
}

fn path_like(value: &str) -> bool {
    Path::new(value).is_absolute()
        || value.starts_with('/')
        || value.as_bytes().get(1).is_some_and(|byte| *byte == b':')
}

fn parse_library_paths(input: &str) -> Vec<PathBuf> {
    let tokens = quoted_tokens(input);
    let mut paths = Vec::new();
    for pair in tokens.windows(2) {
        let key = &pair[0];
        let value = &pair[1];
        if (key.eq_ignore_ascii_case("path")
            || (key.chars().all(|character| character.is_ascii_digit()) && path_like(value)))
            && path_like(value)
        {
            paths.push(PathBuf::from(value));
        }
    }
    paths
}

fn parse_install_dir(input: &str) -> Option<String> {
    quoted_tokens(input)
        .windows(2)
        .find(|pair| pair[0].eq_ignore_ascii_case("installdir"))
        .map(|pair| pair[1].clone())
        .filter(|value| !value.trim().is_empty())
}

fn library_steamapps_roots_from(steam_roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();

    for steam_root in steam_roots {
        let primary = steam_root.join("steamapps");
        push_unique(&mut roots, &mut seen, primary.clone());

        for vdf in [
            primary.join("libraryfolders.vdf"),
            steam_root.join("config").join("libraryfolders.vdf"),
        ] {
            let Ok(content) = fs::read_to_string(vdf) else {
                continue;
            };
            for library in parse_library_paths(&content) {
                let steamapps = if file_name_eq(&library, "steamapps") {
                    library
                } else {
                    library.join("steamapps")
                };
                push_unique(&mut roots, &mut seen, steamapps);
            }
        }
    }
    roots
}

fn game_installations_from_steam_roots(steam_roots: &[PathBuf]) -> Vec<PathBuf> {
    let steamapps_roots = library_steamapps_roots_from(steam_roots);
    let mut installations = Vec::new();
    let mut seen = HashSet::new();

    for steamapps in steamapps_roots {
        let manifest = steamapps.join(format!("appmanifest_{APP_ID}.acf"));
        if let Ok(content) = fs::read_to_string(&manifest) {
            if let Some(install_dir) = parse_install_dir(&content) {
                push_unique(
                    &mut installations,
                    &mut seen,
                    steamapps.join("common").join(install_dir),
                );
            }
        }
        push_unique(
            &mut installations,
            &mut seen,
            steamapps.join("common").join(DEFAULT_INSTALL_DIR),
        );
    }
    installations
}

/// All detected Transport Fever 2 game roots and their native executable name.
pub(crate) fn game_installations() -> Vec<(PathBuf, &'static str)> {
    let executable = if cfg!(target_os = "windows") {
        "TransportFever2.exe"
    } else {
        "TransportFever2"
    };
    game_installations_from_steam_roots(&steam_install_roots())
        .into_iter()
        .map(|root| (root, executable))
        .collect()
}

pub(crate) fn steam_userdata_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();
    for steam_root in steam_install_roots() {
        push_unique(&mut roots, &mut seen, steam_root.join("userdata"));
    }
    roots
}

fn activity_time(path: &Path) -> SystemTime {
    let candidates = [
        path.to_path_buf(),
        path.join("settings.lua"),
        path.join("crash_dump").join("stdout.txt"),
        path.join("mods"),
        path.join("save"),
    ];
    candidates
        .into_iter()
        .filter_map(|candidate| fs::metadata(candidate).ok()?.modified().ok())
        .max()
        .unwrap_or(UNIX_EPOCH)
}

fn steam_user_data_candidates(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    for userdata_root in roots {
        let Ok(entries) = fs::read_dir(userdata_root) else {
            continue;
        };
        for entry in entries.flatten() {
            let local = entry.path().join(APP_ID).join("local");
            push_unique(&mut candidates, &mut seen, local);
        }
    }
    candidates
}

#[cfg(target_os = "windows")]
fn windows_document_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(home) = env::var("USERPROFILE") {
        candidates.push(
            PathBuf::from(home)
                .join("Documents")
                .join("Transport Fever 2"),
        );
    }
    for variable in ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"] {
        if let Ok(root) = env::var(variable) {
            candidates.push(
                PathBuf::from(root)
                    .join("Documents")
                    .join("Transport Fever 2"),
            );
        }
    }
    candidates
        .into_iter()
        .filter(|path| path.is_dir())
        .collect()
}

/// Prefer the active Steam account's app data. Documents is only a Windows
/// fallback when no Steam userdata directory can be resolved.
pub(crate) fn find_user_data_directory() -> Option<PathBuf> {
    let steam_candidates = steam_user_data_candidates(&steam_userdata_roots());
    if let Some(path) = steam_candidates
        .into_iter()
        .max_by_key(|path| activity_time(path))
    {
        return Some(path);
    }

    #[cfg(target_os = "windows")]
    {
        return windows_document_candidates()
            .into_iter()
            .max_by_key(|path| activity_time(path));
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

/// Derive the Workshop content root belonging to the Steam library that holds
/// the selected game installation.
pub(crate) fn workshop_root_from_game_root(game_root: &Path) -> Option<PathBuf> {
    let common = game_root.parent()?;
    if !file_name_eq(common, "common") {
        return None;
    }
    let steamapps = common.parent()?;
    let workshop = steamapps.join("workshop").join("content").join(APP_ID);
    workshop.is_dir().then_some(workshop)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_root(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root =
            env::temp_dir().join(format!("tpf2-steam-{label}-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&root).expect("temp root");
        root
    }

    #[test]
    fn parses_modern_and_legacy_library_folders() {
        let input = r#"
            "libraryfolders"
            {
                "0" { "path" "C:\\Program Files (x86)\\Steam" }
                "1" { "path" "D:\\SteamLibrary" "apps" { "1066780" "1" } }
                "2" "E:\\LegacyLibrary"
            }
        "#;
        let paths = parse_library_paths(input);
        assert!(paths.contains(&PathBuf::from(r"C:\Program Files (x86)\Steam")));
        assert!(paths.contains(&PathBuf::from(r"D:\SteamLibrary")));
        assert!(paths.contains(&PathBuf::from(r"E:\LegacyLibrary")));
    }

    #[test]
    fn resolves_manifest_install_directory_and_workshop_root() {
        let root = unique_temp_root("manifest");
        let steam = root.join("Steam");
        let steamapps = steam.join("steamapps");
        let game = steamapps.join("common").join("Custom TF2 Folder");
        let workshop = steamapps.join("workshop").join("content").join(APP_ID);
        fs::create_dir_all(&game).expect("game");
        fs::create_dir_all(&workshop).expect("workshop");
        fs::write(
            steamapps.join(format!("appmanifest_{APP_ID}.acf")),
            r#""AppState" { "appid" "1066780" "installdir" "Custom TF2 Folder" }"#,
        )
        .expect("manifest");

        let installations = game_installations_from_steam_roots(&[steam]);
        assert_eq!(installations, vec![game.clone()]);
        assert_eq!(workshop_root_from_game_root(&game), Some(workshop));

        fs::remove_dir_all(root).expect("cleanup");
    }
}
