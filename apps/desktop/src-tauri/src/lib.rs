mod library;
mod savegame;
mod steam;
mod updater;

use base64::Engine;
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
use tauri::Manager;
use zip::ZipArchive;

const MAX_SCANNED_FILES: usize = 20_000;
const MAX_TEXT_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_EDIT_BYTES: usize = 8 * 1024 * 1024;
const MAX_LOG_BYTES: u64 = 32 * 1024 * 1024;
const MAX_MODEL_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 20_000;
const MAX_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_EDITOR_SESSION_BYTES: usize = 64 * 1024 * 1024;

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

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorTabSession {
    path: String,
    content: String,
    saved_content: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct EditorSession {
    schema_version: u32,
    root_path: String,
    tabs: Vec<EditorTabSession>,
    #[serde(skip_serializing_if = "Option::is_none")]
    active_path: Option<String>,
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

fn base64_engine() -> base64::engine::general_purpose::GeneralPurpose {
    base64::engine::general_purpose::STANDARD
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
                "\n      -- CommonAPI2 required: declare dependencies in a real CommonAPI2-aware load path.\n      -- Keep runtime checks around optional features (Entwicklungsplan Â§3/Â§17)."
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
            .map_err(|error| f×^üæÚ$z{-®éÜj×        ])
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

        let snapshot = scan_project_sync(created.root_path.clone())
            .expect("created project should be scanned");
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
            read_tf2_log_sync(path_string(&log)).expect("text log should be readable"),
            "ERROR native test"
        );

        let unsupported = workspace.path().join("stdout.bin");
        fs::write(&unsupported, "ERROR native test").expect("binary fixture should be created");
        let error = read_tf2_log_sync(path_string(&unsupported))
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
    fn mod_preview_decodes_tga_into_a_small_jpeg_data_uri() {
        let workspace = TemporaryDirectory::new("preview");
        let mod_dir = workspace.path().join("preview_mod_1");
        fs::create_dir_all(&mod_dir).expect("mod dir");
        // 512x512 uncompressed 24-bit TGA, the shape TF2 mods ship.
        let (width, height) = (512u16, 512u16);
        let mut tga = vec![0u8; 18];
        tga[2] = 2; // uncompressed true-color
        tga[12] = (width & 0xff) as u8;
        tga[13] = (width >> 8) as u8;
        tga[14] = (height & 0xff) as u8;
        tga[15] = (height >> 8) as u8;
        tga[16] = 24; // bits per pixel
        for index in 0..(width as usize * height as usize) {
            tga.extend_from_slice(&[(index % 256) as u8, 0x40, 0x80]);
        }
        fs::write(mod_dir.join("image_00.tga"), &tga).expect("tga");

        let uri = library::read_mod_preview(path_string(&mod_dir)).expect("preview");
        assert!(uri.starts_with("data:image/jpeg;base64,"));
        // A 512x512 source must not reach the WebView at full size.
        assert!(
            uri.len() < 60_000,
            "thumbnail data URI unexpectedly large: {} bytes",
            uri.len()
        );

        // A displayable JPEG next to it wins over the TGA.
        fs::write(mod_dir.join("workshop_preview.jpg"), &tga).expect("decoy");
        let error = library::read_mod_preview(path_string(&mod_dir))
            .expect_err("a TGA payload named .jpg must fail rather than be mislabelled");
        assert!(error.contains("decode"), "unexpected error: {error}");
    }

    #[test]
    fn mod_preview_reports_missing_images() {
        let workspace = TemporaryDirectory::new("preview-none");
        let mod_dir = workspace.path().join("bare_mod_1");
        fs::create_dir_all(&mod_dir).expect("mod dir");
        fs::write(mod_dir.join("mod.lua"), "function data() return {} end").expect("mod.lua");
        let error =
            library::read_mod_preview(path_string(&mod_dir)).expect_err("no preview available");
        assert!(error.contains("No preview"), "unexpected error: {error}");
    }

    #[test]
    fn import_mod_archive_rejects_traversal_entries() {
        use std::io::Write;
        let workspace = TemporaryDirectory::new("zip-slip");
        let zip_path = workspace.path().join("evil_mod_1.zip");
        {
            let file = fs::File::create(&zip_path).expect("zip file");
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("mod.lua", options).expect("start mod.lua");
            zip.write_all(b"function data() return {} end")
                .expect("write mod.lua");
            zip.start_file("../escaped.txt", options)
                .expect("start traversal entry");
            zip.write_all(b"owned").expect("write traversal entry");
            zip.finish().expect("finish zip");
        }
        let mods = workspace.path().join("mods");
        fs::create_dir(&mods).expect("mods dir");

        let error = import_mod_archive(path_string(&zip_path), path_string(&mods), false)
            .expect_err("archive entries must not escape the staging directory");
        assert!(error.contains("unsafe path"), "unexpected error: {error}");
        assert!(!workspace.path().join("escaped.txt").exists());
        assert!(!mods.join("escaped.txt").exists());
        // A rejected import must not leave staging directories behind.
        assert!(!mods.join("evil_mod_1").exists());
        let leftovers = fs::read_dir(&mods)
            .expect("mods readable")
            .flatten()
            .count();
        assert_eq!(leftovers, 0, "staging directory survived a rejected import");
    }

    #[test]
    fn detect_installations_finds_local_tf2_when_present() {
        let candidates = detect_installations_sync();
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
