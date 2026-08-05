import { describe, expect, it } from "vitest";

import { folderNameDiagnostics } from "./validator.js";

describe("installed mod folder guidance", () => {
  it("keeps a mixed-case folder with a valid suffix out of warning state", () => {
    const diagnostics = folderNameDiagnostics("ZiehbareOberleitung_DB_1");
    expect(diagnostics.some((item) => item.severity === "warning")).toBe(false);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: "MOD_FOLDER_CASE", severity: "info" })
    );
  });

  it("accepts working names without a major-version suffix", () => {
    expect(
      folderNameDiagnostics("ziehbareoberleitung_db").some(
        (item) => item.severity === "warning"
      )
    ).toBe(false);
  });

  it("accepts dots in local mod folder names", () => {
    expect(folderNameDiagnostics("modwerkstatt_br01.10_1")).toEqual([]);
    expect(folderNameDiagnostics("author.mod.pack")).toEqual([]);
  });

  it("warns for a Windows-style duplicate copy suffix", () => {
    expect(folderNameDiagnostics("modwerkstatt_br01.10_1 (1)")).toContainEqual(
      expect.objectContaining({
        code: "MOD_FOLDER_DUPLICATE_COPY",
        severity: "warning"
      })
    );
  });
});
