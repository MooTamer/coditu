# design/ — the approved Claude Design bundle

Committed verbatim from the Claude Design handoff exports, minus the `.zip` files themselves (the
extracted trees are the same bytes; see `docs/05-DECISIONS.md`).

## Which file is the source of truth

**For the internal workspace at `/app`, that is `project/Coditu Workspace.dc.html`** — from
`Coditu design system updates 2-handoff.zip`, the newer bundle. Not `Coditu App.dc.html`.

`Coditu App.dc.html` is the August bundle and is superseded for every `/app` surface. It is kept
because the marketing site, the brand sheet and the client PDF still come from that bundle and it
carries their shared context. Where the two disagree about a workspace screen, the newer one wins.

The newer bundle is purely additive: the five original artboards, `doc-page.js` and `support.js` are
byte-identical between the two, and the four files below are the whole of what it adds.

| File | What it defines |
|---|---|
| `project/Coditu Workspace.dc.html` | **The workspace.** Every `/app` surface — shell, Home, sprint database, story peek, notes, projects, People & Access, profile, settings, earnings, payouts, history, trash, recovery, import — with the responsive, presence, save and failure states for each. |
| `project/Coditu Handoff.dc.html` | **The written contract** for the above: navigation hierarchy, component table, interaction rules, the breakpoint table, the designed states, what changed from the old app, and the product decisions it deliberately leaves open. Read this before the prototype. |
| `project/Coditu Editor.dc.html` | The universal block editor component — 12 block types, slash menu, mentions, upload states. |
| `project/Coditu Table.dc.html` | The data-table component — cell kinds, header row, empty state. |

## The August bundle

Read `README.md` for that export's own notes. The five artboards:

| File | What it defines |
|---|---|
| `project/Coditu App.dc.html` | The internal app as first designed. **Superseded for `/app` by `Coditu Workspace.dc.html`** — see above. |
| `project/Coditu Brand.dc.html` | Mark construction, the two rejected variants, lockups, OG compositions |
| `project/Coditu Site.dc.html` | The marketing site — `#top #work #services #process #use-cases #team #insights #faq #contact` |
| `project/Coditu Sprint Report.dc.html` | The client PDF — cover, "Progress at a glance", "Where each item stands", "What happens next" |
| `project/Current Site - Strukture Digital.dc.html` | The site as it exists today. **Reference only — do not port it.** |

**These are prototypes, not production code.** They use a template runtime (`<x-dc>`, `sc-for`, `sc-if`,
`{{ }}`, inline styles) that exists only in the design tool. Recreate the *visual and behavioural
output* in React/Tailwind idiomatically. Do not port inline-style soup, do not port the `DCLogic` class
shape, and never ship `support.js` or `doc-page.js`.

**Every number in these files — every px, ms, opacity, radius, gap — is the spec** and must survive the
translation.

## Where the prototype is not the authority

- **Real application data always wins.** Every figure in `Coditu Workspace.dc.html` is frozen Week 17
  demonstration content. Item counts, hours, names, dates, statuses and empty states come from the
  database, never from the prototype.
- **The Recovery Centre's numbers are the sharp case.** Its `backupCards` assert a nightly 03:00 UTC
  backup, a 42 MB last-successful run and a verified integrity check. **None of that is true** — this
  project has no point-in-time recovery and no provider-held backup at all. Take that screen's
  *structure* and none of its *values*; `docs/08-GAP-MATRIX.md` V-F1 has the detail.
- Where the prototype and the current build disagree on a **capability** the prototype simply does not
  model — client-portal boundaries, RLS, export contracts — the build wins.

Do not browser-render the prototypes to derive a value; every number is in the source. Rendering them
side by side to *verify* an implementation is a different thing and is what `docs/08-GAP-MATRIX.md`
does.
