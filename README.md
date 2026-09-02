# Slap Notes

Local-first block notes with a wiki-link graph (the Cluster Brain) and a
built-in AI research agent. Next.js in an Electron shell, packaged for Arch /
Omarchy.

> **State of this repo:** partial. The Electron shell, the build config, the QA
> suite and the packaging pipeline are here and real. **The Next.js app itself
> is not** — see *What's missing* below before you try to build.

## What's here

| Path | What it is |
|---|---|
| `electron/main.js` | The Electron main process. 414 lines, original comments intact. Fixed port 39741 so the loopback origin — and therefore localStorage and IndexedDB — stays stable across launches. |
| `electron/preload.js` | Preload bridge. |
| `package.json` | The real project manifest: 19 deps, 13 dev deps, electron-builder config. Linux only — the macOS target has been removed. |
| `qa/` | CDP-driven QA sweep. Drives a real window with trusted input, against a throwaway profile. Covers the editor, linking, and data layers. |
| `packaging/` | `PKGBUILD`, install hook, and the Omarchy package manifest. |
| `scripts/publish-release.sh` | One-command release: repack, stamp version, re-hash chunks, secret-scan, checksum, build the package, and publish the GitHub release. |
| `PORTING.md` | **Read this.** Every change made to the shipped 0.1.1 binaries that is not represented in this repo. |

## What's missing

Everything under `app/` — the editor, block model, Cluster Brain graph, AI
panel, settings, and the `/api/ai` and `/api/notes` routes. Also
`scripts/prepare-standalone.mjs` and `scripts/build-linux-docker.sh`, both
referenced by `package.json`.

Those exist only as compiled output inside the shipped bundles. They were
recovered from a packaged build, and Next.js standalone output keeps
`package.json`, `node_modules`, `server.js` and `.next/` — but no source.

**`npm run build` will not work until `app/` is restored.**

## Restoring it

1. **Find the original tree.** The shipped bundles record their build path as
   `/build/slap-notes` — that's the path *inside the Docker container* used by
   `app:dist:linux:docker`, mounted from a real checkout. Look on whichever
   machine runs that script.
2. **Drop it in.** This repo is laid out to match, so a recovered `app/`
   should slot straight in.
3. **Re-apply `PORTING.md`.** The shipped 0.1.1 binary is ahead of any source
   you find — multi-provider AI keys, notes-only research with an opt-in
   expand, URL-backed images and YouTube embeds, four seeded notes, and the
   update checker all live only in the binary.

If the tree is genuinely gone, `PORTING.md` plus this shell is the honest
starting point for a rebuild, and the shipped bundles remain a working
reference for behaviour.

## Building (once `app/` is back)

```bash
npm install
npm run dev                    # Next dev server
npm run electron               # Electron against it
npm run app:dist:linux         # pacman + AppImage
npm run app:dist:linux:docker  # reproducible Linux build in Docker
```

## Releasing

```bash
./scripts/publish-release.sh 0.1.2           # build only
./scripts/publish-release.sh 0.1.2 --push    # build and publish
```

Tag exactly `0.1.2`, no leading `v` — Omarchy's tracker substitutes the tag
into the asset filename. See `SUBMISSION.md`.

Three files still contain the `OWNER/slap-notes` placeholder and need the real
repo: `electron/main.js`, `packaging/PKGBUILD`, and `packaging/.omarchy/package.json`.

## Licence

Proprietary — see `LICENSE`. Ships Electron and Chromium under their own
licences; seeded notes embed Wikimedia images under CC BY-SA with in-app
attribution.
