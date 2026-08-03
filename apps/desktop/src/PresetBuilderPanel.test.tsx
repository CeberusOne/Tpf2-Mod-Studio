// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildModPresetLua,
  parseModPreset,
  parseModRef,
  type InstalledMod
} from "@tpf2-mod-studio/core";

import type { DesktopBridge } from "./bridge";
import { I18nProvider } from "./i18n";
import PresetBuilderPanel, {
  queuePresetWorkspaceRequest,
  requestAddToCurrentPreset
} from "./PresetBuilderPanel";

function installed(
  id: string,
  modLua = "function data() return { info = {} } end",
  source = "local"
): InstalledMod {
  return {
    id,
    path: `/tf2/mods/${id}`,
    source,
    kind: "mod",
    entryType: "directory",
    hasModLua: true,
    fileCount: 2,
    displayName: id.replaceAll("_", " "),
    modLua
  };
}

function builderBridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  return {
    isNative: true,
    listModPresets: vi.fn(async () => []),
    readModPreset: vi.fn(async () => ""),
    writeModPreset: vi.fn(async (_root, name) => `/tf2/user/mod_presets/${name}.lua`),
    ...overrides
  } as DesktopBridge;
}

function renderBuilder(
  bridge: DesktopBridge,
  mods: InstalledMod[],
  onNotice = vi.fn()
) {
  return render(
    <I18nProvider>
      <PresetBuilderPanel
        bridge={bridge}
        installedMods={mods}
        native
        onNotice={onNotice}
        userDataPath="/tf2/user"
      />
    </I18nProvider>
  );
}

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

describe("docked preset builder", () => {
  it("asks for a preset, warns about dependencies, auto-adds them and writes TF2 order", async () => {
    const base = installed("base_pack_1");
    const vehicle = installed(
      "vehicle_pack_1",
      `function data()
return {
  info = {
    dependencies = { "base_pack_1" },
  },
}
end`
    );
    const bridge = builderBridge();
    renderBuilder(bridge, [vehicle, base]);

    requestAddToCurrentPreset("vehicle_pack_1");

    expect(
      await screen.findByRole("dialog", { name: "Choose preset" })
    ).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("New preset name"), {
      target: { value: "My Save Preset" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(
      await screen.findByRole("dialog", { name: "Dependencies required" })
    ).toBeTruthy();
    expect(screen.getAllByText("base_pack_1").length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Add dependencies and sort" })
    );

    const save = screen.getByRole("button", { name: "Save preset" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);

    await waitFor(() => expect(bridge.writeModPreset).toHaveBeenCalledTimes(1));
    const call = vi.mocked(bridge.writeModPreset).mock.calls[0];
    expect(call?.[1]).toBe("My Save Preset");
    const entries = parseModPreset(call?.[2] ?? "");
    expect(entries.map((entry) => entry.ref.raw)).toEqual([
      "vehicle_pack_1",
      "base_pack_1"
    ]);
  });

  it("preserves priority and Workshop references when an existing preset is edited", async () => {
    const existing = buildModPresetLua([
      { ref: parseModRef("normal_1") },
      { ref: parseModRef("*123456") },
      { ref: parseModRef("!commonapi_1") }
    ]);
    const bridge = builderBridge({
      readModPreset: vi.fn(async () => existing)
    });
    queuePresetWorkspaceRequest({
      kind: "preset",
      name: "Existing",
      path: "/tf2/user/mod_presets/Existing.lua"
    });
    renderBuilder(bridge, [
      installed("normal_1"),
      installed("123456", undefined, "workshop"),
      installed("commonapi_1"),
      installed("extra_1")
    ]);

    expect(await screen.findByText("Existing")).toBeTruthy();
    requestAddToCurrentPreset("extra_1");

    const save = await screen.findByRole("button", { name: "Save preset" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);

    await waitFor(() => expect(bridge.writeModPreset).toHaveBeenCalledTimes(1));
    const content = vi.mocked(bridge.writeModPreset).mock.calls[0]?.[2] ?? "";
    expect(content).toContain('id = "*123456"');
    expect(content).toContain('id = "!commonapi_1"');
  });
});
