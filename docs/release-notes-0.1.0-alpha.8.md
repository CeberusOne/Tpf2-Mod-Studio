# Tpf2 Mod Studio 0.1.0-alpha.8

Product status remains **PARTIAL**. Packages are unsigned pre-releases.

This release fixes a bug that refused to install valid mods, reworks the mod
library, and adds a 3D model viewer.

## Fixed: valid mods were blocked from installing

225 of 709 `mod.lua` files in a real installed library start with a UTF-8 byte
order mark — an invisible character many editors write. The Lua parser reports
it as `unexpected symbol` on line 1, so validation produced a syntax error and
refused to install the mod.

The byte order mark is now removed before parsing. All 225 then parse, with
none left failing.

## Mod library: traffic lights and per-mod findings

Installed mods now carry a three-state light instead of a badge that only said
whether `mod.lua` existed:

- **green** — no provable issue
- **amber** — loads, but with known issues
- **red** — will not load

**Info** lists each finding with its technical cause and the recommended fix.
Classification takes about 80 ms for 700 mods, so the lights appear with the
list.

Two sources of false alarms were removed on the way. Steam Workshop folders
are numeric ids assigned by Steam, so the mod-folder naming convention no
longer applies to them — it had produced 618 warnings no author could act on.
And findings that only state something *could not be verified statically*
never colour the light; they stay visible in a separate section.

On a real 710-mod library the result changed from 42 green / 440 amber / 228
red to **670 green / 37 amber / 3 red**.

Mods are also grouped by source — local, staging area, Steam Workshop, shipped
with the game — instead of one flat list, and each shows its preview image.
About a fifth of mods ship only `image_00.tga`, which no embedded browser can
display, so previews are decoded natively and downscaled. They load per card
as it scrolls into view, because source images reach 31 MiB each.

## New: 3D model viewer (Advanced level)

Mod models can be viewed in 3D directly from the library: LOD switching,
wireframe, bounding box and collider, orbit camera, part and triangle counts.

Decoding was derived from the installed library rather than guessed, and
validated over a 400-model sample drawn from 45,752 installed models: 5,390
meshes decoded without a single failure, 7.9 million triangles. Meshes
supplied by the base game are named rather than silently dropped, so an
incomplete render is explained.

Models that compute their transforms at runtime are reported as unreadable
instead of partially guessed — the Lua is never executed.

FBX import is not included: it requires the proprietary Autodesk SDK. Use the
Model Editor shipped with Transport Fever 2 for that.

## New: edit a mod's files in place (Advanced level)

Each mod in the library gains an **Edit files** action that lists its text
resources, opens them in the editor and saves them with the existing path
validation, backup and atomic replace. Binary meshes, textures and sounds are
not offered, since they need dedicated editors. Editing Steam Workshop content
warns that Steam overwrites those folders on update.

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
