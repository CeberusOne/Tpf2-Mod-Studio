# Tpf2 Mod Studio 0.1.0 Public Alpha 1

This is the first durable community-testing build of Tpf2 Mod Studio. It is an
unsigned **Public Alpha** and the product remains **PARTIAL**.

## Included workflow

- Create and scan a real Transport Fever 2 mod project.
- Edit text resources with Monaco.
- Validate `mod.lua`, file names and resource references without executing Lua.
- Build and refresh a resource index.
- Install into an explicitly selected mod directory with collision protection
  and backups.
- Load and group messages from a real `stdout.txt`.

## Packages

- Windows x64: MSI and NSIS Setup EXE
- Linux x64: AppImage, DEB and RPM
- `SHA256SUMS.txt` for every uploaded package

All packages are unsigned. Verify the SHA-256 checksum before installation.
The Tpf2 Mod Studio source code is licensed under GNU GPL version 3 only
(`GPL-3.0-only`). Transport Fever game files and third-party mod content are not
included in that grant.

## Known limitations

- Interactive installation and uninstall are not yet accepted on clean user
  systems.
- A complete create-to-install workflow has not been accepted against a real
  Transport Fever 2 installation.
- Transport Fever 1 and Transport Fever 3 support are planned future targets,
  not current functionality.
- CommonAPI2 API intelligence remains disabled pending a verified local
  installation and documentation source.
- Major Mod Studio modules beyond the documented 0.1 vertical slice are not
  implemented.

## Testing

Follow `docs/installation.md`. Report reproducible problems with the repository's
bug-report form and include the operating system, package type, reproduction
steps and only the relevant, privacy-scrubbed `stdout.txt` section.

Do not publish suspected vulnerabilities as issues. Use the private reporting
instructions in `SECURITY.md`.
