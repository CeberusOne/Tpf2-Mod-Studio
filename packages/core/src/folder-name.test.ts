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

  it("still warns when the positive major-version suffix is missing", () => {
    expect(folderNameDiagnostics("ZiehbareOberleitung_DB")).toContainEqual(
      expect.objectContaining({
        code: "MOD_FOLDER_VERSION_SUFFIX",
        severity: "warning"
      })
    );
  });
});
