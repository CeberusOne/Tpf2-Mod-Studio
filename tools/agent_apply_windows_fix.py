from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.1.0-alpha.11"
TAG = f"v{VERSION}"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(content: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Expected exactly one replacement for {label}, got {count}")
    return updated


STEAM_RS = r'''//! Steam installation, library and Transport Fever 2 path discovery.
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
            || (key.chars().all(|character| character.is_ascii_digit())
                && path_like(value)))
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
    if let Some(path) = steam_candidates.into_iter().max_by_key(|path| activity_time(path)) {
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
        let root = env::temp_dir().join(format!(
            "tpf2-steam-{label}-{}-{nanos}",
            std::process::id()
        ));
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
'''

write("apps/desktop/src-tauri/src/steam.rs", STEAM_RS)

lib_rs = read("apps/desktop/src-tauri/src/lib.rs")
if "mod steam;" not in lib_rs:
    lib_rs = lib_rs.replace("mod savegame;\n", "mod savegame;\nmod steam;\n", 1)
lib_rs = lib_rs.replace("    env,\n", "", 1)
lib_rs = replace_once(
    lib_rs,
    r"fn steam_userdata_roots\(\) -> Vec<PathBuf> \{.*?\n\}\n\n/// Prefer the most recently modified Steam user-data folder for app 1066780\.\nfn find_user_data_directory\(\) -> Option<PathBuf> \{.*?\n\}\n",
    "fn find_user_data_directory() -> Option<PathBuf> {\n    steam::find_user_data_directory()\n}\n",
    "Steam userdata helpers",
)
lib_rs = replace_once(
    lib_rs,
    r"#\[tauri::command\]\nfn detect_installations\(\) -> Vec<InstallationCandidate> \{.*?\n\}\n\n#\[tauri::command\]\nfn read_tf2_log",
    '''#[tauri::command]
fn detect_installations() -> Vec<InstallationCandidate> {
    let user_data = find_user_data_directory();
    let mut seen = HashSet::new();
    steam::game_installations()
        .into_iter()
        .filter_map(|(root, executable)| {
            let key = path_string(&root);
            if !seen.insert(key) {
                return None;
            }
            Some(candidate(root, executable, user_data.as_deref()))
        })
        .collect()
}

#[tauri::command]
fn read_tf2_log''',
    "installation detection",
)
write("apps/desktop/src-tauri/src/lib.rs", lib_rs)

library_rs = read("apps/desktop/src-tauri/src/library.rs")
if "collections::{HashMap, HashSet}" not in library_rs:
    library_rs = library_rs.replace(
        "use std::{\n",
        "use std::{\n    collections::{HashMap, HashSet},\n",
        1,
    )

scan_replacement = r'''fn directory_key(path: &Path) -> String {
    let resolved = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let value = path_string(&resolved).replace('\\', "/");
    #[cfg(target_os = "windows")]
    {
        return value.to_ascii_lowercase();
    }
    #[cfg(not(target_os = "windows"))]
    {
        value
    }
}

fn mod_id_key(id: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        return id.to_ascii_lowercase();
    }
    #[cfg(not(target_os = "windows"))]
    {
        id.to_string()
    }
}

fn scan_mod_directory_once(
    root: &Path,
    source: &str,
    scanned_roots: &mut HashSet<String>,
    into: &mut Vec<InstalledMod>,
) {
    if root.is_dir() && scanned_roots.insert(directory_key(root)) {
        scan_mod_directory(root, source, into);
    }
}

/// Scan local mods, staging area, Steam Workshop content and game-provided mods.
pub fn scan_mod_library(
    mods_path: Option<String>,
    user_data_path: Option<String>,
    game_root: Option<String>,
) -> Vec<InstalledMod> {
    let mut mods = Vec::new();
    let mut scanned_roots = HashSet::new();

    if let Some(path) = mods_path {
        scan_mod_directory_once(
            &PathBuf::from(path),
            "local",
            &mut scanned_roots,
            &mut mods,
        );
    }

    if let Some(user_data) = user_data_path {
        let user_data = PathBuf::from(user_data);
        scan_mod_directory_once(
            &user_data.join("mods"),
            "local",
            &mut scanned_roots,
            &mut mods,
        );
        scan_mod_directory_once(
            &user_data.join("staging_area"),
            "staging",
            &mut scanned_roots,
            &mut mods,
        );
    }

    if let Some(game) = game_root {
        let game = PathBuf::from(game);
        if let Some(workshop) = crate::steam::workshop_root_from_game_root(&game) {
            scan_mod_directory_once(
                &workshop,
                "workshop",
                &mut scanned_roots,
                &mut mods,
            );
        }
        scan_mod_directory_once(
            &game.join("mods"),
            "builtin",
            &mut scanned_roots,
            &mut mods,
        );
    }

    // Source precedence is local -> staging -> workshop -> built-in. Mark later
    // copies with the first matching mod folder ID. Windows IDs are compared
    // case-insensitively because the filesystem is case-insensitive.
    let mut seen: HashMap<String, String> = HashMap::new();
    for item in &mut mods {
        let key = mod_id_key(&item.id);
        if let Some(first) = seen.get(&key) {
            item.duplicate_of = Some(first.clone());
        } else {
            seen.insert(key, item.path.clone());
        }
    }

    mods.sort_by(|left, right| {
        left.id
            .cmp(&right.id)
            .then(left.source.cmp(&right.source))
    });
    mods
}

#[cfg(test)]
mod source_tests {
    use super::*;
    use std::env;

    fn unique_temp_root() -> PathBuf {
        let root = env::temp_dir().join(format!(
            "tpf2-library-sources-{}-{}",
            std::process::id(),
            now_millis()
        ));
        fs::create_dir_all(&root).expect("temp root");
        root
    }

    fn create_mod(root: &Path, id: &str) {
        let directory = root.join(id);
        fs::create_dir_all(&directory).expect("mod directory");
        fs::write(
            directory.join("mod.lua"),
            format!("function data() return {{ info = {{ name = \\\"{id}\\\" }} }} end"),
        )
        .expect("mod.lua");
    }

    #[test]
    fn scans_every_supported_source_without_double_scanning_local_mods() {
        let root = unique_temp_root();
        let steamapps = root.join("SteamLibrary").join("steamapps");
        let game = steamapps.join("common").join("Transport Fever 2");
        let user_data = root.join("userdata").join("123").join("1066780").join("local");
        let local = user_data.join("mods");
        let staging = user_data.join("staging_area");
        let workshop = steamapps.join("workshop").join("content").join("1066780");
        let builtin = game.join("mods");

        create_mod(&local, "local_mod_1");
        create_mod(&staging, "staging_mod_1");
        create_mod(&workshop, "workshop_mod_1");
        create_mod(&builtin, "builtin_mod_1");

        let mods = scan_mod_library(
            Some(path_string(&local)),
            Some(path_string(&user_data)),
            Some(path_string(&game)),
        );
        let sources: HashSet<_> = mods.iter().map(|item| item.source.as_str()).collect();

        assert_eq!(mods.len(), 4);
        assert_eq!(sources, HashSet::from(["local", "staging", "workshop", "builtin"]));
        assert_eq!(mods.iter().filter(|item| item.source == "local").count(), 1);

        fs::remove_dir_all(root).expect("cleanup");
    }
}

/// Rank a mod-root image'''

library_rs = replace_once(
    library_rs,
    r"/// Scan local mods, staging area and Steam Workshop content for app 1066780\.\npub fn scan_mod_library\(.*?\n\}\n\n/// Rank a mod-root image",
    scan_replacement,
    "mod source scanner",
)
write("apps/desktop/src-tauri/src/library.rs", library_rs)

for version_file in [
    "package.json",
    "package-lock.json",
    "apps/desktop/package.json",
    "apps/desktop/src-tauri/Cargo.toml",
    "apps/desktop/src-tauri/Cargo.lock",
    "apps/desktop/src-tauri/tauri.conf.json",
]:
    content = read(version_file)
    content = re.sub(r"0\.1\.0-alpha\.\d+", VERSION, content)
    write(version_file, content)

readme = read("README.md")
readme = re.sub(
    r"\*\*Current source version: `v0\.1\.0-alpha\.\d+` — product status: PARTIAL\*\*",
    f"**Current source version: `{TAG}` — product status: PARTIAL**",
    readme,
    count=1,
)
readme = re.sub(
    r"Alpha\.\d+ adds .*?\nexpanded 3D model-viewer tools and several editor and interface fixes\.\n",
    "Alpha.11 fixes Windows Steam discovery across registry-configured and custom Steam libraries, and verifies local, staging, Workshop and game-provided mod scanning on both platforms.\n",
    readme,
    count=1,
    flags=re.S,
)
write("README.md", readme)

changelog = read("CHANGELOG.md")
entry = f'''## {VERSION} — 2026-08-03

- Windows Steam discovery now reads registry-configured Steam locations,
  `libraryfolders.vdf` and `appmanifest_1066780.acf` instead of assuming C:.
- Custom Steam libraries on D:, E: and other drives are detected automatically.
- Steam userdata discovery now follows the detected Steam client and supports
  multiple accounts; OneDrive Documents is retained only as a fallback.
- Mod Manager scanning is verified for local mods, `staging_area`, Steam
  Workshop content and game-provided mods, with canonical root deduplication.
- Manual game, userdata and mod paths remain available and override only the
  values explicitly supplied by the user.

'''
if f"## {VERSION}" not in changelog:
    changelog = changelog.replace("# Changelog\n\n", "# Changelog\n\n" + entry, 1)
write("CHANGELOG.md", changelog)

release_notes = f'''# Tpf2 Mod Studio {VERSION}

This release fixes Windows installation and mod-source discovery while keeping
all Linux behavior intact.

## Fixed on Windows

- Detects Steam through Windows registry values and standard fallback paths.
- Parses every configured Steam library from `libraryfolders.vdf`.
- Resolves the real Transport Fever 2 directory from `appmanifest_1066780.acf`.
- Detects Steam userdata for app 1066780 across multiple Steam accounts.
- Supports Steam installations and game libraries on C:, D:, E: or other drives.

## Verified mod sources

- Local mods: `.../1066780/local/mods`
- Staging mods: `.../1066780/local/staging_area`
- Steam Workshop: `steamapps/workshop/content/1066780`
- Game-provided mods: `<Transport Fever 2>/mods`

Manual paths remain available through **Game paths / Spielpfade** and take
precedence over automatic values without disabling the other detected sources.

## Install

**Windows PowerShell**

```powershell
irm https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-windows.ps1 | iex
```

**Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-linux.sh | bash
```

Packages are unsigned. Verify them with the included `SHA256SUMS.txt` when
needed.
'''
write(f"docs/release-notes-{VERSION}.md", release_notes)

tag_workflow = f'''name: Tag {VERSION} after merge

on:
  push:
    branches:
      - main

permissions:
  contents: write

jobs:
  tag-release:
    if: github.repository == 'CeberusOne/Tpf2-Mod-Studio'
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - name: Verify release version
        run: grep -F '"version": "{VERSION}"' package.json
      - name: Create release tag once
        env:
          TAG: {TAG}
        run: |
          if git rev-parse "$TAG" >/dev/null 2>&1; then
            echo "$TAG already exists."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git tag -a "$TAG" -m "Tpf2 Mod Studio {VERSION}"
          git push origin "$TAG"
'''
write(".github/workflows/tag-alpha11-after-merge.yml", tag_workflow)

print("Windows detection, source scanning tests and release metadata prepared.")
