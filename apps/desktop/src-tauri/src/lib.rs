use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env,
    ffi::OsStr,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_SCANNED_FILES: usize = 20_000;
const MAX_TEXT_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_EDIT_BYTES: usize = 8 * 1024 * 1024;
const MAX_LOG_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum ProjectMode {
    Vanilla,
    Commonapi2,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectRequest {
    parent_directory: String,
    project_id: String,
    display_name: String,
    author: String,
    mode: ProjectMode,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatedProject {
    root_path: String,
    project_id: String,
    mode: ProjectMode,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFile {
    relative_path: String,
    size: u64,
    modified_ms: u128,
    text: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSnapshot {
    root_path: String,
    folder_name: String,
    mode: ProjectMode,
    scanned_at: String,
    files: Vec<ProjectFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallResult {
    installed_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    backup_path: Option<String>,
    file_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallationCandidate {
    root_path: String,
    executable_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_data_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mods_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stdout_path: Option<String>,
    source: &'static str,
    valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default()
}

fn timestamp() -> String {
    now_millis().to_string()
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn is_valid_project_id(value: &str) -> bool {
    let Some((prefix, version)) = value.rsplit_once('_') else {
        return false;
    };
    if prefix.is_empty()
        || version.is_empty()
        || version.starts_with('0')
        || !version.chars().all(|character| character.is_ascii_digit())
    {
        return false;
    }
    let mut characters = prefix.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    (first.is_ascii_lowercase() || first.is_ascii_digit())
        && characters.all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || character == '_'
                || character == '-'
        })
}

fn validate_project_id(value: &str) -> Result<(), String> {
    if is_valid_project_id(value) {
        Ok(())
    } else {
        Err("The project ID must be lower-case and end in a positive major version, for example my_mod_1.".into())
    }
}

fn validate_short_text(label: &str, value: &str) -> Result<(), String> {
    let count = value.chars().count();
    if count == 0 || count > 120 {
        Err(format!("{label} must contain 1 to 120 characters."))
    } else {
        Ok(())
    }
}

fn escape_lua_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\r', "")
        .replace('\n', "\\n")
}

fn canonical_directory(path: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(path)
        .map_err(|error| format!("Cannot access directory `{path}`: {error}"))?;
    if !canonical.is_dir() {
        return Err("The selected path is not a directory.".into());
    }
    Ok(canonical)
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    if value.is_empty() || value.contains('\0') {
        return Err("The relative path is empty or contains a NUL byte.".into());
    }
    let path = Path::new(value);
    if path.is_absolute() {
        return Err("Absolute paths are not allowed.".into());
    }
    let mut safe = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => safe.push(part),
            _ => return Err("Path traversal is not allowed.".into()),
        }
    }
    if safe.as_os_str().is_empty() {
        return Err("The relative path must not be empty.".into());
    }
    Ok(safe)
}

fn safe_existing_path(root: &str, relative: &str) -> Result<(PathBuf, PathBuf), String> {
    let root = canonical_directory(root)?;
    let relative = safe_relative_path(relative)?;
    let candidate = fs::canonicalize(root.join(relative))
        .map_err(|error| format!("Cannot access project file: {error}"))?;
    if !candidate.starts_with(&root) {
        return Err("The resolved path leaves the selected project.".into());
    }
    Ok((root, candidate))
}

fn safe_writable_path(root: &str, relative: &str) -> Result<(PathBuf, PathBuf), String> {
    let root = canonical_directory(root)?;
    let relative = safe_relative_path(relative)?;
    let candidate = root.join(relative);
    let parent = candidate
        .parent()
        .ok_or_else(|| "The write path has no parent.".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("Cannot access the target directory: {error}"))?;
    if !canonical_parent.starts_with(&root) || !candidate.starts_with(&root) {
        return Err("The resolved write path leaves the selected project.".into());
    }
    Ok((root, candidate))
}

fn text_extension(path: &Path) -> bool {
    matches!(
        path.extension().and_then(OsStr::to_str).map(str::to_ascii_lowercase),
        Some(value)
            if matches!(
                value.as_str(),
                "lua"
                    | "con"
                    | "mdl"
                    | "mtl"
                    | "ani"
                    | "fs"
                    | "vs"
                    | "json"
                    | "md"
                    | "txt"
                    | "cfg"
                    | "ini"
                    | "toml"
                    | "xml"
                    | "po"
            )
    )
}

fn scan_directory(root: &Path, current: &Path, files: &mut Vec<ProjectFile>) -> Result<(), String> {
    let mut entries = fs::read_dir(current)
        .map_err(|error| format!("Cannot read `{}`: {error}", path_string(current)))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Cannot enumerate `{}`: {error}", path_string(current)))?;
    entries.sort_by_key(|entry| entry.file_name());
    let ignored: HashSet<&str> =
        HashSet::from([".git", "node_modules", "target", "dist", "backups"]);

    for entry in entries {
        if files.len() >= MAX_SCANNED_FILES {
            return Err(format!(
                "Project scan stopped after {MAX_SCANNED_FILES} files."
            ));
        }
        let metadata = entry
            .metadata()
            .map_err(|error| format!("Cannot read file metadata: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Cannot determine file type: {error}"))?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if metadata.is_dir() {
            let name = entry.file_name();
            if ignored.contains(name.to_string_lossy().as_ref()) {
                continue;
            }
            scan_directory(root, &path, files)?;
            continue;
        }
        if !metadata.is_file() {
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|_| "A scanned path left the project root.".to_string())?;
        let text = text_extension(relative);
        let content = if text && metadata.len() <= MAX_TEXT_FILE_BYTES {
            fs::read_to_string(&path).ok()
        } else {
            None
        };
        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_millis())
            .unwrap_or_default();
        files.push(ProjectFile {
            relative_path: relative.to_string_lossy().replace('\\', "/"),
            size: metadata.len(),
            modified_ms,
            text,
            content,
        });
    }
    Ok(())
}

fn read_project_mode(root: &Path) -> ProjectMode {
    let config = root.join(".tpf2-studio").join("project.json");
    fs::read_to_string(config)
        .ok()
        .and_then(|value| serde_json::from_str::<serde_json::Value>(&value).ok())
        .and_then(|value| {
            value
                .get("mode")
                .and_then(|mode| mode.as_str())
                .map(str::to_owned)
        })
        .filter(|mode| mode == "commonapi2")
        .map(|_| ProjectMode::Commonapi2)
        .unwrap_or(ProjectMode::Vanilla)
}

#[tauri::command]
fn create_project(request: CreateProjectRequest) -> Result<CreatedProject, String> {
    validate_project_id(&request.project_id)?;
    validate_short_text("The display name", request.display_name.trim())?;
    validate_short_text("The author", request.author.trim())?;
    let parent = canonical_directory(&request.parent_directory)?;
    let target = parent.join(&request.project_id);
    if target.exists() {
        return Err(format!(
            "The project directory already exists: {}",
            path_string(&target)
        ));
    }
    let temporary = parent.join(format!(
        ".tpf2-mod-studio-create-{}-{}",
        std::process::id(),
        timestamp()
    ));
    fs::create_dir(&temporary)
        .map_err(|error| format!("Cannot create temporary project: {error}"))?;
    let result = (|| -> Result<(), String> {
        fs::create_dir(temporary.join("res"))
            .map_err(|error| format!("Cannot create resource directory: {error}"))?;
        fs::create_dir(temporary.join("documents"))
            .map_err(|error| format!("Cannot create documentation directory: {error}"))?;
        fs::create_dir(temporary.join(".tpf2-studio"))
            .map_err(|error| format!("Cannot create project metadata directory: {error}"))?;

        let name = escape_lua_string(request.display_name.trim());
        let author = escape_lua_string(request.author.trim());
        let mod_lua = format!(
            "function data()\n  return {{\n    info = {{\n      name = _(\"{name}\"),\n      description = _(\"modDesc\"),\n      authors = {{\n        {{\n          name = \"{author}\",\n          role = \"CREATOR\",\n        }},\n      }},\n      minorVersion = 0,\n      severityAdd = \"NONE\",\n      severityRemove = \"WARNING\",\n    }},\n  }}\nend\n"
        );
        let strings_lua = format!(
            "function data()\n  return {{\n    en = {{\n      [\"{name}\"] = \"{name}\",\n      modDesc = \"Describe this Transport Fever 2 mod.\",\n    }},\n    de = {{\n      [\"{name}\"] = \"{name}\",\n      modDesc = \"Beschreibe diese Transport-Fever-2-Mod.\",\n    }},\n  }}\nend\n"
        );
        fs::write(temporary.join("mod.lua"), mod_lua)
            .map_err(|error| format!("Cannot write mod.lua: {error}"))?;
        fs::write(temporary.join("strings.lua"), strings_lua)
            .map_err(|error| format!("Cannot write strings.lua: {error}"))?;
        fs::write(
            temporary.join("documents").join("README.md"),
            format!(
                "# {}\n\nTransport Fever 2 mod project created by Tpf2 Mod Studio.\n",
                request.display_name.trim()
            ),
        )
        .map_err(|error| format!("Cannot write project documentation: {error}"))?;
        let mode = match request.mode {
            ProjectMode::Vanilla => "vanilla",
            ProjectMode::Commonapi2 => "commonapi2",
        };
        let config = serde_json::json!({
            "schemaVersion": 1,
            "projectId": request.project_id,
            "displayName": request.display_name.trim(),
            "author": request.author.trim(),
            "mode": mode
        });
        fs::write(
            temporary.join(".tpf2-studio").join("project.json"),
            format!(
                "{}\n",
                serde_json::to_string_pretty(&config)
                    .map_err(|error| format!("Cannot serialize project metadata: {error}"))?
            ),
        )
        .map_err(|error| format!("Cannot write project metadata: {error}"))?;
        fs::rename(&temporary, &target)
            .map_err(|error| format!("Cannot finalize the project directory: {error}"))?;
        Ok(())
    })();

    if let Err(error) = result {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error);
    }
    Ok(CreatedProject {
        root_path: path_string(&target),
        project_id: request.project_id,
        mode: request.mode,
    })
}

