import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  CreateProjectRequest,
  CreatedProject,
  InstallationCandidate,
  InstallResult,
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
}

export interface DesktopBridge {
  readonly isNative: boolean;
  chooseDirectory(title: string): Promise<string | null>;
  chooseLogFile(title: string, filterName: string): Promise<string | null>;
  chooseModArchive(title: string, filterName: string): Promise<string | null>;
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
