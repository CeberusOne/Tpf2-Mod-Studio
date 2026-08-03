from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:80]!r}")
    write(path, content.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    content = read(path)
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"Expected one regex match in {path}, found {count}: {pattern[:80]!r}")
    write(path, updated)


# ---------------------------------------------------------------------------
# Installed-library item types
# ---------------------------------------------------------------------------
replace_once(
    "packages/core/src/types.ts",
    "export interface InstalledMod {\n  id: string;",
    '''export type LibraryItemKind =
  | "mod"
  | "staging-project"
  | "staging-script"
  | "staging-content";

export type LibraryEntryType = "directory" | "file";

export interface InstalledMod {
  id: string;''',
)
replace_once(
    "packages/core/src/types.ts",
    "  source: string;\n  hasModLua: boolean;",
    '''  source: string;
  /** What the library entry represents. Older bridge mocks default to `mod`. */
  kind?: LibraryItemKind;
  /** Direct staging scripts are files; normal mods and staging projects are directories. */
  entryType?: LibraryEntryType;
  hasModLua: boolean;''',
)

# ---------------------------------------------------------------------------
# Folder names: upper-case is informational, not a broken/runs-with-issues mod
# ---------------------------------------------------------------------------
old_folder_block = '''  } else {
    // Name the characters that actually break the convention. Saying
    // "not lower-case" about `modwerkstatt_br01.10_1`, which is lower-case and
    // only contains a dot, sends people looking for the wrong thing.
    const base = folderName.replace(/_[1-9][0-9]*$/u, "");
    const upperCase = [...new Set(base.match(/[A-Z]/gu) ?? [])];
    const unusual = [...new Set(base.match(/[^a-zA-Z0-9_-]/gu) ?? [])];
    if (upperCase.length > 0 || unusual.length > 0) {
      const parts = [
        upperCase.length > 0
          ? `upper-case ${upperCase.map((c) => `\\`${c}\\``).join(", ")}`
          : "",
        unusual.length > 0
          ? `${unusual.map((c) => `\\`${c}\\``).join(", ")}`
          : ""
      ].filter((part) => part.length > 0);
      diagnostics.push(
        diagnostic(
          "MOD_FOLDER_CHARACTERS",
          "warning",
          "official-guidance",
          "Mod folder name uses non-standard characters",
          `\\`${folderName}\\` has the expected version suffix, but contains ${parts.join(" and ")}. The official guidance is lower-case letters, digits, \\`_\\` and \\`-\\`.`,
          "Mixed case and unusual characters are a portability risk between case-sensitive and case-insensitive filesystems; they do not stop the mod from loading.",
          "Rename the folder before publishing. An installed mod keeps working as it is."
        )
      );
    }
  }'''
new_folder_block = '''  } else {
    const base = folderName.replace(/_[1-9][0-9]*$/u, "");
    const upperCase = [...new Set(base.match(/[A-Z]/gu) ?? [])];
    const unusual = [...new Set(base.match(/[^a-zA-Z0-9_-]/gu) ?? [])];

    // Mixed case is common in established local libraries and TF2 still loads
    // these folders. Keep the portability advice visible, but do not colour a
    // working installed mod amber merely because its author used capitals.
    if (upperCase.length > 0) {
      diagnostics.push(
        diagnostic(
          "MOD_FOLDER_CASE",
          "info",
          "official-guidance",
          "Mod folder contains upper-case letters",
          `\\`${folderName}\\` contains ${upperCase.map((c) => `\\`${c}\\``).join(", ")}, but its major-version suffix is valid.`,
          "Transport Fever 2 accepts mixed-case mod folder names. Exact case still matters on Linux when other files refer to this folder or its resources.",
          "No change is required for an installed working mod. Prefer lower-case names when publishing a new mod."
        )
      );
    }

    if (unusual.length > 0) {
      diagnostics.push(
        diagnostic(
          "MOD_FOLDER_CHARACTERS",
          "warning",
          "official-guidance",
          "Mod folder name uses non-standard characters",
          `\\`${folderName}\\` has the expected version suffix, but contains ${unusual.map((c) => `\\`${c}\\``).join(", ")}. The documented portable set is letters, digits, \\`_\\` and \\`-\\`.`,
          "Characters such as dots or spaces can make packaging and cross-platform path handling less predictable; they do not automatically stop the mod from loading.",
          "Keep an already working local mod unchanged if necessary. Prefer a portable folder name for newly published versions."
        )
      );
    }
  }'''
