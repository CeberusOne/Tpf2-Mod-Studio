import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  CreateProjectRequest,
  CreatedProject,
  InstallationCandidate,
  InstallResult,
  ProjectSnapshot
} from "@tpf2-mod-studio/core";

export interface DesktopBridge {
  readonly isNative: boolean;
  chooseDirectory(title: string): Promise<string | null>;
  chooseLogFile(): Promise<string | null>;
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
  readLog(logPath: string): Promise<string>;
  launchGame(executablePath: string): Promise<number>;
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

  async chooseLogFile() {
    requireNative();
    const selected = await open({
      directory: false,
      multiple: false,
      title: "Transport Fever 2 stdout.txt auswählen",
      filters: [{ name: "TF2-Protokolle", extensions: ["txt", "log"] }]
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

  async readLog(logPath) {
    requireNative();
    return invoke<string>("read_tf2_log", { logPath });
  },

  async launchGame(executablePath) {
    requireNative();
    return invoke<number>("launch_game", { executablePath });
  }
};
