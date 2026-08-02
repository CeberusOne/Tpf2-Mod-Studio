import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_AI_SETTINGS,
  isAiConfigured,
  requestAiAssistance
} from "./ai-assist.js";
import { analyzeTf2Log, parseTf2Log } from "./log-parser.js";
import { analyzeTf2Registrations } from "./modifier-analyzer.js";
import {
  createProjectNode,
  installProjectNode,
  readProjectFileNode,
  saveProjectFileNode,
  scanProjectNode
} from "./node-service.js";
import { buildResourceIndex, diffResourceIndexes } from "./resource-index.js";
import {
  TF2_FILE_FILTER_CATEGORIES,
  TF2_LOAD_PIPELINE,
  TF2_RESOURCE_MODIFIERS
} from "./tf2-knowledge.js";
import type { ProjectSnapshot } from "./types.js";
import { validateProject } from "./validator.js";

const temporaryRoots: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "tpf2-core-test-"));
  temporaryRoots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

function snapshot(files: ProjectSnapshot["files"]): ProjectSnapshot {
  return {
    rootPath: "/fixtures/sample_mod_1",
    folderName: "sample_mod_1",
    mode: "vanilla",
    scannedAt: "2026-07-29T00:00:00.000Z",
    files
  };
}

const VALID_MOD_LUA = `function data()
  return {
    info = {
      name = _("Sample mod"),
      description = _("modDesc"),
      authors = { { name = "Test Author", role = "CREATOR" } },
      minorVersion = 0,
      severityAdd = "NONE",
      severityRemove = "WARNING",
    },
  }
end
`;

describe("Transport Fever 2 project validation", () => {
  it("accepts a minimal valid root mod", () => {
    const result = validateProject(
      snapshot([
        {
          relativePath: "mod.lua",
          size: VALID_MOD_LUA.length,
          modifiedMs: 1,
          text: true,
          content: VALID_MOD_LUA
        },
        {
          relativePath: "res/models/model/vehicle/train/test.mdl",
          size: 2,
          modifiedMs: 1,
          text: true,
          content: "{}"
        }
      ])
    );

    expect(result.errorCount).toBe(0);
    expect(result.canInstall).toBe(true);
  });

  it("reports Lua syntax with source position", () => {
    const result = validateProject(
      snapshot([
        {
          relativePath: "mod.lua",
          size: 20,
          modifiedMs: 1,
          text: true,
          content: "function data(\n return {}"
        }
      ])
    );

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "LUA_SYNTAX",
          severity: "error",
          certainty: "confirmed"
        })
      ])
    );
  });

  it("detects a resource case mismatch without claiming a missing dependency", () => {
    const model = `function data()
      return { materials = { "vehicle/train/Test.MTL" } }
    end`;
    const result = validateProject(
      snapshot([
        {
          relativePath: "mod.lua",
          size: VALID_MOD_LUA.length,
          modifiedMs: 1,
          text: true,
          content: VALID_MOD_LUA
        },
        {
          relativePath: "res/models/model/vehicle/train/test.mdl",
          size: model.length,
          modifiedMs: 1,
          text: true,
          content: model
        },
        {
          relativePath: "res/models/material/vehicle/train/test.mtl",
          size: 2,
          modifiedMs: 1,
          text: true,
          content: "{}"
        }
      ])
    );

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RESOURCE_CASE_MISMATCH",
          certainty: "confirmed"
        })
      ])
    );
  });

  it("marks an unresolved external-looking resource as heuristic", () => {
    const model = `function data()
      return { materials = { "vehicle/train/base_game.mtl" } }
    end`;
    const result = validateProject(
      snapshot([
        {
          relativePath: "mod.lua",
          size: VALID_MOD_LUA.length,
          modifiedMs: 1,
          text: true,
          content: VALID_MOD_LUA
        },
        {
          relativePath: "res/models/model/vehicle/train/test.mdl",
          size: model.length,
          modifiedMs: 1,
          text: true,
          content: model
        }
      ])
    );

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RESOURCE_UNRESOLVED",
          severity: "warning",
          certainty: "heuristic"
        })
      ])
    );
  });

  it("keeps reference line numbers exact across a large resource file", () => {
    const references = Array.from(
      { length: 500 },
      (_, index) => `    "vehicle/train/missing_${index}.mtl",`
    );
    const model = [
      "function data()",
      "  return { materials = {",
      ...references,
      "  } }",
      "end"
    ].join("\n");
    const result = validateProject(
      snapshot([
        {
          relativePath: "mod.lua",
          size: VALID_MOD_LUA.length,
          modifiedMs: 1,
          text: true,
          content: VALID_MOD_LUA
        },
        {
          relativePath: "res/models/model/vehicle/train/test.mdl",
          size: model.length,
          modifiedMs: 1,
          text: true,
          content: model
        }
      ])
    );

    const lines = result.diagnostics
      .filter((item) => item.code === "RESOURCE_UNRESOLVED")
      .map((item) => item.line);

    expect(lines).toHaveLength(references.length);
    expect(new Set(lines).size).toBe(references.length);
    expect(Math.min(...(lines as number[]))).toBe(3);
    expect(Math.max(...(lines as number[]))).toBe(references.length + 2);
  });

  it("blocks files that collide on Windows-compatible casing", () => {
    const result = validateProject(
      snapshot([
        {
          relativePath: "mod.lua",
          size: VALID_MOD_LUA.length,
          modifiedMs: 1,
          text: true,
          content: VALID_MOD_LUA
        },
        {
          relativePath: "res/textures/train/icon.tga",
          size: 1,
          modifiedMs: 1,
          text: false
        },
        {
          relativePath: "res/textures/train/Icon.tga",
          size: 1,
          modifiedMs: 1,
          text: false
        }
      ])
    );

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PORTABLE_PATH_COLLISION",
          severity: "error"
        })
      ])
    );
    expect(result.canInstall).toBe(false);
  });
});

