import { parse } from "luaparse";

import { analyzeTf2Registrations } from "./modifier-analyzer.js";
import { normalizeResourcePath, portablePathKey } from "./path-utils.js";
import type {
  Diagnostic,
  ProjectFile,
  ProjectSnapshot,
  ValidationResult
} from "./types.js";

type LuaNode = {
  type?: string;
  identifier?: { name?: string };
  name?: string;
  body?: LuaNode[];
  arguments?: LuaNode[];
  fields?: LuaNode[];
  key?: { name?: string; value?: string };
  value?: LuaNode | string | number | boolean | null;
  loc?: { start?: { line?: number; column?: number } };
  [key: string]: unknown;
};

type LuaParseFailure = Error & {
  line?: number;
  column?: number;
};

const RESOURCE_REFERENCE_PATTERN =
  /(["'])([^"'\\\r\n]+\.(?:lua|con|mdl|msh(?:\.blob)?|mtl|tga|dds|wav|ani|fs|vs))\1/giu;

const TEXT_RESOURCE_EXTENSIONS = new Set([
  ".lua",
  ".con",
  ".mdl",
  ".mtl",
  ".ani",
  ".fs",
  ".vs",
  ".json",
  ".txt",
  ".md"
]);

function diagnostic(
  code: string,
  severity: Diagnostic["severity"],
  certainty: Diagnostic["certainty"],
  title: string,
  description: string,
  technicalCause: string,
  recommendedFix: string,
  location: Pick<
    Diagnostic,
    "file" | "resource" | "line" | "column"
  > = {}
): Diagnostic {
  const stableLocation = `${location.file ?? ""}:${location.line ?? ""}:${location.resource ?? ""}`;
  return {
    id: `${code}:${stableLocation}`,
    code,
    severity,
    certainty,
    title,
    description,
    technicalCause,
    recommendedFix,
    ...location
  };
}

function tableField(table: LuaNode | undefined, name: string): LuaNode | undefined {
  if (table?.type !== "TableConstructorExpression") return undefined;
  return table.fields?.find((field) => {
    if (field.type === "TableKeyString") return field.key?.name === name;
    if (field.type === "TableKey") {
      return field.key?.value === name || field.key?.name === name;
    }
    return false;
  });
}

function fieldValue(field: LuaNode | undefined): LuaNode | undefined {
  return field && typeof field.value === "object" && field.value !== null
    ? field.value
    : undefined;
}

function findDataTable(ast: LuaNode): LuaNode | undefined {
  const body = Array.isArray(ast.body) ? ast.body : [];
  const dataFunction = body.find(
    (node) =>
      node.type === "FunctionDeclaration" &&
      node.identifier?.name === "data"
  );
  const returnStatement = dataFunction?.body?.find(
    (node) => node.type === "ReturnStatement"
  );
  return returnStatement?.arguments?.[0];
}

function luaDiagnostics(file: ProjectFile): Diagnostic[] {
  if (file.content === undefined) return [];
  let ast: LuaNode;
  try {
    ast = parse(file.content, {
      comments: false,
      locations: true,
      luaVersion: "5.3"
    }) as unknown as LuaNode;
  } catch (error) {
    const failure = error as LuaParseFailure;
    return [
      diagnostic(
        "LUA_SYNTAX",
        "error",
        "confirmed",
        "Lua syntax error",
        failure.message,
        "The static Lua parser could not construct a syntax tree.",
        "Correct the reported syntax near this position. The mod script was not executed.",
        {
          file: file.relativePath,
          ...(failure.line === undefined ? {} : { line: failure.line }),
          ...(failure.column === undefined ? {} : { column: failure.column + 1 })
        }
      )
    ];
  }

  if (file.relativePath !== "mod.lua") return [];

  const dataTable = findDataTable(ast);
  if (dataTable?.type !== "TableConstructorExpression") {
    return [
      diagnostic(
        "MOD_DATA_MISSING",
        "error",
        "confirmed",
        "No mod data table",
        "`mod.lua` must define `function data()` and return a table.",
        "Transport Fever 2 reads the mod metadata from the table returned by `data()`.",
        "Add a `data()` function that returns the documented mod table.",
        { file: "mod.lua" }
      )
    ];
  }

  const info = fieldValue(tableField(dataTable, "info"));
  if (info?.type !== "TableConstructorExpression") {
    return [
      diagnostic(
        "MOD_INFO_MISSING",
        "error",
        "confirmed",
        "No mod info block",
        "The table returned by `data()` does not contain an `info` table.",
        "The documented TF2 mod structure stores its user-facing metadata in `info`.",
        "Add an `info = { ... }` table to `mod.lua`.",
        { file: "mod.lua" }
      )
    ];
  }

  const diagnostics: Diagnostic[] = [];
  for (const key of ["name", "description", "authors", "minorVersion"]) {
    if (!tableField(info, key)) {
      diagnostics.push(
        diagnostic(
          `MOD_INFO_${key.toUpperCase()}_MISSING`,
          key === "name" ? "error" : "warning",
          "confirmed",
          `Missing mod metadata: ${key}`,
          `The documented \`info\` block does not define \`${key}\`.`,
          "The metadata field was not found in the statically parsed info table.",
          `Add a valid \`${key}\` field to the \`info\` table.`,
          { file: "mod.lua" }
        )
      );
    }
  }
  return diagnostics;
}

function fileMap(snapshot: ProjectSnapshot): {
  exact: Set<string>;
  portable: Map<string, string[]>;
} {
  const exact = new Set<string>();
  const portable = new Map<string, string[]>();
  for (const file of snapshot.files) {
    const normalized = normalizeResourcePath(file.relativePath);
    exact.add(normalized);
    const key = portablePathKey(normalized);
    const matches = portable.get(key) ?? [];
    matches.push(normalized);
    portable.set(key, matches);
  }
  return { exact, portable };
}

function referenceCandidates(reference: string): string[] {
  const normalized = normalizeResourcePath(reference);
  if (normalized.startsWith("res/")) return [normalized];
  const lower = normalized.toLocaleLowerCase("en-US");
  const candidates = [normalized, `res/${normalized}`];
  if (lower.endsWith(".mdl")) {
    candidates.push(`res/models/model/${normalized}`);
  } else if (lower.endsWith(".mtl")) {
    candidates.push(`res/models/material/${normalized}`);
  } else if (lower.endsWith(".msh") || lower.endsWith(".msh.blob")) {
    candidates.push(`res/models/mesh/${normalized}`);
  } else if (lower.endsWith(".tga") || lower.endsWith(".dds")) {
    candidates.push(`res/textures/${normalized}`);
  } else if (lower.endsWith(".con")) {
    candidates.push(`res/construction/${normalized}`);
  }
  return candidates;
}

function resourceReferenceDiagnostics(
  snapshot: ProjectSnapshot
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { exact, portable } = fileMap(snapshot);
  const emitted = new Set<string>();

  for (const file of snapshot.files) {
    if (
      file.content === undefined ||
      !TEXT_RESOURCE_EXTENSIONS.has(extensionFor(file.relativePath))
    ) {
      continue;
    }

    // matchAll yields ascending offsets, so newlines are counted forward once
    // per file instead of re-slicing the whole content for every reference.
    let scannedUpTo = 0;
    let line = 1;

    for (const match of file.content.matchAll(RESOURCE_REFERENCE_PATTERN)) {
      const offset = match.index ?? 0;
      for (; scannedUpTo < offset; scannedUpTo += 1) {
        if (file.content.charCodeAt(scannedUpTo) === 10) line += 1;
      }

      const reference = match[2];
      if (reference === undefined || !reference.includes("/")) continue;
      const candidates = referenceCandidates(reference);
      if (candidates.some((candidate) => exact.has(candidate))) continue;

      const caseMatch = candidates
        .flatMap((candidate) => portable.get(portablePathKey(candidate)) ?? [])
        .at(0);

      if (caseMatch !== undefined) {
        const key = `CASE:${file.relativePath}:${reference}:${line}`;
        if (emitted.has(key)) continue;
        emitted.add(key);
        diagnostics.push(
          diagnostic(
            "RESOURCE_CASE_MISMATCH",
            "error",
            "confirmed",
            "Resource path has different letter casing",
            `The reference \`${reference}\` resolves only as \`${caseMatch}\` when case is ignored.`,
            "Case-sensitive filesystems treat these as different paths.",
            `Change the reference to match \`${caseMatch}\` exactly and prefer lower-case filenames.`,
            {
              file: file.relativePath,
              resource: reference,
              line
            }
          )
        );
        continue;
      }

      const key = `MISSING:${file.relativePath}:${reference}:${line}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
      diagnostics.push(
        diagnostic(
          "RESOURCE_UNRESOLVED",
          "warning",
          "heuristic",
          "Resource is not present in this project",
          `No project file matches the reference \`${reference}\`.`,
          "The resource may be supplied by the base game or another mod; project-only evidence is insufficient.",
          "Verify the reference against the selected TF2 base-resource index and declared dependencies.",
          {
            file: file.relativePath,
            resource: reference,
            line
          }
        )
      );
    }
  }
  return diagnostics;
}

