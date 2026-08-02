import { describe, expect, it } from "vitest";

import {
  assertSafeRelativePath,
  portablePathKey
} from "./path-utils.js";
import {
  buildResourceIndex,
  classifyResource,
  diffResourceIndexes
} from "./resource-index.js";
import type { ProjectSnapshot } from "./types.js";

function snapshot(
  files: ProjectSnapshot["files"]
): ProjectSnapshot {
  return {
    rootPath: "/fixtures/portable_mod_1",
    folderName: "portable_mod_1",
    mode: "vanilla",
    scannedAt: "2026-08-02T00:00:00.000Z",
    files
  };
}

describe("portable project paths", () => {
  it("accepts normal TF2 project paths and normalizes separators", () => {
    expect(
      assertSafeRelativePath("res\\models\\model\\vehicle\\train\\br185.mdl")
    ).toBe("res/models/model/vehicle/train/br185.mdl");
    expect(assertSafeRelativePath(".tpf2-studio/project.json")).toBe(
      ".tpf2-studio/project.json"
    );
  });

  it.each([
    "res/models/con",
    "res/models/aux.lua",
    "res/models/COM1.txt",
    "res/models/model.",
    "res/models/model ",
    "res/models/bad:name.mdl",
    "res/models/bad?.mdl"
  ])("rejects Windows-incompatible path %s", (value) => {
    expect(() => assertSafeRelativePath(value)).toThrow();
  });

  it("detects portable collisions caused by case, Unicode and trailing dots", () => {
    expect(portablePathKey("Res/Models/Café.mdl")).toBe(
      portablePathKey("res/models/cafe\u0301.mdl")
    );
    expect(portablePathKey("res/models/train.mdl.")).toBe(
      portablePathKey("res/models/train.mdl")
    );
  });
});

describe("TF2 resource classification", () => {
  it.each([
    ["res/construction/station/rail/platform.module", "module"],
    ["res/models/animation/vehicle/train/door.ani", "animation"],
    ["res/shaders2/model/vehicle.fs", "shader"],
    ["res/fonts/opensans.ttf", "font"],
    ["res/textures/ui/icons/test.tga", "ui"],
    ["res/scripts/mission/tutorial.lua", "mission"],
    ["res/campaign/01/campaign.lua", "campaign"],
    ["res/config/terrain_generators/default.lua", "terrain"],
    ["res/config/environment/temperate.lua", "environment"],
    ["res/strings/de/LC_MESSAGES/res.mo", "translation"]
  ] as const)("classifies %s as %s", (path, expected) => {
    expect(classifyResource(path)).toBe(expected);
  });

  it("detects same-size, same-mtime text edits", () => {
    const before = buildResourceIndex(
      snapshot([
        {
          relativePath: "mod.lua",
          size: 4,
          modifiedMs: 100,
          text: true,
          content: "aaaa"
        }
      ])
    );
    const after = buildResourceIndex(
      snapshot([
        {
          relativePath: "mod.lua",
          size: 4,
          modifiedMs: 100,
          text: true,
          content: "bbbb"
        }
      ])
    );

    expect(diffResourceIndexes(before, after)).toEqual({
      added: [],
      changed: ["mod.lua"],
      removed: [],
      unchanged: 0
    });
  });
});