#[tauri::command]
fn scan_project(root_path: String) -> Result<ProjectSnapshot, String> {
    let root = canonical_directory(&root_path)?;
    let mut files = Vec::new();
    scan_directory(&root, &root, &mut files)?;
    Ok(ProjectSnapshot {
        root_path: path_string(&root),
        folder_name: root
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("unknown-project")
            .to_string(),
        mode: read_project_mode(&root),
        scanned_at: format!("{}", now_millis()),
        files,
    })
}

#[tauri::command]
fn read_project_file(root_path: String, relative_path: String) -> Result<String, String> {
    let (_, candidate) = safe_existing_path(&root_path, &relative_path)?;
    if !text_extension(&candidate) {
        return Err("This file type is not editable as text.".into());
    }
    let metadata =
        fs::metadata(&candidate).map_err(|error| format!("Cannot read file metadata: {error}"))?;
    if !metadata.is_file() || metadata.len() > MAX_EDIT_BYTES as u64 {
        return Err("The selected file is invalid or exceeds the 8 MiB editor limit.".into());
    }
    fs::read_to_string(candidate).map_err(|error| format!("Cannot read text file: {error}"))
}

#[tauri::command]
fn save_project_file(
    root_path: String,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    if content.len() > MAX_EDIT_BYTES {
        return Err("The edited content exceeds the 8 MiB editor limit.".into());
    }
    let (root, candidate) = safe_writable_path(&root_path, &relative_path)?;
    if !text_extension(&candidate) {
        return Err("This file type is not editable as text.".into());
    }
    let relative = safe_relative_path(&relative_path)?;
    if candidate.exists() {
        let backup = root
            .join(".tpf2-studio")
            .join("backups")
            .join(timestamp())
            .join(&relative);
        if let Some(parent) = backup.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Cannot create backup directory: {error}"))?;
        }
        fs::copy(&candidate, &backup)
            .map_err(|error| format!("Cannot create file backup: {error}"))?;
    }
    let temporary = candidate.with_file_name(format!(
        ".{}.{}.tmp",
        candidate
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("tpf2-file"),
        std::process::id()
    ));
    fs::write(&temporary, content)
        .map_err(|error| format!("Cannot write temporary file: {error}"))?;
    let displaced = candidate.with_file_name(format!(
        ".{}.{}.previous",
        candidate
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("tpf2-file"),
        std::process::id()
    ));
    if candidate.exists() {
        fs::rename(&candidate, &displaced)
            .map_err(|error| format!("Cannot prepare atomic replacement: {error}"))?;
    }
    if let Err(error) = fs::rename(&temporary, &candidate) {
        let _ = fs::rename(&displaced, &candidate);
        let _ = fs::remove_file(&temporary);
        return Err(format!("Cannot finalize atomic save: {error}"));
    }
    if displaced.exists() {
        fs::remove_file(displaced).map_err(|error| {
            format!("Saved, but could not remove replacement staging file: {error}")
        })?;
    }
    Ok(())
}

