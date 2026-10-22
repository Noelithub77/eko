#!/bin/sh
# Install the latest eko AppImage for Linux x86_64, then open it.
# Usage: curl -fsSL https://raw.githubusercontent.com/Noelithub77/eko/main/install.sh | sh
set -eu

repo="https://github.com/Noelithub77/eko"
manifest="$repo/releases/latest/download/latest.json"
app_dir="$HOME/Applications"
target="$app_dir/eko.AppImage"
desktop_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
launcher="$desktop_dir/eko.desktop"
marker="X-Eko-Installer=curl"

fail() {
  echo "eko install: $*" >&2
  exit 1
}

[ "$(uname -s)" = Linux ] || fail "this installer is for Linux. Use the Windows or macOS download instead."
[ "$(uname -m)" = x86_64 ] || fail "the AppImage is built for x86_64 only."
command -v curl >/dev/null 2>&1 || fail "curl is required."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

curl -fsSL "$manifest" -o "$tmp/latest.json" || fail "could not read the latest release."
url=$(grep -o 'https://[^"]*\.AppImage' "$tmp/latest.json" | head -n 1)
case "$url" in
  "$repo/releases/download/"*) ;;
  *) fail "the release manifest points to an unexpected URL." ;;
esac

echo "Downloading ${url##*/}"
curl -fL --progress-bar "$url" -o "$tmp/eko.AppImage"
chmod +x "$tmp/eko.AppImage"
mkdir -p "$app_dir" "$desktop_dir"
mv -f "$tmp/eko.AppImage" "$target"
echo "Installed $target"

# Leave a launcher the user wrote by hand (for example a dev install) untouched.
if [ ! -e "$launcher" ] || grep -qx "$marker" "$launcher"; then
  printf '%s\n' \
    "[Desktop Entry]" \
    "Type=Application" \
    "Name=eko" \
    "Comment=Share computer audio with approved devices" \
    "Exec=\"$target\"" \
    "Terminal=false" \
    "Categories=AudioVideo;" \
    "StartupWMClass=eko" \
    "$marker" > "$launcher"
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$desktop_dir" >/dev/null 2>&1 || true
  fi
fi

nohup "$target" </dev/null >/dev/null 2>&1 &
echo "Opened eko"
