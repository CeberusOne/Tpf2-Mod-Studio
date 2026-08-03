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

export interface DependencyOrderViolation {
  dependent: string;
  dependency: string;
  dependentPosition: number;
  dependencyPosition: number;
}

export interface ExtractedDependencyInfo {
  dependencies: string[];
  /** CommonAPI2 `requiredModsAnyLoadOrder = true`. */
  anyLoadOrder: boolean;
}

export interface InstalledModInfo {
  id: string;
  source: string;
  /** Declared `dependencies` and `requiredMods` entries, verbatim. */
  dependencies: string[];
  /** Include dependencies but do not impose an ordering edge. */
  dependenciesAnyLoadOrder?: boolean;
  /** Whether the user selected this mod for the savegame. */
  selected?: boolean;
}

export interface ModOrderResult {
  /**
   * Order as Transport Fever 2 displays it from top to bottom and as it is
   * written to `mod_presets`. The game evaluates the effective loading order
   * from the opposite direction, so dependencies appear below dependents here.
   */
  order: string[];
  /** Effective execution order: dependencies before the mods that need them. */
  loadOrder: string[];
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

function normalizedId(value: string): string {
  return parseModRef(value.trim()).id.toLocaleLowerCase("en-US");
}

function withoutMajorVersion(value: string): string {
  return normalizedId(value).replace(/_[0-9]+$/u, "");
}

/**
 * Decide what a declared dependency actually is.
 *
 * Matching is case-insensitive because Windows installations are commonly
 * case-insensitive and many real mods do not use the canonical casing.
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

  const bare = parseModRef(value).id;
  const normalized = normalizedId(bare);
  for (const candidate of installedIds) {
    if (normalizedId(candidate) === normalized) {
      return {
        kind: "satisfied",
        resolvedTo: candidate,
        ...(candidate === bare
          ? {}
          : {
              uncertainty: `Matched \`${candidate}\` case-insensitively.`
            })
      };
    }
  }

  // TF2 mod folders end in a major-version suffix. A declaration may omit it
  // or name a different major version of the same mod.
  const base = withoutMajorVersion(bare);
  for (const candidate of installedIds) {
    if (withoutMajorVersion(candidate) === base) {
      return {
        kind: "satisfied",
        resolvedTo: candidate,
        uncertainty: `Matched \`${candidate}\`, which differs from the declared major version.`
      };
    }
  }
  if (!ID_PATTERN.test(bare)) {
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

interface AssignedTable {
  name: "dependencies" | "requiredMods";
  body: string;
}

/** Read balanced Lua tables assigned to dependency fields without executing Lua. */
function assignedDependencyTables(source: string): AssignedTable[] {
  const results: AssignedTable[] = [];
  const assignment = /\b(dependencies|requiredMods)\s*=\s*\{/gu;
  for (const match of source.matchAll(assignment)) {
    const name = match[1] as AssignedTable["name"];
    const start = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;
    let quote: "\"" | "'" | undefined;
    let escaped = false;
    let lineComment = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];
      if (lineComment) {
        if (char === "\n") lineComment = false;
        continue;
      }
      if (quote !== undefined) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          quote = undefined;
        }
        continue;
      }
      if (char === "-" && next === "-") {
        lineComment = true;
        index += 1;
        continue;
      }
      if (char === "\"" || char === "'") {
        quote = char;
        continue;
      }
      if (char === "{") depth += 1;
      if (char !== "}") continue;
      depth -= 1;
      if (depth === 0) {
        results.push({ name, body: source.slice(start + 1, index) });
        break;
      }
    }
  }
  return results;
}

function unescapeLuaString(value: string): string {
  return value
    .replaceAll("\\\"", "\"")
    .replaceAll("\\'", "'")
    .replaceAll("\\\\", "\\")
    .trim();
}

