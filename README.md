<div align="center">

# Slap Notes

**Your second brain — a block editor fused with a linked-note graph and a built-in AI researcher.**

Local-first. Everything stays on your machine. No account required.

[![Platform](https://img.shields.io/badge/platform-Linux%20x64-1f2937)](https://github.com/OWNER/slap-notes/releases)
[![Built for](https://img.shields.io/badge/built%20for-Omarchy-a3e635)](https://omarchy.org)
[![Licence](https://img.shields.io/badge/licence-proprietary-3f3f46)](LICENSE)

</div>

---

## What it is

Slap Notes is a Notion-style block editor married to an Obsidian-style link
graph — the **Cluster Brain** — with an AI research agent that can read that
graph and answer across it.

- **Blocks & markdown shortcuts** — headings, lists, to-dos, quotes, callouts, code, tables, images, video, dividers
- **Wiki links** — type `[[` to connect notes; every link becomes a graph edge
- **Cluster Brain** — the whole vault as a network you can walk
- **AI Research** — summarise, find connections, or draft notes. Reads **only your notes** by default, with a one-click *Expand this topic* to go wider
- **Bring your own key** — Anthropic, OpenAI, Google, Groq, or OpenRouter. Nothing is proxied; the key is stored on your device and sent straight to the local server
- **Own your data** — Markdown, HTML, JSON and PDF export; a `workspace.json` mirror on disk; full backup and restore

## Install

**Omarchy / Arch**

```bash
omarchy pkg add slap-notes-bin      # or: yay -S slap-notes-bin
```

**Tarball** — grab the latest from [Releases](https://github.com/OWNER/slap-notes/releases), verify, and run:

```bash
sha256sum -c SHA256SUMS
tar --zstd -xf slap-notes-*-linux-x64.tar.zst
./slap-notes-*/app/slap-notes
```

Runtime deps: `gtk3 nss alsa-lib libxss libnotify`.

## Repository status

This repo currently holds the **Electron shell, build configuration, QA suite
and release tooling**. The Next.js application under `app/` is not yet in
version control — the shipped 0.1.1 binaries are ahead of this tree, and
[`PORTING.md`](PORTING.md) is the authoritative record of every difference.

Practically: **`npm run build` will not work until `app/` is added.** The
released binaries are complete and working; this repo is the packaging and
tooling half, with the application half still to land.

| Path | |
|---|---|
| `electron/` | Main process and preload bridge. Fixed port 39741 keeps the loopback origin stable, so localStorage and IndexedDB survive restarts. |
| `qa/` | CDP-driven QA sweep — trusted input against a throwaway profile. Covers the editor, linking and data layers. |
| `packaging/` | PKGBUILD, install hook, Omarchy package manifest. |
| `scripts/publish-release.sh` | One-command release. |
| `PORTING.md` | Everything in the shipped binary that is not yet in this tree. |
| `package.json` | Full manifest — deps and electron-builder config, Linux targets only. |

## Development

```bash
npm install
npm run dev                    # Next dev server
npm run electron               # Electron against it
npm run typecheck && npm run lint
./qa/run.sh                    # QA sweep (quit the app first)
```

## Building & releasing

```bash
npm run app:dist:linux         # pacman + AppImage
npm run app:dist:linux:docker  # reproducible Linux build in Docker

./scripts/publish-release.sh 0.1.2 --push
```

`publish-release.sh` repacks the tree, stamps the version, re-hashes the page
chunk so no cache serves stale code, refuses to continue if anything resembling
an API key is present, writes the checksum into `SHA256SUMS` and the PKGBUILD,
builds the package, and creates the tagged GitHub release.

Tag exactly `0.1.2` — no leading `v`. Omarchy's tracker substitutes the tag
into the asset filename. Full walkthrough in [`SUBMISSION.md`](SUBMISSION.md).

> **First-time setup:** three files carry an `OWNER/slap-notes` placeholder —
> `electron/main.js`, `packaging/PKGBUILD`, and `packaging/.omarchy/package.json`.
> Replace all three or release fetches and update checks will not resolve.

## Privacy

Notes never leave your machine. Three things do reach the network, all optional
and all disclosed:

- **AI Research** — only when you use it, only to the provider whose key you supplied
- **Update check** — once per launch, to the GitHub releases API
- **Seeded example notes** — embed Wikimedia images and YouTube (via `youtube-nocookie.com`); delete them and nothing is requested

## Licence

Proprietary — see [`LICENSE`](LICENSE). Ships Electron and Chromium under their
own licences. Seeded notes embed Wikimedia Commons images under CC BY-SA with
in-app attribution.

---

<div align="center">
Built by <a href="https://x.com/jessyka_boat">@jessyka_boat</a> · Shared on Omarchy, inspired by <a href="https://x.com/dhh">@dhh</a>
</div>
