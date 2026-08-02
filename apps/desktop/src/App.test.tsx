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
  InstalledMod,
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

// jsdom has no IntersectionObserver; report every observed card as visible so
// the lazy preview path actually runs in tests.
class TestIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
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
    chooseExportTarget: vi.fn(async () => "/exports/test_mod_1.zip"),
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
    restartAfterUpdate: vi.fn(async () => undefined),
    scanModLibrary: vi.fn(async (): Promise<InstalledMod[]> => []),
    readModPreview: vi.fn(async () => "data:image/jpeg;base64,AAAA"),
    listLogFiles: vi.fn(async () => []),
    archiveStdout: vi.fn(async () => "/tmp/stdout-archive.txt"),
    exportProjectZip: vi.fn(async () => "/exports/test_mod_1.zip"),
    ensureStagingDirectory: vi.fn(async () => "/tf2/userdata/staging_area")
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

  it("asks for an explicit ZIP target instead of writing beside the project", async () => {
    const desktopBridge = bridge();
    render(<App bridge={desktopBridge} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByText("mod.lua");

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    fireEvent.click(screen.getByRole("button", { name: "Export ZIP package" }));

    await waitFor(() => {
      expect(desktopBridge.chooseExportTarget).toHaveBeenCalledWith(
        "Save the mod ZIP as",
        "ZIP archives",
        "test_mod_1.zip"
      );
      expect(desktopBridge.exportProjectZip).toHaveBeenCalledWith(
        "/real/project/test_mod_1",
        "/exports/test_mod_1.zip"
      );
    });
  });

  it("creates staging_area before installing into it", async () => {
    const desktopBridge = bridge();
    desktopBridge.detectInstallations = vi.fn(
      async (): Promise<InstallationCandidate[]> => [
        {
          rootPath: "/tf2",
          executablePath: "/tf2/TransportFever2",
          userDataPath: "/tf2/userdata",
          source: "steam-default",
          valid: true
        }
      ]
    );
    render(<App bridge={desktopBridge} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByText("mod.lua");

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Install to staging_area" })
    );

    await waitFor(() => {
      expect(desktopBridge.ensureStagingDirectory).toHaveBeenCalledWith(
        "/tf2/userdata"
      );
      expect(desktopBridge.installProject).toHaveBeenCalledWith(
        "/real/project/test_mod_1",
        "/tf2/userdata/staging_area",
        false
      );
    });
  });

  it("separates workshop from local mods and lazy-loads their previews", async () => {
    const desktopBridge = bridge();
    desktopBridge.scanModLibrary = vi.fn(
      async (): Promise<InstalledMod[]> => [
        {
          id: "local_mod_1",
          path: "/tf2/userdata/mods/local_mod_1",
          source: "local",
          hasModLua: true,
          fileCount: 4
        },
        {
          id: "2817689128",
          path: "/steam/workshop/content/1066780/2817689128",
          source: "workshop",
          hasModLua: true,
          fileCount: 9,
          displayName: "Workshop Signals"
        }
      ]
    );
    render(<App bridge={desktopBridge} />);

    fireEvent.click(screen.getByRole("button", { name: "Mod library" }));
    fireEvent.click(screen.getByRole("button", { name: "Scan mod library" }));

    // Grouped under their own headings rather than one flat list.
    expect(await screen.findByText("Local mods")).toBeTruthy();
    expect(screen.getByText("Steam Workshop")).toBeTruthy();
    expect(screen.getByText("Workshop Signals")).toBeTruthy();

    await waitFor(() => {
      expect(desktopBridge.readModPreview).toHaveBeenCalledWith(
        "/steam/workshop/content/1066780/2817689128"
      );
      expect(
        (screen.getAllByRole("img")[0] as HTMLImageElement).src
      ).toContain("data:image/jpeg;base64,");
    });
  });

  it("shows a traffic light per mod and explains findings on Info", async () => {
    const desktopBridge = bridge();
    desktopBridge.scanModLibrary = vi.fn(
      async (): Promise<InstalledMod[]> => [
        {
          id: "healthy_mod_1",
          path: "/tf2/mods/healthy_mod_1",
          source: "local",
          hasModLua: true,
          fileCount: 4,
          modLua: MOD_LUA
        },
        {
          id: "broken_mod_1",
          path: "/tf2/mods/broken_mod_1",
          source: "local",
          hasModLua: false,
          fileCount: 1
        }
      ]
    );
    render(<App bridge={desktopBridge} />);

    fireEvent.click(screen.getByRole("button", { name: "Mod library" }));
    fireEvent.click(screen.getByRole("button", { name: "Scan mod library" }));

    // A mod without mod.lua cannot load; a valid one is green.
    expect(await screen.findByText("Will not load")).toBeTruthy();
    expect(screen.getByText("OK")).toBeTruthy();

    // Info reveals the concrete cause and the fix for the broken mod.
    const infoButtons = screen.getAllByRole("button", { name: "Info" });
    fireEvent.click(infoButtons[1]!);
    expect(await screen.findByText("Missing root mod.lua")).toBeTruthy();
    expect(screen.getByText(/Place `mod.lua` directly/u)).toBeTruthy();
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