fn copy_project_tree(
    source: &Path,
    target: &Path,
    root: &Path,
    count: &mut usize,
) -> Result<(), String> {
    let excludes: HashSet<&str> =
        HashSet::from([".git", ".tpf2-studio", "node_modules", "target", "dist"]);
    fs::create_dir_all(target)
        .map_err(|error| format!("Cannot create staged installation directory: {error}"))?;
    for entry in fs::read_dir(source)
        .map_err(|error| format!("Cannot read project during installation: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Cannot read project entry: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Cannot determine project entry type: {error}"))?;
        if file_type.is_symlink() {
            continue;
        }
        let source_path = entry.path();
        let relative = source_path
            .strip_prefix(root)
            .map_err(|_| "Installation source left the project root.".to_string())?;
        let first = relative
            .components()
            .next()
            .and_then(|component| match component {
                Component::Normal(value) => value.to_str(),
                _ => None,
            });
        if first.is_some_and(|value| excludes.contains(value)) {
            continue;
        }
        let target_path = target.join(entry.file_name());
        if file_type.is_dir() {
            copy_project_tree(&source_path, &target_path, root, count)?;
        } else if file_type.is_file() {
            fs::copy(&source_path, &target_path)
                .map_err(|error| format!("Cannot copy project file: {error}"))?;
            *count += 1;
        }
    }
    Ok(())
}