describe("resource index", () => {
  it("reports added, changed and removed files deterministically", () => {
    const before = buildResourceIndex(
      snapshot([
        {
          relativePath: "mod.lua",
          size: 10,
          modifiedMs: 1,
          text: true,
          content: "before"
        },
        {
          relativePath: "old.txt",
          size: 2,
          modifiedMs: 1,
          text: true,
          content: "x"
        }
      ])
    );
    const after = buildResourceIndex(
      snapshot([
        {
          relativePath: "mod.lua",
          size: 11,
          modifiedMs: 2,
          text: true,
          content: "after"
        },
        {
          relativePath: "new.mdl",
          size: 2,
          modifiedMs: 1,
          text: true,
          content: "{}"
        }
      ])
    );

    expect(diffResourceIndexes(before, after)).toEqual({
      added: ["new.mdl"],
      changed: ["mod.lua"],
      removed: ["old.txt"],
      unchanged: 0
    });
  });

  it("indexes more than 800 mod resources without dropping entries", () => {
    const files = Array.from({ length: 810 }, (_, index) => ({
      relativePath: `res/models/model/vehicle/train/item_${index}.mdl`,
      size: index + 1,
      modifiedMs: 1,
      text: true,
      content: "{}"
    }));
    const index = buildResourceIndex(snapshot(files));

    expect(index.entries).toHaveLength(810);
    expect(index.counts.model).toBe(810);
  });
});

describe("optional AI assist", () => {
  it("defaults to disabled with no provider preselected", () => {
    expect(DEFAULT_AI_SETTINGS).toEqual({
      enabled: false,
      baseUrl: "",
      apiKey: "",
      model: ""
    });
    expect(isAiConfigured(DEFAULT_AI_SETTINGS)).toBe(false);
    expect(
      isAiConfigured({
        enabled: true,
        baseUrl: "https://example.invalid/v1",
        apiKey: "secret",
        model: "my-model"
      })
    ).toBe(true);
  });

  it("refuses requests when AI is not configured", async () => {
    await expect(
      requestAiAssistance(DEFAULT_AI_SETTINGS, "test")
    ).rejects.toThrow(/optional/i);
  });
});