replace_once("packages/core/src/validator.ts", old_folder_block, new_folder_block)

# Non-mod staging entries are intentionally not forced through mod.lua health.
replace_once(
    "packages/core/src/mod-health.ts",
    'import type { Diagnostic, ModHealth, ModHealthStatus } from "./types.js";',
    'import type {\n  Diagnostic,\n  LibraryItemKind,\n  ModHealth,\n  ModHealthStatus\n} from "./types.js";',
)
replace_once(
    "packages/core/src/mod-health.ts",
    '''  /** Scan source; `workshop` folders are named by Steam, not by the author. */
  source?: string | undefined;
}): ModHealth {
  const diagnostics: Diagnostic[] = [];
''',
    '''  /** Scan source; `workshop` folders are named by Steam, not by the author. */
  source?: string | undefined;
  /** Staging projects/scripts are library content, not necessarily TF2 mods. */
  kind?: LibraryItemKind | undefined;
}): ModHealth {
  const diagnostics: Diagnostic[] = [];

  if (input.kind !== undefined && input.kind !== "mod") {
    return {
      status: "ok",
      errorCount: 0,
      warningCount: 0,
      unprovenCount: 0,
      diagnostics
    };
  }
''',
)

# ---------------------------------------------------------------------------
# Native library scanner: mods + staging projects + direct scripts/content
# ---------------------------------------------------------------------------
replace_once(
    "apps/desktop/src-tauri/src/library.rs",
    '''    pub source: String,
    pub has_mod_lua: bool,
''',
    '''    pub source: String,
    pub kind: String,
    pub entry_type: String,
    pub has_mod_lua: bool,
''',
)

new_scanner = r'''fn is_script_resource(path: &Path) -> bool {
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
'''
regex_once(
    "apps/desktop/src-tauri/src/library.rs",
    r"fn scan_mod_directory\(root: &Path, source: &str, into: &mut Vec<InstalledMod>\) \{.*?\n\}\n\nfn directory_key",
    new_scanner + "\nfn directory_key",
)
replace_once(
    "apps/desktop/src-tauri/src/library.rs",
    '''fn scan_mod_directory_once(
    root: &Path,
    source: &str,
    scanned_roots: &mut HashSet<String>,
    into: &mut Vec<InstalledMod>,
) {
    if root.is_dir() && scanned_roots.insert(directory_key(root)) {
        scan_mod_directory(root, source, into);
    }
}
''',
    '''fn scan_mod_directory_once(
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
''',
)
replace_once(
    "apps/desktop/src-tauri/src/library.rs",
    '''        scan_mod_directory_once(
            &user_data.join("staging_area"),
            "staging",
            &mut scanned_roots,
            &mut mods,
        );''',
    '''        scan_staging_directory_once(
            &user_data.join("staging_area"),
            &mut scanned_roots,
            &mut mods,
        );''',
)
replace_once(
    "apps/desktop/src-tauri/src/library.rs",
    '''    for item in &mut mods {
        let key = mod_id_key(&item.id);''',
    '''    for item in &mut mods {
        if item.kind != "mod" {
            continue;
        }
        let key = mod_id_key(&item.id);''',
)

library_test = r'''

    #[test]
    fn staging_content_is_classified_without_mod_lua_requirement() {
        let root = unique_temp_root();
        let user_data = root.join("userdata").join("1066780").join("local");
        let staging = user_data.join("staging_area");
        fs::create_dir_all(&staging).expect("staging root");

        let project = staging.join("InternalTools");
        fs::create_dir_all(project.join("res/scripts")).expect("project scripts");
        fs::write(project.join("res/scripts/bootstrap.lua"), "return {}").expect("project script");
        fs::write(staging.join("loose_bootstrap.lua"), "return {}").expect("loose script");
        let content = staging.join("ReferenceData");
        fs::create_dir_all(&content).expect("content folder");
        fs::write(content.join("README.txt"), "internal data").expect("content file");

        let items = scan_mod_library(None, Some(path_string(&user_data)), None);
        let project_item = items.iter().find(|item| item.id == "InternalTools").expect("project");
        let script_item = items.iter().find(|item| item.id == "loose_bootstrap.lua").expect("script");
        let content_item = items.iter().find(|item| item.id == "ReferenceData").expect("content");

        assert_eq!(project_item.kind, "staging-project");
        assert_eq!(project_item.entry_type, "directory");
        assert!(!project_item.has_mod_lua);
        assert_eq!(script_item.kind, "staging-script");
        assert_eq!(script_item.entry_type, "file");
        assert!(!script_item.has_mod_lua);
        assert_eq!(content_item.kind, "staging-content");
        assert_eq!(content_item.entry_type, "directory");
        assert!(items.iter().all(|item| item.duplicate_of.is_none()));

        fs::remove_dir_all(root).expect("cleanup");
    }
'''
content = read("apps/desktop/src-tauri/src/library.rs")
insert_at = content.rfind("\n}")
if insert_at < 0:
    raise RuntimeError("Cannot find library test module end")
