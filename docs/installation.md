# Installation

## 0.1 delivery status

Version 0.1 is a tested source delivery, not a published binary release.
GitHub Actions produces unsigned Windows MSI/NSIS and Linux AppImage/DEB/RPM
development artifacts. Their builds, archive integrity and compiled-process
starts are verified, but clean-machine installation and uninstall are not.
Do not present these artifacts as an official release.

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

## CI artifact access

Open a successful **Native CI** run in the repository's **Actions** tab and
download the Windows or Linux artifact from the **Artifacts** section. GitHub
requires repository access for this private repository. CI artifacts expire
after seven days.

## Uninstalling a development build

Installer-specific uninstall behavior is not yet accepted on a clean machine.
A source checkout can be removed like any other development directory. Mods
installed into Transport Fever 2 are separate user data and are never removed
automatically.
