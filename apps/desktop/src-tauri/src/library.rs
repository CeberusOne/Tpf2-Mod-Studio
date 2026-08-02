//! Installed-mod library, log archive helpers and project ZIP export.
//! Aligns with the Entwicklungsplan: Mod Manager, Log Center archive, Build export.

use base64::Engine;
use serde::Serialize;
use std::{
    fs,
    io::{self, BufReader, Cursor},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use zip::{write::SimpleFileOptions, ZipWriter};

/// Longest thumbnail edge. Mod previews are 512px+ and `image_00.tga` files
/// reach 30 MiB, so full images must never reach the WebView.
const PREVIEW_MAX_EDGE: u32 = 256;
/// Refuse absurd source images rather than decoding them into memory.
const PREVIEW_MAX_SOURCE_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    pub id: String,
    pub path: String,
    pub source: String,
    pub has_mod_lua: bool,
    pub file_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duplicate_of: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogFileInfo {
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub modified_ms: u128,
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default()
}

fn count_files(root: &Path) -> usize {
    let mut count = 0usize;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with('.'))
                {
                    continue;
                }
                stack.push(path);
            } else {
                count += 1;
            }
        }
    }
    count
}

fn extract_display_name(mod_lua: &str) -> Option<String> {
    // Very small heuristic: name = _("Something") or name = "Something"
    for line in mod_lua.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("name") {
            let rest = rest.trim_start_matches([' ', '=']);
            if let Some(inner) = rest
                .strip_prefix("_(\"")
                .and_then(|value| value.split("\")").next())
            {
                if !inner.is_empty() {
                    return Some(inner.to_string());
                }
            }
            if let Some(inner) = rest
                .strip_prefix('"')
                .and_then(|value| value.split('"').next())
            {
                if !inner.is_empty() {
                    return Some(inner.to_string());
                }
            }
        }
    }
    None
}

fn scan_mod_directory(root: &Path, source: &str, into: &mut Vec<InstalledMod>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(id) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if id.starts_with('.') {
            continue;
        }
        let mod_lua = path.join("mod.lua");
        let has_mod_lua = mod_lua.is_file();
        let display_name = if has_mod_lua {
            fs::read_to_string(&mod_lua)
                .ok()
                .and_then(|content| extract_display_name(&content))
        } else {
            None
        };
        into.push(InstalledMod {
            id: id.to_string(),
            path: path_string(&path),
            source: source.to_string(),
            has_mod_lua,
            file_count: count_files(&path),
            display_name,
            duplicate_of: None,
        });
    }
}

/// Scan local mods, staging area and Steam Workshop content for app 1066780.
pub fn scan_mod_library(
    mods_path: Option<String>,
    user_data_path: Option<String>,
    game_root: Option<String>,
) -> Vec<InstalledMod> {
    let mut mods = Vec::new();

    if let Some(path) = mods_path {
        let root = PathBuf::from(path);
        if root.is_dir() {
            scan_mod_directory(&root, "local", &mut mods);
        }
    }
    if let Some(user_data) = user_data_path {
        let staging = PathBuf::from(&user_data).join("staging_area");
        if staging.is_dir() {
            scan_mod_directory(&staging, "staging", &mut mods);
        }
        // The user-data mods folder is already covered when `mods_path` pointed
        // here; scan it only when the caller passed a different local root.
        let local_mods = PathBuf::from(&user_data).join("mods");
        if local_mods.is_dir()
            && !mods
                .iter()
                .any(|item| Path::new(&item.path).starts_with(&local_mods))
        {
            scan_mod_directory(&local_mods, "local", &mut mods);
        }
    }
    if let Some(game) = game_root {
        let game_mods = PathBuf::from(&game).join("mods");
        if game_mods.is_dir() {
            scan_mod_directory(&game_mods, "builtin", &mut mods);
        }
        // Workshop: sibling of common/
        // .../steamapps/common/Transport Fever 2 -> .../steamapps/workshop/content/1066780
        if let Some(common) = Path::new(&game).parent() {
            if let Some(steamapps) = common.parent() {
                let workshop = steamapps.join("workshop").join("content").join("1066780");
                if workshop.is_dir() {
                    // Workshop folders are numeric IDs; still treat as mods when they have content.
                    scan_mod_directory(&workshop, "workshop", &mut mods);
                }
            }
        }
    }

    // Mark duplicates by mod folder id across sources.
    let mut seen: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for item in &mut mods {
        if let Some(first) = seen.get(&item.id) {
            item.duplicate_of = Some(first.clone());
        } else {
            seen.insert(item.id.clone(), item.path.clone());
        }
    }

    mods.sort_by(|left, right| left.id.cmp(&right.id).then(left.source.cmp(&right.source)));
    mods
}

