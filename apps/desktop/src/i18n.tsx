import type { Diagnostic } from "@tpf2-mod-studio/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

export type Language = "de" | "en";

const STORAGE_KEY = "tpf2-mod-studio.language.v1";

const english = {
  languageControl: "Interface language",
  german: "German",
  english: "English",
  nativeReady: "Desktop ready",
  uiPreview: "Browser preview",
  noTelemetry: "Local only · no telemetry",
  authorLine: "by Mike Hering · GPL-3.0",
  mainNavigation: "Main navigation",
  backToMainView: "Back to the main view",
  operationLevel: "Detail level",
  beginner: "Standard",
  expert: "Advanced",
  lightTheme: "Use light theme",
  darkTheme: "Use dark theme",
  open: "Open",
  newModProject: "New project",
  activeProject: "Current project",
  noProjectOpen: "No project open.",
  navWorkspace: "Editor",
  navDiagnostics: "Validation",
  navInstall: "Install",
  navLogs: "Game log",
  navSavegames: "Savegames",
  saveTitle: "Mod selection and load order",
  saveDescription:
    "Read which mods a savegame used, check their dependencies, and write a preset with a valid load order. Savegames are never modified.",
  saveNeedsLibrary: "Scan the mod library first so dependencies can be checked.",
  saveRefresh: "Read savegames",
  saveRefreshHint: "Press Read savegames to list them.",
  saveGames: "Savegames",
  saveNone: "No savegames found.",
  savePresets: "Existing presets",
  savePresetsNone: "No presets yet.",
  savePresetName: "Preset name",
  saveWritePreset: "Write preset",
  saveSelected: "{count} of {total} mods selected",
  saveNothingSelected: "Select mods, or load them from a savegame or preset.",
  saveModsRead: "{matched} installed mods identified from {candidates} header entries.",
  presetLoaded: "{matched} of {total} preset entries are installed.",
  presetWritten: "Preset written: {path}",
  saveOrderCount: "{count} mods in load order",
  saveAdded: "{count} added as dependencies",
  saveMissing: "{count} dependencies missing",
  saveUnverifiable: "{count} not verifiable",
  saveAutoAdded: "added automatically",
  saveOrderTitle: "Load order",
  saveChooseMods: "Choose mods manually",
  saveCycle: "Circular dependency — no valid order exists",
  saveMissingTitle: "These mods still have to be installed",
  saveMissingHint:
    "Each line names the required id and the mod that needs it. Workshop mods live in numeric folders, so one of these may already be installed under a different folder name.",
  saveNeededBy: "needed by {mod}",
  saveUnverifiableTitle: "{count} declarations could not be checked",
  saveUnverifiableHint:
    "The author wrote a download link or an unusable value instead of a mod id, so nothing can be matched against your library.",
  saveSafetyNote:
    "Savegames are only read. The load order is written to mod_presets, which you select in the game's mod list.",
  navSetup: "Game paths",
  busyIndexProject: "Scanning project…",
  busyOpenFolderPicker: "Opening folder dialog…",
  busyCreateProject: "Creating project…",
  busyReadFile: "Reading file…",
  busySaveFile: "Saving file…",
  busyInstall: "Installing mod…",
  busyOpenLogPicker: "Opening log dialog…",
  busyAnalyzeLog: "Analyzing game log…",
  busyDetectInstallations: "Detecting Transport Fever 2…",
  busyLaunchGame: "Starting Transport Fever 2…",
  dialogSelectProject: "Select a mod project folder",
  dialogSelectParent: "Select parent folder for the new project",
  dialogSelectModsDirectory: "Select the Transport Fever 2 mods folder",
  dialogSelectLog: "Select stdout.txt",
  dialogLogFilter: "Log files",
  noticeFilesLoaded: "Loaded {count} project files.",
  noticeBinaryFile:
    "Binary files are listed but not opened as text.",
  noticeFileSaved: "Saved {path} (backup created).",
  confirmDiscardChanges: "Discard unsaved changes to {path}?",
  confirmRescan:
    "Reload from disk and discard unsaved changes?",
  noticeInstallBlocked:
    "Fix confirmed validation errors before installing.",
  noticeChooseModsDirectory: "Select a mods folder first.",
  noticeFilesInstalled:
    "Installed {count} files. mod.lua verified.",
  noticeNoInstallation:
    "No Transport Fever 2 installation found at known Steam paths.",
  noticeInstallationsDetected: "Found {count} installation(s).",
  confirmLaunch:
    "Start Transport Fever 2 now?",
  noticeGameLaunched:
    "Transport Fever 2 started (process {processId}).",
  projectFiles: "Project files",
  filesCount: "{count} files",
  rescanProject: "Rescan",
  indexed: "{size} indexed",
  closeTab: "Close {path}",
  save: "Save",
  selectFile: "No file selected",
  selectFileDescription:
    "Choose a Lua, config, or text file from the project tree.",
  editorLoading: "Loading editor…",
  noFileOpen: "No file open",
  unsavedCount: "{count} unsaved",
  diskState: "On disk",
  errors: "Errors",
  warnings: "Warnings",
  allDiagnostics: "All findings",
  welcomeEyebrow: "Transport Fever 2",
  welcomeTitle: "Create, validate, and install mods.",
  welcomeDescription:
    "Work directly on local mod folders. Game base files stay read-only. No sample data is invented.",
  createModProject: "New project",
  openExistingMod: "Open project",
  previewExplanation:
    "This browser view is display-only. Use the desktop app to access local folders.",
  workflowEyebrow: "Workflow",
  workflowProject: "Project",
  workflowProjectDescription: "Create or open a mod folder",
  workflowValidation: "Validation",
  workflowValidationDescription: "Check Lua, paths, and references",
  workflowInstallation: "Install",
  workflowInstallationDescription: "Copy into the mods folder with backup",
  workflowTestRun: "Test",
  workflowTestRunDescription: "Start the game when you choose",
  workflowLog: "Log",
  workflowLogDescription: "Analyze stdout.txt for causes",
  noValidationBase: "No project open",
  noValidationBaseDescription:
    "Open a mod project to run static checks on structure, Lua, and resource references.",
  noFindings: "No issues found",
  noFindingsDescription:
    "Current validation rules report no errors or warnings for this project.",
  staticAnalysis: "Validation",
  diagnosticsTitle: "Validation results",
  diagnosticsDescription:
    "Each finding is marked as confirmed, guidance-based, or heuristic.",
  project: "Project",
  line: "Line {line}",
  cause: "Cause",
  correction: "Fix",
  certaintyConfirmed: "Confirmed",
  certaintyOfficialGuidance: "Guidance",
  certaintyHeuristic: "Heuristic",
  localInstallation: "Install target",
  installTitle: "Install to the mods folder",
  installDescription:
    "Existing mods are never replaced without confirmation. A backup is created first.",
  localModsDirectory: "Mods folder",
  noTargetSelected: "No folder selected",
  select: "Browse",
  overwriteExisting:
    "Replace existing install (create backup first)",
  installModLocally: "Install mod",
  installationVerified: "Install verified",
  installationGate: "Install readiness",
  approved: "Ready",
  blocked: "Blocked",
  gateNoProject: "Open a project first.",
  gateApproved:
    "No confirmed errors. Installation is allowed.",
  gateBlocked: "{count} confirmed error(s) must be fixed first.",
  checkRootModLua: "Root mod.lua present",
  checkLuaParsable: "Lua is parseable",
  checkPathCollision: "No path collisions",
  checkResourceCase: "Resource letter case consistent",
  realGameLogs: "Game log",
  logsTitle: "Problem analysis (stdout.txt)",
  selectLog: "Open log…",
  noLogLoaded: "No log loaded",
  noLogLoadedDescription:
    "Open the current stdout.txt. Unknown messages stay unclassified instead of inventing causes.",
  logLine: "Line {line}",
  modReference: "Mod {modId}",
  noFileAssigned: "No file linked",
  causeUnclassified: "Unclassified",
  logCausalityReliable: "Root-cause analysis complete",
  logCausalityUnconfirmed: "Partial analysis — some errors unclassified",
  logRootCauseCount: "{count} root cause(s)",
  logConsequenceCount: "{count} follow-up(s)",
  logUnclassifiedCount: "{count} unclassified",
  logRootCause: "Root cause",
  logConsequence: "Follow-up",
  logStackFrames: "{count} stack frame(s)",
  severityError: "Error",
  severityWarning: "Warning",
  severityInfo: "Info",
  platformAdapter: "Installation",
  setupTitle: "Detected game paths",
  checkDefaultPaths: "Scan again",
  noInstallationDetected: "No installation found",
  noInstallationDetectedDescription:
    "Steam default paths were checked. You can still select folders manually on Install and Log.",
  installationSourceSteam: "Steam",
  installationSourceManual: "Manual",
  valid: "OK",
  invalid: "Incomplete",
  installationMissingReason:
    "Executable or game resource folder is missing.",
  launchTestRun: "Start game",
  guidedProjectCreation: "New project",
  createDialogTitle: "Create mod project",
  closeDialog: "Close",
  parentWorkspaceFolder: "Parent folder",
  selectFolder: "Select folder…",
  projectId: "Project ID",
  projectIdHint: "Lowercase, unique, ends with major version (example_mod_1).",
  projectMode: "Mode",
  commonApiOption: "CommonAPI2",
  displayName: "Display name",
  displayNamePlaceholder: "My mod",
  author: "Author",
  authorPlaceholder: "Author name",
  createDialogInfo:
    "Creates mod.lua, strings.lua, docs, and Studio config. Existing folders are not overwritten.",
  cancel: "Cancel",
  createProjectSafely: "Create project",
  fontSizeControl: "UI text size",
  fontSizeValue: "{size}px",
  openLatestLog: "Open latest stdout.txt",
  analyzeSelectedLog: "Analyze selected log",
  detectedPaths: "Detected paths",
  pathGame: "Game",
  pathUserData: "User data",
  pathMods: "Mods",
  pathStdout: "stdout.txt",
  pathMissing: "Not found",
  useDetectedMods: "Use as install target",
  noticeAutoDetected: "Game paths detected. Mods folder and log path were filled automatically when available.",
  noticeLogLoaded: "Analyzed {path}.",
  logReliabilityDetail: "{reason}",
  showCauseAlways: "Cause",
  openZipMod: "Open ZIP mod",
  importZipMod: "Import ZIP to mods folder",
  dialogSelectZip: "Select a Transport Fever 2 mod ZIP",
  dialogZipFilter: "ZIP archives",
  dialogSelectExportTarget: "Save the mod ZIP as",
  busyInspectZip: "Inspecting ZIP mod…",
  busyImportZip: "Importing ZIP mod…",
  noticeZipInspected: "ZIP mod recognized: {projectId} ({count} files).",
  noticeZipImported: "Imported {projectId} ({count} files) into the mods folder.",
  noticeChooseModsForZip: "Select a mods folder before importing a ZIP.",
  logShowProblems: "Problems only",
  logShowAll: "All messages",
  logNoiseSkipped: "{count} noise lines hidden",
  logOpenDetails: "Details",
  logAffectedFiles: "Affected files",
  logAffectedMods: "Affected mods",
  askAi: "Ask AI",
  navAi: "AI",
  updateChecking: "Checking for updates…",
  updateAvailable: "Update {version} is available",
  updateAvailableTitle: "Version {version} is available",
  updateAvailableBody:
    "You have {current}. Installing replaces the current package and needs a restart.",
  updateInstall: "Install now",
  updateInstalledRestart: "Installed. Restart to use the new version.",
  updateRestart: "Restart now",
  updateDismiss: "Dismiss update notice",
  updateAvailableOnce:
    "Update {version} is available (you have {current}). Install from GitHub Releases — auto-update is disabled to avoid restart loops.",
  updateInstalling: "Downloading and installing update {version}…",
  updateInstalled: "Update installed. Please restart the application manually.",
  updateFailed: "Update failed: {error}",
  updateUpToDate: "You are on the latest version ({version}).",
  updateNotes: "Release notes",
  navManage: "Mod library",
  manageTitle: "Installed mods",
  manageDescription: "Local, staging and workshop folders from your TF2 installation.",
  scanModLibrary: "Scan mod library",
  modSource: "Source",
  modSourceLocal: "Local mods",
  modSourceWorkshop: "Steam Workshop",
  modSourceStaging: "Staging area",
  modSourceBuiltin: "Shipped with the game",
  modsInSource: "{count} mods",
  modFiles: "{count} files",
  modHealthOk: "OK",
  modHealthWarning: "Runs with issues",
  modHealthError: "Will not load",
  modInfo: "Info",
  modMaximize: "Full screen",
  modRestore: "Exit full screen (Esc)",
  modFindingCount: "{count} finding(s)",
  modNoProvenFindings:
    "No provable issue in mod.lua. Resource and path checks need a full project scan.",
  modUnprovenCount: "{count} check(s) could not be proven",
  modUnprovenNote:
    "These say something could not be verified statically — usually a callback defined in another file. They do not mean the mod is broken and never change the light.",
  modelViewer: "3D view",
  modelLoading: "Loading model…",
  modelParseFailed:
    "This .mdl builds its values at runtime (require \"transf\"). Static reading cannot resolve them; the Lua is never executed.",
  modelFit: "Fit view",
  modelFitHint: "Frame the model in the viewport",
  modelGrid: "Grid",
  modelAxes: "Axes",
  modelAutoRotate: "Auto-rotate",
  modelLightBackground: "Light background",
  modelParts: "{count} parts — show or hide",
  modelSize: "Size {x} × {y} × {z} m",
  modelLod: "Detail level",
  modelLodOption: "LOD {index} · {count} part(s)",
  modelWireframe: "Wireframe",
  modelShowBounds: "Bounds and collider",
  modelStats: "{parts} part(s) · {triangles} triangles",
  modelCollider: "Collider: {type}",
  modelMissingMeshes: "{count} mesh(es) come from the base game and are not in this mod",
  modelNoModels: "This mod contains no .mdl models.",
  modelSelect: "Model",
  modEditFiles: "Edit files",
  modEditNoTextFiles:
    "This mod has no editable text files. Meshes, textures and sounds need dedicated editors.",
  modEditWorkshopWarning:
    "Steam Workshop content is managed by Steam and can be overwritten on the next update. Copy the mod into your local mods folder for lasting changes.",
  modMissingLua: "No mod.lua",
  modDuplicate: "Duplicate of {path}",
  modsFound: "{count} mods found",
  noModsFound: "No mods found yet",
  noModsFoundDescription: "Detect TF2 paths first, then scan the mod library.",
  exportZip: "Export ZIP package",
  busyExportZip: "Exporting ZIP…",
  noticeExportZip: "Exported package to {path}.",
  installStaging: "Install to staging_area",
  busyArchiveLog: "Archiving stdout.txt…",
  noticeLogArchived: "stdout.txt archived to {path}.",
  logFilesTitle: "Available logs",
  refreshLogFiles: "Refresh log list",
  projectType: "Project type",
  projectTypeEmpty: "Empty / expert",
  projectTypeScript: "Script mod",
  projectTypeVehicle: "Vehicle",
  projectTypeRepaint: "Repaint",
  projectTypeAsset: "Asset",
  projectTypeStation: "Station",
  hybridOption: "Hybrid (vanilla + optional CommonAPI2)",
  vanillaOption: "Vanilla"

} as const;

