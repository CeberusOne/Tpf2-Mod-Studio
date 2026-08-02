# Tpf2 Mod Studio 0.1.0 Public Alpha 2

This is a **Public Alpha** installer refresh. The product remains **PARTIAL**.

## Why Alpha 2

- Linux builds no longer crash on common NVIDIA / hybrid-GPU setups that hit
  WebKitGTK’s `Could not create GBM EGL display` abort. The binary sets
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` by default (overridable).
- One-command installers for Linux and Windows are available from `main`.
- Releases are built from source on GitHub Actions (Windows + Linux) instead of
  reusing frozen CI artifact IDs.

## Install

**Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-linux.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-windows.ps1 | iex
```

Or download a package from this release:

| Platform | Package |
| --- | --- |
| Windows | MSI and NSIS Setup EXE |
| Linux | AppImage (recommended), DEB, RPM |

Verify checksums with `SHA256SUMS.txt` when needed. Packages are unsigned.

## Included workflow

- Create and scan a real Transport Fever 2 mod project.
- Edit text resources with Monaco.
- Validate `mod.lua`, file names and resource references without executing Lua.
- Build and refresh a resource index.
- Install into an explicitly selected mod directory with collision protection
  and backups.
- Load and group messages from a real `stdout.txt`, including causal analysis
  for supported root causes.

## Known limitations

- Interactive installation and uninstall are not yet accepted on every clean
  user system.
- A complete create-to-install workflow has not been accepted against every
  real Transport Fever 2 installation layout.
- Transport Fever 1 and Transport Fever 3 support are planned future targets,
  not current functionality.
- CommonAPI2 API intelligence remains disabled pending a verified local
  installation and documentation source.
- Major Mod Studio modules beyond the documented 0.1 vertical slice are not
  implemented.

## Testing

Follow [docs/installation.md](installation.md). Report reproducible problems
with the repository’s bug-report form.

Do not publish suspected vulnerabilities as issues. Use the private reporting
instructions in `SECURITY.md`.
