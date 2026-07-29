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
import {
  I18nProvider,
  localizedCertainty,
  localizedInstallationReason,
  localizedInstallationSource,
  localizedSeverity,
  useI18n
} from "./i18n";

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
  const { t } = useI18n();
  return (
    <span className={`native-badge ${native ? "is-ready" : "is-preview"}`}>
      <span className="native-dot" />
      {native ? t("nativeReady") : t("uiPreview")}
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

export default function App(props: AppProps) {
  return (
    <I18nProvider>
      <Workbench {...props} />
    </I18nProvider>
  );
}

function Workbench({ bridge = tauriBridge }: AppProps) {
  const { language, setLanguage, t } = useI18n();
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
    const scanned = await withBusy(t("busyIndexProject"), () =>
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
      message: t("noticeFilesLoaded", { count: scanned.files.length })
    });
  }

  async function chooseAndOpenProject(): Promise<void> {
    const selected = await withBusy(t("busyOpenFolderPicker"), () =>
      bridge.chooseDirectory(t("dialogSelectProject"))
    );
    if (selected !== undefined && selected !== null) await loadProject(selected);
  }

  async function chooseCreateParent(): Promise<void> {
    const selected = await withBusy(t("busyOpenFolderPicker"), () =>
      bridge.chooseDirectory(t("dialogSelectParent"))
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
    const created = await withBusy(t("busyCreateProject"), () =>
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
        message: t("noticeBinaryFile")
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
      (await withBusy(t("busyReadFile"), () =>
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
    const saved = await withBusy(t("busySaveFile"), async () => {
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
      message: t("noticeFileSaved", { path: activeTab.path })
    });
  }

  function closeTab(path: string): void {
    const tab = tabs.find((candidate) => candidate.path === path);
    if (
      tab !== undefined &&
      tab.content !== tab.savedContent &&
      !window.confirm(t("confirmDiscardChanges", { path }))
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
      !window.confirm(t("confirmRescan"))
    ) {
      return;
    }
    await loadProject(snapshot.rootPath);
  }

  async function chooseModsDirectory(): Promise<void> {
    const selected = await withBusy(t("busyOpenFolderPicker"), () =>
      bridge.chooseDirectory(t("dialogSelectModsDirectory"))
    );
    if (selected !== undefined && selected !== null) setModsDirectory(selected);
  }

  async function installProject(): Promise<void> {
    if (snapshot === undefined || validation?.canInstall !== true) {
      setNotice({
        tone: "error",
        message: t("noticeInstallBlocked")
      });
      return;
    }
    if (modsDirectory.length === 0) {
      setNotice({
        tone: "error",
        message: t("noticeChooseModsDirectory")
      });
      return;
    }
    const result = await withBusy(t("busyInstall"), () =>
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
      message: t("noticeFilesInstalled", { count: result.fileCount })
    });
  }

  async function chooseAndReadLog(): Promise<void> {
    const selected = await withBusy(t("busyOpenLogPicker"), () =>
      bridge.chooseLogFile(t("dialogSelectLog"), t("dialogLogFilter"))
    );
    if (selected === undefined || selected === null) return;
    const content = await withBusy(t("busyAnalyzeLog"), () =>
      bridge.readLog(selected)
    );
    if (content === undefined) return;
    setLogPath(selected);
    setLogGroups(parseTf2Log(content));
  }

  async function detectInstallations(): Promise<void> {
    const candidates = await withBusy(t("busyDetectInstallations"), () =>
      bridge.detectInstallations()
    );
    if (candidates === undefined) return;
    setInstallations(candidates);
    setNotice({
      tone: candidates.length === 0 ? "neutral" : "success",
      message:
        candidates.length === 0
          ? t("noticeNoInstallation")
          : t("noticeInstallationsDetected", { count: candidates.length })
    });
  }

  async function launchGame(executablePath: string): Promise<void> {
    if (
      !window.confirm(t("confirmLaunch"))
    ) {
      return;
    }
    const processId = await withBusy(t("busyLaunchGame"), () =>
      bridge.launchGame(executablePath)
    );
    if (processId === undefined) return;
    setNotice({
      tone: "success",
      message: t("noticeGameLaunched", { processId })
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
    { id: "workspace", label: t("navWorkspace"), icon: <Code2 size={18} /> },
    {
      id: "diagnostics",
      label: t("navDiagnostics"),
      icon: <ShieldCheck size={18} />,
      ...(validation === undefined
        ? {}
        : { count: validation.errorCount + validation.warningCount })
    },
    { id: "install", label: t("navInstall"), icon: <Box size={18} /> },
    { id: "logs", label: t("navLogs"), icon: <ScrollText size={18} /> },
    { id: "settings", label: t("navSetup"), icon: <Settings size={18} /> }
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

        <nav aria-label={t("mainNavigation")}>
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
          <span className="eyebrow">{t("activeProject")}</span>
          {snapshot === undefined ? (
            <p>{t("noProjectOpen")}</p>
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
          <span>{t("noTelemetry")}</span>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="topbar-title">
            <span className="eyebrow">Transport Fever 2</span>
            <h1>{navigation.find((item) => item.id === view)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <div
              className="segmented language-switch"
              aria-label={t("languageControl")}
            >
              <button
                aria-label={t("german")}
                aria-pressed={language === "de"}
                className={language === "de" ? "is-selected" : ""}
                onClick={() => setLanguage("de")}
                type="button"
              >
                DE
              </button>
              <button
                aria-label={t("english")}
                aria-pressed={language === "en"}
                className={language === "en" ? "is-selected" : ""}
                onClick={() => setLanguage("en")}
                type="button"
              >
                EN
              </button>
            </div>
            <div className="segmented" aria-label={t("operationLevel")}>
              <button
                className={experience === "beginner" ? "is-selected" : ""}
                onClick={() => setExperience("beginner")}
                type="button"
              >
                {t("beginner")}
              </button>
              <button
                className={experience === "expert" ? "is-selected" : ""}
                onClick={() => setExperience("expert")}
                type="button"
              >
                {t("expert")}
              </button>
            </div>
            <button
              aria-label={
                theme === "dark" ? t("lightTheme") : t("darkTheme")
              }
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
              {t("open")}
            </button>
            <button
              className="primary-button"
              disabled={!bridge.isNative}
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              <FilePlus2 size={17} />
              {t("newModProject")}
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
                      <span className="eyebrow">{t("projectFiles")}</span>
                      <strong>
                        {t("filesCount", { count: snapshot.files.length })}
                      </strong>
                    </div>
                    <button
                      aria-label={t("rescanProject")}
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
                      {t("indexed", {
                        size: formatBytes(resourceIndex?.totalBytes ?? 0)
                      })}
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
                            aria-label={t("closeTab", { path: tab.path })}
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
                        {t("save")}
                      </button>
                    </div>
                  ) : null}
                  <div className="editor-frame">
                    {activeTab === undefined ? (
                      <EmptyState
                        icon={<TerminalSquare size={26} />}
                        title={t("selectFile")}
                      >
                        {t("selectFileDescription")}
                      </EmptyState>
                    ) : (
                      <Suspense
                        fallback={
                          <div className="editor-loading">
                            <LoaderCircle className="spin" size={18} />
                            {t("editorLoading")}
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
                    <span>{activeTab?.path ?? t("noFileOpen")}</span>
                    <span>
                      {dirtyCount > 0
                        ? t("unsavedCount", { count: dirtyCount })
                        : t("diskState")}
                    </span>
                  </div>
                </section>

                <section className="diagnostic-rail panel">
                  <div className="rail-stat">
                    <span className="status-orb error" />
                    <strong>{validation?.errorCount ?? 0}</strong>
                    <small>{t("errors")}</small>
                  </div>
                  <div className="rail-stat">
                    <span className="status-orb warning" />
                    <strong>{validation?.warningCount ?? 0}</strong>
                    <small>{t("warnings")}</small>
                  </div>
                  <button
                    className="rail-link"
                    onClick={() => setView("diagnostics")}
                    type="button"
                  >
                    {t("allDiagnostics")}
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
  const { t } = useI18n();
  const workflow = [
    ["01", t("workflowProject"), t("workflowProjectDescription")],
    ["02", t("workflowValidation"), t("workflowValidationDescription")],
    [
      "03",
      t("workflowInstallation"),
      t("workflowInstallationDescription")
    ],
    ["04", t("workflowTestRun"), t("workflowTestRunDescription")],
    ["05", t("workflowLog"), t("workflowLogDescription")]
  ];

  return (
    <div className="welcome">
      <section className="welcome-copy">
        <span className="eyebrow">{t("welcomeEyebrow")}</span>
        <h2>{t("welcomeTitle")}</h2>
        <p>{t("welcomeDescription")}</p>
        <div className="welcome-actions">
          <button
            className="primary-button large"
            disabled={!native}
            onClick={onCreate}
            type="button"
          >
            <FilePlus2 size={18} />
            {t("createModProject")}
          </button>
          <button
            className="secondary-button large"
            disabled={!native}
            onClick={onOpen}
            type="button"
          >
            <FolderOpen size={18} />
            {t("openExistingMod")}
          </button>
        </div>
        {!native ? (
          <div className="preview-explanation">
            <HardDrive size={18} />
            {t("previewExplanation")}
          </div>
        ) : null}
      </section>
      <section className="workflow-card">
        <span className="eyebrow">{t("workflowEyebrow")}</span>
        {workflow.map(([number, title, description]) => (
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
  const { t } = useI18n();

  if (!hasProject) {
    return (
      <EmptyState
        icon={<ShieldCheck size={26} />}
        title={t("noValidationBase")}
      >
        {t("noValidationBaseDescription")}
      </EmptyState>
    );
  }
  if (diagnostics.length === 0) {
    return (
      <EmptyState icon={<CheckCircle2 size={26} />} title={t("noFindings")}>
        {t("noFindingsDescription")}
      </EmptyState>
    );
  }
  return (
    <div className="diagnostics-page">
      <div className="section-intro">
        <div>
          <span className="eyebrow">{t("staticAnalysis")}</span>
          <h2>{t("diagnosticsTitle")}</h2>
        </div>
        <p>{t("diagnosticsDescription")}</p>
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
                <span>{localizedCertainty(item.certainty, t)}</span>
              </div>
              <p>{item.description}</p>
              <small>
                {item.file ?? t("project")}
                {item.line === undefined
                  ? ""
                  : ` · ${t("line", { line: item.line })}`}
              </small>
              {experience === "expert" ? (
                <div className="expert-detail">
                  <span>
                    <b>{t("cause")}</b> {item.technicalCause}
                  </span>
                  <span>
                    <b>{t("correction")}</b> {item.recommendedFix}
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
  const { t } = useI18n();

  return (
    <div className="two-column-page">
      <section className="task-card">
        <span className="eyebrow">{t("localInstallation")}</span>
        <h2>{t("installTitle")}</h2>
        <p>{t("installDescription")}</p>
        <label className="field">
          <span>{t("localModsDirectory")}</span>
          <div className="path-picker">
            <input
              placeholder={t("noTargetSelected")}
              readOnly
              value={modsDirectory}
            />
            <button
              disabled={!native}
              onClick={onChooseDirectory}
              type="button"
            >
              <FolderOpen size={16} />
              {t("select")}
            </button>
          </div>
        </label>
        <label className="check-row">
          <input
            checked={allowOverwrite}
            onChange={(event) => onOverwriteChange(event.target.checked)}
            type="checkbox"
          />
          <span>{t("overwriteExisting")}</span>
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
          {t("installModLocally")}
        </button>
        {installResult === undefined ? null : (
          <div className="success-box">
            <CheckCircle2 size={18} />
            <div>
              <strong>{t("installationVerified")}</strong>
              <span>{installResult}</span>
            </div>
          </div>
        )}
      </section>
      <section className="gate-card">
        <div className={`gate-ring ${canInstall ? "pass" : "blocked"}`}>
          {canInstall ? <CheckCircle2 size={34} /> : <ShieldCheck size={34} />}
        </div>
        <span className="eyebrow">{t("installationGate")}</span>
        <h3>{canInstall ? t("approved") : t("blocked")}</h3>
        <p>
          {!hasProject
            ? t("gateNoProject")
            : canInstall
              ? t("gateApproved")
              : t("gateBlocked", { count: errorCount })}
        </p>
        <ul>
          <li>{t("checkRootModLua")}</li>
          <li>{t("checkLuaParsable")}</li>
          <li>{t("checkPathCollision")}</li>
          <li>{t("checkResourceCase")}</li>
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
  const { t } = useI18n();

  return (
    <div className="logs-page">
      <div className="section-intro">
        <div>
          <span className="eyebrow">{t("realGameLogs")}</span>
          <h2>{t("logsTitle")}</h2>
        </div>
        <button
          className="primary-button"
          disabled={!native}
          onClick={onChooseLog}
          type="button"
        >
          <Search size={17} />
          {t("selectLog")}
        </button>
      </div>
      {logPath.length > 0 ? <div className="selected-path">{logPath}</div> : null}
      {groups.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={26} />}
          title={t("noLogLoaded")}
        >
          {t("noLogLoadedDescription")}
        </EmptyState>
      ) : (
        <div className="log-list">
          {groups.map((group) => (
            <article className={`log-row ${group.severity}`} key={group.id}>
              <span className="log-count">{group.count}×</span>
              <div>
                <strong>{group.message}</strong>
                <small>
                  {t("logLine", { line: group.firstLine })}
                  {group.lastLine === group.firstLine
                    ? ""
                    : `–${group.lastLine}`}
                  {group.modId === undefined
                    ? ""
                    : ` · ${t("modReference", { modId: group.modId })}`}
                </small>
                {experience === "expert" ? (
                  <code>
                    {group.file ?? t("noFileAssigned")}
                    {group.sourceLine === undefined
                      ? ""
                      : `:${group.sourceLine}`}{" "}
                    · {t("causeUnclassified")}
                  </code>
                ) : null}
              </div>
              <span className="severity-label">
                {localizedSeverity(group.severity, t)}
              </span>
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
  const { t } = useI18n();

  return (
    <div className="setup-page">
      <div className="section-intro">
        <div>
          <span className="eyebrow">{t("platformAdapter")}</span>
          <h2>{t("setupTitle")}</h2>
        </div>
        <button
          className="primary-button"
          disabled={!native}
          onClick={onDetect}
          type="button"
        >
          <Search size={17} />
          {t("checkDefaultPaths")}
        </button>
      </div>
      {installations.length === 0 ? (
        <EmptyState
          icon={<HardDrive size={26} />}
          title={t("noInstallationDetected")}
        >
          {t("noInstallationDetectedDescription")}
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
                  <span>{localizedInstallationSource(candidate.source, t)}</span>
                </div>
                <span className={candidate.valid ? "valid" : "invalid"}>
                  {candidate.valid ? t("valid") : t("invalid")}
                </span>
              </div>
              <code>{candidate.rootPath}</code>
              {candidate.reason === undefined ? null : (
                <p>{localizedInstallationReason(candidate.reason, t)}</p>
              )}
              <button
                className="secondary-button full"
                disabled={!candidate.valid}
                onClick={() => onLaunch(candidate.executablePath)}
                type="button"
              >
                <Play size={16} />
                {t("launchTestRun")}
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
  const { t } = useI18n();

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
            <span className="eyebrow">{t("guidedProjectCreation")}</span>
            <h2>{t("createDialogTitle")}</h2>
          </div>
          <button
            aria-label={t("closeDialog")}
            className="icon-button"
            onClick={onCancel}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <label className="field">
          <span>{t("parentWorkspaceFolder")}</span>
          <div className="path-picker">
            <input
              placeholder={t("selectFolder")}
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
              {t("select")}
            </button>
          </div>
        </label>
        <div className="form-grid">
          <label className="field">
            <span>{t("projectId")}</span>
            <input
              onChange={(event) => setField("projectId", event.target.value)}
              pattern="[a-z0-9][a-z0-9_-]*_[1-9][0-9]*"
              placeholder="mein_mod_1"
              required
              value={request.projectId}
            />
            <small>{t("projectIdHint")}</small>
          </label>
          <label className="field">
            <span>{t("projectMode")}</span>
            <select
              onChange={(event) =>
                setField("mode", event.target.value as ProjectMode)
              }
              value={request.mode}
            >
              <option value="vanilla">Vanilla Transport Fever 2</option>
              <option value="commonapi2">{t("commonApiOption")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("displayName")}</span>
            <input
              maxLength={120}
              onChange={(event) => setField("displayName", event.target.value)}
              placeholder={t("displayNamePlaceholder")}
              required
              value={request.displayName}
            />
          </label>
          <label className="field">
            <span>{t("author")}</span>
            <input
              maxLength={120}
              onChange={(event) => setField("author", event.target.value)}
              placeholder={t("authorPlaceholder")}
              required
              value={request.author}
            />
          </label>
        </div>
        <div className="modal-info">
          <ShieldCheck size={18} />
          {t("createDialogInfo")}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            {t("cancel")}
          </button>
          <button
            className="primary-button"
            disabled={!native}
            type="submit"
          >
            <FilePlus2 size={17} />
            {t("createProjectSafely")}
          </button>
        </div>
      </form>
    </div>
  );
}
