import {
  Activity,
  AlertCircle,
  Box,
  CheckCircle2,
  ChevronRight,
  Code2,
  Database,
  FilePlus2,
  Files,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  Moon,
  PackageCheck,
  Play,
  RefreshCw,
  Save,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  TerminalSquare,
  TriangleAlert,
  X
} from "lucide-react";
import {
  buildResourceIndex,
  parseTf2Log,
  validateProject
} from "@tpf2-mod-studio/core";
import type {
  CreateProjectRequest,
  Diagnostic,
  InstallationCandidate,
  LogGroup,
  ProjectFile,
  ProjectMode,
  ProjectSnapshot,
  ResourceIndex
} from "@tpf2-mod-studio/core";
import {
  type FormEvent,
  type ReactNode,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState
} from "react";

import type { DesktopBridge } from "./bridge";
import { tauriBridge } from "./bridge";

const MonacoEditor = lazy(() => import("./MonacoEditor"));

type View = "workspace" | "diagnostics" | "install" | "logs" | "settings";
type ExperienceMode = "beginner" | "expert";
type Theme = "dark" | "light";

interface OpenTab {
  path: string;
  content: string;
  savedContent: string;
}

interface Notice {
  tone: "success" | "error" | "neutral";
  message: string;
}

interface AppProps {
  bridge?: DesktopBridge;
}

