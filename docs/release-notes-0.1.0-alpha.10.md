# Tpf2 Mod Studio 0.1.0-alpha.10

Developed by Mike Hering. Product status remains **PARTIAL**. Packages are
unsigned pre-releases.

## Fixed: updates could be seen but not installed

The application checked for a new version at startup and showed a short notice
saying one exists — and then offered no way to install it. The install and
restart commands were present in the program but nothing in the interface ever
called them. That is why published releases never actually arrived.

The notice is now a banner that stays until you act on it, with an **Install
now** button and a **Restart now** button afterwards. Nothing installs on its
own, which is what keeps the old restart-loop problem fixed.

If you are on an older version, this fix only takes effect from the *next*
update. Install this one from the Releases page or with the installer command
below.

## Installer improvements

Both installers picked the wrong release under some conditions: they asked
GitHub for the "latest" release, which deliberately skips pre-releases. Since
every release here is a pre-release, that would have pinned you to an old
stable version the moment one existed. They now select the highest version
themselves.

Both also verify the published SHA-256 checksum before installing and abort on
a mismatch. Neither did that before, although every release ships the
checksums.

## Install

**Linux (AppImage):**

```bash
curl -fsSL https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-linux.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-windows.ps1 | iex
```

Packages are unsigned. Verify with `SHA256SUMS.txt` when needed.
