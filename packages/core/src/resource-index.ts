import { normalizeResourcePath } from "./path-utils.js";
import type {
  IndexDiff,
  ProjectSnapshot,
  ResourceIndex,
  ResourceIndexEntry,
  ResourceKind
} from "./types.js";

const RESOURCE_KINDS: ResourceKind[] = [
  "lua",
  "construction",
  "model",
  "mesh",
  "material",
  "texture",
  "sound",
  "track",
  "street",
  "signal",
  "station",
  "translation",
  "documentation",
  "metadata",
  "other"
];

function emptyCounts(): Record<ResourceKind, number> {
  return Object.fromEntries(
    RESOURCE_KINDS.map((kind) => [kind, 0])
  ) as Record<ResourceKind, number>;
}

export function classifyResource(relativePath: string): ResourceKind {
  const value = normalizeResourcePath(relativePath).toLocaleLowerCase("en-US");
  if (value === "mod.lua" || value === "strings.lua") return "metadata";
  if (value.startsWith("documents/") || value.endsWith(".md")) {
    return "documentation";
  }
  if (value.includes("/config/track/")) return "track";
  if (value.includes("/config/street/")) return "street";
  if (value.includes("/model/signal/") || value.includes("/models/model/signal/")) {
    return "signal";
  }
  if (value.includes("/station/")) return "station";
  if (value.includes("/strings/") || value.endsWith(".po") || value.endsWith(".mo")) {
    return "translation";
  }
  if (value.endsWith(".con")) return "construction";
  if (value.endsWith(".mdl")) return "model";
  if (value.endsWith(".msh") || value.endsWith(".msh.blob")) return "mesh";
  if (value.endsWith(".mtl")) return "material";
  if (value.endsWith(".tga") || value.endsWith(".dds") || value.endsWith(".png")) {
    return "texture";
  }
  if (value.endsWith(".wav") || value.endsWith(".ogg")) return "sound";
  if (value.endsWith(".lua")) return "lua";
  return "other";
}

export function buildResourceIndex(snapshot: ProjectSnapshot): ResourceIndex {
  const counts = emptyCounts();
  let totalBytes = 0;
  const entries: ResourceIndexEntry[] = snapshot.files
    .map((file) => {
      const kind = classifyResource(file.relativePath);
      counts[kind] += 1;
      totalBytes += file.size;
      return {
        relativePath: normalizeResourcePath(file.relativePath),
        kind,
        size: file.size,
        modifiedMs: file.modifiedMs,
        fingerprint: `${file.size}:${Math.trunc(file.modifiedMs)}`
      };
    })
    .sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)
    );

  return {
    projectRoot: snapshot.rootPath,
    createdAt: new Date().toISOString(),
    entries,
    counts,
    totalBytes
  };
}

export function diffResourceIndexes(
  previous: ResourceIndex,
  current: ResourceIndex
): IndexDiff {
  const before = new Map(
    previous.entries.map((entry) => [entry.relativePath, entry.fingerprint])
  );
  const after = new Map(
    current.entries.map((entry) => [entry.relativePath, entry.fingerprint])
  );
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  let unchanged = 0;

  for (const [path, fingerprint] of after) {
    const oldFingerprint = before.get(path);
    if (oldFingerprint === undefined) added.push(path);
    else if (oldFingerprint !== fingerprint) changed.push(path);
    else unchanged += 1;
  }
  for (const path of before.keys()) {
    if (!after.has(path)) removed.push(path);
  }

  return { added, changed, removed, unchanged };
}