write("apps/desktop/src-tauri/src/library.rs", content[:insert_at] + library_test + content[insert_at:])

# ---------------------------------------------------------------------------
# UI: staging item labels and startup update modal with install+restart
# ---------------------------------------------------------------------------
replace_once(
    "apps/desktop/src/App.tsx",
    '''  localizedInstallationReason,
  localizedInstallationSource,
  localizedModSource,
''',
    '''  localizedInstallationReason,
  localizedInstallationSource,
  localizedLibraryItemKind,
  localizedModSource,
''',
)
replace_once(
    "apps/desktop/src/App.tsx",
    '''  const [updateState, setUpdateState] = useState<
    "offered" | "installing" | "installed"
  >("offered");''',
    '''  const [updateState, setUpdateState] = useState<
    "offered" | "installing" | "restarting" | "restart-required"
  >("offered");''',
)
replace_once(
    "apps/desktop/src/App.tsx",
    '''  async function installUpdate(): Promise<void> {
    if (updateInfo === undefined) return;
    setUpdateState("installing");
    try {
      const result = await bridge.applyUpdate(updateInfo);
      setUpdateState("installed");
      setNotice({ tone: "success", message: result });
    } catch (error) {
      setUpdateState("offered");
      setNotice({ tone: "error", message: errorMessage(error) });
    }
  }
''',
    '''  async function installUpdate(): Promise<void> {
    if (updateInfo === undefined) return;
    setUpdateState("installing");
    try {
      const result = await bridge.applyUpdate(updateInfo);
      setUpdateState("restarting");
      setNotice({ tone: "success", message: result });

      // The native restart command exits the current process on success. If it
      // returns or rejects, keep a manual restart action visible instead of
      // pretending the new version is already running.
      window.setTimeout(() => {
        void bridge
          .restartAfterUpdate()
          .then(() => setUpdateState("restart-required"))
          .catch((error) => {
            setUpdateState("restart-required");
            setNotice({ tone: "error", message: errorMessage(error) });
          });
      }, 350);
    } catch (error) {
      setUpdateState("offered");
      setNotice({ tone: "error", message: errorMessage(error) });
    }
  }
''',
)
replace_once(
    "apps/desktop/src/App.tsx",
    "                  installedMods={installedMods}\n",
    '''                  installedMods={installedMods.filter(
                    (item) => (item.kind ?? "mod") === "mod"
                  )}
''',
)

