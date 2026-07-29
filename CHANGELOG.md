# Changelog

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
