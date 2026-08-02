# Security and write-access model

## Trust zones

Transport Fever 2 installations and arbitrary imported mods are untrusted
inputs. The application must not execute their Lua scripts while indexing or
validating them.

## Read rules

- Users explicitly select project, log and installation paths.
- Automatic detection only reports candidates that match known directory
  markers.
- Large text files are capped before entering the UI process.
- Binary resources are indexed by metadata and never decoded as text.

## Write rules

- Project-relative paths reject absolute paths, parent traversal and NUL bytes.
- A resolved write target must remain beneath the canonical project root.
- Only supported text extensions may be changed through the editor command.
- Each overwrite receives a recovery copy.
- Installation targets are derived from the opened project's directory name.
- Game `res` directories are never installation targets.

## External process rules

Transport Fever 2 launches only after a visible user action. The executable is
validated as a file and passed to the operating-system process API directly.
No shell command string is constructed. The app does not terminate the game.

## Archive import rules

- Every archive entry is validated as a relative path before extraction.
  Traversal segments, absolute paths and Windows drive prefixes are rejected;
  `Path::join` would otherwise silently escape the staging directory.
- Extraction is capped at 20,000 entries and 512 MiB decompressed.
- A rejected archive removes its staging directory and installs nothing.

## Network and telemetry

There is no analytics and no telemetry. Exactly one feature reaches the
network, and it is scoped and visible to the user.

- **Update check.** At startup the app issues one unauthenticated `GET` to
  `api.github.com/repos/CeberusOne/Tpf2-Mod-Studio/releases`. It reads release
  metadata only; nothing is uploaded. Downloading and installing an update
  requires an explicit user action, is capped at 512 MiB, and never restarts
  the application on its own.

No other outbound request is made. Mod content is never uploaded anywhere.
