# Tpf2 Mod Studio 0.1.0-alpha.11

This release fixes Windows installation and mod-source discovery while keeping
all Linux behavior intact.

## Fixed on Windows

- Detects Steam through Windows registry values and standard fallback paths.
- Parses every configured Steam library from `libraryfolders.vdf`.
- Resolves the real Transport Fever 2 directory from `appmanifest_1066780.acf`.
- Detects Steam userdata for app 1066780 across multiple Steam accounts.
- Supports Steam installations and game libraries on C:, D:, E: or other drives.

## Verified mod sources

- Local mods: `.../1066780/local/mods`
- Staging mods: `.../1066780/local/staging_area`
- Steam Workshop: `steamapps/workshop/content/1066780`
- Game-provided mods: `<Transport Fever 2>/mods`

Manual paths remain available through **Game paths / Spielpfade** and take
precedence over automatic values without disabling the other detected sources.

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
