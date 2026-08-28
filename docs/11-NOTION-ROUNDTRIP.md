# Notion ↔ Coditu — the round trip, specified

**Status: specification only.** Nothing in this document is built. `scripts/import-notion-export.mjs`
imports one way from a Notion CSV/Markdown export; `lib/export/*` writes CSV, Markdown and PDF for a
client. **There is no export back to Notion, and hierarchy fidelity has never been asserted in either
direction.** PF-2 is the deadline-bound item because the two tools run in parallel for the first two
weeks, and a one-way import means every edit made in Coditu in that fortnight is invisible to the
half of the team still in Notion.

`tests/notion-roundtrip.test.ts` holds one fixture for this and it is **red on purpose**. See §6.

---

## 1. What a round trip means here

Four steps, and the diff is between step 1 and step 4:

```
Notion export  →  import  →  Coditu export  →  re-import  →  compare with step 1
     (a)          (b)            (c)              (d)
```

A field **survives** if `(a)` and `(d)` are equal. A field is **deliberately lossy** if they are not
and this document says why. Anything that differs and is not named below is a bug.

## 2. Field mapping, both directions

| Notion | Coditu | → | ← | Notes |
|---|---|---|---|---|
| `Name` | `work_items.title` | verbatim | verbatim | Survives. |
| page id | `work_items.notion_page_id` | stored | — | The join key. It survives renames, reorders and re-exports; the COD- key does **not** — `docs/07-FIELD-NOTES.md` records local and production disagreeing on keys for the same item. **The round trip must key on the page id and never on the title or the key.** |
| `Status` | `work_items.status` | via `STATUS` table | via the inverse table | Survives **only if the inverse is total** — see §3. |
| *(Status empty)* | `status = 'draft'` | `STATUS_WHEN_BLANK` | ✗ | **Lossy, by construction.** An empty cell and a cell reading `Draft` both arrive as `draft` and both leave as `Draft`. An intentionally-empty Status cannot be restored. |
| `Story Type` | `work_items.type` | via table | via table | Survives. |
| `Grouping` | `work_items.grouping` | integer | integer | Survives. |
| `Assignee` / `Reviewer` | `assignee_id` / `reviewer_id` | `PEOPLE[norm(name)]` | full name | Survives **only for people in `PEOPLE`**. An unknown name is currently reported as a problem and dropped; on the way back a profile with no Notion counterpart writes a name Notion has no person for. |
| `Deadline` | `work_items.deadline` | `parseDate` | ISO `date` | Survives. Calendar date, no timezone — invariant 5. |
| `Hours Worked` | `time_entries.minutes` (one row) | hours → **integer minutes** | `sum(minutes) / 60` | **Lossy in one specific way.** Notion held one total per item and no daily log. The import fabricates a single entry anchored to the deadline. Any time logged **in Coditu across several days** collapses back to one number and the dates are gone. Invariant 2 is why the store is minutes; this is why the round trip cannot be lossless. |
| row order | `work_items.order_index` | CSV row order | `order by order_index` | Survives, **for the plain CSV only**. `_all.csv` sorts columns alphabetically and loses the board's order — the importer already says so. The exporter must emit the plain shape. |
| checkbox list in the page body | `acceptance_criteria` rows | `[x]`/`[ ]` + 4-space depth | `[x] `/`[ ] ` | Body and done-state survive; **depth does not** — see §4. |
| item ↔ sub-item relation | *(nothing)* | ✗ | ✗ | **Not representable.** See §5. |
| page body prose | `work_items.description` | block document | Markdown | Survives as far as the block walker's vocabulary goes; a Notion block type Coditu has no node for is dropped at import and cannot come back. |
| attachments | a comment carrying an image | file → Storage + comment | ✗ | **Lossy and one-way.** `docs/07-FIELD-NOTES.md`: imported pictures are comments, because `public.attachments` renders nowhere. Going back, a comment with an image is a comment, not an attachment. |
| comments | `comments` | ✗ | ✗ | Not imported at all today. |

## 3. Status, and why the inverse must be written down

`STATUS` maps many Notion strings onto one Coditu enum value — the vocabulary was renamed once
already (`docs/07-FIELD-NOTES.md`, the `in_qa` rename), and the importer accepts both spellings. A
many-to-one map has no inverse, so the export direction must **choose** one Notion string per enum
value and state it. Otherwise the second import lands somewhere the first did not, and the diff at
step 4 moves rows that nobody touched.

The pair must satisfy, for every enum value `s`: `toNotion(s)` is defined, and
`STATUS[norm(toNotion(s))] === s`. That is a property test, not a table review.

## 4. Criterion depth is the sharpest edge

The importer flattens nesting into the body text:

```js
const body = c.depth > 0 ? `${"— ".repeat(c.depth)}${c.body}` : c.body;
```

So a sub-criterion is stored as `— Its words`. This is **not reversible**: a criterion a person
legitimately wrote as `— see the ticket` becomes depth 1 on the way back, and one that was depth 1
becomes depth 2 on the second round trip. **The marker accumulates.** A round trip run twice is not
the same as run once, which is the property §6's fixture exists to catch.

Fixing it means a real `depth` column on `acceptance_criteria`. That is a data-model change and
`CLAUDE.md` says to ask first.

## 5. Parent/child nesting is not representable, and that is invariant 1

Notion's database has sub-items: a row may be the child of another row. Coditu has **no item→item
relation at all**. Invariant 1 is that a work item belongs to a sprint, a sprint to a project, a
project to a client — the hierarchy is fixed and an item is a leaf.

So the round trip has exactly three honest options, and this document does not pick one because
`CLAUDE.md` says the data model is Mohamed's call:

1. **Flatten and lose it.** Sub-items become ordinary items, ordered after their parent. The second
   export cannot restore the relation; Notion's board changes shape. Cheapest, and visibly wrong to
   anybody looking at Notion.
2. **Carry it opaquely.** Store the parent's Notion page id on the child in a column that nothing in
   the app reads or renders, purely so the export can put it back. Round-trips correctly; adds a
   column that exists for a foreign tool, which is the kind of thing that is still there in a year.
3. **Grouping as the stand-in.** `grouping` already tints related rows together. It is an integer per
   sprint, not a parent id, so it cannot express *which* item is the parent, only that some belong
   together. Lossy, and free.

**Nothing is built until this is answered.** A round trip that silently flattens is worse than no
round trip, because the flattening is only visible in Notion, a fortnight later.

## 6. The fixture, and why it is red

`tests/notion-roundtrip.test.ts` builds a Notion-shaped export covering exactly the cases above —
a nested criterion, a sub-item, an empty Status, time logged across two days — runs it through the
round trip, and diffs. **It fails, and that is the correct state of this file today.** It is one test
and it names in its failure message which fields drifted, so it is the checklist for building this
rather than a decoration.

`npm run test` therefore reports **one failure by design**. Turning it green is PF-2's definition of
done, and it cannot go green until §5 is answered.