const EMPTY_CREATE_REQUEST: CreateProjectRequest = {
  parentDirectory: "",
  projectId: "",
  displayName: "",
  author: "",
  mode: "vanilla"
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

function editorLanguage(filePath: string): string {
  if (filePath.endsWith(".lua") || filePath.endsWith(".con")) return "lua";
  if (filePath.endsWith(".json")) return "json";
  if (filePath.endsWith(".md")) return "markdown";
  return "plaintext";
}

function fileName(filePath: string): string {
  return filePath.split("/").at(-1) ?? filePath;
}

function severityIcon(diagnostic: Diagnostic): ReactNode {
  if (diagnostic.severity === "error") return <AlertCircle size={16} />;
  if (diagnostic.severity === "warning") return <TriangleAlert size={16} />;
  return <CheckCircle2 size={16} />;
}

function NativeBadge({ native }: { native: boolean }) {
  return (
    <span className={`native-badge ${native ? "is-ready" : "is-preview"}`}>
      <span className="native-dot" />
      {native ? "Desktop-Bridge bereit" : "UI-Vorschau"}
    </span>
  );
}

function EmptyState({
  icon,
  title,
  children
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

export default function App({ bridge = tauriBridge }: AppProps) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [experience, setExperience] =
    useState<ExperienceMode>("beginner");
  const [view, setView] = useState<View>("workspace");
  const [snapshot, setSnapshot] = useState<ProjectSnapshot>();
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [createOpen, setCreateOpen] = useState(false);
  const [createRequest, setCreateRequest] =
    useState<CreateProjectRequest>(EMPTY_CREATE_REQUEST);
  const [modsDirectory, setModsDirectory] = useState("");
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [installResult, setInstallResult] = useState<string>();
  const [logPath, setLogPath] = useState("");
  const [logGroups, setLogGroups] = useState<LogGroup[]>([]);
  const [installations, setInstallations] = useState<InstallationCandidate[]>([]);

  const validation = useMemo(
    () => (snapshot === undefined ? undefined : validateProject(snapshot)),
    [snapshot]
  );
  const resourceIndex = useMemo<ResourceIndex | undefined>(
    () =>
      snapshot === undefined ? undefined : buildResourceIndex(snapshot),
    [snapshot]
  );
  const activeTab = tabs.find((tab) => tab.path === activePath);
  const dirtyCount = tabs.filter(
    (tab) => tab.content !== tab.savedContent
  ).length;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (notice === undefined) return undefined;
    const timer = window.setTimeout(() => setNotice(undefined), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function withBusy<T>(
    label: string,
    operation: () => Promise<T>
  ): Promise<T | undefined> {
    setBusy(label);
    try {
      return await operation();
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
      return undefined;
    } finally {
      setBusy(undefined);
    }
  }

  async function loadProject(rootPath: string): Promise<void> {
    const scanned = await withBusy("Projekt wird indexiert", () =>
      bridge.scanProject(rootPath)
    );
    if (scanned === undefined) return;
    setSnapshot(scanned);
    setTabs([]);
    setActivePath(undefined);
    setInstallResult(undefined);
    setView("workspace");
    setNotice({
      tone: "success",
      message: `${scanned.files.length} reale Dateien geladen.`
    });
  }

  async function chooseAndOpenProject(): Promise<void> {
    const selected = await withBusy("Ordnerauswahl wird geöffnet", () =>
      bridge.chooseDirectory("Transport-Fever-2-Modprojekt auswählen")
    );
    if (selected !== undefined && selected !== null) await loadProject(selected);
  }

  async function chooseCreateParent(): Promise<void> {
    const selected = await withBusy("Ordnerauswahl wird geöffnet", () =>
      bridge.chooseDirectory("Übergeordneten Projektordner auswählen")
    );
    if (selected !== undefined && selected !== null) {
      setCreateRequest((current) => ({
        ...current,
        parentDirectory: selected
      }));
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const created = await withBusy("Projekt wird sicher angelegt", () =>
      bridge.createProject(createRequest)
    );
    if (created === undefined) return;
    setCreateOpen(false);
    setCreateRequest(EMPTY_CREATE_REQUEST);
    await loadProject(created.rootPath);
  }

  async function openFile(file: ProjectFile): Promise<void> {
    if (!file.text) {
      setNotice({
        tone: "neutral",
        message: "Binärdateien werden indexiert, aber in diesem Slice nicht als Text geöffnet."
      });
      return;
    }
    const existing = tabs.find((tab) => tab.path === file.relativePath);
    if (existing !== undefined) {
      setActivePath(existing.path);
      return;
    }
    if (snapshot === undefined) return;
    const content =
      file.content ??
      (await withBusy("Datei wird gelesen", () =>
        bridge.readProjectFile(snapshot.rootPath, file.relativePath)
      ));
    if (content === undefined) return;
    setTabs((current) => [
      ...current,
      {
        path: file.relativePath,
        content,
        savedContent: content
      }
    ]);
    setActivePath(file.relativePath);
  }

  function updateActiveContent(content: string | undefined): void {
    if (content === undefined || activePath === undefined) return;
    setTabs((current) =>
      current.map((tab) =>
        tab.path === activePath ? { ...tab, content } : tab
      )
    );
  }

  async function saveActiveFile(): Promise<void> {
    if (
      snapshot === undefined ||
      activeTab === undefined ||
      activeTab.content === activeTab.savedContent
    ) {
      return;
    }
    const saved = await withBusy("Datei wird atomar gespeichert", async () => {
      await bridge.saveProjectFile(
        snapshot.rootPath,
        activeTab.path,
        activeTab.content
      );
      return true;
    });
    if (saved === undefined) return;
    setTabs((current) =>
      current.map((tab) =>
        tab.path === activeTab.path
          ? { ...tab, savedContent: tab.content }
          : tab
      )
    );
    const scanned = await bridge.scanProject(snapshot.rootPath);
    setSnapshot(scanned);
    setNotice({
      tone: "success",
      message: `${activeTab.path} gespeichert; Sicherung wurde angelegt.`
    });
  }

  function closeTab(path: string): void {
    const tab = tabs.find((candidate) => candidate.path === path);
    if (
      tab !== undefined &&
      tab.content !== tab.savedContent &&
      !window.confirm(`Ungespeicherte Änderungen an ${path} verwerfen?`)
    ) {
      return;
    }
    const nextTabs = tabs.filter((candidate) => candidate.path !== path);
    setTabs(nextTabs);
    if (activePath === path) setActivePath(nextTabs.at(-1)?.path);
  }

  async function rescanProject(): Promise<void> {
    if (snapshot === undefined) return;
    if (
      dirtyCount > 0 &&
      !window.confirm(
        "Es gibt ungespeicherte Änderungen. Trotzdem neu vom Datenträger einlesen?"
      )
    ) {
      return;
    }
    await loadProject(snapshot.rootPath);
  }

  async function chooseModsDirectory(): Promise<void> {
    const selected = await withBusy("Ordnerauswahl wird geöffnet", () =>
      bridge.chooseDirectory("Lokales Transport-Fever-2-Modverzeichnis auswählen")
    );
    if (selected !== undefined && selected !== null) setModsDirectory(selected);
  }

  async function installProject(): Promise<void> {
    if (snapshot === undefined || validation?.canInstall !== true) {
      setNotice({
        tone: "error",
        message: "Installation ist blockiert, solange bestätigte Fehler offen sind."
      });
      return;
    }
    if (modsDirectory.length === 0) {
      setNotice({
        tone: "error",
        message: "Wähle zuerst ein lokales Modverzeichnis."
      });
      return;
    }
    const result = await withBusy("Mod wird verifiziert und installiert", () =>
      bridge.installProject(
        snapshot.rootPath,
        modsDirectory,
        allowOverwrite
      )
    );
    if (result === undefined) return;
    setInstallResult(result.installedPath);
    setNotice({
      tone: "success",
      message: `${result.fileCount} Dateien installiert und mod.lua verifiziert.`
    });
  }

  async function chooseAndReadLog(): Promise<void> {
    const selected = await withBusy("Protokollauswahl wird geöffnet", () =>
      bridge.chooseLogFile()
    );
    if (selected === undefined || selected === null) return;
    const content = await withBusy("stdout.txt wird analysiert", () =>
      bridge.readLog(selected)
    );
    if (content === undefined) return;
    setLogPath(selected);
    setLogGroups(parseTf2Log(content));
  }

  async function detectInstallations(): Promise<void> {
    const candidates = await withBusy("Installationen werden gesucht", () =>
      bridge.detectInstallations()
    );
    if (candidates === undefined) return;
    setInstallations(candidates);
    setNotice({
      tone: candidates.length === 0 ? "neutral" : "success",
      message:
        candidates.length === 0
          ? "Keine Installation an den bekannten Standardpfaden erkannt."
          : `${candidates.length} Installation(en) erkannt.`
    });
  }

  async function launchGame(executablePath: string): Promise<void> {
    if (
      !window.confirm(
        "Transport Fever 2 jetzt für einen manuellen Testlauf starten?"
      )
    ) {
      return;
    }
    const processId = await withBusy("Transport Fever 2 wird gestartet", () =>
      bridge.launchGame(executablePath)
    );
    if (processId === undefined) return;
    setNotice({
      tone: "success",
      message: `Transport Fever 2 wurde als Prozess ${processId} gestartet.`
    });
  }

  function jumpToDiagnostic(diagnostic: Diagnostic): void {
    if (snapshot === undefined || diagnostic.file === undefined) return;
    const file = snapshot.files.find(
      (candidate) => candidate.relativePath === diagnostic.file
    );
    if (file !== undefined) {
      void openFile(file);
      setView("workspace");
    }
  }

  const navigation: Array<{
    id: View;
    label: string;
    icon: ReactNode;
    count?: number;
  }> = [
    { id: "workspace", label: "Arbeitsbereich", icon: <Code2 size={18} /> },
    {
      id: "diagnostics",
      label: "Diagnosen",
      icon: <ShieldCheck size={18} />,
      ...(validation === undefined
        ? {}
        : { count: validation.errorCount + validation.warningCount })
    },
    { id: "install", label: "Build & Installation", icon: <Box size={18} /> },
    { id: "logs", label: "Protokolle", icon: <ScrollText size={18} /> },
    { id: "settings", label: "TF2-Einrichtung", icon: <Settings size={18} /> }
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">T2</div>
          <div>
            <strong>Tpf2 Mod Studio</strong>
            <span>Desktop IDE · Alpha 0.1</span>
          </div>
        </div>

        <nav aria-label="Hauptnavigation">
          {navigation.map((item) => (
            <button
              className={`nav-item ${view === item.id ? "is-active" : ""}`}
              key={item.id}
              onClick={() => setView(item.id)}
              type="button"
            >
              {item.icon}
              <span>{item.label}</span>
              {item.count !== undefined && item.count > 0 ? (
                <span className="nav-count">{item.count}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-project">
          <span className="eyebrow">Aktives Projekt</span>
          {snapshot === undefined ? (
            <p>Noch kein Projekt geöffnet.</p>
          ) : (
            <>
              <div className="project-name">
                <PackageCheck size={17} />
                <strong>{snapshot.folderName}</strong>
              </div>
              <p title={snapshot.rootPath}>{snapshot.rootPath}</p>
              <span className="mode-badge">
                {snapshot.mode === "vanilla" ? "Vanilla" : "CommonAPI2"}
              </span>
            </>
          )}
        </div>

        <div className="sidebar-footer">
          <NativeBadge native={bridge.isNative} />
          <span>Keine Telemetrie · lokale Daten</span>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="topbar-title">
            <span className="eyebrow">Transport Fever 2</span>
            <h1>{navigation.find((item) => item.id === view)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <div className="segmented" aria-label="Bedienebene">
              <button
                className={experience === "beginner" ? "is-selected" : ""}
                onClick={() => setExperience("beginner")}
                type="button"
              >
                Einsteiger
              </button>
              <button
                className={experience === "expert" ? "is-selected" : ""}
                onClick={() => setExperience("expert")}
                type="button"
              >
                Experte
              </button>
            </div>
            <button
              aria-label={theme === "dark" ? "Helles Design" : "Dunkles Design"}
              className="icon-button"
              onClick={() =>
                setTheme((current) => (current === "dark" ? "light" : "dark"))
              }
              type="button"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="secondary-button"
              disabled={!bridge.isNative}
              onClick={() => void chooseAndOpenProject()}
              type="button"
            >
              <FolderOpen size={17} />
              Öffnen
            </button>
            <button
              className="primary-button"
              disabled={!bridge.isNative}
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              <FilePlus2 size={17} />
              Neues Modprojekt
            </button>
          </div>
        </header>

        {busy !== undefined ? (
          <div className="busy-bar" role="status">
            <LoaderCircle className="spin" size={16} />
            {busy}
          </div>
        ) : null}

        <main className="content">
          {view === "workspace" ? (
            snapshot === undefined ? (
              <Welcome
                native={bridge.isNative}
                onCreate={() => setCreateOpen(true)}
                onOpen={() => void chooseAndOpenProject()}
              />
            ) : (
              <div className="workspace">
                <section className="file-panel panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">Projektdateien</span>
                      <strong>{snapshot.files.length} Dateien</strong>
                    </div>
                    <button
                      aria-label="Projekt neu einlesen"
                      className="ghost-icon"
                      onClick={() => void rescanProject()}
                      type="button"
                    >
                      <RefreshCw size={15} />
                    </button>
                  </div>
                  <div className="file-list">
                    {snapshot.files.map((file) => (
                      <button
                        className={`file-row ${
                          activePath === file.relativePath ? "is-active" : ""
                        }`}
                        key={file.relativePath}
                        onClick={() => void openFile(file)}
                        title={file.relativePath}
                        type="button"
                      >
                        {file.text ? <Files size={15} /> : <Box size={15} />}
                        <span>{file.relativePath}</span>
                        <small>{formatBytes(file.size)}</small>
                      </button>
                    ))}
                  </div>
                  <div className="index-summary">
                    <Database size={15} />
                    <span>
                      {formatBytes(resourceIndex?.totalBytes ?? 0)} indexiert
                    </span>
                  </div>
                </section>

                <section className="editor-panel panel">
                  {tabs.length > 0 ? (
                    <div className="tab-strip">
                      {tabs.map((tab) => (
                        <button
                          className={`editor-tab ${
                            tab.path === activePath ? "is-active" : ""
                          }`}
                          key={tab.path}
                          onClick={() => setActivePath(tab.path)}
                          type="button"
                        >
                          <span
                            className={`dirty-dot ${
                              tab.content !== tab.savedContent ? "is-dirty" : ""
                            }`}
                          />
                          {fileName(tab.path)}
                          <span
                            aria-label={`${tab.path} schließen`}
                            className="tab-close"
                            onClick={(event) => {
                              event.stopPropagation();
                              closeTab(tab.path);
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <X size={13} />
                          </span>
                        </button>
                      ))}
                      <button
                        className="save-button"
                        disabled={
                          activeTab === undefined ||
                          activeTab.content === activeTab.savedContent
                        }
                        onClick={() => void saveActiveFile()}
                        type="button"
                      >
                        <Save size={15} />
                        Speichern
                      </button>
                    </div>
                  ) : null}
                  <div className="editor-frame">
                    {activeTab === undefined ? (
                      <EmptyState
                        icon={<TerminalSquare size={26} />}
                        title="Datei auswählen"
                      >
                        Öffne links eine Lua-, Konfigurations- oder Textdatei.
                        Binärressourcen bleiben unverändert.
                      </EmptyState>
                    ) : (
                      <Suspense
                        fallback={
                          <div className="editor-loading">
                            <LoaderCircle className="spin" size={18} />
                            Editor wird geladen
                          </div>
                        }
                      >
                        <MonacoEditor
                          expert={experience === "expert"}
                          language={editorLanguage(activeTab.path)}
                          onChange={updateActiveContent}
                          path={activeTab.path}
                          theme={theme}
                          value={activeTab.content}
                        />
                      </Suspense>
                    )}
                  </div>
                  <div className="editor-status">
                    <span>{activeTab?.path ?? "Keine Datei geöffnet"}</span>
                    <span>
                      {dirtyCount > 0
                        ? `${dirtyCount} ungespeichert`
                        : "Datenträgerstand"}
                    </span>
                  </div>
                </section>

                <section className="diagnostic-rail panel">
                  <div className="rail-stat">
                    <span className="status-orb error" />
                    <strong>{validation?.errorCount ?? 0}</strong>
                    <small>Fehler</small>
                  </div>
                  <div className="rail-stat">
                    <span className="status-orb warning" />
                    <strong>{validation?.warningCount ?? 0}</strong>
                    <small>Warnungen</small>
                  </div>
                  <button
                    className="rail-link"
                    onClick={() => setView("diagnostics")}
                    type="button"
                  >
                    Alle Diagnosen
                    <ChevronRight size={15} />
                  </button>
                </section>
              </div>
            )
          ) : null}

          {view === "diagnostics" ? (
            <DiagnosticsView
              diagnostics={validation?.diagnostics ?? []}
              experience={experience}
              hasProject={snapshot !== undefined}
              onJump={jumpToDiagnostic}
            />
          ) : null}

          {view === "install" ? (
            <InstallView
              allowOverwrite={allowOverwrite}
              canInstall={validation?.canInstall === true}
              errorCount={validation?.errorCount ?? 0}
              hasProject={snapshot !== undefined}
              {...(installResult === undefined ? {} : { installResult })}
              modsDirectory={modsDirectory}
              native={bridge.isNative}
              onChooseDirectory={() => void chooseModsDirectory()}
              onInstall={() => void installProject()}
              onOverwriteChange={setAllowOverwrite}
            />
          ) : null}

          {view === "logs" ? (
            <LogView
              experience={experience}
              groups={logGroups}
              logPath={logPath}
              native={bridge.isNative}
              onChooseLog={() => void chooseAndReadLog()}
            />
          ) : null}

          {view === "settings" ? (
            <SetupView
              installations={installations}
              native={bridge.isNative}
              onDetect={() => void detectInstallations()}
              onLaunch={(executablePath) => void launchGame(executablePath)}
            />
          ) : null}
        </main>
      </section>

      {notice !== undefined ? (
        <div className={`notice ${notice.tone}`} role="status">
          {notice.tone === "success" ? (
            <CheckCircle2 size={17} />
          ) : notice.tone === "error" ? (
            <AlertCircle size={17} />
          ) : (
            <Activity size={17} />
          )}
          {notice.message}
        </div>
      ) : null}

      {createOpen ? (
        <CreateDialog
          native={bridge.isNative}
          onCancel={() => setCreateOpen(false)}
          onChooseParent={() => void chooseCreateParent()}
          onChange={setCreateRequest}
          onSubmit={(event) => void submitCreate(event)}
          request={createRequest}
        />
      ) : null}
    </div>
  );
}

function Welcome({
  native,
  onCreate,
  onOpen
}: {
  native: boolean;
  onCreate: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="welcome">
      <section className="welcome-copy">
        <span className="eyebrow">Eigenständige TF2-Entwicklungsumgebung</span>
        <h2>Von der ersten Datei bis zum echten Testlauf.</h2>
        <p>
          Arbeite direkt mit deinen lokalen Transport-Fever-2-Mods. Das Studio
          liest keine Beispieldaten ein und verändert keine Basisressourcen des
          Spiels.
        </p>
        <div className="welcome-actions">
          <button
            className="primary-button large"
            disabled={!native}
            onClick={onCreate}
            type="button"
          >
            <FilePlus2 size={18} />
            Modprojekt anlegen
          </button>
          <button
            className="secondary-button large"
            disabled={!native}
            onClick={onOpen}
            type="button"
          >
            <FolderOpen size={18} />
            Vorhandenen Mod öffnen
          </button>
        </div>
        {!native ? (
          <div className="preview-explanation">
            <HardDrive size={18} />
            Diese Browser-Vorschau zeigt ausschließlich die Oberfläche. Starte
            das Tauri-Desktopfenster, um lokale Ordner auszuwählen.
          </div>
        ) : null}
      </section>
      <section className="workflow-card">
        <span className="eyebrow">Aktiver Vertikalschnitt</span>
        {[
          ["01", "Projekt", "TF2-konforme Grundstruktur"],
          ["02", "Prüfung", "Lua, Pfade und Großschreibung"],
          ["03", "Installation", "Sicher kopieren und verifizieren"],
          ["04", "Testlauf", "Spielstart nur auf deine Aktion"],
          ["05", "Protokoll", "stdout.txt gruppieren und zuordnen"]
        ].map(([number, title, description]) => (
          <div className="workflow-step" key={number}>
            <span>{number}</span>
            <div>
              <strong>{title}</strong>
              <small>{description}</small>
            </div>
            <CheckCircle2 size={16} />
          </div>
        ))}
      </section>
    </div>
  );
}

function DiagnosticsView({
  diagnostics,
  experience,
  hasProject,
  onJump
}: {
  diagnostics: Diagnostic[];
  experience: ExperienceMode;
  hasProject: boolean;
  onJump: (diagnostic: Diagnostic) => void;
}) {
  if (!hasProject) {
    return (
      <EmptyState icon={<ShieldCheck size={26} />} title="Keine Prüfbasis">
        Öffne ein echtes Modprojekt, um Struktur, Lua und Ressourcenreferenzen
        statisch zu prüfen.
      </EmptyState>
    );
  }
  if (diagnostics.length === 0) {
    return (
      <EmptyState icon={<CheckCircle2 size={26} />} title="Keine Befunde">
        Die implementierten Prüfregeln haben im aktuellen Projektstand keine
        Fehler oder Warnungen gefunden.
      </EmptyState>
    );
  }
  return (
    <div className="diagnostics-page">
      <div className="section-intro">
        <div>
          <span className="eyebrow">Statische Analyse</span>
          <h2>Belegte Befunde statt pauschaler Vermutungen</h2>
        </div>
        <p>
          Jeder Befund weist aus, ob er bestätigt, offiziell empfohlen oder
          heuristisch ist.
        </p>
      </div>
      <div className="diagnostic-list">
        {diagnostics.map((item) => (
          <button
            className={`diagnostic-card ${item.severity}`}
            key={item.id}
            onClick={() => onJump(item)}
            type="button"
          >
            <div className="diagnostic-icon">{severityIcon(item)}</div>
            <div className="diagnostic-body">
              <div className="diagnostic-title">
                <strong>{item.title}</strong>
                <span>{item.certainty}</span>
              </div>
              <p>{item.description}</p>
              <small>
                {item.file ?? "Projekt"}
                {item.line === undefined ? "" : ` · Zeile ${item.line}`}
              </small>
              {experience === "expert" ? (
                <div className="expert-detail">
                  <span>
                    <b>Ursache:</b> {item.technicalCause}
                  </span>
                  <span>
                    <b>Korrektur:</b> {item.recommendedFix}
                  </span>
                  <code>{item.code}</code>
                </div>
              ) : null}
            </div>
            {item.file === undefined ? null : <ChevronRight size={17} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function InstallView({
  allowOverwrite,
  canInstall,
  errorCount,
  hasProject,
  installResult,
  modsDirectory,
  native,
  onChooseDirectory,
  onInstall,
  onOverwriteChange
}: {
  allowOverwrite: boolean;
  canInstall: boolean;
  errorCount: number;
  hasProject: boolean;
  installResult?: string;
  modsDirectory: string;
  native: boolean;
  onChooseDirectory: () => void;
  onInstall: () => void;
  onOverwriteChange: (value: boolean) => void;
}) {
  return (
    <div className="two-column-page">
      <section className="task-card">
        <span className="eyebrow">Lokale Installation</span>
        <h2>Validieren, sichern, kopieren, verifizieren.</h2>
        <p>
          Das Ziel wird nie stillschweigend überschrieben. Entwicklungsdateien
          und interne Backups werden ausgeschlossen.
        </p>
        <label className="field">
          <span>Lokales TF2-Modverzeichnis</span>
          <div className="path-picker">
            <input
              placeholder="Noch kein Ziel ausgewählt"
              readOnly
              value={modsDirectory}
            />
            <button
              disabled={!native}
              onClick={onChooseDirectory}
              type="button"
            >
              <FolderOpen size={16} />
              Auswählen
            </button>
          </div>
        </label>
        <label className="check-row">
          <input
            checked={allowOverwrite}
            onChange={(event) => onOverwriteChange(event.target.checked)}
            type="checkbox"
          />
          <span>
            Vorhandene Version ausdrücklich ersetzen und vorher sichern
          </span>
        </label>
        <button
          className="primary-button large full"
          disabled={
            !native || !hasProject || !canInstall || modsDirectory.length === 0
          }
          onClick={onInstall}
          type="button"
        >
          <PackageCheck size={18} />
          Mod lokal installieren
        </button>
        {installResult === undefined ? null : (
          <div className="success-box">
            <CheckCircle2 size={18} />
            <div>
              <strong>Installation verifiziert</strong>
              <span>{installResult}</span>
            </div>
          </div>
        )}
      </section>
      <section className="gate-card">
        <div className={`gate-ring ${canInstall ? "pass" : "blocked"}`}>
          {canInstall ? <CheckCircle2 size={34} /> : <ShieldCheck size={34} />}
        </div>
        <span className="eyebrow">Installations-Gate</span>
        <h3>{canInstall ? "Freigegeben" : "Blockiert"}</h3>
        <p>
          {!hasProject
            ? "Es ist kein Projekt geöffnet."
            : canInstall
              ? "Keine bestätigten Fehler in den implementierten Prüfregeln."
              : `${errorCount} bestätigte Fehler müssen zuerst behoben werden.`}
        </p>
        <ul>
          <li>Root-mod.lua vorhanden</li>
          <li>Lua statisch parsbar</li>
          <li>Keine portable Pfadkollision</li>
          <li>Ressourcen-Großschreibung konsistent</li>
        </ul>
      </section>
    </div>
  );
}

function LogView({
  experience,
  groups,
  logPath,
  native,
  onChooseLog
}: {
  experience: ExperienceMode;
  groups: LogGroup[];
  logPath: string;
  native: boolean;
  onChooseLog: () => void;
}) {
  return (
    <div className="logs-page">
      <div className="section-intro">
        <div>
          <span className="eyebrow">Reale Spielprotokolle</span>
          <h2>stdout.txt ohne erfundene Ursachen</h2>
        </div>
        <button
          className="primary-button"
          disabled={!native}
          onClick={onChooseLog}
          type="button"
        >
          <Search size={17} />
          Protokoll auswählen
        </button>
      </div>
      {logPath.length > 0 ? <div className="selected-path">{logPath}</div> : null}
      {groups.length === 0 ? (
        <EmptyState icon={<ScrollText size={26} />} title="Kein Protokoll geladen">
          Wähle die aktuelle oder eine gespeicherte `stdout.txt`. Unbekannte
          Meldungen bleiben ausdrücklich unklassifiziert.
        </EmptyState>
      ) : (
        <div className="log-list">
          {groups.map((group) => (
            <article className={`log-row ${group.severity}`} key={group.id}>
              <span className="log-count">{group.count}×</span>
              <div>
                <strong>{group.message}</strong>
                <small>
                  Protokollzeile {group.firstLine}
                  {group.lastLine === group.firstLine
                    ? ""
                    : `–${group.lastLine}`}
                  {group.modId === undefined ? "" : ` · Mod ${group.modId}`}
                </small>
                {experience === "expert" ? (
                  <code>
                    {group.file ?? "Keine Datei zugeordnet"}
                    {group.sourceLine === undefined
                      ? ""
                      : `:${group.sourceLine}`}{" "}
                    · Ursache unklassifiziert
                  </code>
                ) : null}
              </div>
              <span className="severity-label">{group.severity}</span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function SetupView({
  installations,
  native,
  onDetect,
  onLaunch
}: {
  installations: InstallationCandidate[];
  native: boolean;
  onDetect: () => void;
  onLaunch: (executablePath: string) => void;
}) {
  return (
    <div className="setup-page">
      <div className="section-intro">
        <div>
          <span className="eyebrow">Plattformadapter</span>
          <h2>Transport-Fever-2-Installation</h2>
        </div>
        <button
          className="primary-button"
          disabled={!native}
          onClick={onDetect}
          type="button"
        >
          <Search size={17} />
          Standardpfade prüfen
        </button>
      </div>
      {installations.length === 0 ? (
        <EmptyState icon={<HardDrive size={26} />} title="Noch keine Installation erkannt">
          Die Erkennung prüft nur reale Standardpfade. Manuell ausgewählte
          Installationen werden in einem folgenden Slice dauerhaft gespeichert.
        </EmptyState>
      ) : (
        <div className="installation-grid">
          {installations.map((candidate) => (
            <article className="installation-card" key={candidate.rootPath}>
              <div className="installation-heading">
                <div className="drive-icon">
                  <HardDrive size={20} />
                </div>
                <div>
                  <strong>Transport Fever 2</strong>
                  <span>{candidate.source}</span>
                </div>
                <span className={candidate.valid ? "valid" : "invalid"}>
                  {candidate.valid ? "gültig" : "ungültig"}
                </span>
              </div>
              <code>{candidate.rootPath}</code>
              {candidate.reason === undefined ? null : <p>{candidate.reason}</p>}
              <button
                className="secondary-button full"
                disabled={!candidate.valid}
                onClick={() => onLaunch(candidate.executablePath)}
                type="button"
              >
                <Play size={16} />
                Testlauf ausdrücklich starten
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateDialog({
  native,
  onCancel,
  onChange,
  onChooseParent,
  onSubmit,
  request
}: {
  native: boolean;
  onCancel: () => void;
  onChange: (request: CreateProjectRequest) => void;
  onChooseParent: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  request: CreateProjectRequest;
}) {
  function setField<K extends keyof CreateProjectRequest>(
    key: K,
    value: CreateProjectRequest[K]
  ): void {
    onChange({ ...request, [key]: value });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal" onSubmit={onSubmit}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">Geführte Projektanlage</span>
            <h2>Neues TF2-Modprojekt</h2>
          </div>
          <button
            aria-label="Dialog schließen"
            className="icon-button"
            onClick={onCancel}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <label className="field">
          <span>Übergeordneter Arbeitsordner</span>
          <div className="path-picker">
            <input
              placeholder="Ordner auswählen"
              readOnly
              required
              value={request.parentDirectory}
            />
            <button
              disabled={!native}
              onClick={onChooseParent}
              type="button"
            >
              <FolderOpen size={16} />
              Auswählen
            </button>
          </div>
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Projekt-ID</span>
            <input
              onChange={(event) => setField("projectId", event.target.value)}
              pattern="[a-z0-9][a-z0-9_-]*_[1-9][0-9]*"
              placeholder="mein_mod_1"
              required
              value={request.projectId}
            />
            <small>Kleinbuchstaben, eindeutiger Name, Major-Version.</small>
          </label>
          <label className="field">
            <span>Projektmodus</span>
            <select
              onChange={(event) =>
                setField("mode", event.target.value as ProjectMode)
              }
              value={request.mode}
            >
              <option value="vanilla">Vanilla Transport Fever 2</option>
              <option value="commonapi2">CommonAPI2 (separat markiert)</option>
            </select>
          </label>
          <label className="field">
            <span>Anzeigename</span>
            <input
              maxLength={120}
              onChange={(event) => setField("displayName", event.target.value)}
              placeholder="Meine neue Mod"
              required
              value={request.displayName}
            />
          </label>
          <label className="field">
            <span>Autor</span>
            <input
              maxLength={120}
              onChange={(event) => setField("author", event.target.value)}
              placeholder="Name des Modders"
              required
              value={request.author}
            />
          </label>
        </div>
        <div className="modal-info">
          <ShieldCheck size={18} />
          Das Studio erzeugt `mod.lua`, `strings.lua`, Dokumentation und eine
          interne Projektkonfiguration. Vorhandene Ordner werden nicht ersetzt.
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Abbrechen
          </button>
          <button
            className="primary-button"
            disabled={!native}
            type="submit"
          >
            <FilePlus2 size={17} />
            Projekt sicher anlegen
          </button>
        </div>
      </form>
    </div>
  );
}
