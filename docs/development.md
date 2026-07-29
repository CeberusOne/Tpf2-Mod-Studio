# Development guide

## Repository layout

```text
tpf2-mod-studio/
├── apps/
│   └── desktop/
│       ├── src/                 React workbench
│       └── src-tauri/           Rust/Tauri command boundary
├── packages/
│   └── core/
│       └── src/                 domain, validators and test adapter
├── docs/                        architecture and operating guides
├── package.json                 workspace commands
└── vitest.config.ts             automated test configuration
```

Generated `dist`, `node_modules`, Tauri `target` and package output directories
are excluded from source control and source archives.

## Setup

```bash
npm ci
npm run verify
```

Run the frontend-only preview:

```bash
npm run dev
```

Run the real native command boundary:

```bash
npm run desktop:dev
```

The frontend preview is useful for layout and component work. It cannot be used
as evidence that filesystem, installation or launch commands work.

## Change workflow

1. Keep platform-independent TF2 rules in `packages/core`.
2. Keep privileged filesystem and process operations behind typed Tauri
   commands.
3. Add a failing test for deterministic validation, parser and path behavior.
4. Use temporary directories for filesystem tests; never use a live game
   directory as a fixture.
5. Run `npm run verify`.
6. For native changes, also run Rust tests, linting and a Tauri bundle on every
   affected operating system.

## Coding boundaries

- Product code may not inject sample projects or fake logs.
- Validation parses mod Lua but never executes it.
- An unresolved resource reference is heuristic until a full game/dependency
  index proves it missing.
- Windows-compatible case collisions are checked even when developing on Linux.
- CommonAPI2 intelligence stays disabled unless evidence from a real,
  compatible installation and documentation is available.

## Native verification

The repository's `Native CI` workflow verifies the locked native source on:

- Windows Server 2022 with the Visual C++/WebView2 prerequisites;
- Ubuntu 22.04 with WebKitGTK 4.1 and the Tauri packaging prerequisites.

Both matrix jobs compile, test, lint, package and smoke-start the native
application. Interactive clean-machine installer acceptance remains manual.
See [testing.md](testing.md) for the exact gate.
