# 0.1 work-cycle report

## Status

`PARTIAL`

A useful, connected and tested vertical slice exists, but native Windows/Linux
bundles and several hard product criteria remain unverified or unimplemented.

## Implemented

- Tauri 2, Rust, React, TypeScript and Monaco workspace architecture.
- Real project creation, scanning, text read/save and safe directory install.
- Static Lua, root metadata, portable filename and resource-reference
  validation with confirmed/heuristic certainty.
- Resource classification, index snapshots and deterministic diffs.
- Grouped real `stdout.txt` analysis without fabricated causes.
- Explicit directory/log selection, standard path candidates and shell-free
  game launch command.
- Connected desktop workbench with beginner/expert and light/dark modes.
- Read-only base-game boundary, traversal checks, atomic writes, backups and
  explicit overwrite consent.
- Architecture, security, development, build, test, file-format and CommonAPI2
  documentation.

## Verification

| Check | Result |
| --- | --- |
| Locked install (`npm ci`) | Passed; 130 packages installed |
| TypeScript typecheck | Passed |
| Vitest | 13 passed, 0 failed, 2 files |
| Core production build | Passed |
| React/Vite production build | Passed |
| Complete JavaScript gate | 6.97 s wall time on the recorded hosted runner |
| Initial application JS | 260.10 kB minified, 82.71 kB gzip |
| Lazy Monaco JS chunk | 2,639.94 kB minified, 676.87 kB gzip; build warning retained |
| 810-entry resource-index test | Passed; not an 800-mod benchmark |
| Native Rust compile/test | `desktop:build` attempted; stopped at `cargo metadata` because Cargo is absent |
| Native Windows bundle | Not run |
| Native Linux bundle | Not run |
| Automated browser screenshot | Blocked: no installed browser and browser download endpoint unavailable |
| App icon visual inspection | Passed at source image level |

Verified environment: Ubuntu 24.04 x64, Node.js 24.14.0, npm 11.9.0.

## Changed files

### Created

- root npm workspace, lockfile, build/test configuration and changelog;
- `packages/core` types, validators, indexer, log parser, filesystem reference
  adapter and tests;
- React desktop workbench, Monaco integration, IPC bridge, styles and tests;
- Rust/Tauri commands, capability policy, bundle configuration and Windows/
  Linux icon assets;
- project documentation and architecture decision record.

### Removed

- generated mobile and macOS-only icon assets outside the requested platforms.

No user game or mod files were changed during development or tests.

## Open points

| Item | Cause | Risk | Dependency | Recommended next step |
| --- | --- | --- | --- | --- |
| Native compile and bundles | Required toolchain and Linux libraries absent | Rust defects or package issues may remain | Rust, WebKitGTK; Windows build host | Run the native release gate on clean Windows and Linux environments |
| Rust dependency lock | `cargo` is unavailable, so `Cargo.lock` cannot be generated honestly | Native transitive dependencies are not yet reproducible | First successful native Cargo resolution | Generate, review and commit `apps/desktop/src-tauri/Cargo.lock` during the native gate |
| Full installation discovery | Only standard candidates exist | Non-standard installs require manual selection | Real Steam/GOG/custom layouts | Test real layouts and add evidence-backed detection providers |
| Persistent incremental index | 0.1 keeps an in-memory snapshot | Large libraries need rescans and cannot resume | Persistent storage design | Add cancellable SQLite index with migration and resume tests |
| Dependency/conflict engine | Full TF2/base-game/dependency corpus is not indexed | Some missing or conflicting resources remain heuristic | Verified TF2 semantics and real test corpus | Build a provenance-aware dependency graph |
| CommonAPI2 intelligence | No verified installation or authoritative versioned corpus | False API guidance if guessed | Real CommonAPI2 evidence | Follow the staged plan in `commonapi2.md` |
| Preview and editor depth | No model/material/texture preview or full API database | Reduced authoring convenience | Format parsers and licensed knowledge corpus | Add one evidence-backed preview format at a time |
| Performance baselines | No representative 800-mod corpus | Scale and memory behavior unknown | Reproducible benchmark fixture | Measure scan, search, logs and memory; publish raw results |
| Native visual workflow | No browser/native desktop renderer available here | Layout and interaction defects may remain | Browser or native test workstation | Run screenshots plus the manual workflow at 980×640 and 1440×900 |

## Deviations

- This is a first vertical slice, not the complete IDE described by the master
  outcome contract.
- Native platform support is configured in source but not claimed verified.
- The JavaScript graph is locked; the Rust graph is not locked until the first
  verified Cargo run creates `Cargo.lock`.
- Resource references are not called missing unless the available project index
  proves a case mismatch; external absence remains heuristic.
- CommonAPI2 is isolated but not integrated.
- There is no archive import/export, dependency graph, resumable database,
  model preview, full completion corpus or release installer yet.
- The large Monaco chunk is lazy-loaded away from the initial application
  path, but remains a known download/startup cost inside the desktop bundle.

## Execution commands

```bash
# locked dependency installation
npm ci

# frontend development preview
npm run dev

# complete verified JavaScript gate
npm run verify

# native development
npm run desktop:dev

# native packaging
npm run desktop:build
```
