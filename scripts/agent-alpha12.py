from pathlib import Path

library = Path("apps/desktop/src-tauri/src/library.rs")
content = library.read_text(encoding="utf-8")
old = '''        let root = env::temp_dir().join(format!(
            "tpf2-library-sources-{}-{}",
            std::process::id(),
            now_millis()
        ));'''
new = '''        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = env::temp_dir().join(format!(
            "tpf2-library-sources-{}-{nanos}",
            std::process::id()
        ));'''
if content.count(old) != 1:
    raise SystemExit("library fixture helper not found exactly once")
library.write_text(content.replace(old, new, 1), encoding="utf-8")

# The authorized verifier applies the updated mixed-case expectation in its
# next step. Restore its input block here so the step remains deterministic.
core_test = Path("packages/core/src/core.test.ts")
content = core_test.read_text(encoding="utf-8")
current = '''    expect(codes).toContain("MOD_FOLDER_CASE");
    expect(codes).not.toContain("MOD_FOLDER_VERSION_SUFFIX");
    expect(health.status).toBe("ok");
    expect(
      health.diagnostics.find(
        (item) => item.code === "MOD_FOLDER_CASE"
      )?.description
    ).toContain("major-version suffix is valid");'''
input_block = '''    expect(codes).toContain("MOD_FOLDER_CHARACTERS");
    expect(codes).not.toContain("MOD_FOLDER_VERSION_SUFFIX");
    expect(
      health.diagnostics.find(
        (item) => item.code === "MOD_FOLDER_CHARACTERS"
      )?.description
    ).toContain("has the expected version suffix");'''
if content.count(current) != 1:
    raise SystemExit("current mixed-case test block not found exactly once")
core_test.write_text(content.replace(current, input_block, 1), encoding="utf-8")
