# Test guide

## Full verified JavaScript gate

```bash
npm ci
npm run verify
```

`verify` runs, in order:

1. TypeScript typechecking for the domain and desktop workspaces;
2. all Vitest unit, integration and component tests;
3. production builds for the domain package and React application.

The recorded 2026-07-30 environment is Ubuntu 24.04 x64, Node.js 24.14.0 and
npm 11.9.0. The current endcheck result is 24 passed and 0 failed tests across
two test files. Timing is a reproducibility observation, not a product
performance benchmark.

## Covered cases

- valid and syntactically broken root `mod.lua`;
- diagnostic source position;
- resource case mismatch;
- unresolved external resource kept heuristic;
- Windows-compatible case collision;
- deterministic index add/change/remove diff;
- 810 resource entries without loss;
- complete documented modifier/filter category catalogue;
- valid and deliberately broken modifier callbacks;
- modifier registration order and load-phase checks;
- repeated log grouping and warning/error separation;
- Lua stacktrace, missing-module root cause and linked follow-up errors;
- CommonAPI2 build mismatch and linked termination;
- explicit unreliable result for an unknown error signature;
- real create, scan, edit, validate and install workflow in a temporary tree;
- collision refusal and explicit replacement backup;
- path traversal rejection;
- production UI with no fabricated project;
- UI rendering a bridge-provided real snapshot;
- validation-controlled installation gate.

## Native gate

The CI pipeline runs:

```bash
cd apps/desktop/src-tauri
cargo fmt --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
cd ../../..
npm run desktop:build
```

On 2026-07-29 all commands passed on GitHub-hosted Ubuntu 22.04 and Windows
Server 2022. Five Rust tests passed on each operating system. After packaging,
the pipeline also starts the compiled desktop process for at least ten seconds;
Linux runs under Xvfb and Windows starts the release EXE directly.

## Manual native workflow

Use only disposable project and installation directories.

1. Start with `npm run desktop:dev`.
2. Create a vanilla project and confirm the generated files exist on disk.
3. Reopen it, edit `strings.lua`, save, close and reopen.
4. Introduce and then repair a Lua syntax error.
5. Select a disposable `mods` directory and install.
6. Confirm a second install is refused without overwrite consent.
7. Consent, reinstall, and confirm the previous directory was backed up.
8. Load a real copied `stdout.txt`; confirm root causes, stack frames, involved
   mods and consequences are separated, and unknown errors make the causal
   result unreliable.
9. Detect paths, inspect every candidate, and launch only an explicitly chosen
   executable.

## Outstanding load and negative tests

The 810-entry index test is not a full 800-mod installation benchmark. Still
required:

- mixed 800+ mod directories with broken folders, permission failures,
  symlinks and deep trees;
- cancellation and restart of a persistent incremental index;
- very large real `stdout.txt` files near and above the 32 MiB IPC cap;
- broken encodings and supported binary resources;
- full dependency, provenance and cross-mod load-order conflicts;
- a broad, privacy-scrubbed real-world `stdout.txt` corpus;
- incompatible CommonAPI2 installations;
- native Windows and Linux path, case and installer behavior;
- interactive clean-machine install, startup and uninstall;
- measured CPU, elapsed time and memory baselines.

No performance number is claimed until those measurements exist.
