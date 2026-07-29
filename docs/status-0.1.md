# 0.1 work-cycle report

## Status

`PARTIAL`

A useful, connected and tested vertical slice exists. Native Windows/Linux
builds and process starts are verified, but clean-machine installer acceptance
and several hard product criteria remain unverified or unimplemented.

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
| Initial application JS | 260.10 kB minified, 82.71 kB gzip |
| Lazy Monaco JS chunk | 2,639.94 kB minified, 676.87 kB gzip; build warning retained |
| 810-entry resource-index test | Passed; not an 800-mod benchmark |
| Rust dependency lock | Committed; identical resolution used by both native jobs |
| Native Rust test/lint gate | 5 tests passed; `cargo fmt --check` and Clippy with denied warnings passed |
| Native Windows build | Passed on `windows-2022`; compiled process smoke-started for 10 seconds |
| Native Windows bundles | MSI and NSIS setup EXE produced and ZIP integrity verified |
| Native Linux build | Passed on `ubuntu-22.04`; compiled process smoke-started under Xvfb |
| Native Linux bundles | AppImage, DEB and RPM produced and ZIP integrity verified |
| Automated browser screenshot | Blocked: no installed browser and browser download endpoint unavailable |
| App icon visual inspection | Passed at source image level |

Native verification: GitHub Actions `Native CI` run #6 on Ubuntu 22.04 x64
and Windows Server 2022 x64 with Node.js 24 and stable Rust. The local
JavaScript verification was recorded on Ubuntu 24.04 x64 with Node.js 24.14.0
and npm 11.9.0.

### Native artifact evidence

| Artifact | Run | SHA-256 |
| --- | --- | --- |
| Linux artifact ZIP | #6 | `e1d870c6120e33cab81fd9127274976d8c43840d31cee3539ffdba369ee425e1` |
| Windows artifact ZIP | #6 | `17fe2ad9196c97ca60e8e8c68d76435e9f2bd6922b3aae09a6bded3bc106e503` |
| Linux AppImage | #5 payload inspection | `cc15ba158fc93bc2710d0cb185706e71cd6339293406529f914a19c313a77416` |
| Linux DEB | #5 payload inspection | `d59339ab38d1a5786c5c2d993fc55a3967ccef3b75c71732c8f3006e6746e819` |
| Linux RPM | #5 payload inspection | `cea51893a229399504cc65ed7e0ddf09cbaf4efa2942e5a7181e1cb254e762e3` |
| Windows MSI | #5 payload inspection | `f02b26d531e8987d03373400459628b0d89040d13069f64277153034c4ee2e90` |
| Windows NSIS setup EXE | #5 payload inspection | `a0b4e1d1738cb5681c5fcee632a693eea9e15c27d6c4783e413b86c186478a9f` |

Run #5 ZIPs were downloaded, checksum-matched, archive-tested and inspected
down to each package type. Run #6 repeats the locked build, publishes fresh
GitHub-checksummed artifacts and additionally passes both native process
tests.

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
| Clean-machine installer acceptance | CI verifies compile, package integrity and process start, but not interactive install/uninstall | Installer UI or machine-specific integration defects may remain | Disposable Windows and Linux machines | Install, launch, exercise the manual workflow and uninstall each package |
| Full installation discovery | Only standard candidates exist | Non-standard installs require manual selection | Real Steam/GOG/custom layouts | Test real layouts and add evidence-backed detection providers |
| Persistent incremental index | 0.1 keeps an in-memory snapshot | Large libraries need rescans and cannot resume | Persistent storage design | Add cancellable SQLite index with migration and resume tests |
| Dependency/conflict engine | Full TF2/base-game/dependency corpus is not indexed | Some missing or conflicting resources remain heuristic | Verified TF2 semantics and real test corpus | Build a provenance-aware dependency graph |
| CommonAPI2 intelligence | No verified installation or authoritative versioned corpus | False API guidance if guessed | Real CommonAPI2 evidence | Follow the staged plan in `commonapi2.md` |
| Preview and editor depth | No model/material/texture preview or full API database | Reduced authoring convenience | Format parsers and licensed knowledge corpus | Add one evidence-backed preview format at a time |
| Performance baselines | No representative 800-mod corpus | Scale and memory behavior unknown | Reproducible benchmark fixture | Measure scan, search, logs and memory; publish raw results |
| Native visual workflow | CI confirms a stable process start but does not inspect rendered pixels | Layout and interaction defects may remain | Interactive native test workstation | Run screenshots plus the manual workflow at 980×640 and 1440×900 |

## Deviations

- This is a first vertical slice, not the complete IDE described by the master
  outcome contract.
- Native compile, tests, packages and process starts are verified; interactive
  clean-machine installation and the full manual workflow are not.
- Both JavaScript and Rust dependency graphs are locked.
- Resource references are not called missing unless the available project index
  proves a case mismatch; external absence remains heuristic.
- CommonAPI2 is isolated but not integrated.
- There is no archive import/export, dependency graph, resumable database,
  model preview, full completion corpus, signed installer or published release.
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