#[tauri::command]
fn install_project(
    root_path: String,
    mods_directory: String,
    overwrite: bool,
) -> Result<InstallResult, String> {
    let root = canonical_directory(&root_path)?;
    let mods_root = canonical_directory(&mods_directory)?;
    if !root.join("mod.lua").is_file() {
        return Err("Installation blocked: the project has no root mod.lua.".into());
    }
    let project_id = root
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| "The project directory name is not valid UTF-8.".to_string())?;
    let destination = mods_root.join(project_id);
    if destination.exists() && !overwrite {
        return Err(format!(
            "Installation blocked: {project_id} already exists in the target directory."
        ));
    }
    let temporary = mods_root.join(format!(
        ".tpf2-install-{}-{}",
        std::process::id(),
        timestamp()
    ));
    fs::create_dir(&temporary)
        .map_err(|error| format!("Cannot create installation staging directory: {error}"))?;
    let mut file_count = 0;
    if let Err(error) = copy_project_tree(&root, &temporary, &root, &mut file_count) {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error);
    }
    if !temporary.join("mod.lua").is_file() {
        let _ = fs::remove_dir_all(&temporary);
        return Err("The staged installation does not contain mod.lua.".into());
    }

    let mut backup = None;
    if destination.exists() {
        let backup_root = mods_root.join(".tpf2-mod-studio-backups");
        fs::create_dir_all(&backup_root)
            .map_err(|error| format!("Cannot create installation backup directory: {error}"))?;
        let backup_path = backup_root.join(format!("{project_id}-{}", timestamp()));
        fs::rename(&destination, &backup_path)
            .map_err(|error| format!("Cannot back up existing mod: {error}"))?;
        backup = Some(backup_path);
    }
    if let Err(error) = fs::rename(&temporary, &destination) {
        if let Some(backup_path) = &backup {
            let _ = fs::rename(backup_path, &destination);
        }
        let _ = fs::remove_dir_all(&temporary);
        return Err(format!("Cannot finalize installation: {error}"));
    }
    if !destination.join("mod.lua").is_file() {
        return Err("Installation finished without a verifiable mod.lua.".into());
    }
    Ok(InstallResult {
        installed_path: path_string(&destination),
        backup_path: backup.as_deref().map(path_string),
        file_count,
    })
}