update_modal = '''      {updateInfo === undefined ? null : (
        <div className="modal-backdrop update-modal-backdrop">
          <section
            aria-labelledby="update-dialog-title"
            aria-modal="true"
            className="modal update-modal"
            role="dialog"
          >
            <div className="modal-heading update-modal-heading">
              <div className="update-modal-title">
                <span className="update-modal-icon">
                  <Download size={24} />
                </span>
                <div>
                  <span className="eyebrow">{t("updateDialogEyebrow")}</span>
                  <h2 id="update-dialog-title">
                    {t("updateAvailableTitle", {
                      version: updateInfo.latestVersion
                    })}
                  </h2>
                </div>
              </div>
              {updateState === "installing" || updateState === "restarting" ? null : (
                <button
                  aria-label={t("updateDismiss")}
                  className="icon-button"
                  onClick={() => setUpdateInfo(undefined)}
                  type="button"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <p className="update-modal-summary">
              {updateState === "restarting"
                ? t("updateRestarting", {
                    version: updateInfo.latestVersion
                  })
                : updateState === "restart-required"
                  ? t("updateRestartRequired")
                  : t("updateAvailableBody", {
                      current: updateInfo.currentVersion
                    })}
            </p>

            {updateInfo.notes.trim().length === 0 ? null : (
              <div className="update-release-notes">
                <strong>{t("updateNotes")}</strong>
                <p>{updateInfo.notes}</p>
              </div>
            )}

            <div className="update-verification-note">
              <ShieldCheck size={17} />
              <span>{t("updateVerification")}</span>
            </div>

            <div className="modal-actions">
              {updateState === "offered" ? (
                <>
                  <button
                    className="secondary-button"
                    onClick={() => setUpdateInfo(undefined)}
                    type="button"
                  >
                    {t("updateLater")}
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => void installUpdate()}
                    type="button"
                  >
                    <Download size={16} />
                    {t("updateInstallRestart")}
                  </button>
                </>
              ) : updateState === "restart-required" ? (
                <button
                  className="primary-button"
                  onClick={() => void bridge.restartAfterUpdate()}
                  type="button"
                >
                  {t("updateRestart")}
                </button>
              ) : (
                <button className="primary-button" disabled type="button">
                  <LoaderCircle className="spin" size={16} />
                  {updateState === "installing"
                    ? t("updateInstalling", {
                        version: updateInfo.latestVersion
                      })
                    : t("updateRestarting", {
                        version: updateInfo.latestVersion
                      })}
                </button>
              )}
            </div>
          </section>
        </div>
      )}

'''
regex_once(
    "apps/desktop/src/App.tsx",
    r"      \{updateInfo === undefined \? null : \(.*?\n      \)\}\n\n(?=      \{notice !== undefined)",
    update_modal,
)
replace_once(
    "apps/desktop/src/App.tsx",
    '''          source: mod.source,
          ...(mod.modLua === undefined ? {} : { modLua: mod.modLua })''',
    '''          source: mod.source,
          kind: mod.kind ?? "mod",
          ...(mod.modLua === undefined ? {} : { modLua: mod.modLua })''',
)
replace_once(
    "apps/desktop/src/App.tsx",
    '''                const health = healthOf(mod);
                const expanded = expandedMod === mod.path;
                return (
''',
    '''                const health = healthOf(mod);
                const expanded = expandedMod === mod.path;
                const kind = mod.kind ?? "mod";
                const directory = mod.entryType !== "file";
                return (
''',
)
replace_once(
    "apps/desktop/src/App.tsx",
    '''                    <ModPreview
                      bridge={bridge}
                      modPath={mod.path}
                      name={mod.displayName ?? mod.id}
                    />''',
    '''                    {directory ? (
                      <ModPreview
                        bridge={bridge}
                        modPath={mod.path}
                        name={mod.displayName ?? mod.id}
                      />
                    ) : (
                      <div className="mod-preview mod-preview-file">
                        <Code2 size={30} />
                        <span>{localizedLibraryItemKind(kind, t)}</span>
                      </div>
                    )}''',
)
replace_once(
    "apps/desktop/src/App.tsx",
    '''                        <strong>{mod.displayName ?? mod.id}</strong>
                        <span>{mod.id}</span>
''',
    '''                        <strong>{mod.displayName ?? mod.id}</strong>
                        <span>{mod.id}</span>
                        <span className={`library-kind-badge ${kind}`}>
                          {localizedLibraryItemKind(kind, t)}
                        </span>
''',
)
replace_once(
    "apps/desktop/src/App.tsx",
    '''              <span className="mod-source-count">
                {t("modsInSource", { count: entries.length })}
              </span>''',
    '''              <span className="mod-source-count">
                {t("libraryItemsInSource", { count: entries.length })}
              </span>''',
)
# Only directory entries can use directory-backed editors/viewers/workspace.
content = read("apps/desktop/src/App.tsx")
content = content.replace(
    '''                      {experience === "expert" ? (
                        <button
                          aria-expanded={editingMod === mod.path}''',
    '''                      {experience === "expert" && directory ? (
                        <button
                          aria-expanded={editingMod === mod.path}''',
    1,
)
content = content.replace(
    '''                      {experience === "expert" ? (
                        <button
                          aria-expanded={viewingMod === mod.path}''',
    '''                      {experience === "expert" && directory ? (
                        <button
                          aria-expanded={viewingMod === mod.path}''',
    1,
)
content = content.replace('disabled={!mod.hasModLua}', 'disabled={!directory}', 1)
content = content.replace(
    '''                    {expanded ? (
                      <ModFindings diagnostics={health.diagnostics} />
                    ) : null}''',
    '''                    {expanded ? (
                      kind === "mod" ? (
                        <ModFindings diagnostics={health.diagnostics} />
                      ) : (
                        <p className="mod-finding-empty library-item-note">
                          {t("libraryItemNoModValidation")}
                        </p>
                      )
                    ) : null}''',
    1,
)
content = content.replace(
    '{viewingMod === mod.path ? (\n                      <ModModelBrowser',
    '{viewingMod === mod.path && directory ? (\n                      <ModModelBrowser',
    1,
)
content = content.replace(
    '{editingMod === mod.path ? (\n                      <ModFileEditor',
    '{editingMod === mod.path && directory ? (\n                      <ModFileEditor',
    1,
)
write("apps/desktop/src/App.tsx", content)

