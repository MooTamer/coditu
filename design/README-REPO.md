# design/ — the approved Claude Design bundle

Committed verbatim from the Claude Design handoff export of project
`98bbd011-5858-4cee-af83-4360f7c83cb6`, minus the handoff `.zip` itself (the extracted tree is the same
bytes; see `docs/05-DECISIONS.md`).

Read `README.md` for the export's own notes. The five artboards:

| File | What it defines |
|---|---|
| `project/Coditu App.dc.html` | The internal app — rail, topbar, project switcher, sprint header, table, board, item detail, export dialog, command palette, Projects / My work / People / Import views |
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

Do not screenshot or browser-render the prototypes. Everything needed is in the source.
