// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CreatedProject,
  InstallationCandidate,
  InstallResult,
  ProjectSnapshot
} from "@tpf2-mod-studio/core";

import App from "./App";
import type { DesktopBridge } from "./bridge";

vi.mock("./MonacoEditor", () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="monaco-editor">{value}</div>
  )
}));

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: "en-US"
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const MOD_LUA = `function data()
  return {
    info = {
      name = _("Test"),
      description = _("modDesc"),
      authors = { { name = "Test Author", role = "CREATOR" } },
      minorVersion = 0,
    },
  }
end`;

function projectSnapshot(): ProjectSnapshot {
  return {
    rootPath: "/real/project/test_mod_1",
    folderName: "test_mod_1",
    mode: "vanilla",
    scannedAt: "2026-07-29T00:00:00.000Z",
    files: [
      {
        relativePath: "mod.lua",
        size: MOD_LUA.length,
        modifiedMs: 1,
        text: true,
        content: MOD_LUA
      },
      {
        relativePath: "res/models/model/vehicle/train/test.mdl",
        size: 2,
        modifiedMs: 1,
        text: true,
        content: "{}"
      }
    ]
  };
}

function bridge(native = true): DesktopBridge {
  return {
    isNative: native,
    chooseDirectory: vi.fn(async () => "/real/project/test_mod_1"),
    chooseLogFile: vi.fn(async () => null),
    chooseModArchive: vi.fn(async () => null),
    detectInstallations: vi.fn(async (): Promise<InstallationCandidate[]> => []),
    createProject: vi.fn(
      async (): Promise<CreatedProject> => ({
        rootPath: "/real/project/test_mod_1",
        projectId: "test_mod_1",
        mode: "vanilla"
      })
    ),
    scanProject: vi.fn(async () => projectSnapshot()),
    readProjectFile: vi.fn(async () => MOD_LUA),
    saveProjectFile: vi.fn(async () => undefined),
    installProject: vi.fn(
      async (): Promise<InstallResult> => ({
        installedPath: "/tf2/mods/test_mod_1",
        fileCount: 2
      })
    ),
    inspectModArchive: vi.fn(async () => ({
      archivePath: "/tmp/mod.zip",
      projectId: "sample_mod_1",
      hasModLua: true,
      entryCount: 3,
      modLuaPath: "mod.lua"
    })),
    importModArchive: vi.fn(
      async (): Promise<InstallResult> => ({
        installedPath: "/tf2/mods/sample_mod_1",
        fileCount: 3
      })
    ),
    readLog: vi.fn(async () => ""),
    launchGame: vi.fn(async () => 1234),
    checkForUpdate: vi.fn(async () => ({
      available: false,
      currentVersion: "0.1.0-alpha.3",
      latestVersion: "0.1.0-alpha.3",
      releaseTag: "",
      notes: "",
      downloadUrl: "",
      assetName: "",
      htmlUrl: ""
    })),
    applyUpdate: vi.fn(async () => "ok"),
    restartAfterUpdate: vi.fn(async () => undefined)
  };
}

describe("desktop workbench", () => {
  it("shows an honest preview state without fabricated project data", () => {
    render(<App bridge={bridge(false)} />);

    expect(
      screen.getByText("Create, validate, and install mods.")
    ).toBeTruthy();
    expect(screen.getByText("Browser preview")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Open project"
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(screen.queryByText("test_mod_1")).toBeNull();
  });

  it("opens a bridge-provided project and renders its real snapshot", async () => {
    const desktopBridge = bridge();
    render(<App bridge={desktopBridge} />);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(desktopBridge.chooseDirectory).toHaveBeenCalledWith(
        "Select a mod project folder"
      );
      expect(desktopBridge.scanProject).toHaveBeenCalledWith(
        "/real/project/test_mod_1"
      );
    });
    expect(screen.getByText("test_mod_1")).toBeTruthy();
    expect(screen.getByText("mod.lua")).toBeTruthy();
    expect(screen.getByText(/Loaded 2 project files/u)).toBeTruthy();
  });

  it("opens a text file and exposes the validation installation gate", async () => {
    render(<App bridge={bridge()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByText("mod.lua");

    fireEvent.click(screen.getByText("mod.lua"));
    expect((await screen.findByTestId("monaco-editor")).textContent).toContain(
      "function data()"
    );

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(screen.getByText("Ready")).toBeTruthy();
  });

  it("passes translated labels into the native log picker", async () => {
    const desktopBridge = bridge();
    render(<App bridge={desktopBridge} />);

    fireEvent.click(screen.getByRole("button", { name: "Game log" }));
    fireEvent.click(screen.getByRole("button", { name: "Open log…" }));

    await waitFor(() => {
      expect(desktopBridge.chooseLogFile).toHaveBeenCalledWith(
        "Select stdout.txt",
        "Log files"
      );
    });
  });

  it("renders root causes separately from linked log consequences", async () => {
    const desktopBridge = bridge();
    desktopBridge.chooseLogFile = vi.fn(async () => "/logs/stdout.txt");
    desktopBridge.readLog = vi.fn(
      async () =>
        [
          "ERROR error loading script file",
          `[string "mods/broken_mod_1/res/scripts/init.lua"]:9: module 'missing/module' not found:`,
          "stack traceback:",
          `  [string "mods/broken_mod_1/res/scripts/init.lua"]:9: in main chunk`,
          "ERROR Exception type: Lua exception"
        ].join("\n")
    );
    render(<App bridge={desktopBridge} />);

    fireEvent.click(screen.getByRole("button", { name: "Game log" }));
    fireEvent.click(screen.getByRole("button", { name: "Open log…" }));

    expect(
      await screen.findByText("Root-cause analysis complete")
    ).toBeTruthy();
    // Open the problem row to reveal cause/fix details.
    const detailButtons = screen.getAllByRole("button", {
      name: /Details/u
    });
    fireEvent.click(detailButtons[0]!);
    expect(await screen.findByText(/Check the module path/u)).toBeTruthy();
    expect(screen.getAllByText(/Root cause/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Follow-up/u).length).toBeGreaterThan(0);
  });

  it("switches to German and persists the explicit language selection", () => {
    const firstRender = render(<App bridge={bridge(false)} />);

    expect(document.documentElement.lang).toBe("en");
    fireEvent.click(screen.getByRole("button", { name: "German" }));
    expect(
      screen.getByText("Mods erstellen, prüfen und installieren.")
    ).toBeTruthy();
    expect(document.documentElement.lang).toBe("de");
    expect(
      window.localStorage.getItem("tpf2-mod-studio.language.v1")
    ).toBe("de");

    firstRender.unmount();
    render(<App bridge={bridge(false)} />);
    expect(screen.getByText("Browser-Vorschau")).toBeTruthy();
  });
});
