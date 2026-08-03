import { analyzeTf2Registrations } from "./modifier-analyzer.js";
import type {
  Diagnostic,
  LibraryItemKind,
  ModHealth,
  ModHealthStatus
} from "./types.js";
import { folderNameDiagnostics, modLuaDiagnostics } from "./validator.js";

/**
 * Traffic-light state for an installed mod, derived from its root `mod.lua`
 * and folder name alone.
 *
 * This deliberately runs no resource-reference or path-collision checks: those
 * need a full directory scan, and running them for every installed mod would
 * turn a 0.3 s library scan into minutes. Use [`validateProject`] on a scanned
 * snapshot for the complete picture when the user asks for one mod's details.
 *
 * - `error` — Transport Fever 2 cannot load the mod (no root `mod.lua`, broken
 *   Lua syntax, no `data()` table, no `info` block, missing name, or a broken
 *   modifier/filter contract).
 * - `warning` — the mod loads, but something documented is missing or
 *   non-standard.
 * - `ok` — no finding from the checks that a single `mod.lua` supports.
 */
export function classifyModHealth(input: {
  folderName: string;
  modLua?: string | undefined;
  /** Scan source; `workshop` folders are named by Steam, not by the author. */
  source?: string | undefined;
  /** Staging projects/scripts are library content, not necessarily TF2 mods. */
  kind?: LibraryItemKind | undefined;
}): ModHealth {
  const diagnostics: Diagnostic[] = [];

  if (input.kind !== undefined && input.kind !== "mod") {
    return {
      status: "ok",
      errorCount: 0,
      warningCount: 0,
      unprovenCount: 0,
      diagnostics
    };
  }

  if (input.modLua === undefined) {
    diagnostics.push({
      id: "MOD_LUA_MISSING:mod.lua::",
      code: "MOD_LUA_MISSING",
      severity: "error",
      certainty: "confirmed",
      title: "Missing root mod.lua",
      description: "No `mod.lua` exists directly below the mod folder.",
      technicalCause:
        "Transport Fever 2 identifies a mod by the root-level `mod.lua` file. Without it the folder is ignored.",
      recommendedFix:
        "Place `mod.lua` directly in the mod folder, or remove the folder if it is not a mod.",
      file: "mod.lua"
    });
  } else {
    diagnostics.push(...modLuaDiagnostics(input.modLua));
    // Registration analysis returns nothing when the Lua does not parse, so the
    // syntax error above stays the single reported cause.
    diagnostics.push(...analyzeTf2Registrations(input.modLua).diagnostics);
  }
  // Steam Workshop folders are numeric publish IDs assigned by Steam, so the
  // mod-folder naming convention cannot apply to them. Measured on a real
  // library, applying it anyway produced 618 warnings that no author can act on.
  if (input.source !== "workshop") {
    diagnostics.push(...folderNameDiagnostics(input.folderName));
  }

  // The light must reflect what was proven, not what could not be checked.
  // `heuristic` findings such as TF2_CALLBACK_UNRESOLVED only say the callback
  // lives in another file, which is normal for third-party mods and says
  // nothing about whether the mod runs. They stay in `diagnostics` so the
  // detail view can show them, but they never colour the light.
  const proven = diagnostics.filter((item) => item.certainty !== "heuristic");
  const errorCount = proven.filter(
    (item) => item.severity === "error"
  ).length;
  const warningCount = proven.filter(
    (item) => item.severity === "warning"
  ).length;
  const unprovenCount = diagnostics.length - proven.length;
  const status: ModHealthStatus =
    errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "ok";

  return { status, errorCount, warningCount, unprovenCount, diagnostics };
}
