# Database block schema (proposed)

This file is **not an implementation**. `Onefailatatime/slap-notes` is the public
release/installer repo only. The Electron + Next.js source is private (commit
`83339e9`: “This repository carries releases and the installer only. The source
is private.”). `Onefailatatime/slap-notes-src` is not visible to this agent.

Retarget the database work to the private app source. Use this document to seed
Hart’s hub from a `workspace.json` patch once a `database` block exists.

Do not treat this repo as an app. Do not add a parallel editor here.

## Persistence

Keep everything inside the existing workspace JSON:

```json
{
  "savedAt": "2026-09-20T00:00:00.000Z",
  "workspace": {
    "pages": {
      "<pageId>": {
        "id": "<pageId>",
        "title": "Page title",
        "parentId": null,
        "icon": "🎬",
        "blocks": [],
        "createdAt": "2026-09-20T00:00:00.000Z",
        "updatedAt": "2026-09-20T00:00:00.000Z"
      }
    }
  }
}
```

Old `table` blocks (`{ type: "table", rows: string[][] }`) must keep working.
A `database` block is a new type, not a replacement.

## Block shape

```ts
type DatabasePropertyType =
  | "title"
  | "select"
  | "multi_select"
  | "date"
  | "number"
  | "text"
  | "checkbox";

interface SelectOption {
  id: string;
  name: string;
  color: string; // gray | brown | orange | yellow | green | blue | purple | pink | red
}

interface DatabaseProperty {
  id: string;
  name: string;
  type: DatabasePropertyType;
  options?: SelectOption[]; // select / multi_select
}

type CellValue = string | string[] | number | boolean | null;

interface DatabaseRow {
  id: string;
  cells: Record<string, CellValue>; // keyed by property id
  pageId?: string; // linked child page for the long-form body
}

interface DatabaseView {
  id: string;
  name: string;
  type: "table" | "board";
  groupByPropertyId?: string; // board: a select property
  sortByPropertyId?: string; // table: e.g. Deadline for a calendar-ish list
}

interface DatabaseBlock {
  id: string;
  type: "database";
  title: string;
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  views: DatabaseView[];
  activeViewId: string;
}
```

Rules:

- Exactly one `title` property per database (the Name field).
- `select` / `multi_select` cells store option **ids**, not labels.
- `date` cells store ISO date strings (`YYYY-MM-DD` is enough for v1).
- `pageId` is optional. Clicking the title cell creates a child page if missing,
  then opens it. Reuse the existing page model (`parentId` = host page).
- Persist `activeViewId` on the block so Table/Board survives reload.

## Slash menu default (`/database`)

Keywords: `database`, `db`, `board`, `kanban`, `notion`.

Default schema (empty rows):

| Property | Type   | Options |
| --- | --- | --- |
| Name | title | — |
| Status | select | Idea refinement → Foundations → Scripting → Ready to film → Filming → Editing → Posted |
| Deadline | date | — |

Default views:

1. **Table** — all properties, no sort.
2. **Board** — group by Status.

## Hart seed (Personal Brand Production)

Insert as a hub page plus four child pages (or four `database` blocks on the
hub). Empty rows only. Status labels from Hart’s template; no extra brand copy.

### 1. Ideas

- Name (`title`)
- Status (`select`): Inbox / Warming / Promoted / Kill
- Notes (`text`)
- Views: Table

### 2. Production

- Name (`title`)
- Status (`select`): Idea refinement → Foundations → Scripting → Ready to film → Filming → Editing → Posted
- Type (`select`): YouTube / Instagram / Carousel
- Deadline (`date`)
- Views:
  - **Board** by Status
  - **Table** sorted by Deadline (Content Calendar)

### 3. Tasks

- Name (`title`)
- Priority (`select`): High / Medium / Low
- Duration (`text`)
- Due (`date`)
- Done (`checkbox`)
- Views: Table

### 4. R&D

- Name (`title`)
- Type (`select`): Brand spine / YouTube analysis / Inspiration
- Notes (`text`)
- Views: Table

Hub page (once the real app can render these blocks):

- Callout explaining the pipeline (placeholder copy only)
- `/index` of children
- The four databases (inline or on child pages)

## Example JSON patch fragment

```json
{
  "id": "blk_prod_db",
  "type": "database",
  "title": "Production",
  "activeViewId": "view_board",
  "properties": [
    { "id": "prop_name", "name": "Name", "type": "title" },
    {
      "id": "prop_status",
      "name": "Status",
      "type": "select",
      "options": [
        { "id": "st_refine", "name": "Idea refinement", "color": "gray" },
        { "id": "st_found", "name": "Foundations", "color": "brown" },
        { "id": "st_script", "name": "Scripting", "color": "orange" },
        { "id": "st_ready", "name": "Ready to film", "color": "yellow" },
        { "id": "st_film", "name": "Filming", "color": "blue" },
        { "id": "st_edit", "name": "Editing", "color": "purple" },
        { "id": "st_posted", "name": "Posted", "color": "green" }
      ]
    },
    {
      "id": "prop_type",
      "name": "Type",
      "type": "select",
      "options": [
        { "id": "ty_yt", "name": "YouTube", "color": "red" },
        { "id": "ty_ig", "name": "Instagram", "color": "pink" },
        { "id": "ty_car", "name": "Carousel", "color": "blue" }
      ]
    },
    { "id": "prop_deadline", "name": "Deadline", "type": "date" }
  ],
  "rows": [],
  "views": [
    {
      "id": "view_board",
      "name": "Board",
      "type": "board",
      "groupByPropertyId": "prop_status"
    },
    {
      "id": "view_cal",
      "name": "Content Calendar",
      "type": "table",
      "sortByPropertyId": "prop_deadline"
    }
  ]
}
```

After the private source ships `type: "database"`, paste fragments like this
into `~/.config/slap-notes/workspace.json` (or the hub page’s `blocks` array).

## Welcome page how-to (required)

Ship this on the **default first-open note** in the private source (the
“Welcome to Slap Notes” template), not as a one-off `workspace.json` patch.
Every fresh install and reset must see it.

Look for the seed constant or markdown the app uses today — names like
`WELCOME_PAGE`, `seedPages`, `defaultWorkspace`, `exampleNotes`, or a
`welcome.md` / welcome blocks array — and add a dedicated section there.

Keep it roughly half a screen: heading, one short teaching line, scannable
bullets. Match the existing welcome voice (friendly, command-first, no
marketing dump). Do not add Jessyka’s private brand copy.

### Ready-to-paste copy

```markdown
## Databases

A database is a living list — typed properties, a Status select, and a Board —
not a plain `/table` of text cells.

- Type `/database` (or slash menu → **Database**) to drop one in.
- Click **+ New** to add a row. Click **Status** to move it along the pipeline.
- Switch **Table ↔ Board** in the view bar. On the Board, drag a card to change Status.
- Add or rename properties from the header (Status, Deadline, Type, checkbox…).
- Click a row’s name to open its linked page when you need long-form notes.
- For a Personal Brand / Hart-style hub, start empty databases for Ideas, Production, and Tasks.
```

Suggested block mapping if the welcome page is stored as blocks:

1. `h2` — `Databases`
2. `text` — the one-line “living list vs plain table” sentence
3. `bullet` × 6 — the steps above

Place it with the other “how to use Slap Notes” sections (near `/table`,
slash menu, or blocks), not buried in example notes the user is told to delete.

## Out of scope for v1

Formulas, rollups, and relations between databases.
