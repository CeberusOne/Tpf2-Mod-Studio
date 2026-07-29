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
- Light/dark UI and beginner/expert information levels

## Not yet complete

- CommonAPI2 API intelligence and compatibility verification
- persistent incremental index database and crash resume
- tested 800-mod installation scan in the native shell
- full TF2 dependency graph and load-order conflict semantics
- 3D model/material/mesh preview
- archive import and archive packaging
- complete TF2 Lua API completion database
- process lifecycle tracking after game launch
- streaming analysis of logs larger than the IPC cap
- signed and published Windows/Linux release
- interactive clean-machine installer and uninstall acceptance

Unsupported previews are not replaced by generic models.
