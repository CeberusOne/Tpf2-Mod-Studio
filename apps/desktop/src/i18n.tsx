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
  nativeReady: "Desktop bridge ready",
  uiPreview: "UI preview",
  noTelemetry: "No telemetry · local data",
  mainNavigation: "Main navigation",
  operationLevel: "Experience level",
  beginner: "Beginner",
  expert: "Expert",
  lightTheme: "Use light theme",
  darkTheme: "Use dark theme",
  open: "Open",
  newModProject: "New mod project",
  activeProject: "Active project",
  noProjectOpen: "No project open yet.",
  navWorkspace: "Workspace",
  navDiagnostics: "Diagnostics",
  navInstall: "Build & installation",
  navLogs: "Logs",
  navSetup: "TF2 setup",
  busyIndexProject: "Indexing project",
  busyOpenFolderPicker: "Opening folder picker",
  busyCreateProject: "Creating project safely",
  busyReadFile: "Reading file",
  busySaveFile: "Saving file atomically",
  busyInstall: "Verifying and installing mod",
  busyOpenLogPicker: "Opening log picker",
  busyAnalyzeLog: "Analyzing stdout.txt",
  busyDetectInstallations: "Detecting installations",
  busyLaunchGame: "Launching Transport Fever 2",
  dialogSelectProject: "Select a Transport Fever 2 mod project",
  dialogSelectParent: "Select the parent project folder",
  dialogSelectModsDirectory: "Select the local Transport Fever 2 mods folder",
  dialogSelectLog: "Select Transport Fever 2 stdout.txt",
  dialogLogFilter: "TF2 logs",
  noticeFilesLoaded: "{count} real files loaded.",
  noticeBinaryFile:
    "Binary files are indexed but are not opened as text in this version.",
  noticeFileSaved: "{path} saved; a backup was created.",
  confirmDiscardChanges: "Discard unsaved changes to {path}?",
  confirmRescan:
    "There are unsaved changes. Reload from disk anyway?",
  noticeInstallBlocked:
    "Installation is blocked while confirmed errors remain.",
  noticeChooseModsDirectory: "Select a local mods folder first.",
  noticeFilesInstalled:
    "{count} files installed and mod.lua verified.",
  noticeNoInstallation:
    "No installation was detected at the known default paths.",
  noticeInstallationsDetected: "{count} installation(s) detected.",
  confirmLaunch:
    "Launch Transport Fever 2 now for a manual test run?",
  noticeGameLaunched:
    "Transport Fever 2 was launched as process {processId}.",
  projectFiles: "Project files",
  filesCount: "{count} files",
  rescanProject: "Rescan project",
  indexed: "{size} indexed",
  closeTab: "Close {path}",
  save: "Save",
  selectFile: "Select a file",
  selectFileDescription:
    "Open a Lua, configuration, or text file on the left. Binary resources remain unchanged.",
  editorLoading: "Loading editor",
  noFileOpen: "No file open",
  unsavedCount: "{count} unsaved",
  diskState: "On-disk state",
  errors: "Errors",
  warnings: "Warnings",
  allDiagnostics: "All diagnostics",
  welcomeEyebrow: "Standalone TF2 development environment",
  welcomeTitle: "From the first file to a real test run.",
  welcomeDescription:
    "Work directly with your local Transport Fever 2 mods. The Studio does not load sample data and does not modify the game's base resources.",
  createModProject: "Create mod project",
  openExistingMod: "Open existing mod",
  previewExplanation:
    "This browser preview only shows the interface. Start the Tauri desktop window to select local folders.",
  workflowEyebrow: "Active vertical slice",
  workflowProject: "Project",
  workflowProjectDescription: "TF2-compliant base structure",
  workflowValidation: "Validation",
  workflowValidationDescription: "Lua, paths, and letter case",
  workflowInstallation: "Installation",
  workflowInstallationDescription: "Copy safely and verify",
  workflowTestRun: "Test run",
  workflowTestRunDescription: "Launch the game only on your action",
  workflowLog: "Log",
  workflowLogDescription: "Group and assign stdout.txt",
  noValidationBase: "Nothing to validate",
  noValidationBaseDescription:
    "Open a real mod project to statically validate its structure, Lua, and resource references.",
  noFindings: "No findings",
  noFindingsDescription:
    "The implemented validation rules found no errors or warnings in the current project state.",
  staticAnalysis: "Static analysis",
  diagnosticsTitle: "Evidence-based findings instead of broad assumptions",
  diagnosticsDescription:
    "Each finding states whether it is confirmed, official guidance, or heuristic.",
  project: "Project",
  line: "Line {line}",
  cause: "Cause:",
  correction: "Fix:",
  certaintyConfirmed: "Confirmed",
  certaintyOfficialGuidance: "Official guidance",
  certaintyHeuristic: "Heuristic",
  localInstallation: "Local installation",
  installTitle: "Validate, back up, copy, verify.",
  installDescription:
    "The destination is never overwritten silently. Development files and internal backups are excluded.",
  localModsDirectory: "Local TF2 mods folder",
  noTargetSelected: "No destination selected yet",
  select: "Select",
  overwriteExisting:
    "Explicitly replace the existing version and back it up first",
  installModLocally: "Install mod locally",
  installationVerified: "Installation verified",
  installationGate: "Installation gate",
  approved: "Approved",
  blocked: "Blocked",
  gateNoProject: "No project is open.",
  gateApproved:
    "No confirmed errors were found by the implemented validation rules.",
  gateBlocked: "{count} confirmed error(s) must be fixed first.",
  checkRootModLua: "Root mod.lua exists",
  checkLuaParsable: "Lua is statically parsable",
  checkPathCollision: "No portable path collision",
  checkResourceCase: "Consistent resource letter case",
  realGameLogs: "Real game logs",
  logsTitle: "stdout.txt without invented causes",
  selectLog: "Select log",
  noLogLoaded: "No log loaded",
  noLogLoadedDescription:
    "Select the current or a saved `stdout.txt`. Unknown messages remain explicitly unclassified.",
  logLine: "Log line {line}",
  modReference: "Mod {modId}",
  noFileAssigned: "No file assigned",
  causeUnclassified: "Cause unclassified",
  logCausalityReliable: "Causal assignment supported",
  logCausalityUnconfirmed: "Causal assignment not reliable",
  logRootCauseCount: "{count} root cause(s)",
  logConsequenceCount: "{count} consequence(s)",
  logUnclassifiedCount: "{count} unclassified error(s)",
  logRootCause: "Root cause",
  logConsequence: "Consequence",
  logStackFrames: "{count} stack frame(s)",
  severityError: "Error",
  severityWarning: "Warning",
  severityInfo: "Info",
  platformAdapter: "Platform adapter",
  setupTitle: "Transport Fever 2 installation",
  checkDefaultPaths: "Check default paths",
  noInstallationDetected: "No installation detected yet",
  noInstallationDetectedDescription:
    "Detection checks only real default paths. Manually selected installations will be persisted in a later version.",
  installationSourceSteam: "Steam default",
  installationSourceManual: "Manual",
  valid: "valid",
  invalid: "invalid",
  installationMissingReason:
    "The expected executable or game resource folder is missing.",
  launchTestRun: "Explicitly launch test run",
  guidedProjectCreation: "Guided project creation",
  createDialogTitle: "New TF2 mod project",
  closeDialog: "Close dialog",
  parentWorkspaceFolder: "Parent workspace folder",
  selectFolder: "Select folder",
  projectId: "Project ID",
  projectIdHint: "Lowercase, unique name, major version.",
  projectMode: "Project mode",
  commonApiOption: "CommonAPI2 (marked separately)",
  displayName: "Display name",
  displayNamePlaceholder: "My new mod",
  author: "Author",
  authorPlaceholder: "Mod author's name",
  createDialogInfo:
    "The Studio creates `mod.lua`, `strings.lua`, documentation, and an internal project configuration. Existing folders are not replaced.",
  cancel: "Cancel",
  createProjectSafely: "Create project safely"
} as const;

