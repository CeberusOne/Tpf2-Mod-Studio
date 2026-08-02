mod library;
mod updater;

use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env,
    ffi::OsStr,
    fs,
    io::{self, Read},
    path::{Component, Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use zip::ZipArchive;

const MAX_SCANNED_FILES: usize = 20_000;
const MAX_TEXT_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_EDIT_BYTES: usize = 8 * 1024 * 1024;
const MAX_LOG_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum ProjectMode {
    Vanilla,
    Hybrid,
    Commonapi2,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum ProjectType {
    Empty,
    Script,
    Vehicle,
    Repaint,
    Asset,
    Station,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProjectRequest {
    parent_directory: String,
    project_id: String,
    display_name: String,
    author: String,
    mode: ProjectMode,
    #[serde(default = "default_project_type")]
    project_type: ProjectType,
}

fn default_project_type() -> ProjectType {
    ProjectType::Empty
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModArchiveInfo {
    archive_path: String,
    project_id: String,
    has_mod_lua: bool,
    entry_count: usize,
    mod_lua_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    nested_root: Option<String>,
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
        .and_then(|mode| match mode.as_str() {
            "commonapi2" => Some(ProjectMode::Commonapi2),
            "hybrid" => Some(ProjectMode::Hybrid),
            "vanilla" => Some(ProjectMode::Vanilla),
            _ => None,
        })
        .unwrap_or(ProjectMode::Vanilla)
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("Cannot create directory {}: {error}", path_string(path)))
}

fn write_template_tree(root: &Path, project_type: ProjectType) -> Result<(), String> {
    match project_type {
        ProjectType::Empty | ProjectType::Script => {
            ensure_dir(&root.join("res/scripts"))?;
        }
        ProjectType::Vehicle | ProjectType::Repaint => {
            ensure_dir(&root.join("res/models/model/vehicle/train"))?;
            ensure_dir(&root.join("res/models/mesh/vehicle/train"))?;
            ensure_dir(&root.join("res/models/material/vehicle/train"))?;
            ensure_dir(&root.join("res/textures/models/vehicle/train"))?;
        }
        ProjectType::Asset => {
            ensure_dir(&root.join("res/models/model/asset"))?;
            ensure_dir(&root.join("res/models/mesh/asset"))?;
            ensure_dir(&root.join("res/models/material/asset"))?;
        }
        ProjectType::Station => {
            ensure_dir(&root.join("res/construction/station/rail"))?;
            ensure_dir(&root.join("res/models/model/station"))?;
        }
    }
    Ok(())
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
        ensure_dir(&temporary.join("res"))?;
        ensure_dir(&temporary.join("documents"))?;
        ensure_dir(&temporary.join(".tpf2-studio"))?;
        write_template_tree(&temporary, request.project_type)?;

        let name = escape_lua_string(request.display_name.trim());
        let author = escape_lua_string(request.author.trim());
        let commonapi_block = match request.mode {
            ProjectMode::Commonapi2 => {
                "\n      -- CommonAPI2 required: declare dependencies in a real CommonAPI2-aware load path.\n      -- Keep runtime checks around optional features (Entwicklungsplan §3/§17)."
            }
            ProjectMode::Hybrid => {
                "\n      -- Hybrid: vanilla-safe by default; gate any CommonAPI2 usage with feature checks."
            }
            ProjectMode::Vanilla => "",
        };
        let mod_lua = format!(
            "function data()\n  return {{\n    info = {{\n      name = _(\"{name}\"),\n      description = _(\"modDesc\"),\n      authors = {{\n        {{\n          name = \"{author}\",\n          role = \"CREATOR\",\n        }},\n      }},\n      minorVersion = 0,\n      severityAdd = \"NONE\",\n      severityRemove = \"WARNING\",{commonapi_block}\n    }},\n  }}\nend\n"
        );
        let strings_lua = format!(
            "function data()\n  return {{\n    en = {{\n      [\"{name}\"] = \"{name}\",\n      modDesc = \"Describe this Transport Fever 2 mod.\",\n    }},\n    de = {{\n      [\"{name}\"] = \"{name}\",\n      modDesc = \"Beschreibe diese Transport-Fever-2-Mod.\",\n    }},\n  }}\nend\n"
        );
        fs::write(temporary.join("mod.lua"), mod_lua)
            .map_err(|error| format!("Cannot write mod.lua: {error}"))?;
        fs::write(temporary.join("strings.lua"), strings_lua)
            .map_err(|error| format!("Cannot write strings.lua: {error}"))?;
        let type_label = match request.project_type {
            ProjectType::Empty => "empty expert",
            ProjectType::Script => "script",
            ProjectType::Vehicle => "vehicle",
            ProjectType::Repaint => "repaint",
            ProjectType::Asset => "asset",
            ProjectType::Station => "station",
        };
        fs::write(
            temporary.join("documents").join("README.md"),
            format!(
                "# {}\n\nTransport Fever 2 **{}** mod project created by Tpf2 Mod Studio.\n\nIntegration mode is configured in `.tpf2-studio/project.json`.\n",
                request.display_name.trim(),
                type_label
            ),
        )
        .map_err(|error| format!("Cannot write project documentation: {error}"))?;
        let mode = match request.mode {
            ProjectMode::Vanilla => "vanilla",
            ProjectMode::Hybrid => "hybrid",
            ProjectMode::Commonapi2 => "commonapi2",
        };
        let project_type = match request.project_type {
            ProjectType::Empty => "empty",
            ProjectType::Script => "script",
            ProjectType::Vehicle => "vehicle",
            ProjectType::Repaint => "repaint",
            ProjectType::Asset => "asset",
            ProjectType::Station => "station",
        };
        let config = serde_json::json!({
            "schemaVersion": 1,
            "formatVersion": 1,
            "targetGame": "transport-fever-2",
            "projectId": request.project_id,
            "displayName": request.display_name.trim(),
            "author": request.author.trim(),
            "mode": mode,
            "integration": mode,
            "projectType": project_type,
            "buildProfile": "tf2-pc"
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

fn normalize_zip_path(name: &str) -> String {
    name.replace('\\', "/")
        .trim_start_matches("./")
        .trim_matches('/')
        .to_string()
}

fn open_zip_archive(path: &Path) -> Result<ZipArchive<fs::File>, String> {
    let file = fs::File::open(path).map_err(|error| format!("Cannot open archive: {error}"))?;
    ZipArchive::new(file).map_err(|error| format!("Invalid ZIP archive: {error}"))
}

fn find_mod_lua_in_zip(
    archive: &mut ZipArchive<fs::File>,
) -> Result<(String, Option<String>), String> {
    let mut candidates = Vec::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("Cannot read ZIP entry: {error}"))?;
        if entry.is_dir() {
            continue;
        }
        let name = normalize_zip_path(entry.name());
        if name.eq_ignore_ascii_case("mod.lua") || name.to_ascii_lowercase().ends_with("/mod.lua") {
            candidates.push(name);
        }
    }
    if candidates.is_empty() {
        return Err(
            "No mod.lua found in the archive. TF2 mods must contain a root mod.lua (wiki: extract so the mod has its own folder)."
                .into(),
        );
    }
    candidates.sort_by_key(|path| path.matches('/').count());
    let mod_lua_path = candidates.into_iter().next().expect("candidates not empty");
    let nested_root = Path::new(&mod_lua_path)
        .parent()
        .map(path_string)
        .filter(|value| !value.is_empty());
    Ok((mod_lua_path, nested_root))
}

fn project_id_from_archive(path: &Path, nested_root: Option<&str>) -> String {
    if let Some(root) = nested_root {
        if let Some(name) = Path::new(root).file_name().and_then(OsStr::to_str) {
            if is_valid_project_id(name) {
                return name.to_string();
            }
            return sanitize_project_id_hint(name);
        }
    }
    let stem = path
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("imported_mod");
    sanitize_project_id_hint(stem)
}

fn sanitize_project_id_hint(value: &str) -> String {
    let mut chars: String = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect();
    while chars.contains("__") {
        chars = chars.replace("__", "_");
    }
    let trimmed = chars.trim_matches('_');
    if is_valid_project_id(trimmed) {
        return trimmed.to_string();
    }
    let base = if trimmed.is_empty() {
        "imported_mod"
    } else {
        trimmed
    };
    if base.rsplit_once('_').is_some_and(|(_, version)| {
        version.chars().all(|c| c.is_ascii_digit()) && !version.is_empty()
    }) {
        base.to_string()
    } else {
        format!("{base}_1")
    }
}

fn strip_zip_prefix(path: &str, prefix: Option<&str>) -> Option<String> {
    let normalized = normalize_zip_path(path);
    match prefix {
        None | Some("") => Some(normalized),
        Some(root) => {
            let root = root.trim_matches('/');
            if normalized == root {
                None
            } else if let Some(rest) = normalized.strip_prefix(&format!("{root}/")) {
                Some(rest.to_string())
            } else {
                None
            }
        }
    }
}

#[tauri::command]
fn inspect_mod_archive(archive_path: String) -> Result<ModArchiveInfo, String> {
    let path = fs::canonicalize(&archive_path)
        .map_err(|error| format!("Cannot access archive: {error}"))?;
    if !path.is_file() {
        return Err("The selected archive is not a file.".into());
    }
    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase);
    if !matches!(extension.as_deref(), Some("zip")) {
        return Err("Only .zip mod archives are supported in this version.".into());
    }
    let mut archive = open_zip_archive(&path)?;
    let entry_count = archive.len();
    let (mod_lua_path, nested_root) = find_mod_lua_in_zip(&mut archive)?;
    let project_id = project_id_from_archive(&path, nested_root.as_deref());
    Ok(ModArchiveInfo {
        archive_path: path_string(&path),
        project_id,
        has_mod_lua: true,
        entry_count,
        mod_lua_path,
        nested_root,
    })
}

#[tauri::command]
fn import_mod_archive(
    archive_path: String,
    mods_directory: String,
    overwrite: bool,
) -> Result<InstallResult, String> {
    let info = inspect_mod_archive(archive_path.clone())?;
    let mods_root = canonical_directory(&mods_directory)?;
    let destination = mods_root.join(&info.project_id);
    if destination.exists() && !overwrite {
        return Err(format!(
            "A mod folder named {} already exists. Enable overwrite to replace it after backup.",
            info.project_id
        ));
    }

    let staging = mods_root.join(format!(
        ".tpf2-zip-import-{}-{}",
        std::process::id(),
        timestamp()
    ));
    if staging.exists() {
        fs::remove_dir_all(&staging)
            .map_err(|error| format!("Cannot clear staging directory: {error}"))?;
    }
    fs::create_dir_all(&staging)
        .map_err(|error| format!("Cannot create staging directory: {error}"))?;

    let path = PathBuf::from(&info.archive_path);
    let mut archive = open_zip_archive(&path)?;
    let prefix = info.nested_root.as_deref();
    let mut file_count = 0usize;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Cannot read ZIP entry: {error}"))?;
        let Some(relative) = strip_zip_prefix(entry.name(), prefix) else {
            continue;
        };
        if relative.is_empty() {
            continue;
        }
        // Reject path traversal in archive entries.
        if relative.split('/').any(|part| part == ".." || part == ".") {
            return Err(format!("Archive entry uses an unsafe path: {relative}"));
        }
        let out_path = staging.join(&relative);
        if entry.is_dir() || relative.ends_with('/') {
            fs::create_dir_all(&out_path)
                .map_err(|error| format!("Cannot create directory from archive: {error}"))?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Cannot create parent directory: {error}"))?;
        }
        let mut outfile = fs::File::create(&out_path)
            .map_err(|error| format!("Cannot write extracted file: {error}"))?;
        io::copy(&mut entry, &mut outfile)
            .map_err(|error| format!("Cannot extract archive entry: {error}"))?;
        file_count += 1;
    }

    if !staging.join("mod.lua").is_file() {
        let _ = fs::remove_dir_all(&staging);
        return Err("Extracted archive does not contain mod.lua at the mod root.".into());
    }

    let mut backup_path = None;
    if destination.exists() {
        let backup_root = mods_root.join(".tpf2-mod-studio-backups");
        fs::create_dir_all(&backup_root)
            .map_err(|error| format!("Cannot create backup directory: {error}"))?;
        let backup = backup_root.join(format!("{}-{}", info.project_id, timestamp()));
        fs::rename(&destination, &backup)
            .map_err(|error| format!("Cannot move existing mod to backup: {error}"))?;
        backup_path = Some(path_string(&backup));
    }

    fs::rename(&staging, &destination).map_err(|error| {
        let _ = fs::remove_dir_all(&staging);
        format!("Cannot finalize imported mod: {error}")
    })?;

    Ok(InstallResult {
        installed_path: path_string(&destination),
        backup_path,
        file_count,
    })
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

#[tauri::command]
fn scan_mod_library(
    mods_path: Option<String>,
    user_data_path: Option<String>,
    game_root: Option<String>,
) -> Vec<library::InstalledMod> {
    library::scan_mod_library(mods_path, user_data_path, game_root)
}

#[tauri::command]
fn list_log_files(user_data_path: String) -> Result<Vec<library::LogFileInfo>, String> {
    library::list_log_files(user_data_path)
}

#[tauri::command]
fn archive_stdout(user_data_path: String) -> Result<String, String> {
    library::archive_stdout(user_data_path)
}

#[tauri::command]
fn export_project_zip(root_path: String, destination_path: String) -> Result<String, String> {
    library::export_project_zip(root_path, destination_path)
}

#[tauri::command]
async fn check_for_update() -> Result<updater::UpdateInfo, String> {
    updater::check_for_update().await
}

#[tauri::command]
async fn apply_update(info: updater::UpdateInfo) -> Result<String, String> {
    updater::apply_update(info).await
}

#[tauri::command]
fn restart_after_update() -> Result<(), String> {
    updater::restart_application()
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
            launch_game,
            inspect_mod_archive,
            import_mod_archive,
            scan_mod_library,
            list_log_files,
            archive_stdout,
            export_project_zip,
            check_for_update,
            apply_update,
            restart_after_update
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
            project_type: ProjectType::Vehicle,
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
    fn linux_runtime_workaround_sets_default_and_preserves_override() {
        // Env vars are process-global; serialize both checks in one test.
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

        env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "0");
        apply_linux_runtime_workarounds();
        assert_eq!(
            env::var("WEBKIT_DISABLE_DMABUF_RENDERER").ok().as_deref(),
            Some("0")
        );

        match previous {
            Some(value) => env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", value),
            None => env::remove_var("WEBKIT_DISABLE_DMABUF_RENDERER"),
        }
    }

    #[test]
    fn scan_mod_library_lists_local_mods() {
        let workspace = TemporaryDirectory::new("modlib");
        let mods = workspace.path().join("mods");
        let one = mods.join("sample_mod_1");
        fs::create_dir_all(&one).expect("mod dir");
        fs::write(
            one.join("mod.lua"),
            "function data()\n  return { info = { name = _(\"Sample\") } }\nend\n",
        )
        .expect("mod.lua");
        let listed = library::scan_mod_library(Some(path_string(&mods)), None, None);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "sample_mod_1");
        assert!(listed[0].has_mod_lua);
    }

    #[test]
    fn export_project_zip_contains_mod_lua() {
        let workspace = TemporaryDirectory::new("export");
        let project = workspace.path().join("export_mod_1");
        fs::create_dir_all(project.join("res")).expect("res");
        fs::write(project.join("mod.lua"), "function data() return {} end").expect("mod");
        let zip_path = workspace.path().join("out.zip");
        let exported = library::export_project_zip(path_string(&project), path_string(&zip_path))
            .expect("export");
        assert!(Path::new(&exported).is_file());
        assert!(fs::metadata(&exported).expect("meta").len() > 20);
    }

    #[test]
    fn inspect_mod_archive_finds_nested_mod_lua() {
        use std::io::Write;
        let workspace = TemporaryDirectory::new("zip-mod");
        let zip_path = workspace.path().join("demo_mod_1.zip");
        {
            let file = fs::File::create(&zip_path).expect("zip file");
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("demo_mod_1/mod.lua", options)
                .expect("start mod.lua");
            zip.write_all(b"function data() return { info = { name = \"Demo\" } } end")
                .expect("write mod.lua");
            zip.start_file("demo_mod_1/strings.lua", options)
                .expect("start strings");
            zip.write_all(b"function data() return {} end")
                .expect("write strings");
            zip.finish().expect("finish zip");
        }
        let info = inspect_mod_archive(path_string(&zip_path)).expect("inspect");
        assert!(info.has_mod_lua);
        assert_eq!(info.project_id, "demo_mod_1");
        assert_eq!(info.mod_lua_path, "demo_mod_1/mod.lua");

        let mods = workspace.path().join("mods");
        fs::create_dir(&mods).expect("mods dir");
        let installed =
            import_mod_archive(path_string(&zip_path), path_string(&mods), false).expect("import");
        assert!(Path::new(&installed.installed_path)
            .join("mod.lua")
            .is_file());
        assert!(installed.file_count >= 2);
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
