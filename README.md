# Tpf2 Mod Studio

Tpf2 Mod Studio is a standalone desktop workbench for creating, inspecting,
validating, editing and managing Transport Fever 2 mods on Windows and Linux.

> **Alpha software:** The project is under active development. Keep backups of
> important mods and savegames. Release packages are currently unsigned.

## Current version and status

**Current source version: `v0.1.0-alpha.9` — product status: PARTIAL**

The installer commands below always download the newest **published** GitHub
release. A prepared source version or tag can temporarily be newer than the
available installer while its release workflow is still building.

Alpha.9 adds savegame mod analysis, dependency-aware load-order presets,
expanded 3D model-viewer tools and several editor and interface fixes.

## Current capabilities

- Create minimal valid Transport Fever 2 mod projects.
- Open, scan and edit existing mod projects with the Monaco editor.
- Parse Lua statically without executing mod code.
- Validate `mod.lua`, filenames, resource references and common modifier
  contracts.
- Scan installed mods from local, staging, built-in and Steam Workshop sources.
- Group the mod library by source and display available preview images.
- Show traffic-light mod health with specific causes and suggested fixes.
- Import ZIP mods with path and extraction-size protection.
- Export clean project ZIP archives.
- Install validated projects with collision protection and backups.
- Analyze `stdout.txt`, group related events, identify supported root causes and
  separate primary errors from follow-up failures.
- Inspect supported Transport Fever 2 models in a 3D viewer with LOD selection,
  wireframe, bounding boxes, grid, axes, fit view, auto-rotation, part visibility
  and model dimensions.
- Read the mod list used by a savegame without modifying the save file.
- Resolve known dependencies and write a Transport Fever 2 `mod_presets` load
  order while reporting missing, unverifiable or circular dependencies.
- Check GitHub Releases for updates at startup. Installation remains a user
  action.

No sample mods or fabricated log events are shown by the production interface.
Test fixtures exist only in automated tests.

## Important limits

- Savegames are read-only. The application writes load-order presets instead of
  changing compressed `.sav` files.
- CommonAPI2 project mode exists, but complete version-aware CommonAPI2 API
  intelligence is not yet implemented.
- Lua validation is static and cannot prove every runtime behavior of the game
  engine or third-party scripts.
- Unknown native or engine errors may still require manual investigation.
- Windows and Linux packages are unsigned and still require broader
  clean-machine acceptance testing.
- The optional AI assistant has been removed. Mod content remains local.

See [Supported features and known limits](docs/supported-features.md) for the
technical scope.

## Install

### Windows

Open PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-windows.ps1 | iex
```

The script downloads the newest published NSIS `*-setup.exe`, verifies the
published SHA-256 checksum and starts the installer.

### Linux

```bash
curl -fsSL https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-linux.sh | bash
```

The script installs the newest published AppImage and creates the application
launcher.

Packages can also be downloaded manually from the
[GitHub Releases page](https://github.com/CeberusOne/Tpf2-Mod-Studio/releases).
See [Installation](docs/installation.md) for details.

## Technology

- Tauri 2 desktop shell
- React 19 and Vite
- TypeScript validation and domain core
- Rust command boundary for privileged filesystem operations
- Monaco editor
- Three.js model viewer
- Vitest, Testing Library and Rust tests

The architecture decision and its boundaries are documented in
[ADR 0001](docs/adr/0001-desktop-architecture.md).

## Development

```bash
npm ci
npm run dev
npm run verify
```

With the documented Rust and platform prerequisites installed:

```bash
npm run desktop:dev
npm run desktop:build
```

`npm run dev` renders the frontend for inspection. Native filesystem operations
are available only inside the Tauri application.

Further documentation:

- [Development setup](docs/development.md)
- [Build and packaging](docs/build-and-packaging.md)
- [Testing](docs/testing.md)
- [Architecture and data flow](docs/architecture.md)
- [Module overview](docs/modules.md)

## Safety baseline

- Transport Fever 2 base files are read-only.
- Writes are restricted to an explicitly opened project or selected mod target.
- Path traversal, absolute archive paths and NUL bytes are rejected.
- Existing installed mods are not overwritten without explicit user action; a
  backup is created first.
- Mod Lua is parsed statically and never executed for validation.
- ZIP imports have per-entry path validation plus entry-count and size limits.
- Savegame files are never modified.
- Game launch uses a direct process API rather than a shell.
- Telemetry is absent. The only routine outbound request is the startup GitHub
  release check. Mod content never leaves the machine.

See the [Security model](docs/security-model.md) for details.

## Scope

Development currently targets **Transport Fever 2 only**.

Transport Fever 1 support is a possible later compatibility target after the
Transport Fever 2 workflow becomes stable. Transport Fever 3 support can only be
evaluated after the game and its official modding interfaces are publicly
available.

## Testing and feedback

The locked native build is checked by GitHub Actions on Ubuntu 22.04 and Windows
Server 2022. CI runs TypeScript checks, JavaScript and Rust tests, Rust formatting
and Clippy, native bundle builds and desktop smoke tests.

- [Release notes for alpha.9](docs/release-notes-0.1.0-alpha.9.md)
- [Changelog](CHANGELOG.md)
- [Report a bug](https://github.com/CeberusOne/Tpf2-Mod-Studio/issues/new?template=bug-report.yml)
- [Request a feature](https://github.com/CeberusOne/Tpf2-Mod-Studio/issues/new?template=feature-request.yml)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Author and license

Developed by **Mike Hering**.

Copyright © 2026 Mike Hering.

Tpf2 Mod Studio is licensed under the
[GNU General Public License version 3](LICENSE), using the SPDX identifier
`GPL-3.0-only`. Distributed modified versions must remain available under the
same license terms. The license covers the Tpf2 Mod Studio source code and does
not grant rights to Transport Fever game files or third-party mod content.

## Project documentation

- [Supported features and known limits](docs/supported-features.md)
- [Supported file formats](docs/file-formats.md)
- [CommonAPI2 integration boundary](docs/commonapi2.md)
- [Technical evidence](docs/evidence.md)
- [TF2 core logic and modifier baseline](docs/tf2-core-logic.md)
- [0.1 verification report](docs/status-0.1.md)
