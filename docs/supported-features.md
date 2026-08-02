# Supported features and known limits

## Implemented in source

- Vanilla and separately labelled CommonAPI2 project modes
- Minimal mod project generation (`mod.lua`, `strings.lua`, documentation)
- Safe project scanning and editing
- Static Lua syntax parsing
- Required `mod.lua` structure checks
- Cross-platform filename collision and case checks
- Resource-reference extraction for common TF2 extensions
- Resource index and incremental snapshot diff
- Safe folder installation with backup
- Basic installation candidate detection
- Explicit, shell-free executable launch
- Grouped `stdout.txt` errors and warnings
- Complete documented vanilla modifier/filter category catalogue
- Static modifier registration, callback and return-contract checks
- Causal `stdout.txt` analysis for supported Lua, resource and CommonAPI2
  signatures, including stack frames, mod attribution and linked consequences
- ZIP mod import with path-validated, size-capped extraction
- Clean project ZIP export to a user-chosen target
- Installed-mod library scan across local, staging, builtin and workshop paths
- Startup update check against GitHub Releases; install stays a user action
- Light/dark UI and beginner/expert information levels

## Not yet complete

- CommonAPI2 API intelligence and compatibility verification
- persistent incremental index database and crash resume
- tested 800-mod installation scan in the native shell
- full TF2 dependency graph, active-mod provenance and cross-mod order proof
- 3D model/material/mesh preview
- complete TF2 Lua API completion database
- process lifecycle tracking after game launch
- streaming analysis of logs larger than the IPC cap
- universal diagnosis of unknown engine/native log signatures
- signed and published Windows/Linux release
- interactive clean-machine installer and uninstall acceptance

Unsupported previews are not replaced by generic models.
