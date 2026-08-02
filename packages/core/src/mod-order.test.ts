import { describe, expect, it } from "vitest";

import {
  buildModPresetLua,
  classifyDependency,
  parseModPreset,
  parseModRef,
  planModOrder,
  type InstalledModInfo
} from "./mod-order.js";

function mod(
  id: string,
  dependencies: string[] = [],
  source = "local"
): InstalledModInfo {
  return { id, source, dependencies };
}

describe("mod reference forms", () => {
  it("understands the three ways Transport Fever 2 names a mod", () => {
    expect(parseModRef("*3314962403")).toEqual({
      raw: "*3314962403",
      id: "3314962403",
      kind: "workshop"
    });
    expect(parseModRef("!eis_os_commonapi2")).toEqual({
      raw: "!eis_os_commonapi2",
      id: "eis_os_commonapi2",
      kind: "priority"
    });
    expect(parseModRef("urbangames_legacy_vehicle_pack").kind).toBe("local");
  });
});

describe("dependency classification", () => {
  const installed = new Set(["kaleut_drehgestelle_1", "siri_basis_2"]);

  it("resolves an installed dependency", () => {
    expect(classifyDependency("kaleut_drehgestelle_1", installed)).toEqual({
      kind: "satisfied",
      resolvedTo: "kaleut_drehgestelle_1"
    });
  });

  it("matches a different major version but says so", () => {
    const verdict = classifyDependency("siri_basis_1", installed);
    expect(verdict.kind).toBe("satisfied");
    expect(verdict.resolvedTo).toBe("siri_basis_2");
    expect(verdict.uncertainty).toContain("major version");
  });

  it("reports a download link as a link, not a missing mod", () => {
    // Authors regularly put a URL in `dependencies`; 37 of the declarations in
    // a real 735-mod library are links. Calling those "missing" is a false alarm.
    const verdict = classifyDependency(
      "https://www.transportfever.net/filebase/entry/5041-zaeune/",
      installed
    );
    expect(verdict.kind).toBe("link");
    expect(verdict.uncertainty).toContain("download link");
  });

  it("marks an unmatched id as missing and states the uncertainty", () => {
    const verdict = classifyDependency("snowball_fences_1", installed);
    expect(verdict.kind).toBe("missing");
    expect(verdict.uncertainty).toContain("Workshop");
  });
});

describe("load order planning", () => {
  it("places dependencies before the mods that need them", () => {
    const installed = [
      mod("wagon_1", ["bogies_1"]),
      mod("bogies_1"),
      mod("station_1", ["bogies_1", "signals_1"]),
      mod("signals_1")
    ];
    const result = planModOrder(installed, ["wagon_1", "station_1"]);

    expect(result.cycles).toEqual([]);
    expect(result.order.indexOf("bogies_1")).toBeLessThan(
      result.order.indexOf("wagon_1")
    );
    expect(result.order.indexOf("signals_1")).toBeLessThan(
      result.order.indexOf("station_1")
    );
    // Dependencies are pulled in even though they were not selected.
    expect(result.addedForDependencies).toEqual(["bogies_1", "signals_1"]);
  });

  it("handles one mod depending on several others", () => {
    const installed = [
      mod("big_1", ["a_1", "b_1", "c_1"]),
      mod("a_1"),
      mod("b_1", ["a_1"]),
      mod("c_1", ["b_1"])
    ];
    const result = planModOrder(installed, ["big_1"]);
    const at = (id: string): number => result.order.indexOf(id);

    expect(at("a_1")).toBeLessThan(at("b_1"));
    expect(at("b_1")).toBeLessThan(at("c_1"));
    expect(at("c_1")).toBeLessThan(at("big_1"));
  });

  it("names exactly which mods still have to be installed", () => {
    const installed = [mod("wagon_1", ["bogies_1", "missing_pack_1"])];
    const result = planModOrder(installed, ["wagon_1"]);

    expect(result.missing).toEqual(["bogies_1", "missing_pack_1"]);
    expect(
      result.findings.filter((finding) => finding.kind === "missing")
    ).toHaveLength(2);
  });

  it("reports a cycle instead of inventing an order", () => {
    const installed = [mod("a_1", ["b_1"]), mod("b_1", ["a_1"])];
    const result = planModOrder(installed, ["a_1"]);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it("keeps unverifiable declarations separate from real problems", () => {
    const installed = [
      mod("wagon_1", ["https://example.com/pack", "bogies_1"]),
      mod("bogies_1")
    ];
    const result = planModOrder(installed, ["wagon_1"]);

    expect(result.missing).toEqual([]);
    expect(result.unverifiable).toHaveLength(1);
    expect(result.unverifiable[0]?.kind).toBe("link");
  });
});

describe("preset round trip", () => {
  it("reads the shape Transport Fever 2 writes", () => {
    const preset = `function data()
return {
\tmodDescs = {
\t\t{
\t\t\tid = "!eis_os_commonapi2",
\t\t\tinfo = {
\t\t\t\tname = _("CommonAPI2"),
\t\t\t\tminorVersion = 9,
\t\t\t},
\t\t\tmajorVersion = 1,
\t\t},
\t\t{
\t\t\tid = "*3314962403",
\t\t\tinfo = { minorVersion = 0, },
\t\t\tmajorVersion = 2,
\t\t},
\t},
}
end`;
    const entries = parseModPreset(preset);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.ref.kind).toBe("priority");
    expect(entries[0]?.name).toBe("CommonAPI2");
    expect(entries[1]?.ref.id).toBe("3314962403");
    expect(entries[1]?.majorVersion).toBe(2);
  });

  it("writes a preset that parses back to the same order", () => {
    const entries = parseModPreset(
      buildModPresetLua([
        { ref: parseModRef("!first"), name: "First", majorVersion: 1 },
        { ref: parseModRef("*999"), majorVersion: 3, minorVersion: 4 },
        { ref: parseModRef("third_1") }
      ])
    );

    expect(entries.map((entry) => entry.ref.raw)).toEqual([
      "!first",
      "*999",
      "third_1"
    ]);
    expect(entries[1]?.majorVersion).toBe(3);
  });
});
