<div align="center">

# Slap Notes

**Your second brain — a block editor fused with a linked-note graph and a built-in AI researcher.**

Local-first. Everything stays on your machine. No account required.

[![Download](https://img.shields.io/github/v/release/Onefailatatime/slap-notes?label=download&color=a3e635)](https://github.com/Onefailatatime/slap-notes/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Linux%20x64-1f2937)](https://github.com/Onefailatatime/slap-notes/releases/latest)
[![Built for](https://img.shields.io/badge/built%20for-Omarchy-a3e635)](https://omarchy.org)

</div>

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/Onefailatatime/slap-notes/main/install.sh | bash
```

No root, no password, no account. Installs to `~/.local/share/slap-notes` and adds a
menu entry. **Updates after this are one click inside the app.**

Prefer to do it by hand? Take the tarball from
[Releases](https://github.com/Onefailatatime/slap-notes/releases/latest), check it
against `SHA256SUMS`, and unpack it anywhere you like.

## What it does

- **Blocks & markdown shortcuts** — headings, lists, to-dos, quotes, callouts, code, tables, images, video, dividers
- **Wiki links** — type `[[` to connect notes; every link becomes an edge
- **Cluster Brain** — your whole vault as a graph you can walk
- **AI Research** — summarise a page, surface connections, or draft notes. Reads **only your notes** by default, with one click to look wider
- **Bring your own key** — Anthropic, OpenAI, Google, Groq or OpenRouter. Stored on your device, sent straight to the local server, never proxied
- **Own your data** — Markdown, HTML, JSON and PDF export, a `workspace.json` mirror on disk, full backup and restore

The app works fully without an API key. Only AI Research needs one.

## Privacy

Your notes never leave your machine. Three things touch the network, all optional:

- **AI Research** — only when you use it, only to the provider whose key you gave it
- **Update check** — once per launch, to the GitHub releases API
- **The example notes** — embed Wikimedia images and YouTube; delete them and nothing is requested

## Requirements

Linux x64. On a minimal install you may need:

```
alsa-lib at-spi2-core cairo gtk3 libcups libdrm libxkbcommon mesa nss pango
```

## Support

Something broken, or just want to say hello?
DM [@jessyka_boat](https://x.com/jessyka_boat) on X, or open an
[issue](https://github.com/Onefailatatime/slap-notes/issues).

## Licence

Proprietary — see [`LICENSE`](LICENSE). Source is not public.
Ships Electron and Chromium under their own licences.

---

<div align="center">
Built by <a href="https://x.com/jessyka_boat">@jessyka_boat</a> · Shared on Omarchy, inspired by <a href="https://x.com/dhh">@dhh</a>
</div>
