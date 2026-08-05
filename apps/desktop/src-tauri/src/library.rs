//! Installed-mod library, log archive helpers and project ZIP export.
//! Aligns with the Entwicklungsplan: Mod Manager, Log Center archive, Build export.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
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
/// Upper bound for a `mod.lua` shipped to the UI for health classification.
const MAX_MOD_LUA_BYTES: u64 = 512 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    pub id: String,
    pub path: String,
    pub source: String,
    pub kind: String,
    pub entry_type: String,
    pub has_mod_lua: bool,
    pub file_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duplicate_of: Option<String>,
    /// Root `mod.lua` source so the UI can classify mod health without a
    /// second round trip. Already read here for the display name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mod_lua: Option<String>,
}

const LIBRARY_CACHE_SCHEMA: u32 = 1;

#[derive(Debug, Clone, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryEntryFingerprint {
    source: String,
    entry_type: String,
    modified_ms: u64,
    size: u64,
    mod_lua_modified_ms: u64,
    mod_lua_size: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedLibraryEntry {
    fingerprint: LibraryEntryFingerprint,
    item: InstalledMod,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryCache {
    schema_version: u32,
    entries: Vec<CachedLibraryEntry>,
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

fn metadata_modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .and_then(|value| u64::try_from(value.as_millis()).ok())
        .unwrap_or_default()
}

fn library_entry_fingerprint(
    path: &Path,
    source: &str,
    is_directory: bool,
) -> Option<LibraryEntryFingerprint> {
    let metadata = fs::metadata(path).ok()?;
    let mod_lua = if is_directory {
        fs::metadata(path.join("mod.lua")).ok()
    } else {
        None
    };
    Some(LibraryEntryFingerprint {
        source: source.to_string(),
        entry_type: if is_directory { "directory" } else { "file" }.to_string(),
        modified_ms: metadata_modified_ms(&metadata),
        size: metadata.len(),
        mod_lua_modified_ms: mod_lua
            .as_ref()
            .map(metadata_modified_ms)
            .unwrap_or_default(),
        mod_lua_size: mod_lua.as_ref().map(fs::Metadata::len).unwrap_or_default(),
    })
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

fn is_script_resource(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .is_some_and(|extension| matches!(extension.as_str(), "lua" | "con" | "module"))
}

fn directory_contains_script(root: &Path) -> bool {
    let mut stack = vec![root.to_path_buf()];
    while let Some(directory) = stack.pop() {
        let Ok(entries) = fs::read_dir(directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let hidden = path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with('.'));
            if hidden {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
            } else if is_script_resource(&path) {
                return true;
            }
        }
    }
    false
}

fn library_kind(path: &Path, source: &str, has_mod_lua: bool, is_directory: bool) -> &'static str {
    if has_mod_lua || source != "staging" {
        return "mod";
    }
    if !is_directory && is_script_resource(path) {
        return "staging-script";
    }
    if is_directory && directory_contains_script(path) {
        return "staging-project";
    }
    "staging-content"
}

fn push_library_entry(path: &Path, source: &str, is_directory: bool, into: &mut Vec<InstalledMod>) {
    let Some(id) = path.file_name().and_then(|name| name.to_str()) else {
        return;
    };
    if id.starts_with('.') {
        return;
    }

    let mod_lua_path = path.join("mod.lua");
    let has_mod_lua = is_directory && mod_lua_path.is_file();
    // A real library holds ~730 mods averaging 1.8 KiB of mod.lua, so
    // shipping the source costs about a megabyte in total. Skip outliers.
    let mod_lua = if has_mod_lua
        && fs::metadata(&mod_lua_path)
            .map(|meta| meta.len() <= MAX_MOD_LUA_BYTES)
            .unwrap_or(false)
    {
        fs::read_to_string(&mod_lua_path).ok()
    } else {
        None
    };
    let display_name = mod_lua.as_deref().and_then(extract_display_name);
    into.push(InstalledMod {
        id: id.to_string(),
        path: path_string(path),
        source: source.to_string(),
        kind: library_kind(path, source, has_mod_lua, is_directory).to_string(),
        entry_type: if is_directory { "directory" } else { "file" }.to_string(),
        has_mod_lua,
        file_count: if is_directory { count_files(path) } else { 1 },
        display_name,
        duplicate_of: None,
        mod_lua,
    });
}

fn scan_mod_directory(root: &Path, source: &str, into: &mut Vec<InstalledMod>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            push_library_entry(&path, source, true, into);
        }
    }
}

fn scan_staging_directory(root: &Path, into: &mut Vec<InstalledMod>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            push_library_entry(&path, "staging", true, into);
        } else if file_type.is_file() {
            // Direct scripts and supporting files are valid staging content.
            // They are deliberately visible without pretending they are mods.
            push_library_entry(&path, "staging", false, into);
        }
    }
}

fn directory_key(path: &Path) -> String {
    let resolved = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let value = path_string(&resolved).replace('\\', "/");
    #[cfg(target_os = "windows")]
    {
        value.to_ascii_lowercase()
    }
    #[cfg(not(target_os = "windows"))]
    {
        value
    }
}

