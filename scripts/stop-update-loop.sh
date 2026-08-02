#!/usr/bin/env bash
# Emergency: stop a restart-looping Tpf2 Mod Studio and mark known release tags.
set -euo pipefail

echo "==> Stopping Tpf2 Mod Studio processes..."
# Match by exact binary basename only (avoid killing this script).
if command -v pkill >/dev/null 2>&1; then
  pkill -x tpf2-mod-studio 2>/dev/null || true
  pkill -x "Tpf2 Mod Studio" 2>/dev/null || true
fi
# Also stop AppImage processes started from the install path.
if command -v pgrep >/dev/null 2>&1; then
  while read -r pid; do
    [ -n "${pid:-}" ] || continue
    kill "$pid" 2>/dev/null || true
  done < <(pgrep -f '/Applications/Tpf2\.Mod\.Studio' || true)
  sleep 1
  while read -r pid; do
    [ -n "${pid:-}" ] || continue
    kill -9 "$pid" 2>/dev/null || true
  done < <(pgrep -f '/Applications/Tpf2\.Mod\.Studio' || true)
fi

STATE_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/tpf2-mod-studio"
mkdir -p "$STATE_DIR"
# Used by alpha.6+ so the same package is never reinstalled.
echo "v0.1.0-alpha.5" > "$STATE_DIR/last-applied-release-tag"
echo "==> Wrote $STATE_DIR/last-applied-release-tag"
echo "==> Install the fixed build (v0.1.0-alpha.6+) from GitHub Releases:"
echo "    curl -fsSL https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-linux.sh | bash"
