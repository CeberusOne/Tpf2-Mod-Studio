# Tpf2 Mod Studio 0.1.0-alpha.12

This release makes the mod library less prescriptive and completes the startup
update experience.

## Mod library and parser

- Mixed-case local folders such as `ZiehbareOberleitung_DB_1` remain green when
  their version suffix is valid. The casing recommendation is shown as
  information, not as a defect.
- `_1` and `_2` remain separate mod IDs.
- The staging area now distinguishes:
  - regular mods with `mod.lua`
  - staging projects containing internal scripts
  - direct internal script files
  - other staging content
- Internal staging content is not forced to contain `mod.lua`, is not labelled
  as a broken mod, and is not included in savegame dependency resolution.
- Nothing is moved automatically between local mods and `staging_area`.

## Updates

- The Studio checks GitHub Releases once at startup.
- A modal matching the Studio interface shows the new version and release notes.
- **Install and restart** downloads the platform package, verifies it against
  `SHA256SUMS.txt`, installs it and automatically relaunches the Studio.
- A manual restart button remains available if the operating system prevents
  the automatic relaunch.

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