type TranslationKey = keyof typeof english;
type TranslationCatalog = Record<TranslationKey, string>;
type TranslationValues = Record<string, string | number>;

const german: TranslationCatalog = {
  languageControl: "Oberflächensprache",
  german: "Deutsch",
  english: "Englisch",
  nativeReady: "Desktop-Bridge bereit",
  uiPreview: "UI-Vorschau",
  noTelemetry: "Keine Telemetrie · lokale Daten",
  mainNavigation: "Hauptnavigation",
  operationLevel: "Bedienebene",
  beginner: "Einsteiger",
  expert: "Experte",
  lightTheme: "Helles Design verwenden",
  darkTheme: "Dunkles Design verwenden",
  open: "Öffnen",
  newModProject: "Neues Modprojekt",
  activeProject: "Aktives Projekt",
  noProjectOpen: "Noch kein Projekt geöffnet.",
  navWorkspace: "Arbeitsbereich",
  navDiagnostics: "Diagnosen",
  navInstall: "Build & Installation",
  navLogs: "Protokolle",
  navSetup: "TF2-Einrichtung",
  busyIndexProject: "Projekt wird indexiert",
  busyOpenFolderPicker: "Ordnerauswahl wird geöffnet",
  busyCreateProject: "Projekt wird sicher angelegt",
  busyReadFile: "Datei wird gelesen",
  busySaveFile: "Datei wird atomar gespeichert",
  busyInstall: "Mod wird verifiziert und installiert",
  busyOpenLogPicker: "Protokollauswahl wird geöffnet",
  busyAnalyzeLog: "stdout.txt wird analysiert",
  busyDetectInstallations: "Installationen werden gesucht",
  busyLaunchGame: "Transport Fever 2 wird gestartet",
  dialogSelectProject: "Transport-Fever-2-Modprojekt auswählen",
  dialogSelectParent: "Übergeordneten Projektordner auswählen",
  dialogSelectModsDirectory:
    "Lokales Transport-Fever-2-Modverzeichnis auswählen",
  dialogSelectLog: "Transport Fever 2 stdout.txt auswählen",
  dialogLogFilter: "TF2-Protokolle",
  noticeFilesLoaded: "{count} reale Dateien geladen.",
  noticeBinaryFile:
    "Binärdateien werden indexiert, aber in dieser Version nicht als Text geöffnet.",
  noticeFileSaved: "{path} gespeichert; eine Sicherung wurde angelegt.",
  confirmDiscardChanges:
    "Ungespeicherte Änderungen an {path} verwerfen?",
  confirmRescan:
    "Es gibt ungespeicherte Änderungen. Trotzdem neu vom Datenträger einlesen?",
  noticeInstallBlocked:
    "Installation ist blockiert, solange bestätigte Fehler offen sind.",
  noticeChooseModsDirectory: "Wähle zuerst ein lokales Modverzeichnis.",
  noticeFilesInstalled:
    "{count} Dateien installiert und mod.lua verifiziert.",
  noticeNoInstallation:
    "Keine Installation an den bekannten Standardpfaden erkannt.",
  noticeInstallationsDetected: "{count} Installation(en) erkannt.",
  confirmLaunch:
    "Transport Fever 2 jetzt für einen manuellen Testlauf starten?",
  noticeGameLaunched:
    "Transport Fever 2 wurde als Prozess {processId} gestartet.",
  projectFiles: "Projektdateien",
  filesCount: "{count} Dateien",
  rescanProject: "Projekt neu einlesen",
  indexed: "{size} indexiert",
  closeTab: "{path} schließen",
  save: "Speichern",
  selectFile: "Datei auswählen",
  selectFileDescription:
    "Öffne links eine Lua-, Konfigurations- oder Textdatei. Binärressourcen bleiben unverändert.",
  editorLoading: "Editor wird geladen",
  noFileOpen: "Keine Datei geöffnet",
  unsavedCount: "{count} ungespeichert",
  diskState: "Datenträgerstand",
  errors: "Fehler",
  warnings: "Warnungen",
  allDiagnostics: "Alle Diagnosen",
  welcomeEyebrow: "Eigenständige TF2-Entwicklungsumgebung",
  welcomeTitle: "Von der ersten Datei bis zum echten Testlauf.",
  welcomeDescription:
    "Arbeite direkt mit deinen lokalen Transport-Fever-2-Mods. Das Studio liest keine Beispieldaten ein und verändert keine Basisressourcen des Spiels.",
  createModProject: "Modprojekt anlegen",
  openExistingMod: "Vorhandenen Mod öffnen",
  previewExplanation:
    "Diese Browser-Vorschau zeigt ausschließlich die Oberfläche. Starte das Tauri-Desktopfenster, um lokale Ordner auszuwählen.",
  workflowEyebrow: "Aktiver Vertikalschnitt",
  workflowProject: "Projekt",
  workflowProjectDescription: "TF2-konforme Grundstruktur",
  workflowValidation: "Prüfung",
  workflowValidationDescription: "Lua, Pfade und Großschreibung",
  workflowInstallation: "Installation",
  workflowInstallationDescription: "Sicher kopieren und verifizieren",
  workflowTestRun: "Testlauf",
  workflowTestRunDescription: "Spielstart nur auf deine Aktion",
  workflowLog: "Protokoll",
  workflowLogDescription: "stdout.txt gruppieren und zuordnen",
  noValidationBase: "Keine Prüfbasis",
  noValidationBaseDescription:
    "Öffne ein echtes Modprojekt, um Struktur, Lua und Ressourcenreferenzen statisch zu prüfen.",
  noFindings: "Keine Befunde",
  noFindingsDescription:
    "Die implementierten Prüfregeln haben im aktuellen Projektstand keine Fehler oder Warnungen gefunden.",
  staticAnalysis: "Statische Analyse",
  diagnosticsTitle: "Belegte Befunde statt pauschaler Vermutungen",
  diagnosticsDescription:
    "Jeder Befund weist aus, ob er bestätigt, offiziell empfohlen oder heuristisch ist.",
  project: "Projekt",
  line: "Zeile {line}",
  cause: "Ursache:",
  correction: "Korrektur:",
  certaintyConfirmed: "Bestätigt",
  certaintyOfficialGuidance: "Offizielle Empfehlung",
  certaintyHeuristic: "Heuristisch",
  localInstallation: "Lokale Installation",
  installTitle: "Validieren, sichern, kopieren, verifizieren.",
  installDescription:
    "Das Ziel wird nie stillschweigend überschrieben. Entwicklungsdateien und interne Backups werden ausgeschlossen.",
  localModsDirectory: "Lokales TF2-Modverzeichnis",
  noTargetSelected: "Noch kein Ziel ausgewählt",
  select: "Auswählen",
  overwriteExisting:
    "Vorhandene Version ausdrücklich ersetzen und vorher sichern",
  installModLocally: "Mod lokal installieren",
  installationVerified: "Installation verifiziert",
  installationGate: "Installations-Gate",
  approved: "Freigegeben",
  blocked: "Blockiert",
  gateNoProject: "Es ist kein Projekt geöffnet.",
  gateApproved:
    "Keine bestätigten Fehler in den implementierten Prüfregeln.",
  gateBlocked: "{count} bestätigte Fehler müssen zuerst behoben werden.",
  checkRootModLua: "Root-mod.lua vorhanden",
  checkLuaParsable: "Lua statisch parsbar",
  checkPathCollision: "Keine portable Pfadkollision",
  checkResourceCase: "Ressourcen-Großschreibung konsistent",
  realGameLogs: "Reale Spielprotokolle",
  logsTitle: "stdout.txt ohne erfundene Ursachen",
  selectLog: "Protokoll auswählen",
  noLogLoaded: "Kein Protokoll geladen",
  noLogLoadedDescription:
    "Wähle die aktuelle oder eine gespeicherte `stdout.txt`. Unbekannte Meldungen bleiben ausdrücklich unklassifiziert.",
  logLine: "Protokollzeile {line}",
  modReference: "Mod {modId}",
  noFileAssigned: "Keine Datei zugeordnet",
  causeUnclassified: "Ursache unklassifiziert",
  logCausalityReliable: "Ursachenzuordnung belegt",
  logCausalityUnconfirmed: "Ursachenzuordnung nicht zuverlässig",
  logRootCauseCount: "{count} Grundursache(n)",
  logConsequenceCount: "{count} Folgefehler",
  logUnclassifiedCount: "{count} unklassifizierte Fehler",
  logRootCause: "Grundursache",
  logConsequence: "Folgefehler",
  logStackFrames: "{count} Stackframe(s)",
  severityError: "Fehler",
  severityWarning: "Warnung",
  severityInfo: "Info",
  platformAdapter: "Plattformadapter",
  setupTitle: "Transport-Fever-2-Installation",
  checkDefaultPaths: "Standardpfade prüfen",
  noInstallationDetected: "Noch keine Installation erkannt",
  noInstallationDetectedDescription:
    "Die Erkennung prüft nur reale Standardpfade. Manuell ausgewählte Installationen werden in einer späteren Version dauerhaft gespeichert.",
  installationSourceSteam: "Steam-Standard",
  installationSourceManual: "Manuell",
  valid: "gültig",
  invalid: "ungültig",
  installationMissingReason:
    "Die erwartete Programmdatei oder der Ressourcenordner des Spiels fehlt.",
  launchTestRun: "Testlauf ausdrücklich starten",
  guidedProjectCreation: "Geführte Projektanlage",
  createDialogTitle: "Neues TF2-Modprojekt",
  closeDialog: "Dialog schließen",
  parentWorkspaceFolder: "Übergeordneter Arbeitsordner",
  selectFolder: "Ordner auswählen",
  projectId: "Projekt-ID",
  projectIdHint: "Kleinbuchstaben, eindeutiger Name, Major-Version.",
  projectMode: "Projektmodus",
  commonApiOption: "CommonAPI2 (separat markiert)",
  displayName: "Anzeigename",
  displayNamePlaceholder: "Meine neue Mod",
  author: "Autor",
  authorPlaceholder: "Name des Modders",
  createDialogInfo:
    "Das Studio erzeugt `mod.lua`, `strings.lua`, Dokumentation und eine interne Projektkonfiguration. Vorhandene Ordner werden nicht ersetzt.",
  cancel: "Abbrechen",
  createProjectSafely: "Projekt sicher anlegen"
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