# ---------------------------------------------------------------------------
# Translations and localized item labels
# ---------------------------------------------------------------------------
replace_once(
    "apps/desktop/src/i18n.tsx",
    '''  updateAvailableBody:
    "You have {current}. Installing replaces the current package and needs a restart.",
  updateInstall: "Install now",
  updateInstalledRestart: "Installed. Restart to use the new version.",
  updateRestart: "Restart now",
  updateDismiss: "Dismiss update notice",
''',
    '''  updateAvailableBody:
    "You have {current}. The verified package can be installed now; the Studio will then restart automatically.",
  updateDialogEyebrow: "Tpf2 Mod Studio update",
  updateInstall: "Install now",
  updateInstallRestart: "Install and restart",
  updateInstalledRestart: "Installed. Restart to use the new version.",
  updateRestart: "Restart now",
  updateRestarting: "Version {version} is installed. Restarting Tpf2 Mod Studio…",
  updateRestartRequired:
    "The update is installed, but the automatic restart did not complete. Restart the Studio now.",
  updateLater: "Later",
  updateVerification:
    "The installer is downloaded only from this repository and must match SHA256SUMS.txt before it runs.",
  updateDismiss: "Dismiss update notice",
''',
)
replace_once(
    "apps/desktop/src/i18n.tsx",
    '''  modSourceBuiltin: "Shipped with the game",
  modsInSource: "{count} mods",
  modFiles: "{count} files",
''',
    '''  modSourceBuiltin: "Shipped with the game",
  modsInSource: "{count} mods",
  libraryItemsInSource: "{count} entries",
  libraryKindMod: "Mod",
  libraryKindStagingProject: "Staging project",
  libraryKindStagingScript: "Internal script",
  libraryKindStagingContent: "Staging content",
  libraryItemNoModValidation:
    "This is intentional staging content. It is not forced through mod.lua or mod-folder validation.",
  modFiles: "{count} files",
''',
)
replace_once(
    "apps/desktop/src/i18n.tsx",
    '''  updateAvailableBody:
    "Installiert ist {current}. Die Installation ersetzt das aktuelle Paket und erfordert einen Neustart.",
  updateInstall: "Jetzt installieren",
  updateInstalledRestart: "Installiert. Zum Verwenden neu starten.",
  updateRestart: "Jetzt neu starten",
  updateDismiss: "Update-Hinweis schließen",
''',
    '''  updateAvailableBody:
    "Installiert ist {current}. Das geprüfte Paket kann jetzt installiert werden; anschließend startet das Studio automatisch neu.",
  updateDialogEyebrow: "Tpf2-Mod-Studio-Update",
  updateInstall: "Jetzt installieren",
  updateInstallRestart: "Installieren und neu starten",
  updateInstalledRestart: "Installiert. Zum Verwenden neu starten.",
  updateRestart: "Jetzt neu starten",
  updateRestarting: "Version {version} ist installiert. Tpf2 Mod Studio wird neu gestartet…",
  updateRestartRequired:
    "Das Update ist installiert, aber der automatische Neustart wurde nicht abgeschlossen. Starte das Studio jetzt neu.",
  updateLater: "Später",
  updateVerification:
    "Der Installer wird ausschließlich aus diesem Repository geladen und muss vor der Ausführung mit SHA256SUMS.txt übereinstimmen.",
  updateDismiss: "Update-Hinweis schließen",
''',
)
replace_once(
    "apps/desktop/src/i18n.tsx",
    '''  modSourceBuiltin: "Mit dem Spiel geliefert",
  modsInSource: "{count} Mods",
  modFiles: "{count} Dateien",
''',
    '''  modSourceBuiltin: "Mit dem Spiel geliefert",
  modsInSource: "{count} Mods",
  libraryItemsInSource: "{count} Einträge",
  libraryKindMod: "Mod",
  libraryKindStagingProject: "Staging-Projekt",
  libraryKindStagingScript: "Internes Skript",
  libraryKindStagingContent: "Staging-Inhalt",
  libraryItemNoModValidation:
    "Dies ist bewusst interner Staging-Inhalt. Er wird nicht zu einer mod.lua oder einem Mod-Ordner gezwungen.",
  modFiles: "{count} Dateien",
''',
)
replace_once(
    "apps/desktop/src/i18n.tsx",
    '''export function localizedModSource(source: string, t: Translator): string {
  if (source === "local") return t("modSourceLocal");
  if (source === "workshop") return t("modSourceWorkshop");
  if (source === "staging") return t("modSourceStaging");
  if (source === "builtin") return t("modSourceBuiltin");
  return source;
}
''',
    '''export function localizedModSource(source: string, t: Translator): string {
  if (source === "local") return t("modSourceLocal");
  if (source === "workshop") return t("modSourceWorkshop");
  if (source === "staging") return t("modSourceStaging");
  if (source === "builtin") return t("modSourceBuiltin");
  return source;
}

export function localizedLibraryItemKind(kind: string, t: Translator): string {
  if (kind === "staging-project") return t("libraryKindStagingProject");
  if (kind === "staging-script") return t("libraryKindStagingScript");
  if (kind === "staging-content") return t("libraryKindStagingContent");
  return t("libraryKindMod");
}
''',
)

