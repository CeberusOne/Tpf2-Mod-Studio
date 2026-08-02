#!/usr/bin/env bash
# Remove a user-local Tpf2 Mod Studio AppImage install created by install-linux.sh.
set -euo pipefail

INSTALL_DIR="${TPF2_INSTALL_DIR:-$HOME/Applications}"
BIN_DIR="${TPF2_BIN_DIR:-$HOME/.local/bin}"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"

rm -f \
  "${INSTALL_DIR}/Tpf2.Mod.Studio.AppImage" \
  "${BIN_DIR}/tpf2-mod-studio" \
  "${BIN_DIR}/Tpf2-Mod-Studio" \
  "${APP_DIR}/tpf2-mod-studio.desktop" \
  "${ICON_DIR}/tpf2-mod-studio.png"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi

echo "Removed user-local Tpf2 Mod Studio files (if present)."
echo "Game mods under your Transport Fever 2 mods folder are left untouched."
