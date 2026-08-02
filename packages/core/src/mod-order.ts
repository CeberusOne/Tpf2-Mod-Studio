import { parseLuaData, type LuaValue } from "./lua-data.js";

/**
 * How a mod is addressed in a Transport Fever 2 preset.
 *
 * - `workshop` — `*<steam file id>`, the folder name is that numeric id
 * - `priority` — `!<id>`, the game loads these before the rest
 * - `local` — a plain folder id
 */
export type ModRefKind = "workshop" | "priority" | "local";

export interface ModRef {
  /** Id exactly as it appears in a preset, including any prefix. */
  raw: string;
  /** Id without the `*` or `!` prefix. */
  id: string;
  kind: ModRefKind;
}

/** A declared dependency, classified by how far it can be trusted. */
export type DependencyKind =
  /** Resolves to an installed mod. */
  | "satisfied"
  /** Looks like a mod id but nothing installed matches it. */
  | "missing"
  /** The author wrote a download link instead of an id. */
  | "link"
  /** Neither a usable id nor a link. */
  | "unusable";

export interface DependencyFinding {
  /** The mod that declares the dependency. */
  dependent: string;
  /** The raw declaration as written in `mod.lua`. */
  declared: string;
  kind: DependencyKind;
  /** Installed mod that satisfies it, when one does. */
  resolvedTo?: string;
  /** Why this could not be decided with certainty, when it could not. */
  uncertainty?: string;
}

export interface InstalledModInfo {
  id: string;
  source: string;
  /** Declared `dependencies` and `requiredMods` entries, verbatim. */
  dependencies: string[];
  /** Whether the user selected this mod for the savegame. */
  selected?: boolean;
}

export interface ModOrderResult {
  /** Selected mods in a load order that satisfies every resolved dependency. */
  order: string[];
  /** Mods pulled in because something selected depends on them. */
  addedForDependencies: string[];
  findings: DependencyFinding[];
  /** Dependencies that must be installed before this selection is complete. */
  missing: string[];
  /** Declarations that could not be checked; listed rather than hidden. */
  unverifiable: DependencyFinding[];
  /** Dependency cycles, which have no valid load order. */
  cycles: string[][];
}

/** Split a preset id into its prefix and bare id. */
export function parseModRef(raw: string): ModRef {
  if (raw.startsWith("*")) {
    return { raw, id: raw.slice(1), kind: "workshop" };
  }
  if (raw.startsWith("!")) {
    return { raw, id: raw.slice(1), kind: "priority" };
  }
  return { raw, id: raw, kind: "local" };
}

const URL_PATTERN = /^(?:https?:\/\/|www\.)/iu;
// A TF2 mod folder id: lower/upper letters, digits, `_`, `-`, `.`
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u;

/**
 * Decide what a declared dependency actually is.
 *
 * Mod authors frequently put a download URL in `dependencies` instead of an
 * id. Treating those as missing mods produces false alarms, so they are
 * reported as links.
 */
export function classifyDependency(
  declared: string,
  installedIds: ReadonlySet<string>
): { kind: DependencyKind; resolvedTo?: string; uncertainty?: string } {
  const value = declared.trim();
  if (value.length === 0) {
    return { kind: "unusable", uncertainty: "The declaration is empty." };
  }
  if (URL_PATTERN.test(value)) {
    return {
      kind: "link",
      uncertainty:
        "The author declared a download link instead of a mod id, so it cannot be matched against installed mods."
    };
  }
  if (installedIds.has(value)) {
    return { kind: "satisfied", resolvedTo: value };
  }
  // TF2 mod folders end in a major-version suffix. A declaration may omit it
  // or name a different major version of the same mod.
  const base = value.replace(/_[0-9]+$/u, "");
  for (const candidate of installedIds) {
    if (candidate.replace(/_[0-9]+$/u, "") === base) {
      return {
        kind: "satisfied",
        resolvedTo: candidate,
        ...(candidate === value
          ? {}
          : {
              uncertainty: `Matched \`${candidate}\`, which differs from the declared major version.`
            })
      };
    }
  }
  if (!ID_PATTERN.test(value)) {
    return {
      kind: "unusable",
      uncertainty:
        "The declaration is neither a usable mod id nor a link, so nothing can be checked."
    };
  }
  return {
    kind: "missing",
    uncertainty:
      "No installed mod matches this id. Workshop mods live in numeric folders, so a mod installed from the Workshop may still satisfy it."
  };
}

/**
 * Order the selected mods so every resolved dependency loads first, and report
 * what could not be satisfied.
 *
 * Mods marked `priority` keep their place at the front, matching how Transport
 * Fever 2 treats the `!` prefix.
 */