# ---------------------------------------------------------------------------
# Styling: modal in the established surface system + item kind badges
# ---------------------------------------------------------------------------
old_update_css = '''/* The update offer stays until it is acted on; a toast disappeared before the
   user could do anything with it. */
.update-banner {
  position: fixed;
  z-index: 70;
  top: 14px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(680px, calc(100vw - 40px));
  padding: 11px 14px;
  transform: translateX(-50%);
  background: var(--surface-raised);
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  border-radius: 10px;
  box-shadow: var(--shadow);
}

.update-banner-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.update-banner-text strong { font-size: 0.86rem; }

.update-banner-text span {
  color: var(--muted);
  font-size: 0.78rem;
}

.update-banner .primary-button { flex: 0 0 auto; }'''
new_update_css = '''/* Startup update dialog: same surface, border and button system as project dialogs. */
.update-modal-backdrop {
  z-index: 120;
}

.update-modal {
  width: min(660px, 100%);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border-strong));
}

.update-modal-heading {
  margin-bottom: 14px;
}

.update-modal-title {
  display: flex;
  align-items: center;
  gap: 13px;
}

.update-modal-icon {
  display: grid;
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--accent-ink);
  background: var(--accent);
  border-radius: 11px 11px 11px 4px;
}

.update-modal-summary {
  margin: 0;
  color: var(--muted-strong);
  line-height: 1.55;
}

.update-release-notes {
  max-height: 250px;
  margin-top: 16px;
  padding: 13px 14px;
  overflow-y: auto;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.update-release-notes strong {
  font-size: 0.82rem;
}

.update-release-notes p {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

.update-verification-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 14px;
  padding: 10px 12px;
  color: var(--muted);
  font-size: 0.76rem;
  background: color-mix(in srgb, var(--success) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 24%, var(--border));
  border-radius: 7px;
}

.update-verification-note svg {
  flex: 0 0 auto;
  color: var(--success);
}

.library-kind-badge {
  width: fit-content;
  padding: 2px 7px;
  color: var(--muted-strong) !important;
  font-size: 0.68rem !important;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  background: var(--surface-hover);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.library-kind-badge.staging-project,
.library-kind-badge.staging-script,
.library-kind-badge.staging-content {
  color: var(--info) !important;
  border-color: color-mix(in srgb, var(--info) 32%, var(--border));
}

.mod-preview-file {
  display: flex;
  min-height: 110px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: var(--info);
  background: color-mix(in srgb, var(--info) 7%, var(--surface-raised));
}

.mod-preview-file span {
  font-size: 0.76rem;
  font-weight: 700;
}

.library-item-note {
  margin-top: 12px;
  padding: 10px 12px;
  color: var(--muted-strong);
  background: color-mix(in srgb, var(--info) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--info) 22%, var(--border));
  border-radius: 7px;
}'''
replace_once("apps/desktop/src/styles.css", old_update_css, new_update_css)

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
write(
    "packages/core/src/folder-name.test.ts",
    '''import { describe, expect, it } from "vitest";

import { folderNameDiagnostics } from "./validator.js";

describe("installed mod folder guidance", () => {
  it("keeps a mixed-case folder with a valid suffix out of warning state", () => {
    const diagnostics = folderNameDiagnostics("ZiehbareOberleitung_DB_1");
    expect(diagnostics.some((item) => item.severity === "warning")).toBe(false);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: "MOD_FOLDER_CASE", severity: "info" })
    );
  });

  it("still warns when the positive major-version suffix is missing", () => {
    expect(folderNameDiagnostics("ZiehbareOberleitung_DB")).toContainEqual(
      expect.objectContaining({
        code: "MOD_FOLDER_VERSION_SUFFIX",
        severity: "warning"
      })
    );
  });
});
''',
)

