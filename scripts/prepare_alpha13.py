from pathlib import Path

OLD = "0.1.0-alpha.12"
NEW = "0.1.0-alpha.13"

for relative in [
    "package.json",
    "apps/desktop/package.json",
    "package-lock.json",
    "apps/desktop/src-tauri/Cargo.toml",
    "apps/desktop/src-tauri/Cargo.lock",
    "apps/desktop/src-tauri/tauri.conf.json",
]:
    path = Path(relative)
    text = path.read_text(encoding="utf-8")
    if OLD not in text:
        raise SystemExit(f"version marker missing in {relative}")
    path.write_text(text.replace(OLD, NEW), encoding="utf-8")

readme_path = Path("README.md")
readme = readme_path.read_text(encoding="utf-8")
readme = readme.replace(
    "**Current source version: `v0.1.0-alpha.12` — product status: PARTIAL**",
    "**Current source version: `v0.1.0-alpha.13` — product status: PARTIAL**",
    1,
)
readme = readme.replace(
    "Alpha.11 fixes Windows Steam discovery across registry-configured and custom Steam libraries, and verifies local, staging, Workshop and game-provided mod scanning on both platforms.",
    "Alpha.13 integrates a dependency-aware drag-and-drop Preset Builder directly into the existing Mod Library, preserves the TF2-visible order and keeps savegames read-only.",
    1,
)
old_capability = '''- Read the mod list used by a savegame without modifying the save file.
- Resolve known dependencies and write a Transport Fever 2 `mod_presets` load
  order while reporting missing, unverifiable or circular dependencies.'''
new_capability = '''- Read the mod list used by a savegame without modifying the save file.
- Open savegame mod lists and existing presets directly in the Mod Library.
- Build TF2 presets beside the existing full Mod Library using drag-and-drop or
  the card action, without replacing its previews, health lights or tools.
- Resolve standard and CommonAPI2 dependencies, add installed requirements
  automatically, preserve TF2-visible ordering and block unsafe preset output.
- Preserve `!` priority and `*` Workshop references when editing presets.'''
if old_capability not in readme:
    raise SystemExit("README capability marker missing")
readme = readme.replace(old_capability, new_capability, 1)
readme_path.write_text(readme, encoding="utf-8")

changelog_path = Path("CHANGELOG.md")
changelog = changelog_path.read_text(encoding="utf-8")
entry = '''# Changelog

## 0.1.0-alpha.13 — 2026-08-03

- Added a docked drag-and-drop Preset Builder beside the existing complete Mod
  Library; the library is not duplicated or replaced.
- Adding a mod without an open preset now asks whether to create a named preset
  or open an existing one.
- Savegames and existing presets open directly in the Mod Library builder.
- Corrected the displayed order to match the top-to-bottom Transport Fever 2
  mod list while retaining a separate dependency-first execution order.
- Added continuous validation, dependency warnings, automatic requirement
  insertion and automatic placement for standard and CommonAPI2 declarations.
- Preset output is blocked for missing dependencies, invalid ordering or cycles.
- Existing `!` priority and `*` Workshop references are preserved.
- Added dedicated UI and core tests for the complete preset-building workflow.
'''
if not changelog.startswith("# Changelog\n"):
    raise SystemExit("CHANGELOG header missing")
changelog = entry + changelog[len("# Changelog\n"):]
changelog_path.write_text(changelog, encoding="utf-8")

features_path = Path("docs/supported-features.md")
features = features_path.read_text(encoding="utf-8")
features = features.replace(
    "- Startup update check against GitHub Releases; install stays a user action\n",
    "- Startup update check, verified install and restart workflow\n"
    "- Read-only savegame mod-list extraction and TF2 mod-preset read/write\n"
    "- Docked drag-and-drop Preset Builder using the existing Mod Library cards\n"
    "- Standard and CommonAPI2 dependency extraction, automatic insertion,\n"
    "  TF2-visible ordering, cycle detection and unsafe-save blocking\n"
    "- 3D model viewer with LOD, wireframe, bounds, grid, axes and part controls\n",
    1,
)
features = features.replace(
    "- full TF2 dependency graph, active-mod provenance and cross-mod order proof\n",
    "- universal dependency discovery for dynamically generated Lua declarations\n",
    1,
)
features = features.replace("- 3D model/material/mesh preview\n", "", 1)
features = features.replace(
    "- signed and published Windows/Linux release\n",
    "- signed Windows/Linux release packages\n",
    1,
)
features_path.write_text(features, encoding="utf-8")
