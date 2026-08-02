import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { analyzeTf2Log, parseTf2Log } from "./log-parser.js";
import { classifyModHealth } from "./mod-health.js";
import { parseLuaData } from "./lua-data.js";
import {
  decodeTf2Mesh,
  parseTf2Mesh,
  parseTf2Model
} from "./model-format.js";
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

describe("mod health classification", () => {
  it("does not reject a mod.lua that starts with a byte order mark", () => {
    // 225 of 709 installed mod.lua files in a real library start with a BOM.
    // Reporting those as syntax errors blocked installation of valid mods.
    const withBom = `﻿${VALID_MOD_LUA}`;
    expect(classifyModHealth({ folderName: "sample_mod_1", modLua: withBom }))
      .toEqual(expect.objectContaining({ status: "ok", errorCount: 0 }));

    const result = validateProject(
      snapshot([
        {
          relativePath: "mod.lua",
          size: withBom.length,
          modifiedMs: 1,
          text: true,
          content: withBom
        }
      ])
    );
    expect(result.diagnostics.map((item) => item.code)).not.toContain(
      "LUA_SYNTAX"
    );
    expect(result.canInstall).toBe(true);
  });

  it("reports a mod without mod.lua as not loadable", () => {
    const health = classifyModHealth({ folderName: "broken_mod_1" });
    expect(health.status).toBe("error");
    expect(health.diagnostics[0]?.code).toBe("MOD_LUA_MISSING");
  });

  it("treats missing optional metadata as runnable with issues", () => {
    const minimal = `function data()
  return { info = { name = _("Only a name") } }
end`;
    const health = classifyModHealth({
      folderName: "sample_mod_1",
      modLua: minimal
    });
    expect(health.status).toBe("warning");
    expect(health.errorCount).toBe(0);
    expect(health.warningCount).toBeGreaterThan(0);
  });

  it("keeps unprovable findings out of the light but not out of the details", () => {
    const dynamicCallback = `function data()
  return {
    info = {
      name = _("Dynamic"),
      description = _("d"),
      authors = { { name = "A", role = "CREATOR" } },
      minorVersion = 0,
    },
    runFn = function(settings, modParams)
      addModifier("loadModel", someExternalFunction)
    end,
  }
end`;
    const health = classifyModHealth({
      folderName: "sample_mod_1",
      modLua: dynamicCallback
    });

    expect(health.status).toBe("ok");
    expect(health.unprovenCount).toBeGreaterThan(0);
    expect(health.diagnostics.map((item) => item.code)).toContain(
      "TF2_CALLBACK_UNRESOLVED"
    );
  });

  it("does not apply the folder convention to Steam Workshop ids", () => {
    // Workshop folders are numeric publish ids assigned by Steam.
    const workshop = classifyModHealth({
      folderName: "2817689128",
      source: "workshop",
      modLua: VALID_MOD_LUA
    });
    const local = classifyModHealth({
      folderName: "2817689128",
      source: "local",
      modLua: VALID_MOD_LUA
    });

    expect(workshop.status).toBe("ok");
    expect(local.diagnostics.map((item) => item.code)).toContain(
      "MOD_FOLDER_VERSION_SUFFIX"
    );
  });

  it("does not claim a missing suffix for a folder that plainly has one", () => {
    // `Autobahn_Kreuz_1` ends in `_1`; only its capitals break the convention.
    // Reporting a missing version suffix sent people looking for the wrong thing.
    const health = classifyModHealth({
      folderName: "Autobahn_Kreuz_1",
      source: "local",
      modLua: VALID_MOD_LUA
    });
    const codes = health.diagnostics.map((item) => item.code);

    expect(codes).toContain("MOD_FOLDER_CHARACTERS");
    expect(codes).not.toContain("MOD_FOLDER_VERSION_SUFFIX");
    expect(
      health.diagnostics.find(
        (item) => item.code === "MOD_FOLDER_CHARACTERS"
      )?.description
    ).toContain("has the expected version suffix");
  });

  it("accepts a fully lower-case folder with a version suffix", () => {
    expect(
      classifyModHealth({
        folderName: "sebbe_hv69signale_erw1_1",
        source: "local",
        modLua: VALID_MOD_LUA
      }).diagnostics.map((item) => item.code)
    ).toEqual([]);
  });
});

