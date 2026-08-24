# 04 — Export spec

Reached from the topbar Export button, **disabled** when the active project has no sprint. Dialog
`max-width: 1000px`, two panes.

**Scoping, restated because it is the easiest thing to get wrong:** an export is always
`{project} → {sprint} → {selected items}`. It is never possible to emit one client's work under another
client's name. There is a test that asserts this.

---

## Left pane — Format · Include · Items

Three formats, radio-style cards. **Card copy is verbatim:**

| Format | Card copy |
|---|---|
| Markdown | *Markdown — for an AI agent.* Front-matter facts, sprint notes, then every item with criteria, discussion, activity and time entries. |
| CSV | *CSV — detailed.* One row per item, every column including criteria and time entries. Opens in Sheets or Excel. |
| PDF | *PDF — for the client.* A typeset sprint report: summary, burn-up, and each item with its acceptance criteria. |

**Include toggles** (pills): Acceptance criteria · Hours & time entries · Comments & activity ·
Assignee & reviewer.

**Item selector:** every item in the sprint with a checkbox, key, title, hours. Quick actions
**all · none · drop drafts**. The header reads `{n} of {total} items`, live. Selection persists to
`localStorage` under `coditu.export.v1` so it survives to the report route and the next session.

## Right pane — live preview

CSV and Markdown render a mono `<pre>` of the **actual output** with a line count, plus **Copy to
clipboard** and **Download .csv / .md**. PDF renders a mini cover card and a primary action that opens
the report route.

---

## CSV contract

Header:

```
key,title,status,type,grouping,assignee,reviewer,deadline,estimate_hours,hours_logged
```

then conditionally, per the Include toggles:

```
acceptance_criteria_done,acceptance_criteria_total,acceptance_criteria
comments,activity
time_entries
```

- **RFC 4180 quoting.** Wrap any cell containing `"`, `,`, or a newline; double internal quotes.
- **UTF-8 BOM** prefix so Excel opens it correctly.
- Multi-value cells join with ` | `.
- Criteria render `[x] ` / `[ ] `.
- **Filename:** `{client-slug}-sprint-{n}.csv`

## Markdown contract

Written for an AI agent, so it front-loads the facts it needs to act.

```
# {Client} — {Sprint name}

- project: {name} ({client}, {url})
- window: {start} → {end} ({n} days remaining as of {today})
- items in export: {n} of {total}
- hours: {logged} logged / {estimated} estimated
- statuses used: draft, ready, in_progress, in_peer_review, in_qa, changes_requested, done, blocked
- convention: items sharing a `grouping` integer overlap in logic/UI and are taken by one developer
- convention: a highlighted block means discuss before implementing

## Sprint notes
> {notes, with the highlight line in bold}

## Items
### {n}. {KEY} — {title}
| field | value |   ← status, type, grouping, assignee, reviewer, deadline, hours
{description}
> **Discuss before implementing:** {highlight}
**Acceptance criteria** → `- [x] …`
**Discussion** → `- {author} ({when}): {text}`
**Activity** → `- {line}`
**Time entries** → `- {date} — {n} h`
```

Every conditional section respects the Include toggles.
**Filename:** `{client-slug}-sprint-{n}.md`

## PDF contract

This is the one a client sees; it must look considered. Sections follow
`design/project/Coditu Sprint Report.dc.html`:

1. **Cover** — `Sprint report`, `Prepared for {Client} · {url}`, four stat blocks: Items in report,
   Hours logged, Of estimate, Sprint window.
2. **Progress at a glance** — status distribution + burn-up.
3. **Where each item stands** — every included item with its acceptance criteria as written, grouped
   by the fixed status order.
4. **What happens next**
5. A closing line offering a reply to `hello@coditu.com`.

- Letter, portrait, `0.7in` margins. Running header (Coditu mark + wordmark + `{Client} · Sprint {n}`)
  and footer (`hello@coditu.com` + `Page {n} of {m}`).
- **Client-facing means client-facing:** no internal comments, no activity log, no `COD-` keys, no
  reviewer names, no per-person hours.
- Status labels are humanised:
  `in_progress → "In progress"`, `in_peer_review → "In peer review"`,
  `ready → "Not started"`, `draft → "Not scoped yet"`.
- `break-inside: avoid; orphans: 3; widows: 3` on every item block. No item's heading orphans from its
  criteria.
- Satoshi and JetBrains Mono **embedded**, not substituted.

### Implementation — one source of truth

The report is React components rendered at `/app/projects/[slug]/sprints/[number]/report`, styled with
print CSS (`@page { size: letter; margin: 0.7in }`, `position: running()` header/footer or a
fixed-element equivalent).

`…/report/pdf` is a **Node-runtime** Route Handler that drives headless Chromium
(`playwright-core`; on Vercel, `puppeteer-core` + `@sparticuz/chromium-min`) over that same route with a
short-lived signed token, and streams `application/pdf` with a `Content-Disposition` filename of
`{client-slug}-sprint-{n}.pdf`.

One layout, two outputs — the screen preview can never drift from the file.

**Documented fallback:** if serverless Chromium is unacceptable in their hosting, rebuild the layout in
`@react-pdf/renderer` primitives. Whichever path is taken is recorded in `05-DECISIONS.md` with the
reason.
