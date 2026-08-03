# Tpf2 Mod Studio 0.1.0-alpha.13

This release integrates savegame preset building directly into the existing Mod
Library instead of presenting a second, simplified mod list.

## Mod Library and Preset Builder

- The existing Mod Library remains the single mod-selection surface, including
  preview images, source groups, health lights, paths, findings, file editing and
  the 3D model viewer.
- A docked Preset Builder appears beside the library in a split-screen layout.
- Complete library cards can be dragged into the currently open preset.
- Every regular mod card also has an **Add to preset** action.
- When no preset is open, the Studio asks whether to create a named preset or
  open an existing Transport Fever 2 preset before adding the mod.
- The Savegame tab opens a savegame mod list or an existing preset directly in
  the Mod Library builder. It no longer duplicates the Mod Library.

## Load order and dependencies

- The builder displays the same top-to-bottom order used by the Transport Fever
  2 mod list instead of showing the effective loading direction backwards.
- A separate internal execution order ensures dependencies load before the mods
  that require them.
- Standard `dependencies` and CommonAPI2 `requiredMods`, `steamId` and
  `requiredModsAnyLoadOrder` declarations are checked statically.
- Dropping or adding a mod with dependencies opens a detailed warning dialog.
- Installed dependency mods can be added automatically and placed at the
  required TF2 positions.
- Manual reordering is checked continuously. Missing dependencies, invalid
  ordering and dependency cycles block preset saving.
- Existing `!` priority references and `*` Workshop references are preserved
  when a preset is opened, edited and saved again.
- Dependency matching tolerates real-world casing differences and reports
  uncertain major-version matches explicitly.

## Safety

- Savegames remain read-only.
- Existing preset files are backed up before replacement.
- Dynamic Lua is not executed; declarations that cannot be verified statically
  remain visible as unverifiable instead of being guessed.

## Install

**Windows PowerShell**

```powershell
irm https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-windows.ps1 | iex
```

**Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-linux.sh | bash
```

Packages are unsigned. Verify them with the included `SHA256SUMS.txt` when
needed.
