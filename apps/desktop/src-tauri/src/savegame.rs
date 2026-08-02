//! Savegames and mod presets.
//!
//! Savegames are read only. Their mod list sits inside the zstd-compressed
//! `.sav` as a length-prefixed block after the `tf**` magic; rewriting that
//! would mean reconstructing a reverse-engineered binary format inside a file
//! that can exceed 500 MB. Load order is steered through `mod_presets/*.lua`
//! instead, which is Transport Fever 2's own mechanism and plain Lua text.

use serde::Serialize;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

/// Only the header is needed, and it sits at the very front.
const SAVE_HEADER_BYTES: usize = 4 * 1024 * 1024;
/// A preset for a very large library stays around 1 MB; refuse absurd input.
const MAX_PRESET_BYTES: u64 = 16 * 1024 * 1024;
/// Guards against a corrupt length field turning into a huge allocation.
const MAX_MOD_ENTRIES: usize = 40_000;
const MAX_FIELD_BYTES: usize = 4096;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavegameInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetInfo {
    pub path: String,
    pub name: String,
    pub modified_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavegameMods {
    pub path: String,
    /// Mod ids in the order the savegame recorded them.
    pub mods: Vec<String>,
    /// True when the header parsed cleanly to its end.
    pub complete: bool,
    /// Why parsing stopped early, when it did.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn modified_ms(path: &Path) -> u128 {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

pub fn list_savegames(user_data_path: String) -> Result<Vec<SavegameInfo>, String> {
    let root = PathBuf::from(user_data_path).join("save");
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut found = Vec::new();
    for entry in fs::read_dir(&root)
        .map_err(|error| format!("Cannot read the savegame folder: {error}"))?
        .flatten()
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|value| value.to_str()) != Some("sav") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let size = fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
        found.push(SavegameInfo {
            path: path_string(&path),
            name: name.to_string(),
            size,
            modified_ms: modified_ms(&path),
        });
    }
    found.sort_by_key(|item| std::cmp::Reverse(item.modified_ms));
    Ok(found)
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    let slice = bytes.get(offset..offset + 4)?;
    Some(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

/// Read a length-prefixed UTF-8 field, returning the value and the next offset.
fn read_field(bytes: &[u8], offset: usize) -> Option<(String, usize)> {
    let length = read_u32(bytes, offset)? as usize;
    if length > MAX_FIELD_BYTES {
        return None;
    }
    let start = offset + 4;
    let slice = bytes.get(start..start + length)?;
    Some((String::from_utf8_lossy(slice).into_owned(), start + length))
}

fn looks_like_mod_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '*' | '!'))
}