fn mod_id_key(id: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        id.to_ascii_lowercase()
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

fn scan_staging_directory_once(
    root: &Path,
    scanned_roots: &mut HashSet<String>,
    into: &mut Vec<InstalledMod>,
) {
    if root.is_dir() && scanned_roots.insert(directory_key(root)) {
        scan_staging_directory(root, into);
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
        scan_mod_directory_once(&PathBuf::from(path), "local", &mut scanned_roots, &mut mods);
    }

    if let Some(user_data) = user_data_path {
        let user_data = PathBuf::from(user_data);
        scan_mod_directory_once(
            &user_data.join("mods"),
            "local",
            &mut scanned_roots,
            &mut mods,
        );
        scan_staging_directory_once(
            &user_data.join("staging_area"),
            &mut scanned_roots,
            &mut mods,
        );
    }

    if let Some(game) = game_root {
        let game = PathBuf::from(game);
        if let Some(workshop) = crate::steam::workshop_root_from_game_root(&game) {
            scan_mod_directory_once(&workshop, "workshop", &mut scanned_roots, &mut mods);
        }
        scan_mod_directory_once(&game.join("mods"), "builtin", &mut scanned_roots, &mut mods);
    }

    // Source precedence is local -> staging -> workshop -> built-in. Mark later
    // copies with the first matching mod folder ID. Windows IDs are compared
    // case-insensitively because the filesystem is case-insensitive.
    let mut seen: HashMap<String, String> = HashMap::new();
    for item in &mut mods {
        if item.kind != "mod" {
            continue;
        }
        let key = mod_id_key(&item.id);
        if let Some(first) = seen.get(&key) {
            item.duplicate_of = Some(first.clone());
        } else {
            seen.insert(key, item.path.clone());
        }
    }

    mods.sort_by(|left, right| left.id.cmp(&right.id).then(left.source.cmp(&right.source)));
    mods
}

fn cached_entry_key(path: &Path, source: &str) -> String {
    format!("{source}|{}", directory_key(path))
}

fn load_library_cache_file(cache_path: &Path) -> LibraryCache {
    fs::read(cache_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<LibraryCache>(&bytes).ok())
        .filter(|cache| cache.schema_version == LIBRARY_CACHE_SCHEMA)
        .unwrap_or_default()
}

fn write_library_cache_file(cache_path: &Path, entries: Vec<CachedLibraryEntry>) {
    let cache = LibraryCache {
        schema_version: LIBRARY_CACHE_SCHEMA,
        entries,
    };
    let Ok(bytes) = serde_json::to_vec(&cache) else {
        return;
    };
    if let Some(parent) = cache_path.parent() {
        if fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    // A cache is recoverable. A partially written file is ignored on the next
    // launch and rebuilt from the real mod directories.
    let _ = fs::write(cache_path, bytes);
}

fn push_cached_entry(
    path: &Path,
    source: &str,
    is_directory: bool,
    previous: &HashMap<String, CachedLibraryEntry>,
    items: &mut Vec<InstalledMod>,
    next_cache: &mut Vec<CachedLibraryEntry>,
) {
    let Some(fingerprint) = library_entry_fingerprint(path, source, is_directory) else {
        return;
    };
    let key = cached_entry_key(path, source);
    let item = previous
        .get(&key)
        .filter(|cached| cached.fingerprint == fingerprint)
        .map(|cached| cached.item.clone())
        .unwrap_or_else(|| {
            let mut scanned = Vec::with_capacity(1);
            push_library_entry(path, source, is_directory, &mut scanned);
            scanned.pop().unwrap_or_else(|| InstalledMod {
                id: path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or_default()
                    .to_string(),
                path: path_string(path),
                source: source.to_string(),
                kind: "mod".to_string(),
                entry_type: if is_directory { "directory" } else { "file" }.to_string(),
                has_mod_lua: false,
                file_count: usize::from(!is_directory),
                display_name: None,
                duplicate_of: None,
                mod_lua: None,
            })
        });
    next_cache.push(CachedLibraryEntry {
        fingerprint,
        item: item.clone(),
    });
    items.push(item);
}

fn scan_cached_directory(
    root: &Path,
    source: &str,
    include_files: bool,
    scanned_roots: &mut HashSet<String>,
    previous: &HashMap<String, CachedLibraryEntry>,
    items: &mut Vec<InstalledMod>,
    next_cache: &mut Vec<CachedLibraryEntry>,
) {
    if !root.is_dir() || !scanned_roots.insert(directory_key(root)) {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() || (include_files && file_type.is_file()) {
            push_cached_entry(
                &entry.path(),
                source,
     ×v¶‰ËkºwµçH›Û\‹Yˆ[K‚™›ˆš[™Û[ÙÜ™]šY]Ê[ÙÙ\ˆ	”]
HOˆÜ[Û]YˆÂˆ]]]™\İˆÜ[Û
Nİš[™ÊOˆH›Û™NÂˆ›Üˆ[H[ˆœÎœ™XYÙ\Š[ÙÙ\ŠK›ÚÊ
OË™›][Š
HÂˆYˆY[K™š[Wİ\J
Kš\×ÛÚ×Ø[™
Ú[™Ú[™š\×Ùš[J
JHÂˆÛÛ[YNÂˆBˆ]˜[YHH[K™š[WÛ˜[YJ
NÂˆ]ÛÛYJ˜[YJHH˜[YK×ÜİŠ
H[ÙHÈÛÛ[YHNÂˆ]ÛÛYJ˜[šÊHH™]šY]×Ü˜[šÊ˜[YJH[ÙHÂˆÛÛ[YNÂˆNÂˆËÈY\È™\ÛÛ™HH˜[YHÛÈHÚÚXÙH\ÈİX›H™]ÙY[ˆØØ[œË‚ˆYˆ™\İ˜\×Ü™YŠ
K›X\ÛÜŠYK
Üİ\œ™[
_Âˆ˜[šÈ
Ü
˜[šÈOH
Ü	‰ˆ˜[YHİ\œ™[˜\×ÜİŠ
JBˆJHÂˆ™\İHÛÛYJ
˜[šË˜[YK×Üİš[™Ê
JJNÂˆBˆBˆ™\İ›X\

Ë˜[YJ_[ÙÙ\‹š›Ú[Š˜[YJJBŸB‚‹ËËÈXÛÙHH[Ù™]šY]È[™™]\›ˆHİÛœØØ[Y”QÈ\ÈH]N˜T’K‚‹ËËÂ‹ËËÈĞHØ[››İ™H™[™\™YHHÙX•šY]È][[™H˜]Èš[\È\™H˜\ˆÛÂ‹ËËÈ\™ÙHÈ[™İ™\‹ÛÈXÛÙ[™È[™[X›˜Z[[™È\[ˆ˜]]™[K‚œXˆ›ˆ™XYÛ[ÙÜ™]šY]Ê[ÙÜ]ˆİš[™ÊHOˆ™\İ[İš[™Ëİš[™ÏˆÂˆ][ÙÙ\ˆHœÎ˜Ø[›ÛšXØ[^™J	›[ÙÜ]
Bˆ›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İXØÙ\ÜÈ[Ù›Û\ˆÙ\œ›ÜŸHŠJOÎÂˆYˆ[[ÙÙ\‹š\×Ù\Š
HÂˆ™]\›ˆ\œŠ•HÙ[XİY[Ù]\È›İH\™XİÜKˆ‹š[Ê
JNÂˆBˆ]Ûİ\˜ÙHHš[™Û[ÙÜ™]šY]Ê	›[ÙÙ\ŠK›Ú×ÛÜ—Ù[ÙJ“›È™]šY]È[XYÙH›İ[™ˆ‹×Üİš[™Ê
JOÎÂˆ]Y]Y]HBˆœÎ›Y]Y]J	œÛİ\˜ÙJK›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İ™XY™]šY]ÈY]Y]NˆÙ\œ›ÜŸHŠJOÎÂˆYˆY]Y]K›[Š
Hˆ‘U’QU×ÓPVÔÓÕTÑWĞ–UTÈÂˆ™]\›ˆ\œŠ•H™]šY]È[XYÙH^ÙYYÈHXÛÙH[Z]ˆ‹š[Ê
JNÂˆB‚ˆ]^[œÚ[ÛˆHÛİ\˜ÙBˆ™^[œÚ[ÛŠ
Bˆ˜[™İ[Š˜[Y_˜[YK×ÜİŠ
JBˆ›X\
İ×Ø\ØÚZWÛİÙ\˜Ø\ÙJBˆ[Ü˜\ÛÜ—ÙY˜][

NÂˆËÈXÚYHH^[œÚ[ÛˆĞHØ\œšY\È›ÈXY[™ÈXYÚXÈ]\ËÛÈÛÛ[ˆËÈÛšY™š[™ÈZ\ÚY[YšY\È]‚ˆ]›Ü›X]HX]Ú^[œÚ[Û‹˜\×ÜİŠ
HÂˆØHˆOˆ[XYÙN’[XYÙQ›Ü›X]•ØKˆœ™ÈˆOˆ[XYÙN’[XYÙQ›Ü›X]”™ËˆšœÈˆšœYÈˆOˆ[XYÙN’[XYÙQ›Ü›X]’œYËˆÈOˆ™]\›ˆ\œŠ•[œİ\ÜY™]šY]È[XYÙH›Ü›X]ˆ‹š[Ê
JKˆNÂˆ]™XY\ˆHY”™XY\›™]ÊˆœÎ‘š[N›Ü[Š	œÛİ\˜ÙJK›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İÜ[ˆ™]šY]È[XYÙNˆÙ\œ›ÜŸHŠJOËˆ
NÂˆ]XÛÙYH[XYÙN›ØY
™XY\‹›Ü›X]
Bˆ›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İXÛÙH™]šY]È[XYÙNˆÙ\œ›ÜŸHŠJOÎÂ‚ˆËÈ”QÈ\È›È[HÚ[›™[ÛÈ›Ü]™Y›Ü™H[˜ÛÙ[™Ë‚ˆ][X›˜Z[H[XYÙN‘[˜[ZXÒ[XYÙN’[XYÙT™Ø
ˆXÛÙYˆ[X›˜Z[
‘U’QU×ÓPVÑQÑK‘U’QU×ÓPVÑQÑJBˆ×Ü™Ø

Kˆ
NÂˆ]]][˜ÛÙYH™XÎ›™]Ê
NÂˆ[X›˜Z[ˆÜš]WİÊ	›]]İ\œÛÜ›™]Ê	›]][˜ÛÙY
K[XYÙN’[XYÙQ›Ü›X]’œYÊBˆ›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İ[˜ÛÙH™]šY]È[X›˜Z[ˆÙ\œ›ÜŸHŠJOÎÂ‚ˆÚÊ›Ü›X]Jˆ™]Nš[XYÙKÚœYÎØ˜\ÙMßH‹ˆ˜\ÙM™[™Ú[™N™Ù[™\˜[Ü\œÜÙN”ÕS‘T‘™[˜ÛÙJ	™[˜ÛÙY
Bˆ
JBŸB‚œXˆ›ˆ\İÛÙ×Ùš[\Ê\Ù\—Ù]WÜ]ˆİš[™ÊHOˆ™\İ[™XÏÙÑš[R[™›Ï‹İš[™ÏˆÂˆ]\Ù\—Ù]HH]Y™œ›ÛJ\Ù\—Ù]WÜ]
NÂˆYˆ]\Ù\—Ù]Kš\×Ù\Š
HÂˆ™]\›ˆ\œŠ•\Ù\ˆ]H\™XİÜHÙ\È›İ^\İˆ‹š[Ê
JNÂˆBˆ]]]š[\ÈH™XÎ›™]Ê
NÂˆ]Ø[™Y]\ÈHÂˆ
\Ù\—Ù]Kš›Ú[Š˜Ü˜\ÚÙ[\ŠKš›Ú[Šœİİ]ŠKœİİ]ŠKˆ
\Ù\—Ù]Kš›Ú[Š˜Ü˜\ÚÙ[\ŠKš›Ú[Šœİ\œ‹ŠKœİ\œˆŠKˆ
\Ù\—Ù]Kš›Ú[Šœİİ]ŠKœİİ]ŠKˆ
\Ù\—Ù]Kš›Ú[Šœİ\œ‹ŠKœİ\œˆŠKˆNÂˆ›Üˆ
]Ú[™
H[ˆØ[™Y]\ÈÂˆYˆ]š\×Ùš[J
HÂˆ]Y]Y]HHœÎ›Y]Y]J	œ]
Bˆ›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İ™XYÙÈY]Y]NˆÙ\œ›ÜŸHŠJOÎÂˆš[\Ëœ\Ú
ÙÑš[R[™›ÈÂˆ]ˆ]Üİš[™Ê	œ]
KˆÚ[™ˆÚ[™×Üİš[™Ê
KˆÚ^™NˆY]Y]K›[Š
Kˆ[ÙYšYYÛ\ÎˆY]Y]Bˆ›[ÙYšYY

Bˆ›ÚÊ
Bˆ˜[™İ[Š[Y_[YK™\˜][Û—ÜÚ[˜ÙJS’VÑTĞÒ
K›ÚÊ
JBˆ›X\
\˜][ÛŸ\˜][Û‹˜\×ÛZ[\Ê
JBˆ[Ü˜\ÛÜŠ
KˆJNÂˆBˆBˆ]Ü˜\ÚÙ[\H\Ù\—Ù]Kš›Ú[Š˜Ü˜\ÚÙ[\ŠNÂˆYˆÜ˜\ÚÙ[\š\×Ù\Š
HÂˆYˆ]ÚÊ[šY\ÊHHœÎœ™XYÙ\Š	˜Ü˜\ÚÙ[\
HÂˆ›Üˆ[H[ˆ[šY\Ë™›][Š
HÂˆ]]H[Kœ]

NÂˆ]˜[YHH]ˆ™š[WÛ˜[YJ
Bˆ˜[™İ[Š˜[Y_˜[YK×ÜİŠ
JBˆ[Ü˜\ÛÜ—ÙY˜][

Bˆ×Ø\ØÚZWÛİÙ\˜Ø\ÙJ
NÂˆYˆ]š\×Ùš[J
Bˆ	‰ˆ
˜[YK™[™×İÚ]
œİİ]ŠBˆ˜[YK™[™×İÚ]
‹›ÙÈŠBˆ˜[YK™[™×İÚ]
‹™\ŠJBˆ	‰ˆYš[\Ëš]\Š
K˜[J][_][Kœ]OH]Üİš[™Ê	œ]
JBˆÂˆ]Y]Y]HHœÎ›Y]Y]J	œ]
K›ÚÊ
NÂˆš[\Ëœ\Ú
ÙÑš[R[™›ÈÂˆ]ˆ]Üİš[™Ê	œ]
KˆÚ[™ˆYˆ˜[YK˜ÛÛZ[œÊœİİ]ŠHÂˆœİİ]X\˜Ú]™H‹š[Ê
BˆH[ÙHYˆ˜[YK™[™×İÚ]
‹™\ŠHÂˆ˜Ü˜\ÚY[\‹š[Ê
BˆH[ÙHÂˆ›ÙÈ‹š[Ê
BˆKˆÚ^™NˆY]Y]K˜\×Ü™YŠ
K›X\
Y]_Y]K›[Š
JK[Ü˜\ÛÜŠ
Kˆ[ÙYšYYÛ\ÎˆY]Y]Bˆ˜[™İ[ŠY]_Y]K›[ÙYšYY

K›ÚÊ
JBˆ˜[™İ[Š[Y_[YK™\˜][Û—ÜÚ[˜ÙJS’VÑTĞÒ
K›ÚÊ
JBˆ›X\
\˜][ÛŸ\˜][Û‹˜\×ÛZ[\Ê
JBˆ[Ü˜\ÛÜŠ
KˆJNÂˆBˆBˆBˆBˆš[\ËœÛÜØWÚÙ^J[_İ˜Û\”™]™\œÙJ[K›[ÙYšYYÛ\ÊJNÂˆÚÊš[\ÊBŸB‚‹ËËÈÛÜHİ\œ™[İİ][È[ˆ\˜Ú]™H›Û\ˆ™Y›Ü™HH™]È\İ[ˆİ™\Üš]\È]‚œXˆ›ˆ\˜Ú]™WÜİİ]
\Ù\—Ù]WÜ]ˆİš[™ÊHOˆ™\İ[İš[™Ëİš[™ÏˆÂˆ]\Ù\—Ù]HH]Y™œ›ÛJ\Ù\—Ù]WÜ]
NÂˆ]Ûİ\˜ÙHHÂˆ]š[X\HH\Ù\—Ù]Kš›Ú[Š˜Ü˜\ÚÙ[\ŠKš›Ú[Šœİİ]ŠNÂˆYˆš[X\Kš\×Ùš[J
HÂˆš[X\BˆH[ÙHÂˆ]˜[˜XÚÈH\Ù\—Ù]Kš›Ú[Šœİİ]ŠNÂˆYˆ˜[˜XÚËš\×Ùš[J
HÂˆ˜[˜XÚÂˆH[ÙHÂˆ™]\›ˆ\œŠ“›Èİİ]›İ[™È\˜Ú]™Kˆ‹š[Ê
JNÂˆBˆBˆNÂˆ]\˜Ú]™WÙ\ˆH\Ù\—Ù]Kš›Ú[Š˜Ü˜\ÚÙ[\ŠKš›Ú[Š˜\˜Ú]™HŠNÂˆœÎ˜Ü™X]WÙ\—Ø[
	˜\˜Ú]™WÙ\ŠBˆ›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İÜ™X]HÙÈ\˜Ú]™H\™XİÜNˆÙ\œ›ÜŸHŠJOÎÂˆ]\İ[˜][ÛˆH\˜Ú]™WÙ\‹š›Ú[Š›Ü›X]Jœİİ]^ßK‹›İ×ÛZ[\Ê
JJNÂˆœÎ˜ÛÜJ	œÛİ\˜ÙK	™\İ[˜][ÛŠBˆ›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İ\˜Ú]™Hİİ]ˆÙ\œ›ÜŸHŠJOÎÂˆÚÊ]Üİš[™Ê	™\İ[˜][ÛŠJBŸB‚™›ˆÛÛXİÙš[\×Ù›Ü—Şš\
›Ûİˆ	”]
HOˆ™\İ[™XÏ]Y‹İš[™ÏˆÂˆ]]]š[\ÈH™XÎ›™]Ê
NÂˆ]]]İXÚÈH™XÈVÜ›Ûİ×Ü]ØYŠ
WNÂˆÚ[H]ÛÛYJ\ŠHHİXÚËœÜ

HÂˆ][šY\ÈHœÎœ™XYÙ\Š	™\ŠBˆ›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İ™XY›Ú™Xİ\™XİÜNˆÙ\œ›ÜŸHŠJOÎÂˆ›Üˆ[H[ˆ[šY\Ë™›][Š
HÂˆ]]H[Kœ]

NÂˆ]˜[YHH]ˆ™š[WÛ˜[YJ
Bˆ˜[™İ[Š˜[Y_˜[YK×ÜİŠ
JBˆ[Ü˜\ÛÜ—ÙY˜][

NÂˆYˆ˜[YHOH‹Œ‹\İY[Èˆ˜[YHOH‹™Ú]ˆ˜[YKœİ\×İÚ]
‹Œ‹HŠHÂˆÛÛ[YNÂˆBˆYˆ]š\×Ù\Š
HÂˆİXÚËœ\Ú
]
NÂˆH[ÙHÂˆš[\Ëœ\Ú
]
NÂˆBˆBˆBˆÚÊš[\ÊBŸB‚‹ËËÈ^ÜHÛX[ˆ’TXÚØYÙH›ÜˆØØ[ÕÛÜšÜÚÜÓ[Ùš[È™\
›ÈQHY]Y]JK‚œXˆ›ˆ^ÜÜ›Ú™XİŞš\
›ÛİÜ]ˆİš[™Ë\İ[˜][Û—Ü]ˆİš[™ÊHOˆ™\İ[İš[™Ëİš[™ÏˆÂˆ]›ÛİBˆœÎ˜Ø[›ÛšXØ[^™J	œ›ÛİÜ]
K›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İXØÙ\ÜÈ›Ú™XİˆÙ\œ›ÜŸHŠJOÎÂˆYˆ\›Ûİš›Ú[Š›[Ù›XHŠKš\×Ùš[J
HÂˆ™]\›ˆ\œŠ”›Ú™Xİ›Ûİ]\İÛÛZ[ˆ[Ù›XH™Y›Ü™H^Üˆ‹š[Ê
JNÂˆBˆ]\İ[˜][ÛˆH]Y™œ›ÛJ\İ[˜][Û—Ü]
NÂˆYˆ]ÛÛYJ\™[
HH\İ[˜][Û‹œ\™[

HÂˆœÎ˜Ü™X]WÙ\—Ø[
\™[
Bˆ›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İÜ™X]H^Ü\™XİÜNˆÙ\œ›ÜŸHŠJOÎÂˆBˆ]š[HHœÎ‘š[N˜Ü™X]J	™\İ[˜][ÛŠBˆ›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İÜ™X]H’Tš[NˆÙ\œ›ÜŸHŠJOÎÂˆ]]]š\Hš\Üš]\›™]Êš[JNÂˆ]Ü[ÛœÈHÚ[\Qš[SÜ[ÛœÎ™Y˜][

K˜ÛÛ\™\ÜÚ[Û—ÛY]Ù
š\ÛÛ\™\ÜÚ[Û“Y]Ù‘Y›]Y
NÂˆ]š[\ÈHÛÛXİÙš[\×Ù›Ü—Şš\
	œ›Ûİ
OÎÂˆ›Üˆ][ˆš[\ÈÂˆ]™[]]™HH]ˆœİš\Ü™Yš^
	œ›Ûİ
Bˆ›X\Ù\œŠß’[\›˜[]\œ›ÜˆÚ[H^Ü[™Ëˆ‹×Üİš[™Ê
JOÂˆ×Üİš[™×ÛÜÜŞJ
Bˆœ™\XÙJ	×	Ë‹ÈŠNÂˆš\œİ\Ùš[J™[]]™KÜ[ÛœÊBˆ›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İÜš]H’T[NˆÙ\œ›ÜŸHŠJOÎÂˆ]]][œ]HœÎ‘š[N›Ü[Š	œ]
Bˆ›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İ™XYš[H›Üˆ^ÜˆÙ\œ›ÜŸHŠJOÎÂˆËÈİ™X[H[œİXYÙˆY™™\š[™Îˆ[ÙY\Ú\È[™^\™\ÈØ[ˆ™H\™ÙK‚ˆ[Î˜ÛÜJ	›]][œ]	›]]š\
K›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İÛÛ\™\ÜÈš[NˆÙ\œ›ÜŸHŠJOÎÂˆBˆš\™š[š\Ú

Bˆ›X\Ù\œŠ\œ›ÜŸ›Ü›X]JØ[››İš[˜[^™H’TˆÙ\œ›ÜŸHŠJOÎÂˆÚÊ]Üİš[™Ê	™\İ[˜][ÛŠJBŸBˆÖØÙ™Ê\İ
WB›[ÙÛİ\˜ÙWİ\İÈÂˆ\ÙHİ\\ŠÂˆ\ÙHİ™[Â‚ˆ›ˆ[š\]YWİ[\Ü›Ûİ

HOˆ]YˆÂˆ]˜[›ÜÈHŞ\İ[U[YN››İÊ
Bˆ™\˜][Û—ÜÚ[˜ÙJS’VÑTĞÒ
Bˆ™^Xİ
˜ÛØÚÈŠBˆ˜\×Û˜[›ÜÊ
NÂˆ]›ÛİH[[\Ù\Š
Kš›Ú[Š›Ü›X]JˆŒ‹[Xœ˜\K\Ûİ\˜Ù\Ë^ßK^Û˜[›ÜßH‹ˆİœ›ØÙ\ÜÎšY

Bˆ
JNÂˆœÎ˜Ü™X]WÙ\—Ø[
	œ›Ûİ
K™^Xİ
[\›ÛİŠNÂˆ›ÛİˆB‚ˆ›ˆÜ™X]WÛ[Ù
›Ûİˆ	”]Yˆ	œİŠHÂˆ]\™XİÜHH›Ûİš›Ú[ŠY
NÂˆœÎ˜Ü™X]WÙ\—Ø[
	™\™XİÜJK™^Xİ
›[Ù\™XİÜHŠNÂˆœÎÜš]Jˆ\™XİÜKš›Ú[Š›[Ù›XHŠKˆ›Ü›X]J™[˜İ[Ûˆ]J
H™]\›ˆŞÈ[™›ÈHŞÈ˜[YHHÚYWˆ_H_H[™ŠKˆ
Bˆ™^Xİ
›[Ù›XHŠNÂˆB‚ˆÖİ\İBˆ›ˆØØ[œ×Ù]™\WÜİ\ÜYÜÛİ\˜ÙWİÚ]İ]ÙİX›WÜØØ[›š[™×ÛØØ[Û[ÙÊ
HÂˆ]›ÛİH[š\]YWİ[\Ü›Ûİ

NÂˆ]İX[X\ÈH›Ûİš›Ú[Š”İX[SXœ˜\HŠKš›Ú[ŠœİX[X\ÈŠNÂˆ]Ø[YHHİX[X\Ëš›Ú[Š˜ÛÛ[[ÛˆŠKš›Ú[Š•˜[œÜÜ™]™\ˆˆŠNÂˆ]\Ù\—Ù]HH›Ûİˆš›Ú[Š\Ù\™]HŠBˆš›Ú[ŠŒLŒÈŠBˆš›Ú[ŠŒLÎŠBˆš›Ú[Š›ØØ[ŠNÂˆ]ØØ[H\Ù\—Ù]Kš›Ú[Š›[ÙÈŠNÂˆ]İYÚ[™ÈH\Ù\—Ù]Kš›Ú[ŠœİYÚ[™×Ø\™XHŠNÂˆ]ÛÜšÜÚÜHİX[X\Ëš›Ú[ŠÛÜšÜÚÜŠKš›Ú[Š˜ÛÛ[ŠKš›Ú[ŠŒLÎŠNÂˆ]Z[[ˆHØ[YKš›Ú[Š›[ÙÈŠNÂ‚ˆÜ™X]WÛ[Ù
	›ØØ[›ØØ[Û[ÙÌHŠNÂˆÜ™X]WÛ[Ù
	œİYÚ[™ËœİYÚ[™×Û[ÙÌHŠNÂˆÜ™X]WÛ[Ù
	ÛÜšÜÚÜÛÜšÜÚÜÛ[ÙÌHŠNÂˆÜ™X]WÛ[Ù
	˜Z[[‹˜Z[[—Û[ÙÌHŠNÂ‚ˆ][ÙÈHØØ[—Û[ÙÛXœ˜\JˆÛÛYJ]Üİš[™Ê	›ØØ[
JKˆÛÛYJ]Üİš[™Ê	\Ù\—Ù]JJKˆÛÛYJ]Üİš[™Ê	™Ø[YJJKˆ
NÂˆ]Ûİ\˜Ù\Îˆ\ÚÙ]ÏˆH[ÙËš]\Š
K›X\
][_][KœÛİ\˜ÙK˜\×ÜİŠ
JK˜ÛÛXİ

NÂ‚ˆ\ÜÙ\Ù\HJ[ÙË›[Š
K
NÂˆ\ÜÙ\Ù\HJˆÛİ\˜Ù\Ëˆ\ÚÙ]™œ›ÛJÈ›ØØ[‹œİYÚ[™È‹ÛÜšÜÚÜ‹˜Z[[ˆ—JBˆ
NÂˆ\ÜÙ\Ù\HJ[ÙËš]\Š
K™š[\Š][_][KœÛİ\˜ÙHOH›ØØ[ŠK˜Ûİ[

KJNÂ‚ˆœÎœ™[[İ™WÙ\—Ø[
›Ûİ
K™^Xİ
˜ÛX[\ŠNÂˆB‚ˆÖİ\İBˆ›ˆİYÚ[™×ØÛÛ[Ú\×ØÛ\ÜÚYšYYİÚ]İ]Û[ÙÛXWÜ™\]Z\™[Y[

HÂˆ]›ÛİH[š\]YWİ[\Ü›Ûİ

NÂˆ]\Ù\—Ù]HH›Ûİš›Ú[Š\Ù\™]HŠKš›Ú[ŠŒLÎŠKš›Ú[Š›ØØ[ŠNÂˆ]İYÚ[™ÈH\Ù\—Ù]Kš›Ú[ŠœİYÚ[™×Ø\™XHŠNÂˆœÎ˜Ü™X]WÙ\—Ø[
	œİYÚ[™ÊK™^Xİ
œİYÚ[™È›ÛİŠNÂ‚ˆ]›Ú™XİHİYÚ[™Ëš›Ú[Š’[\›˜[ÛÛÈŠNÂˆœÎ˜Ü™X]WÙ\—Ø[
›Ú™Xİš›Ú[Šœ™\ËÜØÜš\ÈŠJK™^Xİ
œ›Ú™XİØÜš\ÈŠNÂˆœÎÜš]J›Ú™Xİš›Ú[Šœ™\ËÜØÜš\ËØ›Ûİİ˜\›XHŠKœ™]\›ˆßHŠK™^Xİ
œ›Ú™XİØÜš\ŠNÂˆœÎÜš]JİYÚ[™Ëš›Ú[Š›ÛÜÙWØ›Ûİİ˜\›XHŠKœ™]\›ˆßHŠK™^Xİ
›ÛÜÙHØÜš\ŠNÂˆ]ÛÛ[HİYÚ[™Ëš›Ú[Š”™Y™\™[˜ÙQ]HŠNÂˆœÎ˜Ü™X]WÙ\—Ø[
	˜ÛÛ[
K™^Xİ
˜ÛÛ[›Û\ˆŠNÂˆœÎÜš]JÛÛ[š›Ú[Š”‘PQQKŠKš[\›˜[]HŠK™^Xİ
˜ÛÛ[š[HŠNÂ‚ˆ]][\ÈHØØ[—Û[ÙÛXœ˜\J›Û™KÛÛYJ]Üİš[™Ê	\Ù\—Ù]JJK›Û™JNÂˆ]›Ú™XİÚ][HH][\Âˆš]\Š
Bˆ™š[™
][_][KšYOH’[\›˜[ÛÛÈŠBˆ™^Xİ
œ›Ú™XİŠNÂˆ]ØÜš\Ú][HH][\Âˆš]\Š
Bˆ™š[™
][_][KšYOH›ÛÜÙWØ›Ûİİ˜\›XHŠBˆ™^Xİ
œØÜš\ŠNÂˆ]ÛÛ[Ú][HH][\Âˆš]\Š
Bˆ™š[™
][_][KšYOH”™Y™\™[˜ÙQ]HŠBˆ™^Xİ
˜ÛÛ[ŠNÂ‚ˆ\ÜÙ\Ù\HJ›Ú™XİÚ][KšÚ[™œİYÚ[™Ë\›Ú™XİŠNÂˆ\ÜÙ\Ù\HJ›Ú™XİÚ][K™[Wİ\K™\™XİÜHŠNÂˆ\ÜÙ\J\›Ú™XİÚ][Kš\×Û[ÙÛXJNÂˆ\ÜÙ\Ù\HJØÜš\Ú][KšÚ[™œİYÚ[™Ë\ØÜš\ŠNÂˆ\ÜÙ\Ù\HJØÜš\Ú][K™[Wİ\K™š[HŠNÂˆ\ÜÙ\J\ØÜš\Ú][Kš\×Û[ÙÛXJNÂˆ\ÜÙ\Ù\HJÛÛ[Ú][KšÚ[™œİYÚ[™ËXÛÛ[ŠNÂˆ\ÜÙ\Ù\HJÛÛ[Ú][K™[Wİ\K™\™XİÜHŠNÂˆ\ÜÙ\J][\Ëš]\Š
K˜[
][_][K™\XØ]WÛÙ‹š\×Û›Û™J
JJNÂ‚ˆœÎœ™[[İ™WÙ\—Ø[
›Ûİ
K™^Xİ
˜ÛX[\ŠNÂˆB‚ˆÖİ\İBˆ›ˆ\œÚ\İ[ØØXÚWÜ™\İÜ™\×İ[—Ú[˜Ü™[Y[[Wİ\]\×ÛXœ˜\WÙ[šY\Ê
HÂˆ]›ÛİH[š\]YWİ[\Ü›Ûİ

NÂˆ][ÙÈH›Ûİš›Ú[Š›[ÙÈŠNÂˆ]ØXÚHH›Ûİš›Ú[Š˜ØXÚHŠKš›Ú[Š›[Ù[Xœ˜\K]ŒKšœÛÛˆŠNÂˆœÎ˜Ü™X]WÙ\—Ø[
	›[ÙÊK™^Xİ
›[ÙÈ›ÛİŠNÂˆÜ™X]WÛ[Ù
	›[ÙË˜ØXÚYÛ[ÙÌHŠNÂ‚ˆ]š\œİHØØ[—Û[ÙÛXœ˜\WØØXÚY
	˜ØXÚKÛÛYJ]Üİš[™Ê	›[ÙÊJK›Û™K›Û™JNÂˆ\ÜÙ\Ù\HJš\œİ›[Š
KJNÂˆ\ÜÙ\Ù\HJš\œİÌK™\Ü^WÛ˜[YK˜\×Ù\™YŠ
KÛÛYJ˜ØXÚYÛ[ÙÌHŠJNÂ‚ˆ]™\İÜ™YHØYÛ[ÙÛXœ˜\WØØXÚJ	˜ØXÚJNÂˆ\ÜÙ\Ù\HJ™\İÜ™Y›[Š
KJNÂˆ\ÜÙ\Ù\HJ™\İÜ™YÌKœ]š\œİÌKœ]
NÂ‚ˆœÎÜš]Jˆ[ÙËš›Ú[Š˜ØXÚYÛ[ÙÌHŠKš›Ú[Š›[Ù›XHŠKˆ™[˜İ[Ûˆ]J
H™]\›ˆÈ[™›ÈHÈ˜[YHH•\]YØXÚY[Ù˜[YWˆHH[™‹ˆ
Bˆ™^Xİ
\]Y[Ù›XHŠNÂˆ]\]YHØØ[—Û[ÙÛXœ˜\WØØXÚY
	˜ØXÚKÛÛYJ]Üİš[™Ê	›[ÙÊJK›Û™K›Û™JNÂˆ\ÜÙ\Ù\HJˆ\]YÌK™\Ü^WÛ˜[YK˜\×Ù\™YŠ
KˆÛÛYJ•\]YØXÚY[Ù˜[YHŠBˆ
NÂ‚ˆœÎœ™[[İ™WÙ\—Ø[
[ÙËš›Ú[Š˜ØXÚYÛ[ÙÌHŠJK™^Xİ
œ™[[İ™H[ÙŠNÂˆ]™[[İ™YHØØ[—Û[ÙÛXœ˜\WØØXÚY
	˜ØXÚKÛÛYJ]Üİš[™Ê	›[ÙÊJK›Û™K›Û™JNÂˆ\ÜÙ\J™[[İ™Yš\×Ù[\J
JNÂˆ\ÜÙ\JØYÛ[ÙÛXœ˜\WØØXÚJ	˜ØXÚJKš\×Ù[\J
JNÂ‚ˆœÎœ™[[İ™WÙ\—Ø[
›Ûİ
K™^Xİ
˜ÛX[\ŠNÂˆBŸB