#!/usr/bin/env bash
# Install Tpf2 Mod Studio (Linux) from the latest GitHub release AppImage.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/CeberusOne/Tpf2-Mod-Studio/main/scripts/install-linux.sh | bash
# Or from a local clone:
#   ./scripts/install-linux.sh
set -euo pipefail

REPO="${TPF2_REPO:-CeberusOne/Tpf2-Mod-Studio}"
TAG="${TPF2_TAG:-latest}"
INSTALL_DIR="${TPF2_INSTALL_DIR:-$HOME/Applications}"
BIN_DIR="${TPF2_BIN_DIR:-$HOME/.local/bin}"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
APP_NAME="Tpf2 Mod Studio"
APPIMAGE_NAME="Tpf2.Mod.Studio.AppImage"
WRAPPER_NAME="tpf2-mod-studio"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_cmd curl
need_cmd mkdir
need_cmd chmod
need_cmd ln
need_cmd grep
need_cmd sed

fetch_release_json() {
  # Prefer a specific tag when requested. For "latest", include pre-releases
  # (Public Alpha packages are published as pre-releases).
  if [ "$TAG" != "latest" ]; then
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/tags/${TAG}"
    return
  fi
  # `/releases/latest` skips pre-releases by design. Every release here is a
  # pre-release, so relying on it returns nothing today and, once a stable
  # release exists, would keep installing that one while ignoring newer
  # pre-releases. Pick the highest version from the list instead.
  curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=50" \
    | if command -v python3 >/dev/null 2>&1; then
        python3 -c '
import json, sys

def sort_key(tag):
    """Zero-pad numeric parts so 10 outranks 9, and rank a final release above
    any pre-release of the same core version."""
    text = tag.lstrip("v")
    core, _, pre = text.partition("-")
    parts = (core.split(".") + ["0", "0", "0"])[:3]
    numbers = []
    for part in parts:
        try:
            numbers.append(int(part))
        except ValueError:
            numbers.append(0)
    head = "%06d.%06d.%06d" % tuple(numbers)
    if not pre:
        return head + ".1."
    ids = []
    for ident in pre.split("."):
        ids.append("0%010d" % int(ident) if ident.isdigit() else "1" + ident)
    return head + ".0." + ".".join(ids)

releases = [r for r in json.load(sys.stdin) if not r.get("draft")]
if not releases:
    sys.exit(1)
releases.sort(key=lambda r: sort_key(r.get("tag_name") or ""), reverse=True)
json.dump(releases[0], sys.stdout)
'
      else
        # Minimal fallback without Python: first object in the array.
        tr '\n' ' ' | sed 's/^[[:space:]]*\[//;s/\][[:space:]]*$//' | sed 's/},[[:space:]]*{/\n&\n/g' | head -n 1
      fi
}

echo "==> Resolving release (${TAG}) from ${REPO}..."
release_json="$(fetch_release_json)" || {
  echo "Could not resolve a GitHub release for ${REPO}." >&2
  exit 1
}

if command -v python3 >/dev/null 2>&1; then
  eval "$(
    printf '%s' "$release_json" | python3 -c '
import json, sys, shlex
r = json.load(sys.stdin)
tag = r.get("tag_name") or ""
url = ""
asset = ""
sums = ""
for a in r.get("assets") or []:
    name = a.get("name") or ""
    if name.endswith(".AppImage"):
        url = a.get("browser_download_url") or ""
        asset = name
    elif name == "SHA256SUMS.txt":
        sums = a.get("browser_download_url") or ""
print("tag_name=" + shlex.quote(tag))
print("download_url=" + shlex.quote(url))
print("asset_name=" + shlex.quote(asset))
print("sums_url=" + shlex.quote(sums))
'
  )"
else
  download_url="$(
    printf '%s' "$release_json" \
      | tr ',' '\n' \
      | sed -n 's/.*"browser_download_url": "\([^"]*\.AppImage\)".*/\1/p' \
      | head -n 1
  )"
  tag_name="$(
    printf '%s' "$release_json" \
      | tr ',' '\n' \
      | sed -n 's/.*"tag_name": "\([^"]*\)".*/\1/p' \
      | head -n 1
  )"
fi

