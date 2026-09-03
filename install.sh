#!/usr/bin/env bash
# Install Slap Notes for the current user. No root, no password.
#
#   curl -fsSL https://raw.githubusercontent.com/Onefailatatime/slap-notes/main/install.sh | bash
#
# Installs to ~/.local/share/slap-notes, adds a launcher and a menu entry.
# Updates after this are one click inside the app.
set -euo pipefail

REPO="Onefailatatime/slap-notes"
ROOT="${SLAP_NOTES_HOME:-$HOME/.local/share/slap-notes}"
BIN="$HOME/.local/bin"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor"

for c in curl tar zstd; do
  command -v "$c" >/dev/null || { echo "Missing: $c" >&2; exit 1; }
done

echo "Finding the latest release…"
TAG="$(curl -fsSL -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$REPO/releases/latest" \
  | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"
[ -n "$TAG" ] || { echo "Could not read the release feed." >&2; exit 1; }
VER="${TAG#v}"
ASSET="slap-notes-$VER-linux-x64.tar.zst"
URL="https://github.com/$REPO/releases/download/$TAG/$ASSET"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo "Downloading Slap Notes $VER…"
curl -fL --progress-bar -o "$TMP/$ASSET" "$URL"

# Verify against the published checksums when they are available.
if curl -fsSL -o "$TMP/SHA256SUMS" "https://github.com/$REPO/releases/download/$TAG/SHA256SUMS" 2>/dev/null; then
  echo "Verifying…"
  ( cd "$TMP" && grep " $ASSET\$" SHA256SUMS | sha256sum -c - >/dev/null ) \
    || { echo "Checksum did not match. Nothing installed." >&2; exit 1; }
fi

echo "Installing to $ROOT…"
mkdir -p "$ROOT" "$BIN" "$APPS"
tar -I zstd -xf "$TMP/$ASSET" -C "$ROOT"
ln -sfn "slap-notes-$VER" "$ROOT/current"

# Stable launcher: always runs whatever "current" points at, so one-click
# updates do not leave the menu entry pointing at a version that is gone.
cat > "$BIN/slap-notes" <<LAUNCH
#!/usr/bin/env bash
exec "$ROOT/current/app/slap-notes" "\$@"
LAUNCH
chmod +x "$BIN/slap-notes"

for s in 16 32 48 64 128 256 512 1024; do
  src="$ROOT/current/../icons/$s.png"
  [ -f "$src" ] || src="$ROOT/slap-notes-$VER/icons/$s.png"
  [ -f "$src" ] && install -Dm644 "$src" "$ICONS/${s}x${s}/apps/slap-notes.png"
done

cat > "$APPS/slap-notes.desktop" <<DESK
[Desktop Entry]
Name=Slap Notes
Exec=$BIN/slap-notes %U
Terminal=false
Type=Application
Icon=slap-notes
StartupWMClass=slap-notes
Comment=Your second brain - block notes with a wiki-link graph and an AI researcher
Categories=Office;Utility;TextEditor;
Keywords=notes;pkm;markdown;graph;second brain;wiki;
StartupNotify=true
DESK

command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" 2>/dev/null || true
command -v gtk-update-icon-cache  >/dev/null && gtk-update-icon-cache -f -t "$ICONS" 2>/dev/null || true

echo
echo "Slap Notes $VER is installed."
echo "  Launch:  slap-notes        (or find it in your app menu)"
echo "  Updates: one click inside the app - no password."
case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo; echo "Note: $BIN is not on your PATH. Add it, or launch from the menu." ;;
esac
