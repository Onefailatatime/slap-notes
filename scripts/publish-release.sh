#!/usr/bin/env bash
# Publish a Slap Notes release.
#
#   ./publish-release.sh 0.1.2              # build + checksum + bump, no upload
#   ./publish-release.sh 0.1.2 --push       # also create the GitHub release
#
# Repacks the build tree, computes the checksum, writes it everywhere it is
# referenced, stamps the version into the app's update-checker, and (with
# --push) creates the tagged GitHub release with both assets attached.
set -euo pipefail

VERSION="${1:-}"
PUSH="${2:-}"
[ -n "$VERSION" ] || { echo "usage: $0 <version> [--push]" >&2; exit 2; }
echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "version must look like 1.2.3" >&2; exit 2; }

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"

# Where the unpacked build tree lives. It is NOT in the repo - it is ~500 MB of
# compiled output. Set SLAP_BUILD_ROOT, or let this find the usual spots.
if [ -n "${SLAP_BUILD_ROOT:-}" ]; then
  BUILD="$SLAP_BUILD_ROOT"
else
  for cand in \
      "$REPO_ROOT/build" \
      "$(dirname "$HERE")/build" \
      /run/media/"$USER"/SLAPNOTES/build \
      /media/"$USER"/SLAPNOTES/build ; do
    [ -d "$cand" ] && ls -d "$cand"/slap-notes-* >/dev/null 2>&1 && { BUILD="$cand"; break; }
  done
fi
if [ -z "${BUILD:-}" ] || [ ! -d "$BUILD" ]; then
  echo "Cannot find the build tree." >&2
  echo "Point at it explicitly:  SLAP_BUILD_ROOT=/path/to/build $0 $VERSION" >&2
  echo "(It should contain a slap-notes-<version>/ directory.)" >&2
  exit 2
fi
echo "==> build tree: $BUILD"
TREE="$BUILD/slap-notes-$VERSION"
OLDTREE="$(ls -d "$BUILD"/slap-notes-* 2>/dev/null | grep -v '\.tar\.zst$' | head -1)"
TARBALL="slap-notes-$VERSION-linux-x64.tar.zst"
PKGDIR="$REPO_ROOT/packaging"
REPO="$(grep -oP 'github\.com/\K[^/]+/[^/]+' "$PKGDIR/PKGBUILD" | head -1)"
OUT="${SLAP_RELEASE_DIR:-$BUILD}"

command -v zstd  >/dev/null || { echo "need zstd"  >&2; exit 2; }
command -v gh    >/dev/null || [ "$PUSH" != "--push" ] || { echo "need gh for --push" >&2; exit 2; }

# ---- 1. rename the build tree if the version changed -------------------------
if [ ! -d "$TREE" ]; then
  [ -n "$OLDTREE" ] || { echo "no build tree under $BUILD" >&2; exit 2; }
  echo "==> renaming $(basename "$OLDTREE") -> slap-notes-$VERSION"
  mv "$OLDTREE" "$TREE"
fi

# ---- 2. stamp the version the app reports ----------------------------------
# app.getVersion() reads package.json from inside app.asar, so this is what the
# update check compares against. Bump it or the release lies about itself.
echo "==> stamping version into app.asar"
python3 "$HERE/bump-asar-version.py" "$TREE/app/resources/app.asar" "$VERSION"

# ---- 3. re-hash the page chunk so caches can't serve stale code --------------
NEWHASH="page-$(sha256sum "$CHUNK" | cut -c1-16)"
OLDNAME="$(basename "$CHUNK" .js)"
if [ "$NEWHASH" != "$OLDNAME" ]; then
  mv "$CHUNK" "$(dirname "$CHUNK")/$NEWHASH.js"
  grep -rl "$OLDNAME" "$TREE/app/resources/app-server/.next" 2>/dev/null | while read -r f; do
    sed -i "s/$OLDNAME/$NEWHASH/g" "$f"
  done
  echo "==> chunk re-hashed: $OLDNAME -> $NEWHASH"
fi

# ---- 4. strip anything that must never ship ---------------------------------
find "$TREE" \( -name '*.bak*' -o -name '*.orig' -o -name '*.pre*' -o -name '.env*' \) -delete 2>/dev/null || true
LEAK=$(grep -rlE 'sk-ant-[A-Za-z0-9]{15}|sk-proj-[A-Za-z0-9]{15}|AIza[A-Za-z0-9_-]{30}|gsk_[A-Za-z0-9]{25}' "$TREE" 2>/dev/null | wc -l)
[ "$LEAK" = "0" ] || { echo "ABORT: $LEAK file(s) look like they contain an API key" >&2; exit 1; }
echo "==> secret scan clean"

# ---- 5. pack ----------------------------------------------------------------
echo "==> packing $TARBALL (zstd -19, takes a minute)"
( cd "$BUILD" && tar -I 'zstd -19 -T0' -cf "$TARBALL.tmp" "slap-notes-$VERSION" && mv -f "$TARBALL.tmp" "$TARBALL" )
SHA="$(cd "$BUILD" && sha256sum "$TARBALL" | cut -d' ' -f1)"
printf '%s  %s\n' "$SHA" "$TARBALL" > "$BUILD/SHA256SUMS"
cp -f "$BUILD/$TARBALL" "$BUILD/SHA256SUMS" "$OUT/" 2>/dev/null || true
echo "==> sha256: $SHA"

# ---- 6. update the PKGBUILD -------------------------------------------------
sed -i -E "s/^pkgver=.*/pkgver=$VERSION/; s/^pkgrel=.*/pkgrel=1/; s/^sha256sums=\(.*\)/sha256sums=('$SHA')/" "$PKGDIR/PKGBUILD"
echo "==> PKGBUILD: pkgver=$VERSION pkgrel=1 sha256 updated"

# ---- 7. build the pacman package --------------------------------------------
if command -v makepkg >/dev/null; then
  WORK="$(mktemp -d)"; cp "$PKGDIR/PKGBUILD" "$PKGDIR"/*.install "$WORK/" 2>/dev/null || true
  ( cd "$WORK"
    sed -i "s|::https://github.com/[^\"]*|::file://$BUILD/$TARBALL|" PKGBUILD
    makepkg -f --nodeps --noconfirm >/dev/null 2>&1 ) \
    && cp "$WORK"/*.pkg.tar.zst "$OUT/" && echo "==> pacman package built -> $OUT" \
    || echo "!!  makepkg failed — the tarball is still valid; build the package manually" >&2
  rm -rf "$WORK"
fi

# ---- 8. publish -------------------------------------------------------------
if [ "$PUSH" = "--push" ]; then
  case "$REPO" in
    OWNER/*) echo "ABORT: PKGBUILD still points at OWNER/. Set your real repo first (see SUBMISSION.md)." >&2; exit 1;;
  esac
  echo "==> creating GitHub release $VERSION on $REPO"
  gh release create "$VERSION" \
    "$BUILD/$TARBALL" "$BUILD/SHA256SUMS" \
    --repo "$REPO" --title "Slap Notes $VERSION" --generate-notes
  echo "==> published: https://github.com/$REPO/releases/tag/$VERSION"
  echo "    Users on the package get it via 'omarchy update'."
  echo "    The in-app notice appears for everyone within a launch or two."
else
  cat <<EOF

Built, not published. To publish:

  ./publish-release.sh $VERSION --push

Or by hand:
  gh release create $VERSION "$BUILD/$TARBALL" "$BUILD/SHA256SUMS" --title "Slap Notes $VERSION" --generate-notes

The tag must be exactly "$VERSION" — no leading v — or Omarchy's tracker
looks for the wrong asset filename.
EOF
fi
