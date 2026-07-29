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

## Network and telemetry

The first slice has no network access, update service, analytics or telemetry.
