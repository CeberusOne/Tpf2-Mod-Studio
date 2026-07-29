# Installation

## Public Alpha delivery status

Version `v0.1.0-alpha.1` is prepared as an explicitly labelled **Public Alpha**.
Its Windows MSI/NSIS and Linux AppImage/DEB/RPM packages are unsigned. Builds,
archive integrity and compiled-process starts are verified, but clean-machine
installation, uninstall and a complete workflow against a real Transport Fever
2 installation are not yet accepted.

When available, durable tester packages and `SHA256SUMS.txt` are published on
the repository's
[Releases page](https://github.com/CeberusOne/Tpf2-Mod-Studio/releases).
Verify the downloaded file before opening or installing it:

```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

On Windows PowerShell, compare the listed value with:

```powershell
Get-FileHash .\Tpf2-Mod-Studio-installer-file -Algorithm SHA256
```

## Developer installation

Required on every platform:

- Node.js 22.12 or newer (Node.js 24 is used by the recorded verification);
- npm;
- Rust 1.77.2 or newer through `rustup`;
- the current Tauri 2 operating-system prerequisites.

Clone or unpack the source, then install the locked JavaScript dependency graph:

```bash
npm ci
```

### Windows

Install the Microsoft C++ Build Tools and WebView2 requirements documented by
Tauri. Then run:

```powershell
npm run desktop:dev
```

### Linux

Install the WebKitGTK 4.1, AppIndicator, librsvg and packaging dependencies for
the distribution, following the Tauri prerequisite table. Then run:

```bash
npm run desktop:dev
```

The exact distribution package names differ. The official prerequisite page is
the source of truth:
<https://v2.tauri.app/start/prerequisites/>.

## First real project

1. Start the native desktop application.
2. Use **Neues Projekt**, select an empty parent directory, and enter an ID in
   the form `author_modname_1`.
3. Open or edit the generated files.
4. Resolve confirmed validation errors.
5. In **Build & Installation**, explicitly select a Transport Fever 2
   `mods` directory.
6. Install. Existing target folders require explicit overwrite consent and are
   backed up before replacement.

The web-only development preview deliberately disables filesystem and process
actions. Those operations are available only through the native Tauri command
boundary.

## Temporary CI artifact access

Open a successful **Native CI** run in the repository's **Actions** tab and
download the Windows or Linux artifact from the **Artifacts** section. These
temporary artifacts expire after seven days and are not a substitute for a
named Public Alpha release.

## Uninstalling a Public Alpha build

Installer-specific uninstall behavior is not yet accepted on a clean machine.
Use the operating system's normal application removal interface and report any
remaining application files through the bug-report template. Mods installed
into Transport Fever 2 are separate user data and are never removed
automatically.
