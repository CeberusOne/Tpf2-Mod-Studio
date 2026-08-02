# Tpf2 Mod Studio 0.1.0-alpha.9

Developed by Mike Hering. Product status remains **PARTIAL**. Packages are
unsigned pre-releases.

This release adds a savegame mod editor, tools for the 3D model viewer, and
fixes several regressions from alpha.8 — including one that made the editor
unusable.

## New: savegames, mod selection and load order

A new **Savegames** tab reads which mods a savegame used, checks their
dependencies against your installed library, and writes a preset with a valid
load order.

**Savegames are only read.** Their mod list sits inside the compressed save
file, where a single wrong value would destroy it. The load order is written to
`mod_presets`, which is Transport Fever 2's own mechanism — select the preset in
the game's mod list.

What the dependency check does:

- pulls required mods in automatically and places them before the mods that
  need them
- keeps mods marked to load early at the front
- reports a circular dependency instead of inventing an order that cannot work
- names exactly which mods still have to be installed, and which mod needs each
  one

Two honest limits are shown rather than hidden. Many mod authors write a
download link into the dependency field instead of a mod id — in a real library
that is 37 of 93 entries. Those are listed as *not verifiable* rather than
counted as missing. And because Steam Workshop mods live in numeric folders, a
dependency reported as missing may already be installed under a different
folder name; the report says so.

## Fixed: opening a file blanked the window

Opening a Lua file made the entire window go black with no way back. Transport
Fever 2 Mod Studio's own Lua syntax definition referenced a rule it never
defined, which made the editor's syntax compiler abort and take the interface
with it. Fixed, with a test that checks every such reference resolves.

The application also no longer loses its whole interface when a single part
fails: the affected area now reports the error in place.

## Fixed: the Advanced switch disappeared

In narrower windows the Standard/Advanced switch was squeezed to zero width,
which also made the model viewer and the mod file editor unreachable — both are
only available at the Advanced level. The header row now wraps.

## Fixed: misleading mod folder warning

Folders like `Autobahn_Kreuz_1` were reported as missing a version suffix,
which they plainly have. The warning now names what is actually unusual — the
upper-case letters, or in `modwerkstatt_br01.10_1` the dot — and states that an
installed mod keeps working regardless.

## Model viewer tools

Fit view, grid and axes, auto-rotate, light background for judging dark
materials, per-part visibility so a body can be inspected without its bogies,
and a size readout in metres. Any mod card can now be maximised to full screen,
which the 3D view needs to be usable. Escape leaves it.

## Removed: optional AI assist

Removed completely, including its settings and all its interface. The
application now makes no outbound request other than the startup check for a
new release. Mod content never leaves your machine.

## Install

**Linux (AppImage):**

```bash
curl -fsSL https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-linux.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-windows.ps1 | iex
```

Packages are unsigned. Verify with `SHA256SUMS.txt` when needed.
See [docs/installation.md](https://github.com/CeberusOne/Tpf2-Mod-Studio/blob/main/docs/installation.md).
