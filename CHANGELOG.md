# Changelog

## 0.1.0-alpha.11 — 2026-08-03

- Windows Steam discovery now reads registry-configured Steam locations,
  `libraryfolders.vdf` and `appmanifest_1066780.acf` instead of assuming C:.
- Custom Steam libraries on D:, E: and other drives are detected automatically.
- Steam userdata discovery now follows the detected Steam client and supports
  multiple accounts; OneDrive Documents is retained only as a fallback.
- Mod Manager scanning is verified for local mods, `staging_area`, Steam
  Workshop content and game-provided mods, with canonical root deduplication.
- Manual game, userdata and mod paths remain available and override only the
  values explicitly supplied by the user.

## 0.1.0-alpha.10 — 2026-08-02

- Fixed an available update being impossible to install: the startup check
  showed a notice, but `applyUpdate` and `restartAfterUpdate` were never
  called from the interface. The offer is now a banner with explicit Install
  and Restart buttons; nothing installs automatically.
- Installers no longer resolve "latest" through an endpoint that skips
  pre-releases, and now verify the published SHA-256 before installing.

## 0.1.0-alpha.9 — 2026-08-02

- Added a Savegames tab: reads which mods a savegame used, checks their
  dependencies against the installed library and writes a `mod_presets` entry
  with a valid load order. Savegames are only read, never modified.
- Dependency check pulls required mods in, orders them before their dependents,
  reports cycles, and names which mods still have to be installed. Download
  links in dependency fields are reported as not verifiable instead of missing.
- Fixed the editor blanking the whole window when opening a Lua file: the Lua
  syntax definition referenced `@symbols` without defining it, which aborted
  Monaco's grammar compiler. Added a test that resolves every `@reference`.
- Added an error boundary so a failing area reports its error in place instead
  of unmounting the interface.
- Fixed the Standard/Advanced switch being squeezed to zero width in narrow
  windows, which also made the model viewer and mod file editor unreachable.
- Fixed the mod folder warning describing the wrong problem; it now names the
  offending characters and states the mod still loads.
- Model viewer: fit view, grid, axes, auto-rotate, light background, per-part
  visibility and a size readout in metres.
- Mod cards can be maximised to full screen; Escape leaves it.
- Clicking the sidebar logo returns to the main view.
- Removed the optional AI assist entirely. The only outbound request is the
  startup release check.
- Set Mike Hering as author across manifests, bundle metadata and the app.

## 0.1.0-alpha.8 — 2026-08-02

- Fixed validation refusing to install valid mods: 225 of 709 installed
  `mod.lua` files start with a UTF-8 byte order mark, which the Lua parser
  reported as a syntax error. It is now stripped before parsing.
- Mod library shows a three-state health light per mod (green / amber / red)
  with per-mod findings, causes and fixes behind Info.
- Workshop folder ids no longer trigger the mod-folder naming convention
  (618 unactionable warnings removed); findings that could not be proven
  statically no longer colour the light.
- Mod library groups mods by source and shows preview images, decoding
  `image_00.tga` natively and loading previews per visible card.
- Added a 3D model viewer for `.mdl` assets (Advanced level): LOD switching,
  wireframe, bounding box and collider, part and triangle counts.
- Added in-place editing of a mod's text files from the library
  (Advanced level), using the existing backup and atomic-replace path.

## 0.1.0-alpha.7 — 2026-08-02

- Fixed opening real `stdout.txt` files, which failed with
  `Cannot decode log as UTF-8`. TF2 writes stdout from several threads without
  locking, tearing multi-byte sequences apart; logs are now decoded lossily.
- Fixed exponential backtracking in the log path patterns, which made a real
  24.6 MB log produce no result at all. That log now parses in 2.9 s.
- Fixed quadratic event assembly for long stack tracebacks (6000 frames:
  22 s → 18 ms).
- Fixed unsafe ZIP mod import: absolute and Windows drive-prefixed archive
  entries could write outside the staging directory. Extraction is now capped
  at 20,000 entries and 512 MiB.
- Mod library is grouped by source (local, staging, Steam Workshop, shipped)
  and shows per-mod preview images, including `image_00.tga` decoded natively.
- Fixed installing into `staging_area` when the folder did not exist yet.
- ZIP export now asks for a target instead of writing beside the project.
- Saving a file no longer rescans and re-validates the whole project.
- Corrected `docs/security-model.md`, which claimed the app makes no network
  requests; documents the update check and the optional AI assist.

## Unreleased

- Plan alignment: mod library scanner (local/staging/workshop), project types
  (vehicle/repaint/asset/station/script), hybrid integration mode, ZIP export,
  staging_area install, log file list + stdout archive before game launch.
- Auto-updater quiet when already current; still self-updates AppImage/NSIS from GitHub.
- Auto-updater: on startup checks GitHub Releases (including pre-releases) and
  self-updates Linux AppImage / Windows setup installs when a newer version exists.
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