describe("Transport Fever 2 model formats", () => {
  it("reads a model's LODs, parts, bounding box and collider", () => {
    const mdl = `function data()
return {
  boundingInfo = {
    bbMax = { 1.5, 2, 3, },
    bbMin = { -1.5, -2, 0, },
  },
  collider = {
    params = { halfExtents = { 1.5, 2, 1.5, }, },
    transf = { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, },
    type = "BOX",
  },
  lods = {
    {
      node = {
        children = {
          {
            materials = { "vehicle/body.mtl", },
            mesh = "vehicle/body_lod0.msh",
            name = "body",
            transf = { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, },
            animations = { open_door = { type = "KEYFRAME", }, },
          },
        },
      },
      visibleFrom = 0,
      visibleTo = 200,
    },
  },
}
end`;
    const model = parseTf2Model(mdl);

    expect(model?.lods).toHaveLength(1);
    expect(model?.lods[0]?.parts[0]).toEqual({
      name: "body",
      mesh: "vehicle/body_lod0.msh",
      materials: ["vehicle/body.mtl"],
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      animations: ["open_door"]
    });
    expect(model?.lods[0]?.visibleTo).toBe(200);
    expect(model?.boundingBox?.min).toEqual([-1.5, -2, 0]);
    expect(model?.collider?.type).toBe("BOX");
    expect(model?.collider?.halfExtents).toEqual([1.5, 2, 1.5]);
  });

  it("resolves a mesh returned through a local variable", () => {
    // Some Workshop meshes assign the table first and return it afterwards.
    const msh = `local result = {
  subMeshes = { { indices = { position = { count = 12, offset = 40, }, }, }, },
  vertexAttr = { position = { count = 36, numComp = 3, offset = 0, }, },
}
return result`;
    const mesh = parseTf2Mesh(msh);

    expect(mesh?.vertexAttr["position"]).toEqual({
      offset: 0,
      count: 36,
      numComp: 3
    });
    expect(mesh?.subMeshes[0]?.indices["position"]).toEqual({
      offset: 40,
      count: 12,
      numComp: 1
    });
  });

  it("decodes geometry using byte offsets, float positions and uint32 indices", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const blob = new ArrayBuffer(
      positions.byteLength + indices.byteLength
    );
    new Float32Array(blob, 0, positions.length).set(positions);
    new Uint32Array(blob, positions.byteLength, indices.length).set(indices);

    const decoded = decodeTf2Mesh(
      {
        vertexAttr: { position: { offset: 0, count: 36, numComp: 3 } },
        subMeshes: [{ indices: { position: { offset: 36, count: 12, numComp: 1 } } }]
      },
      blob
    );

    expect(decoded).toHaveLength(1);
    expect([...(decoded[0]?.positions ?? [])]).toEqual([...positions]);
    expect([...(decoded[0]?.indices ?? [])]).toEqual([0, 1, 2]);
  });

  it("refuses geometry whose indices address missing vertices", () => {
    const blob = new ArrayBuffer(48);
    new Uint32Array(blob, 36, 3).set([0, 1, 99]);
    const decoded = decodeTf2Mesh(
      {
        vertexAttr: { position: { offset: 0, count: 36, numComp: 3 } },
        subMeshes: [{ indices: { position: { offset: 36, count: 12, numComp: 1 } } }]
      },
      blob
    );

    expect(decoded).toHaveLength(0);
  });

  it("returns nothing for values a static reader cannot resolve", () => {
    // `require`-built transforms are computed at runtime; the Lua is never run.
    expect(parseLuaData(`function data() return computed() end`)).toBeUndefined();
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

  it("survives shredded slash-heavy lines from unsynchronized TF2 writes", () => {
    // TF2 writes stdout from several threads without locking, so lines get
    // interleaved into long slash-heavy fragments with no valid extension.
    // Those made the path regexes backtrack exponentially: a real 24 MB log
    // produced no result after 10 minutes. 16 segments alone took ~8 s before.
    const shredded = Array.from({ length: 40 }, (_, index) => {
      const segments = Array.from(
        { length: 24 },
        (_, part) => `sha${index}re${part}Steam`
      ).join("/");
      return `"h4e lod scaler change -> /home/mikeh/.local/${segments}/tail_no_extension`;
    });
    const analysis = analyzeTf2Log(
      ["ERROR attempt to index a nil value", ...shredded].join("\n")
    );

    expect(analysis.groups.length).toBeGreaterThan(0);
    // Real paths inside the same input are still attributed.
    const withFile = analyzeTf2Log(
      "ERROR mods/broken_1/res/scripts/init.lua:9: attempt to index a nil value"
    ).groups[0];
    expect(withFile?.file).toBe("mods/broken_1/res/scripts/init.lua");
    expect(withFile?.sourceLine).toBe(9);
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
