import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

import type {
  CreateProjectRequest,
  CreatedProject,
  InstallationCandidate,
  InstallResult,
  InstalledMod,
  LogFileInfo,
  ModArchiveInfo,
  ProjectSnapshot
} from "@tpf2-mod-studio/core";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseTag: string;
  notes: string;
  downloadUrl: string;
  assetName: string;
  htmlUrl: string;
  checksumUrl?: string;
  assetSize?: number;
}

export interface DesktopBridge {
  readonly isNative: boolean;
  chooseDirectory(title: string): Promise<string | null>;
  chooseLogFile(title: string, filterName: string): Promise<string | null>;
  chooseModArchive(title: string, filterName: string): Promise<string | null>;
  chooseExportTarget(
    title: string,
    filterName: string,
    defaultName: string
  ): Promise<string | null>;
  detectInstallations(): Promise<InstallationCandidate[]>;
  createProject(request: CreateProjectRequest): Promise<CreatedProject>;
  scanProject(rootPath: string): Promise<ProjectSnapshot>;
  readProjectFile(rootPath: string, relativePath: string): Promise<string>;
  saveProjectFile(
    rootPath: string,
    relativePath: string,
    content: string
  ): Promise<void>;
  installProject(
    rootPath: string,
    modsDirectory: string,
    overwrite: boolean
  ): Promise<InstallResult>;
  inspectModArchive(archivePath: string): Promise<ModArchiveInfo>;
  importModArchive(
    archivePath: string,
    modsDirectory: string,
    overwrite: boolean
  ): Promise<InstallResult>;
  readLog(logPath: string): Promise<string>;
  launchGame(executablePath: string): Promise<number>;
  scanModLibrary(input: {
    modsPath?: string;
    userDataPath?: string;
    gameRoot?: string;
  }): Promise<InstalledMod[]>;
  listLogFiles(userDataPath: string): Promise<LogFileInfo[]>;
  archiveStdout(userDataPath: string): Promise<string>;
  exportProjectZip(
    rootPath: string,
    destinationPath: string
  ): Promise<string>;
  ensureStagingDirectory(userDataPath: string): Promise<string>;
  checkForUpdate(): Promise<UpdateInfo>;
  applyUpdate(info: UpdateInfo): Promise<string>;
  restartAfterUpdate(): Promise<void>;
}

function requireNative(): void {
  if (!isTauri()) {
    throw new Error(
      "Native filesystem actions are available only in the Tpf2 Mod Studio desktop window."
    );
  }
}

export const tauriBridge: DesktopBridge = {
  get isNative() {
    return isTauri();
  },

  async chooseDirectory(title) {
    requireNative();
    const selected = await open({ directory: true, multiple: false, title });
    return typeof selected === "string" ? selected : null;
  },

  async chooseLogFile(title, filterName) {
    requireNative();
    const selected = await open({
      directory: false,
      multiple: false,
      title,
      filters: [{ name: filterName, extensions: ["txt", "log"] }]
    });
    return typeof selected === "string" ? selected : null;
  },

  async chooseModArchive(title, filterName) {
    requireNative();
    const selected = await open({
      directory: false,
      multiple: false,
      title,
      filters: [{ name: filterName, extensions: ["zip"] }]
    });
    return typeof selected === "string" ? selected : null;
  },

  async chooseExportTarget(title, filterName, defaultName) {
    requireNative();
    const selected = await save({
      title,
      defaultPath: defaultName,
      filters: [{ name: filterName, extensions: ["zip"] }]
    });
    return typeof selected === "string" ? selected : null;
  },

  async detectInstallations() {
    requireNative();
    return invoke<InstallationCandidate[]>("detect_installations");
  },

  async createProject(request) {
    requireNative();
    return invoke<CreatedProject>("create_project", { request });
  },

  async scanProject(rootPath) {
    requireNative();
    return invoke<ProjectSnapshot>("scan_project", { rootPath });
  },

  async readProjectFile(rootPath, relativePath) {
    requireNative();
    return invoke<string>("read_project_file", { rootPath, relativePath });
  },

  async saveProjectFile(rootPath, relativePath, content) {
    requireNative();
    await invoke("save_project_file", { rootPath, relativePath, content });
  },

  async installProject(rootPath, modsDirectory, overwrite) {
    requireNative();
    return invoke<InstallResult>("install_project", {
      rootPath,
      modsDirectory,
      overwrite
    });
  },

  async inspectModArchive(archivePath) {
    requireNative();
    return invoke<ModArchiveInfo>("inspect_mod_archive", { archivePath });
  },

  async importModArchive(archivePath, modsDirectory, overwrite) {
    requireNative();
    return invoke<InstallResult>("import_mod_archive", {
      archivePath,
      modsDirectory,
      overwrite
    });
  },

  async readLog(logPath) {
    requireNative();
    return invoke<string>("read_tf2_log", { logPath });
  },

  async launchGame(executablePath) {
    requireNative();
    return invoke<number>("launch_game", { executablePath });
  },

  async scanModLibrary(input) {
    requireNative();
    return invoke<InstalledMod[]>("scan_mod_library", {
      modsPath: input.modsPath ?? null,
      userDataPath: input.userDataPath ?? null,
      gameRoot: input.gameRoot ?? null
    });
  },

  async listLogFiles(userDataPath) {
    requireNative();
    return invoke<LogFileInfo[]>("list_log_files", { userDataPath });
  },

  async archiveStdout(userDataPath) {
    requireNative();
    return invoke<string>("archive_stdout", { userDataPath });
  },

  async exportProjectZip(rootPath, destinationPath) {
    requireNative();
    return invoke<string>("export_project_zip", { rootPath, destinationPath });
  },

  async ensureStagingDirectory(userDataPath) {
    requireNative();
    return invoke<string>("ensure_staging_directory", { userDataPath });
  },

  async checkForUpdate() {
    requireNative();
    return invoke<UpdateInfo>("check_for_update");
  },

  async applyUpdate(info) {
    requireNative();
    return invoke<string>("apply_update", { info });
  },

  async restartAfterUpdate() {
    requireNative();
    await invoke("restart_after_update");
  }
};