/// Rank a mod-root image by how cheap and how representative it is.
///
/// Steam and mod.io drop a ready-to-display JPEG next to the mod, so prefer
/// those. `image_00.tga` is the mod's own thumbnail and the only image for
/// roughly a fifth of installed mods, but it needs decoding and re-encoding.
fn preview_rank(file_name: &str) -> Option<u8> {
    let lower = file_name.to_ascii_lowercase();
    let displayable =
        lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".png");
    if lower.starts_with("workshop_preview") && displayable {
        return Some(0);
    }
    if lower.starts_with("modio_preview") && displayable {
        return Some(1);
    }
    if lower == "image_00.tga" {
        return Some(2);
    }
    if displayable {
        return Some(3);
    }
    if lower.starts_with("image_") && lower.ends_with(".tga") {
        return Some(4);
    }
    None
}

/// Best preview image directly inside the mod folder, if any.
fn find_mod_preview(mod_dir: &Path) -> Option<PathBuf> {
    let mut best: Option<(u8, String)> = None;
    for entry in fs::read_dir(mod_dir).ok()?.flatten() {
        if !entry.file_type().is_ok_and(|kind| kind.is_file()) {
            continue;
        }
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let Some(rank) = preview_rank(name) else {
            continue;
        };
        // Ties resolve by name so the choice is stable between scans.
        if best.as_ref().map_or(true, |(top, current)| {
            rank < *top || (rank == *top && name < current.as_str())
        }) {
            best = Some((rank, name.to_string()));
        }
    }
    best.map(|(_, name)| mod_dir.join(name))
}

/// Decode a mod preview and return a downscaled JPEG as a `data:` URI.
///
/// TGA cannot be rendered by the WebView at all, and the raw files are far too
/// large to hand over, so decoding and thumbnailing happen natively.
pub fn read_mod_preview(mod_path: String) -> Result<String, String> {
    let mod_dir = fs::canonicalize(&mod_path)
        .map_err(|error| format!("Cannot access mod folder: {error}"))?;
    if !mod_dir.is_dir() {
        return Err("The selected mod path is not a directory.".into());
    }
    let source = find_mod_preview(&mod_dir).ok_or_else(|| "No preview image found.".to_string())?;
    let metadata =
        fs::metadata(&source).map_err(|error| format!("Cannot read preview metadata: {error}"))?;
    if metadata.len() > PREVIEW_MAX_SOURCE_BYTES {
        return Err("The preview image exceeds the decode limit.".into());
    }

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    // Decide by extension: TGA carries no leading magic bytes, so content
    // sniffing misidentifies it.
    let format = match extension.as_str() {
        "tga" => image::ImageFormat::Tga,
        "png" => image::ImageFormat::Png,
        "jpg" | "jpeg" => image::ImageFormat::Jpeg,
        _ => return Err("Unsupported preview image format.".into()),
    };
    let reader = BufReader::new(
        fs::File::open(&source).map_err(|error| format!("Cannot open preview image: {error}"))?,
    );
    let decoded = image::load(reader, format)
        .map_err(|error| format!("Cannot decode preview image: {error}"))?;

    // JPEG has no alpha channel, so drop it before encoding.
    let thumbnail = image::DynamicImage::ImageRgb8(
        decoded
            .thumbnail(PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE)
            .to_rgb8(),
    );
    let mut encoded = Vec::new();
    thumbnail
        .write_to(&mut Cursor::new(&mut encoded), image::ImageFormat::Jpeg)
        .map_err(|error| format!("Cannot encode preview thumbnail: {error}"))?;

    Ok(format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&encoded)
    ))
}

