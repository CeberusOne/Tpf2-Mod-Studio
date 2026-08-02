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
  mainNavigation: "Main navigation",
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
  aiAssist: "Optional AI help",
  aiEnabled: "Use optional AI assist",
  aiBaseUrl: "API base URL (your choice)",
  aiApiKey: "API key",
  aiModel: "Model name (your choice)",
  aiBaseUrlHint:
    "Optional. Any OpenAI-compatible endpoint you prefer (cloud or local). Leave empty to work without AI.",
  aiSaved: "Save AI settings",
  aiNotConfigured:
    "AI is optional. Enter your own API details under Game paths only if you want help.",
  aiWorking: "Asking AI…",
  aiResponse: "AI response",
  aiClear: "Clear AI answer",
  navAi: "AI",
  aiOptionalNote:
    "AI is never required. The Studio works fully without any API key.",
  aiBaseUrlPlaceholder: "https://…/v1",
  aiModelPlaceholder: "your-model-id",
  updateChecking: "Checking for updates…",
  updateAvailable: "Update {version} is available",
  updateInstalling: "Downloading and installing update {version}…",
  updateInstalled: "Update installed. Restarting…",
  updateFailed: "Update failed: {error}",
  updateUpToDate: "You are on the latest version ({version}).",
  updateNotes: "Release notes"

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
  mainNavigation: "Hauptnavigation",
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
  aiAssist: "Optionale KI-Hilfe",
  aiEnabled: "Optionale KI-Hilfe nutzen",
  aiBaseUrl: "API-Basis-URL (frei wählbar)",
  aiApiKey: "API-Schlüssel",
  aiModel: "Modellname (frei wählbar)",
  aiBaseUrlHint:
    "Optional. Beliebiger OpenAI-kompatibler Endpunkt (Cloud oder lokal). Leer lassen = ohne KI arbeiten.",
  aiSaved: "KI-Einstellungen speichern",
  aiNotConfigured:
    "KI ist optional. Nur unter Spielpfade eigene API-Daten eintragen, wenn du sie nutzen willst.",
  aiWorking: "KI wird befragt…",
  aiResponse: "KI-Antwort",
  aiClear: "KI-Antwort löschen",
  navAi: "KI",
  aiOptionalNote:
    "KI ist nie Pflicht. Das Studio funktioniert vollständig ohne API-Schlüssel.",
  aiBaseUrlPlaceholder: "https://…/v1",
  aiModelPlaceholder: "dein-modell-id",
  updateChecking: "Suche nach Updates…",
  updateAvailable: "Update {version} ist verfügbar",
  updateInstalling: "Update {version} wird heruntergeladen und installiert…",
  updateInstalled: "Update installiert. Neustart…",
  updateFailed: "Update fehlgeschlagen: {error}",
  updateUpToDate: "Du hast die neueste Version ({version}).",
  updateNotes: "Versionshinweise"

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
