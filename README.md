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

The native Tauri source is present, but the native bundle is not yet verified
in this environment because Rust/Cargo and the Linux WebKit development
libraries are unavailable. The TypeScript domain, real-filesystem reference
adapter and React build are independently verifiable.

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

## Scope

Only Transport Fever 2 is in scope. Transport Fever 1 and Transport Fever 3 are
excluded. Vanilla projects are supported by the first slice. CommonAPI2 has a
separate project mode but its API intelligence remains disabled until a real
CommonAPI2 installation and documentation source are available.

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