old_update_test = '''  it("offers an available update and installs it on request", async () => {
    // The check used to raise a five-second toast and nothing else, so an
    // available update could be seen but never installed.
    const desktopBridge = bridge();
    desktopBridge.checkForUpdate = vi.fn(async () => ({
      available: true,
      currentVersion: "0.1.0-alpha.8",
      latestVersion: "0.1.0-alpha.9",
      releaseTag: "v0.1.0-alpha.9",
      notes: "",
      downloadUrl: "https://github.com/x/y/releases/download/v0.1.0-alpha.9/a.AppImage",
      assetName: "a.AppImage",
      htmlUrl: "https://github.com/x/y/releases/tag/v0.1.0-alpha.9"
    }));
    render(<App bridge={desktopBridge} />);

    expect(
      await screen.findByText("Version 0.1.0-alpha.9 is available", {}, { timeout: 3000 })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Install now" }));

    await waitFor(() => {
      expect(desktopBridge.applyUpdate).toHaveBeenCalled();
    });
    expect(
      await screen.findByRole("button", { name: "Restart now" })
    ).toBeTruthy();
  });
'''
new_update_test = '''  it("shows the startup update dialog, installs, and requests a restart", async () => {
    const desktopBridge = bridge();
    desktopBridge.checkForUpdate = vi.fn(async () => ({
      available: true,
      currentVersion: "0.1.0-alpha.11",
      latestVersion: "0.1.0-alpha.12",
      releaseTag: "v0.1.0-alpha.12",
      notes: "Parser and updater improvements.",
      downloadUrl:
        "https://github.com/CeberusOne/Tpf2-Mod-Studio/releases/download/v0.1.0-alpha.12/a.AppImage",
      assetName: "a.AppImage",
      htmlUrl:
        "https://github.com/CeberusOne/Tpf2-Mod-Studio/releases/tag/v0.1.0-alpha.12"
    }));
    render(<App bridge={desktopBridge} />);

    expect(
      await screen.findByRole("dialog", {}, { timeout: 3000 })
    ).toBeTruthy();
    expect(screen.getByText("Parser and updater improvements.")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Install and restart" })
    );

    await waitFor(() => {
      expect(desktopBridge.applyUpdate).toHaveBeenCalled();
      expect(desktopBridge.restartAfterUpdate).toHaveBeenCalled();
    }, { timeout: 3000 });
    expect(
      await screen.findByRole("button", { name: "Restart now" })
    ).toBeTruthy();
  });

  it("shows staging scripts as intentional content instead of broken mods", async () => {
    const desktopBridge = bridge();
    desktopBridge.scanModLibrary = vi.fn(
      async (): Promise<InstalledMod[]> => [
        {
          id: "InternalTools",
          path: "/tf2/userdata/staging_area/InternalTools",
          source: "staging",
          kind: "staging-project",
          entryType: "directory",
          hasModLua: false,
          fileCount: 3
        },
        {
          id: "bootstrap.lua",
          path: "/tf2/userdata/staging_area/bootstrap.lua",
          source: "staging",
          kind: "staging-script",
          entryType: "file",
          hasModLua: false,
          fileCount: 1
        }
      ]
    );
    render(<App bridge={desktopBridge} />);

    fireEvent.click(screen.getByRole("button", { name: "Mod library" }));
    fireEvent.click(screen.getByRole("button", { name: "Scan mod library" }));

    expect(await screen.findByText("Staging project")).toBeTruthy();
    expect(screen.getAllByText("Internal script").length).toBeGreaterThan(0);
    expect(screen.queryByText("Will not load")).toBeNull();
    expect(screen.getAllByText("OK")).toHaveLength(2);
  });
'''
replace_once("apps/desktop/src/App.test.tsx", old_update_test, new_update_test)