export function planModOrder(
  installed: readonly InstalledModInfo[],
  selectedIds: readonly string[]
): ModOrderResult {
  const byId = new Map(installed.map((mod) => [mod.id, mod]));
  const installedIds = new Set(byId.keys());
  const findings: DependencyFinding[] = [];
  const missing = new Set<string>();

  // Pull in dependencies of the selection, transitively.
  const wanted = new Set(selectedIds.filter((id) => byId.has(id)));
  const added = new Set<string>();
  const queue = [...wanted];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const mod = byId.get(current);
    if (mod === undefined) continue;
    for (const declared of mod.dependencies) {
      const verdict = classifyDependency(declared, installedIds);
      findings.push({
        dependent: current,
        declared,
        kind: verdict.kind,
        ...(verdict.resolvedTo === undefined
          ? {}
          : { resolvedTo: verdict.resolvedTo }),
        ...(verdict.uncertainty === undefined
          ? {}
          : { uncertainty: verdict.uncertainty })
      });
      if (verdict.kind === "missing") {
        missing.add(declared);
        continue;
      }
      const target = verdict.resolvedTo;
      if (target === undefined || wanted.has(target)) continue;
      wanted.add(target);
      added.add(target);
      queue.push(target);
    }
  }

  // Depth-first topological order; dependencies emitted before dependents.
  const order: string[] = [];
  const state = new Map<string, 1 | 2>();
  const cycles: string[][] = [];

  function visit(id: string, stack: string[]): void {
    const seen = state.get(id);
    if (seen === 2) return;
    if (seen === 1) {
      cycles.push([...stack.slice(stack.indexOf(id)), id]);
      return;
    }
    state.set(id, 1);
    stack.push(id);
    const mod = byId.get(id);
    for (const declared of mod?.dependencies ?? []) {
      const verdict = classifyDependency(declared, installedIds);
      if (verdict.resolvedTo !== undefined && wanted.has(verdict.resolvedTo)) {
        visit(verdict.resolvedTo, stack);
      }
    }
    stack.pop();
    state.set(id, 2);
    order.push(id);
  }

  // Priority mods first, then the rest in a stable order.
  const sorted = [...wanted].sort((left, right) => {
    const l = byId.get(left)?.source === "priority" ? 0 : 1;
    const r = byId.get(right)?.source === "priority" ? 0 : 1;
    return l - r || left.localeCompare(right);
  });
  for (const id of sorted) visit(id, []);

  return {
    order,
    addedForDependencies: [...added].sort(),
    findings,
    missing: [...missing].sort(),
    unverifiable: findings.filter(
      (finding) => finding.kind === "link" || finding.kind === "unusable"
    ),
    cycles
  };
}

function asRecord(value: LuaValue | undefined): Record<string, LuaValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, LuaValue>)
    : {};
}

export interface PresetEntry {
  ref: ModRef;
  name?: string;
  majorVersion?: number;
  minorVersion?: number;
}

/** Read a `mod_presets/*.lua` file into its ordered entries. */
export function parseModPreset(content: string): PresetEntry[] {
  const data = parseLuaData(content);
  const descs = asRecord(data)["modDescs"];
  if (!Array.isArray(descs)) return [];
  const entries: PresetEntry[] = [];
  for (const item of descs) {
    const record = asRecord(item);
    const id = record["id"];
    if (typeof id !== "string") continue;
    const info = asRecord(record["info"]);
    const name = info["name"];
    const major = record["majorVersion"];
    const minor = info["minorVersion"];
    entries.push({
      ref: parseModRef(id),
      ...(typeof name === "string" ? { name } : {}),
      ...(typeof major === "number" ? { majorVersion: major } : {}),
      ...(typeof minor === "number" ? { minorVersion: minor } : {})
    });
  }
  return entries;
}

function escapeLua(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

/**
 * Render a preset in the shape Transport Fever 2 writes itself.
 *
 * Only `id` and `majorVersion` steer loading; the `info` block is metadata the
 * game shows in its mod list. Entries are emitted in the given order, which is
 * the load order.
 */
export function buildModPresetLua(entries: readonly PresetEntry[]): string {
  const lines: string[] = ["function data()", "return {", "\tmodDescs = {"];
  for (const entry of entries) {
    lines.push("\t\t{");
    lines.push(`\t\t\tid = "${escapeLua(entry.ref.raw)}",`);
    lines.push("\t\t\tinfo = {");
    if (entry.name !== undefined) {
      lines.push(`\t\t\t\tname = _("${escapeLua(entry.name)}"),`);
    }
    lines.push(
      `\t\t\t\tminorVersion = ${entry.minorVersion ?? 0},`
    );
    lines.push("\t\t\t},");
    lines.push(`\t\t\tmajorVersion = ${entry.majorVersion ?? 1},`);
    lines.push("\t\t},");
  }
  lines.push("\t},", "}", "end", "");
  return lines.join("\n");
}