fn candidate(root: PathBuf, executable_name: &str) -> InstallationCandidate {
    let executable = root.join(executable_name);
    let valid = root.join("res").is_dir() && executable.is_file();
    let user_data_path = find_user_data_directory();
    let mods_path = resolve_mods_directory(&root, user_data_path.as_deref());
    let stdout_path = resolve_stdout_path(user_data_path.as_deref());
    InstallationCandidate {
        root_path: path_string(&root),
        executable_path: path_string(&executable),
        user_data_path: user_data_path.map(|path| path_string(&path)),
        mods_path: mods_path.map(|path| path_string(&path)),
        stdout_path: stdout_path.map(|path| path_string(&path)),
        source: "steam-default",
        valid,
        reason: if valid {
            None
        } else {
            Some("Expected executable or game resource directory is missing.".into())
        },
    }
}

fn steam_userdata_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    #[cfg(target_os = "windows")]
    {
        for variable in ["ProgramFiles(x86)", "ProgramFiles"] {
            if let Ok(base) = env::var(variable) {
                roots.push(PathBuf::from(base).join("Steam").join("userdata"));
            }
        }
        if let Ok(home) = env::var("USERPROFILE") {
            roots.push(PathBuf::from(home).join("Steam").join("userdata"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = env::var("HOME") {
            let home = PathBuf::from(home);
            roots.extend([
                home.join(".steam").join("steam").join("userdata"),
                home.join(".local")
                    .join("share")
                    .join("Steam")
                    .join("userdata"),
                home.join(".var")
                    .join("app")
                    .join("com.valvesoftware.Steam")
                    .join(".steam")
                    .join("steam")
                    .join("userdata"),
            ]);
        }
    }
    roots
}

/// Prefer the most recently modified Steam user-data folder for app 1066780.
fn find_user_data_directory() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    for userdata_root in steam_userdata_roots() {
        let Ok(entries) = fs::read_dir(&userdata_root) else {
            continue;
        };
        for entry in entries.flatten() {
            let local = entry.path().join("1066780").join("local");
            if local.is_dir() {
                candidates.push(local);
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(home) = env::var("USERPROFILE") {
            let documents = PathBuf::from(home)
                .join("Documents")
                .join("Transport Fever 2");
            if documents.is_dir() {
                candidates.push(documents);
            }
        }
    }
    candidates.into_iter().max_by_key(|path| {
        fs::metadata(path)
            .and_then(|meta| meta.modified())
            .ok()
            .unwrap_or(SystemTime::UNIX_EPOCH)
    })
}

fn resolve_mods_directory(game_root: &Path, user_data: Option<&Path>) -> Option<PathBuf> {
    if let Some(user_data) = user_data {
        let user_mods = user_data.join("mods");
        if user_mods.is_dir() {
            return Some(user_mods);
        }
    }
    let game_mods = game_root.join("mods");
    if game_mods.is_dir() {
        return Some(game_mods);
    }
    None
}

fn resolve_stdout_path(user_data: Option<&Path>) -> Option<PathBuf> {
    let user_data = user_data?;
    let candidates = [
        user_data.join("crash_dump").join("stdout.txt"),
        user_data.join("stdout.txt"),
        user_data.join("logs").join("stdout.txt"),
    ];
    candidates
        .into_iter()
        .filter(|path| path.is_file())
        .max_by_key(|path| {
            fs::metadata(path)
                .and_then(|meta| meta.modified())
                .ok()
                .unwrap_or(SystemTime::UNIX_EPOCH)
        })
}

#[tauri::command]
fn detect_installations() -> Vec<InstallationCandidate> {
    let mut roots = Vec::new();
    #[cfg(target_os = "windows")]
    {
        for variable in ["ProgramFiles(x86)", "ProgramFiles"] {
            if let Ok(base) = env::var(variable) {
                roots.push((
                    PathBuf::from(base)
                        .join("Steam")
                        .join("steamapps")
                        .join("common")
                        .join("Transport Fever 2"),
                    "TransportFever2.exe",
                ));
            }
        }
        if let Ok(home) = env::var("USERPROFILE") {
            roots.push((
                PathBuf::from(home)
                    .join("Steam")
                    .join("steamapps")
                    .join("common")
                    .join("Transport Fever 2"),
                "TransportFever2.exe",
            ));
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = env::var("HOME") {
            let home = PathBuf::from(home);
            roots.extend([
                (
                    home.join(".steam")
                        .join("steam")
                        .join("steamapps")
                        .join("common")
                        .join("Transport Fever 2"),
                    "TransportFever2",
                ),
                (
                    home.join(".local")
                        .join("share")
                        .join("Steam")
                        .join("steamapps")
                        .join("common")
                        .join("Transport Fever 2"),
                    "TransportFever2",
                ),
                (
                    home.join(".var")
                        .join("app")
                        .join("com.valvesoftware.Steam")
                        .join(".steam")
                        .join("steam")
                        .join("steamapps")
                        .join("common")
                        .join("Transport Fever 2"),
                    "TransportFever2",
                ),
            ]);
        }
    }
    let mut seen = HashSet::new();
    roots
        .into_iter()
        .filter(|(root, _)| root.exists())
        .filter_map(|(root, executable)| {
            let key = path_string(&root);
            if !seen.insert(key) {
                return None;
            }
            Some(candidate(root, executable))
        })
        .collect()
}

#[tauri::command]
fn read_tf2_log(log_path: String) -> Result<String, String> {
    let path = fs::canonicalize(&log_path)
        .map_err(|error| format!("Cannot access selected log: {error}"))?;
    if !path.is_file() {
        return Err("The selected log path is not a file.".into());
    }
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase);
    if !matches!(extension.as_deref(), Some("txt" | "log")) {
        return Err("Only .txt and .log files can be opened as TF2 logs.".into());
    }
    let metadata =
        fs::metadata(&path).map_err(|error| format!("Cannot read log metadata: {error}"))?;
    if metadata.len() > MAX_LOG_BYTES {
        return Err("The log exceeds the current 32 MiB analysis limit.".into());
    }
    let mut file = fs::File::open(path).map_err(|error| format!("Cannot open log: {error}"))?;
    let mut content = String::new();
    file.read_to_string(&mut content)
        .map_err(|error| format!("Cannot decode log as UTF-8: {error}"))?;
    Ok(content)
}

#[tauri::command]
fn launch_game(executable_path: String) -> Result<u32, String> {
    let executable = fs::canonicalize(&executable_path)
        .map_err(|error| format!("Cannot access selected executable: {error}"))?;
    if !executable.is_file() {
        return Err("The selected executable is not a file.".into());
    }
    let file_name = executable
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or_default();
    if !matches!(file_name, "TransportFever2" | "TransportFever2.exe") {
        return Err("The selected file is not a recognized Transport Fever 2 executable.".into());
    }
    let mut command = Command::new(&executable);
    if let Some(parent) = executable.parent() {
        command.current_dir(parent);
    }
    let child = command
        .spawn()
        .map_err(|error| format!("Transport Fever 2 could not be started: {error}"))?;
    Ok(child.id())
}

/// Apply Linux runtime workarounds before WebKitGTK starts.
///
/// WebKitGTK 2.42+ can abort on start with
/// `Could not create GBM EGL display` when the DMA-BUF renderer is enabled on
/// some NVIDIA / hybrid-GPU / Wayland setups. Prefer the legacy path unless the
/// user has already set `WEBKIT_DISABLE_DMABUF_RENDERER`.
fn apply_linux_runtime_workarounds() {
    #[cfg(target_os = "linux")]
    {
        if env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    apply_linux_runtime_workarounds();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            create_project,
            scan_project,
            read_project_file,
            save_project_file,
            install_project,
            detect_installations,
            read_tf2_log,
            launch_game
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tpf2 Mod Studio");
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TemporaryDirectory(PathBuf);

    impl TemporaryDirectory {
        fn new(label: &str) -> Self {
            let path = env::temp_dir().join(format!(
                "tpf2-mod-studio-{label}-{}-{}",
                std::process::id(),
                timestamp()
            ));
            fs::create_dir(&path).expect("temporary test directory should be created");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TemporaryDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn project_ids_require_a_positive_major_version() {
        assert!(is_valid_project_id("test_author_train_mod_1"));
        assert!(is_valid_project_id("mod-collection_12"));
        assert!(!is_valid_project_id("MissingCase_1"));
        assert!(!is_valid_project_id("missing_version"));
        assert!(!is_valid_project_id("zero_0"));
    }

    #[test]
    fn relative_paths_reject_traversal_and_absolute_prefixes() {
        assert!(safe_relative_path("res/config/test.lua").is_ok());
        assert!(safe_relative_path("../secret.txt").is_err());
        assert!(safe_relative_path("/etc/passwd").is_err());
    }

    #[test]
    fn native_filesystem_workflow_creates_saves_and_installs() {
        let workspace = TemporaryDirectory::new("workflow with spaces");
        let mods_directory = workspace.path().join("mods");
        fs::create_dir(&mods_directory).expect("mods directory should be created");

        let created = create_project(CreateProjectRequest {
            parent_directory: path_string(workspace.path()),
            project_id: "native_test_mod_1".into(),
            display_name: "Native Test Mod".into(),
            author: "Test Author".into(),
            mode: ProjectMode::Vanilla,
        })
        .expect("project should be created");

        let snapshot =
            scan_project(created.root_path.clone()).expect("created project should be scanned");
        assert_eq!(snapshot.folder_name, "native_test_mod_1");
        assert!(snapshot
            .files
            .iter()
            .any(|file| file.relative_path == "mod.lua"));

        let original = read_project_file(created.root_path.clone(), "strings.lua".into())
            .expect("strings.lua should be readable");
        save_project_file(
            created.root_path.clone(),
            "strings.lua".into(),
            original.replace("Describe this", "A native"),
        )
        .expect("strings.lua should be saved atomically");
        assert!(
            read_project_file(created.root_path.clone(), "strings.lua".into())
                .expect("saved strings.lua should be readable")
                .contains("A native")
        );
        assert!(Path::new(&created.root_path)
            .join(".tpf2-studio")
            .join("backups")
            .is_dir());

        let installed = install_project(
            created.root_path.clone(),
            path_string(&mods_directory),
            false,
        )
        .expect("project should be installed");
        assert!(installed.file_count >= 3);
        assert!(Path::new(&installed.installed_path)
            .join("mod.lua")
            .is_file());
        assert!(installed.backup_path.is_none());

        let duplicate = install_project(
            created.root_path.clone(),
            path_string(&mods_directory),
            false,
        )
        .expect_err("an existing install should require explicit overwrite consent");
        assert!(duplicate.contains("already exists"));

        let replaced = install_project(created.root_path, path_string(&mods_directory), true)
            .expect("explicit replacement should create a backup");
        assert!(replaced.backup_path.is_some());
    }

    #[test]
    fn native_file_access_rejects_traversal() {
        let workspace = TemporaryDirectory::new("traversal");
        let project = workspace.path().join("secure_mod_1");
        fs::create_dir(&project).expect("project directory should be created");
        fs::write(workspace.path().join("outside.txt"), "secret")
            .expect("outside test file should be created");

        let error = read_project_file(path_string(&project), "../outside.txt".into())
            .expect_err("project reads must not escape the selected root");
        assert!(error.contains("traversal"));
    }

    #[test]
    fn native_log_reader_accepts_text_and_rejects_other_extensions() {
        let workspace = TemporaryDirectory::new("logs");
        let log = workspace.path().join("stdout.txt");
        fs::write(&log, "ERROR native test").expect("test log should be created");
        assert_eq!(
            read_tf2_log(path_string(&log)).expect("text log should be readable"),
            "ERROR native test"
        );

        let unsupported = workspace.path().join("stdout.bin");
        fs::write(&unsupported, "ERROR native test").expect("binary fixture should be created");
        let error = read_tf2_log(path_string(&unsupported))
            .expect_err("unsupported log extension should be rejected");
        assert!(error.contains("Only .txt and .log"));
    }

    #[test]
    fn linux_runtime_workaround_sets_dmabuf_default() {
        // Remove any inherited value for the duration of the assertion.
        let previous = env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER");
        env::remove_var("WEBKIT_DISABLE_DMABUF_RENDERER");
        apply_linux_runtime_workarounds();
        #[cfg(target_os = "linux")]
        {
            assert_eq!(
                env::var("WEBKIT_DISABLE_DMABUF_RENDERER").ok().as_deref(),
                Some("1")
            );
        }
        #[cfg(not(target_os = "linux"))]
        {
            assert!(env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none());
        }
        match previous {
            Some(value) => env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", value),
            None => env::remove_var("WEBKIT_DISABLE_DMABUF_RENDERER"),
        }
    }

    #[test]
    fn linux_runtime_workaround_preserves_user_override() {
        env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "0");
        apply_linux_runtime_workarounds();
        assert_eq!(
            env::var("WEBKIT_DISABLE_DMABUF_RENDERER").ok().as_deref(),
            Some("0")
        );
        env::remove_var("WEBKIT_DISABLE_DMABUF_RENDERER");
    }

    #[test]
    fn detect_installations_finds_local_tf2_when_present() {
        let candidates = detect_installations();
        // On CI runners this may be empty; when TF2 is installed, paths must resolve.
        let home = env::var("HOME").unwrap_or_default();
        let expected_game =
            PathBuf::from(&home).join(".local/share/Steam/steamapps/common/Transport Fever 2");
        if !expected_game.is_dir() {
            return;
        }
        assert!(
            !candidates.is_empty(),
            "expected at least one TF2 install when the Steam common folder exists"
        );
        let first = &candidates[0];
        assert!(first.valid, "install should be valid: {:?}", first.reason);
        assert!(
            Path::new(&first.executable_path).is_file(),
            "executable missing: {}",
            first.executable_path
        );
        assert!(
            first
                .mods_path
                .as_ref()
                .is_some_and(|p| Path::new(p).is_dir()),
            "mods path missing: {:?}",
            first.mods_path
        );
        assert!(
            first
                .stdout_path
                .as_ref()
                .is_some_and(|p| Path::new(p).is_file()),
            "stdout path missing: {:?}",
            first.stdout_path
        );
        assert!(
            first
                .user_data_path
                .as_ref()
                .is_some_and(|p| Path::new(p).is_dir()),
            "user data missing: {:?}",
            first.user_data_path
        );
        eprintln!(
            "detected: root={} mods={:?} stdout={:?}",
            first.root_path, first.mods_path, first.stdout_path
        );
    }
}
