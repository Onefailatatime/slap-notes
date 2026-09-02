# Getting Slap Notes into the Omarchy Package Repository

Everything here is ready except one string: replace `OWNER` with your real
GitHub owner/repo in two files.

```bash
cd release-0.1.1
grep -rn OWNER omarchy-pkgs/          # shows both spots
sed -i 's|OWNER/slap-notes|yourname/slap-notes|' \
  omarchy-pkgs/pkgbuilds/slap-notes-bin/PKGBUILD \
  omarchy-pkgs/pkgbuilds/slap-notes-bin/.omarchy/package.json
```


## Shipping updates after the first release

`./publish-release.sh <version> [--push]` does the whole cycle: repacks the
build tree, stamps the version into the in-app update notice, re-hashes the
page chunk so nobody's browser cache serves stale code, refuses to continue if
anything that looks like an API key is in the tree, writes the checksum into
`SHA256SUMS` and the PKGBUILD, builds the pacman package, and with `--push`
creates the tagged GitHub release with both assets.

```bash
./publish-release.sh 0.1.2           # build only
./publish-release.sh 0.1.2 --push    # build and publish
```

Users on the package update with `omarchy update` (or `sudo pacman -Syu`).
Everyone else sees an in-app notice within a launch or two — it polls
`api.github.com/repos/<owner>/slap-notes/releases/latest` about four seconds
after start, and stays silent while the repo is still set to `OWNER/`.

**Three places need your real repo, not two** — the update checker is the third:

```bash
grep -rn OWNER omarchy-pkgs/ ../build/slap-notes-*/app/resources/app-server/.next/static/chunks/app/page-*.js
```

## Step 1 — Publish the GitHub release

Create the repo, then a release **tagged `0.1.1`** — no leading `v`.

The tag matters: Omarchy's upstream tracker substitutes the tag into the asset
filename (`slap-notes-{tag}-linux-x64.tar.zst`), so a `v0.1.1` tag would look
for `slap-notes-v0.1.1-linux-x64.tar.zst` and miss.

Upload both assets to that release:

| File | Purpose |
|------|---------|
| `slap-notes-0.1.1-linux-x64.tar.zst` | the app (99 MB) |
| `SHA256SUMS` | what `.omarchy/package.json` verifies against |

```bash
gh release create 0.1.1 \
  slap-notes-0.1.1-linux-x64.tar.zst \
  SHA256SUMS \
  --title "Slap Notes 0.1.1" \
  --notes-file RELEASE-NOTES.md
```

Sanity check that the PKGBUILD's URL resolves before you open the PR:

```bash
curl -sIL https://github.com/OWNER/slap-notes/releases/download/0.1.1/slap-notes-0.1.1-linux-x64.tar.zst | head -1
```

## Step 2 — Open the PR against omarchy-pkgs

Fork `omacom-io/omarchy-pkgs`, then copy this directory in:

```
pkgbuilds/slap-notes-bin/
├── PKGBUILD
├── slap-notes-bin.install
└── .omarchy/
    └── package.json
```

```bash
git checkout -b add-slap-notes-bin
cp -r omarchy-pkgs/pkgbuilds/slap-notes-bin path/to/omarchy-pkgs/pkgbuilds/
git add pkgbuilds/slap-notes-bin
git commit -m "Add slap-notes-bin 0.1.1"
git push -u origin add-slap-notes-bin
gh pr create --repo omacom-io/omarchy-pkgs --base main
```

Maintainers build it with `bin/repo release --package slap-notes-bin`. Packages
land in **edge** first and reach stable via `bin/repo advance` — that promotion
is theirs to run, not yours.

## What the PR does and doesn't do

- **Signing is theirs.** Omarchy signs on the repository host with their own
  GPG key. Don't sign anything yourself; don't ship a `.sig`.
- **`"source": "local"`** because this isn't synced from the AUR. If you also
  publish to the AUR later, that flips to `"aur"`.
- **`min_release_age: 24h`** quarantines brand-new releases, so a bad tag
  doesn't propagate instantly. Drop it if you'd rather ship immediately.
- **No `release_ring`** means edge-only builds by default. Ask for
  `"release_ring": "fast"` only if you want all three channels built natively
  from day one.

## Verify the PKGBUILD yourself before pushing

```bash
cd omarchy-pkgs/pkgbuilds/slap-notes-bin
makepkg -f            # downloads from GitHub, checks the sha256, builds
namcap *.pkg.tar.zst  # optional lint
```

Do this on a normal disk, not the USB stick — makepkg needs symlinks, which
exFAT/FAT can't create.

## On each future release

1. Build the new tarball, tag `X.Y.Z`, upload it plus `SHA256SUMS`.
2. Bump `pkgver` and replace `sha256sums` in the PKGBUILD (`updpkgsums` does
   this for you), reset `pkgrel=1`, and PR the change.

Omarchy's automation polls GitHub every 6 hours via the `upstream` block, so
once the package is in, new releases can be picked up without a PR.