type TranslationKey = keyof typeof english;
type TranslationCatalog = Record<TranslationKey, string>;
type TranslationValues = Record<string, string | number>;

const german: TranslationCatalog = {
  languageControl: "Oberflächensprache",
  german: "Deutsch",
  english: "Englisch",
  nativeReady: "Desktop bereit",
  uiPreview: "Browser-Vorschau",
  noTelemetry: "Nur lokal · keine Telemetrie",
  authorLine: "von Mike Hering · GPL-3.0",
  mainNavigation: "Hauptnavigation",
  backToMainView: "Zurück zur Hauptansicht",
  operationLevel: "Detailstufe",
  beginner: "Standard",
  expert: "Erweitert",
  lightTheme: "Helles Design verwenden",
  darkTheme: "Dunkles Design verwenden",
  open: "Öffnen",
  newModProject: "Neues Projekt",
  activeProject: "Aktuelles Projekt",
  noProjectOpen: "Kein Projekt geöffnet.",
  navWorkspace: "Editor",
  navDiagnostics: "Prüfung",
  navInstall: "Installation",
  navLogs: "Spielprotokoll",
  navSavegames: "Spielstände",
  saveTitle: "Mod-Auswahl und Ladereihenfolge",
  saveDescription:
    "Auslesen, welche Mods ein Spielstand nutzte, Abhängigkeiten prüfen und ein Preset mit gültiger Ladereihenfolge schreiben. Spielstände werden nie verändert.",
  saveNeedsLibrary: "Erst die Mod-Bibliothek scannen, damit Abhängigkeiten geprüft werden können.",
  saveRefresh: "Spielstände einlesen",
  saveRefreshHint: "Auf „Spielstände einlesen“ drücken.",
  saveGames: "Spielstände",
  saveNone: "Keine Spielstände gefunden.",
  savePresets: "Vorhandene Presets",
  savePresetsNone: "Noch keine Presets.",
  savePresetName: "Preset-Name",
  saveWritePreset: "Preset schreiben",
  saveSelected: "{count} von {total} Mods ausgewählt",
  saveNothingSelected: "Mods auswählen oder aus Spielstand bzw. Preset laden.",
  saveModsRead: "{matched} installierte Mods aus {candidates} Kopfeinträgen erkannt.",
  presetLoaded: "{matched} von {total} Preset-Einträgen sind installiert.",
  presetWritten: "Preset geschrieben: {path}",
  saveOrderCount: "{count} Mods in Ladereihenfolge",
  saveAdded: "{count} als Abhängigkeit ergänzt",
  saveMissing: "{count} Abhängigkeiten fehlen",
  saveUnverifiable: "{count} nicht prüfbar",
  saveAutoAdded: "automatisch ergänzt",
  saveOrderTitle: "Ladereihenfolge",
  saveChooseMods: "Mods manuell wählen",
  saveCycle: "Zirkuläre Abhängigkeit — es gibt keine gültige Reihenfolge",
  saveMissingTitle: "Diese Mods müssen noch installiert werden",
  saveMissingHint:
    "Jede Zeile nennt die benötigte ID und die Mod, die sie braucht. Workshop-Mods liegen in numerischen Ordnern, eine davon könnte also bereits unter anderem Ordnernamen installiert sein.",
  saveNeededBy: "gebraucht von {mod}",
  saveUnverifiableTitle: "{count} Angaben konnten nicht geprüft werden",
  saveUnverifiableHint:
    "Der Autor hat einen Download-Link oder einen unbrauchbaren Wert statt einer Mod-ID eingetragen; dagegen lässt sich nichts abgleichen.",
  saveSafetyNote:
    "Spielstände werden nur gelesen. Die Ladereihenfolge landet in mod_presets, das du in der Mod-Liste des Spiels auswählst.",
  navSetup: "Spielpfade",
  busyIndexProject: "Projekt wird eingelesen…",
  busyOpenFolderPicker: "Ordnerdialog wird geöffnet…",
  busyCreateProject: "Projekt wird erstellt…",
  busyReadFile: "Datei wird gelesen…",
  busySaveFile: "Datei wird gespeichert…",
  busyInstall: "Mod wird installiert…",
  busyOpenLogPicker: "Protokolldialog wird geöffnet…",
  busyAnalyzeLog: "Spielprotokoll wird analysiert…",
  busyDetectInstallations: "Transport Fever 2 wird gesucht…",
  busyLaunchGame: "Transport Fever 2 wird gestartet…",
  dialogSelectProject: "Mod-Projektordner auswählen",
  dialogSelectParent: "Übergeordneten Ordner für das neue Projekt auswählen",
  dialogSelectModsDirectory:
    "Transport-Fever-2-Mods-Ordner auswählen",
  dialogSelectLog: "stdout.txt auswählen",
  dialogLogFilter: "Protokolldateien",
  noticeFilesLoaded: "{count} Projektdateien geladen.",
  noticeBinaryFile:
    "Binärdateien werden gelistet, aber nicht als Text geöffnet.",
  noticeFileSaved: "{path} gespeichert (Sicherung angelegt).",
  confirmDiscardChanges:
    "Ungespeicherte Änderungen an {path} verwerfen?",
  confirmRescan:
    "Vom Datenträger neu laden und ungespeicherte Änderungen verwerfen?",
  noticeInstallBlocked:
    "Behebe bestätigte Prüf­fehler, bevor du installierst.",
  noticeChooseModsDirectory: "Wähle zuerst einen Mods-Ordner.",
  noticeFilesInstalled:
    "{count} Dateien installiert. mod.lua geprüft.",
  noticeNoInstallation:
    "Keine Transport-Fever-2-Installation an bekannten Steam-Pfaden gefunden.",
  noticeInstallationsDetected: "{count} Installation(en) gefunden.",
  confirmLaunch:
    "Transport Fever 2 jetzt starten?",
  noticeGameLaunched:
    "Transport Fever 2 gestartet (Prozess {processId}).",
  projectFiles: "Projektdateien",
  filesCount: "{count} Dateien",
  rescanProject: "Neu einlesen",
  indexed: "{size} indexiert",
  closeTab: "{path} schließen",
  save: "Speichern",
  selectFile: "Keine Datei ausgewählt",
  selectFileDescription:
    "Wähle links eine Lua-, Konfigurations- oder Textdatei.",
  editorLoading: "Editor wird geladen…",
  noFileOpen: "Keine Datei geöffnet",
  unsavedCount: "{count} ungespeichert",
  diskState: "Auf Datenträger",
  errors: "Fehler",
  warnings: "Warnungen",
  allDiagnostics: "Alle Befunde",
  welcomeEyebrow: "Transport Fever 2",
  welcomeTitle: "Mods erstellen, prüfen und installieren.",
  welcomeDescription:
    "Arbeite direkt mit lokalen Mod-Ordnern. Spieldateien bleiben schreibgeschützt. Es werden keine Beispieldaten erfunden.",
  createModProject: "Neues Projekt",
  openExistingMod: "Projekt öffnen",
  previewExplanation:
    "Diese Browser-Ansicht ist nur zur Anzeige. Nutze die Desktop-App für lokale Ordner.",
  workflowEyebrow: "Ablauf",
  workflowProject: "Projekt",
  workflowProjectDescription: "Mod-Ordner anlegen oder öffnen",
  workflowValidation: "Prüfung",
  workflowValidationDescription: "Lua, Pfade und Referenzen prüfen",
  workflowInstallation: "Installation",
  workflowInstallationDescription: "Mit Sicherung in den Mods-Ordner kopieren",
  workflowTestRun: "Test",
  workflowTestRunDescription: "Spiel bei Bedarf starten",
  workflowLog: "Protokoll",
  workflowLogDescription: "stdout.txt auf Ursachen prüfen",
  noValidationBase: "Kein Projekt geöffnet",
  noValidationBaseDescription:
    "Öffne ein Mod-Projekt für die statische Prüfung von Struktur, Lua und Ressourcen.",
  noFindings: "Keine Probleme gefunden",
  noFindingsDescription:
    "Die aktuellen Prüfregeln melden keine Fehler oder Warnungen für dieses Projekt.",
  staticAnalysis: "Prüfung",
  diagnosticsTitle: "Prüfergebnisse",
  diagnosticsDescription:
    "Jeder Befund ist als bestätigt, empfehlungsbasiert oder heuristisch gekennzeichnet.",
  project: "Projekt",
  line: "Zeile {line}",
  cause: "Ursache",
  correction: "Lösung",
  certaintyConfirmed: "Bestätigt",
  certaintyOfficialGuidance: "Empfehlung",
  certaintyHeuristic: "Heuristik",
  localInstallation: "Installationsziel",
  installTitle: "In den Mods-Ordner installieren",
  installDescription:
    "Vorhandene Mods werden nicht ohne Bestätigung ersetzt. Zuerst wird eine Sicherung angelegt.",
  localModsDirectory: "Mods-Ordner",
  noTargetSelected: "Kein Ordner ausgewählt",
  select: "Auswählen",
  overwriteExisting:
    "Vorhandene Installation ersetzen (zuerst sichern)",
  installModLocally: "Mod installieren",
  installationVerified: "Installation geprüft",
  installationGate: "Installationsbereitschaft",
  approved: "Bereit",
  blocked: "Blockiert",
  gateNoProject: "Zuerst ein Projekt öffnen.",
  gateApproved:
    "Keine bestätigten Fehler. Installation freigegeben.",
  gateBlocked: "{count} bestätigte Fehler müssen zuerst behoben werden.",
  checkRootModLua: "Root-mod.lua vorhanden",
  checkLuaParsable: "Lua ist parsbar",
  checkPathCollision: "Keine Pfadkollisionen",
  checkResourceCase: "Ressourcen-Großschreibung konsistent",
  realGameLogs: "Spielprotokoll",
  logsTitle: "Problemanalyse (stdout.txt)",
  selectLog: "Protokoll öffnen…",
  noLogLoaded: "Kein Protokoll geladen",
  noLogLoadedDescription:
    "Öffne die aktuelle stdout.txt. Unbekannte Meldungen bleiben unklassifiziert, statt Ursachen zu erfinden.",
  logLine: "Zeile {line}",
  modReference: "Mod {modId}",
  noFileAssigned: "Keine Datei verknüpft",
  causeUnclassified: "Unklassifiziert",
  logCausalityReliable: "Ursachenanalyse vollständig",
  logCausalityUnconfirmed: "Teilanalyse — einige Fehler unklassifiziert",
  logRootCauseCount: "{count} Grundursache(n)",
  logConsequenceCount: "{count} Folgefehler",
  logUnclassifiedCount: "{count} unklassifiziert",
  logRootCause: "Grundursache",
  logConsequence: "Folgefehler",
  logStackFrames: "{count} Stackframe(s)",
  severityError: "Fehler",
  severityWarning: "Warnung",
  severityInfo: "Info",
  platformAdapter: "Installation",
  setupTitle: "Erkannte Spielpfade",
  checkDefaultPaths: "Erneut scannen",
  noInstallationDetected: "Keine Installation gefunden",
  noInstallationDetectedDescription:
    "Steam-Standardpfade wurden geprüft. Ordner kannst du weiterhin manuell unter Installation und Protokoll wählen.",
  installationSourceSteam: "Steam",
  installationSourceManual: "Manuell",
  valid: "OK",
  invalid: "Unvollständig",
  installationMissingReason:
    "Programmdatei oder Spiel-Ressourcenordner fehlt.",
  launchTestRun: "Spiel starten",
  guidedProjectCreation: "Neues Projekt",
  createDialogTitle: "Mod-Projekt anlegen",
  closeDialog: "Schließen",
  parentWorkspaceFolder: "Übergeordneter Ordner",
  selectFolder: "Ordner auswählen…",
  projectId: "Projekt-ID",
  projectIdHint: "Kleinbuchstaben, eindeutig, endet mit Major-Version (beispiel_mod_1).",
  projectMode: "Modus",
  commonApiOption: "CommonAPI2",
  displayName: "Anzeigename",
  displayNamePlaceholder: "Meine Mod",
  author: "Autor",
  authorPlaceholder: "Autorname",
  createDialogInfo:
    "Erstellt mod.lua, strings.lua, Doku und Studio-Konfiguration. Vorhandene Ordner werden nicht überschrieben.",
  cancel: "Abbrechen",
  createProjectSafely: "Projekt anlegen",
  fontSizeControl: "UI-Schriftgröße",
  fontSizeValue: "{size}px",
  openLatestLog: "Aktuelle stdout.txt öffnen",
  analyzeSelectedLog: "Ausgewähltes Protokoll analysieren",
  detectedPaths: "Erkannte Pfade",
  pathGame: "Spiel",
  pathUserData: "Benutzerdaten",
  pathMods: "Mods",
  pathStdout: "stdout.txt",
  pathMissing: "Nicht gefunden",
  useDetectedMods: "Als Installationsziel verwenden",
  noticeAutoDetected: "Spielpfade erkannt. Mods-Ordner und Protokollpfad wurden automatisch gesetzt, sofern vorhanden.",
  noticeLogLoaded: "{path} analysiert.",
  logReliabilityDetail: "{reason}",
  showCauseAlways: "Ursache",
  openZipMod: "ZIP-Mod öffnen",
  importZipMod: "ZIP in Mods-Ordner importieren",
  dialogSelectZip: "Transport-Fever-2-Mod-ZIP auswählen",
  dialogZipFilter: "ZIP-Archive",
  dialogSelectExportTarget: "Mod-ZIP speichern unter",
  busyInspectZip: "ZIP-Mod wird geprüft…",
  busyImportZip: "ZIP-Mod wird importiert…",
  noticeZipInspected: "ZIP-Mod erkannt: {projectId} ({count} Dateien).",
  noticeZipImported: "{projectId} ({count} Dateien) in den Mods-Ordner importiert.",
  noticeChooseModsForZip: "Wähle vor dem ZIP-Import einen Mods-Ordner.",
  logShowProblems: "Nur Probleme",
  logShowAll: "Alle Meldungen",
  logNoiseSkipped: "{count} Rauschzeilen ausgeblendet",
  logOpenDetails: "Details",
  logAffectedFiles: "Betroffene Dateien",
  logAffectedMods: "Betroffene Mods",
  askAi: "KI fragen",
  navAi: "KI",
  updateChecking: "Suche nach Updates…",
  updateAvailable: "Update {version} ist verfügbar",
  updateAvailableTitle: "Version {version} ist verfügbar",
  updateAvailableBody:
    "Installiert ist {current}. Die Installation ersetzt das aktuelle Paket und erfordert einen Neustart.",
  updateInstall: "Jetzt installieren",
  updateInstalledRestart: "Installiert. Zum Verwenden neu starten.",
  updateRestart: "Jetzt neu starten",
  updateDismiss: "Update-Hinweis schließen",
  updateAvailableOnce:
    "Update {version} ist verfügbar (installiert: {current}). Bitte manuell von GitHub Releases installieren — Auto-Update ist deaktiviert, um Neustart-Schleifen zu vermeiden.",
  updateInstalling: "Update {version} wird heruntergeladen und installiert…",
  updateInstalled: "Update installiert. Bitte die Anwendung manuell neu starten.",
  updateFailed: "Update fehlgeschlagen: {error}",
  updateUpToDate: "Du hast die neueste Version ({version}).",
  updateNotes: "Versionshinweise",
  navManage: "Mod-Bibliothek",
  manageTitle: "Installierte Mods",
  manageDescription: "Lokale, Staging- und Workshop-Ordner deiner TF2-Installation.",
  scanModLibrary: "Mod-Bibliothek scannen",
  modSource: "Quelle",
  modSourceLocal: "Lokale Mods",
  modSourceWorkshop: "Steam Workshop",
  modSourceStaging: "Staging-Bereich",
  modSourceBuiltin: "Mit dem Spiel geliefert",
  modsInSource: "{count} Mods",
  modFiles: "{count} Dateien",
  modHealthOk: "In Ordnung",
  modHealthWarning: "Läuft mit Mängeln",
  modHealthError: "Wird nicht geladen",
  modInfo: "Info",
  modMaximize: "Vollbild",
  modRestore: "Vollbild verlassen (Esc)",
  modFindingCount: "{count} Befund(e)",
  modNoProvenFindings:
    "Kein belegbarer Mangel in mod.lua. Ressourcen- und Pfadprüfungen brauchen einen vollständigen Projekt-Scan.",
  modUnprovenCount: "{count} Prüfung(en) nicht belegbar",
  modUnprovenNote:
    "Diese Hinweise besagen, dass etwas statisch nicht überprüfbar war — meist ein Callback in einer anderen Datei. Sie bedeuten nicht, dass die Mod defekt ist, und beeinflussen die Ampel nie.",
  modelViewer: "3D-Ansicht",
  modelLoading: "Modell wird geladen…",
  modelParseFailed:
    "Diese .mdl berechnet ihre Werte zur Laufzeit (require \"transf\"). Statisches Lesen kann sie nicht auflösen; das Lua wird nie ausgeführt.",
  modelFit: "Einpassen",
  modelFitHint: "Modell ins Blickfeld rücken",
  modelGrid: "Raster",
  modelAxes: "Achsen",
  modelAutoRotate: "Automatisch drehen",
  modelLightBackground: "Heller Hintergrund",
  modelParts: "{count} Teile — ein- oder ausblenden",
  modelSize: "Maße {x} × {y} × {z} m",
  modelLod: "Detailstufe",
  modelLodOption: "LOD {index} · {count} Teil(e)",
  modelWireframe: "Drahtgitter",
  modelShowBounds: "Grenzen und Collider",
  modelStats: "{parts} Teil(e) · {triangles} Dreiecke",
  modelCollider: "Collider: {type}",
  modelMissingMeshes: "{count} Mesh(es) stammen aus dem Basisspiel und liegen nicht in dieser Mod",
  modelNoModels: "Diese Mod enthält keine .mdl-Modelle.",
  modelSelect: "Modell",
  modEditFiles: "Dateien bearbeiten",
  modEditNoTextFiles:
    "Diese Mod hat keine bearbeitbaren Textdateien. Meshes, Texturen und Sounds brauchen eigene Editoren.",
  modEditWorkshopWarning:
    "Steam-Workshop-Inhalte verwaltet Steam; Änderungen können beim nächsten Update überschrieben werden. Kopiere die Mod für dauerhafte Änderungen in deinen lokalen Mods-Ordner.",
  modMissingLua: "Keine mod.lua",
  modDuplicate: "Duplikat von {path}",
  modsFound: "{count} Mods gefunden",
  noModsFound: "Noch keine Mods gefunden",
  noModsFoundDescription: "Zuerst TF2-Pfade erkennen, dann die Bibliothek scannen.",
  exportZip: "ZIP-Paket exportieren",
  busyExportZip: "ZIP wird exportiert…",
  noticeExportZip: "Paket exportiert nach {path}.",
  installStaging: "In staging_area installieren",
  busyArchiveLog: "stdout.txt wird archiviert…",
  noticeLogArchived: "stdout.txt archiviert unter {path}.",
  logFilesTitle: "Verfügbare Protokolle",
  refreshLogFiles: "Protokolliste aktualisieren",
  projectType: "Projektart",
  projectTypeEmpty: "Leer / Experte",
  projectTypeScript: "Script-Mod",
  projectTypeVehicle: "Fahrzeug",
  projectTypeRepaint: "Repaint",
  projectTypeAsset: "Asset",
  projectTypeStation: "Bahnhof",
  hybridOption: "Hybrid (Vanilla + optional CommonAPI2)",
  vanillaOption: "Vanilla"

};

