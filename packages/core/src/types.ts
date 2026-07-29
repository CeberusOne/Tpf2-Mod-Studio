export type ProjectMode = "vanilla" | "commonapi2";

export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticCertainty =
  | "confirmed"
  | "official-guidance"
  | "heuristic";

export interface ProjectFile {
  relativePath: string;
  size: number;
  modifiedMs: number;
  text: boolean;
  content?: string;
}

export interface ProjectSnapshot {
  rootPath: string;
  folderName: string;
  mode: ProjectMode;
  scannedAt: string;
  files: ProjectFile[];
}

export interface Diagnostic {
  id: string;
  code: string;
  severity: DiagnosticSeverity;
  certainty: DiagnosticCertainty;
  title: string;
  description: string;
  technicalCause: string;
  recommendedFix: string;
  file?: string;
  resource?: string;
  line?: number;
  column?: number;
}

export interface ValidationResult {
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  canInstall: boolean;
}

export type ResourceKind =
  | "lua"
  | "construction"
  | "model"
  | "mesh"
  | "material"
  | "texture"
  | "sound"
  | "track"
  | "street"
  | "signal"
  | "station"
  | "translation"
  | "documentation"
  | "metadata"
  | "other";

export interface ResourceIndexEntry {
  relativePath: string;
  kind: ResourceKind;
  size: number;
  modifiedMs: number;
  fingerprint: string;
}

export interface ResourceIndex {
  projectRoot: string;
  createdAt: string;
  entries: ResourceIndexEntry[];
  counts: Record<ResourceKind, number>;
  totalBytes: number;
}

export interface IndexDiff {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: number;
}

export type LogSeverity = "error" | "warning" | "info";

export interface LogGroup {
  id: string;
  severity: LogSeverity;
  message: string;
  count: number;
  firstLine: number;
  lastLine: number;
  file?: string;
  sourceLine?: number;
  modId?: string;
  causeStatus: "unclassified";
}

export interface CreatedProject {
  rootPath: string;
  projectId: string;
  mode: ProjectMode;
}

export interface CreateProjectRequest {
  parentDirectory: string;
  projectId: string;
  displayName: string;
  author: string;
  mode: ProjectMode;
}

export interface InstallResult {
  installedPath: string;
  backupPath?: string;
  fileCount: number;
}

export interface InstallationCandidate {
  rootPath: string;
  executablePath: string;
  userDataPath?: string;
  source: "steam-default" | "manual";
  valid: boolean;
  reason?: string;
}