/// Extract mod-id candidates from a savegame header.
///
/// Returns candidates rather than a final list on purpose. The record layout
/// varies per mod — tags, params and author counts differ — so a fixed field
/// walk desyncs after the first entry, and a loose scan also picks up author
/// names and roles. Cross-checking the candidates against the installed mod
/// library is what makes the result trustworthy, and only the caller has that
/// library. On a real 195 MB save this yields 697 installed mods.
pub fn read_savegame_mods(save_path: String) -> Result<SavegameMods, String> {
    let path = fs::canonicalize(&save_path)
        .map_err(|error| format!("Cannot access the savegame: {error}"))?;
    if !path.is_file() {
        return Err("The selected savegame path is not a file.".into());
    }

    let file = fs::File::open(&path).map_err(|error| format!("Cannot open savegame: {error}"))?;
    let mut decoder = zstd::stream::read::Decoder::new(file)
        .map_err(|error| format!("Savegame is not readable as zstd: {error}"))?;
    let mut header = vec![0u8; SAVE_HEADER_BYTES];
    let mut filled = 0usize;
    // A short read is normal at the end of a small savegame.
    while filled < header.len() {
        match decoder.read(&mut header[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(error) => return Err(format!("Cannot decompress savegame header: {error}")),
        }
    }
    header.truncate(filled);

    if header.len() < 8 || &header[0..4] != b"tf**" {
        return Err("This file does not look like a Transport Fever 2 savegame.".into());
    }

    let mut mods = Vec::new();
    let mut note = None;

    // Locate the first record. Everything before it is fixed header data.
    let mut offset = 4usize;
    let mut start = None;
    while offset + 8 < header.len() {
        if let Some((value, next)) = read_field(&header, offset) {
            if value.len() >= 3 && looks_like_mod_id(&value) {
                start = Some((value, next));
                break;
            }
        }
        offset += 4;
    }
    let Some((first_id, cursor)) = start else {
        return Err("No mod list was found in the savegame header.".into());
    };

    // The record layout varies per mod (tags, params and author counts differ),
    // so a fixed field walk desyncs after the first entry. Collect every
    // plausible candidate instead; the caller filters them against the actually
    // installed mods, which is what separates a real id from an author name
    // such as "Grimes" or a role such as "CREATOR".
    mods.push(first_id);
    let mut at = cursor;
    while at + 8 < header.len() && mods.len() < MAX_MOD_ENTRIES {
        if let Some((value, next)) = read_field(&header, at) {
            if value.len() >= 3 && looks_like_mod_id(&value) {
                mods.push(value);
                at = next;
                continue;
            }
        }
        at += 4;
    }
    let complete = at + 8 >= header.len() && mods.len() < MAX_MOD_ENTRIES;
    if !complete {
        note = Some(format!(
            "Reading stopped after {MAX_MOD_ENTRIES} candidates; the list may be incomplete."
        ));
    }

    Ok(SavegameMods {
        path: path_string(&path),
        mods,
        complete,
        note,
    })
}

pub fn list_mod_presets(user_data_path: String) -> Result<Vec<PresetInfo>, String> {
    let root = PathBuf::from(user_data_path).join("mod_presets");
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut found = Vec::new();
    for entry in fs::read_dir(&root)
        .map_err(|error| format!("Cannot read the preset folder: {error}"))?
        .flatten()
    {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|v| v.to_str()) == Some("lua") {
            if let Some(name) = path.file_stem().and_then(|v| v.to_str()) {
                found.push(PresetInfo {
                    path: path_string(&path),
                    name: name.to_string(),
                    modified_ms: modified_ms(&path),
                });
            }
        }
    }
    found.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(found)
}

pub fn read_mod_preset(preset_path: String) -> Result<String, String> {
    let path = fs::canonicalize(&preset_path)
        .map_err(|error| format!("Cannot access the preset: {error}"))?;
    let metadata =
        fs::metadata(&path).map_err(|error| format!("Cannot read preset metadata: {error}"))?;
    if !metadata.is_file() || metadata.len() > MAX_PRESET_BYTES {
        return Err("The preset is not a file or exceeds the size limit.".into());
    }
    let bytes = fs::read(&path).map_err(|error| format!("Cannot read preset: {error}"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Write a preset into `<user data>/mod_presets`, backing up any existing file.
///
/// The name is reduced to a plain file name so a crafted value cannot write
/// outside the preset folder.
pub fn write_mod_preset(
    user_data_path: String,
    name: String,
    content: String,
) -> Result<String, String> {
    if content.len() as u64 > MAX_PRESET_BYTES {
        return Err("The preset exceeds the size limit.".into());
    }
    let root = fs::canonicalize(&user_data_path)
        .map_err(|error| format!("Cannot access the user data folder: {error}"))?;
    let presets = root.join("mod_presets");
    fs::create_dir_all(&presets)
        .map_err(|error| format!("Cannot create the preset folder: {error}"))?;

    let safe: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, ' ' | '_' | '-' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let safe = safe.trim().trim_matches('.').to_string();
    if safe.is_empty() {
        return Err("The preset name is empty after removing unsafe characters.".into());
    }
    let target = presets.join(format!("{safe}.lua"));
    if target.parent() != Some(presets.as_path()) {
        return Err("The resolved preset path leaves the preset folder.".into());
    }

    if target.is_file() {
        let backup = presets.join(format!(
            "{safe}.backup-{}.lua",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|value| value.as_millis())
                .unwrap_or_default()
        ));
        fs::copy(&target, &backup)
            .map_err(|error| format!("Cannot back up the existing preset: {error}"))?;
    }

    let temporary = presets.join(format!(".{safe}.{}.tmp", std::process::id()));
    fs::write(&temporary, content).map_err(|error| format!("Cannot write the preset: {error}"))?;
    fs::rename(&temporary, &target).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Cannot finalize the preset: {error}")
    })?;
    Ok(path_string(&target))
}