const catalogs: Record<Language, TranslationCatalog> = {
  de: german,
  en: english
};

export type Translator = (
  key: TranslationKey,
  values?: TranslationValues
) => string;

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translator;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

function initialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "de" || stored === "en") return stored;
  } catch {
    // Storage can be disabled; system language remains a safe fallback.
  }
  return window.navigator.language.toLowerCase().startsWith("de")
    ? "de"
    : "en";
}

function interpolate(template: string, values?: TranslationValues): string {
  if (values === undefined) return template;
  return template.replace(/\{(\w+)\}/gu, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // The selected language still applies to the current session.
    }
  }, [language]);

  const t = useCallback<Translator>(
    (key, values) => interpolate(catalogs[language][key], values),
    [language]
  );
  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (value === undefined) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return value;
}

export function localizedCertainty(
  certainty: Diagnostic["certainty"],
  t: Translator
): string {
  if (certainty === "confirmed") return t("certaintyConfirmed");
  if (certainty === "official-guidance") {
    return t("certaintyOfficialGuidance");
  }
  return t("certaintyHeuristic");
}

export function localizedSeverity(
  severity: "error" | "warning" | "info",
  t: Translator
): string {
  if (severity === "error") return t("severityError");
  if (severity === "warning") return t("severityWarning");
  return t("severityInfo");
}

export function localizedInstallationSource(
  source: string,
  t: Translator
): string {
  if (source === "steam-default") return t("installationSourceSteam");
  if (source === "manual") return t("installationSourceManual");
  return source;
}

export function localizedModSource(source: string, t: Translator): string {
  if (source === "local") return t("modSourceLocal");
  if (source === "workshop") return t("modSourceWorkshop");
  if (source === "staging") return t("modSourceStaging");
  if (source === "builtin") return t("modSourceBuiltin");
  return source;
}

export function localizedInstallationReason(
  reason: string,
  t: Translator
): string {
  if (
    reason ===
    "Expected executable or game resource directory is missing."
  ) {
    return t("installationMissingReason");
  }
  return reason;
}
