# Changelog

## Unreleased

- ZIP mod support: inspect archives for `mod.lua` and import into the mods folder
  (nested roots supported, overwrite with backup).
- Log view focuses on problems only by default; hides TF2 startup/Vulkan/init noise
  known from forums and wiki guidance; rows open on click for full cause/fix/stack.
- Optional AI assist: fully user-chosen OpenAI-compatible API (no preset provider);
  disabled by default; Studio works without any AI key.
- Added a UI text-size slider (13–20px) with persistence; editor font follows.
- Improved stdout.txt root-cause analysis for real TF2 logs (no `ERROR` prefix),
  including missing `mod.lua`, Lua module load failures, absolute stack frames
  and mod id extraction from user-data / workshop / mod.io paths.
- Auto-detects game install, user-data, preferred mods folder and latest
  `stdout.txt` on startup; fills Install and Log targets automatically.
- Replaced marketing-style panel copy with concise professional DE/EN wording.
- Game paths view lists detected executable, user data, mods and log locations.

## 0.1.0-alpha.2 — 2026-08-02

- Fixed Linux startup abort (`Could not create GBM EGL display`) by defaulting
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` inside the native binary (user override
  preserved).
- Added one-command installers: `scripts/install-linux.sh` and
  `scripts/install-windows.ps1`, plus `scripts/uninstall-linux.sh`.
- Added **Publish Release** workflow that builds Windows MSI/NSIS and Linux
  AppImage/DEB/RPM from source, smoke-starts both platforms, writes
  `SHA256SUMS.txt` and publishes a GitHub Release.
- Simplified end-user installation docs in `README.md` and
  `docs/installation.md`.
- Added the complete documented vanilla TF2 resource-modifier and file-filter
  category catalog with load-phase and chaining semantics.
- Added static checks for registration phase, category, callback inputs and
  modifier/filter return contracts.
- Replaced keyword-only log grouping with supported causal analysis, including
  stack frames, affected files/mods, root-cause/follow-up links and
  cause-specific fixes.
- Added an explicit reliability gate: unknown error signatures prevent a
  reliable-causality claim.
- Added valid/broken modifier and realistic stdout/CommonAPI2 regression
  fixtures plus a causal log UI.
- Documented the verified Vanilla/CommonAPI2 boundary and remaining runtime,
  provenance and real-corpus limits.

## 0.1.0-alpha.1 — 2026-07-29

- Established the Tauri/React monorepo.
- Added a real-filesystem project workflow and safe Node reference adapter.
- Added static Lua and TF2 project validation.
- Added case-sensitive resource-reference diagnostics.
- Added resource indexing and incremental diff calculation.
- Added grouped `stdout.txt` parsing without invented root causes.
- Added a native Tauri bridge for project creation, scanning, saving,
  installation, installation detection and explicit game launch.
- Added the desktop workbench UI with editor tabs, diagnostics, index overview,
  installation workflow, log view, theme switch and beginner/expert views.
- Locked the Rust dependency graph and enforced locked native release builds.
- Added native Rust workflow, traversal and log tests.
- Added Windows/Linux CI for formatting, tests, Clippy, packaging and
  compiled-process smoke starts.
- Added a reproducible Public Alpha release workflow for Windows MSI/NSIS and
  Linux AppImage/DEB/RPM packages with SHA-256 checksums.
- Added public contribution, security, issue and pull-request guidance.
- Licensed the project under GNU GPL version 3 only (`GPL-3.0-only`).

### Known limitations

- Packages are unsigned and may trigger operating-system trust warnings.
- Interactive installation and uninstall have not been accepted on clean user
  systems.
- A complete create-to-install workflow has not been accepted against a real
  Transport Fever 2 installation.
- The product remains a partial vertical slice rather than a complete modding
  studio.
