# Tpf2 Mod Studio

Tpf2 Mod Studio is a standalone desktop workbench for creating, inspecting,
validating, editing, indexing and installing Transport Fever 2 mods on Windows
and Linux.

## Current status

**PARTIAL — vertical slice 0.1**

This repository contains the first connected workflow:

1. create a minimal, valid TF2 mod project;
2. open and scan a real project directory;
3. edit text resources with Monaco;
4. validate `mod.lua`, filenames and resource references;
5. build a resource index and detect changes;
6. install the validated project into an explicitly selected mod directory with
   collision protection and backups;
7. load and group messages from a real `stdout.txt`.

No sample mods or fake log events are shown by the production UI. Test fixtures
live only in automated tests.

The locked native build is verified by GitHub Actions on Ubuntu 22.04 and
Windows Server 2022. The pipeline typechecks, runs the JavaScript and Rust test
suites, enforces Rust formatting and Clippy warnings, builds every native
bundle, and smoke-starts the compiled desktop process on both operating
systems. Packages are unsigned. Public Alpha releases are published separately
with checksums and explicit acceptance limits.

## Technology

- Tauri 2 desktop shell
- React 19 + Vite
- TypeScript domain and validation core
- Rust command boundary for privileged file operations
- Monaco editor
- Vitest and Testing Library

The choice and its boundaries are documented in
[`docs/adr/0001-desktop-architecture.md`](docs/adr/0001-desktop-architecture.md).

## Commands

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

`npm run dev` renders the frontend for inspection. Native filesystem actions are
intentionally unavailable outside the Tauri window.

Detailed setup, build and verification instructions:

- [`docs/installation.md`](docs/installation.md)
- [`docs/development.md`](docs/development.md)
- [`docs/build-and-packaging.md`](docs/build-and-packaging.md)
- [`docs/testing.md`](docs/testing.md)

## Safety baseline

- Game base files are read-only.
- Writes are restricted to an explicitly opened project or selected mod target.
- Relative paths containing traversal, absolute prefixes or NUL bytes are
  rejected.
- Existing installed mods are never overwritten unless the user explicitly
  requests it; an in-target backup is created first.
- Mod Lua is parsed statically and never executed for validation.
- Game launch uses a direct process API, never a shell.
- Telemetry is absent.

See [`docs/security-model.md`](docs/security-model.md) for details.

## Scope and future support

The current development and testing focus is Transport Fever 2.

Transport Fever 1 support is planned as a later compatibility target after the
Transport Fever 2 workflow has reached a stable state.

Transport Fever 3 support is planned once the game, its final modding interfaces
and the corresponding SDK documentation are publicly available.

The current 0.1 release therefore supports Transport Fever 2 only. Future game
support is part of the long-term roadmap and is not yet implemented.

Vanilla projects are supported by the first slice. CommonAPI2 has a separate
project mode, but its API intelligence remains disabled until a real CommonAPI2
installation and documentation source are available.

## Public Alpha

The first durable tester release is prepared as `v0.1.0-alpha.1`. It remains a
**Public Alpha** and does not change the product status from **PARTIAL**.
Interactive installation, uninstall and a complete real-game Transport Fever 2
workflow on clean user systems still require community acceptance testing.

- [Installation and tester workflow](docs/installation.md)
- [Known features and limits](docs/supported-features.md)
- [Report a bug](https://github.com/CeberusOne/Tpf2-Mod-Studio/issues/new?template=bug-report.yml)
- [Request a feature](https://github.com/CeberusOne/Tpf2-Mod-Studio/issues/new?template=feature-request.yml)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

Tpf2 Mod Studio is licensed under the
[GNU General Public License version 3](LICENSE), using the SPDX identifier
`GPL-3.0-only`. Distributed modified versions must remain available under the
same license terms. This license covers the Tpf2 Mod Studio source code; it does
not grant rights to Transport Fever game files or third-party mod content.

## Project documentation

- [Architecture and data flow](docs/architecture.md)
- [Module overview](docs/modules.md)
- [Supported features and known limits](docs/supported-features.md)
- [Supported file formats](docs/file-formats.md)
- [CommonAPI2 integration boundary](docs/commonapi2.md)
- [Technical evidence](docs/evidence.md)
- [0.1 verification report](docs/status-0.1.md)
- [Architecture decision record](docs/adr/0001-desktop-architecture.md)
- [Changelog](CHANGELOG.md)
