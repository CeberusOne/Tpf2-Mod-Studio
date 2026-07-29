// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  cleanup();
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
    readLog: vi.fn(async () => ""),
    launchGame: vi.fn(async () => 1234)
  };
}

describe("desktop workbench", () => {
  it("shows an honest preview state without fabricated project data", () => {
    render(<App bridge={bridge(false)} />);

    expect(
      screen.getByText("Von der ersten Datei bis zum echten Testlauf.")
    ).toBeTruthy();
    expect(screen.getByText("UI-Vorschau")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Vorhandenen Mod öffnen"
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(screen.queryByText("test_mod_1")).toBeNull();
  });

  it("opens a bridge-provided project and renders its real snapshot", async () => {
    const desktopBridge = bridge();
    render(<App bridge={desktopBridge} />);

    fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));

    await waitFor(() => {
      expect(desktopBridge.scanProject).toHaveBeenCalledWith(
        "/real/project/test_mod_1"
      );
    });
    expect(screen.getByText("test_mod_1")).toBeTruthy();
    expect(screen.getByText("mod.lua")).toBeTruthy();
    expect(screen.getByText(/2 reale Dateien geladen/u)).toBeTruthy();
  });

  it("opens a text file and exposes the validation installation gate", async () => {
    render(<App bridge={bridge()} />);
    fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));
    await screen.findByText("mod.lua");

    fireEvent.click(screen.getByText("mod.lua"));
    expect((await screen.findByTestId("monaco-editor")).textContent).toContain(
      "function data()"
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Build & Installation" })
    );
    expect(screen.getByText("Freigegeben")).toBeTruthy();
  });
});