describe("stdout.txt analysis", () => {
  it("groups repeated messages and preserves unknown-cause status", () => {
    const groups = parseTf2Log(
      [
        "[2026-07-29 10:00:00] ERROR mods/sample_mod_1/res/config/test.lua:42 failed",
        "[2026-07-29 10:00:01] ERROR mods/sample_mod_1/res/config/test.lua:42 failed",
        "WARNING fallback resource"
      ].join("\n")
    );

    expect(groups[0]).toEqual(
      expect.objectContaining({
        severity: "error",
        count: 2,
        sourceLine: 42,
        modId: "sample_mod_1",
        causeStatus: "unclassified"
      })
    );
    expect(groups[1]).toEqual(
      expect.objectContaining({ severity: "warning", count: 1 })
    );
  });

  it("identifies a Lua module root cause, stack, mod and consequences", async () => {
    const log = await readFile(
      path.join(
        process.cwd(),
        "packages/core/test-fixtures/logs/lua-module-chain.stdout.txt"
      ),
      "utf8"
    );
    const analysis = analyzeTf2Log(log);
    const root = analysis.groups.find(
      (group) => group.causeStatus === "root-cause"
    );
    const consequences = analysis.groups.filter(
      (group) => group.causeStatus === "consequence"
    );
    const warning = analysis.groups.find(
      (group) => group.severity === "warning"
    );

    expect(analysis).toEqual(
      expect.objectContaining({
        rootCauseCount: 1,
        consequenceCount: 2,
        warningCount: 1,
        unclassifiedErrorCount: 0,
        reliable: true
      })
    );
    expect(root).toEqual(
      expect.objectContaining({
        causeCode: "LUA_MODULE_NOT_FOUND",
        causeCertainty: "confirmed",
        file: "mods/broken_signals_1/res/scripts/signal_loader.lua",
        sourceLine: 17,
        modId: "broken_signals_1"
      })
    );
    expect(root?.stackTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "mods/broken_signals_1/res/scripts/signal_loader.lua",
          sourceLine: 17
        })
      ])
    );
    expect(consequences).toHaveLength(2);
    expect(consequences.every((group) => group.causedBy === root?.id)).toBe(
      true
    );
    expect(warning?.causeStatus).toBe("unclassified");
  });

  it("collects a long stack traceback into one event", () => {
    // Guards the linear event assembly. Rebuilding the event per appended
    // detail line was quadratic: this input took ~22 s before and ~18 ms after,
    // so Vitest's 5 s default timeout fails the test if the regression returns.
    const frames = Array.from(
      { length: 6_000 },
      (_, index) =>
        `  mods/deep_mod_1/res/scripts/frame_${index}.lua:${index + 1}: in function 'step'`
    );
    const analysis = analyzeTf2Log(
      ["ERROR attempt to index a nil value", "stack traceback:", ...frames].join(
        "\n"
      )
    );

    expect(analysis.groups).toHaveLength(1);
    expect(analysis.groups[0]).toEqual(
      expect.objectContaining({
        causeCode: "LUA_RUNTIME_NIL",
        causeStatus: "root-cause",
        firstLine: 1,
        lastLine: frames.length + 2,
        modId: "deep_mod_1"
      })
    );
    expect(analysis.groups[0]?.stackTrace).toHaveLength(frames.length);
  });

  it("keeps unknown error signatures explicitly unreliable", () => {
    const analysis = analyzeTf2Log(
      "ERROR engine state rejected request 42 without diagnostic context"
    );

    expect(analysis.reliable).toBe(false);
    expect(analysis.rootCauseCount).toBe(0);
    expect(analysis.unclassifiedErrorCount).toBe(1);
  });

  it("separates a CommonAPI2 compatibility cause from termination", async () => {
    const log = await readFile(
      path.join(
        process.cwd(),
        "packages/core/test-fixtures/logs/commonapi-build.stdout.txt"
      ),
      "utf8"
    );
    const analysis = analyzeTf2Log(log);

    expect(analysis.groups[0]).toEqual(
      expect.objectContaining({
        causeCode: "COMMONAPI2_BUILD_UNSUPPORTED",
        causeStatus: "root-cause"
      })
    );
    expect(analysis.groups[1]).toEqual(
      expect.objectContaining({
        causeStatus: "consequence",
        causedBy: analysis.groups[0]?.id
      })
    );
  });

  it("classifies real TF2 stdout without ERROR prefixes", async () => {
    const log = await readFile(
      path.join(
        process.cwd(),
        "packages/core/test-fixtures/logs/real-tf2-eatglobal.stdout.txt"
      ),
      "utf8"
    );
    const analysis = analyzeTf2Log(log);
    const moduleMissing = analysis.groups.find(
      (group) => group.causeCode === "LUA_MODULE_NOT_FOUND"
    );
    const missingEntry = analysis.groups.find(
      (group) => group.causeCode === "MOD_ENTRY_MISSING"
    );

    expect(analysis.rootCauseCount).toBeGreaterThanOrEqual(2);
    expect(analysis.unclassifiedErrorCount).toBe(0);
    expect(analysis.reliable).toBe(true);
    expect(moduleMissing).toEqual(
      expect.objectContaining({
        causeStatus: "root-cause",
        modId: "eat1963_tunnel_2"
      })
    );
    expect(moduleMissing?.stackTrace.length).toBeGreaterThan(0);
    expect(missingEntry).toEqual(
      expect.objectContaining({
        causeStatus: "root-cause",
        causeCode: "MOD_ENTRY_MISSING"
      })
    );
  });
});

