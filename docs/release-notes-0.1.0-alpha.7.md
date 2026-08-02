# Tpf2 Mod Studio 0.1.0-alpha.7

Product status remains **PARTIAL**. Packages are unsigned pre-releases.

This release fixes a security issue in ZIP mod import, makes real Transport
Fever 2 log files usable, and reworks the mod library view.

## Fixed: log analysis on real stdout.txt

Opening a real `stdout.txt` failed outright with
`Cannot decode log as UTF-8`. Transport Fever 2 writes stdout from several
threads without locking, so lines get shredded into each other and multi-byte
UTF-8 sequences are torn apart. Those bytes are unrecoverable, so the log is
now decoded lossily instead of rejecting the whole file over a handful of
damaged characters (observed: 26 damaged spots in a 24 MB log).

Fixing the decode alone was not enough. The path patterns used for file and
stack-frame extraction let their segment class match the path separator, so
the same shredded lines backtracked exponentially — 16 path segments already
took 8 seconds, and a real 24.6 MB log produced no result at all after ten
minutes. The patterns are now unambiguous, and that log parses in 2.9 seconds.

A long stack traceback was also re-processed once per appended line, which is
quadratic in traceback length: 6000 frames took 22 seconds and now take 18 ms.

## Fixed: unsafe ZIP mod import (Windows)

Archive import rejected only `..` and `.` path segments. Absolute and
drive-prefixed entry names passed through, and joining those onto the staging
directory silently discards the base path on Windows — a crafted mod archive
could write outside the intended folder. Every entry is now validated as a
plain relative path.

Extraction is additionally capped at 20,000 entries and 512 MiB, and a
rejected archive no longer leaves a staging directory behind.

## Mod library: grouped by source, with previews

Installed mods are separated into local mods, staging area, Steam Workshop and
mods shipped with the game, instead of one flat list. Each mod shows its
preview image.

About a fifth of installed mods ship only `image_00.tga`, which no embedded
browser can display, so previews are decoded natively and downscaled. Because
preview images can reach 31 MiB each, previews load per card as it scrolls
into view rather than all at once.

## Also fixed

- Installing into `staging_area` failed on installations where Transport
  Fever 2 had not created that folder yet.
- ZIP export wrote next to the project without asking; it now opens a save
  dialog.
- Saving a file no longer rescans and re-validates the entire project.
- The tab close button is reachable by keyboard.
- Corrected `docs/security-model.md`, which claimed the application makes no
  network requests at all. The startup GitHub release check and the optional,
  user-configured AI assist are now documented, including where the AI API key
  is stored.

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
See [docs/installation.md](https://github.com/CeberusOne/Tpf2-Mod-Studio/blob/main/docs/installation.md).
