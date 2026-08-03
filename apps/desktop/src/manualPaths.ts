import type { InstallationCandidate } from "@tpf2-mod-studio/core";

export interface ManualPaths {
  gameRoot: string;
  userDataPath: string;
  modsPath: string;
}

export const MANUAL_PATHS_STORAGE_KEY =
  "tpf2-mod-studio.manual-paths.v1";

export const EMPTY_MANUAL_PATHS: ManualPaths = {
  gameRoot: "",
  userDataPath: "",
  modsPath: ""
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function cleanPath(value: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z]:[\\/]$/u.test(trimmed)) return trimmed;
  return trimmed.replace(/[\\/]+$/u, "");
}

function availableStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readManualPaths(
  storage: StorageReader | undefined = availableStorage()
): ManualPaths {
  if (storage === undefined) return EMPTY_MANUAL_PATHS;
  try {
    const raw = storage.getItem(MANUAL_PATHS_STORAGE_KEY);
    if (raw === null) return EMPTY_MANUAL_PATHS;
    const parsed = JSON.parse(raw) as Partial<ManualPaths>;
    return {
      gameRoot: cleanPath(parsed.gameRoot ?? ""),
      userDataPath: cleanPath(parsed.userDataPath ?? ""),
      modsPath: cleanPath(parsed.modsPath ?? "")
    };
  } catch {
    return EMPTY_MANUAL_PATHS;
  }
}

export function writeManualPaths(
  paths: ManualPaths,
  storage: StorageWriter | undefined = availableStorage()
): ManualPaths {
  const normalized = {
    gameRoot: cleanPath(paths.gameRoot),
    userDataPath: cleanPath(paths.userDataPath),
    modsPath: cleanPath(paths.modsPath)
  };
  if (storage !== undefined) {
    storage.setItem(MANUAL_PATHS_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

function joinPath(root: string, child: string): string {
  const windows = /^[A-Za-z]:[\\/]/u.test(root) || root.includes("\\");
  return `${cleanPath(root)}${windows ? "\\" : "/"}${child}`;
}

export function buildManualInstallation(
  paths: ManualPaths,
  fallback?: InstallationCandidate
): InstallationCandidate | undefined {
  const normalized = {
    gameRoot: cleanPath(paths.gameRoot),
    userDataPath: cleanPath(paths.userDataPath),
    modsPath: cleanPath(paths.modsPath)
  };
  if (
    normalized.gameRoot.length === 0 &&
    normalized.userDataPath.length === 0 &&
    normalized.modsPath.length === 0
  ) {
    return undefined;
  }

  const hasManualGame = normalized.gameRoot.length > 0;
  const windows =
    /^[A-Za-z]:[\\/]/u.test(normalized.gameRoot) ||
    normalized.gameRoot.includes("\\");
  const executableName = windows ? "TransportFever2.exe" : "TransportFever2";
  const rootPath =
    normalized.gameRoot ||
    fallback?.rootPath ||
    normalized.userDataPath ||
    normalized.modsPath;
  const executablePath = hasManualGame
    ? joinPath(normalized.gameRoot, executableName)
    : (fallback?.executablePath ?? "");
  const userDataPath = normalized.userDataPath || fallback?.userDataPath;
  const modsPath = normalized.modsPath || fallback?.modsPath;
  const valid = hasManualGame || fallback?.valid === true;

  return {
    rootPath,
    executablePath,
    ...(userDataPath === undefined || userDataPath.length === 0
      ? {}
      : { userDataPath }),
    ...(modsPath === undefined || modsPath.length === 0 ? {} : { modsPath }),
    ...(fallback?.stdoutPath === undefined
      ? {}
      : { stdoutPath: fallback.stdoutPath }),
    source: "manual",
    valid,
    ...(valid ? {} : { reason: "Manual game directory is not configured." })
  };
}

function candidateKey(candidate: InstallationCandidate): string {
  return candidate.rootPath
    .replace(/\\/gu, "/")
    .replace(/\/$/u, "")
    .toLowerCase();
}

export function mergeInstallationCandidates(
  detected: InstallationCandidate[],
  manual: InstallationCandidate | undefined
): InstallationCandidate[] {
  const merged = manual === undefined ? [...detected] : [manual, ...detected];
  const seen = new Set<string>();
  return merged.filter((candidate) => {
    const key = candidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
