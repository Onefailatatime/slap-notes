# QA sweep

Drives a real Slap Notes window over the Chrome DevTools Protocol — trusted key
and mouse events, screenshots, and native dialogs answered automatically — so a
release can be checked in a couple of minutes instead of by hand.

```bash
./qa/run.sh                      # uses the installed app
./qa/run.sh ./out/slap-notes     # or point it at a build
```

Quit Slap Notes first. The app binds a fixed port, so a running copy would be
driven — and edited — instead of the throwaway one. The suite runs against a
temporary profile (`--user-data-dir`) and a temporary notes directory
(`SLAP_NOTES_DIR`), so your real vault is never touched.

## What it covers

| File | Checks |
|------|--------|
| `editor.js` | markdown shortcuts (`#`, `-`, `1.`, `[]`, `>`, ` ``` `, `---`), every slash-menu block, inline styles, KaTeX math, code highlighting |
| `linking.js` | `[[` autocomplete and note creation, backlinks, tags, ⌘K search, templates, daily note, outline, undo/redo, find & replace, focus mode, the graph |
| `data.js` | images (block, render, IndexedDB, export), trash and restore, all three exports, the `workspace.json` mirror, persistence, backup → wipe → restore, print CSS, the in-bar menus and the shell bridge |

Not covered: the AI agent (needs an API key), drag-to-reorder blocks (pointer
drags are unreliable to synthesise), and Rename / Duplicate / Add sub-page.

## Reading a failure

Exit code is `0` when everything passes, `1` when a check fails, `2` when the
harness could not start. Screenshots for each suite land in `qa/screenshots/`.

Before trusting a failure, check the test itself — two lessons from building
this suite:

- **Key codes.** Printable characters must not carry a virtual key code derived
  from the character, or `#` arrives as `VK_END` and `.` as `VK_DELETE`.
  `harness.js` sends them with a `0` key code for this reason.
- **Leftover state.** Focus mode and open modals survive between suites and make
  unrelated checks fail. `harness.normalView()` resets the view; call it after
  anything that changes the shell.

Blocks show raw markdown while they are being edited and render formatted once
they are not, so assertions about formatting must leave the block first.