pub fn list_log_files(user_data_path: String) -> Result<Vec<LogFileInfo>, String> {
    let user_data = PathBuf::from(user_data_path);
    if !user_data.is_dir() {
        return Err("User data directory does not exist.".into());
    }
    let mut files = Vec::new();
    let candidates = [
        (user_data.join("crash_dump").join("stdout.txt"), "stdout"),
        (user_data.join("crash_dump").join("stderr.txt"), "stderr"),
        (user_data.join("stdout.txt"), "stdout"),
        (user_data.join("stderr.txt"), "stderr"),
    ];
    for (path, kind) in candidates {
        if path.is_file() {
            let metadata = fs::metadata(&path)
                .map_err(|error| format!("Cannot read log metadata: {error}"))?;
            files.push(LogFileInfo {
                path: path_string(&path),
                kind: kind.to_string(),
                size: metadata.len(),
                modified_ms: metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| duration.as_millis())
                    .unwrap_or(0),
            });
        }
    }
    let crash_dump = user_data.join("crash_dump");
    if crash_dump.is_dir() {
        if let Ok(entries) = fs::read_dir(&crash_dump) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                if path.is_file()
                    && (name.ends_with("stdout.txt")
                        || name.ends_with(".log")
                        || name.ends_with(".dmp"))
                    && !files.iter().any(|item| item.path == path_string(&path))
                {
                    let metadata = fs::metadata(&path).ok();
                    files.push(LogFileInfo {
                        path: path_string(&path),
                        kind: if name.contains("stdout") {
                            "stdout-archive".into()
                        } else if name.ends_with(".dmp") {
                            "crash-dump".into()
                        } else {
                            "log".into()
                        },
                        size: metadata.as_ref().map(|meta| meta.len()).unwrap_or(0),
                        modified_ms: metadata
                            .and_then(|meta| meta.modified().ok())
                            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                            .map(|duration| duration.as_millis())
                            .unwrap_or(0),
                    });
                }
            }
        }
    }
    files.sort_by_key(|entry| std::cmp::Reverse(entry.modified_ms));
    Ok(files)
}

/// Copy current stdout.txt into an archive folder before a new test run overwrites it.
pub fn archive_stdout(user_data_path: String) -> Result<String, String> {
    let user_data = PathBuf::from(user_data_path);
    let source = {
        let primary = user_data.join("crash_dump").join("stdout.txt");
        if primary.is_file() {
            primary
        } else {
            let fallback = user_data.join("stdout.txt");
            if fallback.is_file() {
                fallback
            } else {
                return Err("No stdout.txt found to archive.".into());
            }
        }
    };
    let archive_dir = user_data.join("crash_dump").join("archive");
    fs::create_dir_all(&archive_dir)
        .map_err(|error| format!("Cannot create log archive directory: {error}"))?;
    let destination = archive_dir.join(format!("stdout-{}.txt", now_millis()));
    fs::copy(&source, &destination)
        .map_err(|error| format!("Cannot archive stdout.txt: {error}"))?;
    Ok(path_string(&destination))
}

fn collect_files_for_zip(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir)
            .map_err(|error| format!("Cannot read project directory: {error}"))?;
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if name == ".tpf2-studio" || name == ".git" || name.starts_with(".tpf2-") {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
            } else {
                files.push(path);
            }
        }
    }
    Ok(files)
}

/// Export a clean ZIP package for local/Workshop/Mod.io prep (no IDE metadata).
pub fn export_project_zip(root_path: String, destination_path: String) -> Result<String, String> {
    let root =
        fs::canonicalize(&root_path).map_err(|error| format!("Cannot access project: {error}"))?;
    if !root.join("mod.lua").is_file() {
        return Err("Project root must contain mod.lua before export.".into());
    }
    let destination = PathBuf::from(destination_path);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Cannot create export directory: {error}"))?;
    }
    let file = fs::File::create(&destination)
        .map_err(|error| format!("Cannot create ZIP file: {error}"))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let files = collect_files_for_zip(&root)?;
    for path in files {
        let relative = path
            .strip_prefix(&root)
            .map_err(|_| "Internal path error while exporting.".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        zip.start_file(relative, options)
            .map_err(|error| format!("Cannot write ZIP entry: {error}"))?;
        let mut input = fs::File::open(&path)
            .map_err(|error| format!("Cannot read file for export: {error}"))?;
        // Stream instead of buffering: mod meshes and textures can be large.
        io::copy(&mut input, &mut zip).map_err(|error| format!("Cannot compress file: {error}"))?;
    }
    zip.finish()
        .map_err(|error| format!("Cannot finalize ZIP: {error}"))?;
    Ok(path_string(&destination))
}
