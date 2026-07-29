# ADR 0001: Tauri 2, React and a typed domain boundary

- Status: Accepted for vertical slice 0.1
- Date: 2026-07-29

## Context

Tpf2 Mod Studio must be a standalone Windows and Linux desktop application. It
needs native filesystem and process access while keeping game base resources
read-only. The UI requires a capable text editor and must remain testable
without executing unknown mod scripts.

## Decision

Use:

- Tauri 2 as the desktop shell and IPC security boundary;
- a thin Rust command layer for privileged filesystem and process operations;
- React 19 with Vite for the interface;
- a framework-neutral TypeScript domain package for snapshots, validation,
  resource indexing and log parsing;
- Monaco for code editing.

The TypeScript domain receives immutable file snapshots and produces
diagnostics. It has no authority to write to disk. All writes cross explicit
Tauri commands whose Rust implementation revalidates paths. A Node adapter
implements the same contract only for automated real-filesystem tests and
developer tooling; it is not bundled into the desktop frontend.

Performance-sensitive full-library indexing may move into a Rust crate after
profiling. The public snapshot and diagnostic contracts allow that replacement
without changing projects or UI behavior.

## Why Tauri

Tauri produces a native desktop window using the platform WebView, supports
Windows and Linux and keeps system access behind a capability/command boundary.
It avoids requiring a separately opened browser and aligns with the project's
existing architecture baseline.

## Consequences

- Windows builds require Microsoft C++ Build Tools and WebView2.
- Linux builds require Rust, a C toolchain and WebKitGTK platform packages.
- Native builds must be verified on both target operating systems.
- The browser-only Vite preview deliberately disables privileged actions.
- Domain tests can run without Tauri; native command tests still require Rust.

## Rejected alternatives

- VS Code extension: not a standalone product.
- Browser-only app: cannot safely implement the required local workflow.
- Electron: workable, but conflicts with the established Tauri/Rust baseline
  and carries a larger bundled runtime.
- Executing `mod.lua` to extract metadata: unsafe for untrusted mods.