describe("TF2 resource loading and modifier knowledge", () => {
  it("contains every officially documented vanilla modifier and filter category", () => {
    expect(TF2_RESOURCE_MODIFIERS.map(({ category }) => category)).toEqual([
      "loadModel",
      "loadModule",
      "loadStreet",
      "loadTrack",
      "loadBridge",
      "loadTunnel",
      "loadMultipleUnit",
      "loadRailroadCrossing",
      "loadTrafficLight",
      "loadConstruction",
      "loadConstructionCategory",
      "loadConstructionMenu",
      "loadClimate",
      "loadEnvironment",
      "loadTerrainMaterial",
      "loadTerrainGenerator",
      "loadGrass",
      "loadGroundTex",
      "loadCargoType",
      "loadSoundSet",
      "loadScript",
      "loadGameScript"
    ]);
    expect(TF2_FILE_FILTER_CATEGORIES).toHaveLength(24);
    expect(
      TF2_RESOURCE_MODIFIERS.every(
        (definition) =>
          definition.inputs[0] === "fileName" &&
          definition.inputs[1] === "data" &&
          definition.executionPhase === "resource-load" &&
          definition.returnContract.includes("resource data")
      )
    ).toBe(true);
  });

  it("models registration, resolution, filter, modifier and runtime phases", () => {
    expect(TF2_LOAD_PIPELINE.map(({ id }) => id)).toEqual([
      "mod-order",
      "run-fn",
      "resource-resolution",
      "filter-chain",
      "modifier-chain",
      "native-ingest",
      "post-run-fn",
      "game-script"
    ]);
  });

  it("accepts realistic modifier/filter registrations and preserves chain order", async () => {
    const content = await readFile(
      path.join(
        process.cwd(),
        "packages/core/test-fixtures/mods/valid_modifier_mod_1/mod.lua"
      ),
      "utf8"
    );
    const analysis = analyzeTf2Registrations(content);

    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.registrations).toEqual([
      expect.objectContaining({
        kind: "modifier",
        category: "loadBridge",
        callback: "doubleBridgeSpeed",
        insideRunFn: true,
        order: 1
      }),
      expect.objectContaining({
        kind: "file-filter",
        category: "model/vehicle",
        callback: "keepVehicles",
        insideRunFn: true,
        order: 2
      })
    ]);
  });

  it("blocks an unknown modifier category, wrong callback and registration phase", async () => {
    const content = await readFile(
      path.join(
        process.cwd(),
        "packages/core/test-fixtures/mods/broken_modifier_mod_1/mod.lua"
      ),
      "utf8"
    );
    const analysis = analyzeTf2Registrations(content);
    const codes = analysis.diagnostics.map(({ code }) => code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "TF2_REGISTRATION_OUTSIDE_RUNFN",
        "TF2_MODIFIER_CATEGORY_UNKNOWN",
        "TF2_CALLBACK_PARAMETERS",
        "TF2_MODIFIER_RETURN_MISSING"
      ])
    );
  });

  it("integrates modifier contract failures into the installation gate", () => {
    const broken = `function data()
  return {
    info = {
      name = _("Broken return"),
      description = _("modDesc"),
      authors = { { name = "Fixture", role = "CREATOR" } },
      minorVersion = 0,
    },
    runFn = function(settings, modParams)
      addModifier("loadModel", function(fileName, data)
        return nil
      end)
    end,
  }
end`;
    const result = validateProject(
      snapshot([
        {
          relativePath: "mod.lua",
          size: broken.length,
          modifiedMs: 1,
          text: true,
          content: broken
        }
      ])
    );

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TF2_MODIFIER_RETURN_INVALID",
          severity: "error"
        })
      ])
    );
    expect(result.canInstall).toBe(false);
  });
});