# ---------------------------------------------------------------------------
# Version and release documentation
# ---------------------------------------------------------------------------
for path in [
    "package.json",
    "package-lock.json",
    "apps/desktop/package.json",
    "apps/desktop/src-tauri/tauri.conf.json",
]:
    content = read(path)
    if "0.1.0-alpha.11" not in content:
        raise RuntimeError(f"Version not found in {path}")
    write(path, content.replace("0.1.0-alpha.11", "0.1.0-alpha.12"))

replace_once(
    "apps/desktop/src-tauri/Cargo.toml",
    'version = "0.1.0-alpha.11"',
    'version = "0.1.0-alpha.12"',
)
content = read("apps/desktop/src-tauri/Cargo.lock")
content, count = re.subn(
    r'(name = "tpf2-mod-studio"\nversion = ")0\.1\.0-alpha\.11("\n)',
    r'\g<1>0.1.0-alpha.12\2',
    content,
    count=1,
)
if count != 1:
    raise RuntimeError("Could not update Cargo.lock package version")
write("apps/desktop/src-tauri/Cargo.lock", content)

readme = read("README.md")
readme = readme.replace("v0.1.0-alpha.11", "v0.1.0-alpha.12")
readme = readme.replace(
    "release-notes-0.1.0-alpha.11.md",
    "release-notes-0.1.0-alpha.12.md",
)
write("README.md", readme)

changelog = read("CHANGELOG.md")
section = '''## 0.1.0-alpha.12 — 2026-08-03

- Mixed-case local mod folder names with a valid `_1`, `_2`, … suffix are now
  informational only and no longer mark an otherwise working mod as amber.
- The library distinguishes regular mods, staging projects, direct internal
  scripts and other staging content. Non-mod staging entries are not forced
  through `mod.lua` validation and are excluded from savegame dependency lists.
- Direct files in `staging_area` are visible without being moved or converted.
- Startup update checks now open a native-styled modal with release notes,
  verified install, automatic restart and a manual restart fallback.

'''
if section not in changelog:
    changelog = changelog.replace("# Changelog\n\n", "# Changelog\n\n" + section, 1)
write("CHANGELOG.md", changelog)

write(
    "docs/release-notes-0.1.0-alpha.12.md",
    '''# Tpf2 Mod Studio 0.1.0-alpha.12

This release makes the mod library less prescriptive and completes the startup
update experience.

## Mod library and parser

- Mixed-case local folders such as `ZiehbareOberleitung_DB_1` remain green when
  their version suffix is valid. The casing recommendation is shown as
  information, not as a defect.
- `_1` and `_2` remain separate mod IDs.
- The staging area now distinguishes:
  - regular mods with `mod.lua`
  - staging projects containing internal scripts
  - direct internal script files
  - other staging content
- Internal staging content is not forced to contain `mod.lua`, is not labelled
  as a broken mod, and is not included in savegame dependency resolution.
- Nothing is moved automatically between local mods and `staging_area`.

## Updates

- The Studio checks GitHub Releases once at startup.
- A modal matching the Studio interface shows the new version and release notes.
- **Install and restart** downloads the platform package, verifies it against
  `SHA256SUMS.txt`, installs it and automatically relaunches the Studio.
- A manual restart button remains available if the operating system prevents
  the automatic relaunch.

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
''',
)

print("alpha.12 patch applied")