function quotedValues(body: string): Array<{ value: string; index: number }> {
  const values: Array<{ value: string; index: number }> = [];
  const literal = /(["'])((?:\\.|(?!\1).)*)\1/gsu;
  for (const match of body.matchAll(literal)) {
    const value = unescapeLuaString(match[2] ?? "");
    if (value.length > 0) values.push({ value, index: match.index ?? 0 });
  }
  return values;
}

/**
 * Extract standard TF2 and CommonAPI2 dependency declarations from `mod.lua`.
 * This remains a static parser: dynamic values are intentionally not guessed.
 */
export function extractDependencyInfo(modLua: string): ExtractedDependencyInfo {
  const dependencies = new Set<string>();
  for (const table of assignedDependencyTables(modLua)) {
    if (table.name === "dependencies") {
      for (const literal of quotedValues(table.body)) {
        dependencies.add(literal.value);
      }
      continue;
    }

    const modId = /\bmodId\s*=\s*(["'])((?:\\.|(?!\1).)*)\1/gsu;
    for (const match of table.body.matchAll(modId)) {
      const value = unescapeLuaString(match[2] ?? "");
      if (value.length > 0) dependencies.add(value);
    }
    const steamId = /\bsteamId\s*=\s*(?:(["'])(\d+)\1|(\d+))/gu;
    for (const match of table.body.matchAll(steamId)) {
      const value = match[2] ?? match[3];
      if (value !== undefined) dependencies.add(value);
    }

    // CommonAPI2 also accepts direct string entries. Do not mistake metadata
    // fields such as `url` or `name` for dependencies.
    for (const literal of quotedValues(table.body)) {
      const before = table.body.slice(Math.max(0, literal.index - 40), literal.index);
      if (/\b(?:url|name|tfnetId)\s*=\s*$/iu.test(before)) continue;
      dependencies.add(literal.value);
    }
  }

  return {
    dependencies: [...dependencies],
    anyLoadOrder: /\brequiredModsAnyLoadOrder\s*=\s*true\b/iu.test(modLua)
  };
}

function resolveSelectedId(
  value: string,
  installedIds: ReadonlySet<string>
): string | undefined {
  const verdict = classifyDependency(value, installedIds);
  return verdict.resolvedTo;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * Order selected mods while preserving the order the user sees in Transport
 * Fever 2. `preferredGameOrder` is top-to-bottom. The effective load order is
 * the reverse direction, with dependency edges enforced first.
 */
export function planModOrder(
  installed: readonly InstalledModInfo[],
  selectedIds: readonly string[],
  preferredGameOrder: readonly string[] = selectedIds
): ModOrderResult {
  const byId = new Map(installed.map((mod) => [mod.id, mod]));
  const installedIds = new Set(byId.keys());
  const findings: DependencyFinding[] = [];
  const missing = new Set<string>();
  const resolvedDependencies = new Map<string, string[]>();

  const explicitlySelected = unique(
    selectedIds
      .map((id) => resolveSelectedId(id, installedIds))
      .filter((id): id is string => id !== undefined)
  );
  const wanted = new Set(explicitlySelected);
  const added = new Set<string>();
  const queue = [...explicitlySelected];

  // Pull in dependencies transitively and record one trusted edge list per mod.
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const mod = byId.get(current);
    if (mod === undefined) continue;
    const edges: string[] = [];
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
      if (target === undefined) continue;
      edges.push(target);
      if (!wanted.has(target)) {
        wanted.add(target);
        added.add(target);
        queue.push(target);
      }
    }
    resolvedDependencies.set(current, unique(edges));
  }

  const preferred = unique(
    preferredGameOrder
      .map((id) => resolveSelectedId(id, installedIds))
      .filter((id): id is string => id !== undefined && wanted.has(id))
  );
  for (const id of explicitlySelected) {
    if (!preferred.includes(id)) preferred.push(id);
  }
  for (const id of [...wanted].sort((left, right) => left.localeCompare(right))) {
    if (!preferred.includes(id)) preferred.push(id);
  }

  // `!` priority mods load before the rest and therefore appear at the bottom
  // of the visible TF2 list. Preserve relative order within both partitions.
  const gamePreference = [
    ...preferred.filter((id) => byId.get(id)?.source !== "priority"),
    ...preferred.filter((id) => byId.get(id)?.source === "priority")
  ];

  const loadOrder: string[] = [];
  const state = new Map<string, 1 | 2>();
  const cycles: string[][] = [];

  function visit(id: string, stack: string[]): void {
    const seen = state.get(id);
    if (seen === 2) return;
    if (seen === 1) {
      const cycleStart = stack.indexOf(id);
      cycles.push([...stack.slice(Math.max(0, cycleStart)), id]);
      return;
    }
    state.set(id, 1);
    stack.push(id);
    const mod = byId.get(id);
    if (!mod?.dependenciesAnyLoadOrder) {
      // Reverse declaration order because the final visible game list is the
      // reverse of this execution sequence.
      for (const dependency of [...(resolvedDependencies.get(id) ?? [])].reverse()) {
        if (wanted.has(dependency)) visit(dependency, stack);
      }
    }
    stack.pop();
    state.set(id, 2);
    loadOrder.push(id);
  }

  for (const id of [...gamePreference].reverse()) visit(id, []);
  const order = [...loadOrder].reverse();

  return {
    order,
    loadOrder,
    addedForDependencies: order.filter((id) => added.has(id)),
    findings,
    missing: [...missing].sort((left, right) => left.localeCompare(right)),
    unverifiable: findings.filter(
      (finding) => finding.kind === "link" || finding.kind === "unusable"
    ),
    cycles
  };
}

/**
 * Check a manually arranged TF2 list. In the visible top-to-bottom game list a
 * dependency must be below its dependent so it is evaluated first internally.
 */
export function findModOrderViolations(
  installed: readonly InstalledModInfo[],
  gameOrder: readonly string[]
): DependencyOrderViolation[] {
  const installedIds = new Set(installed.map((mod) => mod.id));
  const byId = new Map(installed.map((mod) => [mod.id, mod]));
  const positions = new Map<string, number>();
  gameOrder.forEach((raw, index) => {
    const resolved = resolveSelectedId(raw, installedIds);
    if (resolved !== undefined) positions.set(resolved, index);
  });

  const violations: DependencyOrderViolation[] = [];
  const seen = new Set<string>();
  for (const [dependent, dependentPosition] of positions) {
    const mod = byId.get(dependent);
    if (mod?.dependenciesAnyLoadOrder) continue;
    for (const declared of mod?.dependencies ?? []) {
      const dependency = classifyDependency(declared, installedIds).resolvedTo;
      if (dependency === undefined) continue;
      const dependencyPosition = positions.get(dependency);
      if (
        dependencyPosition === undefined ||
        dependencyPosition > dependentPosition
      ) {
        continue;
      }
      const key = `${dependent}\u0000${dependency}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        dependent,
        dependency,
        dependentPosition: dependentPosition + 1,
        dependencyPosition: dependencyPosition + 1
      });
    }
  }
  return violations;
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

/** Read a `mod_presets/*.lua` file into its visible top-to-bottom order. */
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
 * Render a preset in the same top-to-bottom order shown by Transport Fever 2.
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
    lines.push(`\t\t\t\tminorVersion = ${entry.minorVersion ?? 0},`);
    lines.push("\t\t\t},");
    lines.push(`\t\t\tmajorVersion = ${entry.majorVersion ?? 1},`);
    lines.push("\t\t},");
  }
  lines.push("\t},", "}", "end", "");
  return lines.join("\n");
}
