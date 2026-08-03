import { describe, expect, it } from "vitest";

import type { InstallationCandidate } from "@tpf2-mod-studio/core";

import {
  buildManualInstallation,
  EMPTY_MANUAL_PATHS,
  MANUAL_PATHS_STORAGE_KEY,
  mergeInstallationCandidates,
  readManualPaths,
  writeManualPaths
} from "./manualPaths";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("manual Transport Fever 2 paths", () => {
  it("persists normalized Windows paths", () => {
    const storage = new MemoryStorage();
    const saved = writeManualPaths(
      {
        gameRoot: " D:\\SteamLibrary\\steamapps\\common\\Transport Fever 2\\ ",
        userDataPath: "C:\\Steam\\userdata\\1\\1066780\\local\\",
        modsPath: "C:\\Steam\\userdata\\1\\1066780\\local\\mods\\"
      },
      storage
    );

    expect(saved.gameRoot).toBe(
      "D:\\SteamLibrary\\steamapps\\common\\Transport Fever 2"
    );
    expect(readManualPaths(storage)).toEqual(saved);
    expect(storage.getItem(MANUAL_PATHS_STORAGE_KEY)).not.toBeNull();
  });

  it("creates a manual installation candidate used before detected defaults", () => {
    const manual = buildManualInstallation({
      gameRoot: "D:\\Games\\Transport Fever 2",
      userDataPath: "C:\\Steam\\userdata\\1\\1066780\\local",
      modsPath: "C:\\Steam\\userdata\\1\\1066780\\local\\mods"
    });
    expect(manual).toMatchObject({
      rootPath: "D:\\Games\\Transport Fever 2",
      executablePath: "D:\\Games\\Transport Fever 2\\TransportFever2.exe",
      source: "manual",
      valid: true
    });

    const detected: InstallationCandidate = {
      rootPath: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Transport Fever 2",
      executablePath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Transport Fever 2\\TransportFever2.exe",
      source: "steam-default",
      valid: true
    };
    expect(mergeInstallationCandidates([detected], manual)[0]?.source).toBe(
      "manual"
    );
  });

  it("does not add an empty manual candidate", () => {
    expect(buildManualInstallation(EMPTY_MANUAL_PATHS)).toBeUndefined();
  });
});