function extensionFor(relativePath: string): string {
  const lower = relativePath.toLocaleLowerCase("en-US");
  if (lower.endsWith(".msh.blob")) return ".msh.blob";
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? "" : lower.slice(dot);
}

function pathDiagnostics(snapshot: ProjectSnapshot): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const portable = new Map<string, string[]>();

  for (const file of snapshot.files) {
    const normalized = normalizeResourcePath(file.relativePath);
    const key = portablePathKey(normalized);
    const matches = portable.get(key) ?? [];
    matches.push(normalized);
    portable.set(key, matches);

    if (/[A-Z]/u.test(normalized)) {
      diagnostics.push(
        diagnostic(
          "NON_LOWERCASE_PATH",
          "warning",
          "official-guidance",
          "Upper-case character in resource path",
          `\`${normalized}\` is not fully lower-case.`,
          "The official TF2 resource guidance recommends lower-case filenames to avoid case-sensitive filesystem issues.",
          "Rename the path to lower-case and update every reference.",
          { file: normalized }
        )
      );
    }
  }

  for (const matches of portable.values()) {
    if (matches.length < 2) continue;
    diagnostics.push(
      diagnostic(
        "PORTABLE_PATH_COLLISION",
        "error",
        "confirmed",
        "Cross-platform filename collision",
        `These files differ only by portable case or Unicode normalization: ${matches.join(", ")}.`,
        "Windows and Linux may resolve the paths differently, making the mod non-portable.",
        "Rename the files to unique lower-case paths and update their references.",
        { file: matches[0]! }
      )
    );
  }
  return diagnostics;
}

