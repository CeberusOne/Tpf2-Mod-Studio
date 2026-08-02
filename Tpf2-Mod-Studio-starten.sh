#!/usr/bin/env bash
# Starts the locally built Tpf2 Mod Studio.
#
# Rebuilds first when sources are newer than the binary, so running this always
# gives the current state of the working tree. Independent of the installed
# AppImage and of the auto-updater.
#
#   ./Tpf2-Mod-Studio-starten.sh            build if needed, then start
#   ./Tpf2-Mod-Studio-starten.sh --force    always rebuild
#   ./Tpf2-Mod-Studio-starten.sh --no-build never rebuild
set -uo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BIN="$ROOT/apps/desktop/src-tauri/target/release/tpf2-mod-studio"
DIST="$ROOT/apps/desktop/dist/index.html"

# Node is installed under ~/.local for this account; keep it reachable when the
# script is launched from a file manager with a minimal environment.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
# WebKitGTK 2.42+ aborts on some GPU/Wayland setups without this. The binary
# sets it too; exporting here also covers the build step.
export WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"

mode="${1:-auto}"

newest_source() {
  find "$ROOT/apps/desktop/src" "$ROOT/apps/desktop/src-tauri/src" \
       "$ROOT/packages/core/src" -type f \
       \( -name '*.ts' -o -name '*.tsx' -o -name '*.rs' -o -name '*.css' \) \
       -newer "$BIN" -print -quit 2>/dev/null
}

needs_build() {
  case "$mode" in
    --force) return 0 ;;
    --no-build) return 1 ;;
  esac
  [ -x "$BIN" ] || return 0
  [ -f "$DIST" ] || return 0
  [ -n "$(newest_source)" ]
}

if needs_build; then
  echo "==> Sources changed, rebuilding (this takes a moment)..."
  if ! command -v npm >/dev/null 2>&1; then
    echo "!! npm not found. Install Node.js, or start with --no-build." >&2
    exit 1
  fi
  [ -d "$ROOT/node_modules" ] || (cd "$ROOT" && npm ci) || exit 1
  (cd "$ROOT" && npm run build) || { echo "!! Frontend build failed." >&2; exit 1; }
  # Developer tools stay enabled: right-click -> Inspect shows the console,
  # which is what identifies UI failures in a packaged build.
  (cd "$ROOT/apps/desktop/src-tauri" && cargo build --release --features tauri/devtools) \
    || { echo "!! Rust build failed." >&2; exit 1; }
  echo "==> Build finished."
fi

if [ ! -x "$BIN" ]; then
  echo "!! No binary at $BIN — run without --no-build to build it." >&2
  exit 1
fi

echo "==> Starting $BIN"
exec "$BIN" "$@"
