# Porting the 0.1.1 binary patches back into source

Everything below was applied directly to the **built** bundles on the release
drive, because the source tree was not available. None of it exists in the
repo. A fresh `next build` produces a binary **without** any of it.

This document is the full inventory so the port is mechanical.

Paths are the ones the build output records, so they should match the repo:
`app/api/ai/route.ts`, `app/page.tsx` (or wherever the client components live).

---

## 1 · Multi-provider AI keys — `app/api/ai/route.ts`

**Was:** `new Anthropic({ apiKey })` + `client.messages.create(...)`, Anthropic only.

**Now:** the provider is detected from the key prefix and called over `fetch`,
so no extra SDK is bundled. Returns an Anthropic-shaped object so the existing
`.content.map(...)` response handling is untouched.

| Prefix | Provider | Default model |
|---|---|---|
| `sk-ant-` | Anthropic | `claude-opus-5` |
| `sk-or-` | OpenRouter | `anthropic/claude-opus-5` |
| `sk-` | OpenAI | `gpt-4o` |
| `AIza` | Google | `gemini-1.5-pro` |
| `gsk_` | Groq | `llama-3.3-70b-versatile` |

Order matters: test `sk-ant-` and `sk-or-` **before** the bare `sk-` case.

Also included:
- `anthropic-workspace-id` header when `body.workspaceId` (or
  `ANTHROPIC_WORKSPACE_ID`) is set — required for keys not scoped to one
  workspace, else the API 400s.
- `OpenAI-Organization` header from the same field for OpenAI keys.
- Retry with `max_completion_tokens` when an OpenAI-compatible endpoint
  rejects `max_tokens`.
- A plain-English error for the workspace 400 instead of the raw API message.
- Model override via `SLAP_NOTES_MODEL` or `body.model`.

> Non-Anthropic default model IDs were chosen to be stable and widely
> available, not necessarily newest. Re-check them when porting.

## 2 · Notes-only AI, with an opt-in to go wider — `route.ts` + AI panel

Two system prompts, selected by `body.outside`:

- **default (`outside` falsy)** — answer using ONLY the user's notes; if the
  notes don't cover it, say so in one line and stop, and point at the button.
  The old prompt did the opposite ("then answer from general knowledge").
- **expanded (`outside` true)** — use general knowledge freely, put outside
  material under a `## Beyond your notes` heading, end with 1–3 suggested
  `[[wiki links]]`.

Both prompts share style rules: ~7th grade reading level, ~150 words, no
preamble, markdown bullets/headings only.

Client side: the request body gains `outside: boolean`, and an **"Expand this
topic"** button renders after a result, re-running the *same* mode with
`outside: true`.

## 3 · Settings — API key section

- Copy now says any provider works and that Claude Opus 5 gives the best results.
- Placeholder: `sk-ant-…  ·  sk-…  ·  AIza…`
- **New optional field: Workspace / Organization ID**, persisted to
  `slap-notes:settings` as `workspaceId`, sent on every `/api/ai` request.
- A dashed "Connect with OpenRouter — Beta · coming soon" placeholder line.
  Nothing is wired to it; OpenRouter works today via a `sk-or-` key.
  If you build it, OpenRouter's OAuth PKCE flow supports localhost callbacks
  and hands the app a user-owned API key.

## 4 · Media blocks render from URLs — block renderer

`image` / `video` blocks previously loaded only from a local `mediaId`.
They now also accept a `src`:

- a YouTube URL renders a 16:9 `<iframe>` on `youtube-nocookie.com`
  (lazy, `allowFullScreen`, `referrerPolicy="strict-origin-when-cross-origin"`)
- any other `http(s)`/`data:`/`blob:` URL renders directly as `<img>`/`<video>`
- `mediaId` still wins when present, so existing notes are unaffected

The block component now receives `src: block.src || block.text`.

**Authoring UI was not built** — there is no way for a user to paste a YouTube
URL into a block yet. Only seeded notes use this. That's the obvious follow-up.

## 5 · Seeded notes

Four notes, all at or below a 7th-grade Flesch–Kincaid grade:

| id | Title | Notes |
|---|---|---|
| `writing` | Write Better Notes | 2 images + 1 video |
| `decisions` | Make Better Decisions and Know When to Pivot | 1 video |
| `grit` | Stay Motivated When You Keep Failing | 1 video |
| `omarchy` | Omarchy | rewritten as a manual from omarchy.org/manual |

Every external URL was verified live (YouTube via oEmbed, articles by status).
Images are Wikimedia Commons, CC BY-SA, attributed in-caption — re-check the
licence if you swap them.

### Required guard — this one caused a crash

Every block **must** have a string `text`. The backlinks panel does
`block.text.toLowerCase()` across all blocks, so a `divider` or media block
without `text` throws and takes down the whole page. Fixed in the seed factory:

```ts
blocks: blocks.map(b => ({ id: newId(), text: "", ...b }))
```

Keep that default in source. Better still, make `text` non-optional on the
block type so the compiler catches it.

## 6 · Update notice — already existed, now runs on launch

**This one is already in source.** `electron/main.js` shipped with a complete
`checkForUpdates()` — it polls `api.github.com/repos/<REPO>/releases/latest`,
uses `app.getVersion()`, handles timeouts and non-200s, and was wired to
**Help → Check for Updates…**. It was only ever manual.

The single change: `createWindow()` now runs it once, eight seconds after
`did-finish-load`, and surfaces the existing UI only when there is genuinely a
newer release. Nothing needs version-stamping.

`const REPO = "OWNER/slap-notes"` at `electron/main.js:105` is one of **three**
places the placeholder must be replaced, alongside the PKGBUILD and the Omarchy
package manifest. It is the one that is easy to miss, because it lives inside
`app.asar` in a shipped build.

## 7 · Build hygiene — mostly disappears in source

The release drive patched `page-<hash>.js` in place while Next serves it
`immutable, max-age=31536000`, so upgrading users kept executing stale code
until the filename changed. `publish-release.sh` re-hashes the chunk and
rewrites all 8 references.

**A real `next build` hashes chunks from content automatically, so this whole
step goes away once the source is back.**

## 8 · Not done

- OpenRouter OAuth (placeholder only)
- Web search for "Expand this topic" — it uses model knowledge, not live
  sources. Real search is an Anthropic-only server tool and needs different
  response handling.
- Authoring UI for URL-backed media
- QA suite has not been run against any of these changes
