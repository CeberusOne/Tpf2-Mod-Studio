# Changelog

## 0.1.0 — Unreleased

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
- Produced Windows MSI/NSIS and Linux AppImage/DEB/RPM development artifacts.