export function validateProject(snapshot: ProjectSnapshot): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  const modLua = snapshot.files.find(
    (file) => normalizeResourcePath(file.relativePath) === "mod.lua"
  );

  if (modLua === undefined) {
    const nested = snapshot.files.find((file) =>
      normalizeResourcePath(file.relativePath).endsWith("/mod.lua")
    );
    diagnostics.push(
      diagnostic(
        "MOD_LUA_MISSING",
        "error",
        "confirmed",
        "Missing root mod.lua",
        nested === undefined
          ? "No `mod.lua` exists at the project root."
          : `A nested \`${nested.relativePath}\` exists, but TF2 requires \`mod.lua\` directly below the mod folder.`,
        "Transport Fever 2 identifies a mod by the root-level `mod.lua` file.",
        "Place `mod.lua` directly in the mod project root.",
        nested === undefined ? {} : { file: nested.relativePath }
      )
    );
  }

  for (const file of snapshot.files) {
    if (
      file.text &&
      file.content !== undefined &&
      [".lua", ".con"].includes(extensionFor(file.relativePath))
    ) {
      diagnostics.push(...luaDiagnostics(file));
    }
  }
  diagnostics.push(...pathDiagnostics(snapshot));
  diagnostics.push(...resourceReferenceDiagnostics(snapshot));
  if (modLua?.content !== undefined) {
    diagnostics.push(...analyzeTf2Registrations(modLua.content).diagnostics);
  }

  if (!/^[a-z0-9][a-z0-9_-]*_[1-9][0-9]*$/u.test(snapshot.folderName)) {
    diagnostics.push(
      diagnostic(
        "MOD_FOLDER_CONVENTION",
        "warning",
        "official-guidance",
        "Non-standard mod folder name",
        `\`${snapshot.folderName}\` does not end in a positive major-version suffix such as \`_1\`.`,
        "TF2 uses the mod folder's major-version suffix to distinguish installed versions.",
        "Use a lower-case identifier ending in `_1` or another positive major version."
      )
    );
  }

  diagnostics.sort((left, right) => {
    const rank = { error: 0, warning: 1, info: 2 };
    return (
      rank[left.severity] - rank[right.severity] ||
      (left.file ?? "").localeCompare(right.file ?? "") ||
      left.code.localeCompare(right.code)
    );
  });

  const errorCount = diagnostics.filter(
    (item) => item.severity === "error"
  ).length;
  const warningCount = diagnostics.filter(
    (item) => item.severity === "warning"
  ).length;
  const infoCount = diagnostics.filter(
    (item) => item.severity === "info"
  ).length;

  return {
    diagnostics,
    errorCount,
    warningCount,
    infoCount,
    canInstall: errorCount === 0
  };
}