describe("real filesystem workflow", () => {
  it("creates, scans, edits, validates and safely installs a project", async () => {
    const workspace = await temporaryDirectory();
    const mods = path.join(workspace, "mods");
    await mkdir(mods);

    const created = await createProjectNode({
      parentDirectory: workspace,
      projectId: "test_author_mod_1",
      displayName: "Test Author Mod",
      author: "Test Author",
      mode: "vanilla"
    });
    let scanned = await scanProjectNode(created.rootPath);
    expect(validateProject(scanned).canInstall).toBe(true);

    const original = await readProjectFileNode(created.rootPath, "strings.lua");
    await saveProjectFileNode(
      created.rootPath,
      "strings.lua",
      original.replace("Describe this", "A real")
    );
    scanned = await scanProjectNode(created.rootPath);
    expect(
      scanned.files.find((file) => file.relativePath === "strings.lua")?.content
    ).toContain("A real");

    const installed = await installProjectNode(created.rootPath, mods, false);
    expect(installed.fileCount).toBeGreaterThanOrEqual(3);
    expect(await readFile(path.join(installed.installedPath, "mod.lua"), "utf8"))
      .toContain("function data()");
    await expect(
      installProjectNode(created.rootPath, mods, false)
    ).rejects.toThrow(/already exists/u);
    const replaced = await installProjectNode(created.rootPath, mods, true);
    expect(replaced.backupPath).toBeDefined();
  });

  it("rejects project path traversal before reading", async () => {
    const workspace = await temporaryDirectory();
    const created = await createProjectNode({
      parentDirectory: workspace,
      projectId: "secure_mod_1",
      displayName: "Secure Mod",
      author: "Test Author",
      mode: "vanilla"
    });
    await writeFile(path.join(workspace, "outside.txt"), "secret", "utf8");

    await expect(
      readProjectFileNode(created.rootPath, "../outside.txt")
    ).rejects.toThrow(/traversal/u);
  });
});
