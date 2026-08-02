import { normalizeResourcePath } from "./path-utils.js";
import type {
  IndexDiff,
  ProjectFile,
  ProjectSnapshot,
  ResourceIndex,
  ResourceIndexEntry,
  ResourceKind
} from "./types.js";

const RESOURCE_KINDS: ResourceKind[] = [
  "lua",
  "construction",
  "module",
  "model",
  "mesh",
  "material",
  "animation",
  "texture",
  "sound",
  "shader",
  "font",
  "track",
  "street",
  "signal",
  "station",
  "ui",
  "mission",
  "campaign",
  "terrain",
  "environment",
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

function isInPath(value: string, fragment: string): boolean {
  return value === fragment || value.startsWith(`${fragment}/`) || value.includes(`/${fragment}/`);
}

export function classifyResource(relativePath: string): ResourceKind {
  const value = normalizeResourcePath(relativePath).toLowerCase();

  if (value === "mod.lua" || value === "filesystem.lua" || value.endsWith("/.tpf2-studio/project.json")) {
    return "metadata";
  }
  if (value === "strings.lua" || isInPath(value, "res/strings") || value.endsWith(".po") || value.endsWith(".mo")) {
    return "translation";
  }
  if (value.startsWith("documents/") || value.endsWith(".md")) return "documentation";
  if (value.endsWith(".module")) return "module";
  if (value.endsWith(".con")) return "construction";
  if (isInPath(value, "res/campaign")) return "campaign";
  if (isInPath(value, "res/scripts/mission")) return "mission";
  if (
    isInPath(value, "res/config/ui") ||
    isInPath(value, "res/config/style_sheet") ||
    isInPath(value, "res/textures/ui")
  ) {
    return "ui";
  }
  if (
    isInPath(value, "res/config/climate") ||
    isInPath(value, "res/config/environment") ||
    isInPath(value, "res/config/grass") ||
    isInPath(value, "res/textures/environment")
  ) {
    return "environment";
  }
  if (
    value.includes("terrain") ||
    value.includes("ground_texture") ||
    value.includes("auto_ground_tex")
  ) {
    return "terrain";
  }
  if (value.includes("/config/track/")) return "track";
  if (value.includes("/config/street/")) return "street";
  if (value.includes("/model/signal/") || value.includes("/models/model/signal/")) {
    return "signal";
  }
  if (value.includes("/station/")) return "station";
  if (value.endsWith(".mdl")) return "model";
  if (value.endsWith(".msh") || value.endsWith(".msh.blob")) return "mesh";
  if (value.endsWith(".mtl")) return "material";
  if (value.endsWith(".ani")) return "animation";
  if (
    value.endsWith(".tga") ||
    value.endsWith(".dds") ||
    value.endsWith(".png") ||
    value.endsWith(".jpg") ||
    value.endsWith(".jpeg")
  ) {
    return "texture";
  }
  if (value.endsWith(".wav") || value.endsWith(".ogg")) return "sound";
  if (value.endsWith(".vs") || value.endsWith(".fs")) return "shader";
  if (value.endsWith(".ttf") || value.endsWith(".otf")) return "font";
  if (value.endsWith(".lua")) return "lua";
  return "other";
}

/**
 * Small deterministic hash for indexed text. It is not a security primitive;
 * it only prevents same-size, same-mtime edits from being treated as unchanged.
 */
function hashText(content: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fingerprint(file: ProjectFile): string {
  const contentFingerprint =
    file.text && file.content !== undefined ? hashText(file.content) : "binary";
  return `${file.size}:${Math.trunc(file.modifiedMs)}:${contentFingerprint}`;
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
        fingerprint: fingerprint(file)
      };
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));

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

  for (const [path, currentFingerprint] of after) {
    const oldFingerprint = before.get(path);
    if (oldFingerprint === undefined) added.push(path);
    else if (oldFingerprint !== currentFingerprint) changed.push(path);
    else unchanged += 1;
  }
  for (const path of before.keys()) {
    if (!after.has(path)) removed.push(path);
  }

  return { added, changed, removed, unchanged };
}
