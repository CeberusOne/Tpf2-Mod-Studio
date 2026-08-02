# Installation

## Quick install (recommended)

Packages are published on the
[Releases page](https://github.com/CeberusOne/Tpf2-Mod-Studio/releases).
They are unsigned **Public Alpha** builds.

### Linux

One command installs the latest AppImage into `~/Applications`, adds a Start
menu entry and a `tpf2-mod-studio` command:

```bash
curl -fsSL https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-linux.sh | bash
```

Then start **Tpf2 Mod Studio** from the application menu, or run:

```bash
tpf2-mod-studio
```

Alternatives from a release asset:

| Package | Use when |
| --- | --- |
| `.AppImage` | Any distro (recommended; used by the script above) |
| `.deb` | Debian / Ubuntu (`sudo apt install ./Tpf2.Mod.Studio_*.deb`) |
| `.rpm` | Fedora / openSUSE / RHEL (`sudo rpm -i Tpf2.Mod.Studio-*.rpm`) |

Uninstall a user-local AppImage install:

```bash
curl -fsSL https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/uninstall-linux.sh | bash
```

### Windows

In **PowerShell**:

```powershell
irm https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-windows.ps1 | iex
```

Or download from Releases:

| Package | Use when |
| --- | --- |
| `*-setup.exe` (NSIS) | Double-click installer (default for the script) |
| `*.msi` | Enterprise / silent deploy (`msiexec /i …`) |

If **SmartScreen** warns about an unsigned app: *More info* → *Run anyway*.

Optional silent install:

```powershell
irm https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-windows.ps1 | iex
# or from a clone:
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 -Silent
```

### Verify downloads (optional)

```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

PowerShell:

```powershell
Get-FileHash .\Tpf2.Mod.Studio-installer-file -Algorithm SHA256
```

## Linux runtime note

On some NVIDIA / hybrid-GPU / Wayland systems, WebKitGTK can crash at startup
with `Could not create GBM EGL display`. Current builds set
`WEBKIT_DISABLE_DMABUF_RENDERER=1` automatically inside the app. The Linux
install script also sets it in the launcher. To override:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=0 tpf2-mod-studio
```

## Public Alpha status

Installer packages are unsigned. Automated CI verifies build, tests and a short
process start on Ubuntu 22.04 and Windows Server 2022. Clean-machine interactive
acceptance against a full Transport Fever 2 install is still community testing.

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
2. Use **Neues Projekt** / **New project**, select an empty parent directory, and
   enter an ID in the form `author_modname_1`.
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
named release.

## Publishing a release (maintainers)

Use **Actions → Publish Release → Run workflow** on `main` (or push a `v*` tag).
That workflow builds Windows MSI/NSIS and Linux AppImage/DEB/RPM packages from
source, smoke-starts the binary on both OSes, writes `SHA256SUMS.txt` and
uploads a GitHub Release. See [build-and-packaging.md](build-and-packaging.md).

## Uninstalling

- **Linux AppImage (script install):** run `scripts/uninstall-linux.sh`.
- **Windows / DEB / RPM:** use the operating system's normal application removal
  interface.

Mods installed into Transport Fever 2 are separate user data and are never
removed automatically.
