import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildResourceIndex, diffResourceIndexes } from "./resource-index.js";
import { parseTf2Log } from "./log-parser.js";
import {
  createProjectNode,
  installProjectNode,
  readProjectFileNode,
  saveProjectFileNode,
  scanProjectNode
} from "./node-service.js";
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
      authors = { { name = "Mike", role = "CREATOR" } },
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
});

describe("real filesystem workflow", () => {
  it("creates, scans, edits, validates and safely installs a project", async () => {
    const workspace = await temporaryDirectory();
    const mods = path.join(workspace, "mods");
    await mkdir(mods);

    const created = await createProjectNode({
      parentDirectory: workspace,
      projectId: "mike_test_mod_1",
      displayName: "Mike Test Mod",
      author: "Mike",
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
      author: "Mike",
      mode: "vanilla"
    });
    await writeFile(path.join(workspace, "outside.txt"), "secret", "utf8");

    await expect(
      readProjectFileNode(created.rootPath, "../outside.txt")
    ).rejects.toThrow(/traversal/u);
  });
});