if [ -z "${download_url:-}" ]; then
  echo "No AppImage asset found on release ${TAG}." >&2
  echo "Open https://github.com/${REPO}/releases and download the Linux package manually." >&2
  exit 1
fi

echo "==> Release: ${tag_name:-$TAG}"
echo "==> Download: ${download_url}"

mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$APP_DIR" "$ICON_DIR"
tmp_file="$(mktemp "${TMPDIR:-/tmp}/tpf2-mod-studio.XXXXXX.AppImage")"
trap 'rm -f "$tmp_file"' EXIT

curl -fL --progress-bar -o "$tmp_file" "$download_url"

# Packages are unsigned, so the published checksum is the only integrity check
# available. This script is meant to be piped into a shell, which makes
# verifying the download worth the extra request.
if [ "${TPF2_SKIP_CHECKSUM:-0}" = "1" ]; then
  echo "!! Checksum verification skipped (TPF2_SKIP_CHECKSUM=1)."
elif [ -n "${sums_url:-}" ] && [ -n "${asset_name:-}" ] && command -v sha256sum >/dev/null 2>&1; then
  echo "==> Verifying SHA-256..."
  expected="$(curl -fsSL "$sums_url" | awk -v n="$asset_name" '{ f=$2; sub(/^\*/, "", f); if (f == n) { print $1; exit } }')"
  if [ -z "$expected" ]; then
    echo "SHA256SUMS.txt has no entry for ${asset_name}." >&2
    exit 1
  fi
  actual="$(sha256sum "$tmp_file" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    echo "Checksum mismatch for ${asset_name}." >&2
    echo "  expected ${expected}" >&2
    echo "  actual   ${actual}" >&2
    exit 1
  fi
  echo "    OK ${actual}"
else
  echo "!! No SHA256SUMS.txt or sha256sum available; the download is unverified."
fi

chmod +x "$tmp_file"

target_appimage="${INSTALL_DIR}/${APPIMAGE_NAME}"
mv -f "$tmp_file" "$target_appimage"
trap - EXIT
chmod +x "$target_appimage"

# Optional icon extraction (AppImage type-2; ignore failures).
extract_dir="$(mktemp -d "${TMPDIR:-/tmp}/tpf2-extract.XXXXXX")"
if (cd "$extract_dir" && "$target_appimage" --appimage-extract >/dev/null 2>&1); then
  icon_src="$(
    find "$extract_dir" -type f \( -name 'tpf2-mod-studio.png' -o -name '*.png' \) \
      | head -n 1 || true
  )"
  if [ -n "${icon_src:-}" ]; then
    cp -f "$icon_src" "${ICON_DIR}/tpf2-mod-studio.png"
  fi
fi
rm -rf "$extract_dir"

# Launcher wrapper: keeps a stable command name and documents the WebKit env
# default (also applied inside the binary on modern builds).
wrapper="${BIN_DIR}/${WRAPPER_NAME}"
cat > "$wrapper" << EOF
#!/usr/bin/env bash
export WEBKIT_DISABLE_DMABUF_RENDERER="\${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"
exec "${target_appimage}" "\$@"
EOF
chmod +x "$wrapper"

desktop_file="${APP_DIR}/tpf2-mod-studio.desktop"
cat > "$desktop_file" << EOF
[Desktop Entry]
Name=${APP_NAME}
Comment=Transport Fever 2 mod development workbench
Exec=env WEBKIT_DISABLE_DMABUF_RENDERER=1 ${target_appimage} %U
Icon=tpf2-mod-studio
Terminal=false
Type=Application
Categories=Development;Utility;
StartupWMClass=tpf2-mod-studio
Keywords=Transport;Fever;Mod;TF2;
EOF
chmod +x "$desktop_file"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi

# Ensure ~/.local/bin is on PATH for this shell session note.
path_hint=""
case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *) path_hint="Note: add ${BIN_DIR} to your PATH to run '${WRAPPER_NAME}' from a terminal." ;;
esac

echo
echo "Installed ${APP_NAME} (${tag_name:-$TAG})"
echo "  AppImage : ${target_appimage}"
echo "  Command  : ${wrapper}"
echo "  Menu     : ${desktop_file}"
[ -n "$path_hint" ] && echo "  ${path_hint}"
echo
echo "Start with:  ${WRAPPER_NAME}"
echo "Or open \"${APP_NAME}\" from your application menu."
